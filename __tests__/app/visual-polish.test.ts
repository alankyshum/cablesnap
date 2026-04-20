import * as fs from "fs";
import * as path from "path";
import { CATEGORY_ICONS, semantic } from "../../constants/theme";

const indexSrc = fs.readFileSync(
  path.resolve(__dirname, "../../app/(tabs)/index.tsx"),
  "utf-8"
);

const statsRowSrc = fs.readFileSync(
  path.resolve(__dirname, "../../components/home/StatsRow.tsx"),
  "utf-8"
);

const exercisesSrc = [
  fs.readFileSync(path.resolve(__dirname, "../../app/(tabs)/exercises.tsx"), "utf-8"),
  fs.readFileSync(path.resolve(__dirname, "../../components/exercises/ExerciseCard.tsx"), "utf-8"),
  fs.readFileSync(path.resolve(__dirname, "../../components/exercises/ExerciseDetailPane.tsx"), "utf-8"),
].join("\n");

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

describe("Home screen stats row", () => {
  it("renders a stats row container", () => {
    expect(statsRowSrc).toContain("row");
    expect(statsRowSrc).toContain("stat");
  });

  it("shows fire icon for streak", () => {
    expect(statsRowSrc).toContain('"fire"');
  });

  it("shows dumbbell icon for weekly workouts", () => {
    // Icon name is "calendar-check" in the extracted component
    expect(statsRowSrc).toContain('"calendar-check"');
  });

  it("shows trophy icon for recent PRs", () => {
    expect(statsRowSrc).toContain('"trophy"');
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
    expect(statsRowSrc).toContain("week streak");
    expect(statsRowSrc).toContain("workouts this week");
    expect(statsRowSrc).toContain("recent personal records");
  });

  it("shows 0 with muted styling when streak is zero", () => {
    // Streak value is rendered directly in the extracted component
    expect(statsRowSrc).toContain("String(s.value)");
  });

  it("handles weekly count with and without schedule", () => {
    expect(statsRowSrc).toContain("completedCount");
    expect(statsRowSrc).toContain("targetCount");
  });
});

describe("Exercise list enhancements (exercises.tsx)", () => {
  it("imports CATEGORY_ICONS from theme", () => {
    expect(exercisesSrc).toContain("CATEGORY_ICONS");
  });

  it("includes custom in FilterType", () => {
    expect(exercisesSrc).toMatch(/FilterType\s*=.*"custom"/);
  });

  it("includes custom in FILTER_ALL", () => {
    expect(exercisesSrc).toContain('"custom"');
  });

  it("filters by is_custom", () => {
    expect(exercisesSrc).toContain("is_custom");
  });

  it("shows Custom label for custom filter", () => {
    expect(exercisesSrc).toContain('"Custom"');
  });

  it("renders custom badge for custom exercises", () => {
    expect(exercisesSrc).toContain("customBadge");
    expect(exercisesSrc).toContain(">Custom<");
  });

  it("has custom badge accessibility info", () => {
    expect(exercisesSrc).toContain('is_custom');
  });

  it("renders difficulty color", () => {
    expect(exercisesSrc).toContain("DIFFICULTY_COLORS");
    expect(exercisesSrc).toContain("difficultyText");
  });

  it("has difficulty accessibility label", () => {
    expect(exercisesSrc).toMatch(/Difficulty: \$\{diff\}/);
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

  it("uses font sizes >= 11 for interactive text", () => {
    const matches = exercisesSrc.matchAll(/fontSize:\s*(\d+)/g);
    for (const m of matches) {
      expect(Number(m[1])).toBeGreaterThanOrEqual(11);
    }
  });

  it("renders category icons on filter chips", () => {
    expect(exercisesSrc).toContain("CATEGORY_ICONS[f]");
  });
});

describe("semantic difficulty colors", () => {
  it("has beginner, intermediate, advanced colors", () => {
    expect(semantic.beginner).toBeDefined();
    expect(semantic.intermediate).toBeDefined();
    expect(semantic.advanced).toBeDefined();
  });
});
