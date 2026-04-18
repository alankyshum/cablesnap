import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Button, Card, IconButton, Text } from "react-native-paper";
import { useFocusEffect } from "expo-router";
import { CartesianChart, Line } from "victory-native";
import { getMuscleVolumeForWeek, getMuscleVolumeTrend } from "../lib/db";
import type { MuscleGroup } from "../lib/types";
import { MUSCLE_LABELS } from "../lib/types";
import { useLayout } from "../lib/layout";
import { useThemeColors } from "@/hooks/useThemeColors";

type VolumeRow = { muscle: MuscleGroup; sets: number; exercises: number };
type TrendRow = { week: string; sets: number };

const MEV = 10;
const MRV = 20;
const TREND_WEEKS = 8;

function mondayOfWeek(offset: number): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - diff + offset * 7);
  return monday;
}

function formatRange(start: Date): string {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

const MuscleRow = React.memo(function MuscleRow({
  item,
  selected,
  onPress,
  color,
  text,
  muted,
}: {
  item: VolumeRow;
  selected: boolean;
  onPress: () => void;
  color: string;
  text: string;
  muted: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.row,
        { borderBottomColor: muted },
        selected && { backgroundColor: color + "18" },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${MUSCLE_LABELS[item.muscle]}: ${item.sets} sets from ${item.exercises} exercises`}
      accessibilityHint="Double tap to see weekly trend"
      accessibilityState={{ selected }}
    >
      <Text
        variant="bodyMedium"
        style={{ color: text, flex: 1 }}
        numberOfLines={1}
      >
        {MUSCLE_LABELS[item.muscle]}
      </Text>
      <Text variant="bodySmall" style={{ color: muted, marginRight: 8 }}>
        {item.exercises} ex
      </Text>
      <Text variant="titleSmall" style={{ color: text, width: 40, textAlign: "right" }}>
        {item.sets}
      </Text>
    </Pressable>
  );
});

export default function MuscleVolumeSegment() {
  const colors = useThemeColors();
  const layout = useLayout();
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<VolumeRow[]>([]);
  const [trend, setTrend] = useState<TrendRow[]>([]);
  const [selected, setSelected] = useState<MuscleGroup | null>(null);
  const selectedRef = useRef<MuscleGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reduced, setReduced] = useState(false);

  const monday = useMemo(() => mondayOfWeek(offset), [offset]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await getMuscleVolumeForWeek(monday.getTime());
      setData(rows);
      if (rows.length > 0) {
        const cur = selectedRef.current;
        const muscle = cur && rows.some((r) => r.muscle === cur)
          ? cur
          : rows[0].muscle;
        selectedRef.current = muscle;
        setSelected(muscle);
        const t = await getMuscleVolumeTrend(muscle, TREND_WEEKS);
        setTrend(t);
      } else {
        selectedRef.current = null;
        setSelected(null);
        setTrend([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [monday]);

  useFocusEffect(
    useCallback(() => {
      load();
      AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    }, [load])
  );

  const selectMuscle = useCallback(async (muscle: MuscleGroup) => {
    selectedRef.current = muscle;
    setSelected(muscle);
    try {
      const t = await getMuscleVolumeTrend(muscle, TREND_WEEKS);
      setTrend(t);
    } catch {
      // trend load failure is non-critical
    }
  }, []);

  const maxSets = useMemo(
    () => Math.max(...data.map((d) => d.sets), MRV),
    [data]
  );

  const chartWidth = layout.atLeastMedium
    ? (layout.width - 96) / 2 - 32
    : layout.width - 48;

  const hasEnoughTrend = useMemo(
    () => trend.filter((t) => t.sets > 0).length >= 2,
    [trend]
  );

  // ---- Render ----

  if (loading) {
    return (
      <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel="Loading muscle volume data">
        <ActivityIndicator size="large" color={colors.primary} />
        <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant, marginTop: 12 }}>
          Loading…
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text variant="bodyLarge" style={{ color: colors.error, marginBottom: 12 }}>
          {error}
        </Text>
        <Button mode="contained" onPress={load} accessibilityLabel="Retry loading muscle volume data">
          Retry
        </Button>
      </View>
    );
  }

  const mevPos = (MEV / maxSets) * 100;
  const mrvPos = (MRV / maxSets) * 100;

  return (
    <View>
      {/* Week Selector */}
      <View style={styles.weekRow}>
        <IconButton
          icon="chevron-left"
          onPress={() => setOffset(offset - 1)}
          size={24}
          accessibilityLabel="Previous week"
          style={styles.chevron}
        />
        <View
          style={{ flex: 1, alignItems: "center" }}
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
        >
          <Text variant="titleSmall" style={{ color: colors.onSurface }}>
            {offset === 0 ? "This Week" : formatRange(monday)}
          </Text>
          <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>
            {formatRange(monday)}
          </Text>
        </View>
        {offset < 0 ? (
          <IconButton
            icon="chevron-right"
            onPress={() => setOffset(offset + 1)}
            size={24}
            accessibilityLabel="Next week"
            style={styles.chevron}
          />
        ) : (
          <View style={{ width: 48 }} />
        )}
      </View>

      {offset !== 0 && (
        <View style={{ alignItems: "center", marginBottom: 8 }}>
          <Button
            mode="contained-tonal"
            compact
            onPress={() => setOffset(0)}
            accessibilityLabel="Go to current week"
          >
            Today
          </Button>
        </View>
      )}

      {data.length === 0 ? (
        <Card style={[styles.card, { backgroundColor: colors.surface }]}>
          <Card.Content>
            <Text
              variant="bodyLarge"
              style={{ color: colors.onSurfaceVariant, textAlign: "center", padding: 32 }}
            >
              No workouts this week. Complete a session to see muscle volume.
            </Text>
          </Card.Content>
        </Card>
      ) : (
        <>
          {/* Volume Bars + Trend flow side by side on tablet */}
          <View style={layout.atLeastMedium ? styles.flowRow : undefined}>
          <Card style={[styles.card, layout.atLeastMedium && styles.flowCard, { backgroundColor: colors.surface }]}>
            <Card.Content>
              <Text variant="titleMedium" style={{ color: colors.onSurface, marginBottom: 12 }}>
                Sets per Muscle Group
              </Text>
              <View style={styles.bars}>
                {/* Landmark labels */}
                <View style={styles.landmarks}>
                  {mevPos < 95 && (
                    <View style={[styles.landmark, { left: `${mevPos}%` }]}>
                      <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>
                        MEV
                      </Text>
                      <View style={[styles.dottedLine, { borderColor: colors.outlineVariant }]} />
                    </View>
                  )}
                  {mrvPos < 95 && (
                    <View style={[styles.landmark, { left: `${mrvPos}%` }]}>
                      <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>
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
                      onPress={() => selectMuscle(item.muscle)}
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
                        variant="bodySmall"
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
                        variant="labelMedium"
                        style={{ color: colors.onSurface, width: 28, textAlign: "right" }}
                      >
                        {item.sets}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Card.Content>
          </Card>

          <Card style={[styles.card, layout.atLeastMedium && styles.flowCard, { backgroundColor: colors.surface }]}>
            <Card.Content>
              <Text variant="titleMedium" style={{ color: colors.onSurface, marginBottom: 4 }}>
                {selected ? `${MUSCLE_LABELS[selected]} — 8 Week Trend` : "Weekly Trend"}
              </Text>
              {hasEnoughTrend ? (
                <View style={{ width: chartWidth, height: 180 }}>
                  <CartesianChart
                    data={trend.map((t) => ({ week: t.week, sets: t.sets }))}
                    xKey="week"
                    yKeys={["sets"]}
                    domainPadding={{ left: 10, right: 10 }}
                  >
                    {({ points }) => (
                      <Line
                        points={points.sets}
                        color={colors.primary}
                        strokeWidth={2}
                        curveType={reduced ? "linear" : "natural"}
                      />
                    )}
                  </CartesianChart>
                </View>
              ) : (
                <Text
                  variant="bodyMedium"
                  style={{
                    color: colors.onSurfaceVariant,
                    textAlign: "center",
                    padding: 24,
                  }}
                >
                  Keep training to see your trends
                </Text>
              )}
            </Card.Content>
          </Card>

          </View>

          {/* Muscle Detail List */}
          <Card style={[styles.card, { backgroundColor: colors.surface }]}>
            <Card.Content>
              <Text variant="titleMedium" style={{ color: colors.onSurface, marginBottom: 8 }}>
                Muscle Group Details
              </Text>
              <FlashList
                data={data}
                keyExtractor={(item) => item.muscle}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <MuscleRow
                    item={item}
                    selected={item.muscle === selected}
                    onPress={() => selectMuscle(item.muscle)}
                    color={colors.primary}
                    text={colors.onSurface}
                    muted={colors.outlineVariant}
                  />
                )}
              />
            </Card.Content>
          </Card>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  weekRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  chevron: {
    minWidth: 48,
    minHeight: 48,
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  flowRow: {
    flexDirection: "row",
    gap: 12,
  },
  flowCard: {
    flex: 1,
  },
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
  },
});
