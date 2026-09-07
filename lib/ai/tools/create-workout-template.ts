import { tool } from "ai";
import { z } from "zod";
import { getAllExercises } from "../../db/exercises";
import { createTemplateWithExercises } from "../../db/templates";

const exerciseInputSchema = z.object({
  exerciseName: z.string().trim().min(1).max(100),
  targetSets: z.number().int().min(1).max(20).default(3),
  targetReps: z.string().trim().min(1).max(40).default("8-12"),
  restSeconds: z.number().int().min(15).max(600).default(90),
});

export type CreateWorkoutTemplateResult =
  | {
      ok: true;
      data: {
        templateId: string;
        name: string;
        exerciseCount: number;
        exercises: Array<{ name: string; targetSets: number; targetReps: string; restSeconds: number }>;
      };
    }
  | {
      ok: false;
      error: {
        kind: "exercise_not_found" | "ambiguous_exercise" | "template_creation_failed";
        message: string;
        exerciseName?: string;
      };
    };

const normalizedName = (name: string) => name.trim().toLocaleLowerCase();

export const createWorkoutTemplateTool = tool({
  description: "Create and save a workout template in the user's local library when they explicitly ask for one. Exercise names must exactly match exercises in their library.",
  inputSchema: z.object({
    name: z.string().trim().min(1).max(100),
    exercises: z.array(exerciseInputSchema).min(1).max(30),
  }),
  execute: async ({ name, exercises }): Promise<CreateWorkoutTemplateResult> => {
    try {
      const available = await getAllExercises();
      const resolved = exercises.map((input) => ({
        input,
        matches: available.filter((exercise) => normalizedName(exercise.name) === normalizedName(input.exerciseName)),
      }));
      const ambiguous = resolved.find(({ matches }) => matches.length > 1);
      if (ambiguous) return {
        ok: false,
        error: {
          kind: "ambiguous_exercise",
          message: `Multiple exercises are named “${ambiguous.input.exerciseName}”. Ask the user which one to use.`,
          exerciseName: ambiguous.input.exerciseName,
        },
      };
      const missing = resolved.find(({ matches }) => matches.length === 0);
      if (missing) return {
        ok: false,
        error: {
          kind: "exercise_not_found",
          message: `Exercise “${missing.input.exerciseName}” was not found in the local exercise library.`,
          exerciseName: missing.input.exerciseName,
        },
      };

      const template = await createTemplateWithExercises(name, resolved.map(({ input, matches }) => ({
        exerciseId: matches[0].id,
        targetSets: input.targetSets,
        targetReps: input.targetReps,
        restSeconds: input.restSeconds,
      })));
      return {
        ok: true,
        data: {
          templateId: template.id,
          name: template.name,
          exerciseCount: exercises.length,
          exercises: resolved.map(({ input, matches }) => ({
            name: matches[0].name,
            targetSets: input.targetSets,
            targetReps: input.targetReps,
            restSeconds: input.restSeconds,
          })),
        },
      };
    } catch {
      return {
        ok: false,
        error: { kind: "template_creation_failed", message: "The workout template could not be created." },
      };
    }
  },
});
