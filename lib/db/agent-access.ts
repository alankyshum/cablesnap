import { inArray, isNull, and } from "drizzle-orm";
import { validateAgentTemplateProposal, type AgentTemplateProposal } from "@/shared/agent-access";
import { uuid } from "../uuid";
import { getDrizzle, withTransaction } from "./helpers";
import { exercises, templateExercises, workoutTemplates } from "./schema";

export async function importAgentTemplate(value: AgentTemplateProposal): Promise<string> {
  const validation = validateAgentTemplateProposal(value);
  if (!validation.success) throw new Error(validation.error);
  const proposal = validation.data.template;
  const db = await getDrizzle();
  const exerciseIds = proposal.exercises.map((exercise) => exercise.exerciseId);
  const found = await db.select({ id: exercises.id }).from(exercises)
    .where(and(inArray(exercises.id, exerciseIds), isNull(exercises.deleted_at))).all();
  if (new Set(found.map((row) => row.id)).size !== new Set(exerciseIds).size) {
    throw new Error("One or more proposed exercises are not in your library.");
  }
  const templateId = uuid();
  const now = Date.now();
  await withTransaction(async () => {
    await db.insert(workoutTemplates).values({
      id: templateId,
      name: proposal.name,
      created_at: now,
      updated_at: now,
      is_starter: 0,
      is_curated: 0,
      source: null,
    });
    for (const [position, exercise] of proposal.exercises.entries()) {
      await db.insert(templateExercises).values({
        id: uuid(),
        template_id: templateId,
        exercise_id: exercise.exerciseId,
        position,
        target_sets: exercise.targetSets,
        target_reps: exercise.targetReps,
        rest_seconds: exercise.restSeconds,
        set_types: JSON.stringify(Array.from({ length: exercise.targetSets }, () => "normal")),
      });
    }
  });
  return templateId;
}
