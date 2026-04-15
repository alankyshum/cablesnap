import { seedExercises } from "../../lib/seed";
import { communityExercises } from "../../lib/seed-community";
import type { Category, Equipment } from "../../lib/types";

const VALID_CATEGORIES: Category[] = [
  "abs_core",
  "arms",
  "back",
  "chest",
  "legs_glutes",
  "shoulders",
];

const VALID_EQUIPMENT: Equipment[] = [
  "barbell",
  "dumbbell",
  "cable",
  "machine",
  "bodyweight",
  "kettlebell",
];

describe("seedExercises", () => {
  const exercises = seedExercises();
  const voltra = exercises.filter((e) => e.is_voltra);
  const mw = exercises.filter((e) => !e.is_voltra);

  it("returns 121 total exercises (56 Voltra + 65 community)", () => {
    expect(exercises).toHaveLength(121);
    expect(voltra).toHaveLength(56);
    expect(mw).toHaveLength(65);
  });

  it("all exercises have unique IDs", () => {
    const ids = new Set<string>();
    for (const e of exercises) ids.add(e.id);
    expect(ids.size).toBe(121);
  });

  it("all exercises are not custom", () => {
    for (const e of exercises) {
      expect(e.is_custom).toBe(false);
    }
  });

  it("all exercises use valid categories", () => {
    for (const e of exercises) {
      expect(VALID_CATEGORIES).toContain(e.category);
    }
  });

  it("all exercises use valid equipment", () => {
    for (const e of exercises) {
      expect(VALID_EQUIPMENT).toContain(e.equipment);
    }
  });

  it("distributes exercises across all categories", () => {
    const counts = new Map<string, number>();
    for (const e of exercises) {
      counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
    }
    for (const cat of VALID_CATEGORIES) {
      expect(counts.get(cat)).toBeGreaterThanOrEqual(9);
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

describe("Voltra exercises", () => {
  const voltra = seedExercises().filter((e) => e.is_voltra);

  it("all use cable equipment", () => {
    for (const e of voltra) {
      expect(e.equipment).toBe("cable");
    }
  });

  it("all have Voltra metadata", () => {
    for (const e of voltra) {
      expect(e.mount_position).toBeTruthy();
      expect(e.attachment).toBeTruthy();
      expect(e.training_modes).toBeDefined();
      expect(e.training_modes!.length).toBeGreaterThan(0);
    }
  });
});

describe("community exercises", () => {
  const mw = communityExercises();

  it("returns 65 exercises", () => {
    expect(mw).toHaveLength(65);
  });

  it("all have unique IDs", () => {
    const ids = new Set<string>();
    for (const e of mw) ids.add(e.id);
    expect(ids.size).toBe(65);
  });

  it("all use cable or bodyweight equipment", () => {
    for (const e of mw) {
      expect(["cable", "bodyweight"]).toContain(e.equipment);
    }
  });

  it("none are marked as Voltra", () => {
    for (const e of mw) {
      expect(e.is_voltra).toBeFalsy();
    }
  });

  it("covers all 6 categories", () => {
    const cats = new Set<string>();
    for (const e of mw) cats.add(e.category);
    for (const cat of VALID_CATEGORIES) {
      expect(cats).toContain(cat);
    }
  });

  it("all have difficulty set", () => {
    for (const e of mw) {
      expect(["beginner", "intermediate", "advanced"]).toContain(e.difficulty);
    }
  });

  it("all have instructions", () => {
    for (const e of mw) {
      expect(e.instructions).toBeTruthy();
    }
  });
});
