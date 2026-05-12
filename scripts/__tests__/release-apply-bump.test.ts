/**
 * BLD-1185 — scheduled-release.yml "Commit and push" recovery path:
 * when a concurrent merge that touches CHANGELOG.md lands on `main` between
 * checkout and push, the workflow must hard-reset onto fresh main, re-apply
 * the bump via `scripts/release-apply-bump.sh`, and push successfully.
 *
 * Pre-fix bug (recorded in BLD-1184):
 *   - Workflow used `git pull --rebase origin main` to recover from push
 *     rejection. CHANGELOG.md / lib/changelog.generated.ts / F-Droid
 *     sidecars are derived artefacts; three-way merging them produces an
 *     unresolved conflict and the step exits 1.
 *
 * Fix strategy:
 *   1. On push rejection, try plain rebase first (preserves history when
 *      no derived artefacts conflict).
 *   2. On rebase conflict: `git rebase --abort`, `git reset --hard origin/main`,
 *      re-run `scripts/release-apply-bump.sh "$VERSION" "$VCODE"` to
 *      recompute the bump on the new base, then commit + retry push.
 *   3. The script promotes whatever `## Unreleased` bullets are present in
 *      the post-reset CHANGELOG.md into the v$VERSION section, so any
 *      concurrent contributor's bullets are preserved automatically.
 *
 * Acceptance criteria (BLD-1185):
 *   AC1: clean push (no concurrent merge) succeeds.
 *   AC2: concurrent CHANGELOG.md merge → recovery succeeds, push lands.
 *   AC3: concurrent merge's `## Unreleased` bullet is promoted into the
 *        v$VERSION block in the final main.
 *
 * Strategy: build two local bare/clone git repos in tmp, replay the
 * recovery shell logic verbatim, assert on the resulting main HEAD.
 * `SKIP_CHANGELOG_GEN=1` is set so the test does not depend on tsx /
 * `npm run changelog:gen`; the conflict-recovery pattern itself is what
 * we're proving (CHANGELOG.md is the file that conflicts, and the script
 * rewrites it directly).
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SCRIPT = path.join(REPO_ROOT, "scripts", "release-apply-bump.sh");

function sh(cmd: string, args: string[], cwd: string, env: Record<string, string> = {}): string {
    return execFileSync(cmd, args, {
        cwd,
        encoding: "utf8",
        env: {
            ...process.env,
            GIT_AUTHOR_NAME: "Test",
            GIT_AUTHOR_EMAIL: "test@example.com",
            GIT_COMMITTER_NAME: "Test",
            GIT_COMMITTER_EMAIL: "test@example.com",
            ...env,
        } as NodeJS.ProcessEnv,
        stdio: ["ignore", "pipe", "pipe"],
    }).toString();
}

function git(args: string[], cwd: string): string {
    return sh("git", args, cwd);
}

/**
 * Try to push; on ANY rejection, hard-reset onto fresh origin/main and
 * re-run release-apply-bump.sh. Mirrors the simplified shell logic in
 * .github/workflows/scheduled-release.yml "Commit and push" step.
 *
 * BLD-1185: the earlier two-branch design (try plain rebase first, fall
 * back to regenerate on conflict) was unsafe — a successful plain rebase
 * could merge a concurrent `CHANGELOG.md` bullet into the release commit
 * while leaving `lib/changelog.generated.ts` + F-Droid sidecar +
 * downstream GitHub Release notes generated from the pre-rebase CHANGELOG.
 * Single recovery codepath (always reset + regenerate) closes that gap.
 */
function commitAndPushWithRecovery(opts: {
    cwd: string;
    version: string;
    vcode: string;
    maxAttempts?: number;
}): { pushed: boolean; recoveredViaRegenerate: boolean; attempts: number } {
    const { cwd, version, vcode } = opts;
    const maxAttempts = opts.maxAttempts ?? 5;
    const localScript = path.join(cwd, "scripts", "release-apply-bump.sh");

    const stagePaths = () =>
        git(
            [
                "add",
                "package.json",
                "app.config.ts",
                "fdroid/metadata/com.persoack.cablesnap.yml",
                "CHANGELOG.md",
            ],
            cwd,
        );

    stagePaths();
    const diffStat = git(["diff", "--cached", "--name-only"], cwd).trim();
    if (diffStat === "") {
        return { pushed: true, recoveredViaRegenerate: false, attempts: 0 };
    }
    git(["commit", "-m", `release: v${version}`], cwd);

    let recoveredViaRegenerate = false;
    for (let i = 1; i <= maxAttempts; i++) {
        try {
            git(["push", "origin", "main"], cwd);
            return { pushed: true, recoveredViaRegenerate, attempts: i };
        } catch {
            // rejected — recover via reset + regenerate
        }
        git(["fetch", "origin", "main"], cwd);
        git(["reset", "--hard", "origin/main"], cwd);
        sh("bash", [localScript, version, vcode], cwd, { SKIP_CHANGELOG_GEN: "1" });
        stagePaths();
        try {
            git(["diff", "--cached", "--quiet"], cwd);
            // no delta — concurrent merge already shipped this version
            return { pushed: true, recoveredViaRegenerate: true, attempts: i };
        } catch {
            /* delta exists */
        }
        git(["commit", "-m", `release: v${version}`], cwd);
        recoveredViaRegenerate = true;
    }
    return { pushed: false, recoveredViaRegenerate, attempts: maxAttempts };
}

interface Sandbox {
    root: string;
    origin: string;
    runner: string;
    interloper: string;
}

function makeSandbox(): Sandbox {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bld1185-"));
    const origin = path.join(root, "origin.git");
    const runner = path.join(root, "runner");
    const interloper = path.join(root, "interloper");

    fs.mkdirSync(origin);
    sh("git", ["init", "--bare", "--initial-branch=main"], origin);

    // Seed runner with minimal repo state the script + recovery need.
    fs.mkdirSync(runner);
    sh("git", ["init", "--initial-branch=main"], runner);
    fs.mkdirSync(path.join(runner, "scripts"));
    fs.copyFileSync(SCRIPT, path.join(runner, "scripts", "release-apply-bump.sh"));
    fs.chmodSync(path.join(runner, "scripts", "release-apply-bump.sh"), 0o755);

    fs.writeFileSync(
        path.join(runner, "package.json"),
        JSON.stringify({ name: "cablesnap", version: "1.0.0" }, null, 2) + "\n",
    );
    fs.writeFileSync(
        path.join(runner, "app.config.ts"),
        [
            "export default {",
            '  version: "1.0.0",',
            "  android: {",
            "    versionCode: 100,",
            "  },",
            "};",
            "",
        ].join("\n"),
    );
    fs.mkdirSync(path.join(runner, "fdroid/metadata/com.persoack.cablesnap/en-US/changelogs"), {
        recursive: true,
    });
    fs.writeFileSync(
        path.join(runner, "fdroid/metadata/com.persoack.cablesnap.yml"),
        ["CurrentVersion: 1.0.0", "CurrentVersionCode: 100", ""].join("\n"),
    );
    fs.writeFileSync(
        path.join(runner, "CHANGELOG.md"),
        [
            "# Changelog",
            "",
            "## Unreleased",
            "",
            "- existing bullet 1",
            "- existing bullet 2",
            "- existing bullet 3",
            "",
            "## v1.0.0 — 2026-01-01",
            "<!-- versionCode: 100 -->",
            "",
            "- initial release",
            "",
        ].join("\n"),
    );

    git(["add", "."], runner);
    git(["commit", "-m", "initial"], runner);
    git(["remote", "add", "origin", origin], runner);
    git(["push", "-u", "origin", "main"], runner);

    sh("git", ["clone", origin, interloper], path.dirname(interloper));

    return { root, origin, runner, interloper };
}

function readChangelog(repo: string): string {
    return fs.readFileSync(path.join(repo, "CHANGELOG.md"), "utf8");
}

/**
 * Mirror the awk extraction used by the workflow's "Generate release notes"
 * step (.github/workflows/scheduled-release.yml). We assert against this in
 * the BLD-1185 review fixture below to prove the post-recovery CHANGELOG.md
 * — not the pre-recovery snapshot — is what drives the GitHub Release body.
 */
function extractReleaseNotesBody(changelog: string, version: string): string {
    const lines = changelog.split("\n");
    const headerRe = new RegExp(`^## v${version.replace(/\./g, "\\.")}([^0-9]|$)`);
    const out: string[] = [];
    let inSection = false;
    for (const line of lines) {
        if (!inSection) {
            if (headerRe.test(line)) {
                inSection = true;
            }
            continue;
        }
        if (line.startsWith("## ")) break;
        out.push(line);
    }
    return out.join("\n");
}

describe("BLD-1185 release-apply-bump.sh + commit-and-push recovery", () => {
    let sb: Sandbox;
    afterEach(() => {
        if (sb?.root) {
            try {
                fs.rmSync(sb.root, { recursive: true, force: true });
            } catch {
                /* best-effort */
            }
        }
    });

    it("AC1: clean push (no concurrent merge) succeeds on first attempt without recovery", () => {
        sb = makeSandbox();
        sh("bash", [path.join(sb.runner, "scripts", "release-apply-bump.sh"), "1.0.1", "101"], sb.runner, { SKIP_CHANGELOG_GEN: "1" });
        const result = commitAndPushWithRecovery({
            cwd: sb.runner,
            version: "1.0.1",
            vcode: "101",
        });
        expect(result.pushed).toBe(true);
        expect(result.recoveredViaRegenerate).toBe(false);
        expect(result.attempts).toBe(1);

        // Pull origin into a fresh clone and assert top of CHANGELOG.
        const verify = path.join(sb.root, "verify");
        sh("git", ["clone", sb.origin, verify], sb.root);
        const cl = readChangelog(verify);
        expect(cl).toMatch(/^## v1\.0\.1 /m);
        expect(cl).toMatch(/<!-- versionCode: 101 -->/);
    });

    it("AC2 + AC3: concurrent CHANGELOG.md merge triggers regenerate path; concurrent bullet is promoted into v$VERSION section", () => {
        sb = makeSandbox();

        // Runner applies the bump locally (would normally happen in the
        // earlier "Apply release bump" workflow step).
        sh("bash", [path.join(sb.runner, "scripts", "release-apply-bump.sh"), "1.0.1", "101"], sb.runner, { SKIP_CHANGELOG_GEN: "1" });

        // Interloper lands a CHANGELOG-touching commit on main BEFORE the
        // runner pushes — exact reproduction of BLD-1184: insert a NEW
        // bullet at the top of the `## Unreleased` bullet list. This is the
        // pattern that produces a real `CONFLICT (content)` in
        // `git pull --rebase` because the runner's promotion of
        // `## Unreleased` rewrites overlapping context lines.
        const interCl = readChangelog(sb.interloper).replace(
            "## Unreleased\n\n- existing bullet 1\n",
            "## Unreleased\n\n- concurrent contributor bullet (BLD-1185 fixture)\n- existing bullet 1\n",
        );
        fs.writeFileSync(path.join(sb.interloper, "CHANGELOG.md"), interCl);
        git(["add", "CHANGELOG.md"], sb.interloper);
        git(["commit", "-m", "docs: add unreleased bullet"], sb.interloper);
        git(["push", "origin", "main"], sb.interloper);

        // Runner now tries to commit + push — should fall into regenerate path.
        const result = commitAndPushWithRecovery({
            cwd: sb.runner,
            version: "1.0.1",
            vcode: "101",
        });
        expect(result.pushed).toBe(true);
        expect(result.recoveredViaRegenerate).toBe(true);

        // Verify final origin/main:
        const verify = path.join(sb.root, "verify");
        sh("git", ["clone", sb.origin, verify], sb.root);
        const cl = readChangelog(verify);

        // AC2: v1.0.1 is at the top.
        expect(cl).toMatch(/^## v1\.0\.1 /m);
        expect(cl).toMatch(/<!-- versionCode: 101 -->/);

        // AC3: concurrent contributor's bullet was promoted into the
        // v1.0.1 section — it must appear AFTER the v1.0.1 header and
        // BEFORE the next `## ` header.
        const v101Match = cl.match(/^## v1\.0\.1 [\s\S]*?(?=^## )/m);
        expect(v101Match).not.toBeNull();
        expect(v101Match![0]).toContain("concurrent contributor bullet (BLD-1185 fixture)");

        // The fresh `## Unreleased` placeholder must exist above v1.0.1.
        expect(cl.indexOf("## Unreleased")).toBeGreaterThan(-1);
        expect(cl.indexOf("## Unreleased")).toBeLessThan(cl.indexOf("## v1.0.1"));
    });

    it("AC4 (BLD-1185 review blocker): non-conflicting concurrent CHANGELOG bullet is promoted into v$VERSION via reset+regenerate, so downstream release-note extraction sees it", () => {
        sb = makeSandbox();

        // Runner applies the bump locally.
        sh("bash", [path.join(sb.runner, "scripts", "release-apply-bump.sh"), "1.0.1", "101"], sb.runner, { SKIP_CHANGELOG_GEN: "1" });

        // Interloper appends a NEW bullet at the END of the `## Unreleased`
        // bullet list. Crucially this is the variant that — under the OLD
        // try-plain-rebase-first recovery — would three-way-merge cleanly,
        // leaving generated artefacts stale. With the new "always reset +
        // regenerate" recovery, the bullet is instead promoted into the
        // v$VERSION block by re-running the bump script on the post-reset
        // CHANGELOG.md.
        const interCl = readChangelog(sb.interloper).replace(
            "- existing bullet 3\n",
            "- existing bullet 3\n- non-conflicting concurrent bullet (BLD-1185 reviewer fixture)\n",
        );
        fs.writeFileSync(path.join(sb.interloper, "CHANGELOG.md"), interCl);
        git(["add", "CHANGELOG.md"], sb.interloper);
        git(["commit", "-m", "docs: append non-conflicting bullet"], sb.interloper);
        git(["push", "origin", "main"], sb.interloper);

        const result = commitAndPushWithRecovery({
            cwd: sb.runner,
            version: "1.0.1",
            vcode: "101",
        });
        expect(result.pushed).toBe(true);
        expect(result.recoveredViaRegenerate).toBe(true);

        const verify = path.join(sb.root, "verify");
        sh("git", ["clone", sb.origin, verify], sb.root);
        const cl = readChangelog(verify);

        // Final v1.0.1 section must contain the concurrent bullet.
        expect(cl).toMatch(/^## v1\.0\.1 /m);
        const v101Match = cl.match(/^## v1\.0\.1 [\s\S]*?(?=^## )/m);
        expect(v101Match).not.toBeNull();
        expect(v101Match![0]).toContain(
            "non-conflicting concurrent bullet (BLD-1185 reviewer fixture)",
        );

        // Mirror the workflow's "Generate release notes" awk extraction
        // against the post-recovery CHANGELOG: it must include the
        // concurrent contributor bullet. This is the canary for QD's
        // blocker — release notes generated from the FINAL CHANGELOG.
        const notes = extractReleaseNotesBody(cl, "1.0.1");
        expect(notes).toContain("non-conflicting concurrent bullet (BLD-1185 reviewer fixture)");
    });

    it("script is idempotent: running it twice on the same checkout yields identical CHANGELOG.md", () => {
        sb = makeSandbox();
        sh("bash", [path.join(sb.runner, "scripts", "release-apply-bump.sh"), "1.0.1", "101"], sb.runner, { SKIP_CHANGELOG_GEN: "1" });
        const after1 = readChangelog(sb.runner);
        sh("bash", [path.join(sb.runner, "scripts", "release-apply-bump.sh"), "1.0.1", "101"], sb.runner, { SKIP_CHANGELOG_GEN: "1" });
        const after2 = readChangelog(sb.runner);
        expect(after2).toBe(after1);
    });
});
