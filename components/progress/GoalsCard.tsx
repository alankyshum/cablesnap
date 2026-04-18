import { View, StyleSheet } from "react-native";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress as ProgressBar } from "@/components/ui/progress";
import { Text } from "@/components/ui/text";
import { useRouter } from "expo-router";
import { toDisplay } from "../../lib/units";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { BodyWeight, BodySettings, BodyMeasurements } from "../../lib/types";

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
