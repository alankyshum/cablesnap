import * as fs from "fs";
import * as path from "path";

const groupCardHeaderSrc = fs.readFileSync(
  path.resolve(__dirname, "../../components/session/GroupCardHeader.tsx"),
  "utf-8",
);

describe("GroupCardHeader previousPerf uses design tokens (BLD-550)", () => {
  it("imports fontSizes from design-tokens", () => {
    expect(groupCardHeaderSrc).toMatch(/import\s*\{[^}]*fontSizes[^}]*\}\s*from\s*["'][^"']*design-tokens["']/);
  });

  it("previousPerf style references fontSizes.xs (not a hardcoded number)", () => {
    const match = groupCardHeaderSrc.match(/previousPerf:\s*\{[^}]+\}/);
    expect(match).not.toBeNull();
    const decl = match![0];
    expect(decl).toContain("fontSizes.xs");
    // Must not reintroduce the off-token 11
    expect(decl).not.toMatch(/fontSize:\s*11\b/);
  });

  it("documents hitSlop dependency on previousPerfBtn minHeight", () => {
    // Future refactors must know hitSlop compensates for the below-44dp minHeight.
    expect(groupCardHeaderSrc).toMatch(/hitSlop[\s\S]{0,200}previousPerfBtn|previousPerfBtn[\s\S]{0,400}hitSlop/);
    // Explicit comment near previousPerfBtn style decl
    const btnIdx = groupCardHeaderSrc.indexOf("previousPerfBtn: {");
    expect(btnIdx).toBeGreaterThan(-1);
    const preceding = groupCardHeaderSrc.slice(Math.max(0, btnIdx - 400), btnIdx);
    expect(preceding).toMatch(/hitSlop/i);
  });
});
