/* eslint-disable max-lines */
import { eq, sql, and, inArray, asc, desc, isNull, count } from "drizzle-orm";
import type { WorkoutTemplate, TemplateExercise, MuscleGroup } from "../types";
import { uuid } from "../uuid";
import { getDrizzle, getDatabase } from "./helpers";
import {
  workoutTemplates,
  templateExercises,
  exercises,
  programSchedule,
  programDays,
  programs,
} from "./schema";
import { mapRow } from "./exercises";

export async function createTemplate(name: string): Promise<WorkoutTemplate> {
  const id = uuid();
  const now = Date.now();
  const db = await getDrizzle();
  await db.insert(workoutTemplates).values({ id, name, created_at: now, updated_at: now });
  return { id, name, created_at: now, updated_at: now };
}

export async function getTemplates(): Promise<WorkoutTemplate[]> {
  const db = await getDrizzle();
  const rows = await db
    .select()
    .from(workoutTemplates)
    .orderBy(asc(workoutTemplates.is_starter), desc(workoutTemplates.created_at));
  return rows.map((r) => ({ ...r, is_starter: r.is_starter === 1 }));
}

export async function getTemplateById(
  id: string
): Promise<WorkoutTemplate | null> {
  const db = await getDrizzle();
  const raw = await db
    .select()
    .from(workoutTemplates)
    .where(eq(workoutTemplates.id, id))
    .get();
  if (!raw) return null;
  const tpl: WorkoutTemplate = { ...raw, is_starter: raw.is_starter === 1 };

  const rows = await db
    .select({
      id: templateExercises.id,
      template_id: templateExercises.template_id,
      exercise_id: templateExercises.exercise_id,
      position: templateExercises.position,
      target_sets: templateExercises.target_sets,
      target_reps: templateExercises.target_reps,
      rest_seconds: templateExercises.rest_seconds,
      link_id: templateExercises.link_id,
      link_label: templateExercises.link_label,
      target_duration_seconds: templateExercises.target_duration_seconds,
      exercise_name: exercises.name,
      exercise_category: exercises.category,
      exercise_primary_muscles: exercises.primary_muscles,
      exercise_secondary_muscles: exercises.secondary_muscles,
      exercise_equipment: exercises.equipment,
      exercise_instructions: exercises.instructions,
      exercise_difficulty: exercises.difficulty,
      exercise_is_custom: exercises.is_custom,
      exercise_deleted_at: exercises.deleted_at,
    })
    .from(templateExercises)
    .leftJoin(exercises, eq(templateExercises.exercise_id, exercises.id))
    .where(eq(templateExercises.template_id, id))
    .orderBy(asc(templateExercises.position));

  tpl.exercises = rows.map((r) => ({
    id: r.id,
    template_id: r.template_id,
    exercise_id: r.exercise_id,
    position: r.position,
    target_sets: r.target_sets ?? 3,
    target_reps: r.target_reps ?? "8-12",
    rest_seconds: r.rest_seconds ?? 90,
    link_id: r.link_id ?? null,
    link_label: r.link_label ?? "",
    target_duration_seconds: r.target_duration_seconds ?? null,
    exercise: r.exercise_name
      ? mapRow({
          id: r.exercise_id,
          name: r.exercise_name,
          category: r.exercise_category!,
          primary_muscles: r.exercise_primary_muscles!,
          secondary_muscles: r.exercise_secondary_muscles!,
          equipment: r.exercise_equipment!,
          instructions: r.exercise_instructions!,
          difficulty: r.exercise_difficulty!,
          is_custom: r.exercise_is_custom!,
          deleted_at: r.exercise_deleted_at,
          mount_position: null,
          attachment: null,
          training_modes: null,
          is_voltra: null,
        })
      : undefined,
  }));
  return tpl;
}

export async function updateTemplateName(
  id: string,
  name: string
): Promise<void> {
  const db = await getDrizzle();
  await db.update(workoutTemplates)
    .set({ name, updated_at: Date.now() })
    .where(eq(workoutTemplates.id, id));
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = await getDrizzle();
  const tpl = await db
    .select({ is_starter: workoutTemplates.is_starter })
    .from(workoutTemplates)
    .where(eq(workoutTemplates.id, id))
    .get();
  if (tpl?.is_starter === 1) return;

  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    await db.delete(programSchedule).where(eq(programSchedule.template_id, id));
    await db.delete(templateExercises).where(eq(templateExercises.template_id, id));
    await db
      .update(programDays)
      .set({ template_id: null })
      .where(eq(programDays.template_id, id));
    await db
      .delete(workoutTemplates)
      .where(and(eq(workoutTemplates.id, id), eq(workoutTemplates.is_starter, 0)));
  });
}

export async function duplicateTemplate(id: string): Promise<string> {
  const tpl = await getTemplateById(id);
  if (!tpl) throw new Error("Template not found");

  const newId = uuid();
  const now = Date.now();
  const name = `${tpl.name} (Copy)`;
  const db = await getDrizzle();
  const database = await getDatabase();

  await database.withTransactionAsync(async () => {
    await db.insert(workoutTemplates).values({
      id: newId,
      name,
      created_at: now,
      updated_at: now,
      is_starter: 0,
    });

    const linkMap = new Map<string, string>();
    for (const ex of tpl.exercises ?? []) {
      const teId = uuid();
      let linkId = ex.link_id;
      if (linkId) {
        if (!linkMap.has(linkId)) linkMap.set(linkId, uuid());
        linkId = linkMap.get(linkId)!;
      }
      await db.insert(templateExercises).values({
        id: teId,
        template_id: newId,
        exercise_id: ex.exercise_id,
        position: ex.position,
        target_sets: ex.target_sets,
        target_reps: ex.target_reps,
        rest_seconds: ex.rest_seconds,
        link_id: linkId,
        link_label: ex.link_label,
      });
    }
  });

  return newId;
}

export async function duplicateProgram(id: string): Promise<string> {
  const db = await getDrizzle();
  const database = await getDatabase();

  const prog = await db
    .select({
      id: programs.id,
      name: programs.name,
      description: programs.description,
      is_starter: programs.is_starter,
    })
    .from(programs)
    .where(and(eq(programs.id, id), isNull(programs.deleted_at)))
    .get();
  if (!prog) throw new Error("Program not found");

  const newId = uuid();
  const now = Date.now();
  const name = `${prog.name} (Copy)`;

  const days = await db
    .select({
      id: programDays.id,
      template_id: programDays.template_id,
      position: programDays.position,
      label: programDays.label,
    })
    .from(programDays)
    .where(eq(programDays.program_id, id))
    .orderBy(asc(programDays.position));

  const templateCopies = new Map<string, string>();
  for (const day of days) {
    if (day.template_id && !templateCopies.has(day.template_id)) {
      const tpl = await db
        .select({ is_starter: workoutTemplates.is_starter })
        .from(workoutTemplates)
        .where(eq(workoutTemplates.id, day.template_id))
        .get();
      if (tpl?.is_starter === 1) {
        templateCopies.set(day.template_id, await duplicateTemplate(day.template_id));
      }
    }
  }

  await database.withTransactionAsync(async () => {
    await db.insert(programs).values({
      id: newId,
      name,
      description: prog.description ?? "",
      is_active: 0,
      current_day_id: null,
      created_at: now,
      updated_at: now,
      is_starter: 0,
    });

    for (const day of days) {
      const tplId = templateCopies.get(day.template_id ?? "") ?? day.template_id;
      await db.insert(programDays).values({
        id: uuid(),
        program_id: newId,
        template_id: tplId,
        position: day.position,
        label: day.label,
      });
    }
  });

  return newId;
}

export async function addExerciseToTemplate(
  templateId: string,
  exerciseId: string,
  position: number,
  targetSets = 3,
  targetReps = "8-12",
  restSeconds = 90
): Promise<TemplateExercise> {
  const id = uuid();
  const db = await getDrizzle();
  await db.insert(templateExercises).values({
    id,
    template_id: templateId,
    exercise_id: exerciseId,
    position,
    target_sets: targetSets,
    target_reps: targetReps,
    rest_seconds: restSeconds,
  });
  await db.update(workoutTemplates)
    .set({ updated_at: Date.now() })
    .where(eq(workoutTemplates.id, templateId));
  return {
    id,
    template_id: templateId,
    exercise_id: exerciseId,
    position,
    target_sets: targetSets,
    target_reps: targetReps,
    rest_seconds: restSeconds,
    link_id: null,
    link_label: "",
    target_duration_seconds: null,
  };
}

export async function removeExerciseFromTemplate(id: string): Promise<void> {
  const db = await getDrizzle();
  const row = await db
    .select({ template_id: templateExercises.template_id, link_id: templateExercises.link_id })
    .from(templateExercises)
    .where(eq(templateExercises.id, id))
    .get();
  if (!row) return;

  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    await db.delete(templateExercises).where(eq(templateExercises.id, id));
    if (row.link_id) {
      const remaining = await db
        .select({ count: count() })
        .from(templateExercises)
        .where(eq(templateExercises.link_id, row.link_id))
        .get();
      if (remaining && remaining.count < 2) {
        await db
          .update(templateExercises)
          .set({ link_id: null, link_label: "" })
          .where(eq(templateExercises.link_id, row.link_id));
      }
    }
    const ordered = await db
      .select({ id: templateExercises.id })
      .from(templateExercises)
      .where(eq(templateExercises.template_id, row.template_id))
      .orderBy(asc(templateExercises.position));
    for (let i = 0; i < ordered.length; i++) {
      await db
        .update(templateExercises)
        .set({ position: i })
        .where(eq(templateExercises.id, ordered[i].id));
    }
    await db
      .update(workoutTemplates)
      .set({ updated_at: Date.now() })
      .where(eq(workoutTemplates.id, row.template_id));
  });
}

export async function reorderTemplateExercises(
  templateId: string,
  orderedIds: string[]
): Promise<void> {
  const db = await getDrizzle();
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db
        .update(templateExercises)
        .set({ position: i })
        .where(
          and(
            eq(templateExercises.id, orderedIds[i]),
            eq(templateExercises.template_id, templateId)
          )
        );
    }
    await db
      .update(workoutTemplates)
      .set({ updated_at: Date.now() })
      .where(eq(workoutTemplates.id, templateId));
  });
}

export async function updateTemplateExercise(
  id: string,
  templateId: string,
  targetSets: number,
  targetReps: string,
  restSeconds: number
): Promise<void> {
  const db = await getDrizzle();
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    await db
      .update(templateExercises)
      .set({ target_sets: targetSets, target_reps: targetReps, rest_seconds: restSeconds })
      .where(eq(templateExercises.id, id));
    await db
      .update(workoutTemplates)
      .set({ updated_at: Date.now() })
      .where(eq(workoutTemplates.id, templateId));
  });
}

export async function getTemplateExerciseCount(
  templateId: string
): Promise<number> {
  const db = await getDrizzle();
  const row = await db.select({ count: sql<number>`COUNT(*)` })
    .from(templateExercises)
    .where(eq(templateExercises.template_id, templateId))
    .get();
  return row?.count ?? 0;
}

export async function getTemplateExerciseCounts(
  templateIds: string[]
): Promise<Record<string, number>> {
  if (templateIds.length === 0) return {};
  const db = await getDrizzle();
  const rows = await db
    .select({
      template_id: templateExercises.template_id,
      count: count(),
    })
    .from(templateExercises)
    .where(inArray(templateExercises.template_id, templateIds))
    .groupBy(templateExercises.template_id);
  const result: Record<string, number> = {};
  for (const r of rows) result[r.template_id] = r.count;
  return result;
}

// ---- Superset / Circuit Linking ----

export async function createExerciseLink(
  templateId: string,
  exerciseIds: string[]
): Promise<string> {
  const db = await getDrizzle();
  const database = await getDatabase();
  const linkId = uuid();
  await database.withTransactionAsync(async () => {
    for (const eid of exerciseIds) {
      await db
        .update(templateExercises)
        .set({ link_id: linkId })
        .where(
          and(
            eq(templateExercises.id, eid),
            eq(templateExercises.template_id, templateId)
          )
        );
    }
  });
  await db
    .update(workoutTemplates)
    .set({ updated_at: Date.now() })
    .where(eq(workoutTemplates.id, templateId));
  return linkId;
}

export async function unlinkExerciseGroup(linkId: string): Promise<void> {
  const db = await getDrizzle();
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    const te = await db
      .select({ template_id: templateExercises.template_id })
      .from(templateExercises)
      .where(eq(templateExercises.link_id, linkId))
      .limit(1)
      .get();
    await db
      .update(templateExercises)
      .set({ link_id: null, link_label: "" })
      .where(eq(templateExercises.link_id, linkId));
    if (te) {
      await db
        .update(workoutTemplates)
        .set({ updated_at: Date.now() })
        .where(eq(workoutTemplates.id, te.template_id));
    }
  });
}

export async function addToExerciseLink(
  linkId: string,
  exerciseIds: string[]
): Promise<void> {
  const db = await getDrizzle();
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    for (const eid of exerciseIds) {
      await db
        .update(templateExercises)
        .set({ link_id: linkId })
        .where(eq(templateExercises.id, eid));
    }
  });
}

export async function unlinkSingleExercise(
  teId: string,
  linkId: string
): Promise<void> {
  const db = await getDrizzle();
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    const te = await db
      .select({ template_id: templateExercises.template_id })
      .from(templateExercises)
      .where(eq(templateExercises.id, teId))
      .get();
    await db
      .update(templateExercises)
      .set({ link_id: null, link_label: "" })
      .where(eq(templateExercises.id, teId));
    const remaining = await db
      .select({ count: count() })
      .from(templateExercises)
      .where(eq(templateExercises.link_id, linkId))
      .get();
    if (remaining && remaining.count < 2) {
      await db
        .update(templateExercises)
        .set({ link_id: null, link_label: "" })
        .where(eq(templateExercises.link_id, linkId));
    }
    if (te) {
      await db
        .update(workoutTemplates)
        .set({ updated_at: Date.now() })
        .where(eq(workoutTemplates.id, te.template_id));
    }
  });
}

/**
 * Get the unique primary muscles for each template, grouped by template ID.
 * Excludes deleted exercises and the "full_body" pseudo-muscle.
 */
export async function getTemplatePrimaryMuscles(
  templateIds: string[]
): Promise<Record<string, MuscleGroup[]>> {
  if (templateIds.length === 0) return {};
  const db = await getDrizzle();
  const rows = await db
    .select({
      template_id: templateExercises.template_id,
      primary_muscles: exercises.primary_muscles,
    })
    .from(templateExercises)
    .innerJoin(exercises, eq(templateExercises.exercise_id, exercises.id))
    .where(
      and(
        inArray(templateExercises.template_id, templateIds),
        isNull(exercises.deleted_at)
      )
    );

  const result: Record<string, Set<MuscleGroup>> = {};
  for (const row of rows) {
    if (!row.primary_muscles) continue;
    if (!result[row.template_id]) result[row.template_id] = new Set();
    const muscles: MuscleGroup[] = JSON.parse(row.primary_muscles);
    for (const m of muscles) {
      if (m !== "full_body") result[row.template_id].add(m);
    }
  }

  const out: Record<string, MuscleGroup[]> = {};
  for (const [id, set] of Object.entries(result)) {
    out[id] = Array.from(set);
  }
  return out;
}

export async function updateLinkLabel(
  linkId: string,
  label: string
): Promise<void> {
  const db = await getDrizzle();
  await db
    .update(templateExercises)
    .set({ link_label: label })
    .where(eq(templateExercises.link_id, linkId));
}
