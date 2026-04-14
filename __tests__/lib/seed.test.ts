import { seedExercises } from "../../lib/seed";
import type { Category } from "../../lib/types";

const VALID_CATEGORIES: Category[] = [
  "abs_core",
  "arms",
  "back",
  "chest",
  "legs_glutes",
  "shoulders",
];

describe("seedExercises", () => {
  const exercises = seedExercises();

  it("returns 54 Voltra exercises", () => {
    expect(exercises).toHaveLength(54);
  });

  it("all exercises have unique IDs", () => {
    const ids = exercises.map((e) => e.id);
    expect(new Set(ids).size).toBe(54);
  });

  it("all exercises use cable equipment", () => {
    for (const e of exercises) {
      expect(e.equipment).toBe("cable");
    }
  });

  it("all exercises are not custom", () => {
    for (const e of exercises) {
      expect(e.is_custom).toBe(false);
    }
  });

  it("all exercises have Voltra metadata", () => {
    for (const e of exercises) {
      expect(e.is_voltra).toBe(true);
      expect(e.mount_position).toBeTruthy();
      expect(e.attachment).toBeTruthy();
      expect(e.training_modes).toBeDefined();
      expect(e.training_modes!.length).toBeGreaterThan(0);
    }
  });

  it("all exercises use valid categories", () => {
    for (const e of exercises) {
      expect(VALID_CATEGORIES).toContain(e.category);
    }
  });

  it("distributes 9 exercises per category", () => {
    const counts = new Map<string, number>();
    for (const e of exercises) {
      counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
    }
    for (const cat of VALID_CATEGORIES) {
      expect(counts.get(cat)).toBe(9);
    }
  });

  it("all exercises have at least one primary muscle", () => {
    for (const e of exercises) {
      expect(e.primary_muscles.length).toBeGreaterThan(0);
    }
  });

  it("all exercises have instructions", () => {
    for (const e of exercises) {
      expect(e.instructions).toBeTruthy();
    }
  });
});
