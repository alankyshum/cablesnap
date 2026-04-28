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
  it("provides valid MaterialCommunityIcons name for every category", () => {
    const expectedIcons: Record<string, string> = {
      abs_core: "stomach",
      arms: "arm-flex",
      back: "human-handsup",
      chest: "weight-lifter",
      legs_glutes: "walk",
      shoulders: "account-arrow-up",
    };
    for (const [cat, icon] of Object.entries(expectedIcons)) {
      expect(CATEGORY_ICONS[cat]).toBeDefined();
      expect(typeof CATEGORY_ICONS[cat]).toBe("string");
      expect(CATEGORY_ICONS[cat]).toBe(icon);
    }
  });
});

describe("Home screen stats row", () => {
  it("renders stats row container with required icons and a11y labels", () => {
    // container/structure
    expect(statsRowSrc).toContain("row");
    expect(statsRowSrc).toContain("stat");
    // icons
    expect(statsRowSrc).toContain('"fire"');
    expect(statsRowSrc).toContain('"calendar-check"');
    expect(statsRowSrc).toContain('"trophy"');
    // accessibility labels
    expect(statsRowSrc).toContain("week streak");
    expect(statsRowSrc).toContain("workouts this week");
    expect(statsRowSrc).toContain("recent personal records");
    // streak/value rendering and weekly count handling
    expect(statsRowSrc).toContain("String(s.value)");
    expect(statsRowSrc).toContain("completedCount");
    expect(statsRowSrc).toContain("targetCount");
  });

  it("does NOT contain old streak or PR list cards on home", () => {
    expect(indexSrc).not.toContain("streakContent");
    expect(indexSrc).not.toContain("🔥 {streak}");
    expect(indexSrc).not.toContain("prCard");
    expect(indexSrc).not.toContain("prHeader");
    expect(indexSrc).not.toContain("Recent Personal Records");
  });
});

describe("Exercise list enhancements (exercises.tsx)", () => {
  it("supports custom filter type, label, badge and is_custom filter logic", () => {
    expect(exercisesSrc).toMatch(/FilterType\s*=.*"custom"/);
    expect(exercisesSrc).toContain('"custom"');
    expect(exercisesSrc).toContain("is_custom");
    expect(exercisesSrc).toContain('"Custom"');
    expect(exercisesSrc).toContain("customBadge");
    expect(exercisesSrc).toContain(">Custom<");
  });

  it("renders category icons on filter chips and difficulty colors with a11y", () => {
    expect(exercisesSrc).toContain("CATEGORY_ICONS");
    expect(exercisesSrc).toContain("CATEGORY_ICONS[f]");
    expect(exercisesSrc).toContain("DIFFICULTY_COLORS");
    expect(exercisesSrc).toContain("difficultyText");
    expect(exercisesSrc).toMatch(/Difficulty: \$\{diff\}/);
    expect(exercisesSrc).toContain('item.difficulty || "intermediate"');
  });

  it("avoids hardcoded text colors and uses font sizes >= 11 for interactive text", () => {
    const lines = exercisesSrc.split("\n");
    for (const line of lines) {
      if (line.includes("color:") && line.includes("Text")) {
        expect(line).not.toMatch(/#[0-9a-fA-F]{3,6}/);
      }
    }
    const matches = exercisesSrc.matchAll(/fontSize:\s*(\d+)/g);
    for (const m of matches) {
      expect(Number(m[1])).toBeGreaterThanOrEqual(11);
    }
  });
});

describe("semantic difficulty colors", () => {
  it("has beginner, intermediate, advanced colors", () => {
    expect(semantic.beginner).toBeDefined();
    expect(semantic.intermediate).toBeDefined();
    expect(semantic.advanced).toBeDefined();
  });
});
