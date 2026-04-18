import { useCallback } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Text } from "@/components/ui/text";
import { useFocusEffect, useRouter } from "expo-router";
import { useLayout } from "../../lib/layout";
import { useFloatingTabBarHeight } from "../../components/FloatingTabBar";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useNutritionProgress, type NutritionPeriod } from "@/hooks/useNutritionProgress";
import {
  CalorieTrendCard,
  WeeklyAveragesCard,
  AdherenceCard,
  MacroTrendCard,
} from "./NutritionCards";

const PERIODS: { value: NutritionPeriod; label: string }[] = [
  { value: 4, label: "4W" },
  { value: 8, label: "8W" },
  { value: 12, label: "12W" },
];

export default function NutritionSegment() {
  const colors = useThemeColors();
  const layout = useLayout();
  const tabBarHeight = useFloatingTabBarHeight();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();

  const {
    dailyTotals,
    weeklyAverages,
    adherence,
    targets,
    period,
    setPeriod,
    loading,
    error,
    refetch,
    reducedMotion,
  } = useNutritionProgress();

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const chartWidth = layout.atLeastMedium
    ? (screenWidth - 96) / 2 - 32
    : screenWidth - 48;

  // Error state
  if (error) {
    return (
      <View style={[styles.center, { flex: 1 }]}>
        <Card style={styles.errorCard}>
          <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 8 }}>
            Couldn&apos;t load nutrition data
          </Text>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginBottom: 16 }}>
            {error.message}
          </Text>
          <Button
            variant="outline"
            onPress={refetch}
            accessibilityLabel="Retry loading nutrition data"
            label="Retry"
          />
        </Card>
      </View>
    );
  }

  // Loading state — skeleton placeholders
  if (loading) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 16 }]}
      >
        <SkeletonCard colors={colors} height={40} />
        <SkeletonCard colors={colors} height={200} />
        <SkeletonCard colors={colors} height={120} />
        <SkeletonCard colors={colors} height={160} />
        <SkeletonCard colors={colors} height={180} />
      </ScrollView>
    );
  }

  // Empty state — no nutrition data at all
  if (dailyTotals.length === 0) {
    return (
      <View style={[styles.center, { flex: 1 }]}>
        <Text style={{ fontSize: 40, marginBottom: 8 }}>🥗</Text>
        <Text
          style={{
            color: colors.onSurfaceVariant,
            textAlign: "center",
            padding: 16,
            maxWidth: 280,
          }}
        >
          Start tracking your meals in the Nutrition tab to see trends here.
        </Text>
        <Button
          variant="default"
          onPress={() => router.push("/(tabs)/nutrition")}
          accessibilityLabel="Go to Nutrition tab"
          label="Go to Nutrition"
          style={{ marginTop: 8 }}
        />
      </View>
    );
  }

  const insufficientData = dailyTotals.length < 3;
  const noTargets = !targets;
  const wideCard = layout.atLeastMedium ? styles.wideCard : undefined;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 16 }]}
    >
      {/* Period selector */}
      <View style={styles.periodRow}>
        {PERIODS.map((p) => (
          <Chip
            key={p.value}
            selected={period === p.value}
            onPress={() => setPeriod(p.value)}
            accessibilityLabel={`${p.label} period`}
            accessibilityRole="button"
            accessibilityState={{ selected: period === p.value }}
            style={{ minWidth: 48, minHeight: 48 }}
          >
            {p.label}
          </Chip>
        ))}
      </View>

      {/* Info banners */}
      {insufficientData && (
        <Card style={[styles.infoBanner, { backgroundColor: colors.surfaceVariant }]}>
          <Text style={{ color: colors.onSurfaceVariant }}>
            Track for a few more days to see meaningful trends.
          </Text>
        </Card>
      )}
      {noTargets && (
        <Card style={[styles.infoBanner, { backgroundColor: colors.surfaceVariant }]}>
          <Text style={{ color: colors.onSurfaceVariant }}>
            Set your macro targets to see adherence tracking.
          </Text>
          <Button
            variant="ghost"
            size="sm"
            onPress={() => router.push("/(tabs)/nutrition")}
            label="Set Targets"
            style={{ marginTop: 4, alignSelf: "flex-start" }}
          />
        </Card>
      )}

      {/* Cards */}
      {layout.atLeastMedium ? (
        <>
          <View style={styles.grid}>
            <CalorieTrendCard
              dailyTotals={dailyTotals}
              calorieTarget={targets?.calories ?? null}
              chartWidth={chartWidth}
              reducedMotion={reducedMotion}
              style={wideCard}
            />
            <WeeklyAveragesCard
              weeklyAverages={weeklyAverages}
              style={wideCard}
            />
          </View>
          <View style={styles.grid}>
            {adherence && <AdherenceCard adherence={adherence} style={wideCard} />}
            <MacroTrendCard
              weeklyAverages={weeklyAverages}
              chartWidth={chartWidth}
              reducedMotion={reducedMotion}
              style={wideCard}
            />
          </View>
        </>
      ) : (
        <>
          <CalorieTrendCard
            dailyTotals={dailyTotals}
            calorieTarget={targets?.calories ?? null}
            chartWidth={chartWidth}
            reducedMotion={reducedMotion}
          />
          <WeeklyAveragesCard weeklyAverages={weeklyAverages} />
          {adherence && <AdherenceCard adherence={adherence} />}
          <MacroTrendCard
            weeklyAverages={weeklyAverages}
            chartWidth={chartWidth}
            reducedMotion={reducedMotion}
          />
        </>
      )}
    </ScrollView>
  );
}

function SkeletonCard({ colors, height }: { colors: ReturnType<typeof useThemeColors>; height: number }) {
  return (
    <View
      style={[
        styles.skeleton,
        {
          height,
          backgroundColor: colors.surfaceVariant,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 16,
    paddingBottom: 80,
  },
  periodRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  infoBanner: {
    marginBottom: 12,
    padding: 12,
  },
  grid: {
    flexDirection: "row",
    gap: 16,
  },
  wideCard: {
    flex: 1,
  },
  errorCard: {
    margin: 32,
    alignItems: "center",
  },
  skeleton: {
    borderRadius: 12,
    marginBottom: 16,
    opacity: 0.5,
  },
});
