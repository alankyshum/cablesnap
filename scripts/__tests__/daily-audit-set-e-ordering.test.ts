/**
 * BLD-966 / BLD-1023 — daily-audit.sh: regression-smoke must run even when
 * HEAD scenarios fail (set -e ordering bug), and must run against a
 * freshly captured wrapper-fixture PNG (BLD-1023 migration).
 *
 * Pre-fix bug (BLD-966):
 *   `set -euo pipefail` + `run_scenarios "HEAD"` ahead of
 *   `regression-smoke.sh` meant a single HEAD spec failure aborted the
 *   script BEFORE the smoke (vision-pipeline trust anchor) ever ran. The
 *   alarm was silenced precisely when it mattered most — when HEAD was
 *   misbehaving.
 *
 * BLD-1023 update:
 *   The script no longer reads a static PNG from
 *   `tests/fixtures/regression-catcher/bld-480-pre-fix.png`. Instead it
 *   runs `e2e/scenarios/completed-workout-prefix.spec.ts` against a
 *   dev-only Expo Router route, capturing
 *   `.pixelslop/screenshots/scenarios/bld-480-prefix/mobile.png` on
 *   every audit run, and feeds THAT into `regression-smoke.sh`.
 *
 *   The `playwright test` stub below now writes the wrapper-fixture
 *   capture into the expected scenarios subdir whenever it sees the
 *   prefix spec on its argv.
 *
 * Acceptance criteria:
 *   AC1. HEAD scenario fails → regression-smoke.sh STILL executes
 *   AC2. Smoke fails → audit aborts non-zero with smoke RC (preserved)
 *   AC3. HEAD fails AND smoke fails → smoke RC dominates
 *   AC4. Full success → exit 0, no regression
 *   AC5 (BLD-1023). When the prefix-fixture spec fails AND no capture
 *        was produced, audit aborts with the prefix-spec RC (smoke can't
 *        run without a capture) — the script must NOT silently fall back
 *        to a stale PNG.
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
 *   - e2e/scenarios/                 (placeholder + prefix spec so `find`
 *                                     in daily-audit.sh discovers them)
 *   - bin/npx, bin/git               (stubs)
 *   - .pixelslop/                    (writable output dir)
 *
 * Returns the sandbox dir and a runner. Optional `dropPrefixCapture`
 * makes the npx stub skip writing the wrapper-fixture capture so we can
 * exercise AC5 (capture missing → audit aborts before smoke).
 */
function buildSandbox(opts: {
  headExitCode: number;
  prefixExitCode?: number;
  smokeExitCode: number;
  dropPrefixCapture?: boolean;
  /** Pass AUDIT_ALLOW_NO_VISION_KEY=1 into the daily-audit.sh environment (BLD-3039). */
  allowNoVisionKey?: boolean;
}): { dir: string; run: () => RunResult } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bld-1023-"));

  // Layout
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(dir, "e2e", "scenarios"), { recursive: true });
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

  // Stub install-playwright-browsers.sh — daily-audit.sh invokes it before
  // build_static_bundle (BLD-1631). The real installer downloads ~100 MiB
  // of Chromium and is irrelevant to the set-e ordering this test exercises.
  // A no-op stub keeps the rest of daily-audit's control flow intact.
  fs.writeFileSync(
    path.join(dir, "scripts", "install-playwright-browsers.sh"),
    "#!/usr/bin/env bash\necho '[install-playwright-stub] noop' >&2\nexit 0\n",
  );
  fs.chmodSync(path.join(dir, "scripts", "install-playwright-browsers.sh"), 0o755);

  // Stub inject-audit-fonts.mjs — daily-audit.sh's build_static_bundle invokes
  // it after `expo export` to make text render in the fontless audit container
  // (BLD-2586). The real injector reads e2e/assets/fonts/audit-latin.woff2 and
  // patches dist/index.html; neither is relevant to the set-e ordering this
  // test exercises. A no-op stub keeps daily-audit's control flow intact
  // without shipping the font fixture into the sandbox.
  fs.writeFileSync(
    path.join(dir, "scripts", "inject-audit-fonts.mjs"),
    "#!/usr/bin/env node\nconsole.error('[inject-audit-fonts-stub] noop');\n",
  );
  fs.chmodSync(path.join(dir, "scripts", "inject-audit-fonts.mjs"), 0o755);

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

  // Placeholder HEAD specs + the BLD-480 prefix spec, so daily-audit's
  // `find e2e/scenarios -name "*.spec.ts"` discovers both buckets and the
  // exclusion logic actually has something to exclude.
  fs.writeFileSync(
    path.join(dir, "e2e", "scenarios", "completed-workout.spec.ts"),
    "// placeholder for sandbox\n",
  );
  fs.writeFileSync(
    path.join(dir, "e2e", "scenarios", "completed-workout-prefix.spec.ts"),
    "// placeholder for sandbox\n",
  );

  // Stub `git` — only the calls daily-audit.sh actually makes:
  //   rev-parse HEAD (cleanup logic was removed in BLD-1023, so no more
  //   reset/clean/checkout).
  const gitStub = `#!/usr/bin/env bash
case "$1 \${2:-}" in
  "rev-parse HEAD")            echo "deadbeefcafebabe1234567890abcdef00000000" ;;
  "rev-parse --abbrev-ref")    echo "test-branch" ;;
  *)                           : ;;  # success no-op
esac
exit 0
`;
  fs.writeFileSync(path.join(dir, "bin", "git"), gitStub);
  fs.chmodSync(path.join(dir, "bin", "git"), 0o755);

  // Stub `npx` — used by both \`build_static_bundle\` (\`expo export\`)
  // and \`run_scenarios\` (\`playwright test\`). Behaviour:
  //   - \`expo export -p web …\` → must always succeed and produce
  //     \`dist/index.html\`, otherwise build_static_bundle aborts before
  //     scenarios + smoke run (regressing the BLD-966 contract).
  //   - \`playwright test … completed-workout-prefix.spec.ts …\` (BLD-1023)
  //     honors PREFIX_EXIT_CODE, and (unless DROP_PREFIX_CAPTURE=1) writes
  //     the wrapper-fixture capture so the smoke step has something to feed.
  //   - \`playwright test …\` (any other invocation) honors HEAD_EXIT_CODE
  //     and writes a placeholder HEAD capture.
  const npxStub = `#!/usr/bin/env bash
echo "[npx-stub] $*" >&2
case " $* " in
  *" expo export "*)
    mkdir -p dist
    echo "<!doctype html><html><body>stub bundle</body></html>" > dist/index.html
    exit 0
    ;;
  *" playwright test "*)
    if printf '%s\\n' "$@" | grep -q completed-workout-prefix.spec.ts; then
      if [[ "\${DROP_PREFIX_CAPTURE:-0}" != "1" ]]; then
        mkdir -p .pixelslop/screenshots/scenarios/bld-480-prefix
        echo "fake prefix capture" > .pixelslop/screenshots/scenarios/bld-480-prefix/mobile.png
      fi
      exit \${PREFIX_EXIT_CODE:-0}
    fi
    mkdir -p .pixelslop/screenshots/scenarios/fake-scenario
    echo "fake png bytes" > .pixelslop/screenshots/scenarios/fake-scenario/mobile.png
    exit \${HEAD_EXIT_CODE:-0}
    ;;
  *)
    exit 0
    ;;
esac
`;
  fs.writeFileSync(path.join(dir, "bin", "npx"), npxStub);
  fs.chmodSync(path.join(dir, "bin", "npx"), 0o755);

  const run = (): RunResult => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: `${path.join(dir, "bin")}:${process.env.PATH}`,
      HEAD_EXIT_CODE: String(opts.headExitCode),
      PREFIX_EXIT_CODE: String(opts.prefixExitCode ?? 0),
      SMOKE_EXIT_CODE: String(opts.smokeExitCode),
      DROP_PREFIX_CAPTURE: opts.dropPrefixCapture ? "1" : "0",
      ...(opts.allowNoVisionKey ? { AUDIT_ALLOW_NO_VISION_KEY: "1" } : {}),
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

describe("daily-audit.sh — BLD-966 set -e ordering + BLD-1023 wrapper-fixture", () => {
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

  it("AC5 (BLD-1023): prefix-fixture spec fails AND no capture → audit aborts with prefix RC, smoke skipped", () => {
    const { dir, run } = buildSandbox({
      headExitCode: 0,
      prefixExitCode: 5,
      smokeExitCode: 0,
      dropPrefixCapture: true,
    });
    try {
      const r = run();
      // Prefix RC propagates — the script can't run smoke without a capture.
      expect(r.status).toBe(5);
      // Operator-readable diagnostic must mention the missing capture.
      expect(r.combined).toMatch(/pre-fix fixture capture missing/);
      // Smoke MUST NOT have been invoked (no capture to feed it).
      expect(r.combined).not.toContain("[smoke-stub] called with:");
    } finally {
      cleanup(dir);
    }
  });

  it("AC1+AC5 boundary: prefix spec FAILED but capture written → smoke still runs", () => {
    // If Playwright reports failure but produced a capture (e.g. one of the
    // CVD variants flaked but baseline succeeded), the smoke trust-anchor
    // can still run on the baseline — that matches the BLD-966 spirit
    // (don't silence the alarm just because a non-trust-anchor spec
    // misbehaved).
    const { dir, run } = buildSandbox({
      headExitCode: 0,
      prefixExitCode: 1,
      smokeExitCode: 0,
      dropPrefixCapture: false,
    });
    try {
      const r = run();
      // Prefix RC propagates because smoke passed but prefix failed.
      expect(r.status).toBe(1);
      // Smoke must have been invoked.
      expect(r.combined).toContain("[smoke-stub] called with:");
      // Diagnostic message about prefix-failed-but-smoke-passed.
      expect(r.combined).toMatch(/pre-fix fixture spec failed.*smoke PASSED/);
    } finally {
      cleanup(dir);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // BLD-3039: distinguish "no vision key" (exit 4) from "pipeline degraded"
  // ──────────────────────────────────────────────────────────────────────────

  it("AC6 (BLD-3039): smokeRC=4 + AUDIT_ALLOW_NO_VISION_KEY=1 → exit 0, SKIPPED banner, no PASS", () => {
    const { dir, run } = buildSandbox({
      headExitCode: 0,
      smokeExitCode: 4,
      allowNoVisionKey: true,
    });
    try {
      const r = run();
      // Audit should complete successfully (capture ran, anchor was skipped).
      expect(r.status).toBe(0);
      // Must print SKIPPED/UNVERIFIED status — never PASS.
      expect(r.combined).toContain("regression-smoke: SKIPPED (UNVERIFIED — no vision key)");
      expect(r.combined).not.toContain("regression-smoke: PASS");
      // Must emit the loud SKIPPED/UNVERIFIED warning banner.
      expect(r.combined).toMatch(/SKIPPED.*no vision API key|UNVERIFIED/i);
    } finally {
      cleanup(dir);
    }
  });

  it("AC7 (BLD-3039): smokeRC=4 WITHOUT flag → exit 4, names missing keys, mentions opt-in, no 'degraded' wording", () => {
    const { dir, run } = buildSandbox({
      headExitCode: 0,
      smokeExitCode: 4,
      allowNoVisionKey: false,
    });
    try {
      const r = run();
      // Must abort with the smoke's exit code (4).
      expect(r.status).toBe(4);
      // Must name the missing keys.
      expect(r.combined).toMatch(/ANTHROPIC_API_KEY|OPENAI_API_KEY/);
      // Must mention the sandbox opt-in.
      expect(r.combined).toContain("AUDIT_ALLOW_NO_VISION_KEY");
      // Must NOT use "vision pipeline degraded" / "silent degradation" wording
      // (that message is reserved for the real alarm, RC 2).
      expect(r.combined).not.toMatch(/vision.pipeline.*(degrad|silent)/i);
    } finally {
      cleanup(dir);
    }
  });

  it("AC8 (BLD-3039): smokeRC=2 (real degradation) → unchanged: exit 2, FAILED/trust-anchor message", () => {
    const { dir, run } = buildSandbox({
      headExitCode: 0,
      smokeExitCode: 2,
    });
    try {
      const r = run();
      expect(r.status).toBe(2);
      expect(r.combined).toMatch(/regression-smoke FAILED|trust anchor/);
      // SKIPPED wording must NOT appear on the real-degradation path.
      expect(r.combined).not.toContain("SKIPPED");
    } finally {
      cleanup(dir);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // BLD-3047: Direct exit-4 unit test running the REAL scripts/regression-smoke.sh
  // ──────────────────────────────────────────────────────────────────────────

  it("regression-smoke.sh unit: exits 4 with clean error message when no vision API key is configured", () => {
    const REGRESSION_SMOKE = path.join(REPO_ROOT, "scripts", "regression-smoke.sh");
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bld-3047-"));
    const tempPng = path.join(tempDir, "fixture.png");
    fs.writeFileSync(tempPng, "fake png bytes");

    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    delete env.OPENAI_API_KEY;
    delete env.API_PROVIDER;

    try {
      const proc = spawnSync("bash", [REGRESSION_SMOKE, tempPng], {
        env,
        encoding: "utf8",
      });

      expect(proc.status).toBe(4);
      expect(proc.stderr).toContain("no vision API key configured");
      expect(proc.stderr).toContain("AUDIT_ALLOW_NO_VISION_KEY=1");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("regression-smoke.sh unit: exits 3 if fixture PNG is missing", () => {
    const REGRESSION_SMOKE = path.join(REPO_ROOT, "scripts", "regression-smoke.sh");
    const missingPng = path.join(os.tmpdir(), "nonexistent-fixture-bld-3047.png");

    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    delete env.OPENAI_API_KEY;
    delete env.API_PROVIDER;

    const proc = spawnSync("bash", [REGRESSION_SMOKE, missingPng], {
      env,
      encoding: "utf8",
    });

    expect(proc.status).toBe(3);
    expect(proc.stderr).toContain("fixture not found");
  });
});
