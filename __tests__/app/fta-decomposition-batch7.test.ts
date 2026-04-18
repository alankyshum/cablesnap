/**
 * FTA Decomposition Batch 7 — structural tests
 * Verifies extraction of sub-modules from usePhotoActions, ExercisePickerSheet,
 * BodyCards, and recommend.tsx
 */
import * as fs from "fs";
import * as path from "path";

const root = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf-8");
}

function lines(rel: string): number {
  return read(rel).split("\n").length;
}

describe("Batch 7 — usePhotoActions decomposition", () => {
  test("usePhotoActions.ts imports from photo-processing", () => {
    expect(read("hooks/usePhotoActions.ts")).toContain("from \"../lib/photo-processing\"");
  });

  test("usePhotoActions.ts imports usePhotoPermissions", () => {
    expect(read("hooks/usePhotoActions.ts")).toContain("from \"./usePhotoPermissions\"");
  });

  test("lib/photo-processing.ts exports processImage and today", () => {
    const src = read("lib/photo-processing.ts");
    expect(src).toContain("export async function processImage");
    expect(src).toContain("export function today");
  });

  test("hooks/usePhotoPermissions.ts exports usePhotoPermissions", () => {
    expect(read("hooks/usePhotoPermissions.ts")).toContain("export function usePhotoPermissions");
  });

  test("usePhotoActions.ts reduced below 320 lines", () => {
    expect(lines("hooks/usePhotoActions.ts")).toBeLessThan(320);
  });
});

describe("Batch 7 — ExercisePickerSheet decomposition", () => {
  test("ExercisePickerSheet imports ExerciseItem", () => {
    expect(read("components/ExercisePickerSheet.tsx")).toContain("from \"./exercise-picker/ExerciseItem\"");
  });

  test("ExerciseItem.tsx exports ITEM_HEIGHT and default memo component", () => {
    const src = read("components/exercise-picker/ExerciseItem.tsx");
    expect(src).toContain("export const ITEM_HEIGHT");
    expect(src).toContain("React.memo");
  });

  test("ExercisePickerSheet.tsx reduced below 300 lines", () => {
    expect(lines("components/ExercisePickerSheet.tsx")).toBeLessThan(300);
  });
});

describe("Batch 7 — BodyCards decomposition", () => {
  test("BodyCards.tsx re-exports ChartCard and GoalsCard", () => {
    const src = read("components/progress/BodyCards.tsx");
    expect(src).toContain("export { ChartCard }");
    expect(src).toContain("export { GoalsCard }");
  });

  test("ChartCard.tsx exports ChartCard function", () => {
    expect(read("components/progress/ChartCard.tsx")).toContain("export function ChartCard");
  });

  test("GoalsCard.tsx exports GoalsCard function", () => {
    expect(read("components/progress/GoalsCard.tsx")).toContain("export function GoalsCard");
  });

  test("BodyCards.tsx reduced below 180 lines", () => {
    expect(lines("components/progress/BodyCards.tsx")).toBeLessThan(180);
  });
});

describe("Batch 7 — recommend.tsx decomposition", () => {
  test("recommend.tsx imports RecommendCard", () => {
    expect(read("app/onboarding/recommend.tsx")).toContain("from \"@/components/onboarding/RecommendCard\"");
  });

  test("RecommendCard.tsx exports RecommendCard", () => {
    expect(read("components/onboarding/RecommendCard.tsx")).toContain("export function RecommendCard");
  });

  test("recommend.tsx reduced below 260 lines", () => {
    expect(lines("app/onboarding/recommend.tsx")).toBeLessThan(260);
  });
});
