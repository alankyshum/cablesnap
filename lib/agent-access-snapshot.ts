import { and, asc, eq, gte, inArray, isNotNull, isNull, max } from "drizzle-orm";
import {
  AGENT_ACCESS_SCHEMA_VERSION,
  MAX_SNAPSHOT_BYTES,
  type AgentAccessScope,
  type AgentSnapshot,
} from "@/shared/agent-access";
import { getDrizzle } from "./db/helpers";
import {
  exercises,
  templateExercises,
  workoutSessions,
  workoutSets,
  workoutTemplates,
} from "./db/schema";

export type AgentSnapshotOptions = { days: number; scope: AgentAccessScope };

function snapshotRange(days: number, now = new Date()) {
  const boundedDays = Math.min(3650, Math.max(1, Math.round(days)));
  const from = new Date(now.getTime() - boundedDays * 24 * 60 * 60 * 1000);
  return { from, to: now, days: boundedDays };
}

async function buildSessions(from: number) {
  const db = await getDrizzle();
  const sessions = await db.select().from(workoutSessions)
    .where(gte(workoutSessions.started_at, from)).orderBy(asc(workoutSessions.started_at)).all();
  if (sessions.length === 0) return [];
  const sets = await db.select().from(workoutSets)
    .where(inArray(workoutSets.session_id, sessions.map((session) => session.id)))
    .orderBy(asc(workoutSets.exercise_position)).all();
  const setBySession = new Map<string, typeof sets>();
  for (const set of sets) {
    const current = setBySession.get(set.session_id) ?? [];
    current.push(set);
    setBySession.set(set.session_id, current);
  }
  return sessions.map((session) => ({ ...session, sets: setBySession.get(session.id) ?? [] }));
}

async function buildTemplates() {
  const db = await getDrizzle();
  const templates = await db.select().from(workoutTemplates).orderBy(asc(workoutTemplates.name)).all();
  if (templates.length === 0) return [];
  const templateSets = await db.select().from(templateExercises).orderBy(asc(templateExercises.position)).all();
  return templates.map((template) => ({
    ...template,
    exercises: templateSets.filter((exercise) => exercise.template_id === template.id),
  }));
}

async function buildExerciseLibrary() {
  const db = await getDrizzle();
  return db.select({
    id: exercises.id,
    name: exercises.name,
    category: exercises.category,
    primaryMuscles: exercises.primary_muscles,
    secondaryMuscles: exercises.secondary_muscles,
    equipment: exercises.equipment,
    instructions: exercises.instructions,
    difficulty: exercises.difficulty,
  }).from(exercises).where(isNull(exercises.deleted_at)).orderBy(asc(exercises.name)).all();
}

async function buildPersonalRecords(from: number) {
  const db = await getDrizzle();
  return db.select({
    exerciseId: workoutSets.exercise_id,
    exerciseName: exercises.name,
    maxWeight: max(workoutSets.weight),
  }).from(workoutSets)
    .innerJoin(exercises, eq(workoutSets.exercise_id, exercises.id))
    .innerJoin(workoutSessions, eq(workoutSets.session_id, workoutSessions.id))
    .where(and(eq(workoutSets.completed, 1), isNotNull(workoutSessions.completed_at), gte(workoutSessions.started_at, from)))
    .groupBy(workoutSets.exercise_id, exercises.name)
    .orderBy(asc(exercises.name)).all();
}

export async function buildAgentSnapshot(options: AgentSnapshotOptions): Promise<AgentSnapshot> {
  const range = snapshotRange(options.days);
  const [sessions, templates, exerciseLibrary, personalRecords] = await Promise.all([
    options.scope.sessions ? buildSessions(range.from.getTime()) : Promise.resolve([]),
    options.scope.templates ? buildTemplates() : Promise.resolve([]),
    options.scope.exerciseLibrary ? buildExerciseLibrary() : Promise.resolve([]),
    options.scope.personalRecords ? buildPersonalRecords(range.from.getTime()) : Promise.resolve([]),
  ]);
  const snapshot: AgentSnapshot = {
    schemaVersion: AGENT_ACCESS_SCHEMA_VERSION,
    generatedAt: range.to.toISOString(),
    range: { from: range.from.toISOString(), to: range.to.toISOString(), days: range.days },
    scope: options.scope,
    sessions,
    templates,
    exerciseLibrary,
    personalRecords,
  };
  if (new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > MAX_SNAPSHOT_BYTES) {
    throw new Error("Workout snapshot is too large; choose a shorter date range.");
  }
  return snapshot;
}
