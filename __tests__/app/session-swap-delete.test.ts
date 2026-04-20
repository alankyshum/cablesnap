import * as fs from "fs";
import * as path from "path";

/**
 * Structural tests for BLD-307: Long-press exercise delete UI wiring.
 * Only checks UI-level contracts not covered by lib/db/session-swap-delete.test.ts.
 */

const sessionSrc = [
  fs.readFileSync(path.resolve(__dirname, "../../components/session/ExerciseGroupCard.tsx"), "utf-8"),
  fs.readFileSync(path.resolve(__dirname, "../../components/session/GroupCardHeader.tsx"), "utf-8"),
  fs.readFileSync(path.resolve(__dirname, "../../hooks/useExerciseManagement.ts"), "utf-8"),
].join("\n");

describe("BLD-307: Long-press exercise delete (UI wiring)", () => {
  it("exercise name has onLongPress handler for delete", () => {
    const longPressMatches = sessionSrc.match(/onLongPress=\{.*onDeleteExercise/g);
    expect(longPressMatches).not.toBeNull();
    expect(longPressMatches!.length).toBeGreaterThanOrEqual(1);
  });

  it("has accessibility hint for long-press delete", () => {
    expect(sessionSrc).toContain("Long press to remove exercise");
  });

  it("shows countdown toast with UNDO action", () => {
    expect(sessionSrc).toMatch(/Removing \$\{group\.name\}\.\.\. \(\d+s\)/);
    expect(sessionSrc).toContain('label: "UNDO"');
  });

  it("provides haptic feedback and dismisses rest timer on delete", () => {
    expect(sessionSrc).toContain("Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)");
    expect(sessionSrc).toContain("dismissRest()");
  });
});
