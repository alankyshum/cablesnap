#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK="$ROOT/.fdroid-preflight/work"
SERVER="$ROOT/.fdroid-preflight/fdroidserver"
CACHE="$ROOT/.fdroid-preflight/gradle-cache"
IMAGE="registry.gitlab.com/fdroid/fdroidserver:buildserver"
START=$SECONDS
stage() { printf '[timing] %-24s %ss\n' "$1" "$((SECONDS - START))"; START=$SECONDS; }

if docker info >/dev/null 2>&1; then
  CONTAINER=docker
elif podman info >/dev/null 2>&1; then
  CONTAINER=podman
  echo "Docker daemon unavailable; using the compatible running Podman machine."
else
  echo "Neither Docker nor Podman has a running daemon/machine." >&2
  exit 1
fi

rm -rf "$WORK"
git clone --depth=1 https://gitlab.com/fdroid/fdroiddata.git "$WORK"
stage "fdroiddata checkout"
rm -rf "$SERVER"
git clone --depth=1 --branch 2.4.5 https://gitlab.com/fdroid/fdroidserver.git "$SERVER"
stage "fdroidserver checkout"
cp "$ROOT/fdroid/metadata/com.persoack.cablesnap.yml" "$WORK/metadata/"
mkdir -p "$WORK"/{build,logs,repo,tmp,unsigned} "$CACHE"
stage "workspace setup"
"$CONTAINER" run --rm --platform linux/amd64 \
  -v "$WORK:/repo" -v "$SERVER:/opt/fdroidserver" -v "$CACHE:/root/.gradle" -w /repo "$IMAGE" \
  bash -lc 'source /etc/profile.d/bsenv.sh; export PATH=/opt/fdroidserver:$PATH PYTHONPATH=/opt/fdroidserver:/opt/fdroidserver/examples GRADLE_OPTS="-Dorg.gradle.workers.max=2 -Dorg.gradle.parallel=false"; fdroid build --verbose --on-server --no-tarball com.persoack.cablesnap'
stage "fdroid recipe build"
