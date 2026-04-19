/**
 * Structural tests for FTA batch 5 decomposition.
 * Verifies extracted hooks and components exist with expected exports.
 */
import * as fs from "fs";
import * as path from "path";

function readSrc(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../../", relPath), "utf-8");
}

describe("FTA Batch 5 — session/[id].tsx decomposition", () => {
  const parentSrc = readSrc("app/session/[id].tsx");
  const hookSrc = readSrc("hooks/useSessionActions.ts");
  const headerSrc = readSrc("components/session/SessionListHeader.tsx");
  const footerSrc = readSrc("components/session/SessionListFooter.tsx");

  it("parent imports extracted components and hook", () => {
    expect(parentSrc).toContain("useSessionActions");
    expect(parentSrc).toContain("SessionListHeader");
    expect(parentSrc).toContain("SessionListFooter");
  });

  it("extracted modules have expected exports and content", () => {
    expect(hookSrc).toContain("export function useSessionActions");
    expect(hookSrc).toContain("elapsed");
    expect(hookSrc).toContain("setElapsed");
    expect(headerSrc).toContain("nextHint");
    expect(footerSrc).toContain("Finish Workout");
    expect(footerSrc).toContain("Cancel Workout");
  });

  it("parent file is under 350 lines", () => {
    expect(parentSrc.split("\n").length).toBeLessThan(350);
  });
});

describe("FTA Batch 5 — SubstitutionSheet decomposition", () => {
  const parentSrc = readSrc("components/SubstitutionSheet.tsx");
  const itemSrc = readSrc("components/substitution/SubstitutionItem.tsx");
  const filterSrc = readSrc("components/substitution/EquipmentFilter.tsx");

  it("parent imports extracted components with expected content", () => {
    expect(parentSrc).toContain("SubstitutionItem");
    expect(parentSrc).toContain("EquipmentFilter");
    expect(itemSrc).toContain("matchColor");
    expect(filterSrc).toContain("Chip");
  });

  it("parent file is under 260 lines", () => {
    expect(parentSrc.split("\n").length).toBeLessThan(260);
  });
});

describe("FTA Batch 5 — achievements.tsx decomposition", () => {
  const parentSrc = readSrc("app/progress/achievements.tsx");
  const hookSrc = readSrc("hooks/useAchievements.ts");
  const badgeSrc = readSrc("components/achievements/AchievementBadge.tsx");

  it("parent imports extracted hook, badge, and type", () => {
    expect(parentSrc).toContain("useAchievements");
    expect(parentSrc).toContain("AchievementBadge");
    expect(hookSrc).toContain("export function useAchievements");
    expect(hookSrc).toContain("export type AchievementItem");
    expect(badgeSrc).toContain("Progress");
  });

  it("parent file is under 200 lines", () => {
    expect(parentSrc.split("\n").length).toBeLessThan(200);
  });
});

describe("FTA Batch 5 — ShareCard decomposition", () => {
  const parentSrc = readSrc("components/ShareCard.tsx");
  const statsSrc = readSrc("components/share/ShareCardStats.tsx");
  const exercisesSrc = readSrc("components/share/ShareCardExercises.tsx");

  it("parent imports extracted components with expected content", () => {
    expect(parentSrc).toContain("ShareCardStats");
    expect(parentSrc).toContain("ShareCardExercises");
    expect(statsSrc).toContain("Duration");
    expect(statsSrc).toContain("Sets");
    expect(statsSrc).toContain("Volume");
    expect(exercisesSrc).toContain("New PRs");
  });

  it("parent file is under 200 lines", () => {
    expect(parentSrc.split("\n").length).toBeLessThan(200);
  });
});
