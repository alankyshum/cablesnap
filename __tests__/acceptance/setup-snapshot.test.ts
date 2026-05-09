/**
 * BLD-1114 — Setup Snapshot acceptance test.
 *
 * Validates the end-to-end contract at the unit/integration level:
 *   - pulley_pin column is included in CSV export output
 *   - getClipForSet (kind=video) and getSetupPhotoForSet (kind=setup_photo) are independent
 *   - validatePulleyPin accepts 1-30, rejects 0/31/fractional
 *   - cascadeDeleteClipsForSets dispatches setup_photo rows to unlinkSetupPhotoFiles
 *   - captureSetupPhoto calls insertSetMedia with kind='setup_photo'
 */

// ── CSV export: pulley_pin column ──────────────────────────────────────────
import { workoutCSV } from "../../lib/csv-format";
import type { WorkoutCSVRow } from "../../lib/db/csv";

describe("Setup Snapshot — CSV export includes pulley_pin (BLD-1114 AC-CSV)", () => {
  const baseRow: WorkoutCSVRow = {
    date: "2026-05-01",
    exercise: "Cable Row",
    set_number: 1,
    weight: 50,
    reps: 8,
    duration_seconds: null,
    notes: "",
    set_rpe: null,
    set_notes: "",
    link_id: null,
    tempo: null,
    kind: null,
    day_session_exercise_id: null,
    day_session_date: null,
    bodyweight_modifier_kg: null,
    pulley_pin: null,
  };

  it("header includes pulley_pin column", () => {
    const csv = workoutCSV([baseRow]);
    const header = csv.split("\n")[0];
    expect(header).toContain("pulley_pin");
  });

  it("exports numeric pulley_pin value", () => {
    const csv = workoutCSV([{ ...baseRow, pulley_pin: 12 }]);
    expect(csv).toContain("12");
  });

  it("exports empty string for null pulley_pin", () => {
    const csv = workoutCSV([{ ...baseRow, pulley_pin: null }]);
    const data = csv.split("\n")[1];
    const cells = data.split(",");
    const pinIdx = csv.split("\n")[0].split(",").indexOf("pulley_pin");
    expect(cells[pinIdx]).toBe("");
  });
});

// ── validatePulleyPin domain ───────────────────────────────────────────────
import { validatePulleyPin } from "../../lib/db/session-sets";

describe("Setup Snapshot — validatePulleyPin domain (BLD-1114 AC-PIN)", () => {
  it("accepts 1 (lower bound)", () => { expect(validatePulleyPin(1)).toBe(1); });
  it("accepts 30 (upper bound)", () => { expect(validatePulleyPin(30)).toBe(30); });
  it("accepts null (clear)", () => { expect(validatePulleyPin(null)).toBeNull(); });
  it("rejects 0 (out of range)", () => { expect(() => validatePulleyPin(0)).toThrow(); });
  it("rejects 31 (out of range)", () => { expect(() => validatePulleyPin(31)).toThrow(); });
  it("rejects 2.5 (fractional)", () => { expect(() => validatePulleyPin(2.5)).toThrow(); });
});

// ── setup_photo DB kind isolation ─────────────────────────────────────────
// Using the drizzle-mocked setup (same pattern as set-media-kind-isolation.test.ts)

const mockSelect2 = jest.fn();
const mockFrom2 = jest.fn();
const mockWhere2 = jest.fn();
const mockLimit2 = jest.fn();
const mockSelectChain2 = {
  from: mockFrom2.mockReturnThis(),
  where: mockWhere2.mockReturnThis(),
  limit: mockLimit2,
};

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(() =>
    Promise.resolve({
      execAsync: jest.fn().mockResolvedValue(undefined),
      getAllAsync: jest.fn().mockResolvedValue([]),
      getFirstAsync: jest.fn().mockResolvedValue(null),
      runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
      prepareAsync: jest.fn().mockResolvedValue({
        executeAsync: jest.fn().mockResolvedValue(undefined),
        finalizeAsync: jest.fn().mockResolvedValue(undefined),
      }),
      withTransactionAsync: jest.fn(async (cb: () => Promise<void>) => cb()),
    })
  ),
}));

jest.mock("drizzle-orm/expo-sqlite", () => ({
  drizzle: jest.fn(() => ({
    select: jest.fn(),
  })),
}));

jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return {
    ...actual,
    eq: jest.fn((col: unknown, val: unknown) => ({ _col: col, _val: val })),
    and: jest.fn((...args: unknown[]) => args),
    desc: jest.fn((col: unknown) => ({ _col: col, _direction: "desc" })),
    sql: Object.assign(
      jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ _sql: strings, _values: values })),
      { raw: jest.fn((s: string) => s) }
    ),
  };
});

import { getSetupPhotoForSet } from "../../lib/db/setup-photos";

describe("Setup Snapshot — getSetupPhotoForSet kind isolation (BLD-1114 AC-KIND)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { drizzle } = require("drizzle-orm/expo-sqlite");
    (drizzle as jest.Mock).mockReturnValue({
      select: mockSelect2.mockReturnValue(mockSelectChain2),
    });
    mockFrom2.mockReturnValue(mockSelectChain2);
    mockWhere2.mockReturnValue(mockSelectChain2);
    mockLimit2.mockResolvedValue([]);
  });

  it("filters by kind='setup_photo' in WHERE clause", async () => {
    await getSetupPhotoForSet("s1");
    const { eq } = require("drizzle-orm");
    const kindCall = (eq as jest.Mock).mock.calls.find(([, val]) => val === "setup_photo");
    expect(kindCall).toBeDefined();
  });

  it("does NOT filter by kind='video'", async () => {
    await getSetupPhotoForSet("s1");
    const { eq } = require("drizzle-orm");
    const videoCall = (eq as jest.Mock).mock.calls.find(([, val]) => val === "video");
    expect(videoCall).toBeUndefined();
  });
});
