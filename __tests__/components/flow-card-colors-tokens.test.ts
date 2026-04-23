import fs from "fs";
import path from "path";

// Regression test for BLD-521: flow-card-colors.ts must use theme tokens,
// not hardcoded hex color literals. Catches drift back to raw #RRGGBB values.
describe("flow-card-colors theme-token contract", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../components/ui/flow-card-colors.ts"),
    "utf8",
  );

  it("does not contain raw hex color literals", () => {
    const hexMatches = source.match(/['"]#[0-9a-fA-F]{3,8}['"]/g) ?? [];
    expect(hexMatches).toEqual([]);
  });

  it("sources severity pairs from Colors.{light,dark}.*Subtle tokens", () => {
    expect(source).toMatch(/successSubtle/);
    expect(source).toMatch(/warningSubtle/);
    expect(source).toMatch(/dangerSubtle/);
    expect(source).toMatch(/Colors\[/);
  });
});
