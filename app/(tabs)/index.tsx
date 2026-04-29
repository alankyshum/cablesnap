import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { startSession, setAppSetting } from "../../lib/db";
import { serializeDismissalState } from "../../lib/overreaching";
import { useFocusRefetch } from "../../lib/query";
import { useLayout } from "../../lib/layout";
import { useFloatingTabBarHeight } from "../../components/FloatingTabBar";
import HomeBanners from "../../components/home/HomeBanners";
import AdherenceBar from "../../components/home/AdherenceBar";
import RecentWorkoutsList from "../../components/home/RecentWorkoutsList";
import StatsRow from "../../components/home/StatsRow";
import InsightCard from "../../components/home/InsightCard";
import DeloadNudgeCard from "../../components/home/DeloadNudgeCard";
import ErrorBoundary from "../../components/ErrorBoundary";
import { RecoveryHeatmap } from "../../components/home/RecoveryHeatmap";
import { TemplatesList } from "../../components/home/TemplatesList";
import { ProgramsList } from "../../components/home/ProgramsList";
import WeeklySummaryCard from "../../components/home/WeeklySummaryCard";
import { loadHomeData } from "../../components/home/loadHomeData";
import type { WeeklyGoalProgress } from "../../components/home/loadHomeData";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useHomeActions } from "@/hooks/useHomeActions";

const defaultProgress: WeeklyGoalProgress = { mode: "hidden", slots: [], completedCount: 0, targetCount: 0 };

// eslint-disable-next-line complexity
export default function Workouts() {
  const colors = useThemeColors();
  const layout = useLayout();
  const tabBarHeight = useFloatingTabBarHeight();
  const [userSegment, setUserSegment] = useState<string | null>(null);
  const [insightDismissed, setInsightDismissed] = useState(false);
  const [deloadDismissed, setDeloadDismissed] = useState(false);

  const { data } = useQuery({ queryKey: ["home"], queryFn: loadHomeData });
  useFocusRefetch(["home"]);
  const queryClient = useQueryClient();
  const { router, info, starterMeta, quickStart, startFromTemplate, confirmDelete, confirmDeleteProgram, showTemplateOptions, showProgramOptions, importTemplates } = useHomeActions();

  const templates = useMemo(() => data?.templates ?? [], [data?.templates]);
  const programs = useMemo(() => data?.programs ?? [], [data?.programs]);
  const adherence = useMemo(() => data?.adherence ?? [], [data?.adherence]);
  const allTemplates = useMemo(() => [...templates.filter((t) => !t.is_starter), ...templates.filter((t) => t.is_starter)], [templates]);
  const allPrograms = useMemo(() => [...programs.filter((p) => !p.is_starter), ...programs.filter((p) => p.is_starter)], [programs]);
  const progress = data?.weeklyGoalProgress ?? defaultProgress;

  const nextWorkout = data?.nextWorkout ?? null;
  const segment = userSegment ?? (nextWorkout ? "programs" : "templates");
  const todaySchedule = data?.todaySchedule ?? null;
  const insight = data?.insight ?? null;
  const overreachingResult = data?.overreachingResult ?? null;
  const showDeloadNudge = overreachingResult != null && !deloadDismissed;

  const dismissDeloadNudge = useCallback(async () => {
    setDeloadDismissed(true);
    try {
      const state = serializeDismissalState({
        dismissedAt: Date.now(),
        scoreAtDismissal: overreachingResult?.score ?? 0,
      });
      await setAppSetting("deload_nudge_dismissal", state);
      queryClient.invalidateQueries({ queryKey: ["home"] });
    } catch {
      // Persist failed — local dismiss is still applied
    }
  }, [overreachingResult, queryClient]);

  const startNextWorkout = useCallback(async () => {
    if (!nextWorkout) return;
    if (!nextWorkout.day.template_id) { info("Template no longer exists"); return; }
    const s = await startSession(nextWorkout.day.template_id, nextWorkout.day.label || nextWorkout.day.template_name || nextWorkout.program.name, nextWorkout.day.id);
    router.push(`/session/${s.id}?templateId=${nextWorkout.day.template_id}`);
  }, [nextWorkout, info, router]);

  const startFromSchedule = useCallback(async () => {
    if (!todaySchedule) return;
    const s = await startSession(todaySchedule.template_id, todaySchedule.template_name);
    router.push(`/session/${s.id}?templateId=${todaySchedule.template_id}`);
  }, [todaySchedule, router]);

  return (
    // bounded list — ScrollView is intentional: renders fixed sub-components (stats, banners, templates/programs), not unbounded .map()
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={{ paddingHorizontal: layout.horizontalPadding, paddingVertical: 16, paddingBottom: tabBarHeight + 16 }}>
      <StatsRow colors={colors} streak={data?.streak ?? 0} progress={progress} prCount={(data?.recentPRs ?? []).length} />
      <ErrorBoundary>
        {showDeloadNudge ? (
          <DeloadNudgeCard colors={colors} result={overreachingResult!} onDismiss={dismissDeloadNudge} />
        ) : (
          insight && !insightDismissed && (
            <InsightCard colors={colors} insight={insight} onPress={() => { if ((insight.type === "strength" || insight.type === "goal_progress") && insight.exerciseId) router.push(`/exercise/${insight.exerciseId}`); }} onDismiss={() => setInsightDismissed(true)} />
          )
        )}
      </ErrorBoundary>
      <HomeBanners colors={colors} active={data?.active ?? null} todaySchedule={todaySchedule} todayDone={data?.todayDone ?? false} adherence={adherence} nextWorkout={nextWorkout} onResumeSession={(id) => router.push(`/session/${id}`)} onStartFromSchedule={startFromSchedule} onStartNextWorkout={startNextWorkout} />
      <AdherenceBar colors={colors} progress={progress} />
      <WeeklySummaryCard
        colors={colors}
        totalVolume={data?.weeklyWorkouts?.totalVolume ?? 0}
        previousWeekVolume={data?.weeklyWorkouts?.previousWeekVolume ?? null}
        totalDurationSeconds={data?.weeklyWorkouts?.totalDurationSeconds ?? 0}
        sessionCount={data?.weeklyWorkouts?.sessionCount ?? 0}
        unitSystem={data?.unitSystem ?? "kg"}
      />
      <RecoveryHeatmap recoveryStatus={data?.recoveryStatus ?? []} colors={colors} />

      <View style={styles.actionRow}>
        <Button variant="default" onPress={quickStart} accessibilityLabel="Quick start workout">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <MaterialCommunityIcons name="flash" size={18} color={colors.onPrimary} />
            <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>Quick Start</Text>
          </View>
        </Button>
      </View>

      <SegmentedControl value={segment} onValueChange={(v) => setUserSegment(v)} buttons={[{ value: "templates", label: "Templates", accessibilityLabel: "Templates tab" }, { value: "programs", label: "Programs", accessibilityLabel: "Programs tab" }]} style={styles.segmented} />

      {segment === "templates" ? (
        <TemplatesList colors={colors} templates={allTemplates} counts={data?.counts ?? {}} durationEstimates={data?.durationEstimates ?? {}} starterMeta={starterMeta} templateReadiness={data?.templateReadiness ?? {}} showReadiness={data?.showReadiness ?? false} onStart={startFromTemplate} onDelete={confirmDelete} onOptions={showTemplateOptions} onEdit={(id) => router.push(`/template/${id}`)} onImport={() => void importTemplates()} />
      ) : (
        <ProgramsList colors={colors} programs={allPrograms} dayCounts={data?.dayCounts ?? {}} onPress={(id) => router.push(`/program/${id}`)} onDelete={confirmDeleteProgram} onOptions={showProgramOptions} />
      )}

      <RecentWorkoutsList colors={colors} sessions={data?.sessions ?? []} setCounts={data?.setCounts ?? {}} avgRPEs={data?.avgRPEs ?? {}} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  actionRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" },
  segmented: { marginBottom: 16 },
});
