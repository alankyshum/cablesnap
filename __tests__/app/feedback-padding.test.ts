import * as fs from "fs";
import * as path from "path";

/**
 * Structural test for BLD-177: FlashList contentContainerStyle must combine
 * styles.content with responsive horizontal padding.
 */

const src = fs.readFileSync(
  path.resolve(__dirname, "../../app/feedback.tsx"),
  "utf-8"
);

describe("feedback screen padding (BLD-177)", () => {
  it("FlashList contentContainerStyle includes styles.content with vertical padding", () => {
    expect(src).toContain(
      "contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding }]}"
    );
    expect(src).toMatch(/content:\s*\{[^}]*padding:\s*16/);
    expect(src).toMatch(/content:\s*\{[^}]*paddingBottom:\s*40/);
    expect(src).not.toMatch(
      /contentContainerStyle=\{\{\s*paddingHorizontal/
    );
  });
});

describe("feedback description textarea (BLD-204)", () => {
  it("description Input uses type textarea with rows", () => {
    expect(src).toMatch(/type="textarea"/);
    expect(src).toMatch(/rows=\{4\}/);
  });
});
