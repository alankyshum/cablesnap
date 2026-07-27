/**
 * BLD-4293 — Band-resistance logging migration + domain tests.
 */

import { DatabaseSync } from "node:sqlite";
import { migrate } from "../lib/db/migrations";
import {
  resolveSignature,
  resolveNumericLoad,
  shouldShowBandPicker,
  validateLoadKg,
  buildBandSnapshot,
  buildBandDisplayLabel,
} from "../lib/bands";
import type { Band } from "../lib/bands";

type Row = Record<string, unknown>;
type SqlParam = null | number | bigint | string | Uint8Array;

function wrapDb(db: InstanceType<typeof DatabaseSync>) {
  return {
    execAsync: async (sql: string): Promise<void> => { db.exec(sql); },
    getAllAsync: async <T = Row>(sql: string, params?: unknown[]): Promise<T[]> =>
      db.prepare(sql).all(...((params ?? []) as SqlParam[])) as T[],
    getFirstAsync: async <T = Row>(sql: string, params?: unknown[]): Promise<T | null> =>
      (db.prepare(sql).get(...((params ?? []) as SqlParam[])) as T) ?? null,
    runAsync: async (sql: string, params?: unknown[]): Promise<{ changes: number }> => {
      const result = db.prepare(sql).run(...((params ?? []) as SqlParam[]));
      return { changes: Number(result.changes) };
    },
  };
}

type WrappedDb = ReturnType<typeof wrapDb>;

describe("BLD-4293: bands table migration", () => {
  let db: InstanceType<typeof DatabaseSync>;
  let wrappedDb: WrappedDb;

  beforeAll(async () => {
    db = new DatabaseSync(":memory:");
    wrappedDb = wrapDb(db);
    await migrate(wrappedDb as unknown as Parameters<typeof migrate>[0]);
  });

  it("creates the bands table", () => {
    const rows = db.prepare("PRAGMA table_info(bands)").all() as { name: string }[];
    const cols = rows.map((r) => r.name);
    expect(cols).toContain("id");
    expect(cols).toContain("label");
    expect(cols).toContain("load_kg");
    expect(cols).toContain("color_hint");
    expect(cols).toContain("created_at");
    expect(cols).toContain("deleted_at");
  });

  it("creates the idx_bands_deleted_at index", () => {
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='bands'").all() as { name: string }[];
    const names = indexes.map((i) => i.name);
    expect(names).toContain("idx_bands_deleted_at");
  });

  it("adds band_ids, band_signature, band_snapshot columns to workout_sets", () => {
    const rows = db.prepare("PRAGMA table_info(workout_sets)").all() as { name: string }[];
    const cols = rows.map((r) => r.name);
    expect(cols).toContain("band_ids");
    expect(cols).toContain("band_signature");
    expect(cols).toContain("band_snapshot");
  });

  it("migration is idempotent — existing workout_sets rows unchanged after second migrate()", async () => {
    db.exec(`
      INSERT INTO workout_sets
        (id, session_id, exercise_id, set_number, weight, reps, completed, completed_at, set_type, cached_volume_kg, cached_e1rm_kg)
      VALUES
        ('set-1', 'sess-1', 'ex-1', 1, 100.0, 8, 1, 1000000, 'normal', 800.0, 126.7)
    `);
    const before = db.prepare("SELECT * FROM workout_sets WHERE id='set-1'").get() as Row;
    await migrate(wrappedDb as unknown as Parameters<typeof migrate>[0]);
    const after = db.prepare("SELECT * FROM workout_sets WHERE id='set-1'").get() as Row;
    expect(after).toEqual(before);
    expect(after.band_ids).toBeNull();
    expect(after.band_signature).toBeNull();
    expect(after.band_snapshot).toBeNull();
  });

  it("can insert into the bands table", () => {
    db.exec(`INSERT INTO bands (id, label, load_kg, color_hint, created_at, deleted_at) VALUES ('band-1', 'Red', 13.6, 'red', 1700000000000, NULL)`);
    const row = db.prepare("SELECT * FROM bands WHERE id='band-1'").get() as Row;
    expect(row.label).toBe("Red");
    expect(row.load_kg).toBeCloseTo(13.6, 5);
    expect(row.deleted_at).toBeNull();
  });
});

describe("resolveSignature", () => {
  it("returns empty string for empty input", () => { expect(resolveSignature([])).toBe(""); });
  it("sorts ids before joining", () => { expect(resolveSignature(["c", "a", "b"])).toBe("a|b|c"); });
  it("is order-independent", () => {
    const ids = ["band-red", "band-green", "band-black"];
    expect(resolveSignature(ids)).toBe(resolveSignature([...ids].reverse()));
  });
  it("handles a single id", () => { expect(resolveSignature(["single"])).toBe("single"); });
});

describe("resolveNumericLoad", () => {
  it("returns null for empty array", () => { expect(resolveNumericLoad([])).toBeNull(); });
  it("sums load_kg when all bands have it", () => {
    expect(resolveNumericLoad([{ load_kg: 10 }, { load_kg: 13.6 }, { load_kg: 5 }])).toBeCloseTo(28.6, 5);
  });
  it("returns null when any band lacks load_kg", () => {
    expect(resolveNumericLoad([{ load_kg: 10 }, { load_kg: null }])).toBeNull();
  });
  it("returns null when all bands lack load_kg", () => {
    expect(resolveNumericLoad([{ load_kg: null }, { load_kg: null }])).toBeNull();
  });
});

describe("shouldShowBandPicker", () => {
  it("returns true for band equipment", () => { expect(shouldShowBandPicker("band")).toBe(true); });
  it("returns false for cable equipment", () => { expect(shouldShowBandPicker("cable")).toBe(false); });
  it("returns false for bodyweight equipment", () => { expect(shouldShowBandPicker("bodyweight")).toBe(false); });
  it("returns false for barbell equipment", () => { expect(shouldShowBandPicker("barbell")).toBe(false); });
});

describe("validateLoadKg", () => {
  it("accepts positive finite numbers", () => { expect(validateLoadKg(13.6)).toBeCloseTo(13.6, 5); });
  it("rejects null/undefined/empty", () => {
    expect(validateLoadKg(null)).toBeNull();
    expect(validateLoadKg(undefined)).toBeNull();
    expect(validateLoadKg("")).toBeNull();
  });
  it("rejects negative numbers", () => { expect(validateLoadKg(-5)).toBeNull(); });
  it("rejects zero", () => { expect(validateLoadKg(0)).toBeNull(); });
  it("rejects NaN and Infinity", () => {
    expect(validateLoadKg(NaN)).toBeNull();
    expect(validateLoadKg(Infinity)).toBeNull();
  });
  it("accepts numeric strings", () => { expect(validateLoadKg("13.6")).toBeCloseTo(13.6, 5); });
});

describe("buildBandSnapshot", () => {
  const makeBand = (overrides: Partial<Band>): Band => ({
    id: "id-1", label: "Red", load_kg: 10, color_hint: "red", created_at: Date.now(), deleted_at: null,
    ...overrides,
  });

  it("maps bands to snapshot format", () => {
    const snapshot = buildBandSnapshot([
      makeBand({ label: "Red", load_kg: 10, color_hint: "red" }),
      makeBand({ id: "id-2", label: "Green", load_kg: 13.6, color_hint: "green" }),
    ]);
    expect(snapshot).toHaveLength(2);
    expect(snapshot[0]).toEqual({ label: "Red", load_kg: 10, color_hint: "red" });
    expect(snapshot[1]).toEqual({ label: "Green", load_kg: 13.6, color_hint: "green" });
  });

  it("handles symbolic bands (no load_kg)", () => {
    const snapshot = buildBandSnapshot([makeBand({ label: "Heavy", load_kg: null, color_hint: null })]);
    expect(snapshot[0].load_kg).toBeNull();
  });
});

describe("buildBandDisplayLabel", () => {
  it("returns empty for no bands", () => { expect(buildBandDisplayLabel([])).toEqual({ kind: "empty" }); });
  it("returns numeric with kg sum when all have load_kg", () => {
    expect(buildBandDisplayLabel([{ label: "Red", load_kg: 10 }, { label: "Blue", load_kg: 15 }])).toEqual({ kind: "numeric", kg: 25 });
  });
  it("returns symbolic with concatenated labels when any lacks load_kg", () => {
    expect(buildBandDisplayLabel([{ label: "Red", load_kg: 10 }, { label: "Heavy", load_kg: null }])).toEqual({ kind: "symbolic", label: "Red + Heavy" });
  });
});
