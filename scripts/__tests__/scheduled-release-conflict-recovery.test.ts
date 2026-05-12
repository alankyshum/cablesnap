/**
 * BLD-1185 — scheduled-release "Commit and push": CHANGELOG conflict recovery
 *
 * Pre-fix bug:
 *   The "Commit and push" step used a naive `git pull --rebase` to recover when
 *   origin/main moved between checkout and push.  When the concurrent merge also
 *   touched CHANGELOG.md (e.g. adding bullets under "## Unreleased"), the rebase
 *   produced an unresolved conflict in CHANGELOG.md and the step exited 1, skipping
 *   the release entirely.
 *
 * Real failure (BLD-1184 / run #25706244979, 2026-05-12T00:51Z):
 *   - workflow checked out f8476b57 → bumped to v0.26.33 (commit 460eed7c)
 *   - BLD-1174 (fbc23d4c) merged mid-window, adding an Unreleased bullet
 *   - push rejected (non-FF), `git pull --rebase` hit CONFLICT in CHANGELOG.md
 *   - v0.26.33 release skipped
 *
 * Fix (scripts/release-push-with-recovery.sh):
 *   On rebase conflict: abort, reset --hard to origin/main, re-apply all version
 *   bumps + CHANGELOG promotion on top, re-commit, retry push.  Any new Unreleased
 *   entries from the concurrent merge are automatically included in the versioned
 *   section.
 *
 * Acceptance criteria tested:
 *   AC1: clean push (no concurrent commits) succeeds on the first attempt.
 *   AC2: CHANGELOG-conflicting concurrent commit → script recovers and pushes.
 *   AC3: concurrent "## Unreleased" entries appear in the v$VERSION CHANGELOG
 *        section after recovery.
 *
 * Strategy: drive scripts/release-push-with-recovery.sh against local bare git
 * repos.  npm is stubbed so `npm run changelog:gen` writes minimal stub artifacts
 * without needing a full Node/tsx toolchain in the sandbox.
 */

import { execFileSync, execSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PUSH_SCRIPT = path.join(
  REPO_ROOT,
  "scripts",
  "release-push-with-recovery.sh",
);

const GIT_ENV = {
  GIT_AUTHOR_NAME: "Test Bot",
  GIT_AUTHOR_EMAIL: "test@test.com",
  GIT_COMMITTER_NAME: "Test Bot",
  GIT_COMMITTER_EMAIL: "test@test.com",
};

/** Minimal CHANGELOG.md — no pre-existing Unreleased items. */
function makeChangelog(): string {
  return [
    "## Unreleased",
    "",
    "## v0.26.33 — 2026-05-11",
    "<!-- versionCode: 26 -->",
    "- prior entry",
    "",
  ].join("\n");
}

/** CHANGELOG as it looks after the workflow bump steps (Unreleased promoted). */
function makeBumpedChangelog(version: string, vcode: string, date: string): string {
  return [
    "## Unreleased",
    "",
    "_No user-facing changes yet._",
    "",
    `## v${version} — ${date}`,
    `<!-- versionCode: ${vcode} -->`,
    "",
    "## v0.26.33 — 2026-05-11",
    "<!-- versionCode: 26 -->",
    "- prior entry",
    "",
  ].join("\n");
}

interface Sandbox {
  sandboxDir: string;
  originDir: string;
  runnerDir: string;
  /** Simulate a concurrent commit landing on origin/main that adds an Unreleased bullet. */
  concurrentCommitToOrigin(bullet: string): void;
  /** Commit the already-modified (bumped) runner files as the release commit. */
  commitReleaseBump(): void;
  /** Run release-push-with-recovery.sh in the runner with the npm stub on PATH. */
  runScript(): { status: number | null; stdout: string; stderr: string };
  cleanup(): void;
}

function buildSandbox(): Sandbox {
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "bld-1185-"));
  const originDir = path.join(sandboxDir, "origin.git");
  const runnerDir = path.join(sandboxDir, "runner");
  const binDir = path.join(sandboxDir, "bin");

  // ---- bare origin ----
  fs.mkdirSync(originDir);
  execSync(`git init --bare "${originDir}"`);

  // ---- initial commit via a temporary work tree ----
  const workDir = path.join(sandboxDir, "work");
  fs.mkdirSync(workDir, { recursive: true });
  fs.mkdirSync(path.join(workDir, "lib"), { recursive: true });
  fs.mkdirSync(
    path.join(
      workDir,
      "fdroid",
      "metadata",
      "com.persoack.cablesnap",
      "en-US",
      "changelogs",
    ),
    { recursive: true },
  );

  fs.writeFileSync(
    path.join(workDir, "package.json"),
    JSON.stringify({ name: "test", version: "0.26.33" }, null, 2) + "\n",
  );
  fs.writeFileSync(
    path.join(workDir, "app.config.ts"),
    'version: "0.26.33", versionCode: 26,\n',
  );
  fs.writeFileSync(path.join(workDir, "CHANGELOG.md"), makeChangelog());
  fs.writeFileSync(
    path.join(
      workDir,
      "fdroid",
      "metadata",
      "com.persoack.cablesnap.yml",
    ),
    "CurrentVersion: 0.26.33\nCurrentVersionCode: 26\n",
  );
  fs.writeFileSync(
    path.join(workDir, "lib", "changelog.generated.ts"),
    "// generated\nexport const version = '0.26.33';\n",
  );
  fs.writeFileSync(
    path.join(
      workDir,
      "fdroid",
      "metadata",
      "com.persoack.cablesnap",
      "en-US",
      "changelogs",
      "26.txt",
    ),
    "prior entry\n",
  );

  execSync(`git init "${workDir}" && git -C "${workDir}" checkout -b main`);
  execSync(`git -C "${workDir}" add -A`, {
    env: { ...process.env, ...GIT_ENV },
  });
  execSync(`git -C "${workDir}" commit -m "initial"`, {
    env: { ...process.env, ...GIT_ENV },
  });
  execSync(
    `git -C "${workDir}" remote add origin "${originDir}" && git -C "${workDir}" push origin main`,
  );
  fs.rmSync(workDir, { recursive: true, force: true });

  // ---- clone to runner (simulates the GH Actions checkout) ----
  execSync(`git clone "${originDir}" "${runnerDir}"`);
  execSync(`git -C "${runnerDir}" config user.name "Test Bot"`);
  execSync(`git -C "${runnerDir}" config user.email "test@test.com"`);
  // Copy the push script into runner's scripts dir
  fs.mkdirSync(path.join(runnerDir, "scripts"), { recursive: true });
  fs.copyFileSync(
    PUSH_SCRIPT,
    path.join(runnerDir, "scripts", "release-push-with-recovery.sh"),
  );
  fs.chmodSync(
    path.join(runnerDir, "scripts", "release-push-with-recovery.sh"),
    0o755,
  );

  // ---- npm stub: simulates `npm run changelog:gen` ----
  // Reads CurrentVersionCode from fdroid metadata to determine the sidecar filename.
  fs.mkdirSync(binDir);
  const npmStub = `#!/usr/bin/env bash
if [ "$1" = "run" ] && [ "$2" = "changelog:gen" ]; then
  # Write stub lib/changelog.generated.ts
  echo "// stub-generated" > lib/changelog.generated.ts
  # Derive versionCode from fdroid metadata and write sidecar
  VCODE_VAL=$(grep 'CurrentVersionCode' fdroid/metadata/com.persoack.cablesnap.yml | awk '{print $2}')
  mkdir -p "fdroid/metadata/com.persoack.cablesnap/en-US/changelogs"
  echo "stub" > "fdroid/metadata/com.persoack.cablesnap/en-US/changelogs/\${VCODE_VAL}.txt"
  exit 0
fi
exec /usr/bin/npm "$@"
`;
  const npmStubPath = path.join(binDir, "npm");
  fs.writeFileSync(npmStubPath, npmStub);
  fs.chmodSync(npmStubPath, 0o755);

  // ---- helper: apply version bumps to runner (simulate earlier workflow steps) ----
  const applyBumpsToRunner = () => {
    const VERSION = "0.26.34";
    const VCODE = "27";
    const DATE = "2026-05-12";

    const pkgPath = path.join(runnerDir, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    pkg.version = VERSION;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

    const appConfigPath = path.join(runnerDir, "app.config.ts");
    let appConfig = fs.readFileSync(appConfigPath, "utf8");
    appConfig = appConfig
      .replace(/version: "[^"]*"/, `version: "${VERSION}"`)
      .replace(/versionCode: \d+/, `versionCode: ${VCODE}`);
    fs.writeFileSync(appConfigPath, appConfig);

    const fdroidMetaPath = path.join(
      runnerDir,
      "fdroid",
      "metadata",
      "com.persoack.cablesnap.yml",
    );
    let fdroidMeta = fs.readFileSync(fdroidMetaPath, "utf8");
    fdroidMeta = fdroidMeta
      .replace(/CurrentVersion: .*/, `CurrentVersion: ${VERSION}`)
      .replace(/CurrentVersionCode: .*/, `CurrentVersionCode: ${VCODE}`);
    fs.writeFileSync(fdroidMetaPath, fdroidMeta);

    fs.writeFileSync(
      path.join(runnerDir, "CHANGELOG.md"),
      makeBumpedChangelog(VERSION, VCODE, DATE),
    );

    // Simulate changelog:gen artifacts
    fs.writeFileSync(
      path.join(runnerDir, "lib", "changelog.generated.ts"),
      "// stub-generated\n",
    );
    fs.mkdirSync(
      path.join(
        runnerDir,
        "fdroid",
        "metadata",
        "com.persoack.cablesnap",
        "en-US",
        "changelogs",
      ),
      { recursive: true },
    );
    fs.writeFileSync(
      path.join(
        runnerDir,
        "fdroid",
        "metadata",
        "com.persoack.cablesnap",
        "en-US",
        "changelogs",
        `${VCODE}.txt`,
      ),
      "stub\n",
    );
  };

  // Apply bumps now (like the workflow steps that run before "Commit and push")
  applyBumpsToRunner();

  return {
    sandboxDir,
    originDir,
    runnerDir,

    concurrentCommitToOrigin(bullet: string) {
      const concurrentDir = path.join(sandboxDir, "concurrent");
      execSync(`git clone "${originDir}" "${concurrentDir}"`);
      execSync(`git -C "${concurrentDir}" config user.name "Concurrent"`);
      execSync(
        `git -C "${concurrentDir}" config user.email "concurrent@test.com"`,
      );

      // Add bullet under ## Unreleased
      const clPath = path.join(concurrentDir, "CHANGELOG.md");
      const cl = fs.readFileSync(clPath, "utf8");
      // Insert bullet after first blank line following ## Unreleased
      const updated = cl.replace(/^(## Unreleased\n\n)/m, `$1${bullet}\n\n`);
      fs.writeFileSync(clPath, updated);

      execSync(
        `git -C "${concurrentDir}" add CHANGELOG.md && git -C "${concurrentDir}" commit -m "feat: concurrent merge"`,
        { env: { ...process.env, GIT_AUTHOR_NAME: "Concurrent", GIT_AUTHOR_EMAIL: "concurrent@test.com", GIT_COMMITTER_NAME: "Concurrent", GIT_COMMITTER_EMAIL: "concurrent@test.com" } },
      );
      execSync(`git -C "${concurrentDir}" push origin main`);
      fs.rmSync(concurrentDir, { recursive: true, force: true });
    },

    commitReleaseBump() {
      execSync("git add -A", {
        cwd: runnerDir,
        env: { ...process.env, ...GIT_ENV },
      });
      execSync('git commit -m "release: v0.26.34"', {
        cwd: runnerDir,
        env: { ...process.env, ...GIT_ENV },
      });
    },

    runScript() {
      const result = spawnSync(
        "bash",
        ["scripts/release-push-with-recovery.sh"],
        {
          cwd: runnerDir,
          env: {
            ...process.env,
            PATH: `${binDir}:${process.env.PATH}`,
            VERSION: "0.26.34",
            VCODE: "27",
            DATE: "2026-05-12",
            RELEASE_PUSH_SLEEP_MAX: "0",
            ...GIT_ENV,
          },
          encoding: "utf8",
        },
      );
      return {
        status: result.status,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
      };
    },

    cleanup() {
      fs.rmSync(sandboxDir, { recursive: true, force: true });
    },
  };
}

describe("BLD-1185: release-push-with-recovery.sh", () => {
  it("passes bash -n syntax check", () => {
    expect(() =>
      execFileSync("bash", ["-n", PUSH_SCRIPT], { encoding: "utf8" }),
    ).not.toThrow();
  });

  it("AC1: clean push — succeeds on first attempt when no concurrent commits exist", () => {
    const sandbox = buildSandbox();
    try {
      sandbox.commitReleaseBump();
      const result = sandbox.runScript();
      expect(result.status).toBe(0);
      expect(result.stdout + result.stderr).toContain(
        "Successfully pushed release: v0.26.34",
      );

      // Confirm the release commit is at origin/main by checking runner's tracking ref
      execSync("git fetch origin", { cwd: sandbox.runnerDir });
      const log = spawnSync(
        "git",
        ["--no-pager", "log", "--oneline", "-1", "origin/main"],
        { cwd: sandbox.runnerDir, encoding: "utf8" },
      );
      expect(log.stdout).toContain("release: v0.26.34");
    } finally {
      sandbox.cleanup();
    }
  });

  it(
    "AC2+AC3: CHANGELOG conflict recovery — concurrent Unreleased entry survives in v0.26.34",
    () => {
      const sandbox = buildSandbox();
      try {
        sandbox.commitReleaseBump();

        // Simulate BLD-1174 merging mid-workflow: concurrent commit adds a bullet
        // to ## Unreleased on origin/main AFTER the runner committed its bump.
        sandbox.concurrentCommitToOrigin("- feat: concurrent BLD-1174 entry");

        const result = sandbox.runScript();
        expect(result.status).toBe(0);

        // Confirm origin/main was pushed and read the CHANGELOG from it
        execSync("git fetch origin", { cwd: sandbox.runnerDir });
        const log = spawnSync(
          "git",
          ["--no-pager", "log", "--oneline", "-2", "origin/main"],
          { cwd: sandbox.runnerDir, encoding: "utf8" },
        );
        expect(log.stdout).toContain("release: v0.26.34");

        const showResult = spawnSync(
          "git",
          ["--no-pager", "show", "origin/main:CHANGELOG.md"],
          { cwd: sandbox.runnerDir, encoding: "utf8" },
        );
        const changelog = showResult.stdout;

        // AC2: versioned section exists
        expect(changelog).toContain("## v0.26.34 — 2026-05-12");

        // AC3: concurrent entry appears and is inside the v0.26.34 section
        // (i.e., after the v0.26.34 header, before the v0.26.33 header)
        const v34Pos = changelog.indexOf("## v0.26.34");
        const v33Pos = changelog.indexOf("## v0.26.33");
        const entryPos = changelog.indexOf("feat: concurrent BLD-1174 entry");
        expect(v34Pos).toBeGreaterThan(-1);
        expect(entryPos).toBeGreaterThan(v34Pos);
        expect(entryPos).toBeLessThan(v33Pos);

        // Confirm a fresh ## Unreleased placeholder is present at the top
        expect(changelog).toMatch(/^## Unreleased\s/);
        expect(changelog.indexOf("## Unreleased")).toBeLessThan(v34Pos);
      } finally {
        sandbox.cleanup();
      }
    },
    30000,
  );
});
