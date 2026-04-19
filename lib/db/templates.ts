import { eq, sql } from "drizzle-orm";
import type { WorkoutTemplate, TemplateExercise, MuscleGroup } from "../types";
import { uuid } from "../uuid";
import { getDrizzle, query, queryOne, execute, getDatabase } from "./helpers";
import { workoutTemplates, templateExercises } from "./schema";
import { mapRow } from "./exercises";

type TemplateExerciseRow = {
  id: string;
  template_id: string;
  exercise_id: string;
  position: number;
  target_sets: number;
  target_reps: string;
  rest_seconds: number;
  link_id: string | null;
  link_label: string;
  target_duration_seconds: number | null;
  exercise_name: string | null;
  exercise_category: string | null;
  exercise_primary_muscles: string | null;
  exercise_secondary_muscles: string | null;
  exercise_equipment: string | null;
  exercise_instructions: string | null;
  exercise_difficulty: string | null;
  exercise_is_custom: number | null;
  exercise_deleted_at: number | null;
};

export async function createTemplate(name: string): Promise<WorkoutTemplate> {
  const id = uuid();
  const now = Date.now();
  const db = await getDrizzle();
  await db.insert(workoutTemplates).values({ id, name, created_at: now, updated_at: now });
  return { id, name, created_at: now, updated_at: now };
}

export async function getTemplates(): Promise<WorkoutTemplate[]> {
  const rows = await query<{
    id: string;
    name: string;
    created_at: number;
    updated_at: number;
    is_starter: number;
  }>(
    "SELECT * FROM workout_templates ORDER BY is_starter ASC, created_at DESC"
  );
  return rows.map((r) => ({ ...r, is_starter: r.is_starter === 1 }));
}

export async function getTemplateById(
  id: string
): Promise<WorkoutTemplate | null> {
  const raw = await queryOne<{
    id: string;
    name: string;
    created_at: number;
    updated_at: number;
    is_starter: number;
  }>(
    "SELECT * FROM workout_templates WHERE id = ?",
    [id]
  );
  if (!raw) return null;
  const tpl: WorkoutTemplate = { ...raw, is_starter: raw.is_starter === 1 };
  const rows = await query<TemplateExerciseRow>(
    `SELECT te.*, e.name AS exercise_name, e.category AS exercise_category,
       e.primary_muscles AS exercise_primary_muscles, e.secondary_muscles AS exercise_secondary_muscles,
       e.equipment AS exercise_equipment, e.instructions AS exercise_instructions,
       e.difficulty AS exercise_difficulty, e.is_custom AS exercise_is_custom,
       e.deleted_at AS exercise_deleted_at
     FROM template_exercises te
     LEFT JOIN exercises e ON te.exercise_id = e.id
     WHERE te.template_id = ?
     ORDER BY te.position ASC`,
    [id]
  );
  tpl.exercises = rows.map((r) => ({
    id: r.id,
    template_id: r.template_id,
    exercise_id: r.exercise_id,
    position: r.position,
    target_sets: r.target_sets,
    target_reps: r.target_reps,
    rest_seconds: r.rest_seconds,
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
  const database = await getDatabase();
  const tpl = await queryOne<{ is_starter: number }>(
    "SELECT is_starter FROM workout_templates WHERE id = ?",
    [id]
  );
  if (tpl?.is_starter === 1) return;
  await database.withTransactionAsync(async () => {
    await database.runAsync("DELETE FROM program_schedule WHERE template_id = ?", [id]);
    await database.runAsync("DELETE FROM template_exercises WHERE template_id = ?", [id]);
    await database.runAsync("UPDATE program_days SET template_id = NULL WHERE template_id = ?", [id]);
    await database.runAsync("DELETE FROM workout_templates WHERE id = ? AND is_starter = 0", [id]);
  });
}

export async function duplicateTemplate(id: string): Promise<string> {
  const database = await getDatabase();
  const tpl = await getTemplateById(id);
  if (!tpl) throw new Error("Template not found");

  const newId = uuid();
  const now = Date.now();
  const name = `${tpl.name} (Copy)`;

  await database.withTransactionAsync(async () => {
    await database.runAsync(
      "INSERT INTO workout_templates (id, name, created_at, updated_at, is_starter) VALUES (?, ?, ?, ?, 0)",
      [newId, name, now, now]
    );

    const linkMap = new Map<string, string>();
    for (const ex of tpl.exercises ?? []) {
      const teId = uuid();
      let linkId = ex.link_id;
      if (linkId) {
        if (!linkMap.has(linkId)) linkMap.set(linkId, uuid());
        linkId = linkMap.get(linkId)!;
      }
      await database.runAsync(
        "INSERT INTO template_exercises (id, template_id, exercise_id, position, target_sets, target_reps, rest_seconds, link_id, link_label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [teId, newId, ex.exercise_id, ex.position, ex.target_sets, ex.target_reps, ex.rest_seconds, linkId, ex.link_label]
      );
    }
  });

  return newId;
}

export async function duplicateProgram(id: string): Promise<string> {
  const database = await getDatabase();
  const prog = await database.getFirstAsync<{ id: string; name: string; description: string; is_starter: number }>(
    "SELECT id, name, description, is_starter FROM programs WHERE id = ? AND deleted_at IS NULL",
    [id]
  );
  if (!prog) throw new Error("Program not found");

  const newId = uuid();
  const now = Date.now();
  const name = `${prog.name} (Copy)`;

  const days = await database.getAllAsync<{ id: string; template_id: string | null; position: number; label: string }>(
    "SELECT id, template_id, position, label FROM program_days WHERE program_id = ? ORDER BY position ASC",
    [id]
  );

  const templateCopies = new Map<string, string>();
  for (const day of days) {
    if (day.template_id && !templateCopies.has(day.template_id)) {
      const tpl = await database.getFirstAsync<{ is_starter: number }>(
        "SELECT is_starter FROM workout_templates WHERE id = ?",
        [day.template_id]
      );
      if (tpl?.is_starter === 1) {
        templateCopies.set(day.template_id, await duplicateTemplate(day.template_id));
      }
    }
  }

  await database.withTransactionAsync(async () => {
    await database.runAsync(
      "INSERT INTO programs (id, name, description, is_active, current_day_id, created_at, updated_at, is_starter) VALUES (?, ?, ?, 0, NULL, ?, ?, 0)",
      [newId, name, prog.description, now, now]
    );

    for (const day of days) {
      const tplId = templateCopies.get(day.template_id ?? "") ?? day.template_id;
      await database.runAsync(
        "INSERT INTO program_days (id, program_id, template_id, position, label) VALUES (?, ?, ?, ?, ?)",
        [uuid(), newId, tplId, day.position, day.label]
      );
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
  const database = await getDatabase();
  const row = await queryOne<{ template_id: string; link_id: string | null }>(
    "SELECT template_id, link_id FROM template_exercises WHERE id = ?",
    [id]
  );
  if (!row) return;
  await database.withTransactionAsync(async () => {
    await database.runAsync("DELETE FROM template_exercises WHERE id = ?", [id]);
    if (row.link_id) {
      const remaining = await database.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM template_exercises WHERE link_id = ?",
        [row.link_id]
      );
      if (remaining && remaining.count < 2) {
        await database.runAsync(
          "UPDATE template_exercises SET link_id = NULL, link_label = '' WHERE link_id = ?",
          [row.link_id]
        );
      }
    }
    const ordered = await database.getAllAsync<{ id: string }>(
      "SELECT id FROM template_exercises WHERE template_id = ? ORDER BY position ASC",
      [row.template_id]
    );
    for (let i = 0; i < ordered.length; i++) {
      await database.runAsync(
        "UPDATE template_exercises SET position = ? WHERE id = ?",
        [i, ordered[i].id]
      );
    }
    await database.runAsync(
      "UPDATE workout_templates SET updated_at = ? WHERE id = ?",
      [Date.now(), row.template_id]
    );
  });
}

export async function reorderTemplateExercises(
  templateId: string,
  orderedIds: string[]
): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await database.runAsync(
        "UPDATE template_exercises SET position = ? WHERE id = ? AND template_id = ?",
        [i, orderedIds[i], templateId]
      );
    }
    await database.runAsync(
      "UPDATE workout_templates SET updated_at = ? WHERE id = ?",
      [Date.now(), templateId]
    );
  });
}

export async function updateTemplateExercise(
  id: string,
  templateId: string,
  targetSets: number,
  targetReps: string,
  restSeconds: number
): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      "UPDATE template_exercises SET target_sets = ?, target_reps = ?, rest_seconds = ? WHERE id = ?",
      [targetSets, targetReps, restSeconds, id]
    );
    await database.runAsync(
      "UPDATE workout_templates SET updated_at = ? WHERE id = ?",
      [Date.now(), templateId]
    );
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
  const placeholders = templateIds.map(() => "?").join(",");
  const rows = await query<{ template_id: string; count: number }>(
    `SELECT template_id, COUNT(*) as count FROM template_exercises WHERE template_id IN (${placeholders}) GROUP BY template_id`,
    templateIds
  );
  const result: Record<string, number> = {};
  for (const r of rows) result[r.template_id] = r.count;
  return result;
}

// ---- Superset / Circuit Linking ----

export async function createExerciseLink(
  templateId: string,
  exerciseIds: string[]
): Promise<string> {
  const database = await getDatabase();
  const linkId = uuid();
  await database.withTransactionAsync(async () => {
    for (const eid of exerciseIds) {
      await database.runAsync(
        "UPDATE template_exercises SET link_id = ? WHERE id = ? AND template_id = ?",
        [linkId, eid, templateId]
      );
    }
  });
  await execute(
    "UPDATE workout_templates SET updated_at = ? WHERE id = ?",
    [Date.now(), templateId]
  );
  return linkId;
}

export async function unlinkExerciseGroup(linkId: string): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    const te = await database.getFirstAsync<{ template_id: string }>(
      "SELECT template_id FROM template_exercises WHERE link_id = ? LIMIT 1",
      [linkId]
    );
    await database.runAsync(
      "UPDATE template_exercises SET link_id = NULL, link_label = '' WHERE link_id = ?",
      [linkId]
    );
    if (te) {
      await database.runAsync(
        "UPDATE workout_templates SET updated_at = ? WHERE id = ?",
        [Date.now(), te.template_id]
      );
    }
  });
}

export async function addToExerciseLink(
  linkId: string,
  exerciseIds: string[]
): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    for (const eid of exerciseIds) {
      await database.runAsync(
        "UPDATE template_exercises SET link_id = ? WHERE id = ?",
        [linkId, eid]
      );
    }
  });
}

export async function unlinkSingleExercise(
  teId: string,
  linkId: string
): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    const te = await database.getFirstAsync<{ template_id: string }>(
      "SELECT template_id FROM template_exercises WHERE id = ?",
      [teId]
    );
    await database.runAsync(
      "UPDATE template_exercises SET link_id = NULL, link_label = '' WHERE id = ?",
      [teId]
    );
    const remaining = await database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM template_exercises WHERE link_id = ?",
      [linkId]
    );
    if (remaining && remaining.count < 2) {
      await database.runAsync(
        "UPDATE template_exercises SET link_id = NULL, link_label = '' WHERE link_id = ?",
        [linkId]
      );
    }
    if (te) {
      await database.runAsync(
        "UPDATE workout_templates SET updated_at = ? WHERE id = ?",
        [Date.now(), te.template_id]
      );
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
  const placeholders = templateIds.map(() => "?").join(",");
  const rows = await query<{ template_id: string; primary_muscles: string }>(
    `SELECT te.template_id, e.primary_muscles
     FROM template_exercises te
     JOIN exercises e ON te.exercise_id = e.id
     WHERE te.template_id IN (${placeholders})
       AND e.deleted_at IS NULL
       AND e.primary_muscles IS NOT NULL`,
    templateIds
  );

  const result: Record<string, Set<MuscleGroup>> = {};
  for (const row of rows) {
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
  await execute(
    "UPDATE template_exercises SET link_label = ? WHERE link_id = ?",
    [label, linkId]
  );
}
