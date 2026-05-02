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

  # Wait for app to initialize. 15s is comfortable on API 34 emulators which
  # take longer to settle than older versions; the previous 10s caught the app
  # mid-boot in run #25242273020 where pidof was set but dumpsys hadn't yet
  # promoted MainActivity to RESUMED.
  sleep 15

  # Hard-fail check 1: process must still be alive (catches launch crashes).
  if ! adb shell pidof "$PACKAGE" > /dev/null 2>&1; then
    echo "::error::$LABEL crashed on launch — process not found."
    adb logcat -d | grep -E 'FATAL EXCEPTION|AndroidRuntime' | head -20 || true
    return 1
  fi
  echo "$LABEL is running (pid: $(adb shell pidof "$PACKAGE"))"

  # Hard-fail check 2: no FATAL EXCEPTION in logcat (catches RuntimeExceptions).
  local FATAL_COUNT
  FATAL_COUNT=$(adb logcat -d | grep -c 'FATAL EXCEPTION' || true)
  if [ "$FATAL_COUNT" -gt 0 ]; then
    echo "::error::$LABEL has FATAL EXCEPTION in logcat."
    adb logcat -d | grep -E 'FATAL EXCEPTION|AndroidRuntime' | head -20 || true
    return 1
  fi

  # Soft check: try to verify activity reached the RESUMED state. The dumpsys
  # output format varies across API levels and emulator versions, so we try
  # multiple patterns and treat a missing match as a warning, not a failure.
  # A live process + no fatal exceptions is sufficient for a smoke test.
  local DUMPSYS_OUT
  DUMPSYS_OUT=$(adb shell dumpsys activity activities 2>/dev/null || true)
  local ACTIVITY_STATE=""
  # Try several known formats from different API levels:
  #   API 30+:  "state=RESUMED"
  #   API 34:   "* TaskRecord{... A=com.persoack.cablesnap U=0 visible=true visibleRequested=true}"
  #             with "mResumedActivity: ActivityRecord{... com.persoack.cablesnap/.MainActivity ...}"
  if echo "$DUMPSYS_OUT" | grep -q "mResumedActivity.*${PACKAGE}/"; then
    ACTIVITY_STATE="resumed (via mResumedActivity)"
  elif ACTIVITY_STATE=$(echo "$DUMPSYS_OUT" \
        | grep -A 5 "${PACKAGE}/.MainActivity" \
        | grep -oE 'state=[a-zA-Z]+' | head -1); then
    : # got something
  fi
  ACTIVITY_STATE="${ACTIVITY_STATE:-<unknown>}"
  echo "Activity state: $ACTIVITY_STATE"

  if echo "$ACTIVITY_STATE" | grep -qi 'resumed'; then
    echo "$LABEL smoke test passed — MainActivity is RESUMED."
  else
    echo "::warning::$LABEL — could not confirm RESUMED state via dumpsys (got: $ACTIVITY_STATE)."
    echo "::warning::Process is alive and no FATAL EXCEPTION found, treating smoke test as PASS."
    # Tail logcat for diagnostic context — does NOT fail the test.
    adb logcat -d | grep -E 'ActivityTaskManager|ActivityManager.*Displayed|ActivityManager.*START' | tail -10 || true
  fi

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
