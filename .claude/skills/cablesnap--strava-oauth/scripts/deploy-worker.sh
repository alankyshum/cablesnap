#!/usr/bin/env bash
# Deploy the strava-proxy Cloudflare Worker.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

cd "$REPO_ROOT/workers/strava-proxy"
echo "Deploying worker from $(pwd)..."
npx wrangler deploy
echo
echo "Verify with: bash $(dirname "${BASH_SOURCE[0]}")/verify-worker.sh"
