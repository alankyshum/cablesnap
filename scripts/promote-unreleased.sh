#!/usr/bin/env bash
# Promote `## Unreleased` to `## vX.Y.Z — YYYY-MM-DD <!-- versionCode: N -->`
# in CHANGELOG.md, leaving a fresh empty `## Unreleased` section above it
# (BLD-1025).
#
# Usage:
#   scripts/promote-unreleased.sh <version> <versionCode> [<changelog>]
#
# Idempotency:
#   - If the top of the file already has `## v<version>` (e.g. a previous
#     run partially completed), this script is a no-op and exits 0 with a
#     notice.
#   - If `## Unreleased` is missing or empty (no body content), exits 1
#     so the caller can fail fast — the gate (`check-changelog-gate.sh`)
#     should have caught that earlier.
#
# Output: writes back the same `CHANGELOG.md` atomically.

set -euo pipefail

VERSION="${1:-}"
VERSION_CODE="${2:-}"
CHANGELOG="${3:-CHANGELOG.md}"

if [ -z "$VERSION" ] || [ -z "$VERSION_CODE" ]; then
    echo "usage: $0 <version> <versionCode> [<changelog>]" >&2
    exit 2
fi

case "$VERSION" in
    [0-9]*.[0-9]*.[0-9]*) ;;
    *)
        echo "::error::version must be MAJOR.MINOR.PATCH (got: $VERSION)" >&2
        exit 2
        ;;
esac

case "$VERSION_CODE" in
    ''|*[!0-9]*)
        echo "::error::versionCode must be a positive integer (got: $VERSION_CODE)" >&2
        exit 2
        ;;
esac

if [ ! -f "$CHANGELOG" ]; then
    echo "::error::CHANGELOG.md not found at $CHANGELOG" >&2
    exit 1
fi

# Idempotency check: bail out cleanly if v<version> already present at top.
if grep -qE "^## v${VERSION//./\\.}([^0-9]|$)" "$CHANGELOG"; then
    echo "::notice::CHANGELOG.md already has a '## v$VERSION' section; skipping promote." >&2
    exit 0
fi

DATE="$(date -u +%Y-%m-%d)"
NEW_HEADER="## v$VERSION — $DATE"
MARKER="<!-- versionCode: $VERSION_CODE -->"

TMP="${CHANGELOG}.tmp-$$"

# State machine:
#   - When we hit `## Unreleased`, capture its body until next `## `.
#   - If body is empty (no meaningful content), error out.
#   - Replace the `## Unreleased` header line with three lines:
#       ## Unreleased\n\n## vX.Y.Z — YYYY-MM-DD\n<!-- versionCode: N -->
#     and re-emit the captured body under the v<version> header.
awk -v new_header="$NEW_HEADER" -v marker="$MARKER" '
    BEGIN { state="pre" }

    state=="pre" {
        if ($0 ~ /^## Unreleased[[:space:]]*$/) {
            print "## Unreleased"
            print ""
            print "<!--"
            print "Drop user-facing changes here. The release pipeline will only cut a new"
            print "release when this section has at least one non-empty, non-heading line."
            print "-->"
            print ""
            print new_header
            print marker
            state="capture"
            next
        }
        print
        next
    }

    state=="capture" {
        if ($0 ~ /^## /) {
            # End of unreleased body — flush header line and exit capture.
            if (body_lines == 0) {
                print "::ERROR_EMPTY_UNRELEASED::" > "/dev/stderr"
                exit 3
            }
            state="post"
            print
            next
        }
        # Track multi-line HTML comment blocks so we drop the scaffold
        # `<!-- Drop user-facing changes here ... -->` block on promote.
        if (in_comment) {
            if (index($0, "-->") > 0) in_comment = 0
            next
        }
        if ($0 ~ /^[[:space:]]*<!--/ && index($0, "-->") == 0) {
            in_comment = 1
            next
        }
        if ($0 ~ /^[[:space:]]*<!--.*-->[[:space:]]*$/) {
            next
        }
        # Suppress leading blank lines in the captured body.
        if (body_lines == 0 && $0 ~ /^[[:space:]]*$/) next
        body_lines++
        print
        next
    }

    state=="post" { print }

    END {
        if (state=="pre") {
            print "::ERROR_NO_UNRELEASED::" > "/dev/stderr"
            exit 4
        }
        if (state=="capture" && body_lines == 0) {
            print "::ERROR_EMPTY_UNRELEASED::" > "/dev/stderr"
            exit 3
        }
    }
' "$CHANGELOG" > "$TMP"

awk_rc=$?
if [ "$awk_rc" -ne 0 ]; then
    rm -f "$TMP"
    case "$awk_rc" in
        3) echo "::error::Unreleased section is empty — nothing to promote." >&2 ;;
        4) echo "::error::No '## Unreleased' header found in $CHANGELOG." >&2 ;;
        *) echo "::error::Failed to promote unreleased section (awk exit $awk_rc)." >&2 ;;
    esac
    exit "$awk_rc"
fi

mv "$TMP" "$CHANGELOG"
echo "::notice::Promoted '## Unreleased' to '$NEW_HEADER' (versionCode $VERSION_CODE)." >&2
