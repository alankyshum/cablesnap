import { useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getNextWorkout,
  getPrograms,
  getProgramDayCount,
  softDeleteProgram,
} from "../../lib/programs";
import {
  deleteTemplate,
  duplicateTemplate,
  duplicateProgram,
  getActiveSession,
  getAllCompletedSessionWeeks,
  getRecentPRs,
  getRecentSessions,
  getSessionAvgRPE,
  getSessionSetCount,
  getTemplateExerciseCount,
  getTemplates,
  getTodaySchedule,
  getWeekAdherence,
  isTodayCompleted,
  startSession,
} from "../../lib/db";
import type { Program, WorkoutTemplate } from "../../lib/types";

import { rpeColor, rpeText } from "../../lib/rpe";
import { STARTER_TEMPLATES } from "../../lib/starter-templates";
import { formatDuration, formatDateShort, computeStreak } from "../../lib/format";
import { FlowCard, difficultyBadge, type MetaBadge } from "../../components/FlowCard";
import { useFocusRefetch } from "../../lib/query";
import { useToast } from "../../components/ui/bna-toast";
import { useLayout } from "../../lib/layout";
import { flowCardStyle } from "../../components/ui/FlowContainer";
import { useFloatingTabBarHeight } from "../../components/FloatingTabBar";
import { radii } from "../../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";

async function loadHomeData() {
  const [tpls, sess, act, timestamps, prData, progs, nw, sched, done, adh] = await Promise.all([
    getTemplates(),
    getRecentSessions(5),
    getActiveSession(),
    getAllCompletedSessionWeeks(),
    getRecentPRs(5),
    getPrograms(),
    getNextWorkout(),
    getTodaySchedule(),
    isTodayCompleted(),
    getWeekAdherence(),
  ]);

  const counts: Record<string, number> = {};
  for (const t of tpls) {
    counts[t.id] = await getTemplateExerciseCount(t.id);
  }

  const setCounts: Record<string, number> = {};
  const avgRPEs: Record<string, number | null> = {};
  for (const s of sess) {
    setCounts[s.id] = await getSessionSetCount(s.id);
    avgRPEs[s.id] = await getSessionAvgRPE(s.id);
  }

  const dayCounts: Record<string, number> = {};
  for (const p of progs) {
    dayCounts[p.id] = await getProgramDayCount(p.id);
  }

  return {
    templates: tpls,
    sessions: sess,
    active: act,
    streak: computeStreak(timestamps),
    recentPRs: prData,
    programs: progs,
    nextWorkout: nw,
    todaySchedule: sched,
    todayDone: done,
    adherence: adh,
    counts,
    setCounts,
    avgRPEs,
    dayCounts,
  };
}

export default function Workouts() {
  const colors = useThemeColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { info } = useToast();
  const layout = useLayout();
  const tabBarHeight = useFloatingTabBarHeight();
  const [userSegment, setUserSegment] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["home"],
    queryFn: loadHomeData,
  });
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

  const quickStart = async () => {
    const session = await startSession(null, "Quick Workout");
    router.push(`/session/${session.id}`);
  };

  const startFromTemplate = async (tpl: WorkoutTemplate) => {
    const session = await startSession(tpl.id, tpl.name);
    router.push(`/session/${session.id}?templateId=${tpl.id}`);
  };

  const startNextWorkout = async () => {
    if (!nextWorkout) return;
    if (!nextWorkout.day.template_id) {
      info("Template no longer exists");
      return;
    }
    const session = await startSession(
      nextWorkout.day.template_id,
      nextWorkout.day.label || nextWorkout.day.template_name || nextWorkout.program.name,
      nextWorkout.day.id
    );
    router.push(`/session/${session.id}?templateId=${nextWorkout.day.template_id}`);
  };

  const startFromSchedule = async () => {
    if (!todaySchedule) return;
    const session = await startSession(todaySchedule.template_id, todaySchedule.template_name);
    router.push(`/session/${session.id}?templateId=${todaySchedule.template_id}`);
  };

  const confirmDeleteProgram = (prog: Program) => {
    if (prog.is_starter) return;
    Alert.alert(
      "Delete Program",
      `Delete "${prog.name}"? Past workout data will be preserved.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await softDeleteProgram(prog.id);
            reload();
          },
        },
      ]
    );
  };

  const confirmDelete = (tpl: WorkoutTemplate) => {
    if (tpl.is_starter) return;
    Alert.alert(
      "Delete Template",
      `Delete "${tpl.name}"? Past workout data will be preserved.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteTemplate(tpl.id);
            reload();
          },
        },
      ]
    );
  };

  const handleDuplicateTemplate = async (tpl: WorkoutTemplate) => {
    const newId = await duplicateTemplate(tpl.id);
    reload();
    router.push(`/template/${newId}`);
  };

  const handleDuplicateProgram = async (prog: Program) => {
    const newId = await duplicateProgram(prog.id);
    reload();
    router.push(`/program/${newId}`);
  };

  const showTemplateOptions = (item: WorkoutTemplate) => {
    const meta = starterMeta(item.id);
    Alert.alert(
      meta?.name || item.name,
      undefined,
      [
        { text: "Duplicate", onPress: () => handleDuplicateTemplate(item) },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const showProgramOptions = (item: Program) => {
    Alert.alert(
      item.name,
      undefined,
      [
        { text: "Duplicate", onPress: () => handleDuplicateProgram(item) },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const starterMeta = (id: string) =>
    STARTER_TEMPLATES.find((s) => s.id === id);

  const allTemplates = [
    ...templates.filter((t) => !t.is_starter),
    ...templates.filter((t) => t.is_starter),
  ];
  const allPrograms = [
    ...programs.filter((p) => !p.is_starter),
    ...programs.filter((p) => p.is_starter),
  ];

  const scheduled = adherence.filter((a) => a.scheduled);
  const weekDone = adherence.filter((a) => a.completed).length;
  const weekLabel = scheduled.length > 0
    ? `${weekDone}/${scheduled.length}`
    : `${weekDone}`;
  const weekSub = scheduled.length > 0 ? "workouts" : weekDone === 1 ? "workout" : "workouts";
  const prCount = recentPRs.length;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingHorizontal: layout.horizontalPadding, paddingVertical: 16, paddingBottom: tabBarHeight + 16 }}
    >
      {/* Stats Row */}
      <View style={styles.statsRow}>
        <Animated.View
          entering={FadeInDown.delay(0).duration(300)}
          style={[styles.statCard, { backgroundColor: colors.surface }]}
          accessibilityLabel={`${streak} week streak`}
        >
          <MaterialCommunityIcons
            name="fire"
            size={24}
            color={streak > 0 ? colors.primary : colors.onSurfaceVariant}
          />
          <Text variant="title" style={{ color: streak > 0 ? colors.onSurface : colors.onSurfaceVariant, fontSize: 20 }}>
            {streak}
          </Text>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
            {streak === 1 ? "week" : "weeks"}
          </Text>
        </Animated.View>
        <Animated.View
          entering={FadeInDown.delay(60).duration(300)}
          style={[styles.statCard, { backgroundColor: colors.surface }]}
          accessibilityLabel={scheduled.length > 0 ? `${weekDone} of ${scheduled.length} workouts this week` : `${weekDone} workouts this week`}
        >
          <MaterialCommunityIcons
            name="dumbbell"
            size={24}
            color={weekDone > 0 ? colors.primary : colors.onSurfaceVariant}
          />
          <Text variant="title" style={{ color: weekDone > 0 ? colors.onSurface : colors.onSurfaceVariant, fontSize: 20 }}>
            {weekLabel}
          </Text>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
            {weekSub}
          </Text>
        </Animated.View>
        <Animated.View
          entering={FadeInDown.delay(120).duration(300)}
          style={[styles.statCard, { backgroundColor: colors.surface }]}
          accessibilityLabel={`${prCount} recent personal records`}
        >
          <MaterialCommunityIcons
            name="trophy"
            size={24}
            color={prCount > 0 ? colors.primary : colors.onSurfaceVariant}
          />
          <Text variant="title" style={{ color: prCount > 0 ? colors.onSurface : colors.onSurfaceVariant, fontSize: 20 }}>
            {prCount}
          </Text>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
            recent
          </Text>
        </Animated.View>
      </View>

      {/* Resume active session banner */}
      {active && (
        <Pressable
          style={[styles.banner, { backgroundColor: colors.primaryContainer, borderRadius: 12, padding: 18 }]}
          onPress={() => router.push(`/session/${active.id}`)}
          accessibilityLabel={`Resume active workout: ${active.name}`}
          accessibilityRole="button"
        >
          <Text variant="subtitle" style={{ color: colors.onPrimaryContainer, fontSize: 15 }}>
            ⏱ Active Workout: {active.name}
          </Text>
          <Text variant="caption" style={{ color: colors.onPrimaryContainer }}>
            Tap to resume
          </Text>
        </Pressable>
      )}

      {/* Today's Schedule Card — overrides next workout when schedule exists */}
      {todaySchedule && !todayDone && (
        <Pressable
          style={[styles.nextBanner, { backgroundColor: colors.secondaryContainer, borderRadius: 12, padding: 18 }]}
          onPress={startFromSchedule}
          accessibilityLabel={`Today's workout: ${todaySchedule.template_name}. Tap to start.`}
          accessibilityRole="button"
        >
          <View style={styles.nextContent}>
            <MaterialCommunityIcons name="calendar-check" size={24} color={colors.onSecondaryContainer} />
            <View style={styles.nextText}>
              <Text variant="subtitle" style={{ color: colors.onSecondaryContainer, fontSize: 15 }}>
                Today: {todaySchedule.template_name}
              </Text>
              <Text variant="caption" style={{ color: colors.onSecondaryContainer }}>
                {todaySchedule.exercise_count} exercises · Tap to start
              </Text>
            </View>
          </View>
        </Pressable>
      )}

      {todaySchedule && todayDone && (
        <Pressable
          style={[styles.nextBanner, { backgroundColor: colors.primaryContainer, borderRadius: 12, padding: 18 }]}
          onPress={startFromSchedule}
          accessibilityLabel={`Completed: ${todaySchedule.template_name}. Tap to train again.`}
          accessibilityRole="button"
        >
          <View style={styles.nextContent}>
            <MaterialCommunityIcons name="check-circle" size={24} color={colors.onPrimaryContainer} />
            <View style={styles.nextText}>
              <Text variant="subtitle" style={{ color: colors.onPrimaryContainer, fontSize: 15 }}>
                ✅ Completed: {todaySchedule.template_name}
              </Text>
              <Text variant="caption" style={{ color: colors.onPrimaryContainer }}>
                Train again
              </Text>
            </View>
          </View>
        </Pressable>
      )}

      {!todaySchedule && adherence.some((a) => a.scheduled) && (
        <View
          style={[styles.nextBanner, { backgroundColor: colors.surface, borderRadius: 12, padding: 18 }]}
          accessibilityLabel="Rest day. No workout scheduled."
        >
          <View style={styles.nextContent}>
            <MaterialCommunityIcons name="bed" size={24} color={colors.onSurfaceVariant} />
            <View style={styles.nextText}>
              <Text variant="subtitle" style={{ color: colors.onSurface, fontSize: 15 }}>
                Rest Day
              </Text>
              <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                No workout scheduled
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Next Workout Banner (visible when NO schedule exists) */}
      {nextWorkout && !todaySchedule && !adherence.some((a) => a.scheduled) && (
        <Pressable
          style={[styles.nextBanner, { backgroundColor: colors.secondaryContainer, borderRadius: 12, padding: 18 }]}
          onPress={startNextWorkout}
          accessibilityLabel={`Next workout: ${nextWorkout.day.label || nextWorkout.day.template_name || "workout"} from ${nextWorkout.program.name}`}
          accessibilityRole="button"
        >
          <View style={styles.nextContent}>
            <MaterialCommunityIcons name="play-circle" size={24} color={colors.onSecondaryContainer} />
            <View style={styles.nextText}>
              <Text variant="subtitle" style={{ color: colors.onSecondaryContainer, fontSize: 15 }}>
                Next: {nextWorkout.day.label || nextWorkout.day.template_name || "Workout"}
              </Text>
              <Text variant="caption" style={{ color: colors.onSecondaryContainer }}>
                {nextWorkout.program.name} · Tap to start
              </Text>
            </View>
          </View>
        </Pressable>
      )}

      {/* Program indicator when schedule is active */}
      {nextWorkout && adherence.some((a) => a.scheduled) && (
        <Text
          variant="caption"
          style={{ color: colors.onSurfaceVariant, marginBottom: 8, textAlign: "center" }}
          accessibilityLabel={`Program ${nextWorkout.program.name}: Schedule active`}
        >
          {nextWorkout.program.name} (Schedule active)
        </Text>
      )}

      {/* Weekly Adherence Bar */}
      {adherence.some((a) => a.scheduled) && (
        <View style={styles.adherence} accessibilityLabel={`Adherence: ${adherence.filter((a) => a.scheduled && a.completed).length} of ${adherence.filter((a) => a.scheduled).length} this week`}>
          <View style={styles.dots}>
            <FlatList
              data={adherence}
              horizontal
              scrollEnabled={false}
              keyExtractor={(_, i) => String(i)}
              renderItem={({ item: a, index: i }) => (
                <View
                  style={[
                    styles.dot,
                    a.completed
                      ? { backgroundColor: colors.primary }
                      : a.scheduled
                      ? { backgroundColor: "transparent", borderWidth: 2, borderColor: colors.onSurfaceVariant }
                      : { backgroundColor: colors.surfaceVariant },
                  ]}
                  accessibilityLabel={`${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}: ${a.completed ? "completed" : a.scheduled ? "scheduled" : "rest day"}`}
                />
              )}
            />
          </View>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant, textAlign: "center", marginTop: 4 }}>
            {adherence.filter((a) => a.scheduled && a.completed).length} of{" "}
            {adherence.filter((a) => a.scheduled).length} this week{" "}
            {adherence.filter((a) => a.scheduled).every((a) => a.completed) && adherence.some((a) => a.scheduled) ? "🔥" : "🎯"}
          </Text>
        </View>
      )}

      {/* Quick Start */}
      <View style={styles.actionRow}>
        <Button
          variant="default"
          onPress={quickStart}
          accessibilityLabel="Quick start workout"
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <MaterialCommunityIcons name="flash" size={18} color={colors.onPrimary} />
            <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>Quick Start</Text>
          </View>
        </Button>
      </View>

      {/* Segmented Control */}
      <SegmentedControl
        value={segment}
        onValueChange={(v) => setUserSegment(v)}
        buttons={[
          {
            value: "templates",
            label: "Templates",
            accessibilityLabel: "Templates tab",
          },
          {
            value: "programs",
            label: "Programs",
            accessibilityLabel: "Programs tab",
          },
        ]}
        style={styles.segmented}
      />

      {segment === "templates" ? (
        <>
          {/* Templates */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text variant="subtitle" style={{ color: colors.onBackground }}>
                Templates
              </Text>
              <Button
                variant="ghost"
                size="sm"
                onPress={() => router.push("/template/create")}
                accessibilityLabel="Create new template"
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <MaterialCommunityIcons name="plus" size={16} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: 14 }}>Create</Text>
                </View>
              </Button>
            </View>
            {allTemplates.length === 0 ? (
              <View style={styles.empty}>
                <Text
                  style={{ color: colors.onSurfaceVariant }}
                >
                  Create your first workout template
                </Text>
                <Button
                  variant="outline"
                  onPress={() => router.push("/template/create")}
                  style={styles.emptyBtn}
                  accessibilityLabel="Create your first template"
                  label="Create Template"
                />
              </View>
            ) : (
              <View style={styles.flowList}>
                {allTemplates.map((item) => {
                  const meta = starterMeta(item.id);
                  const isStarter = !!meta || item.is_starter;
                  const metaBadges: MetaBadge[] = meta
                    ? [
                        difficultyBadge(meta.difficulty),
                        { icon: "clock-outline", label: meta.duration },
                        { icon: "dumbbell", label: `${meta.exercises.length} exercises` },
                      ]
                    : [{ icon: "dumbbell", label: `${counts[item.id] ?? 0} exercises` }];
                  if (isStarter) metaBadges.push({ icon: "star-outline", label: "Starter" });
                  const badges: { label: string; type: "active" | "starter" | "recommended" }[] = [];
                  if (meta?.recommended) badges.push({ label: "RECOMMENDED", type: "recommended" });
                  return (
                    <FlowCard
                      key={item.id}
                      name={meta?.name || item.name}
                      onPress={() => startFromTemplate(item)}
                      onLongPress={!isStarter ? () => confirmDelete(item) : undefined}
                      accessibilityLabel={`${isStarter ? "Starter template" : "Start workout from template"}: ${meta?.name || item.name}, ${counts[item.id] ?? 0} exercises`}
                      accessibilityHint={isStarter ? "Double-tap to start workout" : undefined}
                      badges={badges}
                      meta={metaBadges}
                      action={
                        isStarter ? (
                          <Pressable
                            onPress={() => showTemplateOptions(item)}
                            accessibilityLabel={`Options for ${meta?.name || item.name}`}
                            hitSlop={8}
                            style={{ padding: 8 }}
                          >
                            <MaterialCommunityIcons name="dots-vertical" size={20} color={colors.onSurfaceVariant} />
                          </Pressable>
                        ) : (
                          <Pressable
                            onPress={() => router.push(`/template/${item.id}`)}
                            accessibilityLabel={`Edit template ${item.name}`}
                            hitSlop={8}
                            style={{ padding: 8 }}
                          >
                            <MaterialCommunityIcons name="pencil" size={20} color={colors.onSurfaceVariant} />
                          </Pressable>
                        )
                      }
                    />
                  );
                })}
              </View>
            )}
          </View>
        </>
      ) : (
        <>
          {/* Programs */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text variant="subtitle" style={{ color: colors.onBackground }}>
                Programs
              </Text>
              <Button
                variant="ghost"
                size="sm"
                onPress={() => router.push("/program/create")}
                accessibilityLabel="Create new program"
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <MaterialCommunityIcons name="plus" size={16} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: 14 }}>Create</Text>
                </View>
              </Button>
            </View>
            {allPrograms.length === 0 ? (
              <View style={styles.empty}>
                <Text
                  style={{ color: colors.onSurfaceVariant }}
                  accessibilityRole="text"
                  accessibilityLabel="No programs yet. Create your first program."
                >
                  Create your first program
                </Text>
                <Button
                  variant="outline"
                  onPress={() => router.push("/program/create")}
                  style={styles.emptyBtn}
                  accessibilityLabel="Create your first program"
                  label="Create Program"
                />
              </View>
            ) : (
              <View style={styles.flowList}>
                {allPrograms.map((item) => {
                  const badges: { label: string; type: "active" | "starter" | "recommended" }[] = [];
                  if (item.is_active) badges.push({ label: "ACTIVE", type: "active" });
                  const metaBadges: MetaBadge[] = [
                    item.is_starter
                      ? difficultyBadge("intermediate")
                      : { icon: "signal-cellular-2", label: "Custom" },
                    { icon: "calendar-blank-outline", label: `${dayCounts[item.id] ?? 0} days` },
                  ];
                  if (item.is_starter) metaBadges.push({ icon: "star-outline", label: "Starter" });
                  return (
                    <FlowCard
                      key={item.id}
                      name={item.name}
                      onPress={() => router.push(`/program/${item.id}`)}
                      onLongPress={!item.is_starter ? () => confirmDeleteProgram(item) : undefined}
                      accessibilityLabel={`${item.is_starter ? "Starter program" : "Program"}: ${item.name}, ${dayCounts[item.id] ?? 0} days${item.is_active ? ", active" : ""}`}
                      badges={badges}
                      meta={metaBadges}
                      action={
                        item.is_starter ? (
                          <Pressable
                            onPress={() => showProgramOptions(item)}
                            accessibilityLabel={`Options for ${item.name}`}
                            hitSlop={8}
                            style={{ padding: 8 }}
                          >
                            <MaterialCommunityIcons name="dots-vertical" size={20} color={colors.onSurfaceVariant} />
                          </Pressable>
                        ) : <></>
                      }
                    />
                  );
                })}
              </View>
            )}
          </View>
        </>
      )}

      {/* Recent Workouts */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text
            variant="subtitle"
            style={{ color: colors.onBackground }}
          >
            Recent Workouts
          </Text>
          {sessions.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onPress={() => router.push("/history")}
              accessibilityLabel="View all workout history"
              label="View All History"
            />
          )}
        </View>
        {sessions.length === 0 ? (
          <View style={styles.empty}>
            <Text
              style={{ color: colors.onSurfaceVariant }}
            >
              No workouts yet. Start one above!
            </Text>
          </View>
        ) : (
          <FlatList
            data={sessions}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            contentContainerStyle={styles.flowList}
            renderItem={({ item, index }) => {
              const rpe = avgRPEs[item.id];
              const rpeStr = rpe != null ? ` · RPE ${Math.round(rpe * 10) / 10}` : "";
              return (
              <Animated.View entering={FadeInDown.delay(index * 60).duration(300)}>
              <Pressable
                style={[styles.flowCard, { backgroundColor: colors.surface, borderRadius: 12, padding: 18 }]}
                onPress={() =>
                  router.push(`/session/detail/${item.id}`)
                }
                accessibilityLabel={`View workout: ${item.name}, ${formatDateShort(item.started_at)}, ${formatDuration(item.duration_seconds)}, ${setCounts2[item.id] ?? 0} sets${rpeStr}`}
                accessibilityRole="button"
              >
                <Text
                  variant="subtitle"
                  style={{ color: colors.onSurface, fontSize: 15 }}
                >
                  {item.name}
                </Text>
                <View style={styles.recentRow}>
                  <Text
                    variant="caption"
                    style={{ color: colors.onSurfaceVariant, flex: 1 }}
                  >
                    {formatDateShort(item.started_at)} · {formatDuration(item.duration_seconds)} ·{" "}
                    {setCounts2[item.id] ?? 0} sets
                  </Text>
                  {rpe != null && (
                    <View style={[styles.rpeTag, { backgroundColor: rpeColor(rpe) }]}>
                      <Text style={{ color: rpeText(rpe), fontSize: 12, fontWeight: "600" }}>
                        RPE {Math.round(rpe * 10) / 10}
                      </Text>
                    </View>
                  )}
                </View>
              </Pressable>
              </Animated.View>
              );
            }}
          />
        )}
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flowList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "flex-start",
  },
  banner: {
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  nextBanner: {
    marginBottom: 12,
  },
  nextContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  nextText: {
    flex: 1,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  segmented: {
    marginBottom: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionTitle: {
    marginBottom: 8,
  },
  flowCard: {
    marginBottom: 8,
    ...flowCardStyle,
    flexGrow: 0,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 16,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  rpeTag: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  emptyBtn: {
    marginTop: 8,
  },
  adherence: {
    marginBottom: 12,
    alignItems: "center",
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: radii.md,
  },
});
