import type { CoachTools } from "../agent";
import { exerciseHistoryTool } from "./exercise-history";
import { nutritionMacrosTool } from "./nutrition-macros";
import { recentSessionsTool } from "./recent-sessions";
import { createWorkoutTemplateTool } from "./create-workout-template";
import { createGymPhotoWorkoutDraftTools } from "./gym-photo-workout-draft";

/** The complete local-data tool surface passed to CoachAgentOptions.tools. */
export const coachTools: CoachTools = {
  recent_sessions: recentSessionsTool,
  exercise_history: exerciseHistoryTool,
  nutrition_macros: nutritionMacrosTool,
  create_workout_template: createWorkoutTemplateTool,
  ...createGymPhotoWorkoutDraftTools(""),
};

export function coachToolsForSession(sessionId: string): CoachTools {
  return { ...coachTools, ...createGymPhotoWorkoutDraftTools(sessionId) };
}

export { createWorkoutTemplateTool, exerciseHistoryTool, nutritionMacrosTool, recentSessionsTool };
export { createGymPhotoWorkoutDraftTools } from "./gym-photo-workout-draft";
export type { ToolFailure, ToolResult, ToolSuccess } from "./result";
