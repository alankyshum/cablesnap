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
  describe("groupHeader style", () => {
    it("does NOT use flexWrap wrap (causes misalignment on medium screens)", () => {
      const block = src.match(/groupHeader:\s*\{[^}]*\}/);
      expect(block).not.toBeNull();
      expect(block![0]).not.toMatch(/flexWrap/);
    });

    it("uses flexDirection row for horizontal layout", () => {
      const block = src.match(/groupHeader:\s*\{[^}]*\}/);
      expect(block).not.toBeNull();
      expect(block![0]).toMatch(/flexDirection:\s*["']row["']/);
    });

    it("uses alignItems center for vertical centering", () => {
      const block = src.match(/groupHeader:\s*\{[^}]*\}/);
      expect(block).not.toBeNull();
      expect(block![0]).toMatch(/alignItems:\s*["']center["']/);
    });
  });

  describe("groupTitle style", () => {
    it("has flex: 1 so it fills remaining space and shrinks for buttons", () => {
      const block = src.match(/groupTitle:\s*\{[^}]*\}/);
      expect(block).not.toBeNull();
      expect(block![0]).toMatch(/flex:\s*1/);
    });

    it("has minWidth to prevent title from disappearing", () => {
      const block = src.match(/groupTitle:\s*\{[^}]*\}/);
      expect(block).not.toBeNull();
      expect(block![0]).toMatch(/minWidth:\s*\d+/);
    });
  });

  describe("non-compact layout", () => {
    it("title Pressable has flex: 1 to take remaining width", () => {
      // The non-compact branch wraps the title in a Pressable with flex: 1
      const nonCompactBlock = src.match(
        /View style=\{styles\.groupHeader\}[\s\S]*?<\/View>/
      );
      expect(nonCompactBlock).not.toBeNull();
      expect(nonCompactBlock![0]).toMatch(/style=\{\{\s*flex:\s*1\s*\}\}/);
    });

    it("title Text uses numberOfLines for truncation", () => {
      expect(src).toMatch(/numberOfLines=\{[12]\}/);
    });

    it("title Text uses ellipsizeMode tail", () => {
      expect(src).toMatch(/ellipsizeMode="tail"/);
    });
  });
});
