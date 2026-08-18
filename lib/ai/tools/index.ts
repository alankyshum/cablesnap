import type { CoachTools } from "../agent";
import { exerciseHistoryTool } from "./exercise-history";
import { nutritionMacrosTool } from "./nutrition-macros";
import { recentSessionsTool } from "./recent-sessions";

/** The complete local-data tool surface passed to CoachAgentOptions.tools. */
export const coachTools: CoachTools = {
  recent_sessions: recentSessionsTool,
  exercise_history: exerciseHistoryTool,
  nutrition_macros: nutritionMacrosTool,
};

export { exerciseHistoryTool, nutritionMacrosTool, recentSessionsTool };
export type { ToolFailure, ToolResult, ToolSuccess } from "./result";
