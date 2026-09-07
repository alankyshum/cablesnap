/**
 * heatmap-cvd-contrast.test.ts — BLD-4539
 *
 * Asserts adjacent-step WCAG relative luminance contrast ratios for both light and
 * dark mode heatmap ramps. This guards against future regressions where adjacent
 * steps could become indistinguishable under tritanopia color blindness.
 *
 * Light mode and dark mode adjacent steps must have a contrast ratio of at least 2.2:1.
 */

import { lightColors, darkColors } from "@/theme/colors";

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

const MIN_CONTRAST = 2.2;

describe("WorkoutHeatmap CVD luminance contrast (BLD-4539)", () => {
  describe("Light Theme adjacent-step contrast ratios (step0 -> step1 -> step2 -> step3)", () => {
    const step0 = lightColors.muted;
    const step1 = lightColors.heatmapFreq1;
    const step2 = lightColors.heatmapFreq2;
    const step3 = lightColors.heatmapFreq3;

    it("step0 -> step1 contrast ratio is >= 2.2:1", () => {
      expect(contrastRatio(step0, step1)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    });

    it("step1 -> step2 contrast ratio is >= 2.2:1", () => {
      expect(contrastRatio(step1, step2)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    });

    it("step2 -> step3 contrast ratio is >= 2.2:1", () => {
      expect(contrastRatio(step2, step3)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    });

    it("luminance decreases monotonically (each step is darker)", () => {
      const l0 = relativeLuminance(step0);
      const l1 = relativeLuminance(step1);
      const l2 = relativeLuminance(step2);
      const l3 = relativeLuminance(step3);
      expect(l0).toBeGreaterThan(l1);
      expect(l1).toBeGreaterThan(l2);
      expect(l2).toBeGreaterThan(l3);
    });
  });

  describe("Dark Theme adjacent-step contrast ratios (step0 -> step1 -> step2 -> step3)", () => {
    const step0 = darkColors.muted;
    const step1 = darkColors.heatmapFreq1;
    const step2 = darkColors.heatmapFreq2;
    const step3 = darkColors.heatmapFreq3;

    it("step0 -> step1 contrast ratio is >= 2.2:1", () => {
      expect(contrastRatio(step0, step1)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    });

    it("step1 -> step2 contrast ratio is >= 2.2:1", () => {
      expect(contrastRatio(step1, step2)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    });

    it("step2 -> step3 contrast ratio is >= 2.2:1", () => {
      expect(contrastRatio(step2, step3)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    });

    it("luminance increases monotonically (each step is lighter)", () => {
      const l0 = relativeLuminance(step0);
      const l1 = relativeLuminance(step1);
      const l2 = relativeLuminance(step2);
      const l3 = relativeLuminance(step3);
      expect(l1).toBeGreaterThan(l0);
      expect(l2).toBeGreaterThan(l1);
      expect(l3).toBeGreaterThan(l2);
    });
  });
});
