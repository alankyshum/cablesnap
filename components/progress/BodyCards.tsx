import { Pressable, StyleSheet, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { useRouter } from "expo-router";
import type { BodyWeight, BodyMeasurements } from "../../lib/types";
import { toDisplay } from "../../lib/units";
import { useThemeColors } from "@/hooks/useThemeColors";

export { ChartCard } from "./ChartCard";
export { GoalsCard } from "./GoalsCard";

type WeightCardProps = {
  latest: BodyWeight;
  delta: number | null;
  deltaLabel: string;
  unit: "kg" | "lb";
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
