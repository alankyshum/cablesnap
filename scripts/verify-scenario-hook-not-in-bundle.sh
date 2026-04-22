#!/usr/bin/env bash
# Bundle-gate: verify the scenario seed hook does NOT leak into production.
#
# Runs `npx expo export --platform web` and greps the exported bundle for the
# `__TEST_SCENARIO__` string. Exits non-zero if the string is found, which
# means Metro failed to dead-code-eliminate the test-seed module and the
# production bundle contains dev-only scenario code.
#
# Intended usage:
#   - Run locally before pushing changes that touch lib/db/, hooks/, or e2e/.
#   - CI gate on PRs touching the same paths (see .github/workflows/).
#
# Refs: BLD-494, TL#3.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUT_DIR="${OUT_DIR:-dist-bundle-gate}"
NEEDLE="__TEST_SCENARIO__"

echo "[bundle-gate] exporting web bundle to $OUT_DIR/ ..."
rm -rf "$OUT_DIR"
# --output-dir places the exported static site here; --platform web is what CI ships.
npx --yes expo export --platform web --output-dir "$OUT_DIR" >/dev/null

echo "[bundle-gate] grepping $OUT_DIR/ for '$NEEDLE' ..."
# -R recursive, -l list-matching-files, --binary-files=without-match to skip
# images/fonts that grep would otherwise complain about.
if grep -R --binary-files=without-match -l "$NEEDLE" "$OUT_DIR"/ 2>/dev/null; then
  echo "[bundle-gate] FAIL: '$NEEDLE' leaked into the production web bundle." >&2
  echo "[bundle-gate] Ensure the seed hook is only imported behind 'if (__DEV__)'" >&2
  echo "[bundle-gate] so Metro can strip the dynamic import + string literal." >&2
  exit 1
fi

echo "[bundle-gate] OK: '$NEEDLE' not present in $OUT_DIR/."
rm -rf "$OUT_DIR"
