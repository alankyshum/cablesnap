/**
 * bmc-button-contrast.test.ts — BLD-4519
 *
 * Regression guard for the 'Buy me a coffee' button contrast in the Settings
 * About block.
 *
 * Background
 * ----------
 * The original implementation rendered a static PNG badge (official BMC orange
 * #FF6038 background + white text). Under deuteranopia CVD simulation the
 * orange desaturates toward muddy yellow-brown and the text/background contrast
 * dropped below WCAG AA. Since it is a raster brand asset it cannot be
 * recoloured by the app theme.
 *
 * Fix (BLD-4519)
 * --------------
 * The PNG badge was replaced with a native Pressable using:
 *   background: colors.secondary  (#1A2138 light / #2D3350 dark)
 *   foreground: colors.onSecondary (#FFFFFF both themes)
 *
 * This is a dark-navy / white combination whose contrast (≈15.9:1 light,
 * ≈12.4:1 dark) relies on luminance difference rather than hue, making it
 * robust across all CVD modes: deuteranopia, protanopia, tritanopia, and
 * achromatopsia.
 *
 * Contract
 * --------
 * 1. Normal vision: text contrast meets WCAG AA (≥4.5:1) in both themes.
 * 2. All Machado-2009 CVD modes (deut / prot / tritan / grey): contrast
 *    remains ≥4.5:1, confirming the fix resolves the audit finding.
 * 3. Floors are imported from the real token values in theme/colors.ts so a
 *    future palette change breaks this test and forces conscious re-verification.
 */

import { lightColors, darkColors } from "@/theme/colors";

// ---------------------------------------------------------------------------
// WCAG 2.1 relative luminance / contrast helpers
// ---------------------------------------------------------------------------

function toLinear(channel8bit: number): number {
  const sRGB = channel8bit / 255;
  return sRGB <= 0.04045
    ? sRGB / 12.92
    : Math.pow((sRGB + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const h = hex.replace(/^#/, "");
  if (h.length !== 6)
    throw new Error(`relativeLuminance: expected 6-digit hex, got "${hex}"`);
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
// Machado-2009 CVD simulation, severity = 1.0
// ---------------------------------------------------------------------------

type Matrix3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
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

const M_TRITAN: Matrix3 = [
  [1.255528, -0.076749, -0.178779],
  [-0.078411, 0.930809, 0.147602],
  [0.004733, 0.691367, -0.696100],
];

function clamp01(v: number): number {
  return Math.min(1.0, Math.max(0.0, v));
}

function hexToLinearRgb(hex: string): [number, number, number] {
  const h = hex.replace(/^#/, "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

function linearRgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((c) => Math.round(clamp01(c) * 255).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

function applyMatrix(hex: string, M: Matrix3): string {
  const [r, g, b] = hexToLinearRgb(hex);
  return linearRgbToHex(
    M[0][0] * r + M[0][1] * g + M[0][2] * b,
    M[1][0] * r + M[1][1] * g + M[1][2] * b,
    M[2][0] * r + M[2][1] * g + M[2][2] * b,
  );
}

/** Rec-709 luma — equal-grey approximation for achromatopsia. */
function simGrey(hex: string): string {
  const h = hex.replace(/^#/, "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const l = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  return linearRgbToHex(l / 255, l / 255, l / 255);
}

const simDeut = (hex: string) => applyMatrix(hex, M_DEUT);
const simProt = (hex: string) => applyMatrix(hex, M_PROT);
const simTritan = (hex: string) => applyMatrix(hex, M_TRITAN);

// ---------------------------------------------------------------------------
// Token values under test — read from the real theme so palette changes break
// this test and require conscious re-verification.
// ---------------------------------------------------------------------------

// Light theme BMC button tokens
const LIGHT_BG = lightColors.secondary;            // #1A2138  (dark navy)
const LIGHT_FG = lightColors.secondaryForeground;  // #FFFFFF

// Dark theme BMC button tokens
const DARK_BG  = darkColors.secondary;             // #2D3350  (slightly lighter navy)
const DARK_FG  = darkColors.secondaryForeground;   // #FFFFFF

// WCAG AA threshold for normal text
const WCAG_AA = 4.5;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BMC button WCAG AA contrast guard (BLD-4519)", () => {
  describe("Normal vision — both themes meet WCAG AA (≥4.5:1)", () => {
    it("light theme: onSecondary on secondary ≥ 4.5:1", () => {
      expect(contrastRatio(LIGHT_FG, LIGHT_BG)).toBeGreaterThanOrEqual(WCAG_AA);
    });

    it("dark theme: onSecondary on secondary ≥ 4.5:1", () => {
      expect(contrastRatio(DARK_FG, DARK_BG)).toBeGreaterThanOrEqual(WCAG_AA);
    });

    // Document the high baseline so regressions toward 4.5:1 are visible.
    it("light theme contrast is high (≥ 10:1) — navy/white combination", () => {
      expect(contrastRatio(LIGHT_FG, LIGHT_BG)).toBeGreaterThanOrEqual(10);
    });

    it("dark theme contrast is high (≥ 10:1) — navy/white combination", () => {
      expect(contrastRatio(DARK_FG, DARK_BG)).toBeGreaterThanOrEqual(10);
    });
  });

  describe("CVD modes — deuteranopia (the audit-flagged failure mode)", () => {
    it("light theme under deuteranopia: text ≥ 4.5:1", () => {
      expect(contrastRatio(simDeut(LIGHT_FG), simDeut(LIGHT_BG))).toBeGreaterThanOrEqual(WCAG_AA);
    });

    it("dark theme under deuteranopia: text ≥ 4.5:1", () => {
      expect(contrastRatio(simDeut(DARK_FG), simDeut(DARK_BG))).toBeGreaterThanOrEqual(WCAG_AA);
    });
  });

  describe("CVD modes — protanopia", () => {
    it("light theme under protanopia: text ≥ 4.5:1", () => {
      expect(contrastRatio(simProt(LIGHT_FG), simProt(LIGHT_BG))).toBeGreaterThanOrEqual(WCAG_AA);
    });

    it("dark theme under protanopia: text ≥ 4.5:1", () => {
      expect(contrastRatio(simProt(DARK_FG), simProt(DARK_BG))).toBeGreaterThanOrEqual(WCAG_AA);
    });
  });

  describe("CVD modes — tritanopia", () => {
    it("light theme under tritanopia: text ≥ 4.5:1", () => {
      expect(contrastRatio(simTritan(LIGHT_FG), simTritan(LIGHT_BG))).toBeGreaterThanOrEqual(WCAG_AA);
    });

    it("dark theme under tritanopia: text ≥ 4.5:1", () => {
      expect(contrastRatio(simTritan(DARK_FG), simTritan(DARK_BG))).toBeGreaterThanOrEqual(WCAG_AA);
    });
  });

  describe("CVD modes — achromatopsia (greyscale)", () => {
    it("light theme under greyscale: text ≥ 4.5:1", () => {
      expect(contrastRatio(simGrey(LIGHT_FG), simGrey(LIGHT_BG))).toBeGreaterThanOrEqual(WCAG_AA);
    });

    it("dark theme under greyscale: text ≥ 4.5:1", () => {
      expect(contrastRatio(simGrey(DARK_FG), simGrey(DARK_BG))).toBeGreaterThanOrEqual(WCAG_AA);
    });
  });
});
