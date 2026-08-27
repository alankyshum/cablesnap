import type { CoachTools } from "../agent";
import { exerciseHistoryTool } from "./exercise-history";
import { nutritionMacrosTool } from "./nutrition-macros";
import { recentSessionsTool } from "./recent-sessions";
import { createWorkoutTemplateTool } from "./create-workout-template";

/** The complete local-data tool surface passed to CoachAgentOptions.tools. */
export const coachTools: CoachTools = {
  recent_sessions: recentSessionsTool,
  exercise_history: exerciseHistoryTool,
  nutrition_macros: nutritionMacrosTool,
  create_workout_template: createWorkoutTemplateTool,
};

export { createWorkoutTemplateTool, exerciseHistoryTool, nutritionMacrosTool, recentSessionsTool };
export type { ToolFailure, ToolResult, ToolSuccess } from "./result";
