import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Separator } from "@/components/ui/separator";
import { useThemeColors } from "@/hooks/useThemeColors";
import { toDisplay } from "@/lib/units";
import type { AllTimeBest } from "@/lib/db/pr-dashboard";

type Props = {
  bests: AllTimeBest[];
  weightUnit: "kg" | "lb";
  onPressExercise: (exerciseId: string) => void;
};

function groupByCategory(bests: AllTimeBest[]): { category: string; data: AllTimeBest[] }[] {
  const map = new Map<string, AllTimeBest[]>();
  for (const b of bests) {
    const existing = map.get(b.category);
    if (existing) existing.push(b);
    else map.set(b.category, [b]);
  }
  return Array.from(map.entries()).map(([category, data]) => ({ category, data }));
}

export default function AllTimeBestsSection({ bests, weightUnit, onPressExercise }: Props) {
  const colors = useThemeColors();

  if (bests.length === 0) return null;

  const sections = groupByCategory(bests);

  return (
    <View style={styles.container}>
      <Text
        variant="subtitle"
        style={[styles.sectionTitle, { color: colors.onSurface }]}
        accessibilityRole="header"
      >
        All-Time Bests
      </Text>
      {sections.map((section) => (
        <View key={section.category} style={styles.categorySection}>
          <Text
            variant="caption"
            style={[styles.categoryHeader, { color: colors.onSurfaceVariant }]}
            accessibilityRole="header"
          >
            {section.category}
          </Text>
          {section.data.map((item, i) => (
            <React.Fragment key={item.exercise_id}>
              <Pressable
                style={styles.bestRow}
                onPress={() => onPressExercise(item.exercise_id)}
                accessibilityRole="button"
                accessibilityLabel={
                  item.is_weighted
                    ? `${item.name}: ${item.max_weight != null ? toDisplay(item.max_weight, weightUnit) : '-'} ${weightUnit}${item.est_1rm ? `, estimated one rep max ${Math.round(toDisplay(item.est_1rm, weightUnit))} ${weightUnit}` : ''}, ${item.session_count} sessions`
                    : `${item.name}: ${item.max_reps} reps, ${item.session_count} sessions`
                }
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.onSurface }}>{item.name}</Text>
                  <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                    {item.session_count} session{item.session_count !== 1 ? "s" : ""}
                  </Text>
                </View>
                <View style={styles.valueCol}>
                  {item.is_weighted ? (
                    <>
                      <Text style={{ color: colors.onSurface, fontWeight: "600" }}>
                        {item.max_weight != null ? toDisplay(item.max_weight, weightUnit) : "-"} {weightUnit}
                      </Text>
                      {item.est_1rm != null ? (
                        <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                          e1RM: {Math.round(toDisplay(item.est_1rm, weightUnit))} {weightUnit}
                        </Text>
                      ) : null}
                    </>
                  ) : (
                    <Text style={{ color: colors.onSurface, fontWeight: "600" }}>
                      {item.max_reps} reps
                    </Text>
                  )}
                </View>
              </Pressable>
              {i < section.data.length - 1 && (
                <Separator style={{ marginVertical: 2 }} />
              )}
            </React.Fragment>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  categorySection: {
    marginBottom: 12,
  },
  categoryHeader: {
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
    fontWeight: "600",
  },
  bestRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    minHeight: 48,
  },
  valueCol: {
    alignItems: "flex-end",
  },
});
