/**
 * Tests for scripts/check-changelog-parity.sh (BLD-1027).
 *
 * Builds a tiny fake repo (CHANGELOG.md + app.config.ts) per case, runs the
 * shell script with `repo_root` overridden via cwd, and asserts the exit code
 * + stderr output. This is the drift alarm wired into pre-push and
 * bundle-gate.yml — same class of failure that let v0.26.20–v0.26.22 ship
 * without curated CHANGELOG entries (BLD-1026).
 */

import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  cpSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(__dirname, "..", "..", "scripts", "check-changelog-parity.sh");

function makeRepo(changelog: string, version: string, versionCode: number): string {
  const root = mkdtempSync(join(tmpdir(), "parity-"));
  mkdirSync(join(root, "scripts"), { recursive: true });
  cpSync(SCRIPT, join(root, "scripts", "check-changelog-parity.sh"));
  writeFileSync(join(root, "CHANGELOG.md"), changelog, "utf8");
  writeFileSync(
    join(root, "app.config.ts"),
    `export default () => ({\n  version: "${version}",\n  android: {\n    versionCode: ${versionCode},\n  },\n});\n`,
    "utf8"
  );
  return root;
}

function run(root: string) {
  return spawnSync("bash", [join(root, "scripts", "check-changelog-parity.sh")], {
    cwd: root,
    encoding: "utf8",
  });
}

describe("check-changelog-parity.sh", () => {
  const goodChangelog = [
    "# Changelog",
    "",
    "## Unreleased",
    "",
    "_No user-facing changes yet._",
    "",
    "## v1.2.3 — 2026-05-03",
    "<!-- versionCode: 42 -->",
    "- A change.",
    "",
    "## v1.2.2 — 2026-05-02",
    "<!-- versionCode: 41 -->",
    "- An older change.",
    "",
  ].join("\n");

  let roots: string[] = [];
  afterEach(() => {
    for (const r of roots) rmSync(r, { recursive: true, force: true });
    roots = [];
  });

  it("exits 0 when CHANGELOG top entry matches app.config.ts", () => {
    const root = makeRepo(goodChangelog, "1.2.3", 42);
    roots.push(root);
    const r = run(root);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("parity OK");
  });

  it("fails when CHANGELOG version is ahead of app.config.ts", () => {
    const root = makeRepo(goodChangelog, "1.2.2", 41);
    roots.push(root);
    const r = run(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/version drift/);
  });

  it("fails when versionCode marker disagrees with app.config.ts", () => {
    const root = makeRepo(goodChangelog, "1.2.3", 99);
    roots.push(root);
    const r = run(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/versionCode drift/);
  });

  it("fails when the top entry has no versionCode marker", () => {
    const noMarker = goodChangelog.replace("<!-- versionCode: 42 -->\n", "");
    const root = makeRepo(noMarker, "1.2.3", 42);
    roots.push(root);
    const r = run(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/versionCode: N/);
  });

  it("fails when CHANGELOG.md has no `## v<semver>` headers at all", () => {
    const empty = "# Changelog\n\n## Unreleased\n\n_No user-facing changes yet._\n";
    const root = makeRepo(empty, "1.2.3", 42);
    roots.push(root);
    const r = run(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no '## v<semver>' header/);
  });

  it("ignores `## Unreleased` and matches against the first versioned entry", () => {
    // Ensures the awk loop doesn't latch onto `## Unreleased` as a candidate.
    const withDirtyUnreleased = [
      "# Changelog",
      "",
      "## Unreleased",
      "<!-- versionCode: 999 -->",
      "- a stray marker that must NOT be picked up",
      "",
      "## v1.2.3 — 2026-05-03",
      "<!-- versionCode: 42 -->",
      "- the real top entry.",
      "",
    ].join("\n");
    const root = makeRepo(withDirtyUnreleased, "1.2.3", 42);
    roots.push(root);
    const r = run(root);
    expect(r.status).toBe(0);
  });
});
