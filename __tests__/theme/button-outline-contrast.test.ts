/**
 * button-outline-contrast.test.ts — BLD-4678
 *
 * Verifies that the new buttonOutlineBorder and buttonOutlineText tokens
 * meet WCAG 2.1 non-text contrast requirements (≥ 3:1) and text contrast requirements
 * (≥ 3:1 for large/mid text) against the surface card background (#F3F4F6 light, #161B22 dark)
 * under normal vision and simulated tritanopia.
 */

import { lightColors, darkColors } from "../../theme/colors";

// ── WCAG 2.1 luminance & contrast helpers ──

function toLinear(channel8bit: number): number {
  const sRGB = channel8bit / 255;
  return sRGB <= 0.04045 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
}

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

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ── Tritanopia CVD simulation (Viénot 1999) ──

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

function simulateTritanopia(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const rNew = clamp(0.95 * rn + 0.05 * gn);
  const gNew = clamp(0.433 * gn + 0.567 * bn);
  const bNew = clamp(0.475 * gn + 0.525 * bn);
  return rgbToHex(rNew * 255, gNew * 255, bNew * 255);
}

const MIN_CONTRAST = 3.0;

describe("Button outline contrast guarantees (BLD-4678)", () => {
  describe("Light Theme Outline Button Contrast (Surface: #F3F4F6)", () => {
    const surface = lightColors.card; // #F3F4F6

    it("border meets WCAG non-text contrast (≥ 3:1) vs surface", () => {
      const ratio = contrastRatio(lightColors.buttonOutlineBorder, surface);
      expect(ratio).toBeGreaterThanOrEqual(MIN_CONTRAST);
    });

    it("text meets contrast (≥ 3:1) vs surface under normal vision", () => {
      const ratio = contrastRatio(lightColors.buttonOutlineText, surface);
      expect(ratio).toBeGreaterThanOrEqual(MIN_CONTRAST);
    });

    it("text meets contrast (≥ 3:1) vs surface under tritanopia", () => {
      const simText = simulateTritanopia(lightColors.buttonOutlineText);
      const simSurface = simulateTritanopia(surface);
      const ratio = contrastRatio(simText, simSurface);
      expect(ratio).toBeGreaterThanOrEqual(MIN_CONTRAST);
    });
  });

  describe("Dark Theme Outline Button Contrast (Surface: #161B22)", () => {
    const surface = darkColors.card; // #161B22

    it("border meets WCAG non-text contrast (≥ 3:1) vs surface", () => {
      const ratio = contrastRatio(darkColors.buttonOutlineBorder, surface);
      expect(ratio).toBeGreaterThanOrEqual(MIN_CONTRAST);
    });

    it("text meets contrast (≥ 3:1) vs surface under normal vision", () => {
      const ratio = contrastRatio(darkColors.buttonOutlineText, surface);
      expect(ratio).toBeGreaterThanOrEqual(MIN_CONTRAST);
    });

    it("text meets contrast (≥ 3:1) vs surface under tritanopia", () => {
      const simText = simulateTritanopia(darkColors.buttonOutlineText);
      const simSurface = simulateTritanopia(surface);
      const ratio = contrastRatio(simText, simSurface);
      expect(ratio).toBeGreaterThanOrEqual(MIN_CONTRAST);
    });
  });
});
