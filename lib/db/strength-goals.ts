import { eq, and, isNull, isNotNull, desc } from "drizzle-orm";
import { uuid } from "../uuid";
import { getDrizzle, query } from "./helpers";
import { strengthGoals } from "./schema";
import type { StrengthGoalRow } from "./schema";

export type { StrengthGoalRow };

export type CreateGoalInput = {
  exerciseId: string;
  targetWeight?: number | null;
  targetReps?: number | null;
  deadline?: string | null;
};

export type UpdateGoalInput = {
  targetWeight?: number | null;
  targetReps?: number | null;
  deadline?: string | null;
};

export async function getActiveGoals(): Promise<StrengthGoalRow[]> {
  const db = await getDrizzle();
  return db
    .select()
    .from(strengthGoals)
    .where(isNull(strengthGoals.achieved_at))
    .orderBy(desc(strengthGoals.created_at));
}

export async function getGoalForExercise(
  exerciseId: string,
): Promise<StrengthGoalRow | null> {
  const db = await getDrizzle();
  const row = await db
    .select()
    .from(strengthGoals)
    .where(
      and(
        eq(strengthGoals.exercise_id, exerciseId),
        isNull(strengthGoals.achieved_at),
      ),
    )
    .get();
  return row ?? null;
}

export async function createGoal(input: CreateGoalInput): Promise<StrengthGoalRow> {
  // App-level guard: one active goal per exercise (backup for partial unique index)
  const existing = await getGoalForExercise(input.exerciseId);
  if (existing) {
    throw new Error("An active goal already exists for this exercise");
  }
  const db = await getDrizzle();
  const id = uuid();
  const now = new Date().toISOString();
  const row: StrengthGoalRow = {
    id,
    exercise_id: input.exerciseId,
    target_weight: input.targetWeight ?? null,
    target_reps: input.targetReps ?? null,
    deadline: input.deadline ?? null,
    achieved_at: null,
    created_at: now,
    updated_at: now,
  };
  await db.insert(strengthGoals).values(row);
  return row;
}

export async function updateGoal(
  goalId: string,
  updates: UpdateGoalInput,
): Promise<void> {
  const db = await getDrizzle();
  const now = new Date().toISOString();
  const set: Record<string, unknown> = { updated_at: now };
  if (updates.targetWeight !== undefined) set.target_weight = updates.targetWeight;
  if (updates.targetReps !== undefined) set.target_reps = updates.targetReps;
  if (updates.deadline !== undefined) set.deadline = updates.deadline;
  await db.update(strengthGoals).set(set).where(eq(strengthGoals.id, goalId));
}

export async function achieveGoal(goalId: string): Promise<void> {
  const db = await getDrizzle();
  const now = new Date().toISOString();
  await db
    .update(strengthGoals)
    .set({ achieved_at: now, updated_at: now })
    .where(eq(strengthGoals.id, goalId));
}

export async function deleteGoal(goalId: string): Promise<void> {
  const db = await getDrizzle();
  await db.delete(strengthGoals).where(eq(strengthGoals.id, goalId));
}

export async function getCompletedGoals(): Promise<StrengthGoalRow[]> {
  const db = await getDrizzle();
  return db
    .select()
    .from(strengthGoals)
    .where(isNotNull(strengthGoals.achieved_at))
    .orderBy(desc(strengthGoals.achieved_at));
}

type CurrentBestRow = { best: number | null };

/** Compute current best weight for an exercise from completed workout sets. */
export async function getCurrentBestWeight(exerciseId: string): Promise<number | null> {
  const rows = await query<CurrentBestRow>(
    `SELECT MAX(weight) as best FROM workout_sets WHERE exercise_id = ? AND completed = 1 AND weight IS NOT NULL`,
    [exerciseId],
  );
  return rows[0]?.best ?? null;
}

/** Compute current best reps for a bodyweight exercise from completed workout sets. */
export async function getCurrentBestReps(exerciseId: string): Promise<number | null> {
  const rows = await query<CurrentBestRow>(
    `SELECT MAX(reps) as best FROM workout_sets WHERE exercise_id = ? AND completed = 1 AND reps IS NOT NULL`,
    [exerciseId],
  );
  return rows[0]?.best ?? null;
}
