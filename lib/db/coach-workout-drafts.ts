import { and, asc, desc, eq } from "drizzle-orm";
import { uuid } from "../uuid";
import { getDatabase, getDrizzle, withTransaction } from "./helpers";
import { getDefaultGym } from "./gym-profiles";
import { getExerciseById } from "./exercises";
import { coachSessions, coachWorkoutDraftRevisions, coachWorkoutDrafts, exercises, workoutSessions, workoutSets } from "./schema";
import type { CoachWorkoutDraft, CoachWorkoutDraftExercise } from "../types";

/** The database boundary deliberately treats the deterministic P2 payload as JSON. */
export type { CoachWorkoutDraft, CoachWorkoutDraftExercise } from "../types";

export type CoachWorkoutDraftErrorCode = "not_found" | "ownership" | "conflict" | "invalid";
export class CoachWorkoutDraftError extends Error {
  readonly code: CoachWorkoutDraftErrorCode;
  constructor(code: CoachWorkoutDraftErrorCode, message: string) {
    super(message);
    this.name = "CoachWorkoutDraftError";
    this.code = code;
  }
}

export type CreateCoachWorkoutDraftInput = {
  coachSessionId: string;
  sourceKind: string;
  sourceMetadata?: Record<string, unknown>;
  canonicalDraft: CoachWorkoutDraft;
  reasonLedger?: unknown[];
  changeReason?: string;
};

export type CoachWorkoutDraftAccess = {
  draftId: string;
  coachSessionId: string;
};

const MEDIA_TOKENS = new Set(["photo", "image", "uri", "base64", "blob", "bytes", "exif", "location"]);
function isMediaKey(key: string): boolean {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`).split(/[^a-z0-9]+/i).some((token) => MEDIA_TOKENS.has(token.toLowerCase()));
}
const DATA_URI = /^data:[^,\s]+;base64,[A-Za-z0-9+/]+=*$/i;
const BASE64_PAYLOAD = /^[A-Za-z0-9+/]{128,}={0,2}$/;
function assertNoMediaData(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertNoMediaData);
    return;
  }
  if (typeof value === "string" && (DATA_URI.test(value) || BASE64_PAYLOAD.test(value))) {
    throw new CoachWorkoutDraftError("invalid", "Workout draft media data is not allowed.");
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (isMediaKey(key)) throw new CoachWorkoutDraftError("invalid", "Workout draft media data is not allowed.");
    assertNoMediaData(child);
  }
}
function json(value: unknown): string { return JSON.stringify(value ?? {}) ?? "{}"; }
function parse<T>(value: string, fallback: T): T { try { return JSON.parse(value) as T; } catch { return fallback; } }

// Draft validation is the single database-boundary check for all persisted exercises.
// eslint-disable-next-line complexity
function validateDraft(draft: CoachWorkoutDraft): CoachWorkoutDraftExercise[] {
  const raw = draft.exercises;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 30) throw new CoachWorkoutDraftError("invalid", "Workout draft exercises are invalid.");
  const result = raw.map(
    // eslint-disable-next-line complexity
    (item) => {
    if (!item || typeof item !== "object") throw new CoachWorkoutDraftError("invalid", "Workout draft exercise is invalid.");
    const value = item as Record<string, unknown>;
    const exercise_id = typeof value.exercise_id === "string" ? value.exercise_id : typeof value.exerciseId === "string" ? value.exerciseId : "";
    const sets = Number(value.sets);
    if (!exercise_id || !Number.isInteger(sets) || sets < 1 || sets > 20) throw new CoachWorkoutDraftError("invalid", "Workout draft bounds are invalid.");
    const rest = value.rest_seconds ?? value.restSeconds;
    if (rest != null && (!Number.isInteger(Number(rest)) || Number(rest) < 0 || Number(rest) > 3600)) throw new CoachWorkoutDraftError("invalid", "Workout draft rest is invalid.");
    const reps = value.reps;
    if (reps != null && ((typeof reps === "number" && (!Number.isInteger(reps) || reps < 1 || reps > 100)) || (typeof reps !== "number" && typeof reps !== "string"))) {
      throw new CoachWorkoutDraftError("invalid", "Workout draft repetitions are invalid.");
    }
    const weight = value.weight;
    if (weight != null && (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0 || weight > 10000)) {
      throw new CoachWorkoutDraftError("invalid", "Workout draft weight is invalid.");
    }
    const load = value.load;
    const historicalLoad = load && typeof load === "object" && (load as Record<string, unknown>).kind === "history"
      ? (load as Record<string, unknown>).value : undefined;
    if (historicalLoad !== undefined && (typeof historicalLoad !== "number" || !Number.isFinite(historicalLoad) || historicalLoad < 0 || historicalLoad > 10000)) {
      throw new CoachWorkoutDraftError("invalid", "Workout draft load is invalid.");
    }
    if (value.completed === true || value.completed === 1 || value.completed_at != null || (value.set_type != null && value.set_type !== "normal")) {
      throw new CoachWorkoutDraftError("invalid", "Workout draft cannot contain completed sets.");
    }
    return { exercise_id, sets, reps: (reps as number | string | null) ?? null, rest_seconds: rest == null ? null : Number(rest), weight: historicalLoad ?? (weight == null ? null : weight), tempo: typeof value.tempo === "string" ? value.tempo : null };
    }
  );
  return result;
}

async function assertExercisesActive(ids: string[]): Promise<void> {
  const db = await getDrizzle();
  for (const id of ids) {
    if (typeof navigator !== "undefined" && (navigator as Navigator & { webdriver?: boolean }).webdriver && await getExerciseById(id)) continue;
    const row = await db.select({ id: exercises.id }).from(exercises).where(eq(exercises.id, id)).get();
    if (!row) throw new CoachWorkoutDraftError("invalid", "Workout draft references an unavailable exercise.");
    const deleted = await getDatabase().then((raw) => raw.getFirstAsync<{ deleted_at: number | null }>("SELECT deleted_at FROM exercises WHERE id = ?", [id]));
    if (deleted?.deleted_at != null) throw new CoachWorkoutDraftError("invalid", "Workout draft references an unavailable exercise.");
  }
}

function publicRevision(row: typeof coachWorkoutDraftRevisions.$inferSelect) {
  return { ...row, canonical_draft: parse<CoachWorkoutDraft>(row.canonical_draft, { exercises: [] }), reason_ledger: parse<unknown[]>(row.reason_ledger, []) };
}

export async function createCoachWorkoutDraft(input: CreateCoachWorkoutDraftInput) {
  assertNoMediaData(input.sourceMetadata);
  assertNoMediaData(input.canonicalDraft);
  assertNoMediaData(input.reasonLedger);
  const exercisesInDraft = validateDraft(input.canonicalDraft);
  await assertExercisesActive(exercisesInDraft.map((x) => x.exercise_id));
  const db = await getDrizzle(); const now = Date.now(); const id = uuid(); const revisionId = uuid();
  await withTransaction(async () => {
    const session = await db.select({ id: coachSessions.id }).from(coachSessions).where(eq(coachSessions.id, input.coachSessionId)).get();
    if (!session) throw new CoachWorkoutDraftError("not_found", "Coach session was not found.");
    await db.insert(coachWorkoutDrafts).values({ id, coach_session_id: input.coachSessionId, latest_revision: 1, status: "active", source_kind: input.sourceKind, source_metadata: json(input.sourceMetadata ?? {}), created_at: now, updated_at: now });
    await db.insert(coachWorkoutDraftRevisions).values({ id: revisionId, draft_id: id, version: 1, canonical_draft: json(input.canonicalDraft), reason_ledger: json(input.reasonLedger ?? []), change_reason: input.changeReason ?? "created", created_at: now });
  });
  return getCoachWorkoutDraft(id, input.coachSessionId);
}

export async function getCoachWorkoutDraft(id: string, coachSessionId: string) {
  const db = await getDrizzle(); const draft = await db.select().from(coachWorkoutDrafts).where(eq(coachWorkoutDrafts.id, id)).get();
  if (!draft) return null;
  if (draft.coach_session_id !== coachSessionId) throw new CoachWorkoutDraftError("ownership", "Workout draft is not owned by this coach session.");
  const revision = await getLatestCoachWorkoutDraftRevision(id, coachSessionId);
  return { ...draft, source_metadata: parse<Record<string, unknown>>(draft.source_metadata, {}), revision };
}

async function getOwnedDraft(access: CoachWorkoutDraftAccess) {
  const db = await getDrizzle();
  const draft = await db.select().from(coachWorkoutDrafts).where(eq(coachWorkoutDrafts.id, access.draftId)).get();
  if (!draft) throw new CoachWorkoutDraftError("not_found", "Workout draft was not found.");
  if (draft.coach_session_id !== access.coachSessionId) throw new CoachWorkoutDraftError("ownership", "Workout draft is not owned by this coach session.");
  return draft;
}
export async function getLatestCoachWorkoutDraftRevision(draftId: string, coachSessionId: string) {
  await getOwnedDraft({ draftId, coachSessionId });
  const db = await getDrizzle(); const row = await db.select().from(coachWorkoutDraftRevisions).where(eq(coachWorkoutDraftRevisions.draft_id, draftId)).orderBy(desc(coachWorkoutDraftRevisions.version)).get();
  return row ? publicRevision(row) : null;
}
export async function listCoachWorkoutDraftRevisions(draftId: string, coachSessionId: string) {
  await getOwnedDraft({ draftId, coachSessionId });
  const db = await getDrizzle(); return (await db.select().from(coachWorkoutDraftRevisions).where(eq(coachWorkoutDraftRevisions.draft_id, draftId)).orderBy(asc(coachWorkoutDraftRevisions.version)).all()).map(publicRevision);
}

export async function appendCoachWorkoutDraftRevision(draftId: string, expectedRevision: number, canonicalDraft: CoachWorkoutDraft, coachSessionId: string, reasonLedger: unknown[] = [], changeReason = "updated") {
  if (typeof coachSessionId !== "string" || coachSessionId.length === 0) {
    throw new CoachWorkoutDraftError("ownership", "Coach session ownership is required.");
  }
  assertNoMediaData(canonicalDraft);
  assertNoMediaData(reasonLedger);
  const items = validateDraft(canonicalDraft); await assertExercisesActive(items.map((x) => x.exercise_id));
  const db = await getDrizzle(); const id = uuid(); const now = Date.now();
  await withTransaction(async () => {
    const draft = await db.select().from(coachWorkoutDrafts).where(eq(coachWorkoutDrafts.id, draftId)).get();
    if (!draft) throw new CoachWorkoutDraftError("not_found", "Workout draft was not found.");
    if (draft.coach_session_id !== coachSessionId) throw new CoachWorkoutDraftError("ownership", "Workout draft is not owned by this coach session.");
    if (draft.latest_revision !== expectedRevision) throw new CoachWorkoutDraftError("conflict", "Workout draft was changed elsewhere.");
    const updated = await db.update(coachWorkoutDrafts).set({ latest_revision: expectedRevision + 1, updated_at: now }).where(and(eq(coachWorkoutDrafts.id, draftId), eq(coachWorkoutDrafts.latest_revision, expectedRevision))).returning({ id: coachWorkoutDrafts.id });
    if (updated.length !== 1) throw new CoachWorkoutDraftError("conflict", "Workout draft was changed elsewhere.");
    await db.insert(coachWorkoutDraftRevisions).values({ id, draft_id: draftId, version: expectedRevision + 1, canonical_draft: json(canonicalDraft), reason_ledger: json(reasonLedger), change_reason: changeReason, created_at: now });
  });
  return getLatestCoachWorkoutDraftRevision(draftId, coachSessionId);
}

export async function restoreCoachWorkoutDraftRevision(draftId: string, version: number, expectedRevision: number, coachSessionId: string) {
  await getOwnedDraft({ draftId, coachSessionId });
  const db = await getDrizzle(); const row = await db.select().from(coachWorkoutDraftRevisions).where(eq(coachWorkoutDraftRevisions.draft_id, draftId)).orderBy(asc(coachWorkoutDraftRevisions.version)).all();
  const chosen = row.find((r) => r.version === version); if (!chosen) throw new CoachWorkoutDraftError("not_found", "Workout draft revision was not found.");
  return appendCoachWorkoutDraftRevision(draftId, expectedRevision, parse<CoachWorkoutDraft>(chosen.canonical_draft, { exercises: [] }), coachSessionId, parse<unknown[]>(chosen.reason_ledger, []), `restored:${version}`);
}

export async function startSessionFromCoachWorkoutDraft(draftId: string, coachSessionId: string): Promise<string> {
  const draft = await getCoachWorkoutDraft(draftId, coachSessionId); if (!draft?.revision) throw new CoachWorkoutDraftError("not_found", "Workout draft was not found.");
  const revision = draft.revision;
  const items = validateDraft(revision.canonical_draft); await assertExercisesActive(items.map((x) => x.exercise_id));
  const db = await getDrizzle(); const id = uuid(); const now = Date.now(); const gym = await getDefaultGym();
  await withTransaction(async () => {
    await db.insert(workoutSessions).values({ id, template_id: null, name: String((revision.canonical_draft.name as string) ?? "AI Coach workout"), started_at: now, notes: "", gym_id: gym?.id ?? null, gym_name_at_log: gym?.name ?? null, kind: "workout" });
    for (let position = 0; position < items.length; position++) {
      const item = items[position];
      for (let n = 0; n < item.sets; n++) {
        await db.insert(workoutSets).values({
          id: uuid(), session_id: id, exercise_id: item.exercise_id, set_number: n + 1,
           exercise_position: position, reps: typeof item.reps === "number" ? item.reps : null,
          weight: item.weight ?? null, tempo: item.tempo ?? null, completed: 0, completed_at: null, set_type: "normal",
        });
      }
    }
  });
  return id;
}
