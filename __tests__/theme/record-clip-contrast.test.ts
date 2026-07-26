/**
 * record-clip-contrast.test.ts — BLD-4099
 *
 * WCAG 2.1 AA text contrast and WCAG 2.1 non-text component edge contrast regression guard
 * for the empty-state 'Record a clip' button in the form clips tab.
 *
 * Background
 * ----------
 * Under protanopia CVD simulation, the warm coral brand button fill loses its hue identity
 * and desaturates toward a muddy dark tone, losing luminance separation from the page or card background.
 * To resolve this:
 *   1. An additive border is applied to the button, using colors.onPrimary (#1A2138).
 *   2. In light theme, the text color is overridden to a slightly darker navy (#101524) to satisfy
 *      WCAG AA text contrast (>= 4.5:1) in all simulated vision modes.
 */

import { lightColors, darkColors } from "../../theme/colors";

// ---------------------------------------------------------------------------
// WCAG 2.1 luminance / contrast helpers (mirroring tertiary-contrast.test.ts)
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
// CVD simulation helpers (mirroring tertiary-contrast.test.ts)
// ---------------------------------------------------------------------------

type RGB = { r: number; g: number; b: number };

function hexToRgb(hex: string): RGB {
  const h = hex.replace(/^#/, "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function clamp(v: number): number {
  return Math.min(1.0, Math.max(0.0, v));
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

/** Simplified protanopia simulation */
function simulateProtanopia(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const rNew = clamp(0.567 * rn + 0.433 * gn);
  const gNew = clamp(0.558 * rn + 0.442 * gn);
  const bNew = clamp(0.242 * rn + 0.758 * bn);
  return rgbToHex(rNew * 255, gNew * 255, bNew * 255);
}

/** Simplified deuteranopia simulation */
function simulateDeuteranopia(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const rNew = clamp(0.625 * rn + 0.375 * gn);
  const gNew = clamp(0.700 * rn + 0.300 * gn);
  const bNew = clamp(0.300 * rn + 0.700 * bn);
  return rgbToHex(rNew * 255, gNew * 255, bNew * 255);
}

/** Simplified tritanopia simulation */
function simulateTritanopia(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const rNew = clamp(0.95 * rn + 0.05 * gn);
  const gNew = clamp(0.433 * gn + 0.567 * bn);
  const bNew = clamp(0.475 * gn + 0.525 * bn);
  return rgbToHex(rNew * 255, gNew * 255, bNew * 255);
}

// ---------------------------------------------------------------------------
// Tested Colors Config
// ---------------------------------------------------------------------------

const LIGHT_BG = lightColors.background;             // #FAFAFA
const LIGHT_FILL = lightColors.primary;              // #FF6038
const LIGHT_BORDER = lightColors.primaryForeground;  // #1A2138
const LIGHT_TEXT = "#101524";                        // Overridden navy text

const DARK_BG = darkColors.background;               // #0D1117
const DARK_FILL = darkColors.primary;                // #FF7A55
const DARK_BORDER = darkColors.primaryForeground;    // #1A2138
const DARK_TEXT = darkColors.primaryForeground;      // #1A2138

const WCAG_TEXT_MIN = 4.5;
const WCAG_NON_TEXT_MIN = 3.0;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Record-a-clip empty-state button contrast & CVD guards (BLD-4099)", () => {
  describe("Light Theme Contrast", () => {
    it("text-vs-fill meets WCAG AA (>= 4.5:1) across all vision modes", () => {
      // Normal
      expect(contrastRatio(LIGHT_TEXT, LIGHT_FILL)).toBeGreaterThanOrEqual(WCAG_TEXT_MIN);
      // Protanopia
      expect(contrastRatio(simulateProtanopia(LIGHT_TEXT), simulateProtanopia(LIGHT_FILL))).toBeGreaterThanOrEqual(WCAG_TEXT_MIN);
      // Deuteranopia
      expect(contrastRatio(simulateDeuteranopia(LIGHT_TEXT), simulateDeuteranopia(LIGHT_FILL))).toBeGreaterThanOrEqual(WCAG_TEXT_MIN);
      // Tritanopia
      expect(contrastRatio(simulateTritanopia(LIGHT_TEXT), simulateTritanopia(LIGHT_FILL))).toBeGreaterThanOrEqual(WCAG_TEXT_MIN);
    });

    it("button-edge (border) meets WCAG non-text (>= 3.0:1) vs background across all vision modes", () => {
      // Normal
      expect(contrastRatio(LIGHT_BORDER, LIGHT_BG)).toBeGreaterThanOrEqual(WCAG_NON_TEXT_MIN);
      // Protanopia
      expect(contrastRatio(simulateProtanopia(LIGHT_BORDER), simulateProtanopia(LIGHT_BG))).toBeGreaterThanOrEqual(WCAG_NON_TEXT_MIN);
      // Deuteranopia
      expect(contrastRatio(simulateDeuteranopia(LIGHT_BORDER), simulateDeuteranopia(LIGHT_BG))).toBeGreaterThanOrEqual(WCAG_NON_TEXT_MIN);
      // Tritanopia
      expect(contrastRatio(simulateTritanopia(LIGHT_BORDER), simulateTritanopia(LIGHT_BG))).toBeGreaterThanOrEqual(WCAG_NON_TEXT_MIN);
    });

    it("button-edge (border) meets WCAG non-text (>= 3.0:1) vs fill across all vision modes", () => {
      // Normal
      expect(contrastRatio(LIGHT_BORDER, LIGHT_FILL)).toBeGreaterThanOrEqual(WCAG_NON_TEXT_MIN);
      // Protanopia
      expect(contrastRatio(simulateProtanopia(LIGHT_BORDER), simulateProtanopia(LIGHT_FILL))).toBeGreaterThanOrEqual(WCAG_NON_TEXT_MIN);
      // Deuteranopia
      expect(contrastRatio(simulateDeuteranopia(LIGHT_BORDER), simulateDeuteranopia(LIGHT_FILL))).toBeGreaterThanOrEqual(WCAG_NON_TEXT_MIN);
      // Tritanopia
      expect(contrastRatio(simulateTritanopia(LIGHT_BORDER), simulateTritanopia(LIGHT_FILL))).toBeGreaterThanOrEqual(WCAG_NON_TEXT_MIN);
    });
  });

  describe("Dark Theme Contrast", () => {
    it("text-vs-fill meets WCAG AA (>= 4.5:1) across all vision modes", () => {
      // Normal
      expect(contrastRatio(DARK_TEXT, DARK_FILL)).toBeGreaterThanOrEqual(WCAG_TEXT_MIN);
      // Protanopia
      expect(contrastRatio(simulateProtanopia(DARK_TEXT), simulateProtanopia(DARK_FILL))).toBeGreaterThanOrEqual(WCAG_TEXT_MIN);
      // Deuteranopia
      expect(contrastRatio(simulateDeuteranopia(DARK_TEXT), simulateDeuteranopia(DARK_FILL))).toBeGreaterThanOrEqual(WCAG_TEXT_MIN);
      // Tritanopia
      expect(contrastRatio(simulateTritanopia(DARK_TEXT), simulateTritanopia(DARK_FILL))).toBeGreaterThanOrEqual(WCAG_TEXT_MIN);
    });

    it("button fill meets WCAG non-text (>= 3.0:1) vs background across all vision modes", () => {
      // Normal
      expect(contrastRatio(DARK_FILL, DARK_BG)).toBeGreaterThanOrEqual(WCAG_NON_TEXT_MIN);
      // Protanopia
      expect(contrastRatio(simulateProtanopia(DARK_FILL), simulateProtanopia(DARK_BG))).toBeGreaterThanOrEqual(WCAG_NON_TEXT_MIN);
      // Deuteranopia
      expect(contrastRatio(simulateDeuteranopia(DARK_FILL), simulateDeuteranopia(DARK_BG))).toBeGreaterThanOrEqual(WCAG_NON_TEXT_MIN);
      // Tritanopia
      expect(contrastRatio(simulateTritanopia(DARK_FILL), simulateTritanopia(DARK_BG))).toBeGreaterThanOrEqual(WCAG_NON_TEXT_MIN);
    });

    it("button fill meets WCAG non-text (>= 3.0:1) vs border across all vision modes", () => {
      // Normal
      expect(contrastRatio(DARK_FILL, DARK_BORDER)).toBeGreaterThanOrEqual(WCAG_NON_TEXT_MIN);
      // Protanopia
      expect(contrastRatio(simulateProtanopia(DARK_FILL), simulateProtanopia(DARK_BORDER))).toBeGreaterThanOrEqual(WCAG_NON_TEXT_MIN);
      // Deuteranopia
      expect(contrastRatio(simulateDeuteranopia(DARK_FILL), simulateDeuteranopia(DARK_BORDER))).toBeGreaterThanOrEqual(WCAG_NON_TEXT_MIN);
      // Tritanopia
      expect(contrastRatio(simulateTritanopia(DARK_FILL), simulateTritanopia(DARK_BORDER))).toBeGreaterThanOrEqual(WCAG_NON_TEXT_MIN);
    });
  });
});
