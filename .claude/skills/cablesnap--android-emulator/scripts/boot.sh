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

# 2. Start Metro on 8082 if not already serving
if ! curl -s http://localhost:8082/status >/dev/null 2>&1; then
  nohup npx expo start --dev-client --port 8082 >/tmp/metro.log 2>&1 &
  echo "starting Metro on 8082..."
  until curl -s http://localhost:8082/status >/dev/null 2>&1; do sleep 2; done
fi

# 3. Reverse ports (dev client hardcodes 8081 -> map to 8082)
adb reverse tcp:8082 tcp:8082
adb reverse tcp:8081 tcp:8082
adb reverse --list

# 4. Install if the package is missing, then launch pointed at Metro
adb shell pm list packages | grep -q com.persoack.cablesnap || npm run android
adb shell am start -a android.intent.action.VIEW \
  -d "exp+cablesnap://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8082" \
  com.persoack.cablesnap
echo "LAUNCHED com.persoack.cablesnap"
