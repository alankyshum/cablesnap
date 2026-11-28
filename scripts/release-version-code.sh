#!/usr/bin/env bash
# BLD-5101 — single source of truth for release version-code validation.
# F-Droid applies VercodeOperation (1000 * %c + 1..4) to the base Android
# versionCode. The metadata CurrentVersionCode must therefore remain the same
# base code as app.config.ts, never one of the ABI-expanded values.

set -euo pipefail

usage() {
    echo "usage: $0 <current|next|validate> [VERSION_CODE]" >&2
    exit 1
}

ACTION="${1:-}"
case "$ACTION" in
    current|next|validate) ;;
    *) usage ;;
esac

ROOT="${RELEASE_VERSION_CODE_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
MAX_ANDROID_VERSION_CODE=2100000000
MAX_ABI_SUFFIX=4
MAX_BASE_VERSION_CODE=$(((MAX_ANDROID_VERSION_CODE - MAX_ABI_SUFFIX) / 1000))

die() {
    echo "::error::$*" >&2
    exit 1
}

validate_code() {
    local code="$1"
    if ! printf '%s' "$code" | grep -Eq '^[1-9][0-9]*$'; then
        die "version code must be a positive integer, got: $code"
    fi
    if [ "${#code}" -gt "${#MAX_BASE_VERSION_CODE}" ] ||
        { [ "${#code}" -eq "${#MAX_BASE_VERSION_CODE}" ] && [ "$code" -gt "$MAX_BASE_VERSION_CODE" ]; }; then
        die "base versionCode $code overflows F-Droid VercodeOperation: 1000*$code+$MAX_ABI_SUFFIX > $MAX_ANDROID_VERSION_CODE"
    fi
}

if [ "$ACTION" = "validate" ]; then
    [ "$#" -eq 2 ] || usage
    validate_code "$2"
    exit 0
fi

[ "$#" -eq 1 ] || usage
APP_CONFIG="$ROOT/app.config.ts"
METADATA="$ROOT/fdroid/metadata/com.persoack.cablesnap.yml"
[ -f "$APP_CONFIG" ] || die "app.config.ts is missing"
[ -f "$METADATA" ] || die "F-Droid metadata is missing"

APP_CODE=$(sed -nE 's/^[[:space:]]*versionCode:[[:space:]]*([0-9]+).*/\1/p' "$APP_CONFIG" | head -1)
META_CODE=$(sed -nE 's/^CurrentVersionCode:[[:space:]]*([0-9]+).*/\1/p' "$METADATA" | head -1)
[ -n "$APP_CODE" ] || die "could not parse android.versionCode from app.config.ts"
[ -n "$META_CODE" ] || die "could not parse CurrentVersionCode from F-Droid metadata"
if [ "$APP_CODE" != "$META_CODE" ]; then
    die "version-code mismatch: app.config.ts=$APP_CODE but fdroid CurrentVersionCode=$META_CODE (CurrentVersionCode must stay the base code)"
fi
validate_code "$APP_CODE"

if [ "$ACTION" = "current" ]; then
    printf '%s\n' "$APP_CODE"
else
    NEXT=$((APP_CODE + 1))
    validate_code "$NEXT"
    printf '%s\n' "$NEXT"
fi
