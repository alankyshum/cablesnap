import type { WorkoutTemplate, TemplateExercise } from "../types";
import { query, queryOne, execute, getDatabase } from "./helpers";
import { mapRow, type ExerciseRow } from "./exercises";

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
  const id = crypto.randomUUID();
  const now = Date.now();
  await execute(
    "INSERT INTO workout_templates (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
    [id, name, now, now]
  );
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

export async function deleteTemplate(id: string): Promise<void> {
  const tpl = await queryOne<{ is_starter: number }>(
    "SELECT is_starter FROM workout_templates WHERE id = ?",
    [id]
  );
  if (tpl?.is_starter === 1) return;
  await execute("DELETE FROM weekly_schedule WHERE template_id = ?", [id]);
  await execute("DELETE FROM template_exercises WHERE template_id = ?", [id]);
  await execute("UPDATE program_days SET template_id = NULL WHERE template_id = ?", [id]);
  await execute("DELETE FROM workout_templates WHERE id = ? AND is_starter = 0", [id]);
}

export async function duplicateTemplate(id: string): Promise<string> {
  const database = await getDatabase();
  const tpl = await getTemplateById(id);
  if (!tpl) throw new Error("Template not found");

  const newId = crypto.randomUUID();
  const now = Date.now();
  const name = `${tpl.name} (Copy)`;

  await database.withTransactionAsync(async () => {
    await database.runAsync(
      "INSERT INTO workout_templates (id, name, created_at, updated_at, is_starter) VALUES (?, ?, ?, ?, 0)",
      [newId, name, now, now]
    );

    const linkMap = new Map<string, string>();
    for (const ex of tpl.exercises ?? []) {
      const teId = crypto.randomUUID();
      let linkId = ex.link_id;
      if (linkId) {
        if (!linkMap.has(linkId)) linkMap.set(linkId, crypto.randomUUID());
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

  const newId = crypto.randomUUID();
  const now = Date.now();
  const name = `${prog.name} (Copy)`;

  const days = await database.getAllAsync<{ id: string; template_id: string | null; position: number; label: string }>(
    "SELECT id, template_id, position, label FROM program_days WHERE program_id = ? ORDER BY position ASC",
    [id]
  );

  await database.withTransactionAsync(async () => {
    await database.runAsync(
      "INSERT INTO programs (id, name, description, is_active, current_day_id, created_at, updated_at, is_starter) VALUES (?, ?, ?, 0, NULL, ?, ?, 0)",
      [newId, name, prog.description, now, now]
    );

    for (const day of days) {
      let tplId = day.template_id;
      if (tplId) {
        const tpl = await database.getFirstAsync<{ is_starter: number }>(
          "SELECT is_starter FROM workout_templates WHERE id = ?",
          [tplId]
        );
        if (tpl?.is_starter === 1) {
          tplId = await duplicateTemplate(tplId);
        }
      }
      await database.runAsync(
        "INSERT INTO program_days (id, program_id, template_id, position, label) VALUES (?, ?, ?, ?, ?)",
        [crypto.randomUUID(), newId, tplId, day.position, day.label]
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
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO template_exercises (id, template_id, exercise_id, position, target_sets, target_reps, rest_seconds)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, templateId, exerciseId, position, targetSets, targetReps, restSeconds]
  );
  await execute(
    "UPDATE workout_templates SET updated_at = ? WHERE id = ?",
    [Date.now(), templateId]
  );
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
  };
}

export async function removeExerciseFromTemplate(id: string): Promise<void> {
  const row = await queryOne<{ template_id: string; link_id: string | null }>(
    "SELECT template_id, link_id FROM template_exercises WHERE id = ?",
    [id]
  );
  await execute("DELETE FROM template_exercises WHERE id = ?", [id]);
  if (row) {
    if (row.link_id) {
      const remaining = await queryOne<{ count: number }>(
        "SELECT COUNT(*) as count FROM template_exercises WHERE link_id = ?",
        [row.link_id]
      );
      if (remaining && remaining.count < 2) {
        await execute(
          "UPDATE template_exercises SET link_id = NULL, link_label = '' WHERE link_id = ?",
          [row.link_id]
        );
      }
    }
    await execute(
      "UPDATE workout_templates SET updated_at = ? WHERE id = ?",
      [Date.now(), row.template_id]
    );
  }
}

export async function reorderTemplateExercises(
  templateId: string,
  orderedIds: string[]
): Promise<void> {
  const database = await getDatabase();
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
}

export async function updateTemplateExercise(
  id: string,
  targetSets: number,
  targetReps: string,
  restSeconds: number
): Promise<void> {
  await execute(
    "UPDATE template_exercises SET target_sets = ?, target_reps = ?, rest_seconds = ? WHERE id = ?",
    [targetSets, targetReps, restSeconds, id]
  );
}

export async function getTemplateExerciseCount(
  templateId: string
): Promise<number> {
  const row = await queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM template_exercises WHERE template_id = ?",
    [templateId]
  );
  return row?.count ?? 0;
}

// ---- Superset / Circuit Linking ----

export async function createExerciseLink(
  templateId: string,
  exerciseIds: string[]
): Promise<string> {
  const database = await getDatabase();
  const linkId = crypto.randomUUID();
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
    await database.runAsync(
      "UPDATE template_exercises SET link_id = NULL, link_label = '' WHERE link_id = ?",
      [linkId]
    );
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
  });
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
