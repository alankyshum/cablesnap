/**
 * BLD-1168 AC #275 — Migration backfill test.
 *
 * GIVEN a pre-migration database (no segments table, no cached columns on workout_sets)
 * WHEN the new app version opens it
 * THEN migration adds the table + columns AND a one-time backfill computes
 *   cached_volume_kg = weight*reps
 *   cached_e1rm_kg   = weight*(1+reps/30)
 * for every existing row (legacy formula is correct because advanced sets don't exist yet).
 */
import { computeSetCacheValues } from "../lib/db/sets";

describe("BLD-1168 AC#275 — migration cached-columns backfill", () => {
  it("migrations.ts Phase 2 adds cached_volume_kg and cached_e1rm_kg via addColumnIfMissing", () => {
    // Verify the migration source contains the two addColumnIfMissing calls.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs");
    const path = require("path");
    const migSource: string = fs.readFileSync(
      path.join(__dirname, "../lib/db/migrations.ts"),
      "utf-8",
    );

    expect(migSource).toMatch(/addColumnIfMissing.*workout_sets.*cached_volume_kg/);
    expect(migSource).toMatch(/addColumnIfMissing.*workout_sets.*cached_e1rm_kg/);
    // Columns should be REAL NOT NULL DEFAULT 0
    expect(migSource).toMatch(/REAL NOT NULL DEFAULT 0/);
  });

  it("migrations.ts Phase 3 contains backfill UPDATE with float literal 1.0", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs");
    const path = require("path");
    const migSource: string = fs.readFileSync(
      path.join(__dirname, "../lib/db/migrations.ts"),
      "utf-8",
    );

    // Use the code-comment markers (not the JSDoc header)
    const phase3Start = migSource.indexOf("// PHASE 3:");
    const phase4Start = migSource.indexOf("// PHASE 4:");
    expect(phase3Start).toBeGreaterThan(0);
    expect(phase4Start).toBeGreaterThan(phase3Start);

    const phase3Section = migSource.slice(phase3Start, phase4Start);
    // Must contain the backfill UPDATE
    expect(phase3Section).toMatch(/UPDATE workout_sets/);
    expect(phase3Section).toMatch(/cached_volume_kg\s*=\s*weight\s*\*\s*reps/);
    expect(phase3Section).toMatch(/cached_e1rm_kg/);
    // Float literal — prevents integer division in SQLite
    expect(phase3Section).toMatch(/1\.0/);
  });

  it("backfill formula is correct for representative legacy rows (pure math validation)", () => {
    // These are the exact values the backfill UPDATE would produce for pre-existing rows.
    const fixtures = [
      // [weight, reps, expectedVolume, expectedE1rm]
      [100, 5, 500, 100 * (1 + 5 / 30)],
      [80, 8, 640, 80 * (1 + 8 / 30)],
      [60, 12, 720, 60 * (1 + 12 / 30)],
      [20, 20, 400, 20 * (1 + 20 / 30)],
      [0, 10, 0, 0],  // bodyweight with 0kg base
    ] as [number, number, number, number][];

    for (const [weight, reps, expectedVolume, expectedE1rm] of fixtures) {
      const { cachedVolumeKg, cachedE1rmKg } = computeSetCacheValues(
        { weight, reps },
        [], // no segments — legacy row
      );
      expect(cachedVolumeKg).toBeCloseTo(expectedVolume, 4);
      expect(cachedE1rmKg).toBeCloseTo(expectedE1rm, 4);
    }
  });

  it("backfill skips rows with NULL weight or NULL reps (guarded by WHERE clause)", () => {
    // Verify migration SQL has the WHERE guard
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs");
    const path = require("path");
    const migSource: string = fs.readFileSync(
      path.join(__dirname, "../lib/db/migrations.ts"),
      "utf-8",
    );

    const phase3Start = migSource.indexOf("// PHASE 3:");
    const phase4Start = migSource.indexOf("// PHASE 4:");
    const phase3Section = migSource.slice(phase3Start, phase4Start);

    // Must have WHERE guard against NULL weight and NULL reps
    expect(phase3Section).toMatch(/weight IS NOT NULL/);
    expect(phase3Section).toMatch(/reps IS NOT NULL/);
    // Must guard against rows already backfilled (idempotent re-run safety)
    expect(phase3Section).toMatch(/cached_volume_kg\s*=\s*0/);
  });

  it("computeSetCacheValues for null weight and null reps returns zeros (no crash)", () => {
    const { cachedVolumeKg, cachedE1rmKg, totalReps } = computeSetCacheValues(
      { weight: null, reps: null },
      [],
    );
    expect(cachedVolumeKg).toBe(0);
    expect(cachedE1rmKg).toBe(0);
    expect(totalReps).toBe(0);
  });

  it("workout_set_segments table creation is in createExtensionTables (tables.ts)", () => {
    // Verify the table DDL lives in createExtensionTables so it runs in Phase 1.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs");
    const path = require("path");
    const tablesSource: string = fs.readFileSync(
      path.join(__dirname, "../lib/db/tables.ts"),
      "utf-8",
    );

    // createExtensionTables contains the segment table
    const extTablesStart = tablesSource.indexOf("createExtensionTables");
    expect(extTablesStart).toBeGreaterThan(0);
    const extTablesSection = tablesSource.slice(extTablesStart);
    expect(extTablesSection).toMatch(/CREATE TABLE IF NOT EXISTS workout_set_segments/);
    expect(extTablesSection).toMatch(/segment_number INTEGER NOT NULL/);
    expect(extTablesSection).toMatch(/created_at INTEGER NOT NULL/);
  });
});
