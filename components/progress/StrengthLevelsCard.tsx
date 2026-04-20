import { useCallback, useState } from "react";
import { StyleSheet, useColorScheme, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { getStrengthOverview } from "@/lib/db";
import { getBodySettings, getLatestBodyWeight } from "@/lib/db/body";
import { getStrengthLevel, matchExercise, type StrengthLevel, type StrengthResult } from "@/lib/strength-standards";
import { toKg, toDisplay } from "@/lib/units";
import { STRENGTH_LEVEL_COLORS } from "@/constants/theme";
import { fontSizes } from "@/constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { Sex } from "@/lib/nutrition-calc";

type LevelRow = StrengthResult & {
  name: string;
  e1rmKg: number;
};

const LEVEL_LABELS: Record<StrengthLevel, string> = {
  beginner: "Beginner",
  novice: "Novice",
  intermediate: "Intermediate",
  advanced: "Advanced",
  elite: "Elite",
};

export default function StrengthLevelsCard({ style }: { style?: object }) {
  const colors = useThemeColors();
  const scheme = useColorScheme();
  const palette = scheme === "dark" ? STRENGTH_LEVEL_COLORS.dark : STRENGTH_LEVEL_COLORS.light;
  const [rows, setRows] = useState<LevelRow[]>([]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const [settings, latestBW, overview] = await Promise.all([
            getBodySettings(),
            getLatestBodyWeight(),
            getStrengthOverview(),
          ]);

          if (!latestBW || latestBW.weight <= 0) { setRows([]); return; }
          const gender = settings.sex as Sex;
          if (gender !== "male" && gender !== "female") { setRows([]); return; }
          const weightUnit = settings.weight_unit as "kg" | "lb";
          const bodyWeightKg = toKg(latestBW.weight, weightUnit);

          const levels: LevelRow[] = [];
          for (const row of overview) {
            if (!matchExercise(row.name)) continue;
            const e1rmKg = toKg(row.est_1rm, weightUnit);
            const result = getStrengthLevel(row.name, gender, bodyWeightKg, e1rmKg);
            if (result) {
              levels.push({ ...result, name: row.name, e1rmKg });
            }
          }

          setRows(levels);
        } catch {
          setRows([]);
        }
      })();
    }, []),
  );

  if (rows.length === 0) return null;

  return (
    <Card style={style}>
      <CardContent>
        <Text variant="title" style={[styles.title, { color: colors.onSurface }]}>
          Strength Levels
        </Text>
        {rows.map((row) => {
          const badgeColor = palette[row.level];
          const nextHint = row.nextLevel && row.nextThresholdKg != null
            ? `→ ${LEVEL_LABELS[row.nextLevel]} at ${Math.round(row.e1rmKg > 0 ? toDisplay(row.nextThresholdKg, "kg") : 0)} kg`
            : null;
          const a11yLabel = `${row.name}: ${LEVEL_LABELS[row.level]}${nextHint ? `. ${nextHint}` : ""}`;

          return (
            <View key={row.name} style={styles.row} accessibilityLabel={a11yLabel}>
              <Text
                variant="body"
                style={[styles.exerciseName, { color: colors.onSurface }]}
                numberOfLines={1}
              >
                {row.name}
              </Text>
              <View style={[styles.badge, { backgroundColor: badgeColor.bg }]}>
                <Text style={[styles.badgeText, { color: badgeColor.text }]}>
                  {LEVEL_LABELS[row.level]}
                </Text>
              </View>
            </View>
          );
        })}
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  exerciseName: {
    flex: 1,
    marginRight: 8,
    fontSize: fontSizes.sm,
  },
  badge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: fontSizes.xs,
    fontWeight: "600",
  },
});
