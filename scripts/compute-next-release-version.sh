#!/usr/bin/env bash
# BLD-3223 — Skip-loop-hardened next-version computer for scheduled release.
#
# Reads the latest git tag on the current repo and computes the next patch
# version, SKIPPING any candidate version that collides with an existing
# tag or GitHub Release (including versions from prior partial releases
# whose git tag was never pushed but whose GitHub Release record — or
# immutable-release ghost — still holds the tag_name).
#
# Skip signals (any match → poisoned → increment PATCH and retry):
#   (a) local git tag exists                  (`git tag -l vX.Y.Z`)
#   (b) remote git tag exists on origin       (`git ls-remote --tags origin`)
#   (c) GitHub Release exists for that tag    (`gh api releases/tags/vX.Y.Z`)
#
# GHOST caveat (BLD-3223): GitHub's Immutable Releases feature can leave a
# permanent tag_name reservation whose /releases/tags/... endpoint 404s —
# such ghosts are NOT detectable here. Those are handled at create-time by
# the workflow's collision-aware `gh release create` wrapper, which emits
# an actionable diagnostic and fails so the operator can bump `main` past
# the poisoned version.
#
# Bounded at MAX_SKIP=100 iterations to prevent an infinite loop from a
# runaway poisoned namespace; 100 consecutive poisoned patch versions is a
# real actionable escalation, not silent wedging.
#
# Usage:
#   compute-next-release-version.sh <latest-tag> [--repo OWNER/REPO]
#
#   <latest-tag>  Latest v-prefixed tag on the repo (empty → initial 0.1.0).
#   --repo        Optional; owner/repo for the `gh api` release check.
#                 Defaults to $GITHUB_REPOSITORY (populated by Actions).
#
# Outputs (stdout):
#   The bare next version, e.g. "0.26.69" — nothing else on stdout.
#   All progress logging goes to stderr.
#
# Exit codes:
#   0  next version printed on stdout
#   1  usage error, invalid input, or skip cap exhausted
#
# Test stubs: this script calls `git tag`, `git ls-remote`, and `gh api`.
# Any of them can be shadowed by tests via PATH-first stubs (see
# scripts/__tests__/compute-next-release-version.test.ts). No global state.

set -euo pipefail

MAX_SKIP=100

usage() {
    echo "usage: $0 <latest-tag> [--repo OWNER/REPO]" >&2
    exit 1
}

if [ "$#" -lt 1 ] || [ "$#" -gt 3 ]; then
    usage
fi

LATEST_TAG="$1"
shift || true

REPO="${GITHUB_REPOSITORY:-}"
while [ "$#" -gt 0 ]; do
    case "$1" in
        --repo)
            REPO="$2"
            shift 2
            ;;
        *)
            usage
            ;;
    esac
done

# ---------------------------------------------------------------------------
# version_is_poisoned <version>
#
# Returns 0 (true) if version "$1" collides with ANY existing tag or
# GitHub Release on origin — meaning the release pipeline should skip it.
# Returns non-zero if clean.
# ---------------------------------------------------------------------------
version_is_poisoned() {
    local v="$1"
    # (a) local tag — populated by fetch-tags: true at checkout.
    if git tag -l "v$v" | grep -q .; then
        echo "  → v$v exists as a local tag" >&2
        return 0
    fi
    # (b) remote tag — definitive origin view, resilient to future
    # checkout-flag refactors.
    if git ls-remote --tags origin "refs/tags/v$v" 2>/dev/null | grep -q .; then
        echo "  → v$v exists as a remote tag on origin" >&2
        return 0
    fi
    # (c) GitHub Release — an existing release (visible via the tags
    # endpoint) MUST be skipped, otherwise `gh release create` would fail
    # with "a release with the same tag name already exists" downstream.
    # NOTE: this endpoint 404s for immutable-release GHOSTS (tag_name
    # reserved but no queryable record). Those are handled at create-time,
    # see file header.
    if [ -n "$REPO" ]; then
        # `gh api ... -i` returns HTTP headers on stdout followed by body;
        # `--silent` suppresses the body. We parse just the status line.
        # `|| true` neutralises gh's non-zero exit on 4xx so we don't
        # trigger `set -e`.
        local http_line
        http_line=$(gh api \
            "repos/${REPO}/releases/tags/v$v" \
            --silent \
            -H "Accept: application/vnd.github+json" \
            -i 2>/dev/null | head -n1 || true)
        local http_code
        http_code=$(printf '%s' "$http_line" | awk '{print $2}')
        if [ -n "$http_code" ] \
           && [ "$http_code" -ge 200 ] 2>/dev/null \
           && [ "$http_code" -lt 300 ] 2>/dev/null; then
            echo "  → v$v exists as a GitHub Release (HTTP $http_code)" >&2
            return 0
        fi
    fi
    return 1
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if [ -z "$LATEST_TAG" ]; then
    # Initial release — no tags yet on the repo.
    echo "0.1.0"
    exit 0
fi

# Strip leading "v" if present.
VERSION="${LATEST_TAG#v}"

# Basic sanity: must look like semver X.Y.Z.
if ! printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "::error::Latest tag '$LATEST_TAG' is not a valid v<semver> tag." >&2
    exit 1
fi

MAJOR=$(echo "$VERSION" | cut -d. -f1)
MINOR=$(echo "$VERSION" | cut -d. -f2)
PATCH=$(echo "$VERSION" | cut -d. -f3)
PATCH=$((PATCH + 1))
NEXT="$MAJOR.$MINOR.$PATCH"

skipped=0
while [ "$skipped" -lt "$MAX_SKIP" ] && version_is_poisoned "$NEXT"; do
    echo "Version v$NEXT is poisoned (tag or release exists), incrementing..." >&2
    PATCH=$((PATCH + 1))
    NEXT="$MAJOR.$MINOR.$PATCH"
    skipped=$((skipped + 1))
done

if [ "$skipped" -ge "$MAX_SKIP" ]; then
    echo "::error::Skip loop exhausted after $MAX_SKIP increments — cannot find a clean version. Investigate poisoned tag/release namespace on origin." >&2
    exit 1
fi

# stdout: bare version, nothing else.
echo "$NEXT"
