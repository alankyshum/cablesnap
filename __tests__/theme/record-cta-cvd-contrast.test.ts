/**
 * CVD contrast regression guard for recordCTAPrimary / recordCTAPrimaryForeground
 * token pair — BLD-4036 (protanopia audit 2026-07-26, form-clips).
 *
 * The standard primary token (#FF6038 light, #FF7A55 dark) uses navy (#1A2138)
 * as foreground. Under protanopia CVD simulation, text-on-button contrast drops
 * from 5.30:1 to 3.83:1 — below the WCAG AA 4.5:1 threshold.
 *
 * The fix introduces dedicated recordCTAPrimary / recordCTAPrimaryForeground
 * tokens (deeper coral + white) that pass WCAG AA under all CVD simulations.
 *
 * This test:
 *   1. Verifies recordCTAPrimaryForeground on recordCTAPrimary meets 4.5:1 in
 *      normal vision (both themes).
 *   2. Verifies the same pair meets 4.5:1 under protanopia, deuteranopia, and
 *      tritanopia simulation (both themes).
 *
 * Do NOT change theme/colors.ts recordCTA* values without this test passing.
 */

import { lightColors, darkColors } from "../../theme/colors";

// ---------------------------------------------------------------------------
// WCAG 2.1 + CVD simulation helpers
// ---------------------------------------------------------------------------

function toLinear(channel8bit: number): number {
  const sRGB = channel8bit / 255;
  return sRGB <= 0.04045
    ? sRGB / 12.92
    : Math.pow((sRGB + 0.055) / 1.055, 2.4);
}

function linearToSRGB(c: number): number {
  c = Math.max(0, Math.min(1, c));
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function hexToRgbLinear(hex: string): [number, number, number] {
  const h = hex.replace(/^#/, "");
  return [
    toLinear(parseInt(h.slice(0, 2), 16)),
    toLinear(parseInt(h.slice(2, 4), 16)),
    toLinear(parseInt(h.slice(4, 6), 16)),
  ];
}

function linearToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((c) =>
        Math.round(Math.max(0, Math.min(255, linearToSRGB(c) * 255)))
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}

/**
 * Simulate color vision deficiency using simplified Vienot 1999 / Brettel LMS method.
 * type: 'protanopia' | 'deuteranopia' | 'tritanopia'
 */
function simulateCVD(
  hex: string,
  type: "protanopia" | "deuteranopia" | "tritanopia"
): string {
  const [R, G, B] = hexToRgbLinear(hex);
  let L = 17.8824 * R + 43.5161 * G + 4.11935 * B;
  let M = 3.45565 * R + 27.1554 * G + 3.86714 * B;
  let S = 0.0299566 * R + 0.184309 * G + 1.46709 * B;

  if (type === "protanopia") {
    L = 2.02344 * M - 2.52581 * S;
  } else if (type === "deuteranopia") {
    M = 0.494207 * L + 1.24827 * S;
  } else {
    // tritanopia
    S = -0.012246 * L + 0.072745 * M;
  }

  const r = 0.0809444 * L - 0.130504 * M + 0.116721 * S;
  const g = -0.0102485 * L + 0.0540194 * M - 0.113615 * S;
  const b = -0.000365294 * L - 0.00412163 * M + 0.693513 * S;
  return linearToHex(r, g, b);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgbLinear(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const WCAG_AA_MIN = 4.5;
const CVD_MODES = ["protanopia", "deuteranopia", "tritanopia"] as const;

describe("recordCTAPrimary / recordCTAPrimaryForeground CVD contrast guard (BLD-4036)", () => {
  describe("light theme — normal vision", () => {
    it("meets WCAG AA (≥ 4.5:1)", () => {
      const ratio = contrastRatio(
        lightColors.recordCTAPrimaryForeground,
        lightColors.recordCTAPrimary
      );
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_MIN);
    });
  });

  describe("dark theme — normal vision", () => {
    it("meets WCAG AA (≥ 4.5:1)", () => {
      const ratio = contrastRatio(
        darkColors.recordCTAPrimaryForeground,
        darkColors.recordCTAPrimary
      );
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_MIN);
    });
  });

  for (const cvdType of CVD_MODES) {
    describe(`light theme — ${cvdType} simulation`, () => {
      it(`meets WCAG AA (≥ 4.5:1) under ${cvdType}`, () => {
        const simBg = simulateCVD(lightColors.recordCTAPrimary, cvdType);
        const simFg = simulateCVD(lightColors.recordCTAPrimaryForeground, cvdType);
        const ratio = contrastRatio(simFg, simBg);
        expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_MIN);
      });
    });

    describe(`dark theme — ${cvdType} simulation`, () => {
      it(`meets WCAG AA (≥ 4.5:1) under ${cvdType}`, () => {
        const simBg = simulateCVD(darkColors.recordCTAPrimary, cvdType);
        const simFg = simulateCVD(darkColors.recordCTAPrimaryForeground, cvdType);
        const ratio = contrastRatio(simFg, simBg);
        expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_MIN);
      });
    });
  }
});
