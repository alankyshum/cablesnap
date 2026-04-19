import {
  computeTemplateReadiness,
  getReadinessBadge,
  buildRecoveryMap,
  hasWorkoutHistory,
  computeAllTemplateReadiness,
} from "../../lib/recovery-readiness";
import type { MuscleRecoveryStatus } from "../../lib/db/recovery";
import type { MuscleGroup } from "../../lib/types";

describe("recovery-readiness", () => {
  const makeRecovery = (
    muscle: MuscleGroup,
    status: "recovered" | "partial" | "fatigued" | "no_data"
  ): MuscleRecoveryStatus => ({
    muscle,
    lastTrainedAt: status === "no_data" ? null : Date.now() - 24 * 60 * 60 * 1000,
    hoursAgo: status === "no_data" ? null : 24,
    status,
  });

  describe("buildRecoveryMap", () => {
    it("builds a map from recovery status array", () => {
      const statuses = [
        makeRecovery("chest", "recovered"),
        makeRecovery("back", "fatigued"),
      ];
      const map = buildRecoveryMap(statuses);
      expect(map.get("chest")).toBe("recovered");
      expect(map.get("back")).toBe("fatigued");
      expect(map.get("biceps")).toBeUndefined();
    });
  });

  describe("computeTemplateReadiness", () => {
    it("returns null for empty muscles array", () => {
      const map = buildRecoveryMap([]);
      expect(computeTemplateReadiness([], map)).toBeNull();
    });

    it("returns 1.0 when all muscles are recovered", () => {
      const map = buildRecoveryMap([
        makeRecovery("chest", "recovered"),
        makeRecovery("triceps", "recovered"),
      ]);
      expect(computeTemplateReadiness(["chest", "triceps"], map)).toBe(1.0);
    });

    it("returns 0.0 when all muscles are fatigued", () => {
      const map = buildRecoveryMap([
        makeRecovery("quads", "fatigued"),
        makeRecovery("hamstrings", "fatigued"),
      ]);
      expect(computeTemplateReadiness(["quads", "hamstrings"], map)).toBe(0.0);
    });

    it("returns 0.5 when all muscles are partial", () => {
      const map = buildRecoveryMap([
        makeRecovery("chest", "partial"),
        makeRecovery("back", "partial"),
      ]);
      expect(computeTemplateReadiness(["chest", "back"], map)).toBe(0.5);
    });

    it("returns average score for mixed recovery", () => {
      const map = buildRecoveryMap([
        makeRecovery("chest", "recovered"),  // 1.0
        makeRecovery("triceps", "fatigued"), // 0.0
      ]);
      // (1.0 + 0.0) / 2 = 0.5
      expect(computeTemplateReadiness(["chest", "triceps"], map)).toBe(0.5);
    });

    it("uses 0.75 for muscles with no_data", () => {
      const map = buildRecoveryMap([
        makeRecovery("chest", "recovered"),  // 1.0
        makeRecovery("biceps", "no_data"),   // 0.75
      ]);
      // (1.0 + 0.75) / 2 = 0.875
      expect(computeTemplateReadiness(["chest", "biceps"], map)).toBe(0.875);
    });

    it("defaults to no_data (0.75) for muscles not in recovery map", () => {
      const map = buildRecoveryMap([
        makeRecovery("chest", "recovered"),
      ]);
      // forearms not in map → no_data → 0.75
      // (1.0 + 0.75) / 2 = 0.875
      expect(computeTemplateReadiness(["chest", "forearms"], map)).toBe(0.875);
    });

    it("handles single muscle correctly", () => {
      const map = buildRecoveryMap([makeRecovery("chest", "recovered")]);
      expect(computeTemplateReadiness(["chest"], map)).toBe(1.0);
    });

    it("handles three muscles with mixed status", () => {
      const map = buildRecoveryMap([
        makeRecovery("chest", "recovered"),    // 1.0
        makeRecovery("shoulders", "partial"),  // 0.5
        makeRecovery("triceps", "fatigued"),   // 0.0
      ]);
      // (1.0 + 0.5 + 0.0) / 3 = 0.5
      expect(computeTemplateReadiness(["chest", "shoulders", "triceps"], map)).toBeCloseTo(0.5);
    });
  });

  describe("getReadinessBadge", () => {
    it("returns NO_DATA for null score", () => {
      expect(getReadinessBadge(null)).toBe("NO_DATA");
    });

    it("returns READY for score >= 0.8", () => {
      expect(getReadinessBadge(1.0)).toBe("READY");
      expect(getReadinessBadge(0.8)).toBe("READY");
      expect(getReadinessBadge(0.9)).toBe("READY");
    });

    it("returns PARTIAL for score >= 0.5 and < 0.8", () => {
      expect(getReadinessBadge(0.5)).toBe("PARTIAL");
      expect(getReadinessBadge(0.79)).toBe("PARTIAL");
      expect(getReadinessBadge(0.6)).toBe("PARTIAL");
    });

    it("returns REST for score < 0.5", () => {
      expect(getReadinessBadge(0.0)).toBe("REST");
      expect(getReadinessBadge(0.49)).toBe("REST");
      expect(getReadinessBadge(0.1)).toBe("REST");
    });
  });

  describe("hasWorkoutHistory", () => {
    it("returns false when all muscles are no_data", () => {
      expect(hasWorkoutHistory([
        makeRecovery("chest", "no_data"),
        makeRecovery("back", "no_data"),
      ])).toBe(false);
    });

    it("returns true when at least one muscle has data", () => {
      expect(hasWorkoutHistory([
        makeRecovery("chest", "recovered"),
        makeRecovery("back", "no_data"),
      ])).toBe(true);
    });

    it("returns false for empty array", () => {
      expect(hasWorkoutHistory([])).toBe(false);
    });
  });

  describe("computeAllTemplateReadiness", () => {
    it("computes readiness for multiple templates", () => {
      const templateMuscles: Record<string, MuscleGroup[]> = {
        "tpl-1": ["chest", "triceps"],
        "tpl-2": ["quads", "hamstrings"],
      };
      const recoveryStatus: MuscleRecoveryStatus[] = [
        makeRecovery("chest", "recovered"),
        makeRecovery("triceps", "recovered"),
        makeRecovery("quads", "fatigued"),
        makeRecovery("hamstrings", "fatigued"),
      ];

      const result = computeAllTemplateReadiness(templateMuscles, recoveryStatus);

      expect(result["tpl-1"].badge).toBe("READY");
      expect(result["tpl-1"].score).toBe(1.0);
      expect(result["tpl-2"].badge).toBe("REST");
      expect(result["tpl-2"].score).toBe(0.0);
    });

    it("handles templates with no muscles", () => {
      const templateMuscles: Record<string, MuscleGroup[]> = {
        "tpl-empty": [],
      };
      const result = computeAllTemplateReadiness(templateMuscles, []);

      expect(result["tpl-empty"].badge).toBe("NO_DATA");
      expect(result["tpl-empty"].score).toBe(0);
    });

    it("handles empty template muscles map", () => {
      const result = computeAllTemplateReadiness({}, []);
      expect(Object.keys(result)).toHaveLength(0);
    });
  });
});
