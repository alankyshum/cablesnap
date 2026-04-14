import { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  View,
  type ListRenderItemInfo,
} from "react-native";
import {
  Button,
  Card,
  IconButton,
  Menu,
  SegmentedButtons,
  Snackbar,
  Text,
  useTheme,
} from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useFocusEffect, useRouter } from "expo-router";
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
  type ScheduleEntry,
} from "../../lib/db";
import type { Program, ProgramDay, WorkoutSession, WorkoutTemplate } from "../../lib/types";
import { semantic } from "../../constants/theme";
import { rpeColor, rpeText } from "../../lib/rpe";
import { STARTER_TEMPLATES } from "../../lib/starter-templates";
import { DIFFICULTY_LABELS } from "../../lib/types";

function mondayOf(date: Date): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (d.getDay() + 6) % 7; // Mon=0..Sun=6
  d.setDate(d.getDate() - day);
  return d.getTime();
}

function computeStreak(timestamps: number[]): number {
  if (timestamps.length === 0) return 0;
  const weeks = new Set(timestamps.map((ts) => mondayOf(new Date(ts))));
  let current = mondayOf(new Date());
  let count = 0;
  while (weeks.has(current)) {
    count++;
    current -= 7 * 24 * 60 * 60 * 1000;
  }
  return count;
}

export default function Workouts() {
  const theme = useTheme();
  const router = useRouter();
  const [segment, setSegment] = useState("templates");
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [dayCounts, setDayCounts] = useState<Record<string, number>>({});
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [setCounts2, setSetCounts] = useState<Record<string, number>>({});
  const [active, setActive] = useState<WorkoutSession | null>(null);
  const [streak, setStreak] = useState(0);
  const [recentPRs, setRecentPRs] = useState<{ exercise_id: string; name: string; weight: number; session_id: string; date: number }[]>([]);
  const [avgRPEs, setAvgRPEs] = useState<Record<string, number | null>>({});
  const [nextWorkout, setNextWorkout] = useState<{ program: Program; day: ProgramDay } | null>(null);
  const [snackbar, setSnackbar] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [todaySchedule, setTodaySchedule] = useState<ScheduleEntry | null>(null);
  const [todayDone, setTodayDone] = useState(false);
  const [adherence, setAdherence] = useState<{ day: number; scheduled: boolean; completed: boolean }[]>([]);

  const load = useCallback(async () => {
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
    setTemplates(tpls);
    setSessions(sess);
    setActive(act);
    setRecentPRs(prData);
    setPrograms(progs);
    setNextWorkout(nw);
    setTodaySchedule(sched);
    setTodayDone(done);
    setAdherence(adh);

    // Default segment: Programs if active program exists, else Templates
    if (nw) {
      setSegment("programs");
    }

    setStreak(computeStreak(timestamps));

    const c: Record<string, number> = {};
    for (const t of tpls) {
      c[t.id] = await getTemplateExerciseCount(t.id);
    }
    setCounts(c);

    const sc: Record<string, number> = {};
    const rpeMap: Record<string, number | null> = {};
    for (const s of sess) {
      sc[s.id] = await getSessionSetCount(s.id);
      rpeMap[s.id] = await getSessionAvgRPE(s.id);
    }
    setSetCounts(sc);
    setAvgRPEs(rpeMap);

    const dc: Record<string, number> = {};
    for (const p of progs) {
      dc[p.id] = await getProgramDayCount(p.id);
    }
    setDayCounts(dc);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

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
      setSnackbar("Template no longer exists");
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
            await load();
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
            await load();
          },
        },
      ]
    );
  };

  const handleDuplicateTemplate = async (tpl: WorkoutTemplate) => {
    setMenu(null);
    const newId = await duplicateTemplate(tpl.id);
    await load();
    router.push(`/template/${newId}`);
  };

  const handleDuplicateProgram = async (prog: Program) => {
    setMenu(null);
    const newId = await duplicateProgram(prog.id);
    await load();
    router.push(`/program/${newId}`);
  };

  const starterMeta = (id: string) =>
    STARTER_TEMPLATES.find((s) => s.id === id);

  const userTemplates = templates.filter((t) => !t.is_starter);
  const starters = templates.filter((t) => t.is_starter);
  const userPrograms = programs.filter((p) => !p.is_starter);
  const starterPrograms = programs.filter((p) => p.is_starter);

  const duration = (seconds: number | null) => {
    if (!seconds) return "-";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const dateStr = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  };

  const scheduled = adherence.filter((a) => a.scheduled);
  const weekDone = adherence.filter((a) => a.completed).length;
  const weekLabel = scheduled.length > 0
    ? `${weekDone}/${scheduled.length}`
    : `${weekDone}`;
  const weekSub = scheduled.length > 0 ? "workouts" : weekDone === 1 ? "workout" : "workouts";
  const prCount = recentPRs.length;

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View
          style={[styles.statCard, { backgroundColor: theme.colors.surface }]}
          accessibilityLabel={`${streak} week streak`}
        >
          <MaterialCommunityIcons
            name="fire"
            size={24}
            color={streak > 0 ? theme.colors.primary : theme.colors.onSurfaceVariant}
          />
          <Text variant="titleLarge" style={{ color: streak > 0 ? theme.colors.onSurface : theme.colors.onSurfaceVariant }}>
            {streak}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {streak === 1 ? "week" : "weeks"}
          </Text>
        </View>
        <View
          style={[styles.statCard, { backgroundColor: theme.colors.surface }]}
          accessibilityLabel={scheduled.length > 0 ? `${weekDone} of ${scheduled.length} workouts this week` : `${weekDone} workouts this week`}
        >
          <MaterialCommunityIcons
            name="dumbbell"
            size={24}
            color={weekDone > 0 ? theme.colors.primary : theme.colors.onSurfaceVariant}
          />
          <Text variant="titleLarge" style={{ color: weekDone > 0 ? theme.colors.onSurface : theme.colors.onSurfaceVariant }}>
            {weekLabel}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {weekSub}
          </Text>
        </View>
        <View
          style={[styles.statCard, { backgroundColor: theme.colors.surface }]}
          accessibilityLabel={`${prCount} recent personal records`}
        >
          <MaterialCommunityIcons
            name="trophy"
            size={24}
            color={prCount > 0 ? theme.colors.primary : theme.colors.onSurfaceVariant}
          />
          <Text variant="titleLarge" style={{ color: prCount > 0 ? theme.colors.onSurface : theme.colors.onSurfaceVariant }}>
            {prCount}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            recent
          </Text>
        </View>
      </View>

      {/* Resume active session banner */}
      {active && (
        <Card
          style={[styles.banner, { backgroundColor: theme.colors.primaryContainer }]}
          onPress={() => router.push(`/session/${active.id}`)}
          accessibilityLabel={`Resume active workout: ${active.name}`}
          accessibilityRole="button"
        >
          <Card.Content>
            <Text variant="titleSmall" style={{ color: theme.colors.onPrimaryContainer }}>
              ⏱ Active Workout: {active.name}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onPrimaryContainer }}>
              Tap to resume
            </Text>
          </Card.Content>
        </Card>
      )}

      {/* Today's Schedule Card — overrides next workout when schedule exists */}
      {todaySchedule && !todayDone && (
        <Card
          style={[styles.nextBanner, { backgroundColor: theme.colors.secondaryContainer }]}
          onPress={startFromSchedule}
          accessibilityLabel={`Today's workout: ${todaySchedule.template_name}. Tap to start.`}
          accessibilityRole="button"
        >
          <Card.Content style={styles.nextContent}>
            <MaterialCommunityIcons name="calendar-check" size={24} color={theme.colors.onSecondaryContainer} />
            <View style={styles.nextText}>
              <Text variant="titleSmall" style={{ color: theme.colors.onSecondaryContainer }}>
                Today: {todaySchedule.template_name}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSecondaryContainer }}>
                {todaySchedule.exercise_count} exercises · Tap to start
              </Text>
            </View>
          </Card.Content>
        </Card>
      )}

      {todaySchedule && todayDone && (
        <Card
          style={[styles.nextBanner, { backgroundColor: theme.colors.primaryContainer }]}
          onPress={startFromSchedule}
          accessibilityLabel={`Completed: ${todaySchedule.template_name}. Tap to train again.`}
          accessibilityRole="button"
        >
          <Card.Content style={styles.nextContent}>
            <MaterialCommunityIcons name="check-circle" size={24} color={theme.colors.onPrimaryContainer} />
            <View style={styles.nextText}>
              <Text variant="titleSmall" style={{ color: theme.colors.onPrimaryContainer }}>
                ✅ Completed: {todaySchedule.template_name}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onPrimaryContainer }}>
                Train again
              </Text>
            </View>
          </Card.Content>
        </Card>
      )}

      {!todaySchedule && adherence.some((a) => a.scheduled) && (
        <Card
          style={[styles.nextBanner, { backgroundColor: theme.colors.surface }]}
          accessibilityLabel="Rest day. No workout scheduled."
        >
          <Card.Content style={styles.nextContent}>
            <MaterialCommunityIcons name="bed" size={24} color={theme.colors.onSurfaceVariant} />
            <View style={styles.nextText}>
              <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>
                Rest Day
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                No workout scheduled
              </Text>
            </View>
          </Card.Content>
        </Card>
      )}

      {/* Next Workout Banner (visible when NO schedule exists) */}
      {nextWorkout && !todaySchedule && !adherence.some((a) => a.scheduled) && (
        <Card
          style={[styles.nextBanner, { backgroundColor: theme.colors.secondaryContainer }]}
          onPress={startNextWorkout}
          accessibilityLabel={`Next workout: ${nextWorkout.day.label || nextWorkout.day.template_name || "workout"} from ${nextWorkout.program.name}`}
          accessibilityRole="button"
        >
          <Card.Content style={styles.nextContent}>
            <MaterialCommunityIcons name="play-circle" size={24} color={theme.colors.onSecondaryContainer} />
            <View style={styles.nextText}>
              <Text variant="titleSmall" style={{ color: theme.colors.onSecondaryContainer }}>
                Next: {nextWorkout.day.label || nextWorkout.day.template_name || "Workout"}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSecondaryContainer }}>
                {nextWorkout.program.name} · Tap to start
              </Text>
            </View>
          </Card.Content>
        </Card>
      )}

      {/* Program indicator when schedule is active */}
      {nextWorkout && adherence.some((a) => a.scheduled) && (
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8, textAlign: "center" }}
          accessibilityLabel={`Program ${nextWorkout.program.name}: Schedule active`}
        >
          {nextWorkout.program.name} (Schedule active)
        </Text>
      )}

      {/* Weekly Adherence Bar */}
      {adherence.some((a) => a.scheduled) && (
        <View style={styles.adherence} accessibilityLabel={`Adherence: ${adherence.filter((a) => a.scheduled && a.completed).length} of ${adherence.filter((a) => a.scheduled).length} this week`}>
          <View style={styles.dots}>
            {adherence.map((a, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  a.completed
                    ? { backgroundColor: theme.colors.primary }
                    : a.scheduled
                    ? { backgroundColor: "transparent", borderWidth: 2, borderColor: theme.colors.onSurfaceVariant }
                    : { backgroundColor: theme.colors.surfaceVariant },
                ]}
                accessibilityLabel={`${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}: ${a.completed ? "completed" : a.scheduled ? "scheduled" : "rest day"}`}
              />
            ))}
          </View>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", marginTop: 4 }}>
            {adherence.filter((a) => a.scheduled && a.completed).length} of{" "}
            {adherence.filter((a) => a.scheduled).length} this week{" "}
            {adherence.filter((a) => a.scheduled).every((a) => a.completed) && adherence.some((a) => a.scheduled) ? "🔥" : "🎯"}
          </Text>
        </View>
      )}

      {/* Set Schedule button (when no schedule exists) */}
      {!adherence.some((a) => a.scheduled) && (
        <Button
          mode="text"
          icon="calendar-plus"
          compact
          onPress={() => router.push("/schedule")}
          style={styles.scheduleLink}
          accessibilityLabel="Set weekly schedule"
        >
          Set Schedule
        </Button>
      )}

      {/* Edit schedule link (when schedule exists) */}
      {adherence.some((a) => a.scheduled) && (
        <Button
          mode="text"
          icon="pencil"
          compact
          onPress={() => router.push("/schedule")}
          style={styles.scheduleLink}
          accessibilityLabel="Edit weekly schedule"
        >
          Edit Schedule
        </Button>
      )}

      {/* Quick Start */}
      <Button
        mode="contained"
        icon="flash"
        onPress={quickStart}
        style={styles.quickStart}
        contentStyle={styles.quickStartContent}
        accessibilityLabel="Quick start workout"
      >
        Quick Start
      </Button>

      {/* Segmented Control */}
      <SegmentedButtons
        value={segment}
        onValueChange={setSegment}
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
          {/* User Templates */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text variant="titleMedium" style={{ color: theme.colors.onBackground }}>
                My Templates
              </Text>
              <Button
                mode="text"
                icon="plus"
                compact
                onPress={() => router.push("/template/create")}
                accessibilityLabel="Create new template"
              >
                Create
              </Button>
            </View>
            {userTemplates.length === 0 && starters.length === 0 ? (
              <View style={styles.empty}>
                <Text
                  variant="bodyMedium"
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  Create your first workout template
                </Text>
                <Button
                  mode="outlined"
                  onPress={() => router.push("/template/create")}
                  style={styles.emptyBtn}
                  accessibilityLabel="Create your first template"
                >
                  Create Template
                </Button>
              </View>
            ) : (
              <>
                {userTemplates.length > 0 && (
                  <FlatList
                    data={userTemplates}
                    keyExtractor={(item) => item.id}
                    scrollEnabled={false}
                    renderItem={({ item }: ListRenderItemInfo<WorkoutTemplate>) => (
                      <Card
                        style={[styles.card, { backgroundColor: theme.colors.surface }]}
                      >
                        <Card.Content style={styles.cardContent}>
                          <Pressable
                            onPress={() => startFromTemplate(item)}
                            onLongPress={() => confirmDelete(item)}
                            style={styles.cardInfo}
                            accessibilityLabel={`Start workout from template: ${item.name}, ${counts[item.id] ?? 0} exercises`}
                            accessibilityRole="button"
                          >
                            <Text
                              variant="titleSmall"
                              style={{ color: theme.colors.onSurface }}
                            >
                              {item.name}
                            </Text>
                            <Text
                              variant="bodySmall"
                              style={{ color: theme.colors.onSurfaceVariant }}
                            >
                              {counts[item.id] ?? 0} exercises
                            </Text>
                          </Pressable>
                          <IconButton
                            icon="pencil"
                            size={20}
                            onPress={() => router.push(`/template/${item.id}`)}
                            accessibilityLabel={`Edit template ${item.name}`}
                          />
                        </Card.Content>
                      </Card>
                    )}
                  />
                )}

                {/* Starter Workouts */}
                {starters.length > 0 && (
                  <>
                    <View style={styles.starterHeader} accessibilityRole="header">
                      <Text variant="titleMedium" style={{ color: theme.colors.onBackground }}>
                        Starter Workouts
                      </Text>
                    </View>
                    <FlatList
                      data={starters}
                      keyExtractor={(item) => item.id}
                      scrollEnabled={false}
                      renderItem={({ item }: ListRenderItemInfo<WorkoutTemplate>) => {
                        const meta = starterMeta(item.id);
                        return (
                          <Card
                            style={[styles.card, { backgroundColor: theme.colors.surface }]}
                          >
                            <Card.Content style={styles.cardContent}>
                              <Pressable
                                onPress={() => startFromTemplate(item)}
                                style={styles.cardInfo}
                                accessibilityLabel={`Starter template: ${item.name}, ${counts[item.id] ?? 0} exercises`}
                                accessibilityHint="Double-tap to start workout"
                                accessibilityRole="button"
                              >
                                <View style={styles.chipRow}>
                                  <Text
                                    variant="titleSmall"
                                    style={{ color: theme.colors.onSurface }}
                                  >
                                    {item.name}
                                  </Text>
                                  <View style={[styles.badge, { backgroundColor: theme.colors.surfaceVariant }]} accessibilityLabel="Starter template">
                                    <Text style={[styles.badgeText, { color: theme.colors.onSurfaceVariant }]}>STARTER</Text>
                                  </View>
                                  {meta?.recommended && (
                                    <View
                                      style={[styles.badge, { backgroundColor: theme.colors.primaryContainer }]}
                                      accessibilityLabel="Recommended"
                                    >
                                      <Text style={[styles.badgeText, { color: theme.colors.onPrimaryContainer }]}>
                                        Recommended
                                      </Text>
                                    </View>
                                  )}
                                </View>
                                <Text
                                  variant="bodySmall"
                                  style={{ color: theme.colors.onSurfaceVariant }}
                                >
                                  {meta ? `${DIFFICULTY_LABELS[meta.difficulty]} · ${meta.duration} · ${meta.exercises.length} exercises` : `${counts[item.id] ?? 0} exercises`}
                                </Text>
                              </Pressable>
                              <Menu
                                visible={menu === item.id}
                                onDismiss={() => setMenu(null)}
                                anchor={
                                  <IconButton
                                    icon="dots-vertical"
                                    size={20}
                                    onPress={() => setMenu(item.id)}
                                    accessibilityLabel={`Options for ${item.name}`}
                                  />
                                }
                              >
                                <Menu.Item
                                  onPress={() => handleDuplicateTemplate(item)}
                                  title="Duplicate"
                                  leadingIcon="content-copy"
                                  accessibilityLabel="Duplicate template for editing"
                                />
                              </Menu>
                            </Card.Content>
                          </Card>
                        );
                      }}
                    />
                  </>
                )}
              </>
            )}
          </View>
        </>
      ) : (
        <>
          {/* User Programs */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text variant="titleMedium" style={{ color: theme.colors.onBackground }}>
                My Programs
              </Text>
              <Button
                mode="text"
                icon="plus"
                compact
                onPress={() => router.push("/program/create")}
                accessibilityLabel="Create new program"
              >
                Create
              </Button>
            </View>
            {userPrograms.length === 0 && starterPrograms.length === 0 ? (
              <View style={styles.empty}>
                <Text
                  variant="bodyMedium"
                  style={{ color: theme.colors.onSurfaceVariant }}
                  accessibilityRole="text"
                  accessibilityLabel="No programs yet. Create your first program."
                >
                  Create your first program
                </Text>
                <Button
                  mode="outlined"
                  onPress={() => router.push("/program/create")}
                  style={styles.emptyBtn}
                  accessibilityLabel="Create your first program"
                >
                  Create Program
                </Button>
              </View>
            ) : (
              <>
                {userPrograms.length > 0 && (
                  <FlatList
                    data={userPrograms}
                    keyExtractor={(item) => item.id}
                    scrollEnabled={false}
                    renderItem={({ item }: ListRenderItemInfo<Program>) => (
                      <Card
                        style={[styles.card, { backgroundColor: theme.colors.surface }]}
                        onPress={() => router.push(`/program/${item.id}`)}
                        onLongPress={() => confirmDeleteProgram(item)}
                        accessibilityLabel={`Program: ${item.name}, ${dayCounts[item.id] ?? 0} days${item.is_active ? ", active" : ""}`}
                        accessibilityRole="button"
                      >
                        <Card.Content style={styles.cardContent}>
                          <View style={styles.cardInfo}>
                            <Text
                              variant="titleSmall"
                              style={{ color: theme.colors.onSurface }}
                            >
                              {item.name}
                            </Text>
                            <Text
                              variant="bodySmall"
                              style={{ color: theme.colors.onSurfaceVariant }}
                            >
                              {dayCounts[item.id] ?? 0} days{item.is_active ? " · Active" : ""}
                            </Text>
                          </View>
                          {item.is_active && (
                            <MaterialCommunityIcons
                              name="check-circle"
                              size={20}
                              color={theme.colors.primary}
                              accessibilityLabel="Active program"
                            />
                          )}
                        </Card.Content>
                      </Card>
                    )}
                  />
                )}

                {/* Starter Programs */}
                {starterPrograms.length > 0 && (
                  <>
                    <View style={styles.starterHeader} accessibilityRole="header">
                      <Text variant="titleMedium" style={{ color: theme.colors.onBackground }}>
                        Starter Programs
                      </Text>
                    </View>
                    <FlatList
                      data={starterPrograms}
                      keyExtractor={(item) => item.id}
                      scrollEnabled={false}
                      renderItem={({ item }: ListRenderItemInfo<Program>) => (
                        <Card
                          style={[styles.card, { backgroundColor: theme.colors.surface }]}
                        >
                          <Card.Content style={styles.cardContent}>
                            <Pressable
                              onPress={() => router.push(`/program/${item.id}`)}
                              style={styles.cardInfo}
                              accessibilityLabel={`Starter program: ${item.name}, ${dayCounts[item.id] ?? 0} days`}
                              accessibilityHint="Double-tap to view program"
                              accessibilityRole="button"
                            >
                              <View style={styles.chipRow}>
                                <Text
                                  variant="titleSmall"
                                  style={{ color: theme.colors.onSurface }}
                                >
                                  {item.name}
                                </Text>
                                <View style={[styles.badge, { backgroundColor: theme.colors.surfaceVariant }]} accessibilityLabel="Starter template">
                                  <Text style={[styles.badgeText, { color: theme.colors.onSurfaceVariant }]}>STARTER</Text>
                                </View>
                              </View>
                              <Text
                                variant="bodySmall"
                                style={{ color: theme.colors.onSurfaceVariant }}
                              >
                                {dayCounts[item.id] ?? 0} days · Intermediate
                              </Text>
                            </Pressable>
                            <Menu
                              visible={menu === `prog-${item.id}`}
                              onDismiss={() => setMenu(null)}
                              anchor={
                                <IconButton
                                  icon="dots-vertical"
                                  size={20}
                                  onPress={() => setMenu(`prog-${item.id}`)}
                                  accessibilityLabel={`Options for ${item.name}`}
                                />
                              }
                            >
                              <Menu.Item
                                onPress={() => handleDuplicateProgram(item)}
                                title="Duplicate"
                                leadingIcon="content-copy"
                                accessibilityLabel="Duplicate program for editing"
                              />
                            </Menu>
                          </Card.Content>
                        </Card>
                      )}
                    />
                  </>
                )}
              </>
            )}
          </View>
        </>
      )}

      {/* Recent Workouts */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text
            variant="titleMedium"
            style={{ color: theme.colors.onBackground }}
          >
            Recent Workouts
          </Text>
          {sessions.length > 0 && (
            <Button
              mode="text"
              compact
              onPress={() => router.push("/history")}
              accessibilityLabel="View all workout history"
            >
              View All History
            </Button>
          )}
        </View>
        {sessions.length === 0 ? (
          <View style={styles.empty}>
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              No workouts yet. Start one above!
            </Text>
          </View>
        ) : (
          <FlatList
            data={sessions}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }: ListRenderItemInfo<WorkoutSession>) => {
              const rpe = avgRPEs[item.id];
              const rpeStr = rpe != null ? ` · RPE ${Math.round(rpe * 10) / 10}` : "";
              return (
              <Card
                style={[styles.card, { backgroundColor: theme.colors.surface }]}
                onPress={() =>
                  router.push(`/session/detail/${item.id}`)
                }
                accessibilityLabel={`View workout: ${item.name}, ${dateStr(item.started_at)}, ${duration(item.duration_seconds)}, ${setCounts2[item.id] ?? 0} sets${rpeStr}`}
                accessibilityRole="button"
              >
                <Card.Content>
                  <Text
                    variant="titleSmall"
                    style={{ color: theme.colors.onSurface }}
                  >
                    {item.name}
                  </Text>
                  <View style={styles.recentRow}>
                    <Text
                      variant="bodySmall"
                      style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}
                    >
                      {dateStr(item.started_at)} · {duration(item.duration_seconds)} ·{" "}
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
                </Card.Content>
              </Card>
              );
            }}
          />
        )}
      </View>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar("")}
        duration={3000}
      >
        {snackbar}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
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
    height: 72,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
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
  quickStart: {
    marginBottom: 12,
  },
  segmented: {
    marginBottom: 16,
  },
  quickStartContent: {
    paddingVertical: 8,
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
  card: {
    marginBottom: 8,
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardInfo: {
    flex: 1,
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
  starterHeader: {
    marginTop: 16,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  badge: {
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 8,
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 12,
    lineHeight: 16,
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
    borderRadius: 6,
  },
  scheduleLink: {
    marginBottom: 8,
  },
});
