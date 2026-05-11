/**
 * BLD-1176 / AC #257: CSV round-trip test for advanced set types.
 *
 * Verifies that exporting a session with advanced sets (rest_pause, cluster,
 * myo_reps) and re-importing the CSV produces a state equal to the original.
 *
 * The cluster fixture exercises segment-level weight override (95 kg on one
 * segment while parent weight is 100 kg), as required by §Acceptance Criteria.
 */

import { workoutCSV } from "../lib/csv-format";
import { parseCsvExport } from "../lib/csv-import";
import type { WorkoutCSVRow } from "../lib/db/csv";
import type { CsvParseResult } from "../lib/csv-import";

// ---- Fixtures ----

const BASE_ROW: Omit<WorkoutCSVRow, "set_type" | "mini_set_reps" | "mini_set_weights" | "mini_set_rests"> = {
  date: "2026-01-15",
  exercise: "Cable Row",
  set_number: 1,
  weight: 100,
  reps: 13,
  duration_seconds: null,
  notes: "Test session",
  set_rpe: 8,
  set_notes: "",
  link_id: null,
  tempo: null,
  bodyweight_modifier_kg: null,
  pulley_pin: null,
  kind: "workout",
  day_session_exercise_id: null,
  day_session_date: null,
  stack_marker: null,
  stack_name_at_log: null,
};

/** rest_pause: 8 + 3 + 2 reps @ 100 kg */
const REST_PAUSE_ROW: WorkoutCSVRow = {
  ...BASE_ROW,
  exercise: "Cable Row",
  set_number: 1,
  weight: 100,
  reps: 13,
  set_type: "rest_pause",
  mini_set_reps: "8;3;2",
  mini_set_weights: ";;",   // all inherit parent 100 kg
  mini_set_rests: "15;15;",
};

/** cluster: 5 + 5 + 4 reps; last segment has weight override 95 kg */
const CLUSTER_ROW: WorkoutCSVRow = {
  ...BASE_ROW,
  exercise: "Leg Press",
  set_number: 2,
  weight: 100,
  reps: 14,
  set_type: "cluster",
  mini_set_reps: "5;5;4",
  mini_set_weights: ";;95",  // third segment overrides to 95 kg
  mini_set_rests: "45;45;",
};

/** myo_reps: activation 15 + clusters 5,5,4,3 */
const MYO_REPS_ROW: WorkoutCSVRow = {
  ...BASE_ROW,
  exercise: "Tricep Pushdown",
  set_number: 3,
  weight: 50,
  reps: 32,
  set_type: "myo_reps",
  mini_set_reps: "15;5;5;4;3",
  mini_set_weights: ";;;;",
  mini_set_rests: ";5;5;5;",
};

/** Normal set — must remain unchanged after round-trip (back-compat). */
const NORMAL_ROW: WorkoutCSVRow = {
  ...BASE_ROW,
  exercise: "Bench Press",
  set_number: 4,
  weight: 80,
  reps: 8,
  set_type: "normal",
  mini_set_reps: null,
  mini_set_weights: null,
  mini_set_rests: null,
};

// ---- Helpers ----

function parseRow(row: WorkoutCSVRow) {
  const csv = workoutCSV([row]);
  const result = parseCsvExport(csv);
  if ("type" in result) throw new Error(`parseCsvExport failed: ${result.type} — ${result.message}`);
  return (result as CsvParseResult).sessions[0]?.sets[0];
}

// ---- Tests ----

describe("CSV round-trip — advanced set types (BLD-1176 AC #257)", () => {
  describe("rest_pause set", () => {
    let parsed: ReturnType<typeof parseRow>;
    beforeAll(() => { parsed = parseRow(REST_PAUSE_ROW); });

    it("round-trips set_type", () => {
      expect(parsed?.set_type).toBe("rest_pause");
    });

    it("round-trips mini_set_reps", () => {
      expect(parsed?.mini_set_reps).toBe("8;3;2");
    });

    it("round-trips mini_set_weights (empty-inherited)", () => {
      expect(parsed?.mini_set_weights).toBe(";;");
    });

    it("round-trips mini_set_rests", () => {
      expect(parsed?.mini_set_rests).toBe("15;15;");
    });
  });

  describe("cluster set with segment-level weight override", () => {
    let parsed: ReturnType<typeof parseRow>;
    beforeAll(() => { parsed = parseRow(CLUSTER_ROW); });

    it("round-trips set_type", () => {
      expect(parsed?.set_type).toBe("cluster");
    });

    it("round-trips mini_set_reps", () => {
      expect(parsed?.mini_set_reps).toBe("5;5;4");
    });

    it("preserves 95 kg segment-level weight override in third segment", () => {
      expect(parsed?.mini_set_weights).toBe(";;95");
    });
  });

  describe("myo_reps set", () => {
    let parsed: ReturnType<typeof parseRow>;
    beforeAll(() => { parsed = parseRow(MYO_REPS_ROW); });

    it("round-trips set_type", () => {
      expect(parsed?.set_type).toBe("myo_reps");
    });

    it("round-trips activation + 4 clusters", () => {
      expect(parsed?.mini_set_reps).toBe("15;5;5;4;3");
    });
  });

  describe("normal set — back-compat", () => {
    let parsed: ReturnType<typeof parseRow>;
    beforeAll(() => { parsed = parseRow(NORMAL_ROW); });

    it("round-trips as normal set_type", () => {
      expect(parsed?.set_type).toBe("normal");
    });

    it("has no mini_set data", () => {
      expect(parsed?.mini_set_reps).toBeFalsy();
      expect(parsed?.mini_set_weights).toBeFalsy();
      expect(parsed?.mini_set_rests).toBeFalsy();
    });
  });

  describe("segment clamping at import (AC #257 — max 8 segments)", () => {
    it("clamps 10-segment mini_set_reps to 8 on import", () => {
      const row: WorkoutCSVRow = {
        ...REST_PAUSE_ROW,
        set_number: 99,
        mini_set_reps: "1;2;3;4;5;6;7;8;9;10",
        mini_set_weights: ";;;;;;;;;;",
        mini_set_rests: ";;;;;;;;;;",
      };
      const csv = workoutCSV([row]);
      const result = parseCsvExport(csv) as CsvParseResult;
      const parsed = result.sessions[0]?.sets[0];
      const segmentCount = parsed?.mini_set_reps?.split(";").length ?? 0;
      expect(segmentCount).toBeLessThanOrEqual(8);
    });
  });

  describe("unknown set_type coercion at import (AC #260)", () => {
    it("coerces unknown set_type to normal", () => {
      // Build CSV manually with an unknown set_type
      const header = "date,exercise,set_number,weight,reps,duration_seconds,notes,set_rpe,set_notes,link_id,bodyweight_modifier_kg,pulley_pin,kind,day_session_exercise_id,day_session_date,stack_marker,stack_name_at_log,set_type,mini_set_reps,mini_set_weights,mini_set_rests";
      const dataRow = "2026-01-15,Cable Row,1,100,8,,,,,,,,,,,,,drop_set_v2,,,";
      const csv = `${header}\n${dataRow}`;
      const result = parseCsvExport(csv) as CsvParseResult;
      const parsed = result.sessions[0]?.sets[0];
      // normalizeSetType is called at the parser boundary (lib/csv-import.ts → buildSession).
      // Unknown values like "drop_set_v2" must be coerced to "normal" before reaching DB.
      expect(parsed?.set_type).toBe("normal");
    });
  });
});
