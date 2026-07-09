#!/usr/bin/env bash
# BLD-1185 — Idempotent release-bump applier.
#
# Applies the version bump + CHANGELOG promotion + generated-artifact
# refresh that the scheduled-release workflow normally does inline. The
# logic is extracted into a script so the workflow can call it twice:
#
#   1. First time, on a clean checkout of `main`.
#   2. Again after `git reset --hard origin/main` if the initial push was
#      rejected by a concurrent merge that touched CHANGELOG.md (the bug
#      tracked in BLD-1184).
#
# Both invocations must produce byte-identical staged paths for the same
# (VERSION, VERSION_CODE) pair, regardless of what unrelated commits have
# landed on main between attempts. Concurrent `## Unreleased` bullets are
# preserved automatically because this script promotes the CURRENT top-of-
# file `## Unreleased` block whenever it runs.
#
# Usage:
#   bash scripts/release-apply-bump.sh <VERSION> <VERSION_CODE>
#
# Exit codes:
#   0  bump applied (or already applied — script is idempotent)
#   1  invalid args, or required file missing, or downstream tool failed
#
# Idempotency: if CHANGELOG.md already has `## v$VERSION` as its top
# version header, the promote step is skipped (re-running is a no-op for
# the CHANGELOG, while the file rewrites for package.json / app.config.ts
# / fdroid metadata remain idempotent because they overwrite to the same
# value).
#
# macOS/BSD-safe: no GNU-only flags, mirrors the awk style used by
# `scripts/check-changelog-parity.sh` and the publish-release SKILL.

set -euo pipefail

if [ "$#" -ne 2 ]; then
    echo "::error::usage: $0 <VERSION> <VERSION_CODE>" >&2
    exit 1
fi

VERSION="$1"
VCODE="$2"

if ! printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "::error::VERSION must look like X.Y.Z, got: $VERSION" >&2
    exit 1
fi
if ! printf '%s' "$VCODE" | grep -Eq '^[1-9][0-9]*$'; then
    echo "::error::VERSION_CODE must be a positive integer (>= 1), got: $VCODE" >&2
    exit 1
fi

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

for f in package.json app.config.ts fdroid/metadata/com.persoack.cablesnap.yml CHANGELOG.md; do
    if [ ! -f "$f" ]; then
        echo "::error::Required file missing: $f" >&2
        exit 1
    fi
done

echo "[bump] applying VERSION=$VERSION VERSION_CODE=$VCODE"

# 1. package.json -----------------------------------------------------------
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = '$VERSION';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# 2. app.config.ts ----------------------------------------------------------
if [ "$(uname)" = "Darwin" ]; then
    sed -i "" "s/version: \"[^\"]*\"/version: \"$VERSION\"/" app.config.ts
    sed -i "" "s/versionCode: [0-9]*/versionCode: $VCODE/" app.config.ts
else
    sed -i "s/version: \"[^\"]*\"/version: \"$VERSION\"/" app.config.ts
    sed -i "s/versionCode: [0-9]*/versionCode: $VCODE/" app.config.ts
fi

# 3. fdroid metadata --------------------------------------------------------
if [ "$(uname)" = "Darwin" ]; then
    sed -i "" "s/CurrentVersion: .*/CurrentVersion: $VERSION/" fdroid/metadata/com.persoack.cablesnap.yml
    sed -i "" "s/CurrentVersionCode: .*/CurrentVersionCode: $VCODE/" fdroid/metadata/com.persoack.cablesnap.yml
else
    sed -i "s/CurrentVersion: .*/CurrentVersion: $VERSION/" fdroid/metadata/com.persoack.cablesnap.yml
    sed -i "s/CurrentVersionCode: .*/CurrentVersionCode: $VCODE/" fdroid/metadata/com.persoack.cablesnap.yml
fi

# 4. CHANGELOG.md — promote `## Unreleased` to `## vVERSION — DATE` ---------
# Idempotent: if the top version section is already `## v$VERSION`, skip.
TOP_V=$(awk '/^## v[0-9]+\.[0-9]+\.[0-9]+/ { print; exit }' CHANGELOG.md || true)
EXPECTED_PREFIX="## v$VERSION"
if printf '%s' "$TOP_V" | grep -qF "$EXPECTED_PREFIX"; then
    echo "[bump] CHANGELOG.md already promoted to v$VERSION — skipping promotion"
else
    DATE=$(date -u +%Y-%m-%d)
    NEW_HEADER="## v$VERSION — $DATE"
    MARKER="<!-- versionCode: $VCODE -->"

    awk -v new_header="$NEW_HEADER" \
        -v marker="$MARKER" '
      BEGIN { promoted = 0 }
      /^##[[:space:]]+Unreleased[[:space:]]*$/ && promoted == 0 {
        print "## Unreleased"
        print ""
        print "_No user-facing changes yet._"
        print ""
        print new_header
        print marker
        promoted = 1
        next
      }
      { print }
    ' CHANGELOG.md > CHANGELOG.md.tmp
    mv CHANGELOG.md.tmp CHANGELOG.md
    echo "[bump] promoted '## Unreleased' to '$NEW_HEADER' (versionCode $VCODE)"

    TOP=$(awk '/^## v[0-9]+\.[0-9]+\.[0-9]+/ { print; exit }' CHANGELOG.md)
    if ! printf '%s' "$TOP" | grep -qF "$EXPECTED_PREFIX"; then
        echo "::error::CHANGELOG.md top version is '$TOP' after promotion, expected to start with '$EXPECTED_PREFIX'." >&2
        echo "::error::Likely cause: no '## Unreleased' header was present." >&2
        exit 1
    fi
fi

# 5. Regenerate derived artefacts ------------------------------------------
# `npm run changelog:gen` writes lib/changelog.generated.ts and the
# F-Droid per-versionCode sidecar from CHANGELOG.md. SKIP_CHANGELOG_GEN is
# only consulted by the unit-test harness (scripts/__tests__/...) — CI
# always runs the real generator.
if [ "${SKIP_CHANGELOG_GEN:-0}" = "1" ]; then
    echo "[bump] SKIP_CHANGELOG_GEN=1 — skipping npm run changelog:gen"
else
    npm run changelog:gen
fi

# 6. Sanity: F-Droid sidecar must exist and be non-empty -------------------
SIDECAR="fdroid/metadata/com.persoack.cablesnap/en-US/changelogs/${VCODE}.txt"
if [ "${SKIP_CHANGELOG_GEN:-0}" != "1" ]; then
    if [ ! -s "$SIDECAR" ]; then
        echo "::error::Expected F-Droid sidecar $SIDECAR to be written by changelog:gen but it is missing or empty." >&2
        exit 1
    fi
    echo "[bump] wrote $SIDECAR ($(wc -c < "$SIDECAR") bytes)"
fi

echo "[bump] done"
