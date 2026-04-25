/**
 * BLD-600 — Hydration tracking section in Nutrition tab list header.
 *
 * Hard exclusions (per PLAN-BLD-599 §Behavior-Design Classification — preserved verbatim):
 * - No celebratory animation when target is hit.
 * - No "you missed yesterday" or comparative shame copy.
 * - No notifications or scheduled reminders.
 * - No streak counter on hydration.
 * - No daily auto-popup of a hydration card.
 * - No badge or achievement on the bottom tab.
 *
 * If any of these are added, classification flips to YES and psychologist review
 * becomes mandatory before merge.
 */
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Text } from "@/components/ui/text";
import { Progress } from "@/components/ui/progress";
import { radii } from "@/constants/design-tokens";
import { formatTotalOverGoal, formatVolume, type HydrationUnit } from "@/lib/hydration-units";

type Props = {
  totalMl: number;
  goalMl: number;
  unit: HydrationUnit;
  presetsMl: [number, number, number];
  colors: { primary: string; onSurface: string; onSurfaceVariant: string };
  onPresetPress: (amountMl: number) => void;
  onCustomPress: () => void;
};

export function WaterSection({
  totalMl, goalMl, unit, presetsMl, colors,
  onPresetPress, onCustomPress,
}: Props) {
  const headerLabel = formatTotalOverGoal(totalMl, goalMl, unit);
  const pct = goalMl > 0 ? Math.min(totalMl / goalMl, 1) * 100 : 0;

  const handleHeaderPress = () => router.push("/nutrition/water");

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={handleHeaderPress}
        accessibilityLabel="Open hydration day detail"
        accessibilityRole="button"
        style={({ pressed }) => [styles.headerArea, pressed && { opacity: 0.7 }]}
      >
        <View style={styles.headerRow}>
          <Text variant="caption" style={{ color: colors.onSurface }}>Water</Text>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>{headerLabel}</Text>
        </View>
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: Math.max(goalMl, 1), now: totalMl }}
          // RN-Web ARIA fallback (props accepted via {...rest}-style passthrough on View).
          {...({
            "aria-valuemin": 0,
            "aria-valuemax": Math.max(goalMl, 1),
            "aria-valuenow": totalMl,
            role: "progressbar",
          } as Record<string, unknown>)}
        >
          <Progress value={pct} style={styles.bar} />
        </View>
      </Pressable>

      <View style={styles.chipRow}>
        {presetsMl.map((amt, idx) => (
          <Pressable
            key={`preset-${idx}-${amt}`}
            onPress={() => onPresetPress(amt)}
            accessibilityLabel={`Log ${formatVolume(amt, unit)} of water`}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.chip,
              { borderColor: colors.primary },
              pressed && { opacity: 0.6 },
            ]}
            hitSlop={4}
          >
            <Text variant="caption" style={{ color: colors.primary }}>
              {`+${formatVolume(amt, unit)}`}
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={onCustomPress}
          accessibilityLabel="Log custom amount of water"
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.chip,
            styles.customChip,
            { borderColor: colors.primary },
            pressed && { opacity: 0.6 },
          ]}
          hitSlop={4}
        >
          <Text variant="caption" style={{ color: colors.primary }}>+ Custom</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12, marginTop: 4 },
  headerArea: { minHeight: 44, paddingVertical: 4 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  bar: { height: 6, borderRadius: radii.sm },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  chip: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  customChip: { borderStyle: "dashed" },
});
