import {
  isUserFacing,
  extractUnreleasedBullets,
  runChangelogGateCheck,
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
    isReleaseCommit: false,
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

  it("bypasses for release-bot commit (isReleaseCommit=true) even when ## Unreleased is drained", () => {
    // Simulates the release bot promoting ## Unreleased (3 bullets) → ## vX.Y.Z (0 bullets).
    const baseContent = `
## Unreleased

- Fix: DB init locked error
- Infra: Sentry filter for HeadlessChrome
- UX: Progress tab conflicting states

## v0.26.65
`;
    const headContent = `
## Unreleased

## v0.26.66

- Fix: DB init locked error
- Infra: Sentry filter for HeadlessChrome
- UX: Progress tab conflicting states

## v0.26.65
`;
    const res = runChangelogGateCheck({
      ...defaultOptions,
      changedFiles: ["CHANGELOG.md", "lib/changelog.generated.ts"],
      baseContent,
      headContent,
      isReleaseCommit: true,
    });
    expect(res.passed).toBe(true);
    expect(res.reason).toBe("Bypassed for release-bot commit.");
  });

  it("still blocks normal human push that drains ## Unreleased without adding a bullet (regression guard)", () => {
    // Same drained-CHANGELOG scenario, but isReleaseCommit=false — gate must still reject.
    const baseContent = `
## Unreleased

- Fix: DB init locked error
- Infra: Sentry filter for HeadlessChrome
- UX: Progress tab conflicting states

## v0.26.65
`;
    const headContent = `
## Unreleased

## v0.26.66

- Fix: DB init locked error
- Infra: Sentry filter for HeadlessChrome
- UX: Progress tab conflicting states

## v0.26.65
`;
    const res = runChangelogGateCheck({
      ...defaultOptions,
      changedFiles: ["app/screens/Workout.tsx", "CHANGELOG.md"],
      baseContent,
      headContent,
      isReleaseCommit: false,
    });
    expect(res.passed).toBe(false);
    expect(res.message).toContain("the `## Unreleased` section did not gain any new bullet");
  });
});
