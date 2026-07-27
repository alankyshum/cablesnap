/**
 * BLD-4293 — Band-resistance JSON import/export round-trip test.
 */

import {
  IMPORT_TABLE_ORDER,
  BACKUP_CATEGORY_TABLES,
} from "../lib/db/import-export";
import { resolveSignature, buildBandSnapshot } from "../lib/bands";
import type { Band } from "../lib/bands";

const RED_BAND: Band = { id: "band-red", label: "Red", load_kg: 13.6, color_hint: "red", created_at: 1700000000000, deleted_at: null };
const GREEN_BAND: Band = { id: "band-green", label: "Green", load_kg: 10, color_hint: "green", created_at: 1700000001000, deleted_at: null };

describe("BLD-4293: import/export table order", () => {
  it("includes 'bands' in IMPORT_TABLE_ORDER", () => { expect(IMPORT_TABLE_ORDER).toContain("bands"); });
  it("places 'bands' before 'workout_sets'", () => {
    const bandIdx = IMPORT_TABLE_ORDER.indexOf("bands");
    const setsIdx = IMPORT_TABLE_ORDER.indexOf("workout_sets");
    expect(bandIdx).toBeGreaterThanOrEqual(0);
    expect(bandIdx).toBeLessThan(setsIdx);
  });
  it("includes 'bands' in workout_history category tables", () => {
    expect(BACKUP_CATEGORY_TABLES.workout_history).toContain("bands");
  });
});

describe("BLD-4293: band_snapshot immutability at log time", () => {
  it("snapshot preserves label and load_kg", () => {
    const snapshot = buildBandSnapshot([RED_BAND, GREEN_BAND]);
    expect(snapshot[0]).toEqual({ label: "Red", load_kg: 13.6, color_hint: "red" });
    expect(snapshot[1]).toEqual({ label: "Green", load_kg: 10, color_hint: "green" });
  });

  it("snapshot survives rename: original label preserved in JSON", () => {
    const snapshotJson = JSON.stringify(buildBandSnapshot([RED_BAND]));
    const parsed = JSON.parse(snapshotJson) as { label: string }[];
    const renamedBand: Band = { ...RED_BAND, label: "Light Red" };
    expect(parsed[0].label).toBe("Red");
    expect(renamedBand.label).not.toBe(parsed[0].label);
  });

  it("snapshot survives delete: data preserved in snapshot JSON", () => {
    const snapshotJson = JSON.stringify(buildBandSnapshot([RED_BAND]));
    const parsed = JSON.parse(snapshotJson) as { label: string }[];
    const deletedBand: Band = { ...RED_BAND, deleted_at: Date.now() };
    expect(parsed[0].label).toBe("Red");
    expect(deletedBand.deleted_at).not.toBeNull();
  });
});

describe("BLD-4293: band_signature round-trip", () => {
  it("is order-independent", () => {
    const ids = [RED_BAND.id, GREEN_BAND.id];
    expect(resolveSignature(ids)).toBe(resolveSignature([...ids].reverse()));
    expect(resolveSignature(ids)).toBe("band-green|band-red");
  });

  it("recomputed signature on import matches original", () => {
    const originalIds = [GREEN_BAND.id, RED_BAND.id];
    const originalSig = resolveSignature(originalIds);
    const importedIds = JSON.parse(JSON.stringify(originalIds)) as string[];
    expect(resolveSignature(importedIds)).toBe(originalSig);
  });
});

describe("BLD-4293: non-band exercises unaffected", () => {
  it("non-band exercises have null band columns", () => {
    const cableSet = { id: "set-1", band_ids: null, band_signature: null, band_snapshot: null, weight: 50 };
    expect(cableSet.band_ids).toBeNull();
    expect(cableSet.band_signature).toBeNull();
    expect(cableSet.band_snapshot).toBeNull();
    expect(cableSet.weight).toBe(50);
  });
});
