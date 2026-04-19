import * as fs from "fs";
import * as path from "path";

/**
 * Structural tests for BLD-390: Exercise header alignment fix (GitHub #220).
 * Verifies the 2-row layout: row1 = name + actions, row2 = details + mode.
 */

const src = fs.readFileSync(
  path.resolve(__dirname, "../../components/session/GroupCardHeader.tsx"),
  "utf-8"
);

describe("exercise header alignment (BLD-390)", () => {
  it("headerRow1 uses row layout with center alignment for name + actions", () => {
    const block = src.match(/headerRow1:\s*\{[^}]*\}/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/flexDirection:\s*["']row["']/);
    expect(block![0]).toMatch(/alignItems:\s*["']center["']/);
  });

  it("exercise name Pressable has flex: 1 and flexShrink: 1 to fill space", () => {
    expect(src).toMatch(/flex:\s*1,\s*flexShrink:\s*1/);
  });

  it("groupTitle has fontWeight 700 for visual emphasis", () => {
    const block = src.match(/groupTitle:\s*\{[^}]*\}/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/fontWeight:\s*["']700["']/);
  });
});
