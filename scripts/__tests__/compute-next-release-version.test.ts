/**
 * BLD-3223 — `scripts/compute-next-release-version.sh` skip-loop unit test.
 *
 * The extracted script encapsulates the bump-path next-version computation
 * used by `.github/workflows/scheduled-release.yml` "Compute next version".
 * It must skip past any candidate version that collides with an existing
 * local tag, remote tag on origin, or GitHub Release — three independent
 * poisoning signals. GitHub's immutable-release ghosts (invisible to
 * `/releases/tags/…`) are handled at create-time by the workflow's
 * collision-aware `gh release create` wrapper, not here.
 *
 * Test strategy: shadow `git` and `gh` on PATH with tiny bash stubs whose
 * behavior is driven by env vars, then invoke the script with a canned
 * `<latest-tag>` and assert on stdout. This proves the real script's
 * decision logic without depending on network, a real git repo, or gh
 * auth. Same PATH-shadow pattern used by other stub-driven tests here
 * (see `scripts/__tests__/fixtures/audit-bundle-stubs/`).
 *
 * Coverage (mapped to BLD-3223 AC "unit-test the skip logic"):
 *   1. No poisoning — returns latest+1.
 *   2. Local tag poisons the immediate next version — skips exactly one.
 *   3. Remote tag (not local) poisons — same skip behavior.
 *   4. GitHub Release exists (no tag) — skip.
 *   5. Multiple consecutive poisonings — skips all, lands on first clean.
 *   6. Skip cap (100) — hits cap and exits non-zero with actionable error.
 *   7. Empty latest-tag input — returns "0.1.0" (initial release).
 *   8. Invalid latest-tag input — exits non-zero.
 *   9. BLD-3223 replay — simulates v0.26.68 poisoning (remote tag + release
 *      present at v0.26.68 only; v0.26.69 clean) — script returns "0.26.69".
 */
import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SCRIPT = path.join(REPO_ROOT, "scripts", "compute-next-release-version.sh");

/**
 * PATH-shadowed `git` stub. Only `git tag -l vX.Y.Z` and
 * `git ls-remote --tags origin refs/tags/vX.Y.Z` are supported. Any other
 * `git` invocation is a test bug and exits non-zero with a diagnostic.
 *
 * Env inputs:
 *   STUB_LOCAL_TAGS   space-separated list of vX.Y.Z tags "present locally"
 *   STUB_REMOTE_TAGS  space-separated list of vX.Y.Z tags "present on origin"
 *
 * Written as a plain string (not a template literal) so `$var`/`${var}`
 * bash references stay literal without JS-side escapes.
 */
const GIT_STUB = [
    "#!/usr/bin/env bash",
    "set -u",
    'sub="${1:-}"',
    'if [ "$sub" = "tag" ] && [ "${2:-}" = "-l" ]; then',
    '  q="${3:-}"',
    "  for t in ${STUB_LOCAL_TAGS:-}; do",
    '    if [ "$t" = "$q" ]; then',
    '      echo "$t"',
    "      exit 0",
    "    fi",
    "  done",
    "  exit 0",
    "fi",
    'if [ "$sub" = "ls-remote" ] && [ "${2:-}" = "--tags" ] && [ "${3:-}" = "origin" ]; then',
    '  q="${4:-}"           # refs/tags/vX.Y.Z',
    '  short="${q#refs/tags/}"',
    "  for t in ${STUB_REMOTE_TAGS:-}; do",
    '    if [ "$t" = "$short" ]; then',
    '      echo -e "0000000000000000000000000000000000000000\\t$q"',
    "      exit 0",
    "    fi",
    "  done",
    "  exit 0",
    "fi",
    'echo "[git-stub] unsupported invocation: git $*" >&2',
    "exit 2",
    "",
].join("\n");

/**
 * PATH-shadowed `gh` stub. Only the specific `gh api
 * repos/.../releases/tags/vX.Y.Z --silent -i` shape the script uses is
 * supported. Mirrors real `gh api -i` behavior: HTTP status header lines
 * are printed to STDOUT for both 2xx and 4xx; 4xx also exits non-zero
 * (real gh exits 1 on any 4xx even with -i).
 *
 * Env inputs:
 *   STUB_RELEASES     space-separated list of vX.Y.Z tags "with a visible
 *                     GitHub Release"
 */
const GH_STUB = [
    "#!/usr/bin/env bash",
    "set -u",
    'sub="${1:-}"',
    'if [ "$sub" != "api" ]; then',
    '  echo "[gh-stub] unsupported subcommand: $sub" >&2',
    "  exit 2",
    "fi",
    "# Locate the endpoint arg — it's the first positional after \"api\" that",
    '# doesn\'t start with "-".',
    "shift",
    'endpoint=""',
    'while [ "$#" -gt 0 ]; do',
    '  case "$1" in',
    "    -H) shift 2 ;;              # e.g. -H \"Accept: ...\"",
    "    -*) shift ;;",
    '    *) endpoint="$1"; shift ;;',
    "  esac",
    "done",
    "# Endpoint shape: repos/OWNER/REPO/releases/tags/vX.Y.Z",
    'tag=""',
    'case "$endpoint" in',
    '  repos/*/releases/tags/*) tag="${endpoint##*/}" ;;',
    '  *) echo "[gh-stub] unsupported endpoint: $endpoint" >&2; exit 2 ;;',
    "esac",
    "for r in ${STUB_RELEASES:-}; do",
    '  if [ "$r" = "$tag" ]; then',
    '    echo "HTTP/2.0 200 OK"',
    '    echo "Content-Type: application/json"',
    '    echo ""',
    "    exit 0",
    "  fi",
    "done",
    "# 404 shape — real `gh api -i` still prints headers to stdout on 4xx,",
    "# but exits 1.",
    'echo "HTTP/2.0 404 Not Found"',
    'echo "Content-Type: application/json"',
    'echo ""',
    "exit 1",
    "",
].join("\n");

interface StubEnv {
    localTags?: string[];
    remoteTags?: string[];
    releases?: string[];
    repo?: string;
}

interface RunResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

function makeStubDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bld3223-stubs-"));
    const gitPath = path.join(dir, "git");
    const ghPath = path.join(dir, "gh");
    fs.writeFileSync(gitPath, GIT_STUB, { mode: 0o755 });
    fs.writeFileSync(ghPath, GH_STUB, { mode: 0o755 });
    return dir;
}

function runScript(latestTag: string, stubs: StubEnv = {}): RunResult {
    const stubDir = makeStubDir();
    try {
        const args = [SCRIPT, latestTag];
        if (stubs.repo) {
            args.push("--repo", stubs.repo);
        }
        // PATH-shadow: stubDir first so our git/gh win over the real ones.
        const env: NodeJS.ProcessEnv = {
            ...process.env,
            PATH: `${stubDir}:${process.env.PATH ?? ""}`,
            STUB_LOCAL_TAGS: (stubs.localTags ?? []).join(" "),
            STUB_REMOTE_TAGS: (stubs.remoteTags ?? []).join(" "),
            STUB_RELEASES: (stubs.releases ?? []).join(" "),
        };
        // If no explicit --repo given, honor GITHUB_REPOSITORY (as the
        // script does when reading env). Set a canonical one so gh API
        // call is exercised.
        if (!stubs.repo) {
            env.GITHUB_REPOSITORY = "alankyshum/cablesnap";
        } else {
            delete env.GITHUB_REPOSITORY;
        }
        const proc = spawnSync("bash", args, {
            encoding: "utf8",
            env,
            stdio: ["ignore", "pipe", "pipe"],
        });
        return {
            stdout: (proc.stdout ?? "").toString(),
            stderr: (proc.stderr ?? "").toString(),
            exitCode: proc.status ?? -1,
        };
    } finally {
        fs.rmSync(stubDir, { recursive: true, force: true });
    }
}

describe("scripts/compute-next-release-version.sh (BLD-3223)", () => {
    it("script is executable", () => {
        expect(fs.existsSync(SCRIPT)).toBe(true);
        const mode = fs.statSync(SCRIPT).mode & 0o111;
        expect(mode).not.toBe(0);
    });

    it("returns latest+1 when no poisoning present", () => {
        const r = runScript("v0.26.67");
        expect(r.exitCode).toBe(0);
        expect(r.stdout.trim()).toBe("0.26.68");
    });

    it("skips a version poisoned by a local tag", () => {
        const r = runScript("v0.26.67", { localTags: ["v0.26.68"] });
        expect(r.exitCode).toBe(0);
        expect(r.stdout.trim()).toBe("0.26.69");
        expect(r.stderr).toContain("v0.26.68 exists as a local tag");
    });

    it("skips a version poisoned only by a remote tag on origin", () => {
        const r = runScript("v0.26.67", { remoteTags: ["v0.26.68"] });
        expect(r.exitCode).toBe(0);
        expect(r.stdout.trim()).toBe("0.26.69");
        expect(r.stderr).toContain("v0.26.68 exists as a remote tag on origin");
    });

    it("skips a version poisoned only by an existing GitHub Release", () => {
        const r = runScript("v0.26.67", { releases: ["v0.26.68"] });
        expect(r.exitCode).toBe(0);
        expect(r.stdout.trim()).toBe("0.26.69");
        expect(r.stderr).toContain("v0.26.68 exists as a GitHub Release");
    });

    it("skips multiple consecutive poisoned versions and lands on first clean", () => {
        const r = runScript("v0.26.67", {
            localTags: ["v0.26.68"],
            remoteTags: ["v0.26.69"],
            releases: ["v0.26.70"],
        });
        expect(r.exitCode).toBe(0);
        expect(r.stdout.trim()).toBe("0.26.71");
    });

    it("hits the skip cap (100) and exits non-zero with actionable error", () => {
        // Simulate 100 consecutive poisoned patches via remote tags:
        // v0.26.68 through v0.26.167 (inclusive) — 100 tags.
        const poisoned: string[] = [];
        for (let p = 68; p <= 167; p++) {
            poisoned.push(`v0.26.${p}`);
        }
        const r = runScript("v0.26.67", { remoteTags: poisoned });
        expect(r.exitCode).not.toBe(0);
        expect(r.stderr).toContain("Skip loop exhausted after 100 increments");
    });

    it("returns 0.1.0 for initial release (empty latest-tag input)", () => {
        const r = runScript("");
        expect(r.exitCode).toBe(0);
        expect(r.stdout.trim()).toBe("0.1.0");
    });

    it("rejects a latest-tag input that is not a v<semver>", () => {
        const r = runScript("not-a-tag");
        expect(r.exitCode).not.toBe(0);
        expect(r.stderr).toContain("is not a valid v<semver>");
    });

    it("BLD-3223 replay: v0.26.68 has remote tag + release; script returns v0.26.69", () => {
        // This is the exact scenario the fix targets after the placeholder
        // tag is pushed to origin: latest_tag=v0.26.68 with both a remote
        // tag and (post-fix, if someone forces a release record) a
        // release. The script should still land on v0.26.69.
        //
        // (Once the placeholder tag is pushed, `latest_tag` in the
        // workflow will actually be v0.26.68; but this test also exercises
        // the more conservative case where latest_tag is still v0.26.67
        // and v0.26.68 is a poisoned candidate.)
        const r = runScript("v0.26.67", {
            remoteTags: ["v0.26.68"],
            releases: ["v0.26.68"],
        });
        expect(r.exitCode).toBe(0);
        expect(r.stdout.trim()).toBe("0.26.69");
    });

    it("also works when latest tag has moved to poisoned v0.26.68 itself", () => {
        // Post-placeholder-push state: latest_tag=v0.26.68. Compute must
        // yield v0.26.69 (68+1 = 69, which is clean).
        const r = runScript("v0.26.68", {
            localTags: ["v0.26.68"],
            remoteTags: ["v0.26.68"],
        });
        expect(r.exitCode).toBe(0);
        expect(r.stdout.trim()).toBe("0.26.69");
    });
});

// Smoke — spawn the stub via execFileSync directly to prove it's shaped
// correctly, independent of the script-under-test.
describe("BLD-3223 test-stub sanity", () => {
    it("git stub returns matching local tag when present in STUB_LOCAL_TAGS", () => {
        const stubDir = makeStubDir();
        try {
            const out = execFileSync("bash", ["-c", "git tag -l v9.9.9"], {
                encoding: "utf8",
                env: {
                    ...process.env,
                    PATH: `${stubDir}:${process.env.PATH ?? ""}`,
                    STUB_LOCAL_TAGS: "v9.9.9",
                },
            });
            expect(out.trim()).toBe("v9.9.9");
        } finally {
            fs.rmSync(stubDir, { recursive: true, force: true });
        }
    });
});
