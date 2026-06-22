#!/usr/bin/env bash
#
# Maestro e2e regression driver for CableSnap (BLD-1735 / BLD-1252 Part A).
#
# Invoked from .github/workflows/e2e-android-emulator.yml inside the
# reactivecircus/android-emulator-runner action. The action runs each line of
# its `script:` field as a separate `/bin/sh -c "..."` call, so multi-line
# shell defined inline does NOT work (lesson from BLD-981, which is why
# scripts/smoke-test-emulator.sh exists). We keep all logic in this one bash
# script and call it as a single command from the workflow.
#
# Contract / preconditions:
#   - The emulator is already booted and reachable via `adb` (the action
#     guarantees this before running `script:`).
#   - The debug APK has already been built by the workflow and its path is
#     passed in $APK_PATH (defaults to the standard Gradle debug output).
#   - $MAESTRO_VERSION is set to a PINNED Maestro CLI version (no `latest`).
#   - $MAESTRO_RESULTS_DIR is where JUnit + screenshots + maestro.log are
#     written so the workflow can upload them as artifacts on failure.
#
# Exit codes: 0 on success (all flows pass), non-zero if any flow fails or a
# precondition is not met.

set -euo pipefail

PACKAGE="com.persoack.cablesnap"
APK_PATH="${APK_PATH:-android/app/build/outputs/apk/debug/app-debug.apk}"
MAESTRO_RESULTS_DIR="${MAESTRO_RESULTS_DIR:-maestro-results}"
# Pin Maestro — never float `latest`. Overridable from the workflow env so the
# version lives in one place (the workflow) but has a safe default here too.
MAESTRO_VERSION="${MAESTRO_VERSION:?MAESTRO_VERSION must be set (pinned, e.g. 1.39.0)}"

echo "=== CableSnap Maestro e2e gate ==="
echo "Package:        $PACKAGE"
echo "APK:            $APK_PATH"
echo "Maestro:        $MAESTRO_VERSION (pinned)"
echo "Results dir:    $MAESTRO_RESULTS_DIR"

# --- Precondition: APK exists -------------------------------------------------
if [ ! -f "$APK_PATH" ]; then
  echo "::error::Debug APK not found at $APK_PATH — the Gradle assembleDebug step must run before this script."
  exit 1
fi

# --- Precondition: emulator is online ----------------------------------------
# `adb wait-for-device` returns as soon as the device is listed; we then poll
# sys.boot_completed so Maestro doesn't race a half-booted system.
echo "--- Waiting for emulator to finish booting ---"
adb wait-for-device
BOOTED=""
for _ in $(seq 1 60); do
  if [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; then
    BOOTED=1
    break
  fi
  sleep 2
done
if [ -z "$BOOTED" ]; then
  echo "::error::Emulator did not report sys.boot_completed=1 within ~120s after boot."
  adb devices -l || true
  exit 1
fi
echo "Emulator booted. Devices:"
adb devices -l || true

# --- Install Maestro CLI (pinned) --------------------------------------------
echo "--- Installing Maestro CLI v$MAESTRO_VERSION ---"
export MAESTRO_VERSION
curl -fsSL "https://get.maestro.mobile.dev" | bash
export PATH="$HOME/.maestro/bin:$PATH"
maestro --version

# --- Install the debug APK ---------------------------------------------------
echo "--- Installing debug APK ---"
# -r reinstalls if a prior variant is present; -g pre-grants runtime perms so
# permission dialogs don't derail the flows on API 34.
adb install -r -g "$APK_PATH"

# --- Run the Maestro flows as the regression gate ----------------------------
mkdir -p "$MAESTRO_RESULTS_DIR"
echo "--- Running maestro test .maestro/ ---"
# `.maestro/` resolves flows via .maestro/config.yaml (flows: flows/*), so all
# five flows run. Any failing flow makes `maestro test` exit non-zero, which
# (set -e) fails this script and the CI job — that is the gate. We intentionally
# do NOT swallow the exit code.
#
# Flags are pinned to what Maestro 1.39.0 actually supports (verified against
# TestCommand.kt @ tag cli-1.39.0). NOTE: `--test-output-dir` does NOT exist in
# 1.39.0 — it was added in a later release — so passing it makes the CLI abort
# with "Unknown option: '--test-output-dir'" before any flow runs (BLD-1735).
# In 1.39.0 the JUnit report goes to --output, and screenshots + maestro.log go
# under --debug-output. --flatten-debug-output writes them straight into
# $MAESTRO_RESULTS_DIR (no per-run timestamped subfolder), giving the workflow a
# single stable path to upload as the failure artifact.
maestro test .maestro/ \
  --format junit \
  --output "$MAESTRO_RESULTS_DIR/report.xml" \
  --debug-output "$MAESTRO_RESULTS_DIR" \
  --flatten-debug-output

echo "All Maestro flows passed — e2e regression gate green."
