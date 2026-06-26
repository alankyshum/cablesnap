/**
 * BLD-1976 — Tests for smoke-test-emulator.sh dead-emulator retry guard.
 *
 * Problem background:
 *   The existing 'flaky emulator guard' retry blindly re-installs on the same
 *   dead emulator (sleep 5 + adb uninstall + install). When the emulator process
 *   has died mid-install (broken pipe / "Can't find service"), every subsequent
 *   adb call also fails identically, so the retry exits 1 and blocks the release.
 *
 * Fix:
 *   1. Detect dead-emulator symptoms (broken pipe / Can't find service: activity|package)
 *      vs genuine app failure (FATAL EXCEPTION / process-not-found on healthy emulator).
 *   2. On dead-emulator, run health-restore: wait-for-device + boot_completed poll +
 *      package-service probe. Only re-install once healthy.
 *   3. If emulator cannot be revived, exit 2 (infra failure, distinct from app failure exit 1).
 *   4. Genuine app crashes on healthy emulators still exit 1 (no regression).
 *
 * Test strategy:
 *   Stub the `adb` binary on PATH with a small bash script that implements
 *   scripted behaviour based on environment variables. Run smoke-test-emulator.sh
 *   against the stub and assert on exit codes and output.
 *
 * Acceptance criteria (BLD-1976):
 *   AC1: Dead emulator detected → health-restore path taken (not blind re-install).
 *   AC2: App crash on healthy emulator → hard-fail exit 1 (no regression).
 *   AC3: Emulator unrevivable → distinct infra error message + exit 2.
 *   AC4: Slow-boot emulator (boot_completed eventually returns 1) → health-restore
 *        waits, then install succeeds.
 */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SCRIPT = path.join(REPO_ROOT, "scripts", "smoke-test-emulator.sh");
const PACKAGE = "com.persoack.cablesnap";

interface RunResult {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    combined: string;
}

/**
 * Run smoke-test-emulator.sh with a fake `adb` on PATH.
 *
 * @param adbScript  Content of the fake `adb` bash script.
 * @param extraEnv   Additional environment variables.
 */
function runSmokeTest(adbScript: string, extraEnv: Record<string, string> = {}): RunResult {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bld1976-"));
    try {
        // Write fake APKs (content doesn't matter — adb install is stubbed).
        fs.writeFileSync(path.join(tmpDir, "cablesnap.apk"), "FAKE_APK");
        fs.writeFileSync(path.join(tmpDir, "cablesnap-fdroid.apk"), "FAKE_APK");

        // Write fake adb binary.
        const fakeAdb = path.join(tmpDir, "adb");
        fs.writeFileSync(fakeAdb, `#!/usr/bin/env bash\n${adbScript}\n`);
        fs.chmodSync(fakeAdb, 0o755);

        const result = spawnSync("bash", [SCRIPT], {
            cwd: tmpDir,
            env: {
                ...process.env,
                PATH: `${tmpDir}:${process.env.PATH}`,
                // Short timeouts so health-restore tests don't take forever.
                EMULATOR_BOOT_TIMEOUT_S: "10",
                // Skip the 15s post-launch settle sleep in tests.
                EMULATOR_APP_SETTLE_S: "0",
                ...extraEnv,
            },
            encoding: "utf8",
            timeout: 60_000,
        });

        const combined = (result.stdout ?? "") + (result.stderr ?? "");
        return {
            exitCode: result.status,
            stdout: result.stdout ?? "",
            stderr: result.stderr ?? "",
            combined,
        };
    } finally {
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
            /* best-effort */
        }
    }
}

// ---------------------------------------------------------------------------
// Fake adb script snippets — compose these to build test scenarios.
// ---------------------------------------------------------------------------

/**
 * A healthy emulator: install succeeds, pidof returns a PID, no FATAL
 * EXCEPTION in logcat, boot_completed=1, package service responds.
 */
const HEALTHY_ADB = `
case "$1 $2 $3" in
  "install "*)
    echo "Success"
    exit 0
    ;;
esac
case "$1" in
  "logcat")
    if [[ "$2" == "-c" ]]; then exit 0; fi
    # -d: no FATAL EXCEPTION
    echo "03-01 00:00:00.000  123  456 I ActivityTaskManager: Displayed ${PACKAGE}/.MainActivity"
    exit 0
    ;;
  "shell")
    case "$2" in
      "am")
        case "$3" in
          "start") exit 0 ;;
          "force-stop") exit 0 ;;
        esac
        ;;
      "pidof")
        echo "12345"
        exit 0
        ;;
      "getprop")
        echo "1"
        exit 0
        ;;
      "cmd")
        case "$3" in
          "list") echo "package:${PACKAGE}"; exit 0 ;;
        esac
        ;;
      "dumpsys")
        echo "mResumedActivity: ActivityRecord{... ${PACKAGE}/.MainActivity ...}"
        exit 0
        ;;
    esac
    ;;
  "uninstall")
    exit 0
    ;;
  "wait-for-device")
    exit 0
    ;;
esac
exit 0
`;

/**
 * Dead emulator: install fails with broken-pipe / can't-find-service.
 * After restoring health (wait-for-device + boot_completed), all subsequent
 * calls succeed (healthy emulator behaviour).
 */
function makeDeadThenHealthyAdb(statefile: string): string {
    return `
STATEFILE="${statefile}"

# Track whether we've been through health-restore (wait-for-device was called).
if [[ -f "$STATEFILE" ]]; then
  # Post-restore: behave like a healthy emulator.
  case "$1 $2 $3" in
    "install "*)
      echo "Success"
      exit 0
      ;;
  esac
  case "$1" in
    "logcat")
      if [[ "$2" == "-c" ]]; then exit 0; fi
      echo "I ActivityTaskManager: Displayed ${PACKAGE}/.MainActivity"
      exit 0
      ;;
    "shell")
      case "$2" in
        "am") exit 0 ;;
        "pidof") echo "12345"; exit 0 ;;
        "getprop") echo "1"; exit 0 ;;
        "cmd") echo "package:${PACKAGE}"; exit 0 ;;
        "dumpsys") echo "mResumedActivity: ActivityRecord{... ${PACKAGE}/.MainActivity ...}"; exit 0 ;;
      esac
      ;;
    "uninstall") exit 0 ;;
    "wait-for-device") exit 0 ;;
  esac
  exit 0
fi

# Pre-restore: fail install with dead-emulator signal.
case "$1 $2 $3" in
  "install "*)
    echo "adb: failed to install cablesnap.apk: cmd: Failure calling service package: Broken pipe (32)"
    exit 1
    ;;
esac
case "$1" in
  "uninstall")
    echo "cmd: Can't find service: package"
    exit 1
    ;;
  "wait-for-device")
    # Restore path: mark state as restored and succeed.
    touch "$STATEFILE"
    exit 0
    ;;
  "shell")
    case "$2" in
      "getprop") echo "1"; exit 0 ;;
      "cmd") echo "package:${PACKAGE}"; exit 0 ;;
    esac
    ;;
esac
exit 0
`;
}

/**
 * App crash: install succeeds, pidof returns nothing (process died).
 * Emulator is otherwise healthy.
 */
const APP_CRASH_PIDOF_ADB = `
case "$1 $2 $3" in
  "install "*)
    echo "Success"
    exit 0
    ;;
esac
case "$1" in
  "logcat")
    if [[ "$2" == "-c" ]]; then exit 0; fi
    echo "E AndroidRuntime: FATAL EXCEPTION: main"
    echo "E AndroidRuntime: java.lang.NullPointerException: crash"
    exit 0
    ;;
  "shell")
    case "$2" in
      "am")
        case "$3" in
          "start") exit 0 ;;
          "force-stop") exit 0 ;;
        esac
        ;;
      "pidof")
        # Process is dead — return nothing.
        exit 1
        ;;
      "getprop") echo "1"; exit 0 ;;
      "cmd") echo "package:${PACKAGE}"; exit 0 ;;
      "dumpsys") echo ""; exit 0 ;;
    esac
    ;;
  "uninstall") exit 0 ;;
  "wait-for-device") exit 0 ;;
esac
exit 0
`;

/**
 * Unrevivable emulator: install fails with broken-pipe, and wait-for-device
 * hangs forever (we simulate this with an immediate timeout exit).
 */
const UNREVIVABLE_ADB = `
case "$1 $2 $3" in
  "install "*)
    echo "cmd: Failure calling service package: Broken pipe (32)"
    exit 1
    ;;
esac
case "$1" in
  "uninstall")
    echo "cmd: Can't find service: package"
    exit 1
    ;;
  "wait-for-device")
    # Simulate an emulator that never reconnects — sleep until killed.
    sleep 999
    exit 1
    ;;
esac
exit 0
`;

/**
 * Slow-boot emulator: install fails first (dead), wait-for-device succeeds
 * quickly, but boot_completed returns "" several times before returning "1".
 */
function makeSlowBootAdb(statefile: string): string {
    return `
STATEFILE="${statefile}"
BOOTCOUNT_FILE="${statefile}.bootcount"

if [[ -f "$STATEFILE" ]]; then
  # Post-restore healthy path.
  case "$1 $2 $3" in
    "install "*)
      echo "Success"
      exit 0
      ;;
  esac
  case "$1" in
    "logcat")
      if [[ "$2" == "-c" ]]; then exit 0; fi
      echo "I ActivityTaskManager: Displayed ${PACKAGE}/.MainActivity"
      exit 0
      ;;
    "shell")
      case "$2" in
        "am") exit 0 ;;
        "pidof") echo "12345"; exit 0 ;;
        "getprop") echo "1"; exit 0 ;;
        "cmd") echo "package:${PACKAGE}"; exit 0 ;;
        "dumpsys") echo "mResumedActivity: ActivityRecord{... ${PACKAGE}/.MainActivity ...}"; exit 0 ;;
      esac
      ;;
    "uninstall") exit 0 ;;
    "wait-for-device") exit 0 ;;
  esac
  exit 0
fi

case "$1 $2 $3" in
  "install "*)
    echo "cmd: Failure calling service activity: Broken pipe (32)"
    exit 1
    ;;
esac
case "$1" in
  "uninstall")
    echo "cmd: Can't find service: activity"
    exit 1
    ;;
  "wait-for-device")
    touch "$STATEFILE"
    exit 0
    ;;
  "shell")
    case "$2" in
      "getprop")
        # boot_completed is empty on first 2 polls, then "1".
        COUNT=0
        if [[ -f "$BOOTCOUNT_FILE" ]]; then
          COUNT=$(cat "$BOOTCOUNT_FILE")
        fi
        COUNT=$((COUNT + 1))
        echo "$COUNT" > "$BOOTCOUNT_FILE"
        if [[ "$COUNT" -ge 3 ]]; then
          echo "1"
        else
          echo ""
        fi
        exit 0
        ;;
      "cmd") echo "package:${PACKAGE}"; exit 0 ;;
    esac
    ;;
esac
exit 0
`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BLD-1976 smoke-test-emulator.sh dead-emulator retry guard", () => {
    it("AC1: dead emulator (broken-pipe on install) → health-restore path taken, retry succeeds (exit 0)", () => {
        const statefile = path.join(os.tmpdir(), `bld1976-state-${Date.now()}`);
        try {
            const adbScript = makeDeadThenHealthyAdb(statefile);
            const result = runSmokeTest(adbScript);

            expect(result.exitCode).toBe(0);
            // Health-restore path must have been entered.
            expect(result.combined).toMatch(/health-restore/i);
            // Must NOT have done a blind re-install (old behaviour was just sleep 5 + uninstall + install).
            // The presence of "wait-for-device" or "boot_completed" message confirms the new path.
            expect(result.combined).toMatch(/ADB transport|boot_completed|emulator is healthy/i);
        } finally {
            try { fs.unlinkSync(statefile); } catch { /* best-effort */ }
            try { fs.unlinkSync(`${statefile}.bootcount`); } catch { /* best-effort */ }
        }
    });

    it("AC2: genuine app crash (FATAL EXCEPTION) on healthy emulator → exits 1 (no regression)", () => {
        const result = runSmokeTest(APP_CRASH_PIDOF_ADB);

        expect(result.exitCode).toBe(1);
        // Must identify it as an app failure (process not found), not an infra failure.
        expect(result.combined).toMatch(/crashed on launch|process not found/i);
        // Must NOT emit infrastructure failure messaging.
        expect(result.combined).not.toMatch(/emulator infrastructure failure/i);
        expect(result.combined).not.toMatch(/infra.*flake|CI runner resource/i);
    });

    it("AC3: unrevivable emulator (wait-for-device times out) → exits 2 with ::error:: infra message", () => {
        const result = runSmokeTest(UNREVIVABLE_ADB);

        expect(result.exitCode).toBe(2);
        // Must name this as an infrastructure failure.
        expect(result.combined).toMatch(/[Ee]mulator infrastructure failure/);
        // Must use GitHub Actions ::error:: annotation.
        expect(result.combined).toMatch(/::error::/);
        // Must NOT say "app regression".
        // (The message says "not an app regression" — ensure the framing is correct.)
        expect(result.combined).toMatch(/not an app regression/);
    });

    it("AC4: slow-boot emulator (boot_completed eventually=1) → health-restore waits, then install succeeds (exit 0)", () => {
        const statefile = path.join(os.tmpdir(), `bld1976-slowboot-${Date.now()}`);
        try {
            const adbScript = makeSlowBootAdb(statefile);
            const result = runSmokeTest(adbScript);

            expect(result.exitCode).toBe(0);
            expect(result.combined).toMatch(/health-restore/i);
            expect(result.combined).toMatch(/All emulator smoke tests passed/);
        } finally {
            try { fs.unlinkSync(statefile); } catch { /* best-effort */ }
            try { fs.unlinkSync(`${statefile}.bootcount`); } catch { /* best-effort */ }
        }
    });

    it("healthy emulator (no dead-emulator failure) → passes without entering health-restore path (exit 0)", () => {
        const result = runSmokeTest(HEALTHY_ADB);

        expect(result.exitCode).toBe(0);
        expect(result.combined).toMatch(/All emulator smoke tests passed/);
        expect(result.combined).not.toMatch(/health-restore/i);
        expect(result.combined).not.toMatch(/Dead-emulator/i);
    });
});
