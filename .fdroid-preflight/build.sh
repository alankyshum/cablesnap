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
# fdroid's four ABI entries are separate fresh builds in production, so each
# retains its own sudo package setup. This local container already runs as root
# and reuses one environment for all four entries; install npm once and remove
# the repeated sudo blocks from only the disposable fdroiddata copy. This avoids
# fdroidserver's cleanup deleting its sudo shim between ABI builds.
python3 - "$WORK/metadata/com.persoack.cablesnap.yml" <<'PY'
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
recipe = path.read_text()
normalized = re.sub(r"(?m)^    sudo:\n(?:      - .*\n)+", "", recipe)
if normalized == recipe:
    raise SystemExit("expected sudo package blocks in F-Droid recipe")
path.write_text(normalized)
PY
mkdir -p "$WORK"/{build,logs,repo,tmp,unsigned} "$CACHE"
stage "workspace setup"
"$CONTAINER" run --rm --platform linux/amd64 \
  -v "$WORK:/repo" -v "$SERVER:/opt/fdroidserver" -v "$CACHE:/root/.gradle" -w /repo "$IMAGE" \
  bash -lc 'apt-get update >/dev/null && apt-get install -y npm >/dev/null; git config --global --add safe.directory /repo; source /etc/profile.d/bsenv.sh; export PATH=/opt/fdroidserver:$PATH PYTHONPATH=/opt/fdroidserver:/opt/fdroidserver/examples GRADLE_OPTS="-Dorg.gradle.workers.max=2 -Dorg.gradle.parallel=false"; fdroid build --verbose --on-server --no-tarball com.persoack.cablesnap'
stage "fdroid recipe build"
