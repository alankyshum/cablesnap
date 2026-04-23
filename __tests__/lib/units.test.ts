import { KG_TO_LB, LB_TO_KG, toDisplay, toKg, convertWeight, convertHeight } from "../../lib/units";

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

  describe("convertWeight", () => {
    it("returns rounded same value when from == to", () => {
      expect(convertWeight(70, "kg", "kg")).toBe(70);
      expect(convertWeight(70.156, "kg", "kg")).toBe(70.2);
    });
    it("converts kg → lb rounded to 1 decimal", () => {
      expect(convertWeight(70, "kg", "lb")).toBe(154.3);
      expect(convertWeight(100, "kg", "lb")).toBe(220.5);
    });
    it("converts lb → kg rounded to 1 decimal", () => {
      expect(convertWeight(154.3, "lb", "kg")).toBeCloseTo(70, 1);
    });
    it("is approximately round-trippable", () => {
      const lb = convertWeight(72, "kg", "lb");
      const back = convertWeight(lb, "lb", "kg");
      expect(back).toBeCloseTo(72, 1);
    });
  });

  describe("convertHeight", () => {
    it("returns rounded same value when from == to", () => {
      expect(convertHeight(175, "cm", "cm")).toBe(175);
    });
    it("converts cm → in rounded to 1 decimal", () => {
      expect(convertHeight(175, "cm", "in")).toBe(68.9);
    });
    it("converts in → cm rounded to 1 decimal", () => {
      expect(convertHeight(68.9, "in", "cm")).toBeCloseTo(175, 0);
    });
  });
});
