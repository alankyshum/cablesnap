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
  it("FlashList contentContainerStyle includes styles.content", () => {
    expect(src).toContain(
      "contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding }]}"
    );
  });

  it("styles.content defines vertical padding", () => {
    expect(src).toMatch(/content:\s*\{[^}]*padding:\s*16/);
    expect(src).toMatch(/content:\s*\{[^}]*paddingBottom:\s*40/);
  });

  it("does NOT use bare contentContainerStyle without styles.content", () => {
    expect(src).not.toMatch(
      /contentContainerStyle=\{\{\s*paddingHorizontal/
    );
  });
});

describe("feedback description textarea padding (BLD-204)", () => {
  it("multiline TextInput has contentStyle for internal padding", () => {
    expect(src).toMatch(/multiline[\s\S]*?contentStyle=/);
  });

  it("multilineContent style defines padding", () => {
    expect(src).toMatch(/multilineContent:\s*\{[\s\S]*?paddingTop/);
    expect(src).toMatch(/multilineContent:\s*\{[\s\S]*?paddingHorizontal/);
  });
});
