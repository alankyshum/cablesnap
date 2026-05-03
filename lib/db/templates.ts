/* eslint-disable max-lines */
import { eq, sql, and, inArray, asc, desc, isNull, count } from "drizzle-orm";
import type { CoachTemplateImportData } from "../schemas";
import { safeParse } from "../safe-parse";
import type { WorkoutTemplate, TemplateExercise, MuscleGroup, SetType, TemplateSource } from "../types";
import { uuid } from "../uuid";
import { getDrizzle, withTransaction } from "./helpers";
import {
  workoutTemplates,
  templateExercises,
  exercises,
  programSchedule,
  programDays,
  programs,
  workoutSessions,
  workoutSets,
} from "./schema";
import { mapRow } from "./exercises";

export type InitialSetSeed = {
  sessionId: string;
  exerciseId: string;
  setNumber: number;
  linkId: string | null;
  round: number | null;
  exercisePosition: number;
  setType?: SetType;
};

export function normalizeTemplateSetTypes(setTypes: SetType[] | undefined, targetSets: number): SetType[] {
  return Array.from({ length: targetSets }, (_, index) => setTypes?.[index] ?? "normal");
}

export function parseTemplateTargetReps(targetReps: string, setNumber: number): number | null {
  const tokens = targetReps
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  const token = tokens[setNumber - 1] ?? tokens[tokens.length - 1] ?? "";
  const match = token.match(/\d+/);
  if (!match) return null;
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseTemplateSetTypes(raw: string | null | undefined, targetSets: number): SetType[] {
  if (!raw) return normalizeTemplateSetTypes(undefined, targetSets);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return normalizeTemplateSetTypes(undefined, targetSets);
    return normalizeTemplateSetTypes(
      parsed.filter((value): value is SetType => value === "normal" || value === "warmup" || value === "dropset" || value === "failure"),
      targetSets,
    );
  } catch {
    return normalizeTemplateSetTypes(undefined, targetSets);
  }
}

export function buildInitialSetsFromTemplate(
  template: Pick<WorkoutTemplate, "exercises">,
  sessionId: string
): InitialSetSeed[] {
  const out: InitialSetSeed[] = [];
  for (const te of template.exercises ?? []) {
    for (let i = 1; i <= te.target_sets; i++) {
      out.push({
        sessionId,
        exerciseId: te.exercise_id,
        setNumber: i,
        linkId: te.link_id ?? null,
        round: te.link_id ? i : null,
        exercisePosition: te.position,
        setType: normalizeTemplateSetTypes(te.set_types, te.target_sets)[i - 1] ?? "normal",
      });
    }
  }
  return out;
}

export async function createTemplate(name: string): Promise<WorkoutTemplate> {
  const id = uuid();
  const now = Date.now();
  const db = await getDrizzle();
  await db.insert(workoutTemplates).values({ id, name, created_at: now, updated_at: now, source: null });
  return { id, name, created_at: now, updated_at: now, source: null };
}

export async function getTemplates(): Promise<WorkoutTemplate[]> {
  const db = await getDrizzle();
  const rows = await db
    .select()
    .from(workoutTemplates)
    .orderBy(asc(workoutTemplates.is_starter), desc(workoutTemplates.created_at));
  return rows.map((r) => ({ ...r, is_starter: r.is_starter === 1, is_curated: r.is_curated === 1, source: (r.source ?? null) as TemplateSource }));
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
  const tpl: WorkoutTemplate = { ...raw, is_starter: raw.is_starter === 1, is_curated: raw.is_curated === 1, source: (raw.source ?? null) as TemplateSource };

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
      set_types: templateExercises.set_types,
      exercise_name: exercises.name,
      exercise_category: exercises.category,
      exercise_primary_muscles: exercises.primary_muscles,
      exercise_secondary_muscles: exercises.secondary_muscles,
      exercise_equipment: exercises.equipment,
      exercise_instructions: exercises.instructions,
      exercise_difficulty: exercises.difficulty,
      exercise_is_custom: exercises.is_custom,
      exercise_deleted_at: exercises.deleted_at,
      exercise_attachment: exercises.attachment,
      exercise_is_voltra: exercises.is_voltra,
      exercise_start_image_uri: exercises.start_image_uri,
      exercise_end_image_uri: exercises.end_image_uri,
      exercise_progression_group: exercises.progression_group,
      exercise_progression_order: exercises.progression_order,
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
    set_types: parseTemplateSetTypes(r.set_types, r.target_sets ?? 3),
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
          attachment: r.exercise_attachment,
          is_voltra: r.exercise_is_voltra,
          start_image_uri: r.exercise_start_image_uri,
          end_image_uri: r.exercise_end_image_uri,
          progression_group: r.exercise_progression_group ?? null,
          progression_order: r.exercise_progression_order ?? null,
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
    .select({ is_starter: workoutTemplates.is_starter, is_curated: workoutTemplates.is_curated })
    .from(workoutTemplates)
    .where(eq(workoutTemplates.id, id))
    .get();
  // BLD-1000: guard both starter AND curated templates from deletion.
  if (tpl?.is_starter === 1 || tpl?.is_curated === 1) return;

  await withTransaction(async () => {
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

  await withTransaction(async () => {
    await db.insert(workoutTemplates).values({
      id: newId,
      name,
      created_at: now,
      updated_at: now,
      is_starter: 0,
      source: null,
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
        target_duration_seconds: ex.target_duration_seconds,
        set_types: JSON.stringify(normalizeTemplateSetTypes(ex.set_types, ex.target_sets)),
      });
    }
  });

  return newId;
}

export async function duplicateProgram(id: string): Promise<string> {
  const db = await getDrizzle();

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
        .select({ is_starter: workoutTemplates.is_starter, is_curated: workoutTemplates.is_curated })
        .from(workoutTemplates)
        .where(eq(workoutTemplates.id, day.template_id))
        .get();
      // BLD-1000: also copy curated templates so the duplicate is independent.
      if (tpl?.is_starter === 1 || tpl?.is_curated === 1) {
        templateCopies.set(day.template_id, await duplicateTemplate(day.template_id));
      }
    }
  }

  // BLD-1000: fetch schedule rows so we can copy them into the new program.
  const scheduleRows = await db
    .select({
      day_of_week: programSchedule.day_of_week,
      template_id: programSchedule.template_id,
    })
    .from(programSchedule)
    .where(eq(programSchedule.program_id, id));

  await withTransaction(async () => {
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

    // BLD-1000: copy weekly schedule, remapping template_id through templateCopies.
    for (const row of scheduleRows) {
      const tplId = templateCopies.get(row.template_id) ?? row.template_id;
      await db.insert(programSchedule).values({
        program_id: newId,
        day_of_week: row.day_of_week,
        template_id: tplId,
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
  restSeconds = 90,
): Promise<TemplateExercise> {
  const id = uuid();
  const db = await getDrizzle();
  const setTypes = normalizeTemplateSetTypes(undefined, targetSets);
  await db.insert(templateExercises).values({
    id,
    template_id: templateId,
    exercise_id: exerciseId,
    position,
    target_sets: targetSets,
    target_reps: targetReps,
    rest_seconds: restSeconds,
    set_types: JSON.stringify(setTypes),
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
    set_types: setTypes,
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

  await withTransaction(async () => {
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
  await withTransaction(async () => {
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
  restSeconds: number,
  setTypes?: SetType[]
): Promise<void> {
  const db = await getDrizzle();
  await withTransaction(async () => {
    await db
      .update(templateExercises)
      .set({
        target_sets: targetSets,
        target_reps: targetReps,
        rest_seconds: restSeconds,
        set_types: JSON.stringify(normalizeTemplateSetTypes(setTypes, targetSets)),
      })
      .where(eq(templateExercises.id, id));
    await db
      .update(workoutTemplates)
      .set({ updated_at: Date.now() })
      .where(eq(workoutTemplates.id, templateId));
  });
}

export async function importCoachTemplates(data: CoachTemplateImportData): Promise<string[]> {
  const db = await getDrizzle();
  const importedIds: string[] = [];

  await withTransaction(async () => {
    const now = Date.now();

    for (let templateIndex = 0; templateIndex < data.templates.length; templateIndex++) {
      const template = data.templates[templateIndex];
      const templateId = uuid();
      const createdAt = now + templateIndex;
      const linkMap = new Map<string, string>();

      await db.insert(workoutTemplates).values({
        id: templateId,
        name: template.name.trim(),
        created_at: createdAt,
        updated_at: createdAt,
        is_starter: 0,
        source: "coach",
      });

      for (let exerciseIndex = 0; exerciseIndex < template.exercises.length; exerciseIndex++) {
        const exercise = template.exercises[exerciseIndex];
        let linkId = exercise.link_id ?? null;
        if (linkId) {
          if (!linkMap.has(linkId)) linkMap.set(linkId, uuid());
          linkId = linkMap.get(linkId)!;
        }

        await db.insert(templateExercises).values({
          id: uuid(),
          template_id: templateId,
          exercise_id: exercise.exercise_id,
          position: exerciseIndex,
          target_sets: exercise.target_sets,
          target_reps: exercise.target_reps,
          rest_seconds: exercise.rest_seconds,
          link_id: linkId,
          link_label: exercise.link_label ?? "",
          target_duration_seconds: exercise.target_duration_seconds ?? null,
          set_types: JSON.stringify(normalizeTemplateSetTypes(exercise.set_types, exercise.target_sets)),
        });
      }

      importedIds.push(templateId);
    }
  });

  return importedIds;
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
  const linkId = uuid();
  await withTransaction(async () => {
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
  await withTransaction(async () => {
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
  await withTransaction(async () => {
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
  await withTransaction(async () => {
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
    const muscles = safeParse<MuscleGroup[]>(row.primary_muscles, [], "templates.primary_muscles");
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

/** One changed template exercise — carries old + new values for undo. */
export type TemplateSyncChange = {
  templateExerciseId: string;
  oldTargetSets: number;
  oldSetTypes: SetType[];
  newTargetSets: number;
  newSetTypes: SetType[];
};

type ExPatch = {
  exerciseId: string;
  position: number;
  newTargetSets: number;
  newSetTypes: SetType[];
  target_reps: string | null | undefined;
  rest_seconds: number | null | undefined;
  link_id: string | null | undefined;
  link_label: string | null | undefined;
  target_duration_seconds: number | null | undefined;
};

/** Compute per-exercise patches for a starter template diff. Returns patches and whether any changed. */
function computeStarterPatches(
  origExercises: Array<{ id: string; exercise_id: string; position: number; target_sets: number | null; set_types: string | null; target_reps: string | null; rest_seconds: number | null; link_id: string | null; link_label: string | null; target_duration_seconds: number | null }>,
  sessionGroups: Map<string, { exerciseId: string; position: number; setTypes: SetType[] }>
): { patches: ExPatch[]; anyChange: boolean } {
  let anyChange = false;
  const patches: ExPatch[] = [];

  for (const te of origExercises) {
    const key = `${te.exercise_id}::${te.position}`;
    const sg = sessionGroups.get(key);
    const oldTargetSets = te.target_sets ?? 3;
    const oldSetTypes = parseTemplateSetTypes(te.set_types, oldTargetSets);
    const shared = { target_reps: te.target_reps, rest_seconds: te.rest_seconds, link_id: te.link_id, link_label: te.link_label, target_duration_seconds: te.target_duration_seconds };

    if (sg) {
      const newTargetSets = sg.setTypes.length;
      const newSetTypes = normalizeTemplateSetTypes(sg.setTypes, newTargetSets);
      if (newTargetSets !== oldTargetSets || newSetTypes.length !== oldSetTypes.length || newSetTypes.some((t, i) => t !== oldSetTypes[i])) {
        anyChange = true;
      }
      patches.push({ exerciseId: te.exercise_id, position: te.position, newTargetSets, newSetTypes, ...shared });
    } else {
      patches.push({ exerciseId: te.exercise_id, position: te.position, newTargetSets: oldTargetSets, newSetTypes: oldSetTypes, ...shared });
    }
  }

  return { patches, anyChange };
}


async function cloneStarterTemplate(
  db: Awaited<ReturnType<typeof getDrizzle>>,
  templateId: string,
  templateName: string | null | undefined,
  sessionId: string,
  patches: ExPatch[]
): Promise<{ kind: "cloned"; oldTemplateId: string; newTemplateId: string; originSessionId: string }> {
  const clonedId = uuid();
  const now = Date.now();

  await withTransaction(async () => {
    await db.insert(workoutTemplates).values({
      id: clonedId,
      name: `${templateName ?? "Template"} (Copy)`,
      created_at: now,
      updated_at: now,
      is_starter: 0,
      source: null,
    });

    for (const patch of patches) {
      await db.insert(templateExercises).values({
        id: uuid(),
        template_id: clonedId,
        exercise_id: patch.exerciseId,
        position: patch.position,
        target_sets: patch.newTargetSets,
        set_types: JSON.stringify(patch.newSetTypes),
        target_reps: patch.target_reps,
        rest_seconds: patch.rest_seconds,
        link_id: patch.link_id,
        link_label: patch.link_label,
        target_duration_seconds: patch.target_duration_seconds,
      });
    }

    await db
      .update(workoutSessions)
      .set({ template_id: clonedId })
      .where(eq(workoutSessions.id, sessionId));
  });

  return { kind: "cloned", oldTemplateId: templateId, newTemplateId: clonedId, originSessionId: sessionId };
}

/**
 * Returned by syncTemplateFromSession:
 * - "updated": a user-owned template was updated in place; changes holds each diff.
 * - "cloned": a starter template was cloned to a new user-owned copy; the session
 *   now points at newTemplateId and the user's edits are baked into the clone.
 * - null: no template, no sets, or no diff (nothing to do).
 */
export type TemplateSyncResult =
  | { kind: "updated"; templateId: string; changes: TemplateSyncChange[] }
  | { kind: "cloned"; oldTemplateId: string; newTemplateId: string; originSessionId: string }
  | null;

/**
 * Option A writeback: after a session is completed, sync the actual set count
 * and per-set types (warmup/failure/dropset/normal) from the session back to
 * the originating template's exercises.
 *
 * For user-owned templates: diffs and updates in-place (kind: "updated").
 * For starter/seeded templates: clones the template to a user-owned copy, applies
 * the user's edits to the clone, updates the session to point at the clone, and
 * returns kind: "cloned" so undo can delete the clone if desired.
 *
 * Sets are grouped by pushing sequentially from DB rows ordered by set_number.
 * As of BLD-1044, deleteSet() renumbers survivors so set_number is contiguous, but
 * we keep the sequential-push as defense-in-depth for any path that bypasses the
 * renumber (e.g., import-export round-trips, raw SQL repairs).
 *
 * Returns null if the session has no template_id, has no sets, or nothing changed.
 */
export async function syncTemplateFromSession(
  sessionId: string
): Promise<TemplateSyncResult> {
  const db = await getDrizzle();

  const session = await db
    .select({ template_id: workoutSessions.template_id })
    .from(workoutSessions)
    .where(eq(workoutSessions.id, sessionId))
    .get();

  if (!session?.template_id) return null;
  const templateId = session.template_id;

  const tpl = await db
    .select({
      is_starter: workoutTemplates.is_starter,
      name: workoutTemplates.name,
      source: workoutTemplates.source,
    })
    .from(workoutTemplates)
    .where(eq(workoutTemplates.id, templateId))
    .get();

  // Load all sets for the session, ordered so we can push sequentially
  const sets = await db
    .select({
      exercise_id: workoutSets.exercise_id,
      exercise_position: workoutSets.exercise_position,
      set_number: workoutSets.set_number,
      set_type: workoutSets.set_type,
    })
    .from(workoutSets)
    .where(eq(workoutSets.session_id, sessionId))
    .orderBy(asc(workoutSets.exercise_position), asc(workoutSets.set_number));

  if (sets.length === 0) return null;

  // Group session sets by (exercise_id, exercise_position) key.
  // Push sequentially from rows ordered by set_number (defense-in-depth:
  // BLD-1044 guarantees contiguous set_number after deleteSet, but we keep
  // sequential-push for paths that bypass the renumber, e.g. import-export).
  type SessionGroup = { exerciseId: string; position: number; setTypes: SetType[] };
  const sessionGroups = new Map<string, SessionGroup>();
  for (const s of sets) {
    const key = `${s.exercise_id}::${s.exercise_position ?? 0}`;
    if (!sessionGroups.has(key)) {
      sessionGroups.set(key, {
        exerciseId: s.exercise_id,
        position: s.exercise_position ?? 0,
        setTypes: [],
      });
    }
    sessionGroups.get(key)!.setTypes.push((s.set_type as SetType) ?? "normal");
  }

  // ── STARTER TEMPLATE: diff first, then inline-clone if needed ─────────────
  if (tpl?.is_starter === 1) {
    // Load the original starter's exercises to compute the diff
    const origExercises = await db
      .select({
        id: templateExercises.id,
        exercise_id: templateExercises.exercise_id,
        position: templateExercises.position,
        target_sets: templateExercises.target_sets,
        set_types: templateExercises.set_types,
        target_reps: templateExercises.target_reps,
        rest_seconds: templateExercises.rest_seconds,
        link_id: templateExercises.link_id,
        link_label: templateExercises.link_label,
        target_duration_seconds: templateExercises.target_duration_seconds,
      })
      .from(templateExercises)
      .where(eq(templateExercises.template_id, templateId));

    const { patches, anyChange } = computeStarterPatches(origExercises, sessionGroups);
    if (!anyChange) return null;

    return cloneStarterTemplate(db, templateId, tpl.name, sessionId, patches);
  }

  // ── USER-OWNED TEMPLATE: diff and update in-place ─────────────────────────
  const tplExercises = await db
    .select({
      id: templateExercises.id,
      exercise_id: templateExercises.exercise_id,
      position: templateExercises.position,
      target_sets: templateExercises.target_sets,
      set_types: templateExercises.set_types,
    })
    .from(templateExercises)
    .where(eq(templateExercises.template_id, templateId));

  const changes: TemplateSyncChange[] = [];

  await withTransaction(async () => {
    for (const te of tplExercises) {
      const key = `${te.exercise_id}::${te.position}`;
      const sessionGroup = sessionGroups.get(key);
      if (!sessionGroup) continue;

      const newTargetSets = sessionGroup.setTypes.length;
      const newSetTypes = normalizeTemplateSetTypes(sessionGroup.setTypes, newTargetSets);
      const oldTargetSets = te.target_sets ?? 3;
      const oldSetTypes = parseTemplateSetTypes(te.set_types, oldTargetSets);

      const setsChanged = newTargetSets !== oldTargetSets;
      const typesChanged = newSetTypes.some((t, i) => t !== oldSetTypes[i]) || newSetTypes.length !== oldSetTypes.length;
      if (!setsChanged && !typesChanged) continue;

      await db
        .update(templateExercises)
        .set({ target_sets: newTargetSets, set_types: JSON.stringify(newSetTypes) })
        .where(eq(templateExercises.id, te.id));

      changes.push({ templateExerciseId: te.id, oldTargetSets, oldSetTypes, newTargetSets, newSetTypes });
    }

    if (changes.length > 0) {
      await db
        .update(workoutTemplates)
        .set({ updated_at: Date.now() })
        .where(eq(workoutTemplates.id, templateId));
    }
  });

  if (changes.length === 0) return null;
  return { kind: "updated", templateId, changes };
}

/**
 * Undo the template writeback performed by syncTemplateFromSession.
 *
 * For kind="updated": re-reads each changed exercise row and verifies it still
 *   matches the newTargetSets/newSetTypes snapshot from the sync. If any row has
 *   since been updated (another session synced on top), returns { blocked: true }
 *   and performs no writes. Otherwise rolls back all rows atomically in a single
 *   transaction.
 * For kind="cloned": deletes the clone (if no other sessions reference it) and
 *   restores the session's template_id to the original starter. Returns
 *   { blocked: true } if another session already uses the clone.
 */
export async function undoTemplateSyncFromSession(
  result: TemplateSyncResult
): Promise<{ blocked: true } | undefined> {
  if (!result) return;
  const db = await getDrizzle();

  if (result.kind === "updated") {
    // Run the pre-check reads and the rollback writes inside a single transaction
    // so no concurrent session can slip a write between our snapshot comparison
    // and our rollback. If any row has drifted we abort without writing anything
    // (all-or-nothing).
    let blocked = false;
    await withTransaction(async () => {
      // Phase 1 — verify every changed row still matches the sync snapshot.
      for (const change of result.changes) {
        const current = await db
          .select({ target_sets: templateExercises.target_sets, set_types: templateExercises.set_types })
          .from(templateExercises)
          .where(eq(templateExercises.id, change.templateExerciseId))
          .get();

        const currentSets = current?.target_sets ?? 0;
        const currentTypes = current?.set_types ?? "[]";
        if (
          !current ||
          currentSets !== change.newTargetSets ||
          currentTypes !== JSON.stringify(change.newSetTypes)
        ) {
          blocked = true;
          return; // exit callback — transaction commits empty (no writes)
        }
      }

      // Phase 2 — all rows match; roll back to old values.
      for (const change of result.changes) {
        await db
          .update(templateExercises)
          .set({ target_sets: change.oldTargetSets, set_types: JSON.stringify(change.oldSetTypes) })
          .where(eq(templateExercises.id, change.templateExerciseId));
      }
      await db
        .update(workoutTemplates)
        .set({ updated_at: Date.now() })
        .where(eq(workoutTemplates.id, result.templateId));
    });
    if (blocked) return { blocked: true };
    return;
  }

  // kind === "cloned": check if any other session references the clone before deleting
  const otherSessions = await db
    .select({ id: workoutSessions.id })
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.template_id, result.newTemplateId),
        sql`${workoutSessions.id} != ${result.originSessionId}`
      )
    );

  if (otherSessions.length > 0) {
    return { blocked: true };
  }

  // Safe to delete the clone
  await withTransaction(async () => {
    await db.delete(templateExercises).where(eq(templateExercises.template_id, result.newTemplateId));
    await db.delete(workoutTemplates).where(eq(workoutTemplates.id, result.newTemplateId));
  });

  // Restore the session to the original starter template
  await db
    .update(workoutSessions)
    .set({ template_id: result.oldTemplateId })
    .where(eq(workoutSessions.id, result.originSessionId));
}
