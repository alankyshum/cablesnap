import * as fs from "fs";
import * as path from "path";

/**
 * BLD-550: the "previous performance" row uses design tokens, not hard-
 * coded font sizes. BLD-850 moved that row out of GroupCardHeader and into
 * the new `LastNextRow` component (owned by the header). The contract
 * survives — we just check the new home.
 */

const lastNextRowSrc = fs.readFileSync(
  path.resolve(__dirname, "../../components/session/LastNextRow.tsx"),
  "utf-8",
);

describe("LastNextRow uses design tokens (BLD-550, redirected to LastNextRow by BLD-850)", () => {
  it("imports fontSizes from design-tokens", () => {
    expect(lastNextRowSrc).toMatch(
      /import\s*\{[^}]*fontSizes[^}]*\}\s*from\s*["'][^"']*design-tokens["']/,
    );
  });

  it("references fontSizes.xs (not the off-token 11)", () => {
    expect(lastNextRowSrc).toContain("fontSizes.xs");
    // Negative: the previously-banned literal must not creep back.
    expect(lastNextRowSrc).not.toMatch(/fontSize:\s*11\b/);
  });

  it("each half meets the 44dp tap-target contract", () => {
    // BLD-550 used `hitSlop` to compensate for sub-44dp height; BLD-850
    // makes that unnecessary by sizing the row + each half to 44dp.
    const halfBlock = lastNextRowSrc.match(/half:\s*\{[^}]+\}/s);
    expect(halfBlock).not.toBeNull();
    expect(halfBlock![0]).toMatch(/minHeight:\s*44\b/);
    const rowBlock = lastNextRowSrc.match(/row:\s*\{[^}]+\}/s);
    expect(rowBlock).not.toBeNull();
    expect(rowBlock![0]).toMatch(/minHeight:\s*44\b/);
  });
});
