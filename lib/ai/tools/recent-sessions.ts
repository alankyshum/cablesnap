import { tool } from "ai";
import { z } from "zod";
import { getCompletedSessionsWithSetCount } from "../../db/session-stats";
import { boundedLimit, recoverLocal } from "./result";

/** Sends session id, name, start/completion timestamps, duration, rating, and completed-set count. */
export const recentSessionsTool = tool({
  description: "Read the user's most recent completed local workout sessions.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(10).default(5),
  }),
  execute: ({ limit }) => recoverLocal(async () => {
    const rows = await getCompletedSessionsWithSetCount(boundedLimit(limit, 5, 10));
    return rows.map(({ id, name, started_at, completed_at, duration_seconds, rating, set_count }) => ({
      id, name, started_at, completed_at, duration_seconds, rating, set_count,
    }));
  }),
});
