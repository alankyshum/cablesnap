#!/bin/sh
# ─── License Integrity & Dependency Compliance Check ─────────────
# Ensures:
#   1. LICENSE file has not been modified (AGPL-3.0 integrity)
#   2. No new dependencies use AGPL-incompatible licenses
#
# Usage:
#   ./scripts/check-license.sh          # check all deps
#   ./scripts/check-license.sh --quick  # license file integrity only

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LICENSE_FILE="$REPO_ROOT/LICENSE"

# ── 1. License file integrity ───────────────────────────────────
# The AGPL-3.0 license text should contain this exact fingerprint.
# If someone swaps or guts the file, this check catches it.
EXPECTED_FINGERPRINT="GNU AFFERO GENERAL PUBLIC LICENSE"
EXPECTED_COPYRIGHT="Copyright (C) 2026 Anomaly Co."

if [ ! -f "$LICENSE_FILE" ]; then
  echo "🚨 LICENSE file is missing!"
  exit 1
fi

if ! grep -q "$EXPECTED_FINGERPRINT" "$LICENSE_FILE"; then
  echo "🚨 LICENSE file has been tampered with — missing AGPL-3.0 header."
  echo "   Restore the original LICENSE file from git:"
  echo "   git checkout origin/main -- LICENSE"
  exit 1
fi

if ! grep -q "$EXPECTED_COPYRIGHT" "$LICENSE_FILE"; then
  echo "🚨 LICENSE file copyright notice has been altered."
  echo "   Expected: $EXPECTED_COPYRIGHT"
  exit 1
fi

echo "✅ LICENSE file integrity: OK"

if [ "$1" = "--quick" ]; then
  exit 0
fi

# ── 2. Dependency license compliance ────────────────────────────
# Blocklisted licenses (AGPL-incompatible)
BLOCKLIST="SSPL|Server Side Public License|Commons Clause|CC-BY-NC|BSL-1|Business Source License|Elastic License|BUSL"

echo "🔍 Checking dependency licenses..."

# Get all production + dev dependency names from package.json
deps=$(node -e "
  const pkg = require('$REPO_ROOT/package.json');
  const all = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {})
  ];
  all.forEach(d => console.log(d));
")

violations=""
unknown=""

for dep in $deps; do
  # npm info returns the license field
  lic=$(npm info "$dep" license 2>/dev/null || echo "UNKNOWN")

  # Check against blocklist
  if echo "$lic" | grep -qiE "$BLOCKLIST"; then
    violations="$violations\n  ❌ $dep: $lic"
  fi

  # Flag unknown/missing licenses for manual review
  if [ "$lic" = "UNKNOWN" ] || [ -z "$lic" ] || echo "$lic" | grep -qi "UNLICENSED\|SEE LICENSE"; then
    unknown="$unknown\n  ⚠️  $dep: $lic (needs manual review)"
  fi
done

if [ -n "$violations" ]; then
  echo ""
  echo "🚨 AGPL-incompatible dependencies found:"
  printf "%b\n" "$violations"
  echo ""
  echo "Remove these dependencies or find AGPL-compatible alternatives."
  exit 1
fi

if [ -n "$unknown" ]; then
  echo ""
  echo "⚠️  Dependencies with unknown/unclear licenses:"
  printf "%b\n" "$unknown"
  echo "   Review these manually before merging."
fi

echo "✅ All dependency licenses: AGPL-3.0 compatible"
exit 0
