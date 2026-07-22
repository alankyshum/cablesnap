import { getValidSteps, defaultStep, resolveStep } from "../../lib/weightStep";

describe("weightStep helper", () => {
  describe("getValidSteps", () => {
    it("returns correct valid steps for kg", () => {
      expect(getValidSteps("kg")).toEqual([0.5, 1.25, 2.5, 5]);
    });

    it("returns correct valid steps for lb", () => {
      expect(getValidSteps("lb")).toEqual([1, 2.5, 5, 10]);
    });
  });

  describe("defaultStep", () => {
    it("returns correct default for kg", () => {
      expect(defaultStep("kg")).toBe(2.5);
    });

    it("returns correct default for lb", () => {
      expect(defaultStep("lb")).toBe(5);
    });
  });

  describe("resolveStep", () => {
    it("handles valid parses for both units", () => {
      expect(resolveStep("0.5", "kg")).toBe(0.5);
      expect(resolveStep("1.25", "kg")).toBe(1.25);
      expect(resolveStep("2.5", "kg")).toBe(2.5);
      expect(resolveStep("5", "kg")).toBe(5);

      expect(resolveStep("1", "lb")).toBe(1);
      expect(resolveStep("2.5", "lb")).toBe(2.5);
      expect(resolveStep("5", "lb")).toBe(5);
      expect(resolveStep("10", "lb")).toBe(10);
    });

    it("handles invalid parses: null, undefined, empty, non-numeric", () => {
      expect(resolveStep(null, "kg")).toBe(2.5);
      expect(resolveStep(undefined, "kg")).toBe(2.5);
      expect(resolveStep("", "kg")).toBe(2.5);
      expect(resolveStep("   ", "kg")).toBe(2.5);
      expect(resolveStep("abc", "kg")).toBe(2.5);

      expect(resolveStep(null, "lb")).toBe(5);
      expect(resolveStep(undefined, "lb")).toBe(5);
      expect(resolveStep("", "lb")).toBe(5);
      expect(resolveStep("abc", "lb")).toBe(5);
    });

    it("handles invalid parses: zero and negative values", () => {
      expect(resolveStep("0", "kg")).toBe(2.5);
      expect(resolveStep("-1.25", "kg")).toBe(2.5);
      expect(resolveStep("-5", "lb")).toBe(5);
    });

    it("handles out-of-range/invalid options for current unit (unit mismatch fallback)", () => {
      // 0.5 is valid for kg but not lb, so fallback to lb default (5)
      expect(resolveStep("0.5", "lb")).toBe(5);
      // 10 is valid for lb but not kg, so fallback to kg default (2.5)
      expect(resolveStep("10", "kg")).toBe(2.5);
      // 1.25 is valid for kg but not lb, fallback to lb default (5)
      expect(resolveStep("1.25", "lb")).toBe(5);
      // 1 is valid for lb but not kg, fallback to kg default (2.5)
      expect(resolveStep("1", "kg")).toBe(2.5);
      // completely out of range options like 15
      expect(resolveStep("15", "kg")).toBe(2.5);
      expect(resolveStep("15", "lb")).toBe(5);
    });
  });
});
