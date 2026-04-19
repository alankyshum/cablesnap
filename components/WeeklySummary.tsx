import React from "react";
import {
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import Animated from "react-native-reanimated";

import { useWeeklySummary, formatWeekRange } from "@/hooks/useWeeklySummary";
import { SummaryDetailSections } from "@/components/weekly-summary/SummaryDetailSections";
import { useThemeColors } from "@/hooks/useThemeColors";

// ─── Component ─────────────────────────────────────────────────────

export default function WeeklySummary() {
  const colors = useThemeColors();
  const {
    data, loading, error, expanded, setExpanded,
    weekOffset, weekStartMs, unit, canGoBack, canGoForward,
    navigateWeek, handleShare, expandAnimStyle, volChange,
  } = useWeeklySummary();

  if (error) {
    return (
      <View accessibilityLabel="Weekly summary unavailable">
      <Card
        style={StyleSheet.flatten([styles.card, { backgroundColor: colors.surface }])}
      >
        <CardContent>
          <Text
            variant="body"
            style={{ color: colors.onSurfaceVariant, textAlign: "center" }}
          >
            Couldn&apos;t load summary
          </Text>
        </CardContent>
      </Card>
      </View>
    );
  }

  if (loading || !data) {
    return (
      <Card style={StyleSheet.flatten([styles.card, { backgroundColor: colors.surface }])}>
        <CardContent>
          <View style={styles.headerRow}>
            <Text variant="subtitle" style={{ color: colors.onSurface }}>
              📊 Loading…
            </Text>
          </View>
        </CardContent>
      </Card>
    );
  }

  const { workouts, prs } = data;
  const isEmpty = workouts.sessionCount === 0;

  const headlineParts: string[] = [];
  if (workouts.scheduledCount !== null) {
    headlineParts.push(`${workouts.sessionCount}/${workouts.scheduledCount} workouts`);
  } else {
    headlineParts.push(
      `${workouts.sessionCount} workout${workouts.sessionCount !== 1 ? "s" : ""}`
    );
  }
  if (volChange) headlineParts.push(`${volChange} volume`);
  if (prs.length > 0) headlineParts.push(`${prs.length} PR${prs.length !== 1 ? "s" : ""}`);

  const headline = headlineParts.join("  ·  ");

  return (
    <View
      accessibilityLabel={`Weekly summary for ${formatWeekRange(weekStartMs)}`}
      accessibilityState={{ expanded }}
    >
    <Card
      style={StyleSheet.flatten([styles.card, { backgroundColor: colors.surface }])}
    >
      <CardContent>
        <View style={styles.headerRow}>
          <Text style={{ fontSize: 20, marginRight: 8 }}>📊</Text>
          <Text
            variant="subtitle"
            style={{ color: colors.onSurface, flex: 1 }}
          >
            Week of {formatWeekRange(weekStartMs)}
          </Text>
          <Button
            variant="ghost"
            size="icon"
            icon={ChevronLeft}
            onPress={() => navigateWeek(-1)}
            disabled={!canGoBack}
            accessibilityLabel="Previous week"
            style={styles.navButton}
          />
          <Button
            variant="ghost"
            size="icon"
            icon={ChevronRight}
            onPress={() => navigateWeek(1)}
            disabled={!canGoForward}
            accessibilityLabel="Next week"
            style={styles.navButton}
          />
        </View>

        {isEmpty ? (
          <Text
            variant="body"
            style={{ color: colors.onSurfaceVariant, marginTop: 8 }}
          >
            No workouts logged this week. Start one from the Workouts tab!
          </Text>
        ) : (
          <>
            <Text
              variant="body"
              style={{ color: colors.onSurfaceVariant, marginTop: 4 }}
              accessibilityLabel={headline}
            >
              {headline}
            </Text>

            <Pressable
              onPress={() => setExpanded(!expanded)}
              accessibilityHint="Double tap to expand weekly summary"
              accessibilityRole="button"
              style={styles.toggleButton}
              hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
            >
              <Text
                variant="body"
                style={{ color: colors.primary }}
              >
                {expanded ? "Hide Details" : "View Details"}
              </Text>
            </Pressable>

            <Animated.View style={expandAnimStyle}>
              <View style={styles.expandedContent}>
                <SummaryDetailSections
                  data={data}
                  unit={unit}
                  weekOffset={weekOffset}
                  volChange={volChange}
                  handleShare={handleShare}
                  colors={colors}
                />
              </View>
            </Animated.View>
          </>
        )}
      </CardContent>
    </Card>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  navButton: {
    margin: 0,
    width: 48,
    height: 48,
  },
  toggleButton: {
    paddingVertical: 8,
    alignSelf: "flex-start",
    minHeight: 48,
    justifyContent: "center",
  },
  expandedContent: {
    paddingTop: 0,
  },
});
