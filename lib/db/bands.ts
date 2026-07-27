/**
 * Band library CRUD and set-write path — BLD-4293.
 */

import { eq, isNull } from "drizzle-orm";
import { getDrizzle } from "./helpers";
import { bands as bandsTable, workoutSets } from "./schema";
import { uuid } from "../uuid";
import type { Band } from "../bands";
import {
  resolveSignature,
  resolveNumericLoad,
  buildBandSnapshot,
  validateLoadKg,
} from "../bands";

export async function listBands(): Promise<Band[]> {
  const db = await getDrizzle();
  const rows = await db
    .select()
    .from(bandsTable)
    .where(isNull(bandsTable.deleted_at))
    .orderBy(bandsTable.created_at);
  return rows as Band[];
}

type CreateBandOptions = {
  label: string;
  load_kg?: number | null;
  color_hint?: string | null;
};

export async function createBand(opts: CreateBandOptions): Promise<Band> {
  const db = await getDrizzle();
  const id = uuid();
  const now = Date.now();
  const load_kg = opts.load_kg !== undefined ? validateLoadKg(opts.load_kg) : null;
  await db.insert(bandsTable).values({
    id,
    label: opts.label.trim(),
    load_kg: load_kg,
    color_hint: opts.color_hint ?? null,
    created_at: now,
    deleted_at: null,
  });
  return {
    id,
    label: opts.label.trim(),
    load_kg,
    color_hint: opts.color_hint ?? null,
    created_at: now,
    deleted_at: null,
  };
}

type UpdateBandOptions = Partial<{
  label: string;
  load_kg: number | null;
  color_hint: string | null;
}>;

export async function updateBand(id: string, opts: UpdateBandOptions): Promise<void> {
  const db = await getDrizzle();
  const updates: Partial<typeof bandsTable.$inferInsert> = {};
  if (opts.label !== undefined) updates.label = opts.label.trim();
  if (opts.load_kg !== undefined) updates.load_kg = opts.load_kg !== null ? validateLoadKg(opts.load_kg) : null;
  if (opts.color_hint !== undefined) updates.color_hint = opts.color_hint;
  if (Object.keys(updates).length === 0) return;
  await db.update(bandsTable).set(updates).where(eq(bandsTable.id, id));
}

export async function deleteBand(id: string): Promise<void> {
  const db = await getDrizzle();
  await db
    .update(bandsTable)
    .set({ deleted_at: Date.now() })
    .where(eq(bandsTable.id, id));
}

export async function writeBandSet(
  setId: string,
  bandIds: readonly string[],
  allBands: readonly Band[],
): Promise<void> {
  if (bandIds.length === 0) {
    const db = await getDrizzle();
    await db
      .update(workoutSets)
      .set({
        band_ids: null,
        band_signature: null,
        band_snapshot: null,
      })
      .where(eq(workoutSets.id, setId));
    return;
  }

  const selectedBands = bandIds
    .map((id) => allBands.find((b) => b.id === id))
    .filter((b): b is Band => b !== undefined);

  const signature = resolveSignature(bandIds);
  const numericLoad = resolveNumericLoad(selectedBands);
  const snapshot = buildBandSnapshot(selectedBands);

  const db = await getDrizzle();
  await db
    .update(workoutSets)
    .set({
      band_ids: JSON.stringify(bandIds),
      band_signature: signature,
      band_snapshot: JSON.stringify(snapshot),
      weight: numericLoad !== null ? numericLoad : null,
    })
    .where(eq(workoutSets.id, setId));
}

export function parseBandSnapshot(
  snapshotJson: string | null | undefined,
): Array<{ label: string; load_kg: number | null; color_hint: string | null }> {
  if (!snapshotJson) return [];
  try {
    const parsed = JSON.parse(snapshotJson);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function parseBandIds(bandIdsJson: string | null | undefined): string[] {
  if (!bandIdsJson) return [];
  try {
    const parsed = JSON.parse(bandIdsJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}
