#!/usr/bin/env tsx
/**
 * BLD-3078 — Changelog gate verifier.
 *
 * Catches missing '## Unreleased' bullets on user-facing branches locally,
 * mirroring the exact logic and rules of `.github/workflows/changelog-gate.yml`
 * to prevent CI-gate friction.
 *
 * This verifier is wired into:
 *   - .husky/pre-push (local guard before push)
 *
 * Run:
 *   npx tsx scripts/check-changelog-gate.ts
 */
/* eslint-disable no-console */
import path from "node:path";
import { execSync } from "node:child_process";

const USER_FACING_REGEX = /^(app\/|app\.config\.ts$|components\/|screens\/|lib\/|hooks\/|assets\/exercise-illustrations\/|fdroid\/metadata\/com\.persoack\.cablesnap\.yml$|android\/app\/src\/main\/AndroidManifest\.xml$|package\.json$|plugins\/)/;
const INTERNAL_OVERRIDE_REGEX = /(__tests__\/|\.test\.(ts|tsx|js|jsx)$|\.spec\.(ts|tsx|js|jsx)$|^lib\/changelog\.generated\.ts$|^lib\/.*\/__fixtures__\/|^e2e\/)/;

export function isUserFacing(file: string): boolean {
  return USER_FACING_REGEX.test(file) && !INTERNAL_OVERRIDE_REGEX.test(file);
}

export function extractUnreleasedBullets(content: string): number {
  const lines = content.split(/\r?\n/);
  let inUnreleased = false;
  let count = 0;
  for (const line of lines) {
    if (/^##\s+Unreleased\s*$/i.test(line.trim())) {
      inUnreleased = true;
      continue;
    }
    if (inUnreleased && /^##\s+/.test(line.trim())) {
      break;
    }
    if (inUnreleased && /^\s*-\s+/.test(line)) {
      count++;
    }
  }
  return count;
}

export interface CheckResult {
  passed: boolean;
  message?: string;
  reason?: string;
}

export function runChangelogGateCheck(options: {
  changedFiles: string[];
  baseContent: string | null;
  headContent: string | null;
  isDependabotBranch: boolean;
  isDependabotAuthor: boolean;
  isReleaseCommit?: boolean;
}): CheckResult {
  const {
    changedFiles,
    baseContent,
    headContent,
    isDependabotBranch,
    isDependabotAuthor,
    isReleaseCommit = false,
  } = options;

  // 1. Check escape hatches/exemptions
  if (isDependabotBranch || isDependabotAuthor) {
    return { passed: true, reason: "Bypassed for Dependabot changes." };
  }
  if (isReleaseCommit) {
    return { passed: true, reason: "Bypassed for release-bot commit." };
  }

  // 2. Classify changed files
  const userFacingFiles = changedFiles.filter(isUserFacing);
  if (userFacingFiles.length === 0) {
    return { passed: true, reason: "No user-facing files changed — CHANGELOG entry not required." };
  }

  // 3. Verify CHANGELOG.md was modified
  const changelogModified = changedFiles.includes("CHANGELOG.md");
  if (!changelogModified) {
    const fileList = userFacingFiles.map(f => `  - ${f}`).join("\n");
    return {
      passed: false,
      message: `🚨 CHANGELOG Gate Violation: This push touches user-facing code but does not modify CHANGELOG.md.

User-facing files changed:
${fileList}

Add a bullet describing the user-visible change to the \`## Unreleased\`
section of CHANGELOG.md. The auto-releaser (\`scheduled-release.yml\`)
gates on a populated \`## Unreleased\` section, so PRs that skip this
step block the next scheduled release silently.

If this push is genuinely internal-only (refactor with no user impact,
test-only fix, lockfile bump, etc.), use one of the escape hatches below.`,
    };
  }

  // 4. Require head > base bullets
  const baseBullets = baseContent ? extractUnreleasedBullets(baseContent) : 0;
  const headBullets = headContent ? extractUnreleasedBullets(headContent) : 0;

  if (headBullets <= baseBullets) {
    return {
      passed: false,
      message: `🚨 CHANGELOG Gate Violation: CHANGELOG.md was modified, but the \`## Unreleased\` section did not gain any new bullet (\`-\` lines): base=${baseBullets} head=${headBullets}.

Add at least one bullet under \`## Unreleased\` describing the
user-visible change introduced. If this is genuinely internal-only,
use one of the escape hatches below.`,
    };
  }

  return {
    passed: true,
    reason: `Changelog gate passed: \`## Unreleased\` gained ${headBullets - baseBullets} bullet(s).`,
  };
}

function execGitCommand(command: string): string {
  try {
    return execSync(command, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Git command execution failed: "${command}".\nDetails: ${errorMsg}`);
  }
}

function main(): void {
  try {
    // Determine base and head SHAs
    const remoteBranch = execGitCommand(
      'git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo "origin/main"'
    );

    // Find the merge base (where our branch diverged from the remote/origin branch)
    let baseSha = "";
    try {
      baseSha = execGitCommand(`git merge-base "${remoteBranch}" HEAD`);
    } catch {
      baseSha = execGitCommand('git rev-parse origin/main');
    }

    const headSha = "HEAD";

    if (!baseSha) {
      console.log("ℹ️  Could not determine base SHA — skipping CHANGELOG pre-push check.");
      process.exit(0);
    }

    // Get list of changed files
    const changedFilesOutput = execGitCommand(`git diff --name-only "${baseSha}" "${headSha}"`);
    const changedFiles = changedFilesOutput.split("\n").filter(Boolean);

    // Skip check if no changes are being pushed
    if (changedFiles.length === 0) {
      process.exit(0);
    }

    // Read base and head CHANGELOG.md contents
    let baseContent: string | null = null;
    try {
      baseContent = execSync(`git show "${baseSha}":CHANGELOG.md`, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
    } catch {
      // base CHANGELOG.md might not exist or couldn't be loaded, keep as null
    }

    let headContent: string | null = null;
    try {
      headContent = execSync(`git show "${headSha}":CHANGELOG.md`, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
    } catch {
      // head CHANGELOG.md might not exist or couldn't be loaded, keep as null
    }

    // Check escape hatches/exemptions
    const branchName = execGitCommand("git rev-parse --abbrev-ref HEAD");
    const isDependabotBranch = branchName.startsWith("dependabot/");

    let isDependabotAuthor = false;
    try {
      const authors = execGitCommand(`git log "${baseSha}..${headSha}" --format="%an"`);
      isDependabotAuthor = /dependabot/i.test(authors);
    } catch {
      // Fallback if git log fails
    }

    // Detect release-bot commits: author == "CableSnap Release Bot" OR
    // subject matches ^release: v<semver>. Mirrors the Dependabot exemption.
    let isReleaseCommit = false;
    try {
      const commitLog = execGitCommand(`git log "${baseSha}..${headSha}" --format="%an|%s"`);
      isReleaseCommit = commitLog.split("\n").filter(Boolean).some((line) => {
        const pipeIdx = line.indexOf("|");
        const author = pipeIdx >= 0 ? line.substring(0, pipeIdx).trim() : "";
        const subject = pipeIdx >= 0 ? line.substring(pipeIdx + 1).trim() : "";
        return (
          author === "CableSnap Release Bot" ||
          /^release: v\d+\.\d+\.\d+/.test(subject)
        );
      });
    } catch {
      // Fallback if git log fails
    }

    const result = runChangelogGateCheck({
      changedFiles,
      baseContent,
      headContent,
      isDependabotBranch,
      isDependabotAuthor,
      isReleaseCommit,
    });

    if (result.passed) {
      if (result.reason) {
        console.log(`📝 ${result.reason}`);
      }
      process.exit(0);
    } else {
      console.error(result.message);
      console.error(`
💡 Escape hatches:
  - Dependabot authored branches bypass this check automatically.
  - Bypass hooks entirely (governance escape hatch only): git push --no-verify
`);
      process.exit(1);
    }
  } catch (error) {
    console.error("⚠️  Error executing CHANGELOG gate check, skipping:", error instanceof Error ? error.message : error);
    process.exit(0);
  }
}

const invokedAsScript =
  require.main === module ||
  (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename));
if (invokedAsScript) {
  main();
}
