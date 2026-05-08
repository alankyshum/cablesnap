/**
 * AC7 regression tests for BLD-1100: user_rest_seconds sanitization in importData.
 *
 * This file focuses on the clamp/drop logic applied to exercises.user_rest_seconds
 * during backup import. It supplements the general import-export tests.
 */

const mockRunAsync = jest.fn().mockResolvedValue({ changes: 1 });
const mockGetAllAsync = jest.fn().mockResolvedValue([]);
const mockGetFirstAsync = jest.fn().mockResolvedValue({ cnt: 0 });

const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  getAllAsync: (...args: unknown[]) => mockGetAllAsync(...args),
  getFirstAsync: (...args: unknown[]) => mockGetFirstAsync(...args),
  runAsync: (...args: unknown[]) => mockRunAsync(...args),
  prepareAsync: jest.fn().mockResolvedValue({
    executeAsync: jest.fn().mockResolvedValue(undefined),
    finalizeAsync: jest.fn().mockResolvedValue(undefined),
  }),
  withTransactionAsync: jest.fn(async (cb: () => Promise<void>) => cb()),
};

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
}));

// EXERCISES_COLUMNS now includes user_rest_seconds (BLD-1100 migration)
const EXERCISES_COLUMNS = [
  { name: "id" }, { name: "name" }, { name: "category" }, { name: "primary_muscles" },
  { name: "secondary_muscles" }, { name: "equipment" }, { name: "instructions" },
  { name: "difficulty" }, { name: "is_custom" }, { name: "deleted_at" },
  { name: "attachment" }, { name: "is_voltra" }, { name: "start_image_uri" },
  { name: "end_image_uri" }, { name: "progression_group" }, { name: "progression_order" },
  { name: "notes" }, { name: "notes_updated_at" }, { name: "notes_backfill_dismissed_at" },
  { name: "user_rest_seconds" },
];

import { importData } from "../../../lib/db/import-export";

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAllAsync.mockImplementation(async (sql: string) => {
    if (typeof sql === "string" && sql.includes("PRAGMA table_info(exercises)")) {
      return EXERCISES_COLUMNS;
    }
    return [];
  });
  mockGetFirstAsync.mockResolvedValue({ cnt: 0 });
  mockRunAsync.mockResolvedValue({ changes: 1 });
});

// Helper: run an import with a single exercise that has user_rest_seconds = value
async function importExerciseWith(user_rest_seconds: unknown) {
  await importData({
    version: 7,
    data: {
      exercises: {
        exercises: [{
          id: "e1",
          name: "Squat",
          category: "barbell",
          primary_muscles: "",
          secondary_muscles: "",
          equipment: "barbell",
          instructions: "",
          difficulty: "beginner",
          is_custom: 0,
          user_rest_seconds,
        }],
      },
    },
  } as Record<string, unknown>);
}

// Helper: get the user_rest_seconds value that was inserted
function getInsertedRestSeconds(): unknown {
  const calls = mockRunAsync.mock.calls as unknown[][];
  // Find the INSERT that specifically includes the user_rest_seconds column —
  // not seed INSERTs (which don't include that column).
  const insertCall = calls.find(([sql]) =>
    typeof sql === "string" &&
    sql.includes("INSERT OR IGNORE INTO exercises") &&
    sql.includes("user_rest_seconds")
  );
  if (!insertCall) return "NO_INSERT_CALL";
  const sql = insertCall[0] as string;
  const values = insertCall[1] as unknown[];
  // Find the index of user_rest_seconds column in the column list
  const colMatch = sql.match(/INSERT OR IGNORE INTO exercises \(([^)]+)\)/);
  if (!colMatch) return "PARSE_FAILED";
  const cols = colMatch[1].split(", ");
  const ursIdx = cols.indexOf("user_rest_seconds");
  if (ursIdx === -1) return "COLUMN_NOT_IN_INSERT";
  return values[ursIdx];
}

describe("importData — user_rest_seconds sanitization (AC7)", () => {
  it("valid value 120 is passed through unchanged", async () => {
    await importExerciseWith(120);
    expect(getInsertedRestSeconds()).toBe(120);
  });

  it("valid value 15 (floor) is passed through unchanged", async () => {
    await importExerciseWith(15);
    expect(getInsertedRestSeconds()).toBe(15);
  });

  it("valid value 600 (ceiling) is passed through unchanged", async () => {
    await importExerciseWith(600);
    expect(getInsertedRestSeconds()).toBe(600);
  });

  it("null is passed through unchanged", async () => {
    await importExerciseWith(null);
    expect(getInsertedRestSeconds()).toBeNull();
  });

  it("negative value -1 is dropped to null", async () => {
    await importExerciseWith(-1);
    expect(getInsertedRestSeconds()).toBeNull();
  });

  it("zero is dropped to null", async () => {
    await importExerciseWith(0);
    expect(getInsertedRestSeconds()).toBeNull();
  });

  it("string 'abc' (non-integer) is dropped to null", async () => {
    await importExerciseWith("abc");
    expect(getInsertedRestSeconds()).toBeNull();
  });

  it("NaN (via string 'NaN') is dropped to null", async () => {
    await importExerciseWith("NaN");
    expect(getInsertedRestSeconds()).toBeNull();
  });

  it("value below floor (14) is clamped to 15", async () => {
    await importExerciseWith(14);
    expect(getInsertedRestSeconds()).toBe(15);
  });

  it("value above ceiling (100000) is clamped to 600", async () => {
    await importExerciseWith(100000);
    expect(getInsertedRestSeconds()).toBe(600);
  });

  it("value just above ceiling (601) is clamped to 600", async () => {
    await importExerciseWith(601);
    expect(getInsertedRestSeconds()).toBe(600);
  });

  it("string '120' (parseable integer) is treated as 120", async () => {
    await importExerciseWith("120");
    expect(getInsertedRestSeconds()).toBe(120);
  });

  it("float 90.5 (non-integer) is dropped to null", async () => {
    await importExerciseWith(90.5);
    expect(getInsertedRestSeconds()).toBeNull();
  });
});

// ─── Privacy regression: breadcrumb inputValue must never contain user-controlled content ───

import * as Sentry from "../../../__mocks__/@sentry/react-native";

describe("importData — user_rest_seconds breadcrumb privacy (AC12)", () => {
  const maliciousInputs: Array<[string, unknown]> = [
    ["XSS string", "<script>alert(1)</script>"],
    ["string 'NaN'", "NaN"],
    ["evil object", { evil: true }],
    ["undefined", undefined],
  ];

  it.each(maliciousInputs)(
    "breadcrumb inputValue for %s is null or number — never raw content",
    async (_label, raw) => {
      await importExerciseWith(raw);
      const calls = (Sentry.addBreadcrumb as jest.Mock).mock.calls;
      for (const [breadcrumb] of calls) {
        if (breadcrumb?.category === "rest-resolver" && breadcrumb?.data) {
          const { inputValue } = breadcrumb.data;
          expect(inputValue === null || typeof inputValue === "number").toBe(true);
          // Confirm serialized data contains no injected content
          const serialized = JSON.stringify(breadcrumb.data);
          expect(serialized).not.toMatch(/<script>|alert|evil/);
        }
      }
    },
  );
});
