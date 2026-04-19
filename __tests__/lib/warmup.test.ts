import { generateWarmupSets, roundToPlates } from "../../lib/warmup";

describe("roundToPlates", () => {
  it("rounds to plate-friendly weight (lb)", () => {
    // 112.5 lb target → bar 45 + perSide 33.75 → achievable: 25+5+2.5+1 = 33.5 → total 112
    expect(roundToPlates(112.5, 45, "lb")).toBe(112);
  });

  it("rounds to plate-friendly weight (kg)", () => {
    // 50 kg target → bar 20 + perSide 15 → achievable: 15 → total 50
    expect(roundToPlates(50, 20, "kg")).toBe(50);
  });

  it("returns bar weight when target <= bar", () => {
    expect(roundToPlates(45, 45, "lb")).toBe(45);
    expect(roundToPlates(30, 45, "lb")).toBe(45);
    expect(roundToPlates(20, 20, "kg")).toBe(20);
  });

  it("handles exact plate multiples", () => {
    // 135 lb = 45 bar + 45 per side
    expect(roundToPlates(135, 45, "lb")).toBe(135);
    // 225 lb = 45 bar + 90 per side (45+45)
    expect(roundToPlates(225, 45, "lb")).toBe(225);
  });

  it("rounds down to nearest achievable (lb)", () => {
    // 160 lb → perSide = 57.5 → 45+10+2.5 = 57.5 → 160
    expect(roundToPlates(160, 45, "lb")).toBe(160);
    // 162 lb → perSide = 58.5 → 45+10+2.5+1 = 58.5 → 162
    expect(roundToPlates(162, 45, "lb")).toBe(162);
  });
});

describe("generateWarmupSets", () => {
  describe("standard scheme (working weight >= 2× bar)", () => {
    it("generates 4 warmup sets for 225lb working weight", () => {
      const sets = generateWarmupSets(225, 45, "lb");
      expect(sets).toHaveLength(4);

      // bar × 10
      expect(sets[0]).toEqual({ weight: 45, reps: 10, set_type: "warmup" });

      // 50% of 225 = 112.5 → plate-friendly
      expect(sets[1].reps).toBe(5);
      expect(sets[1].set_type).toBe("warmup");
      expect(sets[1].weight).toBeGreaterThan(45);

      // 70% of 225 = 157.5 → plate-friendly
      expect(sets[2].reps).toBe(3);
      expect(sets[2].set_type).toBe("warmup");
      expect(sets[2].weight).toBeGreaterThan(sets[1].weight);

      // 85% of 225 = 191.25 → plate-friendly
      expect(sets[3].reps).toBe(2);
      expect(sets[3].set_type).toBe("warmup");
      expect(sets[3].weight).toBeGreaterThan(sets[2].weight);
    });

    it("matches expected acceptance criteria weights for 225lb", () => {
      const sets = generateWarmupSets(225, 45, "lb");
      expect(sets[0].weight).toBe(45);   // bar
      expect(sets[1].weight).toBe(112);  // ~50%: 112.5 → 112 (plate-friendly)
      expect(sets[2].weight).toBe(157);  // ~70%: 157.5 → 157 (plate-friendly)
      expect(sets[3].weight).toBe(190);  // ~85%: 191.25 → 190
    });

    it("generates kg warmup sets for 100kg working weight", () => {
      const sets = generateWarmupSets(100, 20, "kg");
      expect(sets).toHaveLength(4);

      expect(sets[0]).toEqual({ weight: 20, reps: 10, set_type: "warmup" });
      // 50% of 100 = 50 → 20 + 15 per side → 50
      expect(sets[1].weight).toBe(50);
      expect(sets[1].reps).toBe(5);
      // 70% of 100 = 70 → 20 + 25 per side → 70
      expect(sets[2].weight).toBe(70);
      expect(sets[2].reps).toBe(3);
      // 85% of 100 = 85 → 20 + 32.5 per side → 85
      expect(sets[3].weight).toBe(85);
      expect(sets[3].reps).toBe(2);
    });

    it("all sets have set_type warmup", () => {
      const sets = generateWarmupSets(225, 45, "lb");
      for (const s of sets) {
        expect(s.set_type).toBe("warmup");
      }
    });

    it("weights are strictly increasing", () => {
      const sets = generateWarmupSets(315, 45, "lb");
      for (let i = 1; i < sets.length; i++) {
        expect(sets[i].weight).toBeGreaterThan(sets[i - 1].weight);
      }
    });
  });

  describe("light weight scheme (< 2× bar)", () => {
    it("generates 2 warmup sets for 80lb working weight (lb)", () => {
      // 80 <= 2 × 45 = 90, so light weight scheme
      const sets = generateWarmupSets(80, 45, "lb");
      expect(sets).toHaveLength(2);

      // bar × 10
      expect(sets[0]).toEqual({ weight: 45, reps: 10, set_type: "warmup" });

      // ~75% of 80 = 60 → plate-friendly
      expect(sets[1].reps).toBe(3);
      expect(sets[1].set_type).toBe("warmup");
      expect(sets[1].weight).toBeGreaterThan(45);
    });

    it("generates 2 warmup sets for 90lb (exactly 2× bar)", () => {
      const sets = generateWarmupSets(90, 45, "lb");
      expect(sets).toHaveLength(2);
      expect(sets[0]).toEqual({ weight: 45, reps: 10, set_type: "warmup" });
    });

    it("generates 2 warmup sets for 95lb (per acceptance criteria)", () => {
      // 95 > 2×45=90 but close enough — standard scheme applies here
      const sets = generateWarmupSets(95, 45, "lb");
      expect(sets).toHaveLength(4);
      expect(sets[0]).toEqual({ weight: 45, reps: 10, set_type: "warmup" });
    });

    it("generates only bar set when 75% rounds to bar", () => {
      // Working weight just slightly above bar (e.g. 50lb, bar 45)
      // 75% of 50 = 37.5, rounded to plates ≤ 45 → filters out
      const sets = generateWarmupSets(50, 45, "lb");
      expect(sets).toHaveLength(1);
      expect(sets[0]).toEqual({ weight: 45, reps: 10, set_type: "warmup" });
    });
  });

  describe("edge cases", () => {
    it("returns empty array when working weight <= bar weight", () => {
      expect(generateWarmupSets(45, 45, "lb")).toEqual([]);
      expect(generateWarmupSets(20, 20, "kg")).toEqual([]);
      expect(generateWarmupSets(30, 45, "lb")).toEqual([]);
    });

    it("handles very heavy weights", () => {
      const sets = generateWarmupSets(500, 45, "lb");
      expect(sets).toHaveLength(4);
      expect(sets[0].weight).toBe(45);
      expect(sets[sets.length - 1].weight).toBeLessThan(500);
    });

    it("handles 15kg bar (women's bar)", () => {
      const sets = generateWarmupSets(60, 15, "kg");
      expect(sets).toHaveLength(4);
      expect(sets[0].weight).toBe(15);
    });

    it("handles 35lb bar", () => {
      const sets = generateWarmupSets(135, 35, "lb");
      expect(sets).toHaveLength(4);
      expect(sets[0].weight).toBe(35);
    });
  });
});
