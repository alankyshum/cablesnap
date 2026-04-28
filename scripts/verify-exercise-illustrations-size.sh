#!/usr/bin/env bash
# Bundle-gate: verify exercise illustration asset directory stays within budget.
#
# R2 plan (BLD-556/BLD-561): target ≤8MB, hard fail >12MB.
# Wired into pre-push hook and Bundle Gate CI workflow.
#
# Why: AI-generated webp illustrations are bundled into the APK. A batch
# regeneration at a higher quality or a missed transparent-alpha downgrade
# can silently double the bundle. This gate catches that before merge.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ASSET_DIR="assets/exercise-illustrations"
TARGET_BYTES=$((8 * 1024 * 1024))
HARD_FAIL_BYTES=$((12 * 1024 * 1024))

if [ ! -d "$ASSET_DIR" ]; then
  echo "[illustration-size] $ASSET_DIR not present — skipping"
  exit 0
fi

# Sum only .webp files so non-image artifacts (manifest, README, fingerprints)
# don't count against the bundle budget.
total_bytes=0
while IFS= read -r -d '' f; do
  size=$(wc -c <"$f")
  total_bytes=$((total_bytes + size))
done < <(find "$ASSET_DIR" -type f -name '*.webp' -print0)

human() {
  awk -v b="$1" 'BEGIN { printf "%.2f MB", b / (1024*1024) }'
}

echo "[illustration-size] $ASSET_DIR/**/*.webp total: $(human "$total_bytes") (target ≤ $(human "$TARGET_BYTES"), hard fail > $(human "$HARD_FAIL_BYTES"))"

if [ "$total_bytes" -gt "$HARD_FAIL_BYTES" ]; then
  echo "[illustration-size] FAIL: exercise illustrations exceed hard-fail budget." >&2
  echo "[illustration-size] Reduce webp quality, drop coverage, or re-encode at 384×384 Q75." >&2
  exit 1
fi

if [ "$total_bytes" -gt "$TARGET_BYTES" ]; then
  echo "[illustration-size] WARN: over target budget but under hard fail — review before merging." >&2
fi

exit 0
