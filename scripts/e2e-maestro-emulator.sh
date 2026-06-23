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
APK_PATH="${APK_PATH:-android/app/build/outputs/apk/release/app-release.apk}"
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

# --- Precondition: package manager is ready ----------------------------------
# sys.boot_completed=1 fires before the PackageManager has finished coming up.
# Running `adb install` against a not-yet-ready PM is what dragged the install
# to ~5.5 min in BLD-1742 (run 27981782936) and left the emulator thrashing so
# Maestro's driver then timed out. Poll `pm path android` (a trivially-present
# package) until the PM answers, so install + Maestro start against a settled
# device. Best-effort gate: ~120s budget, then proceed and let install surface
# any real failure.
echo "--- Waiting for package manager to be ready ---"
PM_READY=""
for _ in $(seq 1 60); do
  if adb shell pm path android >/dev/null 2>&1; then
    PM_READY=1
    break
  fi
  sleep 2
done
if [ -z "$PM_READY" ]; then
  echo "::warning::PackageManager not confirmed ready within ~120s; proceeding with install anyway."
else
  echo "Package manager is ready."
fi

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
# Give Maestro's Android driver more time to push and start its instrumentation
# server on a CI emulator that may still be warming up after boot. The default
# is 15000ms (AndroidDriver.kt:1051-1053 @ cli-1.39.0, env var
# MAESTRO_DRIVER_STARTUP_TIMEOUT), which was too tight in BLD-1742 (run
# 27981782936) when the emulator was under load — the driver timed out with
# AndroidDriverTimeoutException before any flow ran. 120000ms (2 min) absorbs
# that warm-up without masking a genuinely-dead driver (the action's overall
# step still bounds total time).
export MAESTRO_DRIVER_STARTUP_TIMEOUT="${MAESTRO_DRIVER_STARTUP_TIMEOUT:-120000}"
echo "Maestro driver startup timeout: ${MAESTRO_DRIVER_STARTUP_TIMEOUT}ms"

# Hard wall-clock cap on the whole `maestro test` invocation. This is a
# gate-design safety net, independent of any per-command timeout.
#
# Why this exists (BLD-1793): a single flow can hang far longer than its own
# configured timeout. Run 28033115531 showed `scrollUntilVisible` for the
# add-food "log-food-button" swiping the emulator for ~26 MINUTES despite a
# `timeout: 30000` (30s) on the command — Maestro 1.39.0 did NOT honor that
# per-command timeout, so the loop only stopped when the job-level
# `timeout-minutes: 45` killed the entire runner. The docs promise the command
# fails at its timeout (docs.maestro.dev/.../scrolluntilvisible: "If the timeout
# is reached before the element is found, the test fails."), but the 1.39.0
# Android driver did not enforce it in that run. We therefore refuse to rely on
# per-command timeouts for liveness.
#
# `timeout` (coreutils) sends SIGTERM after MAESTRO_TEST_TIMEOUT, then SIGKILL
# 30s later (--kill-after) if Maestro ignores the term. 25m is generous: a
# healthy 5-flow run completes in ~5-8 min, so 25m only ever trips on a genuine
# hang, while still leaving ~15 min of the 45-min job budget for artifact upload
# and teardown. A 124 exit code from `timeout` means "the gate hung" — we
# surface it explicitly and exit non-zero so the job (and PR) fail fast instead
# of burning the full runner allocation.
MAESTRO_TEST_TIMEOUT="${MAESTRO_TEST_TIMEOUT:-25m}"
echo "--- Running maestro test .maestro/ (hard cap: $MAESTRO_TEST_TIMEOUT) ---"
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
#
# Capture the exit code without tripping `set -e` on the `timeout` wrapper so we
# can distinguish a hang (124) from a normal flow failure (non-zero, non-124).
set +e
timeout --kill-after=30s "$MAESTRO_TEST_TIMEOUT" \
  maestro test .maestro/ \
    --format junit \
    --output "$MAESTRO_RESULTS_DIR/report.xml" \
    --debug-output "$MAESTRO_RESULTS_DIR" \
    --flatten-debug-output
MAESTRO_EXIT=$?
set -e

if [ "$MAESTRO_EXIT" -eq 124 ] || [ "$MAESTRO_EXIT" -eq 137 ]; then
  echo "::error::Maestro test run exceeded the ${MAESTRO_TEST_TIMEOUT} hard cap and was killed (exit ${MAESTRO_EXIT}). A flow is hanging — see uploaded maestro-results artifacts for the last command before the stall."
  exit 1
elif [ "$MAESTRO_EXIT" -ne 0 ]; then
  echo "::error::Maestro e2e gate failed (exit ${MAESTRO_EXIT}) — one or more flows did not pass. See uploaded maestro-results artifacts."
  exit "$MAESTRO_EXIT"
fi

echo "All Maestro flows passed — e2e regression gate green."
