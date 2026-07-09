import {
  isUserFacing,
  extractUnreleasedBullets,
  runChangelogGateCheck,
  detectReleaseBotCommit,
} from "../../scripts/check-changelog-gate";

describe("isUserFacing", () => {
  it("classifies user-facing paths correctly", () => {
    expect(isUserFacing("app/screens/Workout.tsx")).toBe(true);
    expect(isUserFacing("components/Button.tsx")).toBe(true);
    expect(isUserFacing("lib/helpers.ts")).toBe(true);
    expect(isUserFacing("hooks/useRestTimer.ts")).toBe(true);
    expect(isUserFacing("package.json")).toBe(true);
    expect(isUserFacing("app.config.ts")).toBe(true);
    expect(isUserFacing("plugins/sentry.js")).toBe(true);
  });

  it("classifies non-user-facing paths as exempt", () => {
    expect(isUserFacing("app/screens/__tests__/Workout.test.tsx")).toBe(false);
    expect(isUserFacing("lib/changelog.generated.ts")).toBe(false);
    expect(isUserFacing("e2e/scenario.spec.ts")).toBe(false);
    expect(isUserFacing("scripts/audit-tests.sh")).toBe(false);
    expect(isUserFacing(".github/workflows/ci.yml")).toBe(false);
    expect(isUserFacing(".plans/PLAN-BLD-3078.md")).toBe(false);
  });
});

describe("extractUnreleasedBullets", () => {
  it("extracts bullet count correctly", () => {
    const content = `
# Changelog

## Unreleased

- Bullet one.
- Bullet two.

## v0.26.64 — 2026-07-05
- Stale bullet.
`;
    expect(extractUnreleasedBullets(content)).toBe(2);
  });

  it("handles empty unreleased section", () => {
    const content = `
# Changelog

## Unreleased

## v0.26.64 — 2026-07-05
- Stale bullet.
`;
    expect(extractUnreleasedBullets(content)).toBe(0);
  });

  it("ignores non-bullet lines", () => {
    const content = `
# Changelog

## Unreleased

Some explanatory text.
- Valid bullet.

### Some sub-heading
- Another bullet under sub-heading.
`;
    // Heading '###' does not terminate section; only a heading level-2 ('## ') ends '## Unreleased'.
    expect(extractUnreleasedBullets(content)).toBe(2);
  });
});

describe("runChangelogGateCheck", () => {
  const defaultOptions = {
    changedFiles: [],
    baseContent: null,
    headContent: null,
    isDependabotBranch: false,
    isDependabotAuthor: false,
  };

  it("passes when no files changed", () => {
    const res = runChangelogGateCheck({
      ...defaultOptions,
      changedFiles: [],
    });
    expect(res.passed).toBe(true);
    expect(res.reason).toContain("No user-facing files changed");
  });

  it("passes when only exempt/internal files changed", () => {
    const res = runChangelogGateCheck({
      ...defaultOptions,
      changedFiles: ["e2e/test.spec.ts", ".github/workflows/ci.yml"],
    });
    expect(res.passed).toBe(true);
    expect(res.reason).toContain("No user-facing files changed");
  });

  it("fails when user-facing files changed but CHANGELOG.md is not modified", () => {
    const res = runChangelogGateCheck({
      ...defaultOptions,
      changedFiles: ["app/screens/Workout.tsx"],
    });
    expect(res.passed).toBe(false);
    expect(res.message).toContain("touches user-facing code but does not modify CHANGELOG.md");
  });

  it("fails when CHANGELOG.md is modified but no new bullets are added to Unreleased", () => {
    const baseContent = `
## Unreleased
- Bullet A
## v0.1.0
`;
    const headContent = `
## Unreleased
- Bullet A
## v0.1.0
`;
    const res = runChangelogGateCheck({
      ...defaultOptions,
      changedFiles: ["app/screens/Workout.tsx", "CHANGELOG.md"],
      baseContent,
      headContent,
    });
    expect(res.passed).toBe(false);
    expect(res.message).toContain("the `## Unreleased` section did not gain any new bullet");
  });

  it("passes when CHANGELOG.md is modified and a new bullet is added to Unreleased", () => {
    const baseContent = `
## Unreleased
- Bullet A
## v0.1.0
`;
    const headContent = `
## Unreleased
- Bullet A
- New Bullet B
## v0.1.0
`;
    const res = runChangelogGateCheck({
      ...defaultOptions,
      changedFiles: ["app/screens/Workout.tsx", "CHANGELOG.md"],
      baseContent,
      headContent,
    });
    expect(res.passed).toBe(true);
    expect(res.reason).toContain("Changelog gate passed");
  });

  it("bypasses for Dependabot changes", () => {
    const res = runChangelogGateCheck({
      ...defaultOptions,
      changedFiles: ["app/screens/Workout.tsx"],
      isDependabotBranch: true,
    });
    expect(res.passed).toBe(true);
    expect(res.reason).toContain("Bypassed for Dependabot changes");
  });

  // BLD-3166 — scheduled-release bot's `release: v<VERSION>` commit
  // deliberately drains `## Unreleased`. It must bypass the head>base rule.
  describe("release-bot bypass (BLD-3166)", () => {
    const drainedBase = `
## Unreleased
- Bullet A
- Bullet B
- Bullet C
## v0.26.65 — 2026-07-07
- Prior shipped bullet.
`;
    const drainedHead = `
## Unreleased
## v0.26.66 — 2026-07-09
- Bullet A
- Bullet B
- Bullet C
## v0.26.65 — 2026-07-07
- Prior shipped bullet.
`;

    it("release-bot author bypass — drained Unreleased passes when isReleaseBotCommit=true", () => {
      // Sanity: without the bypass, this exact scenario is the reported failure
      // (base=3 head=0 -> Gate Violation).
      expect(extractUnreleasedBullets(drainedBase)).toBe(3);
      expect(extractUnreleasedBullets(drainedHead)).toBe(0);

      const res = runChangelogGateCheck({
        ...defaultOptions,
        changedFiles: [
          "package.json",
          "app.config.ts",
          "CHANGELOG.md",
          "lib/changelog.generated.ts",
          "fdroid/metadata/com.persoack.cablesnap.yml",
        ],
        baseContent: drainedBase,
        headContent: drainedHead,
        isReleaseBotCommit: true,
      });
      expect(res.passed).toBe(true);
      expect(res.reason).toContain("release-bot version-bump commit");
    });

    it("release: v subject bypass — drained Unreleased passes when isReleaseBotCommit=true (subject-derived)", () => {
      // AC #3: subject signal alone (no matching author) still suffices at the
      // gate boundary because `isReleaseBotCommit` is a single boolean fed in
      // from either signal. Verified end-to-end via the pure detector below.
      const res = runChangelogGateCheck({
        ...defaultOptions,
        changedFiles: ["CHANGELOG.md", "package.json"],
        baseContent: drainedBase,
        headContent: drainedHead,
        isReleaseBotCommit: true,
      });
      expect(res.passed).toBe(true);
      expect(res.reason).toContain("release-bot version-bump commit");
    });

    it("regression intact — NON-bot with drained Unreleased still fails", () => {
      // A normal contributor cannot spoof the bypass. Same exact CHANGELOG.md
      // as the release-bot scenario, but `isReleaseBotCommit=false`.
      const res = runChangelogGateCheck({
        ...defaultOptions,
        changedFiles: ["app/screens/Workout.tsx", "CHANGELOG.md"],
        baseContent: drainedBase,
        headContent: drainedHead,
        isReleaseBotCommit: false,
      });
      expect(res.passed).toBe(false);
      expect(res.message).toContain(
        "the `## Unreleased` section did not gain any new bullet"
      );
    });

    it("release-bot bypass is evaluated BEFORE user-facing classification", () => {
      // Release-bot commits touch user-facing files (package.json, app.config.ts)
      // and drain Unreleased. The bypass must short-circuit both the missing-
      // CHANGELOG path AND the head<=base path.
      const res = runChangelogGateCheck({
        ...defaultOptions,
        changedFiles: ["app.config.ts", "package.json"], // no CHANGELOG.md included
        isReleaseBotCommit: true,
      });
      expect(res.passed).toBe(true);
      expect(res.reason).toContain("release-bot version-bump commit");
    });
  });
});

// BLD-3166 — verify the pure detector correctly extracts release-bot signals
// from `git log --format=%an%x00%s%x1e` output. This is the unit that main()
// wraps around execSync; keeping it pure makes AC #3 directly testable
// without spawning git.
describe("detectReleaseBotCommit (BLD-3166)", () => {
  const NUL = "\x00";
  const RS = "\x1e";

  function makeRangeLog(commits: Array<{ author: string; subject: string }>): string {
    return commits.map(c => `${c.author}${NUL}${c.subject}${RS}`).join("");
  }

  it("returns true when a commit is authored by 'CableSnap Release Bot'", () => {
    const rangeLog = makeRangeLog([
      { author: "CableSnap Release Bot", subject: "release: v0.26.66" },
    ]);
    expect(detectReleaseBotCommit(rangeLog)).toBe(true);
  });

  it("returns true when subject matches /^release: v\\d+\\.\\d+\\.\\d+/ even with non-bot author (AC #3)", () => {
    const rangeLog = makeRangeLog([
      { author: "Alan Shum", subject: "release: v0.26.66" },
    ]);
    expect(detectReleaseBotCommit(rangeLog)).toBe(true);
  });

  it("returns true when ANY commit in the range matches (mixed range)", () => {
    const rangeLog = makeRangeLog([
      { author: "Alan Shum", subject: "feat: normal work" },
      { author: "Alan Shum", subject: "fix: something else" },
      { author: "CableSnap Release Bot", subject: "release: v0.26.66" },
    ]);
    expect(detectReleaseBotCommit(rangeLog)).toBe(true);
  });

  it("returns false for a normal contributor push", () => {
    const rangeLog = makeRangeLog([
      { author: "Alan Shum", subject: "feat: add rest-timer polish" },
      { author: "Alan Shum", subject: "test: cover edge case" },
    ]);
    expect(detectReleaseBotCommit(rangeLog)).toBe(false);
  });

  it("does not match subjects that only START LIKE 'release:' but lack a semver (defensive)", () => {
    const rangeLog = makeRangeLog([
      { author: "Alan Shum", subject: "release: prep notes" },
      { author: "Alan Shum", subject: "release: v0.26" }, // missing patch
      { author: "Alan Shum", subject: "chore: release the pipeline" },
    ]);
    expect(detectReleaseBotCommit(rangeLog)).toBe(false);
  });

  it("returns false on empty input (defensive)", () => {
    expect(detectReleaseBotCommit("")).toBe(false);
  });

  it("handles trailing RS from a real git log output cleanly", () => {
    // git log emits a trailing separator on the last record; the parser must
    // skip the empty final chunk without falsely reporting a bot commit.
    const rangeLog = makeRangeLog([
      { author: "Alan Shum", subject: "feat: whatever" },
    ]);
    expect(rangeLog.endsWith(RS)).toBe(true);
    expect(detectReleaseBotCommit(rangeLog)).toBe(false);
  });
});
