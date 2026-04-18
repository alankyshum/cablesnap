import { useState } from "react";
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getNextWorkout, getPrograms, getProgramDayCount, softDeleteProgram } from "../../lib/programs";
import {
  deleteTemplate, duplicateTemplate, duplicateProgram, getActiveSession,
  getAllCompletedSessionWeeks, getRecentPRs, getRecentSessions,
  getSessionAvgRPE, getSessionSetCount, getTemplateExerciseCount,
  getTemplates, getTodaySchedule, getWeekAdherence, isTodayCompleted, startSession,
} from "../../lib/db";
import type { Program, WorkoutTemplate } from "../../lib/types";
import { rpeColor, rpeText } from "../../lib/rpe";
import { STARTER_TEMPLATES } from "../../lib/starter-templates";
import { computeStreak } from "../../lib/format";
import { FlowCard, difficultyBadge, type MetaBadge } from "../../components/FlowCard";
import { useFocusRefetch } from "../../lib/query";
import { useToast } from "../../components/ui/bna-toast";
import { useLayout } from "../../lib/layout";
import { flowCardStyle } from "../../components/ui/FlowContainer";
import { useFloatingTabBarHeight } from "../../components/FloatingTabBar";
import HomeBanners from "../../components/home/HomeBanners";
import AdherenceBar from "../../components/home/AdherenceBar";
import RecentWorkoutsList from "../../components/home/RecentWorkoutsList";
import StatsRow from "../../components/home/StatsRow";
import { useThemeColors } from "@/hooks/useThemeColors";

async function loadHomeData() {
  const [tpls, sess, act, timestamps, prData, progs, nw, sched, done, adh] = await Promise.all([
    getTemplates(), getRecentSessions(5), getActiveSession(), getAllCompletedSessionWeeks(),
    getRecentPRs(5), getPrograms(), getNextWorkout(), getTodaySchedule(), isTodayCompleted(), getWeekAdherence(),
  ]);
  const counts: Record<string, number> = {};
  for (const t of tpls) counts[t.id] = await getTemplateExerciseCount(t.id);
  const setCounts: Record<string, number> = {};
  const avgRPEs: Record<string, number | null> = {};
  for (const s of sess) { setCounts[s.id] = await getSessionSetCount(s.id); avgRPEs[s.id] = await getSessionAvgRPE(s.id); }
  const dayCounts: Record<string, number> = {};
  for (const p of progs) dayCounts[p.id] = await getProgramDayCount(p.id);
  return { templates: tpls, sessions: sess, active: act, streak: computeStreak(timestamps), recentPRs: prData, programs: progs, nextWorkout: nw, todaySchedule: sched, todayDone: done, adherence: adh, counts, setCounts, avgRPEs, dayCounts };
}

export default function Workouts() {
  const colors = useThemeColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { info } = useToast();
  const layout = useLayout();
  const tabBarHeight = useFloatingTabBarHeight();
  const [userSegment, setUserSegment] = useState<string | null>(null);

  const { data } = useQuery({ queryKey: ["home"], queryFn: loadHomeData });
  useFocusRefetch(["home"]);

  const templates = data?.templates ?? [];
  const programs = data?.programs ?? [];
  const dayCounts = data?.dayCounts ?? {};
  const sessions = data?.sessions ?? [];
  const counts = data?.counts ?? {};
  const setCounts2 = data?.setCounts ?? {};
  const active = data?.active ?? null;
  const streak = data?.streak ?? 0;
  const recentPRs = data?.recentPRs ?? [];
  const avgRPEs = data?.avgRPEs ?? {};
  const nextWorkout = data?.nextWorkout ?? null;
  const segment = userSegment ?? (nextWorkout ? "programs" : "templates");
  const todaySchedule = data?.todaySchedule ?? null;
  const todayDone = data?.todayDone ?? false;
  const adherence = data?.adherence ?? [];

  const reload = () => queryClient.invalidateQueries({ queryKey: ["home"] });
  const starterMeta = (id: string) => STARTER_TEMPLATES.find((s) => s.id === id);

  const quickStart = async () => { const s = await startSession(null, "Quick Workout"); router.push(`/session/${s.id}`); };
  const startFromTemplate = async (tpl: WorkoutTemplate) => { const s = await startSession(tpl.id, tpl.name); router.push(`/session/${s.id}?templateId=${tpl.id}`); };
  const startNextWorkout = async () => {
    if (!nextWorkout) return;
    if (!nextWorkout.day.template_id) { info("Template no longer exists"); return; }
    const s = await startSession(nextWorkout.day.template_id, nextWorkout.day.label || nextWorkout.day.template_name || nextWorkout.program.name, nextWorkout.day.id);
    router.push(`/session/${s.id}?templateId=${nextWorkout.day.template_id}`);
  };
  const startFromSchedule = async () => {
    if (!todaySchedule) return;
    const s = await startSession(todaySchedule.template_id, todaySchedule.template_name);
    router.push(`/session/${s.id}?templateId=${todaySchedule.template_id}`);
  };

  const confirmDelete = (tpl: WorkoutTemplate) => {
    if (tpl.is_starter) return;
    Alert.alert("Delete Template", `Delete "${tpl.name}"? Past workout data will be preserved.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await deleteTemplate(tpl.id); reload(); } },
    ]);
  };
  const confirmDeleteProgram = (prog: Program) => {
    if (prog.is_starter) return;
    Alert.alert("Delete Program", `Delete "${prog.name}"? Past workout data will be preserved.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await softDeleteProgram(prog.id); reload(); } },
    ]);
  };
  const handleDuplicateTemplate = async (tpl: WorkoutTemplate) => { const id = await duplicateTemplate(tpl.id); reload(); router.push(`/template/${id}`); };
  const handleDuplicateProgram = async (prog: Program) => { const id = await duplicateProgram(prog.id); reload(); router.push(`/program/${id}`); };
  const showTemplateOptions = (item: WorkoutTemplate) => {
    const meta = starterMeta(item.id);
    Alert.alert(meta?.name || item.name, undefined, [{ text: "Duplicate", onPress: () => handleDuplicateTemplate(item) }, { text: "Cancel", style: "cancel" }]);
  };
  const showProgramOptions = (item: Program) => {
    Alert.alert(item.name, undefined, [{ text: "Duplicate", onPress: () => handleDuplicateProgram(item) }, { text: "Cancel", style: "cancel" }]);
  };

  const allTemplates = [...templates.filter((t) => !t.is_starter), ...templates.filter((t) => t.is_starter)];
  const allPrograms = [...programs.filter((p) => !p.is_starter), ...programs.filter((p) => p.is_starter)];

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={{ paddingHorizontal: layout.horizontalPadding, paddingVertical: 16, paddingBottom: tabBarHeight + 16 }}>
      <StatsRow colors={colors} streak={streak} weekDone={adherence.filter((a) => a.completed).length} scheduled={adherence.filter((a) => a.scheduled)} prCount={recentPRs.length} />
      <HomeBanners colors={colors} active={active} todaySchedule={todaySchedule} todayDone={todayDone} adherence={adherence} nextWorkout={nextWorkout} onResumeSession={(id) => router.push(`/session/${id}`)} onStartFromSchedule={startFromSchedule} onStartNextWorkout={startNextWorkout} />
      <AdherenceBar colors={colors} adherence={adherence} />

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
        <TemplatesList colors={colors} templates={allTemplates} counts={counts} starterMeta={starterMeta} onStart={startFromTemplate} onDelete={confirmDelete} onOptions={showTemplateOptions} onEdit={(id) => router.push(`/template/${id}`)} />
      ) : (
        <ProgramsList colors={colors} programs={allPrograms} dayCounts={dayCounts} onPress={(id) => router.push(`/program/${id}`)} onDelete={confirmDeleteProgram} onOptions={showProgramOptions} />
      )}

      <RecentWorkoutsList colors={colors} sessions={sessions} setCounts={setCounts2} avgRPEs={avgRPEs} />
    </ScrollView>
  );
}

/* ── Inline sub-components ── */

function TemplatesList({ colors, templates, counts, starterMeta, onStart, onDelete, onOptions, onEdit }: {
  colors: ReturnType<typeof useThemeColors>; templates: WorkoutTemplate[]; counts: Record<string, number>;
  starterMeta: (id: string) => (typeof STARTER_TEMPLATES)[number] | undefined;
  onStart: (t: WorkoutTemplate) => void; onDelete: (t: WorkoutTemplate) => void; onOptions: (t: WorkoutTemplate) => void; onEdit: (id: string) => void;
}) {
  const router = useRouter();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text variant="subtitle" style={{ color: colors.onBackground }}>Templates</Text>
        <Button variant="ghost" size="sm" onPress={() => router.push("/template/create")} accessibilityLabel="Create new template">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><MaterialCommunityIcons name="plus" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 14 }}>Create</Text></View>
        </Button>
      </View>
      {templates.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: colors.onSurfaceVariant }}>Create your first workout template</Text>
          <Button variant="outline" onPress={() => router.push("/template/create")} style={styles.emptyBtn} accessibilityLabel="Create your first template" label="Create Template" />
        </View>
      ) : (
        <FlatList data={templates} keyExtractor={(i) => i.id} scrollEnabled={false} contentContainerStyle={styles.flowList} renderItem={({ item }) => {
          const meta = starterMeta(item.id);
          const isStarter = !!meta || item.is_starter;
          const metaBadges: MetaBadge[] = meta ? [difficultyBadge(meta.difficulty), { icon: "clock-outline", label: meta.duration }, { icon: "dumbbell", label: `${meta.exercises.length} exercises` }] : [{ icon: "dumbbell", label: `${counts[item.id] ?? 0} exercises` }];
          if (isStarter) metaBadges.push({ icon: "star-outline", label: "Starter" });
          const badges: { label: string; type: "active" | "starter" | "recommended" }[] = [];
          if (meta?.recommended) badges.push({ label: "RECOMMENDED", type: "recommended" });
          return (
            <FlowCard key={item.id} name={meta?.name || item.name} onPress={() => onStart(item)} onLongPress={!isStarter ? () => onDelete(item) : undefined}
              accessibilityLabel={`${isStarter ? "Starter template" : "Start workout from template"}: ${meta?.name || item.name}, ${counts[item.id] ?? 0} exercises`}
              accessibilityHint={isStarter ? "Double-tap to start workout" : undefined} badges={badges} meta={metaBadges}
              action={isStarter
                ? <Pressable onPress={() => onOptions(item)} accessibilityLabel={`Options for ${meta?.name || item.name}`} hitSlop={8} style={{ padding: 8 }}><MaterialCommunityIcons name="dots-vertical" size={20} color={colors.onSurfaceVariant} /></Pressable>
                : <Pressable onPress={() => onEdit(item.id)} accessibilityLabel={`Edit template ${item.name}`} hitSlop={8} style={{ padding: 8 }}><MaterialCommunityIcons name="pencil" size={20} color={colors.onSurfaceVariant} /></Pressable>
              } />
          );
        }} />
      )}
    </View>
  );
}

function ProgramsList({ colors, programs, dayCounts, onPress, onDelete, onOptions }: {
  colors: ReturnType<typeof useThemeColors>; programs: Program[]; dayCounts: Record<string, number>;
  onPress: (id: string) => void; onDelete: (p: Program) => void; onOptions: (p: Program) => void;
}) {
  const router = useRouter();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text variant="subtitle" style={{ color: colors.onBackground }}>Programs</Text>
        <Button variant="ghost" size="sm" onPress={() => router.push("/program/create")} accessibilityLabel="Create new program">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><MaterialCommunityIcons name="plus" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 14 }}>Create</Text></View>
        </Button>
      </View>
      {programs.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: colors.onSurfaceVariant }} accessibilityRole="text" accessibilityLabel="No programs yet. Create your first program.">Create your first program</Text>
          <Button variant="outline" onPress={() => router.push("/program/create")} style={styles.emptyBtn} accessibilityLabel="Create your first program" label="Create Program" />
        </View>
      ) : (
        <FlatList data={programs} keyExtractor={(i) => i.id} scrollEnabled={false} contentContainerStyle={styles.flowList} renderItem={({ item }) => {
          const badges: { label: string; type: "active" | "starter" | "recommended" }[] = [];
          if (item.is_active) badges.push({ label: "ACTIVE", type: "active" });
          const metaBadges: MetaBadge[] = [item.is_starter ? difficultyBadge("intermediate") : { icon: "signal-cellular-2", label: "Custom" }, { icon: "calendar-blank-outline", label: `${dayCounts[item.id] ?? 0} days` }];
          if (item.is_starter) metaBadges.push({ icon: "star-outline", label: "Starter" });
          return (
            <FlowCard key={item.id} name={item.name} onPress={() => onPress(item.id)} onLongPress={!item.is_starter ? () => onDelete(item) : undefined}
              accessibilityLabel={`${item.is_starter ? "Starter program" : "Program"}: ${item.name}, ${dayCounts[item.id] ?? 0} days${item.is_active ? ", active" : ""}`}
              badges={badges} meta={metaBadges}
              action={item.is_starter ? <Pressable onPress={() => onOptions(item)} accessibilityLabel={`Options for ${item.name}`} hitSlop={8} style={{ padding: 8 }}><MaterialCommunityIcons name="dots-vertical" size={20} color={colors.onSurfaceVariant} /></Pressable> : <></>} />
          );
        }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flowList: { flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "flex-start" },
  actionRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" },
  segmented: { marginBottom: 16 },
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  empty: { alignItems: "center", paddingVertical: 16 },
  emptyBtn: { marginTop: 8 },
});
