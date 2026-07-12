#!/bin/bash
# look.sh — screenshot the emulator, describe it with a local Ollama vision model,
# and print tappable UI bounds. Optional helper for describing a screen from a text-only shell.
# Usage: look.sh <label> "<optional VL question>"
#   -> writes /tmp/cs-<label>.png, prints a qwen3-vl description, then "(x,y)  'label'" tap targets.
# Requires: adb (source .android-env.sh first), Ollama running with a vision model (default qwen3-vl:8b).
set -euo pipefail
LABEL="${1:-shot}"
Q="${2:-Describe this Android screen in detail. List every visible text label, button, tab, list item and bottom nav item verbatim. Note any video thumbnail, play button, or video player.}"
MODEL="${VL_MODEL:-qwen3-vl:8b}"
OLLAMA="${OLLAMA_HOST:-http://localhost:11434}"
PNG="/tmp/cs-$LABEL.png"
JSON_FILE="/tmp/req-$LABEL.json"

adb exec-out screencap -p > "$PNG"

python3 -c '
import json, sys, base64
prompt, png_path, out_path, model = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
with open(png_path, "rb") as f:
    b64 = base64.b64encode(f.read()).decode("utf-8")
json.dump({"model": model, "prompt": prompt, "images": [b64], "stream": False}, open(out_path, "w"))
' "$Q" "$PNG" "$JSON_FILE" "$MODEL"

echo "=== VL($LABEL) via $MODEL ==="
curl -s -H "Content-Type: application/json" -X POST -d @"$JSON_FILE" "$OLLAMA/api/generate" | python3 -c '
import sys, json
try: print(json.load(sys.stdin).get("response", ""))
except Exception as e: print("Error parsing VL response:", e)
'

echo "=== UIDUMP($LABEL) — tappable text nodes (x,y center + label) ==="
adb shell uiautomator dump /sdcard/win.xml >/dev/null 2>&1 || true
adb shell cat /sdcard/win.xml 2>/dev/null | python3 -c '
import sys, re
xml = sys.stdin.read()
for m in re.finditer(r"<node[^>]*>", xml):
    t = re.search(r"text=\"([^\"]*)\"", m.group(0))
    d = re.search(r"content-desc=\"([^\"]*)\"", m.group(0))
    b = re.search(r"bounds=\"(\[[0-9,]+\]\[[0-9,]+\])\"", m.group(0))
    tx = (t.group(1) if t else "") or (d.group(1) if d else "")
    if tx.strip() and b:
        x1, y1, x2, y2 = map(int, re.findall(r"[0-9]+", b.group(1)))
        print(f"({(x1+x2)//2},{(y1+y2)//2})  {tx!r}")
'
rm -f "$JSON_FILE"
