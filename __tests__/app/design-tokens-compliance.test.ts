/**
 * Structural tests verifying that design tokens are used instead of hardcoded
 * magic values. Catches pixel-slop regressions before they reach the demo.
 */
import * as fs from "fs";
import * as path from "path";

const COMPONENT_DIRS = [
  path.resolve(__dirname, "../../components"),
  path.resolve(__dirname, "../../app"),
];

const EXCLUDED_FILES = [
  "design-tokens.ts",
  "theme.ts",
  "design-tokens-compliance.test.ts",
];

function collectTsxFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      results.push(...collectTsxFiles(full));
    } else if (/\.(tsx?|ts)$/.test(entry.name) && !EXCLUDED_FILES.includes(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

const files = COMPONENT_DIRS.flatMap(collectTsxFiles);

describe("Design Token Compliance", () => {
  test("no borderRadius: 28 (should be radii.pill)", () => {
    const violations: string[] = [];
    for (const f of files) {
      const content = fs.readFileSync(f, "utf-8");
      if (/borderRadius:\s*28\b/.test(content)) {
        violations.push(path.relative(process.cwd(), f));
      }
    }
    expect(violations).toEqual([]);
  });

  test("no hardcoded modal overlay opacity other than 0.5", () => {
    const violations: string[] = [];
    const badOverlay = /rgba\(0\s*,\s*0\s*,\s*0\s*,\s*0\.(3|55|6)\)/;
    for (const f of files) {
      const content = fs.readFileSync(f, "utf-8");
      if (badOverlay.test(content)) {
        violations.push(path.relative(process.cwd(), f));
      }
    }
    expect(violations).toEqual([]);
  });

  test("no hardcoded #555 or #dfdfdf colors in components", () => {
    const violations: string[] = [];
    for (const f of files) {
      if (!f.includes("components")) continue;
      const content = fs.readFileSync(f, "utf-8");
      if (/#555(?!\w)|#dfdfdf/i.test(content)) {
        violations.push(path.relative(process.cwd(), f));
      }
    }
    expect(violations).toEqual([]);
  });

  test("scrim token exists in design-tokens", () => {
    const tokens = fs.readFileSync(
      path.resolve(__dirname, "../../constants/design-tokens.ts"),
      "utf-8",
    );
    expect(tokens).toContain("export const scrim");
  });
});
