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
  skipChangelogEnv: boolean;
  hasSkipChangelogCommitMsg: boolean;
  isDependabotBranch: boolean;
  isDependabotAuthor: boolean;
  hasSkipChangelogBranchName: boolean;
}): CheckResult {
  const {
    changedFiles,
    baseContent,
    headContent,
    skipChangelogEnv,
    hasSkipChangelogCommitMsg,
    isDependabotBranch,
    isDependabotAuthor,
    hasSkipChangelogBranchName,
  } = options;

  // 1. Check escape hatches/exemptions
  if (skipChangelogEnv) {
    return { passed: true, reason: "Bypassed via environment variable SKIP_CHANGELOG." };
  }
  if (hasSkipChangelogBranchName) {
    return { passed: true, reason: "Bypassed via skip-changelog in branch name." };
  }
  if (isDependabotBranch || isDependabotAuthor) {
    return { passed: true, reason: "Bypassed for Dependabot changes." };
  }
  if (hasSkipChangelogCommitMsg) {
    return { passed: true, reason: "Bypassed via skip-changelog in commit message." };
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

function main(): void {
  try {
    // Determine base and head SHAs
    const remoteBranch = execSync(
      'git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo "origin/main"',
      { encoding: "utf8" }
    ).trim();

    // Find the merge base (where our branch diverged from the remote/origin branch)
    let baseSha = "";
    try {
      baseSha = execSync(`git merge-base "${remoteBranch}" HEAD`, { encoding: "utf8" }).trim();
    } catch {
      baseSha = execSync('git rev-parse origin/main', { encoding: "utf8" }).trim();
    }

    const headSha = "HEAD";

    if (!baseSha) {
      console.log("ℹ️  Could not determine base SHA — skipping CHANGELOG pre-push check.");
      process.exit(0);
    }

    // Get list of changed files
    const changedFiles = execSync(`git diff --name-only "${baseSha}" "${headSha}"`, { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter(Boolean);

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
    const skipChangelogEnv =
      process.env.SKIP_CHANGELOG === "true" ||
      process.env.SKIP_CHANGELOG === "1" ||
      process.env.skip_changelog === "true";

    const branchName = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
    const isDependabotBranch = branchName.startsWith("dependabot/");
    const hasSkipChangelogBranchName = branchName.includes("skip-changelog");

    let hasSkipChangelogCommitMsg = false;
    let isDependabotAuthor = false;
    try {
      const commitMessages = execSync(`git log "${baseSha}..${headSha}" --format="%B"`, { encoding: "utf8" });
      hasSkipChangelogCommitMsg = /skip-changelog/i.test(commitMessages);

      const authors = execSync(`git log "${baseSha}..${headSha}" --format="%an"`, { encoding: "utf8" });
      isDependabotAuthor = /dependabot/i.test(authors);
    } catch {
      // Fallback if git log fails
    }

    const result = runChangelogGateCheck({
      changedFiles,
      baseContent,
      headContent,
      skipChangelogEnv,
      hasSkipChangelogCommitMsg,
      isDependabotBranch,
      isDependabotAuthor,
      hasSkipChangelogBranchName,
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
  - Set environment variable: SKIP_CHANGELOG=true git push
  - Include 'skip-changelog' in any of your commit messages
  - Include 'skip-changelog' in your branch name
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
