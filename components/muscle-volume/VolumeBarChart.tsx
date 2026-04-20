/* eslint-disable max-lines-per-function */
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { CardContent } from "@/components/ui/card";
import type { MuscleGroup } from "../../lib/types";
import { MUSCLE_LABELS } from "../../lib/types";
import type { VolumeRow } from "../../hooks/useMuscleVolume";
import type { ThemeColors } from "@/hooks/useThemeColors";
import type { VolumeLandmarks } from "../../lib/volume-landmarks";
import { getVolumeStatus, getVolumeStatusLabel } from "../../lib/volume-landmarks";

type Props = {
  data: VolumeRow[];
  selected: MuscleGroup | null;
  maxSets: number;
  onSelect: (muscle: MuscleGroup) => void;
  colors: ThemeColors;
  landmarks: Record<MuscleGroup, VolumeLandmarks>;
};

function getBarColor(
  sets: number,
  lm: VolumeLandmarks,
  colors: ThemeColors,
  active: boolean
): string {
  const status = getVolumeStatus(sets, lm);
  const opacity = active ? "" : "99";
  switch (status) {
    case "below_mev":
      return colors.surfaceVariant;
    case "optimal":
      return colors.primary + opacity;
    case "above_mrv":
      return colors.tertiary + opacity;
  }
}

export default function VolumeBarChart({
  data, selected, maxSets, onSelect, colors, landmarks,
}: Props) {
  return (
    <CardContent>
      <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 12 }}>
        Sets per Muscle Group
      </Text>
      <View style={styles.bars}>
        {data.map((item) => {
          const pct = (item.sets / maxSets) * 100;
          const active = item.muscle === selected;
          const lm = landmarks[item.muscle];
          const status = getVolumeStatus(item.sets, lm);
          const statusLabel = getVolumeStatusLabel(status);
          const barColor = getBarColor(item.sets, lm, colors, active);

          return (
            <Pressable
              key={item.muscle}
              onPress={() => onSelect(item.muscle)}
              style={[
                styles.barRow,
                active && { backgroundColor: colors.primary + "18" },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${MUSCLE_LABELS[item.muscle]}: ${item.sets} sets, ${statusLabel}`}
              accessibilityHint="Double tap to see weekly trend"
              accessibilityState={{ selected: active }}
            >
              <Text
                variant="caption"
                style={[styles.barLabel, { color: colors.onSurface }]}
                numberOfLines={1}
              >
                {MUSCLE_LABELS[item.muscle]}
              </Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${pct}%`,
                      backgroundColor: barColor,
                      borderRadius: 4,
                      borderStyle: status === "below_mev" ? "dashed" : "solid",
                      borderWidth: status === "below_mev" ? 1.5 : 0,
                      borderColor: status === "below_mev" ? colors.onSurfaceVariant : undefined,
                    },
                  ]}
                />
              </View>
              <Text
                variant="body"
                style={{ color: colors.onSurface, width: 28, textAlign: "right" }}
              >
                {item.sets}
              </Text>
            </Pressable>
          );
        })}

        {/* Show MEV/MRV text labels when a muscle is selected */}
        {selected && landmarks[selected] && (
          <View style={styles.landmarkTextRow}>
            <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
              MEV: {landmarks[selected].mev}
            </Text>
            <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginLeft: 12 }}>
              MRV: {landmarks[selected].mrv}
            </Text>
          </View>
        )}
      </View>
    </CardContent>
  );
}

const styles = StyleSheet.create({
  bars: {
    position: "relative",
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 4,
    minHeight: 48,
  },
  barLabel: {
    width: 64,
    marginRight: 8,
  },
  barTrack: {
    flex: 1,
    height: 16,
    borderRadius: 4,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
  },
  landmarkTextRow: {
    flexDirection: "row",
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingLeft: 76,
  },
});
