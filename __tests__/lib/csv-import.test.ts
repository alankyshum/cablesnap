import { parseCsvExport, convertWeights, type CsvParseResult } from "../../lib/csv-import";
import { detectFormat } from "../../lib/csv-import-formats";

// ---- Format Detection ----

describe("detectFormat", () => {
  it("detects Strong CSV by required headers", () => {
    const f = detectFormat(["Date", "Workout Name", "Exercise Name", "Set Order", "Weight", "Reps"]);
    expect(f?.name).toBe("strong");
  });

  it("detects Hevy CSV by required headers", () => {
    const f = detectFormat(["exercise_title", "set_index", "weight_kg", "reps", "start_time"]);
    expect(f?.name).toBe("hevy");
  });

  it("detects FitNotes CSV by required headers", () => {
    const f = detectFormat(["Exercise", "Weight (kgs)", "Reps", "Date"]);
    expect(f?.name).toBe("fitnotes");
  });

  it("detects FitNotes CSV with lbs column", () => {
    const f = detectFormat(["Exercise", "Weight (lbs)", "Reps", "Date"]);
    expect(f?.name).toBe("fitnotes");
  });

  it("returns null for unknown headers", () => {
    const f = detectFormat(["foo", "bar", "baz"]);
    expect(f).toBeNull();
  });

  it("is case-insensitive on header matching", () => {
    const f = detectFormat(["date", "exercise name", "set order", "weight", "reps"]);
    expect(f?.name).toBe("strong");
  });

  it("ignores extra columns (subset match)", () => {
    const f = detectFormat(["Date", "Exercise Name", "Set Order", "Weight", "Reps", "Distance", "Extra Column"]);
    expect(f?.name).toBe("strong");
  });
});

// ---- CSV Parsing ----

describe("parseCsvExport", () => {
  it("returns empty_file error for blank input", () => {
    const result = parseCsvExport("");
    expect("type" in result && result.type).toBe("empty_file");
  });

  it("returns no_data error for headers-only CSV", () => {
    const result = parseCsvExport("Date,Exercise Name,Set Order,Weight,Reps\n");
    expect("type" in result && result.type).toBe("no_data");
  });

  it("returns unrecognized_format for unknown CSV", () => {
    const result = parseCsvExport("Col1,Col2,Col3\nval1,val2,val3\n");
    expect("type" in result && result.type).toBe("unrecognized_format");
  });

  // BLD-1169 AC #269: CSV import is a mandatory read boundary — any
  // garbage / nullish set_type from a hand-edited or older CableSnap CSV
  // must coerce to "normal" rather than leak a raw string downstream.
  describe("CableSnap set_type read-boundary normalization", () => {
    const HEADER =
      "date,exercise,set_number,weight,reps,duration_seconds,notes,set_rpe,set_notes,link_id,bodyweight_modifier_kg,pulley_pin,kind,day_session_exercise_id,day_session_date,stack_marker,stack_name_at_log,set_type";
    const baseRow = (setType: string) =>
      `2025-01-15,Bench,1,100,5,,,8,,,,,workout,,,,,${setType}`;

    function firstSetTypeFromCablesnapCsv(csv: string): string {
      const result = parseCsvExport(csv);
      if ("type" in result) throw new Error(`parse failed: ${result.type}`);
      const set = result.sessions[0]?.sets[0];
      if (!set) throw new Error("no set parsed");
      return set.set_type;
    }

    it.each([
      ["valid normal", "normal", "normal"],
      ["valid warmup", "warmup", "warmup"],
      ["advanced rest_pause survives", "rest_pause", "rest_pause"],
      ["advanced cluster survives", "cluster", "cluster"],
      ["advanced myo_reps survives", "myo_reps", "myo_reps"],
      ["wrong-case WARMUP coerces to normal", "WARMUP", "normal"],
      ["legacy drop_set_v2 typo coerces to normal", "drop_set_v2", "normal"],
      ["unknown future_type coerces to normal", "future_type", "normal"],
      ["empty string coerces to normal", "", "normal"],
    ])("set_type %s → %s", (_label, raw, expected) => {
      const csv = `${HEADER}\n${baseRow(raw)}\n`;
      expect(firstSetTypeFromCablesnapCsv(csv)).toBe(expected);
    });

    it("missing set_type column entirely coerces to normal", () => {
      const headerWithoutSetType =
        "date,exercise,set_number,weight,reps,duration_seconds,notes,set_rpe,set_notes,link_id,bodyweight_modifier_kg,pulley_pin,kind,day_session_exercise_id,day_session_date,stack_marker,stack_name_at_log";
      const row = "2025-01-15,Bench,1,100,5,,,8,,,,,workout,,,,";
      expect(firstSetTypeFromCablesnapCsv(`${headerWithoutSetType}\n${row}\n`)).toBe("normal");
    });
  });

  describe("Strong format", () => {
    const strongCsv = [
      "Date,Workout Name,Exercise Name,Set Order,Weight,Reps,RPE,Duration,Notes",
      "2024-01-15 08:30:00,Morning Push,Bench Press,1,80,10,8,,",
      "2024-01-15 08:30:00,Morning Push,Bench Press,2,85,8,9,,Heavy set",
      "2024-01-15 08:30:00,Morning Push,Overhead Press,1,40,12,,,",
      "2024-01-17 09:00:00,Pull Day,Barbell Row,1,60,10,,,",
    ].join("\n");

    it("parses Strong CSV into sessions grouped by date+name", () => {
      const result = parseCsvExport(strongCsv) as CsvParseResult;
      expect(result.format).toBe("strong");
      expect(result.sessions).toHaveLength(2);
      expect(result.sessions[0].name).toBe("Morning Push");
      expect(result.sessions[0].sets).toHaveLength(3);
      expect(result.sessions[1].name).toBe("Pull Day");
      expect(result.sessions[1].sets).toHaveLength(1);
    });

    it("preserves set data from Strong CSV", () => {
      const result = parseCsvExport(strongCsv) as CsvParseResult;
      const set = result.sessions[0].sets[0];
      expect(set.exerciseRawName).toBe("Bench Press");
      expect(set.weight).toBe(80);
      expect(set.reps).toBe(10);
      expect(set.rpe).toBe(8);
      expect(set.setNumber).toBe(1);
    });

    it("returns null detectedUnit for Strong (requires user prompt)", () => {
      const result = parseCsvExport(strongCsv) as CsvParseResult;
      expect(result.detectedUnit).toBeNull();
    });

    it("collects unique exercise names", () => {
      const result = parseCsvExport(strongCsv) as CsvParseResult;
      expect(result.uniqueExercises).toEqual(
        expect.arrayContaining(["Bench Press", "Overhead Press", "Barbell Row"])
      );
      expect(result.uniqueExercises).toHaveLength(3);
    });
  });

  describe("Hevy format", () => {
    const hevyCsv = [
      "title,start_time,exercise_title,set_index,weight_kg,reps,rpe,duration_seconds",
      "Leg Day,2024-02-01 10:00:00,Squat,1,100,5,8,",
      "Leg Day,2024-02-01 10:00:00,Squat,2,110,5,9,",
      "Leg Day,2024-02-01 10:00:00,Leg Press,1,200,10,,",
    ].join("\n");

    it("parses Hevy CSV with kg unit auto-detected", () => {
      const result = parseCsvExport(hevyCsv) as CsvParseResult;
      expect(result.format).toBe("hevy");
      expect(result.detectedUnit).toBe("kg");
      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0].sets).toHaveLength(3);
    });
  });

  describe("FitNotes format", () => {
    const fitNotesCsv = [
      "Date,Exercise,Weight (kgs),Reps,Set Order",
      "2024-03-01,Deadlift,140,5,1",
      "2024-03-01,Deadlift,150,3,2",
    ].join("\n");

    it("parses FitNotes CSV with kg detected from header", () => {
      const result = parseCsvExport(fitNotesCsv) as CsvParseResult;
      expect(result.format).toBe("fitnotes");
      expect(result.detectedUnit).toBe("kg");
      expect(result.sessions).toHaveLength(1);
    });

    it("detects lbs from FitNotes header", () => {
      const csv = "Date,Exercise,Weight (lbs),Reps\n2024-03-01,Curl,30,12\n";
      const result = parseCsvExport(csv) as CsvParseResult;
      expect(result.detectedUnit).toBe("lbs");
    });
  });

  it("handles empty exercise names by skipping the row", () => {
    const csv = "Date,Exercise Name,Set Order,Weight,Reps\n2024-01-01,,1,50,10\n";
    const result = parseCsvExport(csv) as CsvParseResult;
    expect(result.skippedRows).toBe(1);
    expect(result.sessions).toHaveLength(0);
  });

  it("sorts sessions chronologically", () => {
    const csv = [
      "Date,Exercise Name,Set Order,Weight,Reps",
      "2024-03-01,Push-ups,1,0,20",
      "2024-01-01,Squats,1,100,10",
      "2024-02-01,Pull-ups,1,0,10",
    ].join("\n");
    const result = parseCsvExport(csv) as CsvParseResult;
    expect(result.sessions[0].sets[0].exerciseRawName).toBe("Squats");
    expect(result.sessions[2].sets[0].exerciseRawName).toBe("Push-ups");
  });
});

// ---- Weight Conversion ----

describe("convertWeights", () => {
  it("converts lbs to kg", () => {
    const sessions = [
      { date: 0, name: "Test", durationSeconds: null, sets: [
        { exerciseRawName: "Bench", matchedExerciseId: null, matchConfidence: null as "high" | "medium" | "low" | null, weight: 225, reps: 5, setNumber: 1, rpe: null, durationSeconds: null, notes: "", set_type: "normal" as const },
      ] },
    ];
    const converted = convertWeights(sessions, "lbs");
    // 225 lbs ≈ 102.06 kg
    expect(converted[0].sets[0].weight).toBeCloseTo(102.06, 1);
  });

  it("preserves kg weights unchanged", () => {
    const sessions = [
      { date: 0, name: "Test", durationSeconds: null, sets: [
        { exerciseRawName: "Bench", matchedExerciseId: null, matchConfidence: null as "high" | "medium" | "low" | null, weight: 100, reps: 5, setNumber: 1, rpe: null, durationSeconds: null, notes: "", set_type: "normal" as const },
      ] },
    ];
    const converted = convertWeights(sessions, "kg");
    expect(converted[0].sets[0].weight).toBe(100);
  });

  it("handles null weights", () => {
    const sessions = [
      { date: 0, name: "Test", durationSeconds: null, sets: [
        { exerciseRawName: "Push-ups", matchedExerciseId: null, matchConfidence: null as "high" | "medium" | "low" | null, weight: null, reps: 20, setNumber: 1, rpe: null, durationSeconds: null, notes: "", set_type: "normal" as const },
      ] },
    ];
    const converted = convertWeights(sessions, "lbs");
    expect(converted[0].sets[0].weight).toBeNull();
  });
});
