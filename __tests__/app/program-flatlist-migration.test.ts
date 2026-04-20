import * as fs from "fs";
import * as path from "path";

/**
 * Structural test for BLD-422: Program detail FlashList → FlatList migration.
 * FlashList v2 has layout measurement issues on foldable devices (Samsung Z Fold6),
 * causing empty renders. FlatList is the reliable replacement for small lists.
 */

const programDetailPath = path.resolve(__dirname, "../../app/program/[id].tsx");
const src = fs.readFileSync(programDetailPath, "utf-8");

describe("program detail FlashList migration (BLD-422)", () => {
  it("does not import FlashList", () => {
    expect(src).not.toMatch(/@shopify\/flash-list/);
  });

  it("imports FlatList from react-native", () => {
    expect(src).toMatch(/import\s*\{[^}]*FlatList[^}]*\}\s*from\s*["']react-native["']/);
  });

  it("uses FlatList component (not FlashList)", () => {
    expect(src).toMatch(/<FlatList[\s\n]/);
    expect(src).not.toMatch(/<FlashList[\s\n]/);
  });

  it("renders dayName text without explicit numberOfLines truncation", () => {
    // dayName text in the card should not be artificially truncated
    const dayNameUsages = src.match(/dayName\(item\)/g);
    expect(dayNameUsages).not.toBeNull();
    // Verify no numberOfLines={1} on the Text containing dayName
    const dayTextMatch = src.match(/Day \{index \+ 1\}:.*dayName/);
    expect(dayTextMatch).not.toBeNull();
    // The surrounding Text should not have numberOfLines
    const textBlock = src.substring(
      src.indexOf("Day {index + 1}") - 100,
      src.indexOf("Day {index + 1}") + 100
    );
    expect(textBlock).not.toMatch(/numberOfLines/);
  });
});
