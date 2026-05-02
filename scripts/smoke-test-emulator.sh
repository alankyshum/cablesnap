#!/usr/bin/env bash
#
# Emulator smoke test for CableSnap APKs.
#
# Invoked from .github/workflows/scheduled-release.yml inside the
# reactivecircus/android-emulator-runner action. The action runs each line of
# its `script:` field as a separate `/bin/sh -c "..."` call, so multi-line
# shell functions defined inline don't work. We extract the logic to this
# bash script and call it as a single command.
#
# Expects the working directory to contain `cablesnap.apk` (Play variant) and
# `cablesnap-fdroid.apk` (F-Droid variant). The emulator must already be
# booted and available via adb.
#
# Exit codes: 0 on success, 1 on any smoke-test failure.

set -euo pipefail

PACKAGE="com.persoack.cablesnap"
ACTIVITY="${PACKAGE}/.MainActivity"

smoke_test_apk() {
  local APK_PATH="$1"
  local LABEL="$2"

  echo "=== Smoke-testing $LABEL: $APK_PATH ==="

  # Install
  adb install "$APK_PATH"

  # Clear logcat before launch
  adb logcat -c

  # Launch the app
  adb shell am start -n "$ACTIVITY"

  # Wait for app to initialize (10s is sufficient with animations disabled)
  sleep 10

  # Check if app process is still running
  if ! adb shell pidof "$PACKAGE" > /dev/null 2>&1; then
    echo "::error::$LABEL crashed on launch — process not found."
    adb logcat -d | grep -E 'FATAL EXCEPTION|AndroidRuntime' | head -20 || true
    return 1
  fi
  echo "$LABEL is running (pid: $(adb shell pidof "$PACKAGE"))"

  # Check logcat for fatal exceptions
  local FATAL_COUNT
  FATAL_COUNT=$(adb logcat -d | grep -c 'FATAL EXCEPTION' || true)
  if [ "$FATAL_COUNT" -gt 0 ]; then
    echo "::error::$LABEL has FATAL EXCEPTION in logcat."
    adb logcat -d | grep -E 'FATAL EXCEPTION|AndroidRuntime' | head -20 || true
    return 1
  fi

  # Verify the app reached the main screen (activity is in resumed state)
  local ACTIVITY_STATE
  ACTIVITY_STATE=$(adb shell dumpsys activity activities \
    | grep -A 5 "com.persoack.cablesnap/.MainActivity" \
    | grep -oE 'state=[a-zA-Z]+' | head -1 || true)
  echo "Activity state: $ACTIVITY_STATE"
  if ! echo "$ACTIVITY_STATE" | grep -qi 'resumed'; then
    echo "::error::$LABEL — MainActivity not in RESUMED state (got: $ACTIVITY_STATE). App may not have reached the main screen."
    adb logcat -d | grep -E 'FATAL|Error|Exception' | tail -10 || true
    return 1
  fi

  echo "$LABEL smoke test passed — MainActivity is RESUMED."

  # Force-stop and uninstall before next variant
  adb shell am force-stop "$PACKAGE"
  adb uninstall "$PACKAGE"
}

# Test Play variant
PLAY_EXIT=0
smoke_test_apk "cablesnap.apk" "Play APK" || PLAY_EXIT=$?

if [ "$PLAY_EXIT" -ne 0 ]; then
  echo "Retrying Play APK smoke test (flaky emulator guard)..."
  sleep 5
  # Ensure clean state for retry
  adb uninstall "$PACKAGE" 2>/dev/null || true
  if ! smoke_test_apk "cablesnap.apk" "Play APK (retry)"; then
    echo "::error::Play APK failed smoke test on retry."
    exit 1
  fi
fi

# Test F-Droid variant
FDROID_EXIT=0
smoke_test_apk "cablesnap-fdroid.apk" "F-Droid APK" || FDROID_EXIT=$?

if [ "$FDROID_EXIT" -ne 0 ]; then
  echo "Retrying F-Droid APK smoke test (flaky emulator guard)..."
  sleep 5
  adb uninstall "$PACKAGE" 2>/dev/null || true
  if ! smoke_test_apk "cablesnap-fdroid.apk" "F-Droid APK (retry)"; then
    echo "::error::F-Droid APK failed smoke test on retry."
    exit 1
  fi
fi

echo "All emulator smoke tests passed."
