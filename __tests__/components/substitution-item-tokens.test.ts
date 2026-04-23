import fs from "fs";
import path from "path";

// Regression test for BLD-521: SubstitutionItem.tsx must source score-based
// badge colors from theme tokens (Colors.{light,dark}.*Subtle), not hex literals.
describe("SubstitutionItem theme-token contract", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../components/substitution/SubstitutionItem.tsx"),
    "utf8",
  );

  it("does not contain raw hex color literals", () => {
    const hexMatches = source.match(/['"]#[0-9a-fA-F]{3,8}['"]/g) ?? [];
    expect(hexMatches).toEqual([]);
  });

  it("sources score palette from Colors.{light,dark}.*Subtle tokens", () => {
    expect(source).toMatch(/successSubtle/);
    expect(source).toMatch(/warningSubtle/);
    expect(source).toMatch(/dangerSubtle/);
  });
});
