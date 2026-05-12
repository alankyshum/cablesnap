/**
 * BLD-1169 — Slice 3: normalizeSetType unit tests (AC #269)
 *
 * Verifies that:
 * 1. All 7 valid SetType strings pass through unchanged.
 * 2. Garbage inputs (unknown string, null, undefined, "", non-string)
 *    are coerced to "normal" without throwing.
 * 3. The raw DB row object is NOT mutated by the helper.
 */
import { normalizeSetType } from "@/lib/db/sets";

const VALID_TYPES = [
  "normal",
  "warmup",
  "dropset",
  "failure",
  "rest_pause",
  "cluster",
  "myo_reps",
] as const;

describe("normalizeSetType — valid values", () => {
  for (const st of VALID_TYPES) {
    it(`passes "${st}" through unchanged`, () => {
      expect(normalizeSetType(st)).toBe(st);
    });
  }
});

describe("normalizeSetType — coercion to 'normal'", () => {
  const garbageInputs: unknown[] = [
    "drop_set_v2",     // typo / legacy string
    "REST_PAUSE",      // wrong case
    "WARMUP",          // wrong case
    "",                // empty string
    null,
    undefined,
    0,
    false,
    {},
    [],
    "unknown",
    "myo reps",        // space instead of underscore
  ];

  for (const input of garbageInputs) {
    it(`coerces ${JSON.stringify(input)} to "normal" without throwing`, () => {
      expect(() => normalizeSetType(input)).not.toThrow();
      expect(normalizeSetType(input)).toBe("normal");
    });
  }
});

describe("normalizeSetType — raw DB row not mutated", () => {
  it("does not modify the source row object", () => {
    const row = { id: "abc", set_type: "drop_set_v2", reps: 10 };
    const rowCopy = { ...row };
    normalizeSetType(row.set_type);
    expect(row).toEqual(rowCopy);
    expect(row.set_type).toBe("drop_set_v2");
  });

  it("does not modify row when value is valid", () => {
    const row = { id: "abc", set_type: "dropset", reps: 5 };
    const before = row.set_type;
    normalizeSetType(row.set_type);
    expect(row.set_type).toBe(before);
  });
});

describe("normalizeSetType — boundary integration snapshots", () => {
  it("session-sets.ts hydration: getSessionSets style cast", () => {
    // Simulates: set_type: normalizeSetType(r.set_type)
    const dbRow = { set_type: "rest_pause" as unknown };
    expect(normalizeSetType(dbRow.set_type)).toBe("rest_pause");
  });

  it("session-sets.ts hydration: unknown value from older DB", () => {
    const dbRow = { set_type: "superset" as unknown };
    expect(normalizeSetType(dbRow.set_type)).toBe("normal");
  });

  it("sessions.ts template parser: null set_type", () => {
    // Simulates: group.map((s) => normalizeSetType(s.set_type))
    expect(normalizeSetType(null)).toBe("normal");
  });

  it("import-export.ts restore path: old backup with unknown type", () => {
    // Simulates: normalizeSetType(row.set_type ?? (row.is_warmup ? "warmup" : "normal"))
    const row = { set_type: null as unknown, is_warmup: 0 };
    const rawType = row.set_type ?? (row.is_warmup ? "warmup" : "normal");
    expect(normalizeSetType(rawType)).toBe("normal");
  });

  it("import-export.ts restore path: is_warmup legacy backup", () => {
    const row = { set_type: null as unknown, is_warmup: 1 };
    const rawType = row.set_type ?? (row.is_warmup ? "warmup" : "normal");
    expect(normalizeSetType(rawType)).toBe("warmup");
  });

  it("csv-import.ts: set_type from parsed CSV row", () => {
    // Simulates: normalizeSetType(set.set_type ?? "normal")
    expect(normalizeSetType(undefined)).toBe("normal");
    expect(normalizeSetType("myo_reps")).toBe("myo_reps");
    expect(normalizeSetType("unknown_future_type")).toBe("normal");
  });

  it("ExerciseGroupRow.tsx: SET_TYPE_LABELS lookup safety", () => {
    // normalizeSetType guarantees SET_TYPE_LABELS[st] never throws (key is always valid)
    const unknownDbValue = "drop_set_v2";
    const st = normalizeSetType(unknownDbValue);
    expect(st).toBe("normal");
  });
});
