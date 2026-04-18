import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress as ProgressBar } from "@/components/ui/progress";
import { Text } from "@/components/ui/text";
import { useRouter } from "expo-router";
import { CartesianChart, Line } from "victory-native";
import type { BodyWeight, BodySettings, BodyMeasurements } from "../../lib/types";
import { useLayout } from "../../lib/layout";
import { toDisplay } from "../../lib/units";
import { movingAvg } from "../../lib/format";
import { useThemeColors } from "@/hooks/useThemeColors";

type WeightCardProps = {
  latest: BodyWeight;
  delta: number | null;
  deltaLabel: string;
  unit: string;
  onToggleUnit: () => void;
};

export function WeightCard({ latest, delta, deltaLabel, unit, onToggleUnit }: WeightCardProps) {
  const colors = useThemeColors();

  return (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <Text variant="subtitle" style={{ color: colors.onSurface }}>
          Current Weight
        </Text>
        <Button
          variant="ghost"
          size="sm"
          onPress={onToggleUnit}
          accessibilityLabel={`Switch to ${unit === "kg" ? "pounds" : "kilograms"}`}
          label={unit === "kg" ? "kg → lb" : "lb → kg"}
        />
      </View>
      <Text
        variant="heading"
        style={{ color: colors.onSurface, marginTop: 4 }}
        accessibilityLabel={`Current weight ${toDisplay(latest.weight, unit)} ${unit}`}
      >
        {toDisplay(latest.weight, unit)} {unit}
      </Text>
      {delta !== null && delta !== 0 && (
        <Text
          style={{
            color: delta > 0 ? colors.error : colors.primary,
            marginTop: 4,
          }}
          accessibilityValue={{ text: `${deltaLabel} since previous entry` }}
        >
          {deltaLabel} since previous
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
  unit: string;
};

export function GoalsCard({ settings, latest, measurements, unit }: GoalsCardProps) {
  const colors = useThemeColors();
  const router = useRouter();

  if (!settings.weight_goal && !settings.body_fat_goal) {
    return (
      <Card style={styles.card}>
        <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 8 }}>
          Goals
        </Text>
        <Button
          variant="outline"
          onPress={() => router.push("/body/goals")}
          accessibilityLabel="Set body goals"
          label="Set Goals"
        />
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <Text variant="subtitle" style={{ color: colors.onSurface }}>
          Goals
        </Text>
        <Button
          variant="ghost"
          size="sm"
          onPress={() => router.push("/body/goals")}
          accessibilityLabel="Edit body goals"
          label="Edit"
        />
      </View>
      {settings.weight_goal && latest && (
        <View style={{ marginTop: 8 }}>
          <Text style={{ color: colors.onSurface }}>
            Weight: {toDisplay(latest.weight, unit)} →{" "}
            {toDisplay(settings.weight_goal, unit)} {unit}
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
            Body fat: {measurements.body_fat}% → {settings.body_fat_goal}%
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
  unit: string;
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
        Weight Trend
      </Text>
      <View style={{ width: chartWidth, height: 200 }}>
        <CartesianChart
          data={chart.map((d, i) => ({
            date: paddedLabels[i] || "",
            weight: toDisplay(d.weight, unit),
            avg: avg[i]
              ? toDisplay(avg[i].avg, unit)
              : toDisplay(d.weight, unit),
          }))}
          xKey="date"
          yKeys={["weight", "avg"]}
          domainPadding={{ left: 10, right: 10 }}
        >
          {({ points }) => (
            <>
              <Line
                points={points.weight}
                color={colors.primary}
                strokeWidth={2}
                curveType="natural"
              />
              <Line
                points={points.avg}
                color={colors.tertiary}
                strokeWidth={2}
                curveType="natural"
              />
            </>
          )}
        </CartesianChart>
      </View>
      <View style={{ flexDirection: "row", gap: 16, marginTop: 8 }}>
        <Text variant="caption" style={{ color: colors.primary }}>
          ● Actual
        </Text>
        <Text variant="caption" style={{ color: colors.tertiary }}>
          ● 7-day avg
        </Text>
      </View>
    </Card>
  );
}

type SingleEntryCardProps = {
  latest: BodyWeight;
  unit: string;
};

export function SingleEntryCard({ latest, unit }: SingleEntryCardProps) {
  const colors = useThemeColors();

  return (
    <Card style={styles.card}>
      <Text
        variant="subtitle"
        style={{ color: colors.onSurface, marginBottom: 8 }}
      >
        Weight Trend
      </Text>
      <Text style={{ color: colors.onSurfaceVariant }}>
        {toDisplay(latest.weight, unit)} {unit} on {latest.date}
      </Text>
      <Text
        variant="caption"
        style={{ color: colors.onSurfaceVariant, marginTop: 4 }}
      >
        Log more entries to see a chart
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
          Measurements
        </Text>
      </View>
      {measurements ? (
        <Text style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>
          Last logged: {measurements.date}
        </Text>
      ) : (
        <Text style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>
          No measurements logged yet
        </Text>
      )}
      <Button
        variant="outline"
        onPress={() => router.push("/body/measurements")}
        style={{ marginTop: 8 }}
        accessibilityLabel="Log body measurements"
        label={measurements ? "Log Measurements" : "Add First Measurement"}
      />
    </Card>
  );
}

type ProgressPhotosCardProps = Record<string, never>;

export function ProgressPhotosCard(_props: ProgressPhotosCardProps) {
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
      accessibilityLabel="Progress Photos"
      accessibilityRole="button"
      accessibilityHint="View and manage your progress photos"
    >
      <View style={styles.cardHeader}>
        <Text variant="subtitle" style={{ color: colors.onSurface }}>
          Progress Photos
        </Text>
      </View>
      <Text style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>
        Track your visual transformation
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
