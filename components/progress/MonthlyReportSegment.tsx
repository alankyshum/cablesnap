import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useLayout } from "@/lib/layout";
import { useFloatingTabBarHeight } from "@/components/FloatingTabBar";
import { spacing, fontSizes } from "@/constants/design-tokens";
import { useMonthlyReport, formatMonthLabel, formatVolume } from "@/hooks/useMonthlyReport";
import { toDisplay } from "@/lib/units";
import MonthlyShareCard from "@/components/share/MonthlyShareCard";
import {
  HeroStatsCard,
  ConsistencyCard,
  PRsCard,
  MuscleBalanceCard,
  MostImprovedCard,
  BodyCard,
  NutritionCard,
} from "./MonthlyReportCards";

export default function MonthlyReportSegment() {
  const colors = useThemeColors();
  const layout = useLayout();
  const tabBarHeight = useFloatingTabBarHeight();
  const {
    data,
    loading,
    error,
    year,
    monthIndex,
    unit,
    canGoBack,
    canGoForward,
    navigateMonth,
    handleShare,
    shareCardRef,
    imageLoading,
    volChange,
    sessionDelta,
  } = useMonthlyReport();

  const monthLabel = formatMonthLabel(year, monthIndex);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  // ── Loading ────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.center, { paddingHorizontal: layout.horizontalPadding }]}>
        <Text style={{ color: colors.onSurfaceVariant }}>Loading…</Text>
      </View>
    );
  }

  // ── Error ──────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <View style={[styles.center, { paddingHorizontal: layout.horizontalPadding }]}>
        <Text style={{ color: colors.onSurfaceVariant }}>
          Couldn{"'"}t load report
        </Text>
      </View>
    );
  }

  // ── Empty state ────────────────────────────────────────────────
  const isEmpty = data.workouts.sessionCount < 2;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.content,
        { paddingHorizontal: layout.horizontalPadding, paddingBottom: tabBarHeight + 16 },
      ]}
    >
      {/* Month navigation */}
      <View style={styles.navRow}>
        <Pressable
          onPress={() => navigateMonth(-1)}
          disabled={!canGoBack}
          accessibilityLabel="Previous month"
          accessibilityRole="button"
          style={{ opacity: canGoBack ? 1 : 0.3 }}
        >
          <ChevronLeft size={24} color={colors.onSurface} />
        </Pressable>
        <Text
          style={[styles.monthLabel, { color: colors.onSurface }]}
          accessibilityRole="header"
        >
          {monthLabel}
        </Text>
        <Pressable
          onPress={() => navigateMonth(1)}
          disabled={!canGoForward}
          accessibilityLabel="Next month"
          accessibilityRole="button"
          style={{ opacity: canGoForward ? 1 : 0.3 }}
        >
          <ChevronRight size={24} color={colors.onSurface} />
        </Pressable>
      </View>

      {isEmpty ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons
            name="dumbbell"
            size={48}
            color={colors.onSurfaceVariant}
          />
          <Text style={[styles.emptyTitle, { color: colors.onSurface }]}>
            {data.workouts.sessionCount === 0
              ? "No workouts this month"
              : "Just getting started!"}
          </Text>
          <Text style={[styles.emptyBody, { color: colors.onSurfaceVariant }]}>
            {data.workouts.sessionCount === 0
              ? "Complete some workouts to see your monthly recap."
              : "Complete a few more workouts to unlock your full monthly report."}
          </Text>
        </View>
      ) : (
        <View style={styles.cards}>
          <HeroStatsCard
            data={data}
            unit={unit}
            volChange={volChange}
            sessionDelta={sessionDelta}
          />

          <ConsistencyCard
            trainingDays={data.trainingDays}
            longestStreak={data.longestStreak}
            daysInMonth={daysInMonth}
          />

          <PRsCard prs={data.prs} unit={unit} />
          <MuscleBalanceCard distribution={data.muscleDistribution} />
          <MostImprovedCard data={data.mostImproved} />
          <BodyCard data={data.body} unit={unit} />
          <NutritionCard data={data.nutrition} />

          {/* Share button */}
          <Button
            onPress={handleShare}
            disabled={imageLoading}
            accessibilityLabel="Share monthly report"
          >
            <View style={styles.shareRow}>
              <MaterialCommunityIcons
                name="share-variant"
                size={18}
                color={colors.onPrimary}
              />
              <Text style={[styles.shareText, { color: colors.onPrimary }]}>
                {imageLoading ? "Generating…" : "Share Report"}
              </Text>
            </View>
          </Button>
        </View>
      )}

      {/* Offscreen share card for image capture */}
      {data && !isEmpty && (
        <View
          ref={shareCardRef}
          collapsable={false}
          style={styles.offscreen}
        >
          <MonthlyShareCard
            monthLabel={monthLabel}
            sessionCount={data.workouts.sessionCount}
            volume={formatVolume(toDisplay(data.workouts.totalVolume, unit))}
            unit={unit}
            prCount={data.prs.length}
            longestStreak={data.longestStreak}
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingVertical: spacing.base,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  navRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.base,
  },
  monthLabel: {
    fontSize: fontSizes.xl,
    fontWeight: "700",
  },
  emptyContainer: {
    alignItems: "center",
    paddingTop: spacing.xxxl,
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: fontSizes.lg,
    fontWeight: "700",
  },
  emptyBody: {
    fontSize: fontSizes.base,
    textAlign: "center",
    maxWidth: 280,
  },
  cards: {
    gap: spacing.md,
  },
  shareRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  shareText: {
    fontSize: fontSizes.base,
    fontWeight: "600",
  },
  offscreen: {
    position: "absolute",
    left: -9999,
    top: -9999,
    opacity: 0,
  },
});
