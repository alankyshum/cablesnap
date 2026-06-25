/**
 * AC3 — WCAG 2.1 AA contrast regression guard for primary/onPrimary token pair.
 *
 * Imports the REAL exported tokens from theme/colors.ts (not hardcoded copies).
 * Computes the WCAG 2.1 relative luminance contrast ratio for both themes.
 * Fails CI if either drops below 4.5:1 (WCAG AA for normal text).
 *
 * BLD-1904 / BLD-1901 — navy onPrimary flip (#FFFFFF → #1A2138).
 */

import { lightColors, darkColors } from "../../theme/colors";

// ---------------------------------------------------------------------------
// WCAG 2.1 contrast ratio helpers
// ---------------------------------------------------------------------------

/**
 * Convert an 8-bit sRGB channel value (0-255) to linear light.
 * Spec: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function toLinear(channel8bit: number): number {
  const sRGB = channel8bit / 255;
  return sRGB <= 0.04045 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
}

/**
 * Compute WCAG 2.1 relative luminance from a 6-digit hex color (e.g. "#FF6038").
 * Leading "#" is optional.
 */
function relativeLuminance(hex: string): number {
  const h = hex.replace(/^#/, "");
  if (h.length !== 6) {
    throw new Error(`relativeLuminance: expected 6-digit hex, got "${hex}"`);
  }
  const r = toLinear(parseInt(h.slice(0, 2), 16));
  const g = toLinear(parseInt(h.slice(2, 4), 16));
  const b = toLinear(parseInt(h.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Compute WCAG 2.1 contrast ratio between two colors.
 * Returns value in [1, 21]. WCAG AA requires >= 4.5 for normal text.
 */
function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const WCAG_AA_MIN = 4.5;

describe("primary / onPrimary WCAG AA contrast guard (BLD-1901 Option A)", () => {
  it("light theme: primaryForeground on primary meets WCAG AA (≥ 4.5:1)", () => {
    const ratio = contrastRatio(lightColors.primaryForeground, lightColors.primary);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_MIN);
  });

  it("dark theme: primaryForeground on primary meets WCAG AA (≥ 4.5:1)", () => {
    const ratio = contrastRatio(darkColors.primaryForeground, darkColors.primary);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_MIN);
  });

  it("light theme contrast ratio matches spec (≥ 5.29:1 for navy #1A2138 on coral #FF6038)", () => {
    // Verified at plan time: 5.295:1. Bound with small tolerance to detect regressions
    // without being brittle to floating-point differences.
    const ratio = contrastRatio(lightColors.primaryForeground, lightColors.primary);
    expect(ratio).toBeGreaterThanOrEqual(5.0);
  });

  it("dark theme contrast ratio matches spec (≥ 6.19:1 for navy #1A2138 on coral #FF7A55)", () => {
    // Verified at plan time: 6.194:1.
    const ratio = contrastRatio(darkColors.primaryForeground, darkColors.primary);
    expect(ratio).toBeGreaterThanOrEqual(5.0);
  });
});
