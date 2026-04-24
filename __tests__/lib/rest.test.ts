import {
  REST_MULTIPLIERS,
  categorize,
  defaultBreakdown,
  resolveRestSeconds,
  truncateChipLabel,
  type ExerciseCategory,
  type RestInputs,
} from "../../lib/rest";
import type { SetType } from "../../lib/types";

// Canonical round-to-5 reference (mirrors lib/rest.ts formula so we can property-test).
const refRound5 = (x: number) => Math.round(x / 5) * 5;
const refClamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const refResolveTotal = (i: RestInputs): number => {
  const base = i.baseRestSeconds > 0 ? i.baseRestSeconds : 60;
  const stMult = REST_MULTIPLIERS.setType[i.setType];
  const rpeMult =
    i.rpe == null
      ? REST_MULTIPLIERS.rpe.midOrNull
      : i.rpe <= 6
        ? REST_MULTIPLIERS.rpe.low
        : i.rpe >= 9.5
          ? REST_MULTIPLIERS.rpe.veryHigh
          : i.rpe >= 8.5
            ? REST_MULTIPLIERS.rpe.high
            : REST_MULTIPLIERS.rpe.midOrNull;
  const catMult = REST_MULTIPLIERS.category[i.category];
  return refClamp(refRound5(base * stMult * rpeMult * catMult), 10, 360);
};

describe("categorize", () => {
  it("maps bodyweight equipment", () => expect(categorize("bodyweight")).toBe("bodyweight"));
  it("maps cable equipment", () => expect(categorize("cable")).toBe("cable"));
  it.each(["barbell", "dumbbell", "machine", "kettlebell", "band", ""])(
    "defaults %p to standard",
    (eq) => expect(categorize(eq)).toBe("standard"),
  );
});

describe("resolveRestSeconds — formula correctness (ACs)", () => {
  const base = (overrides: Partial<RestInputs> = {}): RestInputs => ({
    baseRestSeconds: 90,
    setType: "normal",
    rpe: 8,
    category: "standard",
    ...overrides,
  });

  it("AC: normal, RPE 8, standard, base 90 → 90s, isDefault", () => {
    const r = resolveRestSeconds(base());
    expect(r.totalSeconds).toBe(90);
    expect(r.isDefault).toBe(true);
    expect(r.factors).toHaveLength(0);
    expect(r.reasonShort).toBe("");
  });

  it("AC: normal, RPE 9.5, standard, base 90 → 115s", () => {
    const r = resolveRestSeconds(base({ rpe: 9.5 }));
    expect(r.totalSeconds).toBe(115);
    expect(r.isDefault).toBe(false);
    expect(r.reasonShort).toContain("Heavy");
  });

  it("AC: warmup, any RPE, standard, base 90 → 25s", () => {
    const r = resolveRestSeconds(base({ setType: "warmup" }));
    expect(r.totalSeconds).toBe(25);
    expect(r.reasonShort).toBe("Warmup");
  });

  it("AC: dropset, any RPE, standard, base 90 → clamped to 10s floor", () => {
    const r = resolveRestSeconds(base({ setType: "dropset" }));
    expect(r.totalSeconds).toBe(10);
    expect(r.reasonShort).toBe("Drop-set");
  });

  it("AC: normal, RPE 7, cable, base 90 → 70s (single cable bucket, no double-count)", () => {
    const r = resolveRestSeconds(base({ rpe: 7, category: "cable" }));
    expect(r.totalSeconds).toBe(70);
    expect(r.reasonShort).toBe("Cable");
  });

  it("AC: normal, RPE null, bodyweight, base 90 → 75s", () => {
    const r = resolveRestSeconds(base({ rpe: null, category: "bodyweight" }));
    expect(r.totalSeconds).toBe(75);
    expect(r.reasonShort).toBe("Bodyweight");
  });

  it("AC priority: weighted pull-up (bodyweight + RPE 9.5) → ~100s, reason Heavy", () => {
    const r = resolveRestSeconds(base({ rpe: 9.5, category: "bodyweight" }));
    expect(r.totalSeconds).toBe(100);
    expect(r.reasonShort).toContain("Heavy");
    expect(r.isDefault).toBe(false);
  });

  it("AC priority: cable row (cable + RPE 8, normal) → 70s, reason Cable", () => {
    const r = resolveRestSeconds(base({ rpe: 8, category: "cable" }));
    expect(r.totalSeconds).toBe(70);
    expect(r.reasonShort).toBe("Cable");
  });

  it("AC clamp: baseRestSeconds=0 substituted to 60 before math", () => {
    const r = resolveRestSeconds(base({ baseRestSeconds: 0, rpe: 8 }));
    // 60 * 1 * 1 * 1 = 60
    expect(r.totalSeconds).toBe(60);
    expect(r.baseSeconds).toBe(60);
  });

  it("AC clamp: result < 10s clamped to 10s (dropset tiny base)", () => {
    const r = resolveRestSeconds(base({ baseRestSeconds: 30, setType: "dropset" }));
    expect(r.totalSeconds).toBe(10);
  });

  it("AC clamp: result > 360s clamped to 360s", () => {
    // 360 base * failure 1.3 * veryHigh 1.3 = 608.4, clamped to 360
    const r = resolveRestSeconds(base({ baseRestSeconds: 360, setType: "failure", rpe: 9.5 }));
    expect(r.totalSeconds).toBe(360);
  });

  it("AC: every output is divisible by 5", () => {
    const cases: RestInputs[] = [
      base({ rpe: 9.5 }),
      base({ rpe: 6, category: "cable" }),
      base({ rpe: null, category: "bodyweight" }),
      base({ setType: "failure", rpe: 9.5, category: "bodyweight" }),
      base({ setType: "dropset", baseRestSeconds: 120 }),
      base({ setType: "warmup", baseRestSeconds: 45 }),
    ];
    for (const c of cases) {
      expect(resolveRestSeconds(c).totalSeconds % 5).toBe(0);
    }
  });

  it("low RPE bucket (RPE 5) emits RPE 5 chip", () => {
    const r = resolveRestSeconds(base({ rpe: 5 }));
    expect(r.totalSeconds).toBe(70); // 90 * 0.8 = 72 -> round5 = 70
    expect(r.reasonShort).toContain("RPE");
  });

  it("RPE 9 lands in high bucket (1.15×)", () => {
    const r = resolveRestSeconds(base({ rpe: 9 }));
    expect(r.totalSeconds).toBe(105); // 90 * 1.15 = 103.5 -> round5 = 105
    expect(r.reasonShort).toBe("RPE 9");
  });

  it("null RPE treated as mid (no RPE in chip)", () => {
    const r = resolveRestSeconds(base({ rpe: null }));
    expect(r.totalSeconds).toBe(90);
    expect(r.isDefault).toBe(true);
    expect(r.reasonShort).toBe("");
  });

  it("failure set picks Failure even when RPE is high", () => {
    const r = resolveRestSeconds(base({ setType: "failure", rpe: 9.5 }));
    expect(r.reasonShort).toBe("Failure");
  });

  it("dropset priority dominates even at high RPE", () => {
    const r = resolveRestSeconds(base({ setType: "dropset", rpe: 9.5 }));
    expect(r.reasonShort).toBe("Drop-set");
  });

  it("breakdown factors are added only for non-1.0 multipliers", () => {
    const r = resolveRestSeconds(base({ rpe: 9.5, category: "bodyweight" }));
    // RPE very-high (1.3) + bodyweight (0.85) — two factors
    expect(r.factors.map((f) => f.multiplier)).toEqual([1.3, 0.85]);
    expect(r.factors.every((f) => f.label.length > 0)).toBe(true);
  });
});

describe("resolveRestSeconds — property test", () => {
  // Deterministic pseudo-random input generator (no dependency on a prop-test lib).
  const setTypes: SetType[] = ["normal", "warmup", "dropset", "failure"];
  const cats: ExerciseCategory[] = ["standard", "cable", "bodyweight"];

  const inputs: RestInputs[] = [];
  for (let seed = 1; seed <= 120; seed++) {
    const base = [0, 15, 30, 45, 60, 75, 90, 120, 180, 300, 400][seed % 11];
    const st = setTypes[seed % 4];
    const rpe = [null, 1, 4, 6, 7, 8, 8.5, 9, 9.5, 10][seed % 10];
    const cat = cats[seed % 3];
    inputs.push({ baseRestSeconds: base, setType: st, rpe, category: cat });
  }

  it.each(inputs)(
    "total matches round5(clamp(baseOrDefault * product(factors), 10, 360)) for %p",
    (i) => {
      const r = resolveRestSeconds(i);
      expect(r.totalSeconds).toBe(refResolveTotal(i));
      expect(r.totalSeconds % 5).toBe(0);
      expect(r.totalSeconds).toBeGreaterThanOrEqual(10);
      expect(r.totalSeconds).toBeLessThanOrEqual(360);
    },
  );
});

describe("defaultBreakdown", () => {
  it("produces an isDefault breakdown for the legacy/manual path", () => {
    const r = defaultBreakdown(90);
    expect(r.isDefault).toBe(true);
    expect(r.factors).toHaveLength(0);
    expect(r.totalSeconds).toBe(90);
  });

  it("clamps negative values to 0", () => {
    expect(defaultBreakdown(-5).totalSeconds).toBe(0);
  });

  it("clamps to MAX", () => {
    expect(defaultBreakdown(9999).totalSeconds).toBe(360);
  });
});

describe("truncateChipLabel (BLD-552: adaptive chip overflow indicator)", () => {
  const NARROW = 320;
  const WIDE = 360;

  it("passes through at viewportWidth >= 360 regardless of token count", () => {
    expect(truncateChipLabel("Heavy · RPE 9 · Cable", WIDE)).toBe("Heavy · RPE 9 · Cable");
    expect(truncateChipLabel("A · B · C · D", 500)).toBe("A · B · C · D");
  });

  it("passes through at <360dp when tokens.length <= 2 (no suffix)", () => {
    expect(truncateChipLabel("Heavy · RPE 9", NARROW)).toBe("Heavy · RPE 9");
    expect(truncateChipLabel("Cable", NARROW)).toBe("Cable");
  });

  it("appends +1 at <360dp for 3 tokens", () => {
    expect(truncateChipLabel("Heavy · RPE 9 · Cable", NARROW)).toBe("Heavy · RPE 9 +1");
  });

  it("appends +N (N = dropped count) at <360dp for 4+ tokens", () => {
    expect(truncateChipLabel("A · B · C · D", NARROW)).toBe("A · B +2");
    expect(truncateChipLabel("A · B · C · D · E", NARROW)).toBe("A · B +3");
  });

  it("handles empty string without crashing or suffixing", () => {
    expect(truncateChipLabel("", NARROW)).toBe("");
    expect(truncateChipLabel("", WIDE)).toBe("");
  });

  it("tolerates whitespace variations around the separator", () => {
    expect(truncateChipLabel("A·B·C", NARROW)).toBe("A · B +1");
    expect(truncateChipLabel("A  ·  B  ·  C", NARROW)).toBe("A · B +1");
  });

  it("treats the 360dp boundary as >= (inclusive) for full-label render", () => {
    expect(truncateChipLabel("Heavy · RPE 9 · Cable", 360)).toBe("Heavy · RPE 9 · Cable");
    expect(truncateChipLabel("Heavy · RPE 9 · Cable", 359)).toBe("Heavy · RPE 9 +1");
  });
});
