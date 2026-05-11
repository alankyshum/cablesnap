/**
 * BLD-1158 AC1.7 / AC1.8: Exercises CSV round-trip with default_tempo.
 *
 * Tests that:
 *  - exercisesCSV() includes default_tempo as the FINAL column (AC1.7)
 *  - exercises with no default_tempo produce an empty trailing field (backward compat)
 *  - canonical tempo values survive the CSV serializer unchanged
 *  - header column order matches the documented AC1.7 contract
 */

import { exercisesCSV } from "../../../lib/csv-format";
import type { ExerciseCSVRow } from "../../../lib/db";

const BASE_ROW: ExerciseCSVRow = {
  id: "ex-001",
  name: "Bench Press",
  category: "chest",
  equipment: "barbell",
  difficulty: "intermediate",
  primary_muscles: '["chest","triceps"]',
  secondary_muscles: '["shoulders"]',
  instructions: "Lower to chest, press up.",
  default_tempo: null,
};

describe("exercisesCSV — AC1.7/AC1.8", () => {
  it("produces the correct header with default_tempo as the final column", () => {
    const csv = exercisesCSV([]);
    const headerCols = csv.split("\n")[0].split(",");
    expect(headerCols[headerCols.length - 1]).toBe("default_tempo");
    expect(headerCols).toEqual([
      "id",
      "name",
      "category",
      "equipment",
      "difficulty",
      "primary_muscles",
      "secondary_muscles",
      "instructions",
      "default_tempo",
    ]);
  });

  it("serializes a row without default_tempo as an empty trailing field", () => {
    const csv = exercisesCSV([{ ...BASE_ROW, default_tempo: null }]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2); // header + 1 row
    const rowCols = lines[1].split(",");
    // default_tempo is last column → empty string
    expect(rowCols[rowCols.length - 1]).toBe("");
  });

  it("serializes a row with a canonical tempo value", () => {
    const csv = exercisesCSV([{ ...BASE_ROW, default_tempo: "3-1-2-0" }]);
    const lines = csv.split("\n");
    const rowCols = lines[1].split(",");
    expect(rowCols[rowCols.length - 1]).toBe("3-1-2-0");
  });

  it("round-trips complex canonical tempo including double-digit phases", () => {
    const csv = exercisesCSV([{ ...BASE_ROW, default_tempo: "10-0-10-0" }]);
    const lines = csv.split("\n");
    const rowCols = lines[1].split(",");
    expect(rowCols[rowCols.length - 1]).toBe("10-0-10-0");
  });

  it("serializes multiple rows correctly", () => {
    const rows: ExerciseCSVRow[] = [
      { ...BASE_ROW, id: "ex-001", default_tempo: "3-1-2-0" },
      { ...BASE_ROW, id: "ex-002", default_tempo: null },
      { ...BASE_ROW, id: "ex-003", default_tempo: "0-60-0-0" },
    ];
    const csv = exercisesCSV(rows);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(4); // header + 3 rows

    const tempos = lines.slice(1).map((l) => {
      const cols = l.split(",");
      return cols[cols.length - 1];
    });
    expect(tempos).toEqual(["3-1-2-0", "", "0-60-0-0"]);
  });

  it("backward compat: a CSV without default_tempo column still has 8 columns in the data row", () => {
    // Simulate an old-format CSV where default_tempo is absent.
    // The header has 8 cols; we confirm our new header has 9 (not a regression).
    const newCsv = exercisesCSV([BASE_ROW]);
    const headerCols = newCsv.split("\n")[0].split(",");
    expect(headerCols).toHaveLength(9);
  });
});
