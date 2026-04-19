import { RECOVERY_HOURS } from "../../lib/db/recovery";
import { SLUG_MAP } from "../../lib/muscle-map-utils";
import type { MuscleGroup } from "../../lib/types";

describe("recovery", () => {
  describe("RECOVERY_HOURS", () => {
    it("defines thresholds for large muscle groups at 72h", () => {
      const largeMuscles = ["quads", "hamstrings", "glutes", "lats", "traps", "back"];
      for (const m of largeMuscles) {
        expect(RECOVERY_HOURS[m]).toBe(72);
      }
    });

    it("defines thresholds for medium muscle groups at 48h", () => {
      const mediumMuscles = ["chest", "shoulders"];
      for (const m of mediumMuscles) {
        expect(RECOVERY_HOURS[m]).toBe(48);
      }
    });

    it("defines thresholds for small muscle groups at 36h", () => {
      const smallMuscles = ["biceps", "triceps", "forearms", "calves", "core"];
      for (const m of smallMuscles) {
        expect(RECOVERY_HOURS[m]).toBe(36);
      }
    });

    it("does not include full_body", () => {
      expect(RECOVERY_HOURS["full_body"]).toBeUndefined();
    });
  });
});

describe("muscle-map-utils SLUG_MAP", () => {
  const allTrackable: MuscleGroup[] = [
    "chest", "back", "shoulders", "biceps", "triceps",
    "quads", "hamstrings", "glutes", "calves", "core",
    "forearms", "traps", "lats",
  ];

  it("maps every trackable muscle group to at least one slug", () => {
    for (const m of allTrackable) {
      expect(SLUG_MAP[m]).toBeDefined();
      expect(SLUG_MAP[m].length).toBeGreaterThan(0);
    }
  });

  it("maps full_body to many slugs", () => {
    expect(SLUG_MAP.full_body.length).toBeGreaterThan(10);
  });

  it("chest maps to chest slug", () => {
    expect(SLUG_MAP.chest).toEqual(["chest"]);
  });

  it("core maps to abs and obliques slugs", () => {
    expect(SLUG_MAP.core).toEqual(["abs", "obliques"]);
  });

  it("back maps to upper-back and lower-back", () => {
    expect(SLUG_MAP.back).toEqual(["upper-back", "lower-back"]);
  });

  it("all slug values are strings", () => {
    for (const m of Object.keys(SLUG_MAP) as MuscleGroup[]) {
      for (const slug of SLUG_MAP[m]) {
        expect(typeof slug).toBe("string");
      }
    }
  });
});
