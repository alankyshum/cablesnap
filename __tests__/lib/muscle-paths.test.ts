import {
  FRONT_PATHS,
  REAR_PATHS,
  BODY_OUTLINE_FRONT,
  BODY_OUTLINE_REAR,
  ALL_FRONT_MUSCLES,
  ALL_REAR_MUSCLES,
  ALL_MUSCLES,
} from "../../components/muscle-paths";
import type { MuscleGroup } from "../../lib/types";

describe("muscle-paths", () => {
  describe("body outlines", () => {
    it("defines front outline", () => {
      expect(BODY_OUTLINE_FRONT.length).toBeGreaterThan(0);
      expect(BODY_OUTLINE_FRONT).toContain("M");
    });

    it("defines rear outline", () => {
      expect(BODY_OUTLINE_REAR.length).toBeGreaterThan(0);
      expect(BODY_OUTLINE_REAR).toContain("M");
    });
  });

  describe("front paths", () => {
    it("has paths for expected front muscles", () => {
      const expected: MuscleGroup[] = ["chest", "shoulders", "biceps", "forearms", "core", "quads", "calves"];
      for (const m of expected) {
        expect(FRONT_PATHS[m]).toBeDefined();
        expect(FRONT_PATHS[m]!.length).toBeGreaterThan(0);
      }
    });

    it("does not have back-only muscles", () => {
      expect(FRONT_PATHS.back).toBeUndefined();
      expect(FRONT_PATHS.lats).toBeUndefined();
      expect(FRONT_PATHS.traps).toBeUndefined();
      expect(FRONT_PATHS.glutes).toBeUndefined();
      expect(FRONT_PATHS.hamstrings).toBeUndefined();
    });

    it("all paths are valid SVG d strings", () => {
      for (const [, ds] of Object.entries(FRONT_PATHS)) {
        for (const d of ds!) {
          expect(d).toMatch(/^[MLCQZmlcqz0-9., -]+$/);
        }
      }
    });

    it("bilateral muscles have two paths", () => {
      expect(FRONT_PATHS.chest!.length).toBe(2);
      expect(FRONT_PATHS.shoulders!.length).toBe(2);
      expect(FRONT_PATHS.biceps!.length).toBe(2);
    });
  });

  describe("rear paths", () => {
    it("has paths for expected rear muscles", () => {
      const expected: MuscleGroup[] = ["shoulders", "triceps", "forearms", "traps", "back", "lats", "glutes", "hamstrings", "calves"];
      for (const m of expected) {
        expect(REAR_PATHS[m]).toBeDefined();
        expect(REAR_PATHS[m]!.length).toBeGreaterThan(0);
      }
    });

    it("does not have front-only muscles", () => {
      expect(REAR_PATHS.chest).toBeUndefined();
      expect(REAR_PATHS.biceps).toBeUndefined();
      expect(REAR_PATHS.core).toBeUndefined();
      expect(REAR_PATHS.quads).toBeUndefined();
    });
  });

  describe("muscle lists", () => {
    it("ALL_FRONT_MUSCLES matches FRONT_PATHS keys", () => {
      expect(ALL_FRONT_MUSCLES.sort()).toEqual(Object.keys(FRONT_PATHS).sort());
    });

    it("ALL_REAR_MUSCLES matches REAR_PATHS keys", () => {
      expect(ALL_REAR_MUSCLES.sort()).toEqual(Object.keys(REAR_PATHS).sort());
    });

    it("ALL_MUSCLES contains all 14 groups", () => {
      expect(ALL_MUSCLES.length).toBe(14);
      expect(ALL_MUSCLES).toContain("chest");
      expect(ALL_MUSCLES).toContain("full_body");
    });
  });
});
