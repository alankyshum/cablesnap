import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { getBodySettings, getLatestBodyWeight } from "../lib/db/body";
import { getStrengthLevel, type StrengthResult } from "../lib/strength-standards";
import { toKg } from "../lib/units";
import type { Sex } from "../lib/nutrition-calc";

export type StrengthLevelData = StrengthResult & {
  bodyWeightKg: number;
  e1rmKg: number;
  gender: Sex;
};

/**
 * Computes the strength level for a given exercise, combining e1RM with
 * the user's latest body weight and gender from settings.
 *
 * Returns null when any required data is missing (no body weight, no e1RM,
 * exercise not in standards table, or gender not set).
 */
export function useStrengthLevel(
  exerciseName: string | undefined,
  e1rm: number | null,
  unit: "kg" | "lb",
): StrengthLevelData | null {
  const [result, setResult] = useState<StrengthLevelData | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!exerciseName || e1rm == null || e1rm <= 0) {
        setResult(null);
        return;
      }

      (async () => {
        try {
          const [settings, latestBW] = await Promise.all([
            getBodySettings(),
            getLatestBodyWeight(),
          ]);

          if (!latestBW || latestBW.weight <= 0) {
            setResult(null);
            return;
          }

          const gender = settings.sex as Sex;
          if (gender !== "male" && gender !== "female") {
            setResult(null);
            return;
          }

          const bodyWeightKg = toKg(latestBW.weight, settings.weight_unit as "kg" | "lb");
          const e1rmKg = toKg(e1rm, unit);

          const level = getStrengthLevel(exerciseName, gender, bodyWeightKg, e1rmKg);
          if (!level) {
            setResult(null);
            return;
          }

          setResult({ ...level, bodyWeightKg, e1rmKg, gender });
        } catch {
          setResult(null);
        }
      })();
    }, [exerciseName, e1rm, unit]),
  );

  return result;
}
