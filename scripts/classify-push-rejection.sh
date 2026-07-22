#!/usr/bin/env bash
# BLD-3505 — Classify git push failures for scheduled release.
#
# Reads a file containing git push stderr and determines if the push
# was rejected due to structural branch protection (GH006) or a
# concurrent race.
#
# Exit codes:
#   0  Concurrent race (should retry)
#   1  Branch-protection/structural failure (should abort and fail fast)
#   2  Usage error / invalid inputs

set -euo pipefail

usage() {
    echo "usage: $0 <stderr-file>" >&2
    exit 2
}

if [ "$#" -ne 1 ]; then
    usage
fi

STDERR_FILE="$1"

if [ ! -f "$STDERR_FILE" ]; then
    echo "::error::Stderr file '$STDERR_FILE' does not exist." >&2
    exit 2
fi

# Search for branch-protection or GH006 indicators in stderr.
# Patterns to match: GH006, protected branch hook declined, required status checks
# We use case-insensitive match (-i) to be robust.
if grep -q -i -E "GH006|protected branch hook declined|required status checks" "$STDERR_FILE"; then
    echo "::error title=Protected branch push rejected::GitHub branch protection on main rejected the release-bot direct push. To fix this, add the release-bot identity to the branch-protection bypass allowlist, or disable required-status-checks-on-direct-push for main." >&2
    exit 1
fi

# Otherwise, assume it's a concurrent race.
exit 0
