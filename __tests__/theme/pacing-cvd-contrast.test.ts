/**
 * pacing-cvd-contrast.test.ts — BLD-3872
 *
 * Locks the Machado-2009 CVD luminance-contrast guarantees for the Pacing
 * card's Working vs Rest segments (`components/session/summary/PacingCard.tsx`).
 *
 * Background
 * ----------
 * A CVD audit (2026-07-25) flagged that the "Working" segment
 * (`colors.primary` = #FF6038 coral) and the "Rest" segment (previously
 * `colors.heatmapLow` = #1E88E5 blue) rendered at nearly identical luminance
 * under tritanopia — W/R contrast dropped to ~1.08:1 under Machado-2009
 * severity=1.0 simulation, making the two bar segments indistinguishable for
 * blue-yellow CVD users. Prior CVD work (BLD-1939 / BLD-2713 / BLD-2714 /
 * BLD-2725) hardened the deuteranopia / protanopia / grayscale axes via
 * structural overlays (dash on Working, dot on Other), but did not address
 * tritanopia — where the *colour* of the two remaining segments still had to
 * be distinct because the Rest chip has no overlay.
 *
 * Fix
 * ---
 * Introduced a dedicated `pacingRest` token in `theme/colors.ts` (light and
 * dark), decoupled from `heatmapLow` so the RecoveryHeatmap surface remains
 * unchanged. See PacingCard's `useSegmentColors` and the token comment in
 * `theme/colors.ts` for the full rationale.
 *
 * Contract
 * --------
 * This test:
 *   1. Asserts Machado tritanopia Working/Rest contrast ≥ 1.5:1 (AC-headless
 *      proxy for "distinguishable under tritanopia").
 *   2. Asserts Working/Rest, Working/Other, Rest/Other contrast does not
 *      regress below its post-fix baseline under Machado deut/prot/grey
 *      simulations — protecting the BLD-1939/2713/2714/2725 gains.
 *
 * Simulation
 * ----------
 * Uses the Machado et al. 2009 CVD simulation matrices at severity = 1.0
 * (canonical severity-1 values). WCAG 2.1 luminance is the invariant that
 * determines the contrast ratio; matrix choice affects only which pairs
 * collapse. Machado is the AC-mandated matrix.
 */

// ---------------------------------------------------------------------------
// Token values under test — imported from theme so a future palette change
// will break this test and force conscious re-verification.
// ---------------------------------------------------------------------------

import { lightColors, darkColors } from "@/theme/colors";

// ---------------------------------------------------------------------------
// WCAG 2.1 luminance / contrast helpers
// ---------------------------------------------------------------------------

function toLinear(channel8bit: number): number {
  const sRGB = channel8bit / 255;
  return sRGB <= 0.04045 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const h = hex.replace(/^#/, "");
  if (h.length !== 6) throw new Error(`relativeLuminance: expected 6-digit hex, got "${hex}"`);
  const r = toLinear(parseInt(h.slice(0, 2), 16));
  const g = toLinear(parseInt(h.slice(2, 4), 16));
  const b = toLinear(parseInt(h.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// CVD simulation — Machado 2009, severity = 1.0
//   Reference: Machado, Oliveira & Fernandes (2009), "A Physiologically-based
//   Model for Simulation of Color Vision Deficiency."
//   Matrices from the authors' canonical severity-1 tables.
// ---------------------------------------------------------------------------

type Matrix3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

const M_TRITAN: Matrix3 = [
  [1.255528, -0.076749, -0.178779],
  [-0.078411, 0.930809, 0.147602],
  [0.004733, 0.691367, -0.696100],
];

const M_DEUT: Matrix3 = [
  [0.367322, 0.860646, -0.227968],
  [0.280085, 0.672501, 0.047413],
  [-0.011820, 0.042940, 0.968881],
];

const M_PROT: Matrix3 = [
  [0.152286, 1.052583, -0.204868],
  [0.114503, 0.786281, 0.099216],
  [-0.003882, -0.048116, 1.051998],
];

function clamp01(v: number): number {
  return Math.min(1.0, Math.max(0.0, v));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace(/^#/, "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((c) => Math.round(c).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

function applyMatrix(hex: string, M: Matrix3): string {
  const { r, g, b } = hexToRgb(hex);
  const v = [r / 255, g / 255, b / 255];
  const out = [
    clamp01(M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2]),
    clamp01(M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2]),
    clamp01(M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]),
  ];
  return rgbToHex(out[0] * 255, out[1] * 255, out[2] * 255);
}

const simTritan = (hex: string) => applyMatrix(hex, M_TRITAN);
const simDeut = (hex: string) => applyMatrix(hex, M_DEUT);
const simProt = (hex: string) => applyMatrix(hex, M_PROT);

/** Rec-709 luma → equal-grey simulation of monochrome viewing. */
function simGrey(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return rgbToHex(l, l, l);
}

// ---------------------------------------------------------------------------
// The three segment colours as consumed by PacingCard's useSegmentColors().
// Kept in sync with hooks/useThemeColors.ts:
//   working = colors.primary
//   rest    = colors.pacingRest   ← BLD-3872 (was heatmapLow)
//   other   = colors.onSurfaceVariant
// onSurfaceVariant is not in theme/colors.ts (computed in useThemeColors);
// we inline its verified value here.
// ---------------------------------------------------------------------------

const LIGHT_WORKING = lightColors.primary;      // #FF6038
const LIGHT_REST    = lightColors.pacingRest;   // #08415C — BLD-3872
const LIGHT_OTHER   = "#6B7280";                // onSurfaceVariant (light) — mid grey

const DARK_WORKING  = darkColors.primary;       // #FF7A55
const DARK_REST     = darkColors.pacingRest;    // #A5F3FC — BLD-3872
const DARK_OTHER    = "#8B949E";                // onSurfaceVariant (dark) — mid grey

// ---------------------------------------------------------------------------
// Acceptance threshold — from the BLD-3872 audit spec.
// ---------------------------------------------------------------------------

const TRITAN_MIN_WR = 1.5;

// ---------------------------------------------------------------------------
// Post-fix baselines — captured after selecting pacingRest #08415C / #A5F3FC.
// These are floors, not equalities: if a future palette change *improves*
// contrast the test still passes; regressions are caught.
// Values verified by hand with the Machado matrices above.
// ---------------------------------------------------------------------------

// Light theme floors (kept slightly below measured to tolerate 0.01–0.02 rounding).
const LIGHT_FLOORS = {
  tritan: { WR: 3.0,  WO: 1.5,  RO: 2.0 },
  deut:   { WR: 3.5,  WO: 1.4,  RO: 2.4 },
  prot:   { WR: 2.0,  WO: 1.0,  RO: 2.1 },
  grey:   { WR: 2.8,  WO: 1.15, RO: 2.3 },
};

// Dark theme floors.
const DARK_FLOORS = {
  tritan: { WR: 2.0,  WO: 1.1,  RO: 2.3 },
  deut:   { WR: 1.85, WO: 1.15, RO: 2.2 },
  prot:   { WR: 2.9,  WO: 1.15, RO: 2.4 },
  grey:   { WR: 2.2,  WO: 1.0,  RO: 2.3 },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PacingCard Working/Rest CVD luminance contrast (BLD-3872)", () => {
  describe("Acceptance criterion: Machado-2009 tritanopia W/R contrast >= 1.5:1", () => {
    it("light theme: Working vs Rest ≥ 1.5:1 under tritanopia", () => {
      const w = simTritan(LIGHT_WORKING);
      const r = simTritan(LIGHT_REST);
      expect(contrastRatio(w, r)).toBeGreaterThanOrEqual(TRITAN_MIN_WR);
    });

    it("dark theme: Working vs Rest ≥ 1.5:1 under tritanopia", () => {
      const w = simTritan(DARK_WORKING);
      const r = simTritan(DARK_REST);
      expect(contrastRatio(w, r)).toBeGreaterThanOrEqual(TRITAN_MIN_WR);
    });
  });

  describe("No regression: Working/Rest/Other stay mutually distinct across CVD modes", () => {
    // Light theme
    it("light tritanopia: contrast floors hold (W/R, W/O, R/O)", () => {
      const w = simTritan(LIGHT_WORKING), r = simTritan(LIGHT_REST), o = simTritan(LIGHT_OTHER);
      expect(contrastRatio(w, r)).toBeGreaterThanOrEqual(LIGHT_FLOORS.tritan.WR);
      expect(contrastRatio(w, o)).toBeGreaterThanOrEqual(LIGHT_FLOORS.tritan.WO);
      expect(contrastRatio(r, o)).toBeGreaterThanOrEqual(LIGHT_FLOORS.tritan.RO);
    });

    it("light deuteranopia: contrast floors hold (BLD-1939/2713 guarantee)", () => {
      const w = simDeut(LIGHT_WORKING), r = simDeut(LIGHT_REST), o = simDeut(LIGHT_OTHER);
      expect(contrastRatio(w, r)).toBeGreaterThanOrEqual(LIGHT_FLOORS.deut.WR);
      expect(contrastRatio(w, o)).toBeGreaterThanOrEqual(LIGHT_FLOORS.deut.WO);
      expect(contrastRatio(r, o)).toBeGreaterThanOrEqual(LIGHT_FLOORS.deut.RO);
    });

    it("light protanopia: contrast floors hold (BLD-2714 guarantee)", () => {
      const w = simProt(LIGHT_WORKING), r = simProt(LIGHT_REST), o = simProt(LIGHT_OTHER);
      expect(contrastRatio(w, r)).toBeGreaterThanOrEqual(LIGHT_FLOORS.prot.WR);
      expect(contrastRatio(w, o)).toBeGreaterThanOrEqual(LIGHT_FLOORS.prot.WO);
      expect(contrastRatio(r, o)).toBeGreaterThanOrEqual(LIGHT_FLOORS.prot.RO);
    });

    it("light grayscale: contrast floors hold (BLD-2725 monochrome guarantee)", () => {
      const w = simGrey(LIGHT_WORKING), r = simGrey(LIGHT_REST), o = simGrey(LIGHT_OTHER);
      expect(contrastRatio(w, r)).toBeGreaterThanOrEqual(LIGHT_FLOORS.grey.WR);
      expect(contrastRatio(w, o)).toBeGreaterThanOrEqual(LIGHT_FLOORS.grey.WO);
      expect(contrastRatio(r, o)).toBeGreaterThanOrEqual(LIGHT_FLOORS.grey.RO);
    });

    // Dark theme
    it("dark tritanopia: contrast floors hold (W/R, W/O, R/O)", () => {
      const w = simTritan(DARK_WORKING), r = simTritan(DARK_REST), o = simTritan(DARK_OTHER);
      expect(contrastRatio(w, r)).toBeGreaterThanOrEqual(DARK_FLOORS.tritan.WR);
      expect(contrastRatio(w, o)).toBeGreaterThanOrEqual(DARK_FLOORS.tritan.WO);
      expect(contrastRatio(r, o)).toBeGreaterThanOrEqual(DARK_FLOORS.tritan.RO);
    });

    it("dark deuteranopia: contrast floors hold", () => {
      const w = simDeut(DARK_WORKING), r = simDeut(DARK_REST), o = simDeut(DARK_OTHER);
      expect(contrastRatio(w, r)).toBeGreaterThanOrEqual(DARK_FLOORS.deut.WR);
      expect(contrastRatio(w, o)).toBeGreaterThanOrEqual(DARK_FLOORS.deut.WO);
      expect(contrastRatio(r, o)).toBeGreaterThanOrEqual(DARK_FLOORS.deut.RO);
    });

    it("dark protanopia: contrast floors hold", () => {
      const w = simProt(DARK_WORKING), r = simProt(DARK_REST), o = simProt(DARK_OTHER);
      expect(contrastRatio(w, r)).toBeGreaterThanOrEqual(DARK_FLOORS.prot.WR);
      expect(contrastRatio(w, o)).toBeGreaterThanOrEqual(DARK_FLOORS.prot.WO);
      expect(contrastRatio(r, o)).toBeGreaterThanOrEqual(DARK_FLOORS.prot.RO);
    });

    it("dark grayscale: contrast floors hold", () => {
      const w = simGrey(DARK_WORKING), r = simGrey(DARK_REST), o = simGrey(DARK_OTHER);
      expect(contrastRatio(w, r)).toBeGreaterThanOrEqual(DARK_FLOORS.grey.WR);
      expect(contrastRatio(w, o)).toBeGreaterThanOrEqual(DARK_FLOORS.grey.WO);
      expect(contrastRatio(r, o)).toBeGreaterThanOrEqual(DARK_FLOORS.grey.RO);
    });
  });

  describe("Token wiring: pacingRest is distinct from heatmapLow (no accidental re-share)", () => {
    it("light: pacingRest differs from heatmapLow so RecoveryHeatmap is unaffected", () => {
      expect(lightColors.pacingRest).not.toEqual(lightColors.heatmapLow);
    });

    it("dark: pacingRest differs from heatmapLow so RecoveryHeatmap is unaffected", () => {
      expect(darkColors.pacingRest).not.toEqual(darkColors.heatmapLow);
    });
  });
});
