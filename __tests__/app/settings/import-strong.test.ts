import * as fs from "fs";
import * as path from "path";

const root = path.resolve(__dirname, "../../..");
const importStrongPath = path.join(root, "app/settings/import-strong.tsx");
const importStrongSource = fs.readFileSync(importStrongPath, "utf-8");

describe("Import Strong wizard screen structure", () => {
  it("should exist as a file", () => {
    expect(fs.existsSync(importStrongPath)).toBe(true);
  });

  it("should export a default component", () => {
    expect(importStrongSource).toMatch(/export default function/);
  });

  it("should implement a multi-step wizard", () => {
    expect(importStrongSource).toContain("step === 1");
    expect(importStrongSource).toContain("step === 2");
    expect(importStrongSource).toContain("step === 3");
    expect(importStrongSource).toContain("step === 4");
  });

  it("should use FlatList instead of ScrollView+map for list rendering in JSX", () => {
    // Ensure no JSX .map() pattern with key= (which indicates list rendering in JSX)
    // State transforms like raw.map() and prev.map() are fine
    const jsxMapPattern = /\.map\(\([^)]*\)\s*=>\s*\(\s*</g;
    const matches = importStrongSource.match(jsxMapPattern) || [];
    expect(matches.length).toBe(0);
  });

  it("should have accessibility labels on all buttons", () => {
    // Count Button opens and accessibilityLabel occurrences
    const buttonCount = (importStrongSource.match(/<Button\b/g) || []).length;
    const labelCount = (importStrongSource.match(/accessibilityLabel=/g) || []).length;
    // Every Button should have an accessibilityLabel
    expect(labelCount).toBeGreaterThanOrEqual(buttonCount);
  });

  it("should have accessibility roles on interactive elements", () => {
    const buttonCount = (importStrongSource.match(/<Button\b/g) || []).length;
    const roleCount = (importStrongSource.match(/accessibilityRole="button"/g) || []).length;
    expect(roleCount).toBeGreaterThanOrEqual(buttonCount);
  });

  it("should handle file selection via document picker", () => {
    expect(importStrongSource).toContain("getDocumentAsync");
  });

  it("should support unit conversion (kg/lb)", () => {
    expect(importStrongSource).toContain("sourceUnit");
    expect(importStrongSource).toContain("targetUnit");
    expect(importStrongSource).toContain("convertWeight");
  });

  it("should check for duplicate sessions", () => {
    expect(importStrongSource).toContain("duplicates");
    expect(importStrongSource).toContain("Potential Duplicates");
  });

  it("should show import progress", () => {
    expect(importStrongSource).toContain("ProgressBar");
    expect(importStrongSource).toContain("progress");
  });

  it("should wrap import in a database transaction", () => {
    expect(importStrongSource).toContain("withTransactionAsync");
  });

  it("should use useEffect (not useState) for side effects", () => {
    expect(importStrongSource).toContain("useEffect");
    expect(importStrongSource).not.toMatch(/useState\s*\(\s*\(\s*\)\s*=>/);
  });
});
