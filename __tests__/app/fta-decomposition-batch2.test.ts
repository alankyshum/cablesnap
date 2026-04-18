/**
 * Structural tests verifying FTA batch 2 decomposition.
 * Ensures extracted components, hooks, and data files exist
 * and the parent files properly import from them.
 */
import * as fs from "fs";
import * as path from "path";

const resolve = (...parts: string[]) =>
  path.resolve(__dirname, "../..", ...parts);

const read = (filePath: string) =>
  fs.readFileSync(resolve(filePath), "utf-8");

describe("progress.tsx decomposition", () => {
  const mainSrc = read("app/(tabs)/progress.tsx");

  it("imports WorkoutSegment from extracted component", () => {
    expect(mainSrc).toContain("WorkoutSegment");
  });

  it("imports BodySegment from extracted component", () => {
    expect(mainSrc).toContain("BodySegment");
  });

  it("main file is under 100 lines", () => {
    const lines = mainSrc.split("\n").length;
    expect(lines).toBeLessThan(100);
  });

  it("WorkoutSegment file exists and uses useFloatingTabBarHeight", () => {
    const src = read("components/progress/WorkoutSegment.tsx");
    expect(src).toContain("useFloatingTabBarHeight");
  });

  it("BodySegment file exists and uses useBodyMetrics", () => {
    const src = read("components/progress/BodySegment.tsx");
    expect(src).toContain("useBodyMetrics");
  });

  it("useBodyMetrics hook exists", () => {
    expect(fs.existsSync(resolve("hooks/useBodyMetrics.ts"))).toBe(true);
  });

  it("WeightLogModal exists", () => {
    expect(fs.existsSync(resolve("components/progress/WeightLogModal.tsx"))).toBe(true);
  });
});

describe("session/detail/[id].tsx decomposition", () => {
  const mainSrc = read("app/session/detail/[id].tsx");

  it("imports useSessionDetail from extracted hook", () => {
    expect(mainSrc).toContain("useSessionDetail");
  });

  it("main file is under 200 lines", () => {
    const lines = mainSrc.split("\n").length;
    expect(lines).toBeLessThan(200);
  });

  it("SummaryCard exists", () => {
    expect(fs.existsSync(resolve("components/session/detail/SummaryCard.tsx"))).toBe(true);
  });

  it("RatingNotesCard exists", () => {
    expect(fs.existsSync(resolve("components/session/detail/RatingNotesCard.tsx"))).toBe(true);
  });

  it("ExerciseGroupRow exists and handles set types", () => {
    const src = read("components/session/detail/ExerciseGroupRow.tsx");
    expect(src).toContain("SET_TYPE_LABELS");
  });

  it("TemplateModal exists", () => {
    expect(fs.existsSync(resolve("components/session/detail/TemplateModal.tsx"))).toBe(true);
  });
});

describe("exercise-nlp.ts decomposition", () => {
  const mainSrc = read("lib/exercise-nlp.ts");
  const dataSrc = read("lib/exercise-nlp-data.ts");

  it("main file imports data from exercise-nlp-data", () => {
    expect(mainSrc).toContain("exercise-nlp-data");
  });

  it("main file is under 250 lines", () => {
    const lines = mainSrc.split("\n").length;
    expect(lines).toBeLessThan(250);
  });

  it("data file exports ARCHETYPES", () => {
    expect(dataSrc).toContain("export const ARCHETYPES");
  });

  it("data file exports EQUIPMENT_KEYWORDS", () => {
    expect(dataSrc).toContain("export const EQUIPMENT_KEYWORDS");
  });

  it("data file exports MODIFIERS", () => {
    expect(dataSrc).toContain("export const MODIFIERS");
  });

  it("data file exports MUSCLE_KEYWORDS", () => {
    expect(dataSrc).toContain("export const MUSCLE_KEYWORDS");
  });
});

describe("timer.tsx decomposition", () => {
  const mainSrc = read("app/tools/timer.tsx");

  it("imports useTimerEngine from extracted hook", () => {
    expect(mainSrc).toContain("useTimerEngine");
  });

  it("main file is under 300 lines", () => {
    const lines = mainSrc.split("\n").length;
    expect(lines).toBeLessThan(300);
  });

  it("TimerRing exists", () => {
    expect(fs.existsSync(resolve("components/timer/TimerRing.tsx"))).toBe(true);
  });

  it("ConfigPanel exists", () => {
    expect(fs.existsSync(resolve("components/timer/ConfigPanel.tsx"))).toBe(true);
  });

  it("TimerControls exists", () => {
    expect(fs.existsSync(resolve("components/timer/TimerControls.tsx"))).toBe(true);
  });

  it("useTimerEngine hook exists and manages timer state", () => {
    const src = read("hooks/useTimerEngine.ts");
    expect(src).toContain("useState");
    expect(src).toContain("handleStart");
    expect(src).toContain("handleReset");
  });
});
