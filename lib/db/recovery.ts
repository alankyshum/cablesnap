import type { MuscleGroup } from "../types";
import { query } from "./helpers";

export type RecoveryStatus = "recovered" | "partial" | "fatigued" | "no_data";

export type MuscleRecoveryStatus = {
  muscle: MuscleGroup;
  lastTrainedAt: number | null;
  hoursAgo: number | null;
  status: RecoveryStatus;
};

export const RECOVERY_HOURS: Record<string, number> = {
  quads: 72,
  hamstrings: 72,
  glutes: 72,
  lats: 72,
  traps: 72,
  back: 72,
  chest: 48,
  shoulders: 48,
  biceps: 36,
  triceps: 36,
  forearms: 36,
  calves: 36,
  core: 36,
};
const DEFAULT_RECOVERY_HOURS = 48;

type RecoveryRow = {
  exercise_id: string;
  primary_muscles: string;
  completed_at: number;
};

const ALL_TRACKABLE_MUSCLES: MuscleGroup[] = [
  "chest", "back", "shoulders", "biceps", "triceps",
  "quads", "hamstrings", "glutes", "calves", "core",
  "forearms", "traps", "lats",
];

function getRecoveryThreshold(muscle: string): number {
  return RECOVERY_HOURS[muscle] ?? DEFAULT_RECOVERY_HOURS;
}

function classifyRecovery(hoursAgo: number, thresholdHours: number): RecoveryStatus {
  const ratio = hoursAgo / thresholdHours;
  if (ratio >= 1) return "recovered";
  if (ratio >= 0.5) return "partial";
  return "fatigued";
}

export async function getMuscleRecoveryStatus(): Promise<MuscleRecoveryStatus[]> {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const rows = await query<RecoveryRow>(
    `SELECT ws.exercise_id, e.primary_muscles, s.completed_at
     FROM workout_sets ws
     JOIN workout_sessions s ON s.id = ws.session_id
     JOIN exercises e ON e.id = ws.exercise_id
     WHERE s.completed_at IS NOT NULL
       AND s.completed_at >= ?
     ORDER BY s.completed_at DESC`,
    [sevenDaysAgo]
  );

  const latestByMuscle = new Map<MuscleGroup, number>();

  for (const row of rows) {
    const muscles: MuscleGroup[] = JSON.parse(row.primary_muscles);
    if (muscles.includes("full_body")) continue;

    for (const m of muscles) {
      const existing = latestByMuscle.get(m);
      if (!existing || row.completed_at > existing) {
        latestByMuscle.set(m, row.completed_at);
      }
    }
  }

  const now = Date.now();

  return ALL_TRACKABLE_MUSCLES.map((muscle) => {
    const lastTrainedAt = latestByMuscle.get(muscle) ?? null;
    if (!lastTrainedAt) return { muscle, lastTrainedAt: null, hoursAgo: null, status: "no_data" as const };

    const hoursAgo = (now - lastTrainedAt) / (1000 * 60 * 60);
    const threshold = getRecoveryThreshold(muscle);
    return { muscle, lastTrainedAt, hoursAgo, status: classifyRecovery(hoursAgo, threshold) };
  });
}
