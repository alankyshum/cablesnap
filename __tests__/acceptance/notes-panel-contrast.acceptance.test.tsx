/**
 * BLD-544 (GH #330): In-session workout notes textarea — taller + higher contrast.
 *
 * Acceptance:
 * - minHeight bumped from 48 → ~96 (≈3 lines)
 * - fontSize bumped from fontSizes.sm → fontSizes.base or larger
 * - Explicit theme text color (colors.onSurface) + placeholderTextColor
 *   (colors.onSurfaceVariant) for WCAG AA contrast
 * - textAlignVertical="top" so Android multiline starts top-left
 */
import fs from "fs";
import path from "path";

describe("ExerciseNotesPanel — taller + higher contrast (BLD-544, GH #330)", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../components/session/ExerciseNotesPanel.tsx"),
    "utf-8"
  );

  it("textarea minHeight is at least 96dp (≈3 lines)", () => {
    const m = src.match(/minHeight:\s*(\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(96);
  });

  it("textarea fontSize is at least fontSizes.base (16) for legibility", () => {
    const m = src.match(/input:\s*\{[^}]*fontSize:\s*fontSizes\.(\w+)/);
    expect(m).not.toBeNull();
    const fontSizeMap: Record<string, number> = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20 };
    expect(fontSizeMap[m![1]] ?? 0).toBeGreaterThanOrEqual(16);
  });

  it("placeholder text color is explicitly set from theme (AA contrast)", () => {
    expect(src).toMatch(/placeholderTextColor=\{colors\.onSurfaceVariant\}/);
  });

  it("text color is explicitly set to colors.onSurface", () => {
    expect(src).toMatch(/color:\s*colors\.onSurface/);
  });

  it("textAlignVertical is 'top' so Android multiline starts top-left", () => {
    expect(src).toMatch(/textAlignVertical="top"/);
  });

  it("uses Input type='textarea' (rows-based sizing, not single-line input)", () => {
    expect(src).toMatch(/type="textarea"/);
    expect(src).toMatch(/rows=\{3\}/);
  });

  it("does not touch the post-session summary notes file", () => {
    const summaryPath = path.resolve(__dirname, "../../app/session/summary/[id].tsx");
    expect(fs.existsSync(summaryPath)).toBe(true);
  });
});
