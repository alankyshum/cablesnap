#!/usr/bin/env bash
set -euo pipefail
# Boot the emulator headless, start Metro on 8082, reverse ports, install (if needed) + launch the app.
REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
source "$REPO_ROOT/.android-env.sh"
cd "$REPO_ROOT"

# 1. Boot emulator headless if not already up
if ! adb devices | grep -q 'emulator-5554'; then
  nohup emulator -avd cablesnap -no-snapshot-save -no-boot-anim -no-audio \
    -gpu swiftshader_indirect -no-window >/tmp/emulator.log 2>&1 &
fi
adb wait-for-device
echo "waiting for boot..."
until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 3; done
adb shell input keyevent 82 || true   # dismiss keyguard
echo "BOOTED"

# 2. Start this worktree's Metro on 8082 if not already serving
metro_pid() {
  lsof -nP -iTCP:8082 -sTCP:LISTEN -t 2>/dev/null | head -n 1
}

metro_matches_repo() {
  local pid cwd
  pid="$(metro_pid)"
  [ -n "$pid" ] || return 1
  cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | awk 'NR == 2 { sub(/^n/, ""); print }')"
  [ "$cwd" = "$REPO_ROOT" ]
}

if ! metro_matches_repo; then
  if pid="$(metro_pid)"; then
    echo "stopping Metro from another worktree (pid $pid)"
    kill "$pid"
    until ! metro_pid >/dev/null; do sleep 1; done
  fi
  nohup env CABLESNAP_FDROID=1 npx expo start --dev-client --port 8082 --clear >/tmp/metro.log 2>&1 &
  echo "starting Metro on 8082..."
fi

until curl -fsS http://localhost:8082/status >/dev/null 2>&1 \
  && curl -fsS -H "Accept: application/json" -H "Expo-Platform: android" http://localhost:8082/ | node -e '
    let input = "";
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      try {
        const manifest = JSON.parse(input);
        process.exit(manifest && typeof manifest === "object" ? 0 : 1);
      } catch {
        process.exit(1);
      }
    });
  '; do sleep 2; done
echo "METRO_READY repo=$REPO_ROOT"

# 3. Install if the package is missing, then establish reverse ports immediately before launch
adb shell pm list packages | grep -q com.persoack.cablesnap || npm run android
adb reverse tcp:8082 tcp:8082
adb reverse tcp:8081 tcp:8082
adb reverse --list
adb shell am start -a android.intent.action.VIEW \
  -d "exp+cablesnap://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8082" \
  com.persoack.cablesnap
echo "LAUNCHED com.persoack.cablesnap"
