/**
 * BLD-1126: useActiveCalibration — fetch calibrated stacks for a gym.
 *
 * Returns the exact shape MarkerPickerSheet already consumes:
 *   Array<CableStackRow & { calibrations: StackCalibrationRow[] }>
 *
 * react-query key: ['stack-calibrations', gymId]
 * Stale time: 60 s (global default). Cache invalidation is wired in
 * app/settings/gym-profiles.tsx after every calibration/stack mutation.
 *
 * When gymId is null or undefined (session has no gym), returns [].
 */
import { useQuery } from "@tanstack/react-query";
import type { CableStackRow, StackCalibrationRow } from "@/lib/db/schema";
import { getDatabase } from "@/lib/db/helpers";

export type StackWithCalibrations = CableStackRow & { calibrations: StackCalibrationRow[] };

export async function fetchStacksWithCalibrations(gymId: string): Promise<StackWithCalibrations[]> {
  const db = await getDatabase();
  const stacks = await db.getAllAsync<CableStackRow>(
    "SELECT * FROM cable_stacks WHERE gym_id = ? AND deleted_at IS NULL ORDER BY position ASC, name ASC",
    [gymId]
  );
  if (stacks.length === 0) return [];

  const calibrations = await db.getAllAsync<StackCalibrationRow>(
    `SELECT * FROM stack_calibrations WHERE stack_id IN (${stacks.map(() => "?").join(",")}) ORDER BY marker ASC`,
    stacks.map((s) => s.id)
  );

  const calByStack: Record<string, StackCalibrationRow[]> = {};
  for (const cal of calibrations) {
    if (!calByStack[cal.stack_id]) calByStack[cal.stack_id] = [];
    calByStack[cal.stack_id].push(cal);
  }

  return stacks.map((stack) => ({
    ...stack,
    calibrations: calByStack[stack.id] ?? [],
  }));
}

export function useActiveCalibration(gymId: string | null | undefined): StackWithCalibrations[] {
  const { data } = useQuery({
    queryKey: ["stack-calibrations", gymId ?? null],
    queryFn: () => (gymId ? fetchStacksWithCalibrations(gymId) : Promise.resolve([])),
    enabled: !!gymId,
  });
  return data ?? [];
}
