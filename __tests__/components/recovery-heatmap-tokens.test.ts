import fs from "fs";
import path from "path";

// Regression test for BLD-521: RecoveryHeatmap.tsx must source heatmap palette
// + border from theme tokens via useThemeColors(), not hardcoded hex literals.
describe("RecoveryHeatmap theme-token contract", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../components/home/RecoveryHeatmap.tsx"),
    "utf8",
  );

  it("does not contain raw hex color literals", () => {
    const hexMatches = source.match(/['"]#[0-9a-fA-F]{3,8}['"]/g) ?? [];
    expect(hexMatches).toEqual([]);
  });

  it("sources heatmap palette from useThemeColors() tokens", () => {
    expect(source).toMatch(/colors\.heatmapLow/);
    expect(source).toMatch(/colors\.heatmapMid/);
    expect(source).toMatch(/colors\.heatmapHigh/);
    expect(source).toMatch(/colors\.heatmapBorder/);
  });

  it("does not branch on isDark for the static heatmap palette", () => {
    expect(source).not.toMatch(/isDark\s*\?\s*\[/);
    expect(source).not.toMatch(/RECOVERY_COLORS/);
  });
});
