#!/usr/bin/env bash
# CHANGELOG.md release gate (BLD-1025).
#
# The scheduled release workflow uses this to decide whether the current
# Unreleased section justifies cutting a release. Without this gate the
# 12-hour cron will keep shipping versionCode bumps every time any commit
# (including infra/CI/audit churn) lands on main, which in turn ships
# F-Droid updates with no user-facing changelog (BLD-1025).
#
# Contract:
#   - Input: $1 = path to CHANGELOG.md (default: ./CHANGELOG.md)
#   - stdout: KEY=VALUE lines (eval-friendly):
#       SHOULD_RELEASE=true|false
#       UNRELEASED_BODY_FILE=/path/to/file containing the unreleased body
#       UNRELEASED_LINE_COUNT=<int>
#   - Exit 0 always when CHANGELOG parses cleanly. Exit 1 if the file is
#     missing or malformed (no `## Unreleased` section at all).
#
# A section is considered "user-facing" if it contains at least one
# non-empty line that isn't a heading (`###` Added/Changed/etc.) and
# isn't an HTML comment marker. Empty subsection scaffolds (e.g. just
# `### Added` with no bullets) do NOT count.
#
# Why bash + awk: the workflow already uses macOS/BSD-compatible awk
# elsewhere (see publish-release skill); keeping this in plain awk means
# the same script runs on the GH runner and on a maintainer's Mac.

set -euo pipefail

CHANGELOG="${1:-CHANGELOG.md}"

if [ ! -f "$CHANGELOG" ]; then
    echo "::error::CHANGELOG.md not found at $CHANGELOG" >&2
    exit 1
fi

TMP="$(mktemp -t changelog-unreleased.XXXXXX)"

# Extract the body of the `## Unreleased` section: from the line after
# `## Unreleased` up to (but not including) the next `## ` header.
awk '
    /^## Unreleased[[:space:]]*$/ { in_section=1; found=1; next }
    in_section && /^## / { exit }
    in_section { print }
    END { if (!found) exit 2 }
' "$CHANGELOG" > "$TMP" || {
    rc=$?
    if [ "$rc" -eq 2 ]; then
        echo "::error::CHANGELOG.md has no '## Unreleased' section — release pipeline cannot decide what to ship." >&2
        exit 1
    fi
    exit $rc
}

# Strip HTML comment blocks (`<!-- ... -->`, possibly multi-line) before
# counting. Without this, scaffolds like
#   <!--
#   Drop user-facing changes here.
#   -->
# would falsely trip the gate on every cron tick.
STRIPPED="$(awk '
    BEGIN { in_comment=0 }
    {
        line=$0
        # Strip single-line comments first.
        while (match(line, /<!--[^\n]*-->/)) {
            line = substr(line, 1, RSTART-1) substr(line, RSTART+RLENGTH)
        }
        # Handle multi-line comment blocks.
        if (in_comment) {
            idx = index(line, "-->")
            if (idx == 0) next
            line = substr(line, idx+3)
            in_comment = 0
        }
        idx = index(line, "<!--")
        if (idx > 0) {
            line = substr(line, 1, idx-1)
            in_comment = 1
        }
        print line
    }
' "$TMP")"

# Count meaningful (non-blank, non-heading) lines from the comment-stripped body.
MEANINGFUL=$(printf '%s\n' "$STRIPPED" | grep -cE '^[[:space:]]*[^[:space:]#]' || true)
LINE_COUNT=$(wc -l < "$TMP" | tr -d '[:space:]')

if [ "${MEANINGFUL:-0}" -gt 0 ]; then
    SHOULD="true"
else
    SHOULD="false"
fi

echo "SHOULD_RELEASE=$SHOULD"
echo "UNRELEASED_BODY_FILE=$TMP"
echo "UNRELEASED_LINE_COUNT=$LINE_COUNT"
