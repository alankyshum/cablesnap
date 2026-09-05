/* eslint-disable @typescript-eslint/no-explicit-any */
const mockGetAllExercises = jest.fn();
const mockCreateTemplateWithExercises = jest.fn();

jest.mock("@/lib/db/exercises", () => ({
  getAllExercises: (...args: unknown[]) => mockGetAllExercises(...args),
}));

jest.mock("@/lib/db/templates", () => ({
  createTemplateWithExercises: (...args: unknown[]) => mockCreateTemplateWithExercises(...args),
}));

import { createWorkoutTemplateTool } from "@/lib/ai/tools/create-workout-template";

const execute = (input: unknown) => (createWorkoutTemplateTool as any).execute(input);

describe("create workout template tool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAllExercises.mockResolvedValue([
      { id: "squat-id", name: "Back Squat" },
      { id: "bench-id", name: "Bench Press" },
    ]);
  });

  it("resolves exercise names and creates the complete template", async () => {
    mockCreateTemplateWithExercises.mockResolvedValue({ id: "template-id", name: "Strength A" });

    await expect(execute({
      name: "Strength A",
      exercises: [
        { exerciseName: "back squat", targetSets: 4, targetReps: "5", restSeconds: 180 },
        { exerciseName: "Bench Press", targetSets: 3, targetReps: "8-10", restSeconds: 120 },
      ],
    })).resolves.toEqual({
      ok: true,
      data: {
        templateId: "template-id",
        name: "Strength A",
        exerciseCount: 2,
        exercises: [
          { name: "Back Squat", targetSets: 4, targetReps: "5", restSeconds: 180 },
          { name: "Bench Press", targetSets: 3, targetReps: "8-10", restSeconds: 120 },
        ],
      },
    });
    expect(mockCreateTemplateWithExercises).toHaveBeenCalledWith("Strength A", [
      { exerciseId: "squat-id", targetSets: 4, targetReps: "5", restSeconds: 180 },
      { exerciseId: "bench-id", targetSets: 3, targetReps: "8-10", restSeconds: 120 },
    ]);
  });

  it("does not write when an exercise name cannot be resolved", async () => {
    await expect(execute({
      name: "Strength A",
      exercises: [{ exerciseName: "Unknown Lift", targetSets: 3, targetReps: "8", restSeconds: 90 }],
    })).resolves.toEqual({
      ok: false,
      error: {
        kind: "exercise_not_found",
        message: "Exercise “Unknown Lift” was not found in the local exercise library.",
        exerciseName: "Unknown Lift",
      },
    });
    expect(mockCreateTemplateWithExercises).not.toHaveBeenCalled();
  });

  it("returns a safe failure when the atomic write fails", async () => {
    mockCreateTemplateWithExercises.mockRejectedValue(new Error("SQLite failure"));

    await expect(execute({
      name: "Strength A",
      exercises: [{ exerciseName: "Back Squat", targetSets: 3, targetReps: "8", restSeconds: 90 }],
    })).resolves.toEqual({
      ok: false,
      error: { kind: "template_creation_failed", message: "The workout template could not be created." },
    });
  });

  it("does not write when an exercise name is ambiguous", async () => {
    mockGetAllExercises.mockResolvedValue([
      { id: "bench-1", name: "Bench Press" },
      { id: "bench-2", name: "bench press" },
    ]);

    await expect(execute({
      name: "Strength A",
      exercises: [{ exerciseName: "Bench Press", targetSets: 3, targetReps: "8", restSeconds: 90 }],
    })).resolves.toEqual({
      ok: false,
      error: {
        kind: "ambiguous_exercise",
        message: "Multiple exercises are named “Bench Press”. Ask the user which one to use.",
        exerciseName: "Bench Press",
      },
    });
    expect(mockCreateTemplateWithExercises).not.toHaveBeenCalled();
  });
});
