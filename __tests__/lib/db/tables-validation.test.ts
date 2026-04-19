import * as fs from "fs";
import * as path from "path";

/**
 * Structural tests for BLD-403: DDL table name allowlist validation.
 * Verifies defense-in-depth pattern prevents SQL interpolation with unvalidated names.
 */

const src = fs.readFileSync(
  path.resolve(__dirname, "../../../lib/db/tables.ts"),
  "utf-8"
);

describe("tables.ts DDL allowlist (BLD-403)", () => {
  it("defines VALID_TABLES allowlist and assertValidTable guard", () => {
    expect(src).toContain("VALID_TABLES");
    expect(src).toContain("assertValidTable");
    expect(src).toMatch(/throw new Error.*Invalid table name/);
  });

  it("calls assertValidTable before hasColumn and addColumnIfMissing SQL", () => {
    const hasColumnBlock = src.slice(src.indexOf("async function hasColumn"));
    const addColumnBlock = src.slice(src.indexOf("async function addColumnIfMissing"));
    expect(hasColumnBlock).toMatch(/assertValidTable\(table\)[\s\S]*?PRAGMA table_info/);
    expect(addColumnBlock).toMatch(/assertValidTable\(table\)[\s\S]*?ALTER TABLE/);
  });

  it("does not use template literal interpolation for SQL", () => {
    // DDL functions should use string concatenation, not ${...} template literals
    const hasColumnFn = src.slice(src.indexOf("async function hasColumn"), src.indexOf("async function addColumnIfMissing"));
    const addColumnFn = src.slice(src.indexOf("async function addColumnIfMissing"), src.indexOf("async function createCoreTables"));
    expect(hasColumnFn).not.toMatch(/\$\{table\}/);
    expect(addColumnFn).not.toMatch(/\$\{table\}/);
  });
});
