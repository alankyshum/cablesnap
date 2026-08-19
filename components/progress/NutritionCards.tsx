import { StyleSheet, View } from "react-native";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { LineChart } from "@/components/charts";
import { useThemeColors } from "@/hooks/useThemeColors";
import { semantic } from "../../constants/theme";
import type { DailyNutritionTotal, WeeklyNutritionAverage, NutritionAdherence } from "../../lib/db";
import { fontSizes } from "@/constants/design-tokens";
import { t } from "@lingui/core/macro";
import { i18n } from "@lingui/core";

// ─── Calorie Trend Card ────────────────────────────────────────────

type CalorieTrendCardProps = {
  dailyTotals: DailyNutritionTotal[];
  calorieTarget: number | null;
  chartWidth: number;
  style?: object;
};

export function CalorieTrendCard({
  dailyTotals,
  calorieTarget,
  chartWidth,
  style,
}: CalorieTrendCardProps) {
  const colors = useThemeColors();

  const chartData = dailyTotals.map((d, i) => ({
    x: i,
    calories: d.calories,
    target: calorieTarget ?? 0,
  }));

  const avgCalories = dailyTotals.length > 0
    ? Math.round(dailyTotals.reduce((s, d) => s + d.calories, 0) / dailyTotals.length)
    : 0;

  const summaryLabel = calorieTarget
    ? t({ id: "components.progress.nutritionCards.calorieSummaryTarget", message: `Calorie trend: averaging ${avgCalories} calories over ${dailyTotals.length} days, target is ${calorieTarget}` })
    : t({ id: "components.progress.nutritionCards.calorieSummary", message: `Calorie trend: averaging ${avgCalories} calories over ${dailyTotals.length} days` });

  return (
    <Card style={[styles.card, style]}>
      <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 12 }}>
        {t({ id: "components.progress.nutritionCards.calorieTrend", message: "Calorie Trend" })}
      </Text>
      <View
        style={{ width: chartWidth, height: 180 }}
        accessibilityRole="image"
        accessibilityLabel={summaryLabel}
      >
        {chartData.length >= 2 ? (
          <LineChart
            labels={dailyTotals.map((d) => d.date)}
            series={[
              {
                key: "calories",
                values: chartData.map((d) => d.calories),
                color: colors.primary,
                strokeWidth: 2,
                curve: "natural",
              },
              ...(calorieTarget !== null
                ? [{
                    key: "target",
                    values: chartData.map((d) => d.target),
                    color: colors.outline,
                    strokeWidth: 1,
                    curve: "linear" as const,
                  }]
                : []),
            ]}
            padding={{ left: 10, right: 10 }}
            height={180}
            width={chartWidth}
          />
        ) : (
          <View style={styles.chartEmpty}>
            <Text style={{ color: colors.onSurfaceVariant, textAlign: "center" }}>
              {t({ id: "components.progress.nutritionCards.chartMinimum", message: "Need at least 2 days of data for chart" })}
            </Text>
          </View>
        )}
      </View>
    </Card>
  );
}

// ─── Weekly Averages Card ──────────────────────────────────────────

type WeeklyAveragesCardProps = {
  weeklyAverages: WeeklyNutritionAverage[];
  style?: object;
};

function formatDelta(calDelta: number, calDeltaPct: number): string {
  const direction = calDelta > 0 ? t({ id: "components.progress.nutritionCards.increased", message: "increased" }) : t({ id: "components.progress.nutritionCards.decreased", message: "decreased" });
  return t({ id: "components.progress.nutritionCards.deltaA11y", message: `${direction} by ${Math.abs(calDelta)} calories (${Math.abs(calDeltaPct)}%)` });
}

function deltaArrow(calDelta: number): string {
  if (calDelta > 0) return "↑";
  if (calDelta < 0) return "↓";
  return "";
}

export function WeeklyAveragesCard({ weeklyAverages, style }: WeeklyAveragesCardProps) {
  const colors = useThemeColors();

  if (weeklyAverages.length === 0) return null;

  const thisWeek = weeklyAverages[weeklyAverages.length - 1];
  const lastWeek = weeklyAverages.length >= 2 ? weeklyAverages[weeklyAverages.length - 2] : null;

  const calDelta = lastWeek ? thisWeek.avgCalories - lastWeek.avgCalories : null;
  const calDeltaPct = lastWeek && lastWeek.avgCalories > 0
    ? Math.round((calDelta! / lastWeek.avgCalories) * 100)
    : null;

  const arrow = calDelta !== null ? deltaArrow(calDelta) : "";
  const deltaLabelText = calDelta !== null ? formatDelta(calDelta, calDeltaPct ?? 0) : "";

  return (
    <Card style={[styles.card, style]}>
      <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 12 }}>
        {t({ id: "components.progress.nutritionCards.weeklyAverages", message: "Weekly Averages" })}
      </Text>
      <View style={styles.weekCompare}>
        <View style={{ flex: 1 }}>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>{t({ id: "components.progress.nutritionCards.thisWeek", message: "This Week" })}</Text>
          <Text style={{ color: colors.onSurface, fontSize: fontSizes.xl, fontWeight: "600" }}>
            {thisWeek.avgCalories} cal
          </Text>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
             {t({ id: "components.progress.nutritionCards.daysTracked", message: `${thisWeek.daysTracked} days tracked` })}
          </Text>
        </View>
        {lastWeek && (
          <View style={{ flex: 1 }}>
            <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>{t({ id: "components.progress.nutritionCards.lastWeek", message: "Last Week" })}</Text>
            <Text style={{ color: colors.onSurface, fontSize: fontSizes.xl, fontWeight: "600" }}>
              {lastWeek.avgCalories} cal
            </Text>
            <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
               {t({ id: "components.progress.nutritionCards.lastDaysTracked", message: `${lastWeek.daysTracked} days tracked` })}
            </Text>
          </View>
        )}
      </View>
      {calDelta !== null && (
        <Text
          style={{ color: calDelta > 0 ? colors.error : colors.primary, marginTop: 8 }}
          accessibilityLabel={deltaLabelText}
        >
          {arrow} {Math.abs(calDelta)} cal ({Math.abs(calDeltaPct ?? 0)}%)
        </Text>
      )}
      <View style={[styles.macroRow, { marginTop: 12 }]}>
        <MacroPill label={t({ id: "components.progress.nutritionCards.proteinShort", message: "P" })} value={thisWeek.avgProtein} unit="g" color={semantic.protein} />
        <MacroPill label={t({ id: "components.progress.nutritionCards.carbsShort", message: "C" })} value={thisWeek.avgCarbs} unit="g" color={semantic.carbs} />
        <MacroPill label={t({ id: "components.progress.nutritionCards.fatShort", message: "F" })} value={thisWeek.avgFat} unit="g" color={semantic.fat} />
      </View>
    </Card>
  );
}

function MacroPill({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <View style={[styles.macroPill, { borderColor: color }]}>
      <Text style={{ color, fontWeight: "600", fontSize: fontSizes.xs }}>{label}</Text>
      <Text style={{ color, fontSize: fontSizes.sm, fontWeight: "600", marginLeft: 4 }}>{value}{unit}</Text>
    </View>
  );
}

// ─── Adherence Card ────────────────────────────────────────────────

type AdherenceCardProps = {
  adherence: NutritionAdherence;
  style?: object;
};

export function AdherenceCard({ adherence, style }: AdherenceCardProps) {
  const colors = useThemeColors();

  const pct = adherence.trackedDays > 0
    ? Math.round((adherence.onTargetDays / adherence.trackedDays) * 100)
    : 0;

  const barColor = pct >= 80 ? colors.primary : pct >= 50 ? semantic.carbs : colors.error;
  const isPerfect = pct === 100;

  return (
    <Card style={[styles.card, style]}>
      <View style={styles.cardHeader}>
        <Text variant="subtitle" style={{ color: colors.onSurface }}>
           {t({ id: "components.progress.nutritionCards.adherence", message: "Adherence" })}
        </Text>
        {isPerfect && <Text style={{ fontSize: fontSizes.lg }}>🎯</Text>}
      </View>

      <Text
        style={{ color: colors.onSurface, fontSize: fontSizes.heading, fontWeight: "700", marginTop: 4 }}
         accessibilityLabel={t({ id: "components.progress.nutritionCards.adherenceA11y", message: `${pct}% of tracked days on target` })}
      >
        {pct}%
      </Text>
      <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginBottom: 8 }}>
         {t({ id: "components.progress.nutritionCards.onTargetDays", message: `${adherence.onTargetDays} of ${adherence.trackedDays} tracked days on target` })}
      </Text>

      <View
        style={[styles.progressTrack, { backgroundColor: colors.surfaceVariant }]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: pct }}
      >
        <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: barColor }]} />
      </View>

      <View style={[styles.streakRow, { marginTop: 12 }]}>
        <View style={{ flex: 1 }}>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>{t({ id: "components.progress.nutritionCards.currentStreak", message: "Current Streak" })}</Text>
          <Text
            style={{ color: colors.onSurface, fontWeight: "600" }}
             accessibilityLabel={t({ id: "components.progress.nutritionCards.currentStreakA11y", message: `Current streak: ${adherence.currentStreak} days` })}
          >
             {i18n._({ id: "components.progress.nutritionCards.currentStreakValue", message: "{count} {count, plural, one {day} other {days}}", values: { count: adherence.currentStreak } })}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>{t({ id: "components.progress.nutritionCards.longestStreak", message: "Longest Streak" })}</Text>
          <Text
            style={{ color: colors.onSurface, fontWeight: "600" }}
             accessibilityLabel={t({ id: "components.progress.nutritionCards.longestStreakA11y", message: `Longest streak: ${adherence.longestStreak} days` })}
          >
             {i18n._({ id: "components.progress.nutritionCards.longestStreakValue", message: "{count} {count, plural, one {day} other {days}}", values: { count: adherence.longestStreak } })}
          </Text>
        </View>
      </View>
    </Card>
  );
}

// ─── Macro Trend Card ──────────────────────────────────────────────

type MacroTrendCardProps = {
  weeklyAverages: WeeklyNutritionAverage[];
  chartWidth: number;
  style?: object;
};

export function MacroTrendCard({ weeklyAverages, chartWidth, style }: MacroTrendCardProps) {
  const colors = useThemeColors();

  if (weeklyAverages.length < 2) return null;

  const chartData = weeklyAverages.map((w, i) => ({
    x: i,
    protein: w.avgProtein,
    carbs: w.avgCarbs,
    fat: w.avgFat,
  }));

  const latestWeek = weeklyAverages[weeklyAverages.length - 1];
  const summaryLabel = t({ id: "components.progress.nutritionCards.macroSummary", message: `Macro trends: latest week averages ${latestWeek.avgProtein}g protein, ${latestWeek.avgCarbs}g carbs, ${latestWeek.avgFat}g fat` });

  return (
    <Card style={[styles.card, style]}>
      <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 8 }}>
        {t({ id: "components.progress.nutritionCards.macroTrends", message: "Macro Trends" })}
      </Text>
      <View style={styles.legendRow}>
        <LegendDot color={semantic.protein} label={t({ id: "components.progress.nutritionCards.protein", message: "Protein" })} />
        <LegendDot color={semantic.carbs} label={t({ id: "components.progress.nutritionCards.carbs", message: "Carbs" })} />
        <LegendDot color={semantic.fat} label={t({ id: "components.progress.nutritionCards.fat", message: "Fat" })} />
      </View>
      <View
        style={{ width: chartWidth, height: 180 }}
        accessibilityRole="image"
        accessibilityLabel={summaryLabel}
      >
        <LineChart
          labels={weeklyAverages.map((w) => w.weekStart)}
          series={[
            {
              key: "protein",
              values: chartData.map((d) => d.protein),
              color: semantic.protein,
              strokeWidth: 2,
              curve: "natural",
            },
            {
              key: "carbs",
              values: chartData.map((d) => d.carbs),
              color: semantic.carbs,
              strokeWidth: 2,
              curve: "natural",
            },
            {
              key: "fat",
              values: chartData.map((d) => d.fat),
              color: semantic.fat,
              strokeWidth: 2,
              curve: "natural",
            },
          ]}
          padding={{ left: 10, right: 10 }}
          height={180}
          width={chartWidth}
        />
      </View>
    </Card>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={{ fontSize: fontSizes.xs, color }}>{label}</Text>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chartEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  weekCompare: {
    flexDirection: "row",
    gap: 16,
  },
  macroRow: {
    flexDirection: "row",
    gap: 8,
  },
  macroPill: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  streakRow: {
    flexDirection: "row",
    gap: 16,
  },
  legendRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 8,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
