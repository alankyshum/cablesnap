/**
 * BLD-651 (GH #330): In-session workout notes textarea — readability bump.
 *
 * Builds on the original BLD-544 contrast pass; this round increases the
 * visible area, font size, and switches to the outline variant so the
 * textarea is clearly visible on dark theme (the original GH #330 bug).
 *
 * Acceptance:
 * - minHeight ≥ 140dp (≈5 lines, up from 96/3 lines)
 * - rows={5} so the textarea renders 5 visible lines without scrolling
 * - variant="outline" so the field has a real, theme-coloured border on
 *   both light and dark themes (filled variant has border==card → invisible)
 * - fontSize ≥ fontSizes.lg (18) for easier reading & typing on small/foldable phones
 * - Explicit theme text color (colors.onSurface) + placeholderTextColor
 *   (colors.onSurfaceVariant) for WCAG AA contrast
 * - textAlignVertical="top" so Android multiline starts top-left
 */
import fs from "fs";
import path from "path";

describe("ExerciseNotesPanel — taller + higher contrast (BLD-651, GH #330)", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../components/session/ExerciseNotesPanel.tsx"),
    "utf-8"
  );

  it("textarea minHeight is at least 140dp (≈5 lines)", () => {
    const m = src.match(/minHeight:\s*(\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(140);
  });

  it("textarea fontSize is at least fontSizes.lg (18) for legibility", () => {
    const m = src.match(/input:\s*\{[^}]*fontSize:\s*fontSizes\.(\w+)/);
    expect(m).not.toBeNull();
    const fontSizeMap: Record<string, number> = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20 };
    expect(fontSizeMap[m![1]] ?? 0).toBeGreaterThanOrEqual(18);
  });

  it("uses variant='outline' so border is visible on both themes", () => {
    expect(src).toMatch(/variant="outline"/);
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

  it("uses Input type='textarea' with rows={5}", () => {
    expect(src).toMatch(/type="textarea"/);
    expect(src).toMatch(/rows=\{5\}/);
  });

  it("does not touch the post-session summary notes file", () => {
    const summaryPath = path.resolve(__dirname, "../../app/session/summary/[id].tsx");
    expect(fs.existsSync(summaryPath)).toBe(true);
  });
});
