#!/usr/bin/env bash
# Stub `git` for BLD-950 audit-bundle.sh tests.
case "$1 ${2:-} ${3:-}" in
  "rev-parse --short HEAD") echo "deadbee" ;;
  *) : ;;
esac
exit 0
