#!/usr/bin/env bash
set -euo pipefail
# Launch a scrcpy mirror so the user can interact with the headless emulator (e.g. OAuth login).
REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
source "$REPO_ROOT/.android-env.sh"
brew list scrcpy >/dev/null 2>&1 || brew install scrcpy
if pgrep -f 'scrcpy' >/dev/null; then echo "scrcpy already running"; exit 0; fi
nohup scrcpy --window-title="CableSnap Emulator" --stay-awake >/tmp/scrcpy.log 2>&1 &
sleep 4
if pgrep -fl scrcpy; then echo "MIRROR UP — user can interact"; else echo "scrcpy failed:"; tail /tmp/scrcpy.log; exit 1; fi
