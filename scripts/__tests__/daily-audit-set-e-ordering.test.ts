/**
 * BLD-966 — daily-audit.sh: regression-smoke must run even when HEAD
 * scenarios fail (set -e ordering bug).
 *
 * Pre-fix bug:
 *   `set -euo pipefail` + `run_scenarios "HEAD"` ahead of
 *   `regression-smoke.sh` meant a single HEAD spec failure aborted the
 *   script BEFORE the smoke (vision-pipeline trust anchor) ever ran. The
 *   alarm was silenced precisely when it mattered most — when HEAD was
 *   misbehaving.
 *
 * Acceptance criteria from the issue:
 *   1. HEAD scenario fails → regression-smoke.sh STILL executes
 *   2. Smoke fails → audit aborts non-zero (preserved)
 *   3. HEAD fails AND smoke passes → audit aborts non-zero, smoke result
 *      logged (HEAD RC propagates)
 *   4. No regression on full-success path
 *
 * Strategy: drive `scripts/daily-audit.sh` end-to-end against a temp
 * worktree-shaped sandbox where `npx`, `git`, and `scripts/regression-smoke.sh`
 * are stubbed by binaries earlier on PATH, and we control their exit
 * codes via env vars. We assert exit code + presence/absence of sentinel
 * log lines. This exercises the REAL script (not a re-implementation),
 * so set-e ordering regressions get caught.
 */
import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DAILY_AUDIT = path.join(REPO_ROOT, "scripts", "daily-audit.sh");

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  combined: string;
}

/**
 * Build a sandbox containing:
 *   - scripts/daily-audit.sh         (copy of the real one — script under test)
 *   - scripts/regression-smoke.sh    (stub honoring SMOKE_EXIT_CODE)
 *   - tests/fixtures/regression-catcher/bld-480-pre-fix.png  (empty, just exists)
 *   - bin/npx, bin/git               (stubs)
 *   - .pixelslop/                    (writable output dir)
 *
 * Returns the sandbox dir and a runner.
 */
function buildSandbox(opts: {
  headExitCode: number;
  smokeExitCode: number;
}): { dir: string; run: () => RunResult } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bld-966-"));

  // Layout
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(dir, "tests", "fixtures", "regression-catcher"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(dir, "bin"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".pixelslop", "screenshots", "scenarios"), {
    recursive: true,
  });

  // Copy real daily-audit.sh
  fs.copyFileSync(
    DAILY_AUDIT,
    path.join(dir, "scripts", "daily-audit.sh"),
  );
  fs.chmodSync(path.join(dir, "scripts", "daily-audit.sh"), 0o755);

  // Stub regression-smoke.sh — honors SMOKE_EXIT_CODE; writes to FINDINGS_OUT
  const smokeStub = `#!/usr/bin/env bash
set -u
echo "[smoke-stub] called with: $*" >&2
if [[ -n "\${FINDINGS_OUT:-}" ]]; then
  mkdir -p "$(dirname "$FINDINGS_OUT")"
  echo "stub finding line" > "$FINDINGS_OUT"
fi
exit \${SMOKE_EXIT_CODE:-0}
`;
  fs.writeFileSync(path.join(dir, "scripts", "regression-smoke.sh"), smokeStub);
  fs.chmodSync(path.join(dir, "scripts", "regression-smoke.sh"), 0o755);

  // Static fixture (empty file is fine — script only checks existence)
  fs.writeFileSync(
    path.join(dir, "tests", "fixtures", "regression-catcher", "bld-480-pre-fix.png"),
    "",
  );

  // Stub `git` — only the calls daily-audit.sh actually makes:
  //   rev-parse HEAD, rev-parse --abbrev-ref HEAD, reset --hard, clean -fdq, checkout
  const gitStub = `#!/usr/bin/env bash
case "$1 \${2:-}" in
  "rev-parse HEAD")            echo "deadbeefcafebabe1234567890abcdef00000000" ;;
  "rev-parse --abbrev-ref")    echo "test-branch" ;;
  *)                           : ;;  # success no-op for reset/clean/checkout
esac
exit 0
`;
  fs.writeFileSync(path.join(dir, "bin", "git"), gitStub);
  fs.chmodSync(path.join(dir, "bin", "git"), 0o755);

  // Stub `npx` — used by run_scenarios. Honors HEAD_EXIT_CODE.
  // Also writes a fake capture so the cp step has something to copy.
  const npxStub = `#!/usr/bin/env bash
echo "[npx-stub] $*" >&2
mkdir -p .pixelslop/screenshots/scenarios/fake-scenario
echo "fake png bytes" > .pixelslop/screenshots/scenarios/fake-scenario/mobile.png
exit \${HEAD_EXIT_CODE:-0}
`;
  fs.writeFileSync(path.join(dir, "bin", "npx"), npxStub);
  fs.chmodSync(path.join(dir, "bin", "npx"), 0o755);

  const run = (): RunResult => {
    const env = {
      ...process.env,
      PATH: `${path.join(dir, "bin")}:${process.env.PATH}`,
      HEAD_EXIT_CODE: String(opts.headExitCode),
      SMOKE_EXIT_CODE: String(opts.smokeExitCode),
    };
    const proc = spawnSync("bash", [path.join(dir, "scripts", "daily-audit.sh")], {
      cwd: dir,
      env,
      encoding: "utf8",
      timeout: 30_000,
    });
    return {
      status: proc.status,
      stdout: proc.stdout || "",
      stderr: proc.stderr || "",
      combined: (proc.stdout || "") + (proc.stderr || ""),
    };
  };

  return { dir, run };
}

function cleanup(dir: string) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

describe("daily-audit.sh — BLD-966 set -e ordering", () => {
  // Sanity: real script syntax is valid (catch refactor mistakes).
  it("real script passes bash -n syntax check", () => {
    expect(() =>
      execFileSync("bash", ["-n", DAILY_AUDIT], { encoding: "utf8" }),
    ).not.toThrow();
  });

  it("AC1: HEAD scenario fails → regression-smoke.sh STILL executes", () => {
    const { dir, run } = buildSandbox({ headExitCode: 1, smokeExitCode: 0 });
    try {
      const r = run();
      // Smoke stub prints a sentinel to stderr — its presence proves the
      // stub was invoked even though HEAD failed.
      expect(r.combined).toContain("[smoke-stub] called with:");
      // Audit must still abort non-zero because HEAD failed.
      expect(r.status).not.toBe(0);
      // And the human-readable message about HEAD-failed-but-smoke-passed
      // must appear, so operators can distinguish "real regression" from
      // "vision pipeline broken".
      expect(r.combined).toMatch(/HEAD scenarios failed.*smoke PASSED/);
    } finally {
      cleanup(dir);
    }
  });

  it("AC2: smoke fails → audit aborts non-zero with smoke RC", () => {
    const { dir, run } = buildSandbox({ headExitCode: 0, smokeExitCode: 7 });
    try {
      const r = run();
      // Smoke RC dominates — non-zero exit, and specifically the smoke RC.
      expect(r.status).toBe(7);
      expect(r.combined).toMatch(/regression-smoke FAILED|trust anchor/);
    } finally {
      cleanup(dir);
    }
  });

  it("AC3: HEAD fails AND smoke fails → smoke RC dominates", () => {
    // Smoke is the trust anchor — if it fails we MUST surface that, not the
    // HEAD failure (which can't be trusted anyway when the pipeline is sick).
    const { dir, run } = buildSandbox({ headExitCode: 2, smokeExitCode: 9 });
    try {
      const r = run();
      expect(r.status).toBe(9);
      expect(r.combined).toMatch(/regression-smoke FAILED|trust anchor/);
    } finally {
      cleanup(dir);
    }
  });

  it("AC4: full success → exit 0, no regression", () => {
    const { dir, run } = buildSandbox({ headExitCode: 0, smokeExitCode: 0 });
    try {
      const r = run();
      expect(r.status).toBe(0);
      expect(r.combined).toContain("regression-smoke: PASS");
      // Sanity: smoke stub was invoked.
      expect(r.combined).toContain("[smoke-stub] called with:");
    } finally {
      cleanup(dir);
    }
  });
});
