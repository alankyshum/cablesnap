/**
 * BLD-950 — audit-bundle.sh: idempotent re-runs on the same audit date
 * must succeed without manual `-v2` tag suffixes.
 *
 * Pre-fix bug:
 *   1st run: `gh release create $TAG asset.zip --prerelease` → release was
 *   created BEFORE asset finished uploading. If upload was interrupted (or
 *   GitHub flagged the release as "latest" → immutable), the retry path
 *   `gh release upload --clobber` failed with "Cannot delete asset from an
 *   immutable release". Operator had to manually re-tag with `-v2` suffix
 *   (claudecoder workaround on 2026-05-02, see BLD-947).
 *
 * Fix strategy (draft-first):
 *   1. Create release as DRAFT (drafts are mutable — no immutability race).
 *   2. Upload assets with --clobber.
 *   3. Publish the draft (`gh release edit --draft=false`) only after
 *      assets are present.
 *   On re-run with same TAG, an existing release reuses --clobber upload;
 *   if that hits "immutable", fall back to a unique HHMMSS tag suffix.
 *
 * Acceptance criteria from BLD-950:
 *   AC1: Partial first run that created a release → re-run succeeds without
 *        manual intervention.
 *   AC2: Fully successful run → exactly one release exists with all expected
 *        assets attached.
 *   AC3: No regression in the daily-audit happy path (single clean run).
 *
 * Strategy: drive the REAL `scripts/audit-bundle.sh` against a sandbox
 * where `gh`, `git`, and `zip` are stubbed by binaries earlier on PATH.
 * The `gh` stub keeps state in a JSON file so we can simulate "release
 * exists from prior run", "release is immutable", etc., and then assert
 * on the final state. Stub sources live in
 * `scripts/__tests__/fixtures/audit-bundle-stubs/` for readability.
 */
import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const AUDIT_BUNDLE = path.join(REPO_ROOT, "scripts", "audit-bundle.sh");
const STUB_DIR = path.join(__dirname, "fixtures", "audit-bundle-stubs");

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  combined: string;
}

interface GhRelease {
  tagName: string;
  draft: boolean;
  prerelease: boolean;
  immutable: boolean; // simulated GitHub flag
  assets: string[]; // basenames of uploaded assets
  createdAt: string;
}

interface GhState {
  releases: GhRelease[];
}

function buildSandbox(opts: {
  initialState?: GhState;
  uploadFailMode?: "none" | "immutable-on-clobber" | "always-fail";
}): { dir: string; run: () => RunResult; readState: () => GhState } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bld-950-"));

  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(dir, "bin"), { recursive: true });
  fs.mkdirSync(
    path.join(dir, ".pixelslop", "screenshots", "scenarios", "scenario-a"),
    { recursive: true },
  );

  // Real script under test.
  fs.copyFileSync(AUDIT_BUNDLE, path.join(dir, "scripts", "audit-bundle.sh"));
  fs.chmodSync(path.join(dir, "scripts", "audit-bundle.sh"), 0o755);

  // Minimal scenario asset so zip has something to bundle.
  fs.writeFileSync(
    path.join(dir, ".pixelslop/screenshots/scenarios/scenario-a/mobile.png"),
    "fake-png-bytes",
  );
  fs.writeFileSync(
    path.join(dir, ".pixelslop/screenshots/scenarios/scenario-a/mobile.json"),
    "{}",
  );

  // Initial gh state.
  const statePath = path.join(dir, "state.json");
  const initialState: GhState = opts.initialState ?? { releases: [] };
  fs.writeFileSync(statePath, JSON.stringify(initialState, null, 2));

  // Install stub binaries (sourced from fixtures dir).
  for (const name of ["gh", "git", "zip"]) {
    const dest = path.join(dir, "bin", name);
    fs.copyFileSync(path.join(STUB_DIR, `${name}.sh`), dest);
    fs.chmodSync(dest, 0o755);
  }

  const run = (): RunResult => {
    const env = {
      ...process.env,
      // Put our stubs first; keep system PATH for jq/bash/date/mapfile.
      PATH: `${path.join(dir, "bin")}:${process.env.PATH}`,
      // Avoid the script auto-pointing at /paperclip's gh config.
      GH_CONFIG_DIR: path.join(dir, "gh-config"),
      // Stub configuration, read by bin/gh.
      STUB_GH_STATE: statePath,
      STUB_GH_UPLOAD_FAIL_MODE: opts.uploadFailMode ?? "none",
    };
    const proc = spawnSync(
      "bash",
      [path.join(dir, "scripts", "audit-bundle.sh")],
      {
        cwd: dir,
        env,
        encoding: "utf8",
        timeout: 30_000,
      },
    );
    return {
      status: proc.status,
      stdout: proc.stdout || "",
      stderr: proc.stderr || "",
      combined: (proc.stdout || "") + (proc.stderr || ""),
    };
  };

  const readState = (): GhState =>
    JSON.parse(fs.readFileSync(statePath, "utf8")) as GhState;

  return { dir, run, readState };
}

function cleanup(dir: string) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

// Skip the suite if jq is unavailable (the gh stub depends on it). jq is
// present in the project's CI image and dev sandbox, but not on every
// developer machine.
const HAS_JQ = (() => {
  const r = spawnSync("jq", ["--version"], { encoding: "utf8" });
  return r.status === 0;
})();
const d = HAS_JQ ? describe : describe.skip;

d("audit-bundle.sh — BLD-950 idempotent re-run", () => {
  it("real script passes bash -n syntax check", () => {
    expect(() =>
      execFileSync("bash", ["-n", AUDIT_BUNDLE], { encoding: "utf8" }),
    ).not.toThrow();
  });

  it("AC3: clean first run → single published release with asset attached", () => {
    const { dir, run, readState } = buildSandbox({});
    try {
      const r = run();
      expect(r.status).toBe(0);
      const state = readState();
      const audits = state.releases.filter((rel) =>
        rel.tagName.startsWith("audit-"),
      );
      expect(audits).toHaveLength(1);
      expect(audits[0].draft).toBe(false); // published, not draft
      expect(audits[0].prerelease).toBe(true);
      expect(audits[0].assets).toContain(`${audits[0].tagName}.zip`);
    } finally {
      cleanup(dir);
    }
  });

  it("AC1a: re-run after partial draft → publishes successfully (no -v2 suffix needed)", () => {
    // Simulate: prior run created the draft + uploaded asset, then died
    // before flipping --draft=false.
    const today = new Date().toISOString().slice(0, 10);
    const tag = `audit-${today}-deadbee`;
    const { dir, run, readState } = buildSandbox({
      initialState: {
        releases: [
          {
            tagName: tag,
            draft: true,
            prerelease: true,
            immutable: false,
            assets: [`${tag}.zip`],
            createdAt: "2026-05-02T11:00:00Z",
          },
        ],
      },
    });
    try {
      const r = run();
      expect(r.status).toBe(0);
      const state = readState();
      const matches = state.releases.filter((rel) => rel.tagName === tag);
      // Exactly one release with this tag — no -v2 suffix proliferation.
      expect(matches).toHaveLength(1);
      // Asset is still attached.
      expect(matches[0].assets).toContain(`${tag}.zip`);
    } finally {
      cleanup(dir);
    }
  });

  it("AC1b: re-run hits immutable published release → falls back to unique tag suffix (no manual -v2)", () => {
    // Simulate the BLD-947 scenario: prior run published the release; GitHub
    // flagged it immutable (latest release); --clobber upload now fails.
    const today = new Date().toISOString().slice(0, 10);
    const tag = `audit-${today}-deadbee`;
    const { dir, run, readState } = buildSandbox({
      initialState: {
        releases: [
          {
            tagName: tag,
            draft: false,
            prerelease: true,
            immutable: true, // GitHub: cannot delete assets
            assets: [`${tag}.zip`],
            createdAt: "2026-05-02T11:00:00Z",
          },
        ],
      },
      uploadFailMode: "immutable-on-clobber",
    });
    try {
      const r = run();
      expect(r.status).toBe(0); // re-run succeeds without manual intervention
      const state = readState();
      const audits = state.releases.filter((rel) =>
        rel.tagName.startsWith("audit-"),
      );
      // Original release is preserved + a new unique-suffixed release exists.
      expect(audits.length).toBeGreaterThanOrEqual(2);
      const suffixed = audits.find(
        (rel) => rel.tagName !== tag && rel.tagName.startsWith(tag + "-"),
      );
      expect(suffixed).toBeDefined();
      expect(suffixed!.draft).toBe(false);
      expect(suffixed!.assets).toContain(`${suffixed!.tagName}.zip`);
      // Sanity: human-readable warning appeared.
      expect(r.combined).toMatch(/immutable.*falling back to unique tag/i);
    } finally {
      cleanup(dir);
    }
  });

  it("AC2: full success path attaches exactly one asset to the published release", () => {
    const { dir, run, readState } = buildSandbox({});
    try {
      const r = run();
      expect(r.status).toBe(0);
      const audits = readState().releases.filter((rel) =>
        rel.tagName.startsWith("audit-"),
      );
      expect(audits).toHaveLength(1);
      // No duplicate uploads — exactly one asset basename.
      expect(audits[0].assets).toEqual([`${audits[0].tagName}.zip`]);
    } finally {
      cleanup(dir);
    }
  });

  it("non-immutable upload failure (e.g., transient network) is NOT silently suffixed", () => {
    // Important: only the SPECIFIC immutability error triggers the unique-tag
    // fallback. Other failures must propagate as a non-zero exit so the
    // operator notices.
    const today = new Date().toISOString().slice(0, 10);
    const tag = `audit-${today}-deadbee`;
    const { dir, run } = buildSandbox({
      initialState: {
        releases: [
          {
            tagName: tag,
            draft: false,
            prerelease: true,
            immutable: false,
            assets: [`${tag}.zip`],
            createdAt: "2026-05-02T11:00:00Z",
          },
        ],
      },
      uploadFailMode: "always-fail",
    });
    try {
      const r = run();
      expect(r.status).not.toBe(0);
      // Should NOT silently suffix.
      expect(r.combined).not.toMatch(/falling back to unique tag/i);
    } finally {
      cleanup(dir);
    }
  });
});
