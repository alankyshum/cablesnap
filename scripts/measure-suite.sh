#!/usr/bin/env bash
# measure-suite.sh — canonical wrapper for per-suite Jest runtime measurement.
# Forces NODE_ENV=test so React 19's `act` hook is not elided by the production build.
# See docs/QA-BUDGET.md (Runtime measurement section) for full rationale.
set -euo pipefail

NODE_ENV=test exec npx jest --json "$@"
