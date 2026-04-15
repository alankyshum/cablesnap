import {
  parseCSVLine,
  parseStrongCSV,
  parseStrongDate,
  validateHeaders,
  convertWeight,
  shouldSkipSet,
  getSampleRows,
  getSampleSessions,
  buildImportData,
} from "../../../lib/import/strong-csv";
import type { ParsedStrongRow, StrongSession } from "../../../lib/import/strong-csv";

jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => `test-uuid-${Date.now()}-${Math.random()}`),
}));

let mockUuidCounter = 0;
jest.mock("../../../lib/uuid", () => ({
  uuid: jest.fn(() => `test-uuid-${++mockUuidCounter}`),
}));

beforeEach(() => {
  mockUuidCounter = 0;
});

// ---- CSV Line Parsing ----

describe("parseCSVLine", () => {
  it("parses simple comma-separated fields", () => {
    expect(parseCSVLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("handles quoted fields with commas", () => {
    expect(parseCSVLine('"hello, world",b,c')).toEqual([
      "hello, world",
      "b",
      "c",
    ]);
  });

  it("handles escaped quotes inside quoted fields", () => {
    expect(parseCSVLine('"say ""hello""",b')).toEqual([
      'say "hello"',
      "b",
    ]);
  });

  it("handles empty fields", () => {
    expect(parseCSVLine("a,,c")).toEqual(["a", "", "c"]);
  });

  it("handles single field", () => {
    expect(parseCSVLine("hello")).toEqual(["hello"]);
  });

  it("handles empty string", () => {
    expect(parseCSVLine("")).toEqual([""]);
  });
});

// ---- Header Validation ----

describe("validateHeaders", () => {
  it("validates a correct Strong CSV header", () => {
    const header =
      "Date,Workout Name,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE";
    const result = validateHeaders(header);
    expect(result.valid).toBe(true);
    expect(result.hasRPE).toBe(true);
  });

  it("validates header without RPE column", () => {
    const header =
      "Date,Workout Name,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes";
    const result = validateHeaders(header);
    expect(result.valid).toBe(true);
    expect(result.hasRPE).toBe(false);
  });

  it("rejects header with missing columns", () => {
    const header = "Date,Workout Name,Exercise Name";
    const result = validateHeaders(header);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing columns");
  });

  it("is case-insensitive", () => {
    const header =
      "date,workout name,exercise name,set order,weight,reps,distance,seconds,notes,workout notes";
    const result = validateHeaders(header);
    expect(result.valid).toBe(true);
  });
});

// ---- Date Parsing ----

describe("parseStrongDate", () => {
  it("parses YYYY-MM-DD HH:MM:SS format", () => {
    const ts = parseStrongDate("2024-01-15 14:30:00");
    expect(ts).not.toBeNull();
    const d = new Date(ts!);
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(0); // January
    expect(d.getDate()).toBe(15);
  });

  it("returns null for empty string", () => {
    expect(parseStrongDate("")).toBeNull();
  });

  it("returns null for invalid date", () => {
    expect(parseStrongDate("not-a-date")).toBeNull();
  });

  it("rejects dates before 1970", () => {
    expect(parseStrongDate("1969-01-01 00:00:00")).toBeNull();
  });

  it("rejects dates after 2100", () => {
    expect(parseStrongDate("2101-01-01 00:00:00")).toBeNull();
  });

  it("handles date without time component", () => {
    const ts = parseStrongDate("2024-06-15");
    expect(ts).not.toBeNull();
  });
});

// ---- Weight Conversion ----

describe("convertWeight", () => {
  it("returns null for null input", () => {
    expect(convertWeight(null, "kg", "lb")).toBeNull();
  });

  it("returns same value if units match", () => {
    expect(convertWeight(100, "kg", "kg")).toBe(100);
    expect(convertWeight(225, "lb", "lb")).toBe(225);
  });

  it("converts lbs to kg", () => {
    const result = convertWeight(225, "lb", "kg");
    expect(result).toBeCloseTo(102.06, 1);
  });

  it("converts kg to lbs", () => {
    const result = convertWeight(100, "kg", "lb");
    expect(result).toBeCloseTo(220.46, 1);
  });
});

// ---- shouldSkipSet ----

describe("shouldSkipSet", () => {
  const baseRow: ParsedStrongRow = {
    date: "2024-01-01 10:00:00",
    workoutName: "Test",
    exerciseName: "Bench Press",
    setOrder: 1,
    weight: 100,
    reps: 10,
    distance: null,
    seconds: null,
    notes: "",
    workoutNotes: "",
    rpe: null,
  };

  it("returns null for regular weight set", () => {
    expect(shouldSkipSet(baseRow)).toBeNull();
  });

  it("returns 'distance' for distance-based set", () => {
    expect(shouldSkipSet({ ...baseRow, distance: 5000 })).toBe("distance");
  });

  it("returns 'timed' for timed set with no reps", () => {
    expect(shouldSkipSet({ ...baseRow, seconds: 60, reps: 0 })).toBe("timed");
  });

  it("returns 'timed' for timed set with null reps", () => {
    expect(shouldSkipSet({ ...baseRow, seconds: 60, reps: null })).toBe(
      "timed"
    );
  });

  it("returns null for set with seconds AND reps (not pure timed)", () => {
    expect(shouldSkipSet({ ...baseRow, seconds: 30, reps: 10 })).toBeNull();
  });
});

// ---- Full CSV Parsing ----

describe("parseStrongCSV", () => {
  const validCSV = `Date,Workout Name,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
2024-01-15 14:30:00,Morning Workout,Bench Press,1,100,10,0,0,felt good,great session,8
2024-01-15 14:30:00,Morning Workout,Bench Press,2,110,8,0,0,,great session,8.5
2024-01-15 14:30:00,Morning Workout,Squat,1,140,5,0,0,,,
2024-01-16 10:00:00,Afternoon Workout,Deadlift,1,180,3,0,0,,,7`;

  it("parses valid CSV into rows", () => {
    const result = parseStrongCSV(validCSV);
    expect(result.rows).toHaveLength(4);
    expect(result.errors).toHaveLength(0);
  });

  it("groups rows into sessions", () => {
    const result = parseStrongCSV(validCSV);
    expect(result.sessions).toHaveLength(2);
    expect(result.sessions[0].workoutName).toBe("Morning Workout");
    expect(result.sessions[0].sets).toHaveLength(3);
    expect(result.sessions[1].workoutName).toBe("Afternoon Workout");
    expect(result.sessions[1].sets).toHaveLength(1);
  });

  it("extracts unique exercise names", () => {
    const result = parseStrongCSV(validCSV);
    expect(result.exerciseNames).toEqual([
      "Bench Press",
      "Deadlift",
      "Squat",
    ]);
  });

  it("parses RPE values", () => {
    const result = parseStrongCSV(validCSV);
    expect(result.rows[0].rpe).toBe(8);
    expect(result.rows[1].rpe).toBe(8.5);
    expect(result.rows[2].rpe).toBeNull();
    expect(result.rows[3].rpe).toBe(7);
  });

  it("parses notes", () => {
    const result = parseStrongCSV(validCSV);
    expect(result.rows[0].notes).toBe("felt good");
    expect(result.rows[0].workoutNotes).toBe("great session");
  });

  it("treats weight of 0 as null (bodyweight)", () => {
    const csv = `Date,Workout Name,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes
2024-01-15 14:30:00,Workout,Push-up,1,0,20,0,0,,`;
    const result = parseStrongCSV(csv);
    expect(result.rows[0].weight).toBeNull();
  });

  it("handles CSV with BOM", () => {
    const bomCSV = "\uFEFF" + validCSV;
    const result = parseStrongCSV(bomCSV);
    expect(result.rows).toHaveLength(4);
    expect(result.errors).toHaveLength(0);
  });

  it("returns error for empty CSV", () => {
    const result = parseStrongCSV("");
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toContain("Empty file");
  });

  it("returns error for malformed CSV headers", () => {
    const csv = "Column1,Column2\nval1,val2";
    const result = parseStrongCSV(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.errors[0].reason).toContain("Missing columns");
  });

  it("skips rows with invalid dates", () => {
    const csv = `Date,Workout Name,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes
bad-date,Workout,Bench Press,1,100,10,0,0,,`;
    const result = parseStrongCSV(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toContain("Invalid date");
  });

  it("skips rows with negative weight", () => {
    const csv = `Date,Workout Name,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes
2024-01-15 10:00:00,Workout,Bench Press,1,-100,10,0,0,,`;
    const result = parseStrongCSV(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toContain("Invalid weight");
  });

  it("skips rows with negative reps", () => {
    const csv = `Date,Workout Name,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes
2024-01-15 10:00:00,Workout,Bench Press,1,100,-5,0,0,,`;
    const result = parseStrongCSV(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toContain("Invalid reps");
  });

  it("handles empty weight as null (bodyweight)", () => {
    const csv = `Date,Workout Name,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes
2024-01-15 10:00:00,Workout,Pull-up,1,,12,0,0,,`;
    const result = parseStrongCSV(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].weight).toBeNull();
  });

  it("handles Windows-style line endings", () => {
    const csv =
      "Date,Workout Name,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes\r\n2024-01-15 10:00:00,Workout,Bench Press,1,100,10,0,0,,\r\n";
    const result = parseStrongCSV(csv);
    expect(result.rows).toHaveLength(1);
  });

  it("handles CSV without RPE column", () => {
    const csv = `Date,Workout Name,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes
2024-01-15 10:00:00,Workout,Bench Press,1,100,10,0,0,,`;
    const result = parseStrongCSV(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].rpe).toBeNull();
  });

  it("sorts sessions chronologically", () => {
    const csv = `Date,Workout Name,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes
2024-02-15 10:00:00,Workout B,Bench Press,1,100,10,0,0,,
2024-01-15 10:00:00,Workout A,Squat,1,140,5,0,0,,`;
    const result = parseStrongCSV(csv);
    expect(result.sessions[0].workoutName).toBe("Workout A");
    expect(result.sessions[1].workoutName).toBe("Workout B");
  });

  it("rejects RPE outside 1-10 range", () => {
    const csv = `Date,Workout Name,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
2024-01-15 10:00:00,Workout,Bench Press,1,100,10,0,0,,,15`;
    const result = parseStrongCSV(csv);
    expect(result.rows[0].rpe).toBeNull();
  });
});

// ---- getSampleRows / getSampleSessions ----

describe("getSampleRows", () => {
  it("returns first N rows", () => {
    const rows: ParsedStrongRow[] = [
      { date: "2024-01-01", workoutName: "A", exerciseName: "Bench", setOrder: 1, weight: 100, reps: 10, distance: null, seconds: null, notes: "", workoutNotes: "", rpe: null },
      { date: "2024-01-01", workoutName: "A", exerciseName: "Squat", setOrder: 1, weight: 140, reps: 5, distance: null, seconds: null, notes: "", workoutNotes: "", rpe: null },
    ];
    expect(getSampleRows(rows, 1)).toHaveLength(1);
    expect(getSampleRows(rows, 3)).toHaveLength(2);
  });
});

describe("getSampleSessions", () => {
  it("returns first N session summaries", () => {
    const sessions: StrongSession[] = [
      { key: "k1", date: "2024-01-01", workoutName: "A", workoutNotes: "", sets: [{} as ParsedStrongRow, {} as ParsedStrongRow] },
      { key: "k2", date: "2024-01-02", workoutName: "B", workoutNotes: "", sets: [{} as ParsedStrongRow] },
    ];
    const samples = getSampleSessions(sessions, 1);
    expect(samples).toHaveLength(1);
    expect(samples[0].name).toBe("A");
    expect(samples[0].setCount).toBe(2);
  });
});

// ---- buildImportData ----

describe("buildImportData", () => {
  const sessions: StrongSession[] = [
    {
      key: "2024-01-15||Workout",
      date: "2024-01-15 10:00:00",
      workoutName: "Morning Workout",
      workoutNotes: "Good session",
      sets: [
        {
          date: "2024-01-15 10:00:00",
          workoutName: "Morning Workout",
          exerciseName: "Bench Press",
          setOrder: 1,
          weight: 100,
          reps: 10,
          distance: null,
          seconds: null,
          notes: "heavy",
          workoutNotes: "Good session",
          rpe: 8,
        },
        {
          date: "2024-01-15 10:00:00",
          workoutName: "Morning Workout",
          exerciseName: "Bench Press",
          setOrder: 2,
          weight: 100,
          reps: 8,
          distance: null,
          seconds: null,
          notes: "",
          workoutNotes: "Good session",
          rpe: null,
        },
        // Timed set - should be skipped
        {
          date: "2024-01-15 10:00:00",
          workoutName: "Morning Workout",
          exerciseName: "Plank",
          setOrder: 1,
          weight: null,
          reps: null,
          distance: null,
          seconds: 60,
          notes: "",
          workoutNotes: "Good session",
          rpe: null,
        },
      ],
    },
  ];

  const exerciseMap = new Map([["Bench Press", "ex-1"], ["Plank", "ex-2"]]);

  it("builds sessions and sets correctly", () => {
    const result = buildImportData(sessions, exerciseMap, "kg", "kg");
    expect(result.dbSessions).toHaveLength(1);
    expect(result.dbSets).toHaveLength(2);
    expect(result.skippedTimed).toBe(1);
    expect(result.skippedDistance).toBe(0);
  });

  it("maps session fields correctly", () => {
    const result = buildImportData(sessions, exerciseMap, "kg", "kg");
    const session = result.dbSessions[0];
    expect(session.name).toBe("Morning Workout");
    expect(session.notes).toBe("Good session");
    expect(session.template_id).toBeNull();
    expect(session.duration_seconds).toBeNull();
    expect(session.started_at).toBe(session.completed_at);
  });

  it("maps set fields correctly", () => {
    const result = buildImportData(sessions, exerciseMap, "kg", "kg");
    const set = result.dbSets[0];
    expect(set.exercise_id).toBe("ex-1");
    expect(set.weight).toBe(100);
    expect(set.reps).toBe(10);
    expect(set.completed).toBe(1);
    expect(set.rpe).toBe(8);
    expect(set.notes).toBe("heavy");
    expect(set.training_mode).toBeNull();
    expect(set.link_id).toBeNull();
    expect(set.round).toBeNull();
    expect(set.tempo).toBeNull();
  });

  it("converts weights between units", () => {
    const result = buildImportData(sessions, exerciseMap, "lb", "kg");
    const set = result.dbSets[0];
    expect(set.weight).toBeCloseTo(45.36, 1);
  });

  it("skips sets for exercises not in map", () => {
    const smallMap = new Map([["Bench Press", "ex-1"]]);
    const result = buildImportData(sessions, smallMap, "kg", "kg");
    // Plank would normally have 1 set, but it's timed + skipped, so 0
    // Only bench press sets are included
    expect(result.dbSets).toHaveLength(2);
  });
});
