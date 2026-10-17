#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK="$ROOT/.fdroid-preflight/work"
IMAGE="registry.gitlab.com/fdroid/fdroidserver:buildserver"
rm -rf "$WORK"
git clone --depth=1 https://gitlab.com/fdroid/fdroiddata.git "$WORK"
cp "$ROOT/fdroid/metadata/com.persoack.cablesnap.yml" "$WORK/metadata/"
mkdir -p "$WORK"/{build,logs,repo,tmp,unsigned}
docker run --rm --platform linux/amd64 \
  -v "$WORK:/repo" -w /repo "$IMAGE" \
  bash -lc 'source /etc/profile.d/bsenv.sh 2>/dev/null || true; fdroid build --verbose --on-server --no-tarball com.persoack.cablesnap'
