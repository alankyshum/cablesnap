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

  it("parent imports useSessionActions hook", () => {
    expect(parentSrc).toContain("useSessionActions");
  });

  it("parent imports SessionListHeader", () => {
    expect(parentSrc).toContain("SessionListHeader");
  });

  it("parent imports SessionListFooter", () => {
    expect(parentSrc).toContain("SessionListFooter");
  });

  it("useSessionActions hook exports the function", () => {
    expect(hookSrc).toContain("export function useSessionActions");
  });

  it("useSessionActions manages elapsed timer state", () => {
    expect(hookSrc).toContain("elapsed");
    expect(hookSrc).toContain("setElapsed");
  });

  it("SessionListHeader renders rest banner", () => {
    expect(headerSrc).toContain("Rest Timer");
  });

  it("SessionListFooter renders finish and cancel buttons", () => {
    expect(footerSrc).toContain("Finish Workout");
    expect(footerSrc).toContain("Cancel Workout");
  });

  it("parent file is under 300 lines", () => {
    const lines = parentSrc.split("\n").length;
    expect(lines).toBeLessThan(300);
  });
});

describe("FTA Batch 5 — SubstitutionSheet decomposition", () => {
  const parentSrc = readSrc("components/SubstitutionSheet.tsx");
  const itemSrc = readSrc("components/substitution/SubstitutionItem.tsx");
  const filterSrc = readSrc("components/substitution/EquipmentFilter.tsx");

  it("parent imports SubstitutionItem", () => {
    expect(parentSrc).toContain("SubstitutionItem");
  });

  it("parent imports EquipmentFilter", () => {
    expect(parentSrc).toContain("EquipmentFilter");
  });

  it("SubstitutionItem has matchColor helper", () => {
    expect(itemSrc).toContain("matchColor");
  });

  it("EquipmentFilter renders chip row", () => {
    expect(filterSrc).toContain("Chip");
  });

  it("parent file is under 260 lines", () => {
    const lines = parentSrc.split("\n").length;
    expect(lines).toBeLessThan(260);
  });
});

describe("FTA Batch 5 — achievements.tsx decomposition", () => {
  const parentSrc = readSrc("app/progress/achievements.tsx");
  const hookSrc = readSrc("hooks/useAchievements.ts");
  const badgeSrc = readSrc("components/achievements/AchievementBadge.tsx");

  it("parent imports useAchievements hook", () => {
    expect(parentSrc).toContain("useAchievements");
  });

  it("parent imports AchievementBadge", () => {
    expect(parentSrc).toContain("AchievementBadge");
  });

  it("useAchievements hook exports the function", () => {
    expect(hookSrc).toContain("export function useAchievements");
  });

  it("useAchievements exports AchievementItem type", () => {
    expect(hookSrc).toContain("export type AchievementItem");
  });

  it("AchievementBadge renders progress bar for locked items", () => {
    expect(badgeSrc).toContain("Progress");
  });

  it("parent file is under 200 lines", () => {
    const lines = parentSrc.split("\n").length;
    expect(lines).toBeLessThan(200);
  });
});

describe("FTA Batch 5 — ShareCard decomposition", () => {
  const parentSrc = readSrc("components/ShareCard.tsx");
  const statsSrc = readSrc("components/share/ShareCardStats.tsx");
  const exercisesSrc = readSrc("components/share/ShareCardExercises.tsx");

  it("parent imports ShareCardStats", () => {
    expect(parentSrc).toContain("ShareCardStats");
  });

  it("parent imports ShareCardExercises", () => {
    expect(parentSrc).toContain("ShareCardExercises");
  });

  it("ShareCardStats renders duration, sets, volume", () => {
    expect(statsSrc).toContain("Duration");
    expect(statsSrc).toContain("Sets");
    expect(statsSrc).toContain("Volume");
  });

  it("ShareCardExercises renders PR section", () => {
    expect(exercisesSrc).toContain("New PRs");
  });

  it("parent file is under 200 lines", () => {
    const lines = parentSrc.split("\n").length;
    expect(lines).toBeLessThan(200);
  });
});
