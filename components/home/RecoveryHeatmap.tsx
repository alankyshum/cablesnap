import React, { useState, useCallback } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import Body, { type ExtendedBodyPart } from "react-native-body-highlighter";
import { useThemeColors } from "@/hooks/useThemeColors";
import { radii } from "../../constants/design-tokens";
import { SLUG_MAP } from "../../lib/muscle-map-utils";
import { MUSCLE_LABELS } from "../../lib/types";
import type { MuscleRecoveryStatus } from "../../lib/db/recovery";
import { getAppSetting, setAppSetting } from "../../lib/db/settings";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useFocusEffect } from "expo-router";
import { fontSizes } from "@/constants/design-tokens";

const COLLAPSE_KEY = "recovery_heatmap_collapsed";

function statusToIntensity(status: MuscleRecoveryStatus["status"]): number {
  if (status === "recovered") return 1;
  if (status === "partial") return 2;
  if (status === "fatigued") return 3;
  return 0;
}

function buildRecoveryData(statuses: MuscleRecoveryStatus[]): ExtendedBodyPart[] {
  const seen = new Set<string>();
  const result: ExtendedBodyPart[] = [];

  for (const s of statuses) {
    const intensity = statusToIntensity(s.status);
    if (intensity === 0) continue;

    const slugs = SLUG_MAP[s.muscle] ?? [];
    for (const slug of slugs) {
      if (!seen.has(slug)) {
        seen.add(slug);
        result.push({ slug, intensity });
      }
    }
  }

  return result;
}

type Props = {
  recoveryStatus: MuscleRecoveryStatus[];
  colors: ReturnType<typeof useThemeColors>;
};

function RecoveryHeatmapInner({ recoveryStatus, colors }: Props) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getAppSetting(COLLAPSE_KEY).then((val) => {
        if (val === "1") setIsExpanded(false);
        setLoaded(true);
      });
    }, [])
  );

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev;
      setAppSetting(COLLAPSE_KEY, next ? "0" : "1");
      return next;
    });
  }, []);

  if (!loaded) return null;

  const hasData = recoveryStatus.some((s) => s.status !== "no_data");
  const palette = [colors.heatmapLow, colors.heatmapMid, colors.heatmapHigh];
  const bodyColors = [...palette];
  const data = buildRecoveryData(recoveryStatus);
  const scale = 0.55;

  const readyMuscles = recoveryStatus
    .filter((s) => s.status === "recovered")
    .map((s) => MUSCLE_LABELS[s.muscle]);
  const recoveringMuscles = recoveryStatus
    .filter((s) => s.status === "partial" || s.status === "fatigued")
    .map((s) => MUSCLE_LABELS[s.muscle]);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.shadow }]}>
      <Pressable
        onPress={toggleExpanded}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        accessibilityLabel={`Muscle Recovery, ${isExpanded ? "expanded" : "collapsed"}`}
        style={styles.header}
      >
        <View style={styles.headerLeft}>
          <MaterialCommunityIcons name="arm-flex" size={20} color={colors.primary} />
          <Text variant="subtitle" style={{ color: colors.onBackground }}>Muscle Recovery</Text>
        </View>
        <MaterialCommunityIcons
          name={isExpanded ? "chevron-up" : "chevron-down"}
          size={20}
          color={colors.onSurfaceVariant}
        />
      </Pressable>

      {isExpanded && (
        <View style={styles.content}>
          {!hasData ? (
            <Text variant="caption" style={{ color: colors.onSurfaceVariant, textAlign: "center", paddingVertical: 16 }}>
              Complete a workout to see recovery status
            </Text>
          ) : (
            <>
              <View accessibilityElementsHidden style={styles.bodyRow}>
                <Body
                  data={data}
                  gender="male"
                  side="front"
                  scale={scale}
                  colors={bodyColors}
                  border={colors.heatmapBorder}
                />
                <Body
                  data={data}
                  gender="male"
                  side="back"
                  scale={scale}
                  colors={bodyColors}
                  border={colors.heatmapBorder}
                />
              </View>
              <RecoveryLegend palette={palette} />
              <View style={styles.summary}>
                {readyMuscles.length > 0 && (
                  <Text variant="caption" style={{ color: colors.onSurface }}>
                    <Text style={{ fontWeight: "700" }}>Ready: </Text>
                    {readyMuscles.join(", ")}
                  </Text>
                )}
                {recoveringMuscles.length > 0 && (
                  <Text variant="caption" style={{ color: colors.onSurface }}>
                    <Text style={{ fontWeight: "700" }}>Recovering: </Text>
                    {recoveringMuscles.join(", ")}
                  </Text>
                )}
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
}

function RecoveryLegend({ palette }: { palette: readonly string[] }) {
  const colors = useThemeColors();
  const items = [
    { color: palette[0], label: "Recovered" },
    { color: palette[1], label: "Partial" },
    { color: palette[2], label: "Fatigued" },
  ];

  return (
    <View style={styles.legend}>
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: item.color }]} />
          <Text variant="caption" style={{ color: colors.onSurfaceVariant, fontSize: fontSizes.xs }}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

export const RecoveryHeatmap = React.memo(RecoveryHeatmapInner);

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 48,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  content: {
    marginTop: 8,
  },
  bodyRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 4,
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radii.md,
  },
  summary: {
    marginTop: 8,
    gap: 4,
  },
});
