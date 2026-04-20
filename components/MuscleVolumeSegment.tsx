import React from "react";
import { Pressable, StyleSheet, View, FlatList } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { MUSCLE_LABELS } from "../lib/types";
import { useLayout } from "../lib/layout";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useMuscleVolume } from "@/hooks/useMuscleVolume";
import type { VolumeRow } from "@/hooks/useMuscleVolume";
import VolumeBarChart from "./muscle-volume/VolumeBarChart";
import VolumeTrendChart from "./muscle-volume/VolumeTrendChart";

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
        variant="body"
        style={{ color: text, flex: 1 }}
        numberOfLines={1}
      >
        {MUSCLE_LABELS[item.muscle]}
      </Text>
      <Text variant="caption" style={{ color: muted, marginRight: 8 }}>
        {item.exercises} ex
      </Text>
      <Text variant="body" style={{ color: text, width: 40, textAlign: "right", fontWeight: "600" }}>
        {item.sets}
      </Text>
    </Pressable>
  );
});

export default function MuscleVolumeSegment() {
  const colors = useThemeColors();
  const layout = useLayout();
  const {
    offset, setOffset, data, trend, selected, selectMuscle,
    loading, error, load, monday, maxSets, hasEnoughTrend, reduced, formatRange,
  } = useMuscleVolume();

  const chartWidth = layout.atLeastMedium
    ? (layout.width - 96) / 2 - 32
    : layout.width - 48;

  // ---- Render ----

  if (loading) {
    return (
      <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel="Loading muscle volume data">
        <Spinner size="lg" />
        <Text variant="body" style={{ color: colors.onSurfaceVariant, marginTop: 12 }}>
          Loading…
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text variant="body" style={{ color: colors.error, marginBottom: 12 }}>
          {error}
        </Text>
        <Button variant="default" onPress={load} accessibilityLabel="Retry loading muscle volume data">
          <Text>Retry</Text>
        </Button>
      </View>
    );
  }

  return (
    <View>
      {/* Week Selector */}
      <View style={styles.weekRow}>
        <Button variant="ghost" size="icon" icon={ChevronLeft} onPress={() => setOffset(offset - 1)} accessibilityLabel="Previous week" style={styles.chevron} />
        <View
          style={{ flex: 1, alignItems: "center" }}
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
        >
          <Text variant="body" style={{ color: colors.onSurface, fontWeight: "600" }}>
            {offset === 0 ? "This Week" : formatRange(monday)}
          </Text>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
            {formatRange(monday)}
          </Text>
        </View>
        {offset < 0 ? (
          <Button variant="ghost" size="icon" icon={ChevronRight} onPress={() => setOffset(offset + 1)} accessibilityLabel="Next week" style={styles.chevron} />
        ) : (
          <View style={{ width: 48 }} />
        )}
      </View>

      {offset !== 0 && (
        <View style={{ alignItems: "center", marginBottom: 8 }}>
          <Button
            variant="secondary"
            size="sm"
            onPress={() => setOffset(0)}
            accessibilityLabel="Go to current week"
          >
            <Text>Today</Text>
          </Button>
        </View>
      )}

      {data.length === 0 ? (
        <Card style={StyleSheet.flatten([styles.card, { backgroundColor: colors.surface }])}>
          <CardContent>
            <Text
              variant="body"
              style={{ color: colors.onSurfaceVariant, textAlign: "center", padding: 32 }}
            >
              No workouts this week. Complete a session to see muscle volume.
            </Text>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Volume Bars + Trend flow side by side on tablet */}
          <View style={layout.atLeastMedium ? styles.flowRow : undefined}>
          <Card style={StyleSheet.flatten([styles.card, layout.atLeastMedium && styles.flowCard, { backgroundColor: colors.surface }])}>
            <VolumeBarChart
              data={data}
              selected={selected}
              maxSets={maxSets}
              onSelect={selectMuscle}
              colors={colors}
            />
          </Card>

          <Card style={StyleSheet.flatten([styles.card, layout.atLeastMedium && styles.flowCard, { backgroundColor: colors.surface }])}>
            <VolumeTrendChart
              selected={selected}
              trend={trend}
              hasEnoughTrend={hasEnoughTrend}
              chartWidth={chartWidth}
              reduced={reduced}
              colors={colors}
            />
          </Card>

          </View>

          {/* Muscle Detail List */}
          <Card style={StyleSheet.flatten([styles.card, { backgroundColor: colors.surface }])}>
            <CardContent>
              <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 8 }}>
                Muscle Group Details
              </Text>
              <FlatList
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
            </CardContent>
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

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
  },
});
