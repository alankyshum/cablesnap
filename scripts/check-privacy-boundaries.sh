#!/usr/bin/env bash
# scripts/check-privacy-boundaries.sh
#
# AC12 / AC17 build-time privacy gate for BLD-1092 Form Check Videos.
#
# Fails with exit 1 if any of the following invariants are violated:
#
# (A) app/_layout.tsx must contain:
#       - replaysSessionSampleRate: 0
#       - maskAllImages: true
#       - beforeErrorSampling
#
# (B) Every .tsx/.ts file that imports from lib/media/* (other than the
#     allowed entry-points) must import useMediaSurfaceMounted.
#
# (C) No file in lib/sync/**, lib/db/csv-export.ts, lib/db/import-export.ts,
#     app/api/**, workers/** may import from lib/media/*.

set -euo pipefail

FAIL=0

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ────────────────────────────────────────────────────────────────────────────
# (A) Sentry init gate in app/_layout.tsx
# ────────────────────────────────────────────────────────────────────────────
LAYOUT="$ROOT/app/_layout.tsx"

check_layout() {
  local pattern="$1"
  local label="$2"
  if ! grep -q "$pattern" "$LAYOUT"; then
    echo "FAIL [privacy-gate A]: app/_layout.tsx is missing: $label"
    echo "     Pattern: $pattern"
    FAIL=1
  fi
}

check_layout "replaysSessionSampleRate: 0" "replaysSessionSampleRate: 0"
check_layout "maskAllImages: true"          "maskAllImages: true"
check_layout "beforeErrorSampling"          "beforeErrorSampling callback"

# ────────────────────────────────────────────────────────────────────────────
# (B) Every media-surface component must call useMediaSurfaceMounted
# ────────────────────────────────────────────────────────────────────────────
# Files that import lib/media/* but are exempt from the hook requirement
# (they do not render UI surfaces):
EXEMPT_MEDIA_IMPORTERS=(
  "lib/media/backup-exclusion.ts"
  "lib/media/form-clips.ts"
  "lib/media/replay-gate.ts"
  "lib/media/README.md"
  "hooks/useMediaSurfaceMounted.ts"
  "app/_layout.tsx"
)

is_exempt() {
  local file="$1"
  for exempt in "${EXEMPT_MEDIA_IMPORTERS[@]}"; do
    if [[ "$file" == *"$exempt"* ]]; then
      return 0
    fi
  done
  return 1
}

while IFS= read -r file; do
  if is_exempt "$file"; then continue; fi
  if ! grep -q "useMediaSurfaceMounted" "$file"; then
    echo "FAIL [privacy-gate B]: $file imports from lib/media/* but does not call useMediaSurfaceMounted()"
    FAIL=1
  fi
done < <(grep -rl "from.*['\"]@?/\?lib/media/" "$ROOT/app" "$ROOT/components" "$ROOT/hooks" 2>/dev/null || true)

# ────────────────────────────────────────────────────────────────────────────
# (C) Module boundary: forbidden importers of lib/media/*
# ────────────────────────────────────────────────────────────────────────────
FORBIDDEN_DIRS=(
  "$ROOT/lib/sync"
  "$ROOT/app/api"
  "$ROOT/workers"
)
FORBIDDEN_FILES=(
  "$ROOT/lib/db/csv-export.ts"
  "$ROOT/lib/db/import-export.ts"
)

check_forbidden() {
  local path="$1"
  if [[ -e "$path" ]]; then
    if grep -rq "from.*['\"]@?/\?lib/media/" "$path" 2>/dev/null; then
      echo "FAIL [privacy-gate C]: $path must NOT import from lib/media/*"
      FAIL=1
    fi
  fi
}

for dir in "${FORBIDDEN_DIRS[@]}"; do
  check_forbidden "$dir"
done
for file in "${FORBIDDEN_FILES[@]}"; do
  check_forbidden "$file"
done

# ────────────────────────────────────────────────────────────────────────────
# Result
# ────────────────────────────────────────────────────────────────────────────
if [[ "$FAIL" -eq 0 ]]; then
  echo "✅  Privacy boundary checks passed."
else
  echo ""
  echo "❌  Privacy boundary check FAILED. See errors above."
  exit 1
fi
