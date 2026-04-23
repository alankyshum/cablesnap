import fs from "fs";
import path from "path";

// Regression test: RestBreakdownSheet must use theme tokens only (no hardcoded hex colors).
// Matches the established pattern (PR #305 / PR #314).
describe("RestBreakdownSheet theme-token contract", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../components/session/RestBreakdownSheet.tsx"),
    "utf8",
  );

  it("does not contain raw hex color literals", () => {
    const hexMatches = source.match(/['"]#[0-9a-fA-F]{3,8}['"]/g) ?? [];
    expect(hexMatches).toEqual([]);
  });

  it("sources colors from useThemeColors()", () => {
    expect(source).toMatch(/useThemeColors/);
    expect(source).toMatch(/colors\.(onSurface|primary|surface|outline|secondary)/);
  });
});
