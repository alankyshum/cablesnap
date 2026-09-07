import { tool } from "ai";
import { z } from "zod";
import { getExerciseHistory } from "../../db/exercise-history";
import { getExercise1RMChartData } from "../../db/exercise-history";
import { boundedLimit, recoverLocal } from "./result";

/** Sends exercise id, session date, set count, reps, volume, max weight, average RPE, and cached e1RM trend points. */
export const exerciseHistoryTool = tool({
  description: "Read recent completed local history for one exercise, including performance trend data.",
  inputSchema: z.object({
    exerciseId: z.string().min(1).max(100),
    limit: z.number().int().min(1).max(10).default(5),
  }),
  execute: ({ exerciseId, limit }) => recoverLocal(async () => {
    const rows = await getExerciseHistory(exerciseId, limit);
    const e1rmTrend = await getExercise1RMChartData(exerciseId, boundedLimit(limit, 5, 10));
    return {
      history: rows.map(({ session_id, session_name, started_at, max_weight, max_reps, total_reps, set_count, volume, avg_rpe }) => ({
        session_id, session_name, started_at, max_weight, max_reps, total_reps, set_count, volume, avg_rpe,
      })),
      e1rmTrend,
    };
  }),
});
