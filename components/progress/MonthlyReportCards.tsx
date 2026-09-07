import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { useThemeColors } from "@/hooks/useThemeColors";
import { spacing, fontSizes } from "@/constants/design-tokens";
import { formatDuration } from "@/lib/format";
import { toDisplay } from "@/lib/units";
import { MUSCLE_LABELS } from "@/lib/types";
import type { MonthlyReportData } from "@/lib/db";
import { formatVolume } from "@/hooks/useMonthlyReport";
import { t } from "@lingui/core/macro";
import { i18n } from "@lingui/core";

// ─── Stat Pill ─────────────────────────────────────────────────────

function StatValue({
  label,
  value,
  delta,
  unit,
}: {
  label: string;
  value: string;
  delta?: string | null;
  unit?: string;
}) {
  const colors = useThemeColors();
  const deltaColor = delta?.startsWith("+") ? colors.primary : delta?.startsWith("-") ? colors.error : colors.onSurfaceVariant;

  return (
    <View
      style={styles.statItem}
       accessibilityLabel={i18n._({ id: "components.progress.monthlyReport.statA11y", message: "{label}: {value}{unit, select, none {} other { {unit}}}{delta, select, none {} other {, {delta} compared to last month}}", values: { label, value, unit: unit || "none", delta: delta || "none" } })}
    >
      <Text style={[styles.statLabel, { color: colors.onSurfaceVariant }]}>{label}</Text>
      <Text style={[styles.statValue, { color: colors.onSurface }]}>
        {value}{unit ? ` ${unit}` : ""}
      </Text>
      {delta != null && (
        <Text style={[styles.statDelta, { color: deltaColor }]}>{delta}</Text>
      )}
    </View>
  );
}

// ─── Hero Stats ────────────────────────────────────────────────────

export function HeroStatsCard({
  data,
  unit,
  volChange,
  sessionDelta,
}: {
  data: MonthlyReportData;
  unit: "kg" | "lb";
  volChange: string | null;
  sessionDelta: string | null;
}) {
  const { workouts } = data;
  const vol = formatVolume(toDisplay(workouts.totalVolume, unit));

  return (
    <Card>
      <CardContent style={styles.heroContainer}>
        <StatValue
           label={t({ id: "components.progress.monthlyReport.workouts", message: "Workouts" })}
          value={String(workouts.sessionCount)}
          delta={sessionDelta}
        />
        <StatValue
           label={t({ id: "components.progress.monthlyReport.volume", message: "Volume" })}
          value={vol}
          unit={unit}
          delta={volChange}
        />
        <StatValue
           label={t({ id: "components.progress.monthlyReport.duration", message: "Duration" })}
          value={formatDuration(workouts.totalDurationSeconds)}
        />
      </CardContent>
    </Card>
  );
}

// ─── Consistency ───────────────────────────────────────────────────

export function ConsistencyCard({
  trainingDays,
  longestStreak,
  daysInMonth,
}: {
  trainingDays: number;
  longestStreak: number;
  daysInMonth: number;
}) {
  const colors = useThemeColors();

  return (
    <Card>
      <CardContent>
        <Text
          style={[styles.sectionTitle, { color: colors.onSurface }]}
          accessibilityRole="header"
        >
          {t({ id: "components.progress.monthlyReport.consistency", message: "Consistency" })}
        </Text>
        <View style={styles.consistencyRow}>
          <Text
            style={[styles.consistencyValue, { color: colors.onSurface }]}
             accessibilityLabel={t({ id: "components.progress.monthlyReport.trainingDaysA11y", message: `${trainingDays} out of ${daysInMonth} days trained` })}
          >
            {trainingDays}/{daysInMonth} {t({ id: "components.progress.monthlyReport.daysTrained", message: "days trained" })}
          </Text>
          <Text
            style={[styles.consistencyValue, { color: colors.onSurface }]}
             accessibilityLabel={t({ id: "components.progress.monthlyReport.bestStreakA11y", message: `Best streak: ${longestStreak} consecutive days` })}
          >
            {t({ id: "components.progress.monthlyReport.bestStreak", message: "Best streak" })}: {longestStreak} {longestStreak === 1 ? t({ id: "components.progress.monthlyReport.day", message: "day" }) : t({ id: "components.progress.monthlyReport.days", message: "days" })}
          </Text>
        </View>
      </CardContent>
    </Card>
  );
}

// ─── PRs ───────────────────────────────────────────────────────────

export function PRsCard({
  prs,
  unit,
}: {
  prs: MonthlyReportData["prs"];
  unit: "kg" | "lb";
}) {
  const colors = useThemeColors();
  if (prs.length === 0) return null;

  return (
    <Card>
      <CardContent>
        <Text
          style={[styles.sectionTitle, { color: colors.onSurface }]}
          accessibilityRole="header"
        >
          {t({ id: "components.progress.monthlyReport.prsThisMonth", message: "PRs This Month" })}
        </Text>
        {prs.slice(0, 5).map((pr) => (
          <View
            key={pr.exerciseId}
            style={styles.prRow}
             accessibilityLabel={t({ id: "components.progress.monthlyReport.prA11y", message: `${pr.exerciseName}: ${toDisplay(pr.weight, unit)} ${unit} personal record` })}
          >
            <Text style={[styles.prName, { color: colors.onSurface }]}>
              {pr.exerciseName}
            </Text>
            <Text style={[styles.prWeight, { color: colors.primary }]}>
              {toDisplay(pr.weight, unit)} {unit}
            </Text>
          </View>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── Muscle Balance ────────────────────────────────────────────────

export function MuscleBalanceCard({
  distribution,
}: {
  distribution: MonthlyReportData["muscleDistribution"];
}) {
  const colors = useThemeColors();
  if (distribution.length === 0) return null;

  const maxSets = distribution[0]?.sets ?? 1;

  return (
    <Card>
      <CardContent>
        <Text
          style={[styles.sectionTitle, { color: colors.onSurface }]}
          accessibilityRole="header"
        >
          {t({ id: "components.progress.monthlyReport.setsByMuscle", message: "Sets by Muscle Group" })}
        </Text>
        {distribution.slice(0, 8).map((item) => {
          const pct = Math.round((item.sets / maxSets) * 100);
          const label = MUSCLE_LABELS[item.muscle] ?? item.muscle;
          return (
            <View
              key={item.muscle}
              style={styles.muscleRow}
               accessibilityLabel={t({ id: "components.progress.monthlyReport.muscleSetsA11y", message: `${label}: ${item.sets} sets` })}
            >
              <Text style={[styles.muscleLabel, { color: colors.onSurface }]}>
                {label}
              </Text>
              <View style={styles.barContainer}>
                <View
                  style={[
                    styles.bar,
                    { width: `${pct}%`, backgroundColor: colors.primary },
                  ]}
                />
              </View>
              <Text style={[styles.muscleSets, { color: colors.onSurfaceVariant }]}>
                {item.sets}
              </Text>
            </View>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ─── Most Improved ─────────────────────────────────────────────────

export function MostImprovedCard({
  data,
}: {
  data: MonthlyReportData["mostImproved"];
}) {
  const colors = useThemeColors();
  if (!data) return null;

  return (
    <Card>
      <CardContent>
        <Text
          style={[styles.sectionTitle, { color: colors.onSurface }]}
          accessibilityRole="header"
        >
          {t({ id: "components.progress.monthlyReport.mostImproved", message: "Most Improved" })}
        </Text>
        <Text
          style={[styles.improvedText, { color: colors.onSurface }]}
           accessibilityLabel={t({ id: "components.progress.monthlyReport.improvedA11y", message: `${data.exerciseName}: estimated one rep max increased by ${data.percentChange} percent` })}
        >
          {data.exerciseName}: +{data.percentChange}% e1RM
        </Text>
      </CardContent>
    </Card>
  );
}

// ─── Body ──────────────────────────────────────────────────────────

export function BodyCard({
  data,
  unit,
}: {
  data: MonthlyReportData["body"];
  unit: "kg" | "lb";
}) {
  const colors = useThemeColors();
  if (!data || data.startWeight === null || data.endWeight === null) return null;

  const start = toDisplay(data.startWeight, unit);
  const end = toDisplay(data.endWeight, unit);
  const delta = Math.round((end - start) * 10) / 10;
  const sign = delta >= 0 ? "+" : "";
  const deltaColor = delta < 0 ? colors.primary : delta > 0 ? colors.error : colors.onSurfaceVariant;

  return (
    <Card>
      <CardContent>
        <Text
          style={[styles.sectionTitle, { color: colors.onSurface }]}
          accessibilityRole="header"
        >
          {t({ id: "components.progress.monthlyReport.bodyWeight", message: "Body Weight" })}
        </Text>
        <Text
          style={[styles.bodyText, { color: colors.onSurface }]}
           accessibilityLabel={t({ id: "components.progress.monthlyReport.bodyWeightA11y", message: `Body weight changed from ${start} to ${end} ${unit}, ${sign}${delta}` })}
        >
          {start} → {end} {unit}{" "}
          <Text style={{ color: deltaColor }}>({sign}{delta})</Text>
        </Text>
      </CardContent>
    </Card>
  );
}

// ─── Nutrition ─────────────────────────────────────────────────────

export function NutritionCard({
  data,
}: {
  data: MonthlyReportData["nutrition"];
}) {
  const colors = useThemeColors();
  if (!data) return null;

  return (
    <Card>
      <CardContent>
        <Text
          style={[styles.sectionTitle, { color: colors.onSurface }]}
          accessibilityRole="header"
        >
          {t({ id: "components.progress.monthlyReport.nutrition", message: "Nutrition" })}
        </Text>
        <Text
          style={[styles.nutritionText, { color: colors.onSurface }]}
           accessibilityLabel={t({ id: "components.progress.monthlyReport.nutritionA11y", message: `${data.daysOnTarget} out of ${data.daysTracked} tracked days on calorie target` })}
        >
           {t({ id: "components.progress.monthlyReport.daysOnTarget", message: `${data.daysOnTarget}/${data.daysTracked} days on target` })}
        </Text>
      </CardContent>
    </Card>
  );
}

// ─── Styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  heroContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  statItem: {
    alignItems: "center",
    gap: spacing.xxs,
  },
  statLabel: {
    fontSize: fontSizes.sm,
    fontWeight: "500",
  },
  statValue: {
    fontSize: fontSizes.xl,
    fontWeight: "700",
  },
  statDelta: {
    fontSize: fontSizes.sm,
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  consistencyRow: {
    gap: spacing.xs,
  },
  consistencyValue: {
    fontSize: fontSizes.base,
  },
  prRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  prName: {
    fontSize: fontSizes.base,
    flex: 1,
  },
  prWeight: {
    fontSize: fontSizes.base,
    fontWeight: "700",
  },
  muscleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  muscleLabel: {
    width: 80,
    fontSize: fontSizes.sm,
  },
  barContainer: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    backgroundColor: "rgba(128,128,128,0.15)",
    overflow: "hidden",
  },
  bar: {
    height: "100%",
    borderRadius: 6,
  },
  muscleSets: {
    width: 30,
    textAlign: "right",
    fontSize: fontSizes.sm,
  },
  improvedText: {
    fontSize: fontSizes.base,
  },
  bodyText: {
    fontSize: fontSizes.base,
  },
  nutritionText: {
    fontSize: fontSizes.base,
  },
});
