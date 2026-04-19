import * as fs from "fs";
import * as path from "path";

/**
 * Structural tests for BLD-390: Exercise header alignment fix (GitHub #220).
 * Verifies that the non-compact groupHeader does NOT use flexWrap: "wrap",
 * which caused elements to break onto separate lines on medium-width screens.
 */

const src = fs.readFileSync(
  path.resolve(__dirname, "../../components/session/GroupCardHeader.tsx"),
  "utf-8"
);

describe("exercise header alignment (BLD-390)", () => {
  it("groupHeader uses row layout without flexWrap and with center alignment", () => {
    const block = src.match(/groupHeader:\s*\{[^}]*\}/);
    expect(block).not.toBeNull();
    expect(block![0]).not.toMatch(/flexWrap/);
    expect(block![0]).toMatch(/flexDirection:\s*["']row["']/);
    expect(block![0]).toMatch(/alignItems:\s*["']center["']/);
  });

  it("groupTitle has flex: 1 and minWidth to fill space and prevent disappearing", () => {
    const block = src.match(/groupTitle:\s*\{[^}]*\}/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/flex:\s*1/);
    expect(block![0]).toMatch(/minWidth:\s*\d+/);
  });

  it("non-compact title Pressable has flex: 1 with truncation via numberOfLines and ellipsizeMode", () => {
    const nonCompactBlock = src.match(
      /View style=\{styles\.groupHeader\}[\s\S]*?<\/View>/
    );
    expect(nonCompactBlock).not.toBeNull();
    expect(nonCompactBlock![0]).toMatch(/style=\{\{\s*flex:\s*1\s*\}\}/);
    expect(src).toMatch(/numberOfLines=\{[12]\}/);
    expect(src).toMatch(/ellipsizeMode="tail"/);
  });
});
