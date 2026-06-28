/**
 * BLD-2109 — audit-handoff.sh: Daily AUDIT issue must end each run assigned
 * to ux-designer with status=in_review (NOT backlog) so the assignment-wake
 * fires.
 *
 * ## Background
 * BLD-2106 (AUDIT 2026-06-28) was left in backlog assigned to ux-designer.
 * The Paperclip server's `queueIssueAssignmentWakeup` deliberately skips
 * backlog issues, so ux-designer was never woken. The root cause was the
 * status transition being a manual prose step that was silently skipped.
 *
 * The fix (this script) bakes the create+transition into a single idempotent
 * helper so the status-advance is code, not prose.
 *
 * ## Auth-boundary ordering asserted here
 * The clip.sh stub tracks the call sequence so we can assert that:
 *   1. create-issue was called with assigneeAgentId = CREATING_AGENT (not ux-designer)
 *   2. update-issue was called in a single PATCH with BOTH status=in_review
 *      AND assigneeAgentId=ux-designer
 *
 * If the test stub received create-issue with assigneeAgentId=ux-designer, a
 * real Paperclip server would assign the issue to ux-designer first, and the
 * subsequent PATCH would be denied (403) because claudecoder ≠ ux-designer.
 *
 * ## Acceptance Criteria (from BLD-2109)
 *   AC1: Normal run → end state is assigneeAgentId=ux-designer + status=in_review
 *   AC2: Partial failure (capture/upload) → NEVER status=backlog
 *   AC3: PATCH failure → exit non-zero (loud failure, not silent backlog)
 *   AC4: Issue already in_review or further → no-op, exit 0
 *   AC5: PATCH call ordering → create with creating-agent; PATCH switches
 *        BOTH status and assignee in one call
 *
 * Refs: BLD-2109, BLD-2107, BLD-2105.
 */
import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const AUDIT_HANDOFF = path.join(REPO_ROOT, "scripts", "audit-handoff.sh");
const STUB_DIR = path.join(__dirname, "fixtures", "audit-handoff-stubs");

// UX designer agent ID used in the script (matches the constant in audit-handoff.sh).
const UX_DESIGNER_AGENT_ID = "f3ca8bb9-5d5b-45ac-9bd3-f06118059cf4";
// Creating agent ID (claudecoder default in the script).
const CREATING_AGENT_ID = "b467dac6-f460-43be-98cf-004496d36b67";

interface ClipIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  status: string;
  assigneeAgentId: string;
  priority?: string;
}

interface ClipState {
  issues: ClipIssue[];
  nextIdentifier: string;
  nextId: string;
}

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  combined: string;
}

function buildSandbox(opts: {
  initialState?: Partial<ClipState>;
  createFail?: boolean;
  patchFail?: boolean;
  patchHttpErr?: string;
  getFail?: boolean;
  trackCalls?: boolean;
}): {
  dir: string;
  run: (args?: string[], extraEnv?: Record<string, string>) => RunResult;
  readState: () => ClipState;
  readCallLog: () => string[];
  callLogPath: string;
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bld-2109-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });

  // Copy the real script under test.
  fs.copyFileSync(AUDIT_HANDOFF, path.join(dir, "scripts", "audit-handoff.sh"));
  fs.chmodSync(path.join(dir, "scripts", "audit-handoff.sh"), 0o755);

  // Copy the stub clip.sh.
  fs.copyFileSync(
    path.join(STUB_DIR, "clip.sh"),
    path.join(dir, "scripts", "clip.sh"),
  );
  fs.chmodSync(path.join(dir, "scripts", "clip.sh"), 0o755);

  const statePath = path.join(dir, "state.json");
  const initialState: ClipState = {
    issues: [],
    nextIdentifier: "BLD-9001",
    nextId: "issue-stub-001",
    ...opts.initialState,
  };
  fs.writeFileSync(statePath, JSON.stringify(initialState, null, 2));

  const callLogPath = path.join(dir, "call-log.txt");

  const run = (
    args: string[] = ["--title", "AUDIT 2026-06-28 — Visual UX Review"],
    extraEnv: Record<string, string> = {},
  ): RunResult => {
    const env = {
      ...process.env,
      STUB_CLIP_STATE: statePath,
      STUB_CLIP_CREATE_FAIL: opts.createFail ? "1" : "0",
      STUB_CLIP_PATCH_FAIL: opts.patchFail ? "1" : "0",
      STUB_CLIP_GET_FAIL: opts.getFail ? "1" : "0",
      STUB_CLIP_PATCH_HTTP_ERR: opts.patchHttpErr ?? "",
      STUB_CLIP_TRACK_CALLS: opts.trackCalls ? "1" : "0",
      STUB_CLIP_CALL_LOG: callLogPath,
      // Point the script at our stub clip.sh.
      CLIP: path.join(dir, "scripts", "clip.sh"),
      // Override agent IDs so tests are deterministic.
      CREATING_AGENT_ID,
      UX_DESIGNER_AGENT_ID,
      ...extraEnv,
    };
    const proc = spawnSync(
      "bash",
      [path.join(dir, "scripts", "audit-handoff.sh"), ...args],
      {
        cwd: dir,
        env,
        encoding: "utf8",
        timeout: 15_000,
      },
    );
    return {
      status: proc.status,
      stdout: proc.stdout || "",
      stderr: proc.stderr || "",
      combined: (proc.stdout || "") + (proc.stderr || ""),
    };
  };

  const readState = (): ClipState =>
    JSON.parse(fs.readFileSync(statePath, "utf8")) as ClipState;

  const readCallLog = (): string[] => {
    if (!fs.existsSync(callLogPath)) return [];
    return fs
      .readFileSync(callLogPath, "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "");
  };

  return { dir, run, readState, readCallLog, callLogPath };
}

function cleanup(dir: string) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

// Skip the suite if jq is unavailable (the clip.sh stub depends on it).
const HAS_JQ = (() => {
  const r = spawnSync("jq", ["--version"], { encoding: "utf8" });
  return r.status === 0;
})();

const d = HAS_JQ ? describe : describe.skip;

d("audit-handoff.sh — BLD-2109", () => {
  it("real script passes bash -n syntax check", () => {
    expect(() =>
      execFileSync("bash", ["-n", AUDIT_HANDOFF], { encoding: "utf8" }),
    ).not.toThrow();
  });

  it("clip.sh stub passes bash -n syntax check", () => {
    expect(() =>
      execFileSync(
        "bash",
        ["-n", path.join(STUB_DIR, "clip.sh")],
        { encoding: "utf8" },
      ),
    ).not.toThrow();
  });

  describe("AC1: happy path — end state is in_review assigned to ux-designer", () => {
    it("exits 0", () => {
      const { dir, run } = buildSandbox({});
      try {
        const r = run();
        expect(r.status).toBe(0);
      } finally {
        cleanup(dir);
      }
    });

    it("issue ends with status=in_review", () => {
      const { dir, run, readState } = buildSandbox({});
      try {
        run();
        const state = readState();
        expect(state.issues).toHaveLength(1);
        expect(state.issues[0].status).toBe("in_review");
      } finally {
        cleanup(dir);
      }
    });

    it("issue ends with assigneeAgentId=ux-designer", () => {
      const { dir, run, readState } = buildSandbox({});
      try {
        run();
        const state = readState();
        expect(state.issues[0].assigneeAgentId).toBe(UX_DESIGNER_AGENT_ID);
      } finally {
        cleanup(dir);
      }
    });

    it("issue is NEVER left in backlog", () => {
      const { dir, run, readState } = buildSandbox({});
      try {
        run();
        const state = readState();
        expect(state.issues[0].status).not.toBe("backlog");
      } finally {
        cleanup(dir);
      }
    });
  });

  describe("AC5: auth-boundary ordering — create with creating-agent, single PATCH for both status+assignee", () => {
    it("create-issue is called with assigneeAgentId=CREATING_AGENT (not ux-designer)", () => {
      const { dir, run, readCallLog } = buildSandbox({ trackCalls: true });
      try {
        run();
        const calls = readCallLog();
        const createCall = calls.find((c) => c.startsWith("create-issue"));
        expect(createCall).toBeDefined();
        // The create call must include the creating agent's ID, not ux-designer.
        expect(createCall).toContain(CREATING_AGENT_ID);
        expect(createCall).not.toContain(UX_DESIGNER_AGENT_ID);
      } finally {
        cleanup(dir);
      }
    });

    it("update-issue PATCH carries BOTH status=in_review AND assigneeAgentId=ux-designer", () => {
      const { dir, run, readCallLog } = buildSandbox({ trackCalls: true });
      try {
        run();
        const calls = readCallLog();
        // There should be exactly one update-issue call and it must set both fields.
        const patchCalls = calls.filter((c) => c.startsWith("update-issue"));
        expect(patchCalls).toHaveLength(1);
        expect(patchCalls[0]).toContain("--status");
        expect(patchCalls[0]).toContain("in_review");
        expect(patchCalls[0]).toContain("--assignee-agent-id");
        expect(patchCalls[0]).toContain(UX_DESIGNER_AGENT_ID);
      } finally {
        cleanup(dir);
      }
    });

    it("create-issue call happens BEFORE update-issue call (ordering invariant)", () => {
      const { dir, run, readCallLog } = buildSandbox({ trackCalls: true });
      try {
        run();
        const calls = readCallLog();
        const createIdx = calls.findIndex((c) => c.startsWith("create-issue"));
        const patchIdx = calls.findIndex((c) => c.startsWith("update-issue"));
        expect(createIdx).toBeGreaterThanOrEqual(0);
        expect(patchIdx).toBeGreaterThan(createIdx);
      } finally {
        cleanup(dir);
      }
    });
  });

  describe("AC2: partial failure — NEVER leaves backlog", () => {
    it("--capture-failed: issue still ends in_review assigned to ux-designer", () => {
      const { dir, run, readState } = buildSandbox({});
      try {
        const r = run([
          "--title",
          "AUDIT 2026-06-28 — Visual UX Review",
          "--capture-failed",
        ]);
        expect(r.status).toBe(0);
        const state = readState();
        expect(state.issues[0].status).toBe("in_review");
        expect(state.issues[0].assigneeAgentId).toBe(UX_DESIGNER_AGENT_ID);
        expect(state.issues[0].status).not.toBe("backlog");
      } finally {
        cleanup(dir);
      }
    });

    it("--upload-failed: issue still ends in_review assigned to ux-designer", () => {
      const { dir, run, readState } = buildSandbox({});
      try {
        const r = run([
          "--title",
          "AUDIT 2026-06-28 — Visual UX Review",
          "--upload-failed",
        ]);
        expect(r.status).toBe(0);
        const state = readState();
        expect(state.issues[0].status).toBe("in_review");
        expect(state.issues[0].assigneeAgentId).toBe(UX_DESIGNER_AGENT_ID);
        expect(state.issues[0].status).not.toBe("backlog");
      } finally {
        cleanup(dir);
      }
    });

    it("--capture-failed --upload-failed: issue still not in backlog", () => {
      const { dir, run, readState } = buildSandbox({});
      try {
        const r = run([
          "--title",
          "AUDIT 2026-06-28 — Visual UX Review",
          "--capture-failed",
          "--upload-failed",
        ]);
        expect(r.status).toBe(0);
        const state = readState();
        expect(state.issues[0].status).not.toBe("backlog");
        expect(state.issues[0].assigneeAgentId).toBe(UX_DESIGNER_AGENT_ID);
      } finally {
        cleanup(dir);
      }
    });
  });

  describe("AC3: PATCH failure → exits loudly (non-zero), never silently leaves backlog", () => {
    it("PATCH fail → exit code 3 (not 0)", () => {
      const { dir, run } = buildSandbox({ patchFail: true });
      try {
        const r = run();
        expect(r.status).toBe(3);
      } finally {
        cleanup(dir);
      }
    });

    it("PATCH fail → stderr mentions FATAL and ACTION REQUIRED", () => {
      const { dir, run } = buildSandbox({ patchFail: true });
      try {
        const r = run();
        expect(r.stderr).toMatch(/FATAL/i);
        expect(r.stderr).toMatch(/ACTION REQUIRED/i);
      } finally {
        cleanup(dir);
      }
    });

    it("PATCH fail → issue status never changed to in_review (still in original state)", () => {
      const { dir, run, readState } = buildSandbox({ patchFail: true });
      try {
        run();
        const state = readState();
        // Issue was created but PATCH failed → status should still be 'todo'
        // (create-issue default), not in_review.
        expect(state.issues[0].status).not.toBe("in_review");
        // And the assignee should still be creating-agent, not ux-designer.
        expect(state.issues[0].assigneeAgentId).toBe(CREATING_AGENT_ID);
      } finally {
        cleanup(dir);
      }
    });

    it("simulated 403 PATCH → exits non-zero and surfaces the HTTP error", () => {
      const { dir, run } = buildSandbox({
        patchFail: true,
        patchHttpErr: "403",
      });
      try {
        const r = run();
        expect(r.status).not.toBe(0);
        expect(r.stderr).toContain("403");
      } finally {
        cleanup(dir);
      }
    });
  });

  describe("AC4: idempotency — issue already ≥ in_review → no-op", () => {
    it("--issue-id pointing to an in_review/ux-designer issue → exits 0, no new mutations", () => {
      const existingIssue: ClipIssue = {
        id: "issue-preexisting-001",
        identifier: "BLD-2106",
        title: "AUDIT 2026-06-27 — Visual UX Review",
        status: "in_review",
        assigneeAgentId: UX_DESIGNER_AGENT_ID,
      };
      const { dir, run, readState } = buildSandbox({
        initialState: { issues: [existingIssue], nextIdentifier: "BLD-9001", nextId: "issue-stub-002" },
        trackCalls: false,
      });
      try {
        const r = run([
          "--title",
          "AUDIT 2026-06-27 — Visual UX Review",
          "--issue-id",
          "BLD-2106",
        ]);
        expect(r.status).toBe(0);
        // State must be unchanged — no new issues, no status change.
        const state = readState();
        expect(state.issues).toHaveLength(1);
        expect(state.issues[0].status).toBe("in_review");
        expect(state.issues[0].assigneeAgentId).toBe(UX_DESIGNER_AGENT_ID);
      } finally {
        cleanup(dir);
      }
    });

    it("--issue-id pointing to a done issue (ux-designer already finished) → no-op", () => {
      const existingIssue: ClipIssue = {
        id: "issue-preexisting-002",
        identifier: "BLD-2106",
        title: "AUDIT prior",
        status: "done",
        assigneeAgentId: UX_DESIGNER_AGENT_ID,
      };
      const { dir, run, readState } = buildSandbox({
        initialState: { issues: [existingIssue], nextIdentifier: "BLD-9001", nextId: "issue-stub-003" },
      });
      try {
        const r = run([
          "--title",
          "AUDIT prior",
          "--issue-id",
          "BLD-2106",
        ]);
        expect(r.status).toBe(0);
        // No status regression — must remain done.
        const state = readState();
        expect(state.issues[0].status).toBe("done");
      } finally {
        cleanup(dir);
      }
    });

    it("--issue-id pointing to a backlog/todo issue → still applies the transition", () => {
      const existingIssue: ClipIssue = {
        id: "issue-preexisting-003",
        identifier: "BLD-2106",
        title: "AUDIT prior",
        status: "todo",
        assigneeAgentId: CREATING_AGENT_ID,
      };
      const { dir, run, readState } = buildSandbox({
        initialState: { issues: [existingIssue], nextIdentifier: "BLD-9001", nextId: "issue-stub-004" },
      });
      try {
        const r = run([
          "--title",
          "AUDIT prior",
          "--issue-id",
          "BLD-2106",
        ]);
        expect(r.status).toBe(0);
        const state = readState();
        expect(state.issues[0].status).toBe("in_review");
        expect(state.issues[0].assigneeAgentId).toBe(UX_DESIGNER_AGENT_ID);
      } finally {
        cleanup(dir);
      }
    });
  });

  describe("usage errors", () => {
    it("exits 1 when --title is missing", () => {
      const { dir, run } = buildSandbox({});
      try {
        const r = run([]);
        expect(r.status).toBe(1);
      } finally {
        cleanup(dir);
      }
    });

    it("exits 2 when create-issue fails", () => {
      const { dir, run } = buildSandbox({ createFail: true });
      try {
        const r = run();
        expect(r.status).toBe(2);
      } finally {
        cleanup(dir);
      }
    });
  });
});
