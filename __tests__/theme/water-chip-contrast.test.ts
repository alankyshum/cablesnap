/**
 * water-chip-contrast.test.ts — BLD-4684
 *
 * WCAG 2.1 AA contrast regression guard for primaryTextOnSurface under deuteranopia.
 *
 * Requirements:
 * - Assert primaryTextOnSurface on both #FAFAFA (background) and #F3F4F6 (card)
 *   meets >= 4.5:1 in normal vision and under Machado-2009 deuteranopia severity 1.0.
 */

import { lightColors } from "../../theme/colors";

// ---------------------------------------------------------------------------
// WCAG 2.1 relative luminance and contrast ratio helpers
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
// Machado 2009 Deuteranopia Simulation (severity = 1.0)
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

function simulateDeuteranopia(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const v = [r / 255, g / 255, b / 255];
  const out = [
    clamp01(M_DEUT[0][0] * v[0] + M_DEUT[0][1] * v[1] + M_DEUT[0][2] * v[2]),
    clamp01(M_DEUT[1][0] * v[0] + M_DEUT[1][1] * v[1] + M_DEUT[1][2] * v[2]),
    clamp01(M_DEUT[2][0] * v[0] + M_DEUT[2][1] * v[1] + M_DEUT[2][2] * v[2]),
  ];
  return rgbToHex(out[0] * 255, out[1] * 255, out[2] * 255);
}

// ---------------------------------------------------------------------------
// Test Config
// ---------------------------------------------------------------------------

const TEXT_COLOR = lightColors.primaryTextOnSurface; // #B02E0C
const BG_FAFAFA = "#FAFAFA";
const BG_F3F4F6 = "#F3F4F6";

const WCAG_AA_MIN = 4.5;

describe("Water quick-add chip contrast under Deuteranopia (BLD-4684)", () => {
  describe("Normal Vision", () => {
    it("primaryTextOnSurface meets WCAG AA on #FAFAFA (background)", () => {
      expect(contrastRatio(TEXT_COLOR, BG_FAFAFA)).toBeGreaterThanOrEqual(WCAG_AA_MIN);
    });

    it("primaryTextOnSurface meets WCAG AA on #F3F4F6 (card)", () => {
      expect(contrastRatio(TEXT_COLOR, BG_F3F4F6)).toBeGreaterThanOrEqual(WCAG_AA_MIN);
    });
  });

  describe("Machado-2009 Deuteranopia (severity 1.0)", () => {
    it("primaryTextOnSurface meets WCAG AA on #FAFAFA under deuteranopia", () => {
      const simText = simulateDeuteranopia(TEXT_COLOR);
      const simBg = simulateDeuteranopia(BG_FAFAFA);
      expect(contrastRatio(simText, simBg)).toBeGreaterThanOrEqual(WCAG_AA_MIN);
    });

    it("primaryTextOnSurface meets WCAG AA on #F3F4F6 under deuteranopia", () => {
      const simText = simulateDeuteranopia(TEXT_COLOR);
      const simBg = simulateDeuteranopia(BG_F3F4F6);
      expect(contrastRatio(simText, simBg)).toBeGreaterThanOrEqual(WCAG_AA_MIN);
    });
  });
});
