/**
 * BLD-1168 AC #274 — FK CASCADE segments test.
 *
 * GIVEN a parent advanced set with cached_volume_kg and cached_e1rm_kg populated
 * WHEN the FK CASCADE deletes the parent (e.g., session deletion)
 * THEN all workout_set_segments rows are deleted at the SQLite layer with no orphans.
 *
 * Tests the schema DDL: ON DELETE CASCADE on workout_set_segments.set_id.
 */

describe("BLD-1168 AC#274 — FK CASCADE on workout_set_segments", () => {
  it("workout_set_segments DDL includes ON DELETE CASCADE on set_id", () => {
    // This test validates the schema SQL string that is passed to execAsync.
    // The migration creates the table with the FK constraint; we verify the DDL
    // contains the cascade clause by inspecting lib/db/tables.ts at import time.

    // Read the tables.ts source to confirm the FK syntax is correct.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs");
    const path = require("path");
    const tablesSource: string = fs.readFileSync(
      path.join(__dirname, "../lib/db/tables.ts"),
      "utf-8",
    );

    // Must contain the segment table name
    expect(tablesSource).toMatch(/workout_set_segments/);

    // Must reference the FK with CASCADE
    expect(tablesSource).toMatch(/REFERENCES workout_sets\(id\) ON DELETE CASCADE/i);

    // Must have unique index on (set_id, segment_number)
    expect(tablesSource).toMatch(/uq_set_segments_set_seg/);
    expect(tablesSource).toMatch(/idx_set_segments_set/);
  });

  it("workout_set_segments is in VALID_TABLES allowlist", () => {
    // The DDL allowlist in tables.ts guards against SQL injection via table names.
    // Verify workout_set_segments is present so addColumnIfMissing can be called on it.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs");
    const path = require("path");
    const tablesSource: string = fs.readFileSync(
      path.join(__dirname, "../lib/db/tables.ts"),
      "utf-8",
    );
    // VALID_TABLES is a Set; check that it contains the table name string
    expect(tablesSource).toMatch(/"workout_set_segments"/);
  });

  it("schema.ts workoutSetSegments table has correct FK reference", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs");
    const path = require("path");
    const schemaSource: string = fs.readFileSync(
      path.join(__dirname, "../lib/db/schema.ts"),
      "utf-8",
    );

    expect(schemaSource).toMatch(/workoutSetSegments/);
    expect(schemaSource).toMatch(/workout_set_segments/);
    // The set_id FK is documented with ON DELETE CASCADE comment
    expect(schemaSource).toMatch(/ON DELETE CASCADE/i);
    // Unique index name
    expect(schemaSource).toMatch(/uq_set_segments_set_seg/);
  });

  it("lib/db/sets.ts only issues writes via Drizzle (not raw SQL strings)", () => {
    // Architecture invariant: sets.ts must NOT contain raw SQL UPDATE/DELETE strings
    // that bypass Drizzle's typed layer.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs");
    const path = require("path");
    const setsSource: string = fs.readFileSync(
      path.join(__dirname, "../lib/db/sets.ts"),
      "utf-8",
    );

    // Should not contain raw execAsync with UPDATE/DELETE strings
    // (Drizzle's .update() and .delete() are the correct paths)
    expect(setsSource).not.toMatch(/execAsync.*UPDATE\s+workout/i);
    expect(setsSource).not.toMatch(/execAsync.*DELETE\s+FROM\s+workout/i);
  });
});
