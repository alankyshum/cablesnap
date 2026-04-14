import * as fs from "fs";
import * as path from "path";
import { CATEGORY_ICONS, semantic } from "../../constants/theme";

const indexSrc = fs.readFileSync(
  path.resolve(__dirname, "../../app/(tabs)/index.tsx"),
  "utf-8"
);

const exercisesSrc = fs.readFileSync(
  path.resolve(__dirname, "../../app/(tabs)/exercises.tsx"),
  "utf-8"
);

describe("CATEGORY_ICONS (constants/theme.ts)", () => {
  const expected = ["abs_core", "arms", "back", "chest", "legs_glutes", "shoulders"];

  it("has an icon for every category", () => {
    for (const cat of expected) {
      expect(CATEGORY_ICONS[cat]).toBeDefined();
      expect(typeof CATEGORY_ICONS[cat]).toBe("string");
    }
  });

  it("uses valid MaterialCommunityIcons names", () => {
    expect(CATEGORY_ICONS.abs_core).toBe("stomach");
    expect(CATEGORY_ICONS.arms).toBe("arm-flex");
    expect(CATEGORY_ICONS.back).toBe("human-handsup");
    expect(CATEGORY_ICONS.chest).toBe("weight-lifter");
    expect(CATEGORY_ICONS.legs_glutes).toBe("walk");
    expect(CATEGORY_ICONS.shoulders).toBe("account-arrow-up");
  });
});

describe("Home screen stats row (index.tsx)", () => {
  it("renders a stats row container", () => {
    expect(indexSrc).toContain("statsRow");
    expect(indexSrc).toContain("statCard");
  });

  it("shows fire icon for streak", () => {
    expect(indexSrc).toContain('name="fire"');
  });

  it("shows dumbbell icon for weekly workouts", () => {
    expect(indexSrc).toContain('name="dumbbell"');
  });

  it("shows trophy icon for recent PRs", () => {
    expect(indexSrc).toContain('name="trophy"');
  });

  it("does NOT contain old streak card", () => {
    expect(indexSrc).not.toContain("streakContent");
    expect(indexSrc).not.toContain("🔥 {streak}");
  });

  it("does NOT contain old PR list card", () => {
    expect(indexSrc).not.toContain("prCard");
    expect(indexSrc).not.toContain("prHeader");
    expect(indexSrc).not.toContain("Recent Personal Records");
  });

  it("has accessibility labels on each stat card", () => {
    expect(indexSrc).toContain("week streak");
    expect(indexSrc).toContain("workouts this week");
    expect(indexSrc).toContain("recent personal records");
  });

  it("shows 0 with muted styling when streak is zero", () => {
    expect(indexSrc).toContain("streak > 0 ? theme.colors.onSurface : theme.colors.onSurfaceVariant");
  });

  it("handles weekly count with and without schedule", () => {
    expect(indexSrc).toContain("weekDone}/${scheduled.length}");
    expect(indexSrc).toContain("${weekDone}");
  });
});

describe("Exercise list enhancements (exercises.tsx)", () => {
  it("imports CATEGORY_ICONS from theme", () => {
    expect(exercisesSrc).toContain("CATEGORY_ICONS");
  });

  it("includes volta in FilterType", () => {
    expect(exercisesSrc).toMatch(/FilterType\s*=.*"volta"/);
  });

  it("includes volta in FILTER_ALL", () => {
    expect(exercisesSrc).toContain('"volta"');
  });

  it("filters by is_voltra with strict equality", () => {
    expect(exercisesSrc).toContain("ex.is_voltra !== true");
  });

  it("shows Volta 1 label for volta filter", () => {
    expect(exercisesSrc).toContain('"Volta 1"');
  });

  it("renders V1 badge for voltra exercises", () => {
    expect(exercisesSrc).toContain("v1Badge");
    expect(exercisesSrc).toContain(">V1<");
  });

  it("has V1 badge accessibility label", () => {
    expect(exercisesSrc).toContain('accessibilityLabel="Volta 1 compatible"');
  });

  it("renders difficulty color bar", () => {
    expect(exercisesSrc).toContain("diffBar");
    expect(exercisesSrc).toContain("diffLabel");
  });

  it("has difficulty accessibility label", () => {
    expect(exercisesSrc).toMatch(/accessibilityLabel=\{?`Difficulty: \$\{diff\}`/);
  });

  it("defaults null difficulty to intermediate", () => {
    expect(exercisesSrc).toContain('item.difficulty || "intermediate"');
  });

  it("does not use hardcoded colors in text", () => {
    const lines = exercisesSrc.split("\n");
    for (const line of lines) {
      if (line.includes("color:") && line.includes("Text")) {
        expect(line).not.toMatch(/#[0-9a-fA-F]{3,6}/);
      }
    }
  });

  it("uses font sizes >= 12 for interactive text", () => {
    const matches = exercisesSrc.matchAll(/fontSize:\s*(\d+)/g);
    for (const m of matches) {
      expect(Number(m[1])).toBeGreaterThanOrEqual(12);
    }
  });

  it("renders category icons on filter chips", () => {
    expect(exercisesSrc).toContain("CATEGORY_ICONS[f]");
  });

  it("renders category icons on list item badges", () => {
    expect(exercisesSrc).toContain("CATEGORY_ICONS[item.category]");
  });
});

describe("semantic difficulty colors", () => {
  it("has beginner, intermediate, advanced colors", () => {
    expect(semantic.beginner).toBeDefined();
    expect(semantic.intermediate).toBeDefined();
    expect(semantic.advanced).toBeDefined();
  });
});
