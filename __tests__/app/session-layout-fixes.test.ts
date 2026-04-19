import * as fs from "fs";
import * as path from "path";

/**
 * Structural tests for BLD-293: Workout session layout fixes (GitHub #147).
 * Verifies style values that address details button alignment,
 * picker column spacing, and SET/PREV header baseline alignment.
 */

const src = [
  fs.readFileSync(path.resolve(__dirname, "../../components/session/ExerciseGroupCard.tsx"), "utf-8"),
  fs.readFileSync(path.resolve(__dirname, "../../components/session/GroupCardHeader.tsx"), "utf-8"),
  fs.readFileSync(path.resolve(__dirname, "../../components/session/SetRow.tsx"), "utf-8"),
].join("\n");

describe("workout session layout fixes (BLD-293)", () => {
  describe("Fix 1: Details button left alignment", () => {
    it("detailsBtn has marginLeft to align text with exercise name", () => {
      const match = src.match(/detailsBtn:\s*\{[^}]*marginLeft:\s*(-?\d+)/);
      expect(match).not.toBeNull();
      const margin = parseInt(match![1], 10);
      expect(margin).toBeLessThanOrEqual(-8);
      expect(margin).toBeGreaterThanOrEqual(-16);
    });
  });

  describe("Fix 2: Weight/Reps picker column spacing", () => {
    it("pickerCol has marginHorizontal of at least 12", () => {
      const match = src.match(/pickerCol:\s*\{[^}]*marginHorizontal:\s*(\d+)/);
      expect(match).not.toBeNull();
      const margin = parseInt(match![1], 10);
      expect(margin).toBeGreaterThanOrEqual(12);
    });

    it("colLabel marginHorizontal matches pickerCol spacing", () => {
      const pickerMatch = src.match(/pickerCol:\s*\{[^}]*marginHorizontal:\s*(\d+)/);
      const labelMatch = src.match(/colLabel:\s*\{[^}]*marginHorizontal:\s*(\d+)/);
      expect(pickerMatch).not.toBeNull();
      expect(labelMatch).not.toBeNull();
      expect(parseInt(labelMatch![1], 10)).toBe(parseInt(pickerMatch![1], 10));
    });
  });

  describe("Fix 3: SET/PREV header baseline alignment", () => {
    it("colSet style does NOT have minHeight (moved to inline on Pressable)", () => {
      const colSetBlock = src.match(/colSet:\s*\{[^}]*\}/);
      expect(colSetBlock).not.toBeNull();
      expect(colSetBlock![0]).not.toMatch(/minHeight/);
    });

    it("SetRow Pressable has minHeight: 36 inline for touch target", () => {
      expect(src).toMatch(/style=\{\[styles\.colSet,\s*\{\s*minHeight:\s*36\s*\}\]/);
    });

    it("headerRow has minHeight for consistent label alignment", () => {
      const match = src.match(/headerRow:\s*\{[^}]*minHeight:\s*(\d+)/);
      expect(match).not.toBeNull();
      expect(parseInt(match![1], 10)).toBeGreaterThanOrEqual(24);
    });
  });
});
