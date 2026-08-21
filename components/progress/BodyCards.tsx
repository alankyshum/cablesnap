import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress as ProgressBar } from "@/components/ui/progress";
import { Text } from "@/components/ui/text";
import { useRouter } from "expo-router";
import { LineChart } from "@/components/charts";
import type { BodyWeight, BodySettings, BodyMeasurements } from "../../lib/types";
import { useLayout } from "../../lib/layout";
import { toDisplay } from "../../lib/units";
import { movingAvg } from "../../lib/format";
import { useThemeColors } from "@/hooks/useThemeColors";
import { t } from "@lingui/core/macro";

type WeightCardProps = {
  latest: BodyWeight;
  delta: number | null;
  deltaLabel: string;
  unit: "kg" | "lb";
  onToggleUnit: () => void;
};

export function WeightCard({ latest, delta, deltaLabel, unit, onToggleUnit }: WeightCardProps) {
  const colors = useThemeColors();
  const switchUnitLabel = unit === "kg"
    ? t({ id: "components.progress.bodyCards.switchToPounds", message: "Switch to pounds" })
    : t({ id: "components.progress.bodyCards.switchToKilograms", message: "Switch to kilograms" });

  return (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <Text variant="subtitle" style={{ color: colors.onSurface }}>
          {t({ id: "components.progress.bodyCards.currentWeight", message: "Current Weight" })}
        </Text>
        <Button
          variant="ghost"
          size="sm"
          onPress={onToggleUnit}
           accessibilityLabel={switchUnitLabel}
           label={switchUnitLabel}
        />
      </View>
      <Text
        variant="heading"
        style={{ color: colors.onSurface, marginTop: 4 }}
        accessibilityLabel={t({ id: "components.progress.bodyCards.currentWeightA11y", message: `Current weight ${toDisplay(latest.weight, unit)} ${unit}` })}
      >
        {toDisplay(latest.weight, unit)} {unit}
      </Text>
      {delta !== null && delta !== 0 && (
        <Text
          style={{
            color: delta > 0 ? colors.error : colors.primary,
            marginTop: 4,
          }}
           accessibilityValue={{ text: t({ id: "components.progress.bodyCards.deltaA11y", message: `${deltaLabel} since previous entry` }) }}
        >
           {t({ id: "components.progress.bodyCards.delta", message: `${deltaLabel} since previous` })}
        </Text>
      )}
      <Text
        variant="caption"
        style={{ color: colors.onSurfaceVariant, marginTop: 4 }}
      >
        {latest.date}
      </Text>
    </Card>
  );
}

type GoalsCardProps = {
  settings: BodySettings;
  latest: BodyWeight | null;
  measurements: BodyMeasurements | null;
  unit: "kg" | "lb";
};

export function GoalsCard({ settings, latest, measurements, unit }: GoalsCardProps) {
  const colors = useThemeColors();
  const router = useRouter();

  if (!settings.weight_goal && !settings.body_fat_goal) {
    return (
      <Card style={styles.card}>
        <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 8 }}>
          {t({ id: "components.progress.bodyCards.goals", message: "Goals" })}
        </Text>
        <Button
          variant="outline"
          onPress={() => router.push("/body/goals")}
          accessibilityLabel={t({ id: "components.progress.bodyCards.setGoalsA11y", message: "Set body goals" })}
          label={t({ id: "components.progress.bodyCards.setGoals", message: "Set Goals" })}
        />
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <Text variant="subtitle" style={{ color: colors.onSurface }}>
          {t({ id: "components.progress.bodyCards.goals", message: "Goals" })}
        </Text>
        <Button
          variant="ghost"
          size="sm"
          onPress={() => router.push("/body/goals")}
          accessibilityLabel={t({ id: "components.progress.bodyCards.editGoalsA11y", message: "Edit body goals" })}
          label={t({ id: "components.progress.bodyCards.edit", message: "Edit" })}
        />
      </View>
      {settings.weight_goal && latest && (
        <View style={{ marginTop: 8 }}>
          <Text style={{ color: colors.onSurface }}>
           {t({ id: "components.progress.bodyCards.weightGoal", message: `Weight: ${toDisplay(latest.weight, unit)} → ${toDisplay(settings.weight_goal, unit)} ${unit}` })}
          </Text>
          <ProgressBar
            value={Math.min(
              100,
              Math.max(
                0,
                (1 -
                  Math.abs(latest.weight - settings.weight_goal) /
                    Math.max(latest.weight, 1)) *
                  100,
              ),
            )}
            style={{ marginTop: 8 }}
            height={6}
          />
        </View>
      )}
      {settings.body_fat_goal && measurements?.body_fat && (
        <View style={{ marginTop: 12 }}>
          <Text style={{ color: colors.onSurface }}>
             {t({ id: "components.progress.bodyCards.bodyFatGoal", message: `Body fat: ${measurements.body_fat}% → ${settings.body_fat_goal}%` })}
          </Text>
          <ProgressBar
            value={Math.min(
              100,
              Math.max(
                0,
                (1 -
                  Math.abs(measurements.body_fat - settings.body_fat_goal) /
                    Math.max(measurements.body_fat, 1)) *
                  100,
              ),
            )}
            style={{ marginTop: 8 }}
            height={6}
          />
        </View>
      )}
    </Card>
  );
}

type ChartCardProps = {
  chart: { date: string; weight: number }[];
  unit: "kg" | "lb";
};

export function ChartCard({ chart, unit }: ChartCardProps) {
  const colors = useThemeColors();
  const layout = useLayout();
  const { width: screenWidth } = useWindowDimensions();

  const chartWidth = layout.atLeastMedium
    ? (screenWidth - 96) / 2 - 32
    : screenWidth - 48;

  const avg = movingAvg(chart);

  const paddedLabels = chart.map((d, i) => {
    if (chart.length <= 8) return d.date.slice(5);
    if (i % Math.ceil(chart.length / 6) === 0 || i === chart.length - 1)
      return d.date.slice(5);
    return "";
  });

  return (
    <Card style={styles.card}>
      <Text
        variant="subtitle"
        style={{ color: colors.onSurface, marginBottom: 12 }}
      >
         {t({ id: "components.progress.bodyCards.weightTrend", message: "Weight Trend" })}
      </Text>
      <View style={{ width: chartWidth, height: 200 }}>
        <LineChart
          labels={paddedLabels}
          series={[
            {
              key: "weight",
              values: chart.map((d) => toDisplay(d.weight, unit)),
              color: colors.primary,
              strokeWidth: 2,
              curve: "natural",
              showPoints: false,
            },
            {
              key: "avg",
              values: chart.map((d, i) =>
                avg[i]
                  ? toDisplay(avg[i].avg, unit)
                  : toDisplay(d.weight, unit),
              ),
              color: colors.tertiary,
              strokeWidth: 2,
              curve: "natural",
              showPoints: false,
            },
          ]}
          padding={{ left: 10, right: 10 }}
          height={200}
          width={chartWidth}
        />
      </View>
      <View style={{ flexDirection: "row", gap: 16, marginTop: 8 }}>
        <Text variant="caption" style={{ color: colors.primary }}>
           {t({ id: "components.progress.bodyCards.actual", message: "● Actual" })}
        </Text>
        <Text variant="caption" style={{ color: colors.tertiary }}>
           {t({ id: "components.progress.bodyCards.sevenDayAverage", message: "● 7-day avg" })}
        </Text>
      </View>
    </Card>
  );
}

type SingleEntryCardProps = {
  latest: BodyWeight;
  unit: "kg" | "lb";
};

export function SingleEntryCard({ latest, unit }: SingleEntryCardProps) {
  const colors = useThemeColors();

  return (
    <Card style={styles.card}>
      <Text
        variant="subtitle"
        style={{ color: colors.onSurface, marginBottom: 8 }}
      >
         {t({ id: "components.progress.bodyCards.weightTrend", message: "Weight Trend" })}
      </Text>
      <Text style={{ color: colors.onSurfaceVariant }}>
        {toDisplay(latest.weight, unit)} {unit} on {latest.date}
      </Text>
      <Text
        variant="caption"
        style={{ color: colors.onSurfaceVariant, marginTop: 4 }}
      >
         {t({ id: "components.progress.bodyCards.moreEntries", message: "Log more entries to see a chart" })}
      </Text>
    </Card>
  );
}

type MeasurementsCardProps = {
  measurements: BodyMeasurements | null;
};

export function MeasurementsCard({ measurements }: MeasurementsCardProps) {
  const colors = useThemeColors();
  const router = useRouter();

  return (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <Text variant="subtitle" style={{ color: colors.onSurface }}>
          {t({ id: "components.progress.bodyCards.measurements", message: "Measurements" })}
        </Text>
      </View>
      {measurements ? (
        <Text style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>
           {t({ id: "components.progress.bodyCards.lastLogged", message: `Last logged: ${measurements.date}` })}
        </Text>
      ) : (
        <Text style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>
           {t({ id: "components.progress.bodyCards.noMeasurements", message: "No measurements logged yet" })}
        </Text>
      )}
      <Button
        variant="outline"
        onPress={() => router.push("/body/measurements")}
        style={{ marginTop: 8 }}
        accessibilityLabel={t({ id: "components.progress.bodyCards.logMeasurementsA11y", message: "Log body measurements" })}
        label={measurements ? t({ id: "components.progress.bodyCards.logMeasurements", message: "Log Measurements" }) : t({ id: "components.progress.bodyCards.addMeasurement", message: "Add First Measurement" })}
      />
    </Card>
  );
}

export function ProgressPhotosCard() {
  const colors = useThemeColors();
  const router = useRouter();

  return (
    <Pressable
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderRadius: 12,
          padding: 18,
        },
      ]}
      onPress={() => router.push("/body/photos")}
      accessibilityLabel={t({ id: "components.progress.bodyCards.progressPhotosA11y", message: "Progress Photos" })}
      accessibilityRole="button"
      accessibilityHint={t({ id: "components.progress.bodyCards.progressPhotosHint", message: "View and manage your progress photos" })}
    >
      <View style={styles.cardHeader}>
        <Text variant="subtitle" style={{ color: colors.onSurface }}>
          {t({ id: "components.progress.bodyCards.progressPhotos", message: "Progress Photos" })}
        </Text>
      </View>
      <Text style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>
        {t({ id: "components.progress.bodyCards.progressPhotosDescription", message: "Document your strength journey over time" })}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});
