import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Modal, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  Card,
  Text,
  TouchableRipple,
  useTheme,
} from "react-native-paper";
import { Stack, useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  clearSchedule,
  getSchedule,
  getTemplates,
  setScheduleDay,
  getAppSetting,
  type ScheduleEntry,
} from "../../lib/db";
import { scheduleReminders } from "../../lib/notifications";
import type { WorkoutTemplate } from "../../lib/types";
import { DAYS } from "../../lib/format";

export default function Schedule() {
  const theme = useTheme();
  const router = useRouter();
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [picker, setPicker] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(false);
    setLoading(true);
    try {
      const [sched, tpls] = await Promise.all([getSchedule(), getTemplates()]);
      setSchedule(sched);
      setTemplates(tpls);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const entry = (day: number) => schedule.find((s) => s.day_of_week === day);

  const reschedule = async () => {
    try {
      const enabled = await getAppSetting("reminders_enabled");
      if (enabled !== "true") return;
      const raw = await getAppSetting("reminder_time");
      const [h, m] = (raw ?? "08:00").split(":").map(Number);
      await scheduleReminders({ hour: h, minute: m });
    } catch {
      Alert.alert("Reminders", "Couldn't set reminders. Try again later.");
    }
  };

  const assign = async (day: number, tpl: WorkoutTemplate | null) => {
    setPicker(null);
    try {
      await setScheduleDay(day, tpl?.id ?? null);
      const sched = await getSchedule();
      setSchedule(sched);
      await reschedule();
    } catch {
      Alert.alert("Error", "Couldn't update schedule. Please try again.");
    }
  };

  const confirmClear = () => {
    Alert.alert(
      "Clear Schedule",
      "Clear your entire weekly schedule? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await clearSchedule();
              setSchedule([]);
              await reschedule();
            } catch {
              Alert.alert("Error", "Couldn't clear schedule. Please try again.");
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: "Weekly Schedule" }} />
        <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
          <ActivityIndicator size="large" />
        </View>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Stack.Screen options={{ title: "Weekly Schedule" }} />
        <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
            Couldn't load templates. Tap to retry.
          </Text>
          <Button mode="contained" onPress={load} accessibilityLabel="Retry loading templates">
            Retry
          </Button>
        </View>
      </>
    );
  }

  if (templates.length === 0) {
    return (
      <>
        <Stack.Screen options={{ title: "Weekly Schedule" }} />
        <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
          <MaterialCommunityIcons
            name="calendar-blank"
            size={48}
            color={theme.colors.onSurfaceVariant}
          />
          <Text
            variant="bodyLarge"
            style={{ color: theme.colors.onSurfaceVariant, marginTop: 16, textAlign: "center" }}
          >
            Create a template first to start scheduling
          </Text>
          <Button
            mode="contained"
            onPress={() => router.push("/template/create")}
            style={{ marginTop: 16 }}
            accessibilityLabel="Create a workout template"
          >
            Create Template
          </Button>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Weekly Schedule" }} />
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Text variant="titleMedium" style={{ color: theme.colors.onBackground, marginBottom: 12 }}>
          Assign templates to days
        </Text>

        {DAYS.map((label, i) => {
          const e = entry(i);
          return (
            <TouchableRipple
              key={i}
              onPress={() => setPicker(i)}
              style={[
                styles.day,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${label}: ${e ? e.template_name : "Rest day"}`}
            >
              <View style={styles.dayRow}>
                <Text variant="titleSmall" style={[styles.dayLabel, { color: theme.colors.onSurface }]}>
                  {label}
                </Text>
                <View style={styles.dayInfo}>
                  {e ? (
                    <>
                      <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }} numberOfLines={1}>
                        {e.template_name}
                      </Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {e.exercise_count} exercises
                      </Text>
                    </>
                  ) : (
                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                      Rest day
                    </Text>
                  )}
                </View>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={24}
                  color={theme.colors.onSurfaceVariant}
                />
              </View>
            </TouchableRipple>
          );
        })}

        {schedule.length > 0 && (
          <Button
            mode="outlined"
            onPress={confirmClear}
            style={styles.clear}
            textColor={theme.colors.error}
            accessibilityLabel="Clear entire schedule"
          >
            Clear Schedule
          </Button>
        )}

        {/* Template picker modal */}
        <Modal
          visible={picker !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setPicker(null)}
          accessibilityViewIsModal
        >
          <View style={[styles.overlay, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
            <Card style={[styles.picker, { backgroundColor: theme.colors.surface }]}>
              <Card.Content>
                <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 12 }}>
                  {picker !== null ? DAYS[picker] : ""} — Pick Template
                </Text>

                <FlatList
                  data={
                    picker !== null && entry(picker)
                      ? [{ id: "__remove__", name: "Remove (Rest Day)" } as WorkoutTemplate, ...templates]
                      : templates
                  }
                  keyExtractor={(item) => item.id}
                  style={{ maxHeight: 300 }}
                  renderItem={({ item }) => {
                    if (item.id === "__remove__") {
                      return (
                        <TouchableRipple
                          onPress={() => assign(picker!, null)}
                          style={[styles.pickItem, { borderBottomColor: theme.colors.outlineVariant }]}
                          accessibilityRole="button"
                          accessibilityLabel="Remove template, set as rest day"
                        >
                          <Text variant="bodyMedium" style={{ color: theme.colors.error }}>
                            Remove (Rest Day)
                          </Text>
                        </TouchableRipple>
                      );
                    }
                    return (
                      <TouchableRipple
                        onPress={() => picker !== null && assign(picker, item)}
                        style={[styles.pickItem, { borderBottomColor: theme.colors.outlineVariant }]}
                        accessibilityRole="button"
                        accessibilityLabel={`Select template: ${item.name}`}
                      >
                        <Text
                          variant="bodyMedium"
                          style={{
                            color: picker !== null && entry(picker)?.template_id === item.id
                              ? theme.colors.primary
                              : theme.colors.onSurface,
                          }}
                          numberOfLines={1}
                        >
                          {item.name}
                        </Text>
                      </TouchableRipple>
                    );
                  }}
                />

                <Button
                  mode="text"
                  onPress={() => setPicker(null)}
                  style={{ marginTop: 8 }}
                  accessibilityLabel="Cancel template selection"
                >
                  Cancel
                </Button>
              </Card.Content>
            </Card>
          </View>
        </Modal>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  day: {
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
    minHeight: 56,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  dayLabel: {
    width: 40,
    fontWeight: "600",
  },
  dayInfo: {
    flex: 1,
    marginLeft: 8,
  },
  clear: {
    marginTop: 16,
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
});
