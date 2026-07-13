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
# Exit codes:
#   0  — smoke tests passed
#   1  — app failure (FATAL EXCEPTION / process-not-found on healthy emulator)
#   2  — emulator-infrastructure failure (dead emulator could not be revived)
#        This exit code signals a CI infrastructure flake, NOT an app regression.

set -euo pipefail

PACKAGE="com.persoack.cablesnap"
ACTIVITY="${PACKAGE}/.MainActivity"

# Portable bounded-wait: use `timeout` if present (GNU/Linux CI), else
# `gtimeout` (Homebrew coreutils), else pure-bash timeout fallback
# (macOS has no coreutils timeout). The fallback backgrounds the command,
# polls up to `secs`, then kills the process group on expiry.
_timeout() {
    local secs="$1"; shift
    if command -v timeout >/dev/null 2>&1; then
        timeout "$secs" "$@"
    elif command -v gtimeout >/dev/null 2>&1; then
        gtimeout "$secs" "$@"
    else
        # Pure-bash fallback (macOS has no coreutils timeout): run the command
        # in the background, poll up to `secs`, then kill the process group.
        "$@" &
        local cmd_pid=$!
        local waited=0
        while kill -0 "$cmd_pid" 2>/dev/null; do
            if [ "$waited" -ge "$secs" ]; then
                kill -TERM "$cmd_pid" 2>/dev/null || true
                sleep 1
                kill -KILL "$cmd_pid" 2>/dev/null || true
                wait "$cmd_pid" 2>/dev/null
                return 124   # match GNU timeout's exit code on expiry
            fi
            sleep 1
            waited=$((waited + 1))
        done
        wait "$cmd_pid"
        return $?
    fi
}

# ---------------------------------------------------------------------------
# Dead-emulator detection
# ---------------------------------------------------------------------------
# Returns 0 (true) if the output string is consistent with a dead/crashed
# emulator: "Broken pipe", "Can't find service: activity|package", or
# "error: no devices/emulators found" / "device offline".
#
# Usage: is_dead_emulator_error "$output_string"
is_dead_emulator_error() {
  local output="$1"
  if echo "$output" | grep -qE \
       'Broken pipe|Can'"'"'t find service: (activity|package)|error: no devices|device offline|error: device offline'; then
    return 0
  fi
  return 1
}

# ---------------------------------------------------------------------------
# Emulator health-restore
# ---------------------------------------------------------------------------
# After detecting that the emulator process has died or become unreachable,
# attempt to wait for it to recover within a bounded timeout.
#
# Strategy:
#   1. adb wait-for-device — blocks until the ADB transport layer reconnects.
#   2. Poll sys.boot_completed until it returns "1" (bounded by BOOT_TIMEOUT_S).
#   3. Probe the package service to confirm Android system services are live.
#
# Returns 0 if the emulator is healthy, 1 if it could not be revived within
# the timeout.
#
# Usage: restore_emulator_health
BOOT_TIMEOUT_S="${EMULATOR_BOOT_TIMEOUT_S:-120}"

restore_emulator_health() {
  echo "--- Emulator health-restore: waiting for ADB transport (timeout: ${BOOT_TIMEOUT_S}s) ---"

  # Step 1: Wait for device transport to reconnect (bounded timeout via _timeout).
  if ! _timeout "${BOOT_TIMEOUT_S}" adb wait-for-device 2>&1; then
    echo "::error::Emulator infrastructure failure — adb wait-for-device timed out after ${BOOT_TIMEOUT_S}s. This is a CI runner resource issue, not an app regression."
    return 1
  fi
  echo "--- ADB transport up; polling boot_completed ---"

  # Step 2: Poll sys.boot_completed until "1".
  local deadline=$(( $(date +%s) + BOOT_TIMEOUT_S ))
  while true; do
    local boot_val
    boot_val=$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '[:space:]') || boot_val=""
    if [ "$boot_val" = "1" ]; then
      echo "--- sys.boot_completed=1 ---"
      break
    fi
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo "::error::Emulator infrastructure failure — sys.boot_completed never reached 1 within ${BOOT_TIMEOUT_S}s. This is a CI runner resource issue, not an app regression."
      return 1
    fi
    sleep 5
  done

  # Step 3: Confirm package service is alive.
  echo "--- Probing Android package service ---"
  local pkg_probe
  pkg_probe=$(adb shell cmd package list packages 2>&1 | head -3) || pkg_probe=""
  if is_dead_emulator_error "$pkg_probe"; then
    echo "::error::Emulator infrastructure failure — Android package service unresponsive after boot_completed=1. This is a CI runner resource issue, not an app regression."
    return 1
  fi

  echo "--- Emulator health-restore: emulator is healthy ---"
  return 0
}

# ---------------------------------------------------------------------------
# Single-variant smoke test
# ---------------------------------------------------------------------------
smoke_test_apk() {
  local APK_PATH="$1"
  local LABEL="$2"

  echo "=== Smoke-testing $LABEL: $APK_PATH ==="

  # Install — capture output so we can inspect for dead-emulator symptoms.
  local install_out
  if ! install_out=$(adb install "$APK_PATH" 2>&1); then
    # Distinguish infrastructure death from a genuine install failure.
    if is_dead_emulator_error "$install_out"; then
      echo "--- Dead-emulator detected during install (broken-pipe / can't-find-service) ---"
      echo "$install_out"
      # Signal caller to attempt health-restore + retry.
      return 2
    fi
    echo "::error::$LABEL install failed (not a dead-emulator signal)."
    echo "$install_out"
    return 1
  fi

  # Clear logcat before launch
  adb logcat -c

  # Launch the app
  adb shell am start -n "$ACTIVITY"

  # Wait for app to initialize. 15s is comfortable on API 34 emulators which
  # take longer to settle than older versions; the previous 10s caught the app
  # mid-boot in run #25242273020 where pidof was set but dumpsys hadn't yet
  # promoted MainActivity to RESUMED.
  # EMULATOR_APP_SETTLE_S can be overridden in tests to reduce wall-clock time.
  sleep "${EMULATOR_APP_SETTLE_S:-15}"

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

# ---------------------------------------------------------------------------
# Run smoke test for one variant with dead-emulator-aware retry
# ---------------------------------------------------------------------------
# Usage: run_variant_smoke_test <apk_path> <label>
# Exits the whole script on:
#   - Genuine app failure (exit 1)
#   - Emulator cannot be revived (exit 2)
run_variant_smoke_test() {
  local APK_PATH="$1"
  local LABEL="$2"

  local EXIT_CODE=0
  smoke_test_apk "$APK_PATH" "$LABEL" || EXIT_CODE=$?

  if [ "$EXIT_CODE" -eq 0 ]; then
    return 0
  fi

  if [ "$EXIT_CODE" -eq 2 ]; then
    # Dead-emulator path: attempt health-restore before retry.
    echo "Dead-emulator signal detected for $LABEL — attempting health-restore before retry..."
    if ! restore_emulator_health; then
      # restore_emulator_health already printed the ::error:: message.
      exit 2
    fi
    # Emulator is healthy — clean up any partial install and retry.
    adb uninstall "$PACKAGE" 2>/dev/null || true
    if ! smoke_test_apk "$APK_PATH" "$LABEL (retry after health-restore)"; then
      echo "::error::$LABEL failed smoke test after emulator health-restore."
      exit 1
    fi
    return 0
  fi

  # EXIT_CODE=1: genuine app failure on first attempt — allow one blind retry
  # for transient non-emulator-death flake (original behavior preserved).
  echo "Retrying $LABEL smoke test (flaky emulator guard)..."
  sleep 5
  # Ensure clean state for retry
  adb uninstall "$PACKAGE" 2>/dev/null || true
  if ! smoke_test_apk "$APK_PATH" "$LABEL (retry)"; then
    echo "::error::$LABEL failed smoke test on retry."
    exit 1
  fi
}

# Test Play variant
run_variant_smoke_test "cablesnap.apk" "Play APK"

# Test F-Droid variant
run_variant_smoke_test "cablesnap-fdroid.apk" "F-Droid APK"

echo "All emulator smoke tests passed."
