#!/usr/bin/env bash
set -euo pipefail
# Screenshot + extract visible text/content-desc with tap bounds (RN hierarchies are sparse).
REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
source "$REPO_ROOT/.android-env.sh"
T=$(date +%s)
adb exec-out screencap -p > "/tmp/ui-$T.png"
adb shell uiautomator dump /sdcard/w.xml >/dev/null 2>&1 || true
adb pull /sdcard/w.xml "/tmp/ui-$T.xml" >/dev/null 2>&1 || true
echo "== visible text / content-desc + bounds =="
tr '>' '\n' < "/tmp/ui-$T.xml" 2>/dev/null \
  | grep -oE 'text="[^"]+"|content-desc="[^"]+"|bounds="[^"]+"' \
  | paste - - - 2>/dev/null \
  | grep -iE 'text=|content-desc=' \
  || echo "(no text nodes — tap by screenshot coordinates)"
echo "SCREENSHOT=/tmp/ui-$T.png"
