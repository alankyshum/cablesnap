import React from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useThemeColors } from "@/hooks/useThemeColors";
import { usePRDashboard } from "@/hooks/usePRDashboard";
import EmptyState from "@/components/EmptyState";
import PRStatsRow from "@/components/progress/records/PRStatsRow";
import RecentPRList from "@/components/progress/records/RecentPRList";
import AllTimeBestsSection from "@/components/progress/records/AllTimeBestsSection";
import PRDashboardError from "@/components/progress/records/PRDashboardError";

export default function RecordsPage() {
  const colors = useThemeColors();
  const router = useRouter();
  const { stats, recentPRs, allTimeBests, weightUnit, loading, error, reload } =
    usePRDashboard();

  const navigateToExercise = (exerciseId: string) => {
    router.push(`/exercise/${exerciseId}`);
  };

  const isEmpty =
    !loading && stats.totalPRs === 0 && recentPRs.length === 0 && allTimeBests.length === 0;

  return (
    <>
      <Stack.Screen options={{ title: "Personal Records" }} />
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : error ? (
          <PRDashboardError error={error} onRetry={reload} />
        ) : isEmpty ? (
          <EmptyState
            icon="trophy-outline"
            title="No Records Yet"
            subtitle="Complete your first workout to start tracking personal records!"
          />
        ) : (
          <>
            <PRStatsRow stats={stats} />
            <RecentPRList
              prs={recentPRs}
              weightUnit={weightUnit}
              onPressExercise={navigateToExercise}
            />
            <AllTimeBestsSection
              bests={allTimeBests}
              weightUnit={weightUnit}
              onPressExercise={navigateToExercise}
            />
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
  },
});
