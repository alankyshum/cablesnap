import { useCallback, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useLayout } from "../../lib/layout";
import {
  getProgramById,
  getProgramDays,
  getProgramCycleCount,
  getProgramHistory,
  getProgramSchedule,
  setProgramScheduleDay,
  clearProgramSchedule,
  activateProgram,
  deactivateProgram,
  softDeleteProgram,
  removeProgramDay,
  reorderProgramDays,
} from "../../lib/programs";
import { duplicateProgram, getTemplates, getAppSetting } from "../../lib/db";
import { scheduleReminders } from "../../lib/notifications";
import { DAYS } from "../../lib/format";
import type { Program, ProgramDay, WorkoutTemplate } from "../../lib/types";
import type { ScheduleEntry } from "../../lib/db/settings";
import { useThemeColors } from "@/hooks/useThemeColors";

export default function ProgramDetail() {
  const colors = useThemeColors();
  const layout = useLayout();
  const router = useRouter();
  
  const { id } = useLocalSearchParams<{ id: string }>();
  const [program, setProgram] = useState<Program | null>(null);
  const [days, setDays] = useState<ProgramDay[]>([]);
  const [cycle, setCycle] = useState(0);
  const [history, setHistory] = useState<{ session_id: string; day_label: string; template_name: string | null; completed_at: number }[]>([]);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [picker, setPicker] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [prog, d, c, h, sched, tpls] = await Promise.all([
        getProgramById(id),
        getProgramDays(id),
        getProgramCycleCount(id),
        getProgramHistory(id, 10),
        getProgramSchedule(id),
        getTemplates(),
      ]);
      setProgram(prog);
      setDays(d);
      setCycle(c);
      setHistory(h);
      setSchedule(sched);
      setTemplates(tpls);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggle = async () => {
    if (!program) return;
    try {
      setLoading(true);
      if (program.is_active) {
        await deactivateProgram(program.id);
      } else {
        if (days.length === 0) {
          Alert.alert("Cannot Activate", "Add at least one day to this program.");
          return;
        }
        await activateProgram(program.id);
      }
      await load();
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = () => {
    if (!program) return;
    Alert.alert(
      "Delete Program",
      `Delete "${program.name}"? Past workout data will be preserved.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await softDeleteProgram(program.id);
            router.back();
          },
        },
      ]
    );
  };

  const remove = async (dayId: string) => {
    await removeProgramDay(dayId);
    await load();
  };

  const move = async (index: number, dir: -1 | 1) => {
    if (!program) return;
    const target = index + dir;
    if (target < 0 || target >= days.length) return;
    const ids = days.map((d) => d.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await reorderProgramDays(program.id, ids);
    await load();
  };

  const dateStr = (ts: number) =>
    new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  const dayName = (day: ProgramDay) =>
    day.label || day.template_name || "Deleted Template";

  if (!program) {
    return (
      <>
        <Stack.Screen options={{ title: "Program" }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <Text style={{ color: colors.onSurfaceVariant }}>Loading...</Text>
        </View>
      </>
    );
  }

  const currentIdx = days.findIndex((d) => d.id === program.current_day_id);
  const starter = program.is_starter;

  const handleDuplicate = async () => {
    const newId = await duplicateProgram(program.id);
    router.replace(`/program/${newId}`);
  };

  const rescheduleNotifications = async () => {
    try {
      const enabled = await getAppSetting("reminders_enabled");
      if (enabled !== "true") return;
      const raw = await getAppSetting("reminder_time");
      const [h, m] = (raw ?? "08:00").split(":").map(Number);
      await scheduleReminders({ hour: h, minute: m });
    } catch {
      // non-critical
    }
  };

  const assignDay = async (day: number, tpl: WorkoutTemplate | null) => {
    setPicker(null);
    if (!program) return;
    try {
      await setProgramScheduleDay(program.id, day, tpl?.id ?? null);
      const sched = await getProgramSchedule(program.id);
      setSchedule(sched);
      if (program.is_active) await rescheduleNotifications();
    } catch {
      Alert.alert("Error", "Couldn't update schedule.");
    }
  };

  const confirmClearSchedule = () => {
    if (!program) return;
    Alert.alert(
      "Clear Schedule",
      "Clear the weekly schedule for this program?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await clearProgramSchedule(program.id);
              setSchedule([]);
              if (program.is_active) await rescheduleNotifications();
            } catch {
              Alert.alert("Error", "Couldn't clear schedule.");
            }
          },
        },
      ]
    );
  };

  const schedEntry = (day: number) => schedule.find((s) => s.day_of_week === day);

  return (
    <>
      <Stack.Screen options={{ title: program.name }} />
      <FlashList
        style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}
        contentContainerStyle={{ paddingHorizontal: layout.horizontalPadding, paddingVertical: 16, paddingBottom: 48 }}
        data={days}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            {starter && (
              <Chip
                compact
                style={styles.starterChip}
                accessibilityLabel="Starter program, read-only. Duplicate to edit."
              >
                STARTER
              </Chip>
            )}

            {program.description ? (
              <Text
                variant="body"
                style={[styles.desc, { color: colors.onSurfaceVariant }]}
              >
                {program.description}
              </Text>
            ) : null}

            <View style={styles.meta}>
              <Text variant="body" style={{ color: colors.onBackground }}>
                {days.length} day{days.length !== 1 ? "s" : ""} · {cycle} cycle{cycle !== 1 ? "s" : ""} completed
              </Text>
              {program.is_active && currentIdx >= 0 && (
                <Text
                  variant="body"
                  style={{ color: colors.primary, fontWeight: "600" }}
                  accessibilityLabel={`Currently on day ${currentIdx + 1} of ${days.length}: ${dayName(days[currentIdx])}`}
                >
                  Current: Day {currentIdx + 1} — {dayName(days[currentIdx])}
                </Text>
              )}
            </View>

            {starter ? (
              <View style={styles.actions}>
                <Button
                  variant={program.is_active ? "outline" : "default"}
                  onPress={toggle}
                  disabled={loading}
                  style={styles.actionBtn}
                  accessibilityLabel={program.is_active ? "Deactivate program" : "Set program as active"}
                >
                  {program.is_active ? "Deactivate" : "Set Active"}
                </Button>
                <Button
                  variant="outline"
                  onPress={handleDuplicate}
                  style={styles.actionBtn}
                  accessibilityLabel="Duplicate to edit"
                  label="Duplicate to Edit"
                />
              </View>
            ) : (
              <View style={styles.actions}>
                <Button
                  variant={program.is_active ? "outline" : "default"}
                  onPress={toggle}
                  disabled={loading}
                  style={styles.actionBtn}
                  accessibilityLabel={program.is_active ? "Deactivate program" : "Set program as active"}
                >
                  {program.is_active ? "Deactivate" : "Set Active"}
                </Button>
                <Button
                  variant="outline"
                  onPress={() => router.push(`/program/create?programId=${program.id}`)}
                  style={styles.actionBtn}
                  accessibilityLabel="Edit program"
                  label="Edit"
                />
                <TouchableOpacity onPress={confirmDelete} accessibilityLabel="Delete program" hitSlop={8} style={{ padding: 8 }}>
                  <MaterialCommunityIcons name="delete" size={24} color={colors.onSurface} />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.sectionHeader}>
              <Text variant="title" style={{ color: colors.onBackground }}>
                Workout Days ({days.length})
              </Text>
              {!starter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => router.push(`/program/pick-template?programId=${program.id}`)}
                  accessibilityLabel="Add workout day"
                  label="Add Day"
                />
              )}
            </View>
          </>
        }
        renderItem={({ item, index }: { item: ProgramDay; index: number }) => (
          <Card
            style={StyleSheet.flatten([
              styles.card,
              { backgroundColor: colors.surface },
              item.id === program.current_day_id && {
                borderColor: colors.primary,
                borderWidth: 2,
              },
            ])}
            accessibilityLabel={`Day ${index + 1}: ${dayName(item)}${item.id === program.current_day_id ? ", current day" : ""}`}
          >
            <CardContent style={styles.cardContent}>
              <View style={styles.cardInfo}>
                <Text variant="subtitle" style={{ color: colors.onSurface }}>
                  Day {index + 1}: {dayName(item)}
                </Text>
                {item.template_id === null && (
                  <Text variant="caption" style={{ color: colors.error }}>
                    Deleted Template
                  </Text>
                )}
                {item.label && item.template_name && item.label !== item.template_name && (
                  <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                    {item.template_name}
                  </Text>
                )}
              </View>
              {!starter && (
                <View style={styles.cardActions}>
                  <TouchableOpacity onPress={() => move(index, -1)} disabled={index === 0} accessibilityLabel={`Move ${dayName(item)} up`} accessibilityHint="Reorders workout day" hitSlop={8} style={{ padding: 8 }}>
                    <MaterialCommunityIcons name="arrow-up" size={18} color={index === 0 ? colors.onSurfaceDisabled : colors.onSurface} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => move(index, 1)} disabled={index === days.length - 1} accessibilityLabel={`Move ${dayName(item)} down`} accessibilityHint="Reorders workout day" hitSlop={8} style={{ padding: 8 }}>
                    <MaterialCommunityIcons name="arrow-down" size={18} color={index === days.length - 1 ? colors.onSurfaceDisabled : colors.onSurface} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => remove(item.id)} accessibilityLabel={`Remove ${dayName(item)}`} hitSlop={8} style={{ padding: 8 }}>
                    <MaterialCommunityIcons name="close" size={18} color={colors.onSurface} />
                  </TouchableOpacity>
                </View>
              )}
            </CardContent>
          </Card>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text
              variant="body"
              style={{ color: colors.onSurfaceVariant }}
              accessibilityRole="text"
              accessibilityLabel="No workout days added yet"
            >
              No workout days yet. Add templates above.
            </Text>
          </View>
        }
        ListFooterComponent={
          <>
            {/* Weekly Schedule */}
            <View style={styles.scheduleSection}>
              <View style={styles.sectionHeader}>
                <Text variant="title" style={{ color: colors.onBackground }}>
                  Weekly Schedule
                </Text>
                {schedule.length > 0 && !starter && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={confirmClearSchedule}
                    accessibilityLabel="Clear weekly schedule"
                    label="Clear"
                  />
                )}
              </View>

              {templates.length === 0 ? (
                <Text variant="body" style={{ color: colors.onSurfaceVariant, marginBottom: 8 }}>
                  Create a template first to set a schedule.
                </Text>
              ) : (
                <>
                  {DAYS.map((label, i) => {
                    const e = schedEntry(i);
                    return (
                      <Pressable
                        key={i}
                        onPress={starter ? undefined : () => setPicker(i)}
                        disabled={starter}
                        style={[
                          styles.daySlot,
                          { backgroundColor: colors.surface, borderColor: colors.outlineVariant },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`${label}: ${e ? e.template_name : "Rest day"}`}
                      >
                        <View style={styles.dayRow}>
                          <Text variant="subtitle" style={[styles.dayLabel, { color: colors.onSurface }]}>
                            {label}
                          </Text>
                          <View style={styles.dayInfo}>
                            {e ? (
                              <Text variant="body" style={{ color: colors.onSurface }} numberOfLines={1}>
                                {e.template_name}
                              </Text>
                            ) : (
                              <Text variant="body" style={{ color: colors.onSurfaceVariant }}>
                                Rest
                              </Text>
                            )}
                          </View>
                          {!starter && (
                            <MaterialCommunityIcons
                              name="chevron-right"
                              size={20}
                              color={colors.onSurfaceVariant}
                            />
                          )}
                        </View>
                      </Pressable>
                    );
                  })}
                </>
              )}
            </View>

            {/* Template picker modal for schedule */}
            <Modal
              visible={picker !== null}
              transparent
              animationType="fade"
              onRequestClose={() => setPicker(null)}
              accessibilityViewIsModal
            >
              <View style={[styles.overlay, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
                <Card style={StyleSheet.flatten([styles.picker, { backgroundColor: colors.surface }])}>
                  <CardContent>
                    <Text variant="title" style={{ color: colors.onSurface, marginBottom: 12 }}>
                      {picker !== null ? DAYS[picker] : ""} — Pick Template
                    </Text>

                    <FlashList
                      data={
                        picker !== null && schedEntry(picker)
                          ? [{ id: "__remove__", name: "Remove (Rest Day)" } as WorkoutTemplate, ...templates]
                          : templates
                      }
                      keyExtractor={(item) => item.id}
                      style={{ maxHeight: 300 }}
                      renderItem={({ item }) => {
                        if (item.id === "__remove__") {
                          return (
                            <Pressable
                              onPress={() => assignDay(picker!, null)}
                              style={[styles.pickItem, { borderBottomColor: colors.outlineVariant }]}
                              accessibilityRole="button"
                              accessibilityLabel="Remove template, set as rest day"
                            >
                              <Text variant="body" style={{ color: colors.error }}>
                                Remove (Rest Day)
                              </Text>
                            </Pressable>
                          );
                        }
                        return (
                          <Pressable
                            onPress={() => picker !== null && assignDay(picker, item)}
                            style={[styles.pickItem, { borderBottomColor: colors.outlineVariant }]}
                            accessibilityRole="button"
                            accessibilityLabel={`Select template: ${item.name}`}
                          >
                            <Text
                              variant="body"
                              style={{
                                color: picker !== null && schedEntry(picker)?.template_id === item.id
                                  ? colors.primary
                                  : colors.onSurface,
                              }}
                              numberOfLines={1}
                            >
                              {item.name}
                            </Text>
                          </Pressable>
                        );
                      }}
                    />

                    <Button
                      variant="ghost"
                      onPress={() => setPicker(null)}
                      style={{ marginTop: 8 }}
                      accessibilityLabel="Cancel template selection"
                      label="Cancel"
                    />
                  </CardContent>
                </Card>
              </View>
            </Modal>

            {history.length > 0 && (
            <View style={styles.history}>
              <Text variant="title" style={[styles.historyTitle, { color: colors.onBackground }]}>
                History
              </Text>
              {history.map((h) => (
                <Card
                  key={h.session_id}
                  style={StyleSheet.flatten([styles.historyCard, { backgroundColor: colors.surface }])}
                  onPress={() => router.push(`/session/detail/${h.session_id}`)}
                  accessibilityLabel={`Completed ${h.day_label || h.template_name || "workout"} on ${dateStr(h.completed_at)}`}
                  accessibilityRole="button"
                >
                  <CardContent style={styles.historyRow}>
                    <Text variant="body" style={{ color: colors.onSurface, flex: 1 }}>
                      {h.day_label || h.template_name || "Workout"}
                    </Text>
                    <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                      {dateStr(h.completed_at)}
                    </Text>
                  </CardContent>
                </Card>
              ))}
            </View>
            )}
          </>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  desc: {
    marginBottom: 12,
  },
  starterChip: {
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  meta: {
    marginBottom: 16,
    gap: 4,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 8,
  },
  actionBtn: {
    flex: 1,
  },
  btnContent: {
    paddingVertical: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  empty: {
    alignItems: "center",
    paddingVertical: 24,
  },
  scheduleSection: {
    marginTop: 24,
  },
  daySlot: {
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 6,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  dayLabel: {
    width: 36,
    fontWeight: "600",
  },
  dayInfo: {
    flex: 1,
    marginLeft: 8,
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  picker: {
    width: "100%",
    maxHeight: "80%",
  },
  pickItem: {
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
    justifyContent: "center",
  },
  history: {
    marginTop: 24,
  },
  historyTitle: {
    marginBottom: 8,
  },
  historyCard: {
    marginBottom: 4,
    minHeight: 48,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
  },
});
