/* eslint-disable max-lines-per-function */
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { CardContent } from "@/components/ui/card";
import type { MuscleGroup } from "../../lib/types";
import { MUSCLE_LABELS } from "../../lib/types";
import type { VolumeRow } from "../../hooks/useMuscleVolume";
import type { ThemeColors } from "@/hooks/useThemeColors";

const MEV = 10;
const MRV = 20;

type Props = {
  data: VolumeRow[];
  selected: MuscleGroup | null;
  maxSets: number;
  onSelect: (muscle: MuscleGroup) => void;
  colors: ThemeColors;
};

export default function VolumeBarChart({ data, selected, maxSets, onSelect, colors }: Props) {
  const mevPos = (MEV / maxSets) * 100;
  const mrvPos = (MRV / maxSets) * 100;

  return (
    <CardContent>
      <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 12 }}>
        Sets per Muscle Group
      </Text>
      <View style={styles.bars}>
        {/* Landmark labels */}
        <View style={styles.landmarks}>
          {mevPos < 95 && (
            <View style={[styles.landmark, { left: `${mevPos}%` }]}>
              <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                MEV
              </Text>
              <View style={[styles.dottedLine, { borderColor: colors.outlineVariant }]} />
            </View>
          )}
          {mrvPos < 95 && (
            <View style={[styles.landmark, { left: `${mrvPos}%` }]}>
              <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                MRV
              </Text>
              <View style={[styles.dottedLine, { borderColor: colors.outlineVariant }]} />
            </View>
          )}
        </View>

        {data.map((item) => {
          const pct = (item.sets / maxSets) * 100;
          const active = item.muscle === selected;
          return (
            <Pressable
              key={item.muscle}
              onPress={() => onSelect(item.muscle)}
              style={[
                styles.barRow,
                active && { backgroundColor: colors.primary + "18" },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${MUSCLE_LABELS[item.muscle]}: ${item.sets} sets`}
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
                      backgroundColor: active
                        ? colors.primary
                        : colors.primary + "99",
                      borderRadius: 4,
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
      </View>
    </CardContent>
  );
}

const styles = StyleSheet.create({
  bars: {
    position: "relative",
  },
  landmarks: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 72,
    right: 36,
  },
  landmark: {
    position: "absolute",
    top: -4,
    bottom: 0,
    alignItems: "center",
    width: 1,
  },
  dottedLine: {
    flex: 1,
    width: 0,
    borderLeftWidth: 1,
    borderStyle: "dashed",
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
});
