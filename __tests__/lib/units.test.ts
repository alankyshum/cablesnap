import { KG_TO_LB, LB_TO_KG, toDisplay, toKg } from "../../lib/units";

describe("units", () => {
  describe("constants", () => {
    it("KG_TO_LB is approximately 2.20462", () => {
      expect(KG_TO_LB).toBeCloseTo(2.20462, 4);
    });

    it("LB_TO_KG is approximately 0.453592", () => {
      expect(LB_TO_KG).toBeCloseTo(0.453592, 5);
    });

    it("roundtrip kg→lb→kg is identity", () => {
      expect(KG_TO_LB * LB_TO_KG).toBeCloseTo(1, 4);
    });
  });

  describe("toDisplay", () => {
    it("returns kg value rounded to 1 decimal when unit is kg", () => {
      expect(toDisplay(100, "kg")).toBe(100);
      expect(toDisplay(50.55, "kg")).toBe(50.6);
      expect(toDisplay(50.54, "kg")).toBe(50.5);
    });

    it("converts kg to lb when unit is lb", () => {
      expect(toDisplay(100, "lb")).toBeCloseTo(220.5, 0);
    });

    it("handles zero", () => {
      expect(toDisplay(0, "kg")).toBe(0);
      expect(toDisplay(0, "lb")).toBe(0);
    });

    it("handles small values", () => {
      expect(toDisplay(0.1, "kg")).toBe(0.1);
      expect(toDisplay(0.1, "lb")).toBeCloseTo(0.2, 1);
    });

    it("rounds to 1 decimal place", () => {
      expect(toDisplay(33.333, "kg")).toBe(33.3);
      expect(toDisplay(33.333, "lb")).toBeCloseTo(73.5, 0);
    });

    it("handles negative values", () => {
      expect(toDisplay(-10, "kg")).toBe(-10);
    });
  });

  describe("toKg", () => {
    it("returns same value when unit is kg", () => {
      expect(toKg(100, "kg")).toBe(100);
      expect(toKg(0, "kg")).toBe(0);
      expect(toKg(55.5, "kg")).toBe(55.5);
    });

    it("converts lb to kg when unit is lb", () => {
      expect(toKg(220, "lb")).toBeCloseTo(99.8, 0);
      expect(toKg(100, "lb")).toBeCloseTo(45.36, 1);
    });

    it("handles zero", () => {
      expect(toKg(0, "lb")).toBe(0);
    });

    it("roundtrip toKg then toDisplay preserves approximate value", () => {
      const original = 150;
      const kg = toKg(original, "lb");
      const back = toDisplay(kg, "lb");
      expect(back).toBeCloseTo(original, 0);
    });

    it("handles very large values", () => {
      const kg = toKg(1000, "lb");
      expect(kg).toBeCloseTo(453.6, 0);
    });
  });
});
