#!/usr/bin/env bash
# Stub `zip` for BLD-950 audit-bundle.sh tests. Produces a non-empty file at
# the requested output path; ignores -r and the source dir argument.
out=""
for a in "$@"; do
  case "$a" in
    -*) ;;             # ignore flags
    *)  out="$a"; break ;;
  esac
done
if [[ -z "$out" ]]; then
  echo "[zip-stub] no output path" >&2
  exit 2
fi
printf 'PK\x03\x04stub-zip\n' > "$out"
exit 0
