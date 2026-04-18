import * as fs from "fs";
import * as path from "path";

/**
 * Structural tests for BLD-307: Swap-exercise fix + long-press exercise delete.
 * Verifies the session screen has:
 * 1. Long-press handler on exercise name for deletion
 * 2. deleteSetsBatch import for batch deletion
 * 3. Countdown snackbar pattern for delete with undo
 * 4. Haptic feedback on long-press
 * 5. dismissRest on exercise delete
 */

const sessionSrc = fs.readFileSync(
  path.resolve(__dirname, "../../app/session/[id].tsx"),
  "utf-8"
);

const sessionDbSrc = fs.readFileSync(
  path.resolve(__dirname, "../../lib/db/sessions.ts"),
  "utf-8"
);

const dbIndexSrc = fs.readFileSync(
  path.resolve(__dirname, "../../lib/db/index.ts"),
  "utf-8"
);

describe("BLD-307: Swap exercise + long-press delete", () => {
  describe("Long-press exercise delete", () => {
    it("ExerciseGroupCard accepts onDeleteExercise prop", () => {
      expect(sessionSrc).toContain("onDeleteExercise:");
      expect(sessionSrc).toContain("onDeleteExercise: (exerciseId: string) => void");
    });

    it("exercise name has onLongPress for delete", () => {
      const longPressMatches = sessionSrc.match(/onLongPress=\{.*onDeleteExercise/g);
      // Should appear in both compact and wide layout
      expect(longPressMatches).not.toBeNull();
      expect(longPressMatches!.length).toBeGreaterThanOrEqual(2);
    });

    it("has accessibility hint for long-press delete", () => {
      expect(sessionSrc).toContain("Long press to remove exercise");
    });

    it("has accessibilityLabel and accessibilityRole on delete pressable", () => {
      expect(sessionSrc).toContain('accessibilityLabel={`Remove ${group.name}`}');
      expect(sessionSrc).toContain('accessibilityRole="button"');
    });

    it("wraps deleteSetsBatch in try/catch for error resilience", () => {
      // Timeout callback should have try/catch around deleteSetsBatch
      expect(sessionSrc).toContain("await deleteSetsBatch(setIds)");
      expect(sessionSrc).toContain("Failed to delete exercise. Restored.");
    });

    it("provides haptic feedback on long-press", () => {
      expect(sessionSrc).toContain("Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)");
    });

    it("shows countdown snackbar with exercise name", () => {
      expect(sessionSrc).toMatch(/Removing \$\{group\.name\}\.\.\. \(\d+s\)/);
    });

    it("has UNDO action on delete snackbar", () => {
      expect(sessionSrc).toContain('label: "UNDO"');
    });

    it("clears rest timer on exercise delete", () => {
      // The handleDeleteExercise function should call dismissRest
      expect(sessionSrc).toContain("dismissRest()");
    });

    it("passes onDeleteExercise to ExerciseGroupCard in FlashList", () => {
      expect(sessionSrc).toContain("onDeleteExercise={handleDeleteExercise}");
    });

    it("cleans up delete timers on unmount", () => {
      expect(sessionSrc).toContain("deleteExerciseTimer.current");
      expect(sessionSrc).toContain("deleteCountdownInterval.current");
    });
  });

  describe("Batch delete in sessions.ts", () => {
    it("exports deleteSetsBatch function", () => {
      expect(sessionDbSrc).toContain("export async function deleteSetsBatch");
    });

    it("deleteSetsBatch uses IN clause for batch delete", () => {
      expect(sessionDbSrc).toMatch(/DELETE FROM workout_sets WHERE id IN/);
    });

    it("deleteSetsBatch is exported from db/index.ts", () => {
      expect(dbIndexSrc).toContain("deleteSetsBatch");
    });
  });

  describe("Swap exercise correctness", () => {
    it("swapExerciseInSession only modifies uncompleted sets", () => {
      expect(sessionDbSrc).toMatch(/completed = 0/);
    });

    it("swapExerciseInSession records swapped_from_exercise_id", () => {
      expect(sessionDbSrc).toContain("swapped_from_exercise_id = ?");
    });

    it("undoSwapInSession clears swapped_from_exercise_id", () => {
      expect(sessionDbSrc).toContain("swapped_from_exercise_id = NULL");
    });

    it("session screen imports deleteSetsBatch", () => {
      expect(sessionSrc).toContain("deleteSetsBatch");
    });
  });
});
