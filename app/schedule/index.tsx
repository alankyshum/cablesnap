import { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
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
  type ScheduleEntry,
} from "../../lib/db";
import type { WorkoutTemplate } from "../../lib/types";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

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

  const assign = async (day: number, tpl: WorkoutTemplate | null) => {
    setPicker(null);
    await setScheduleDay(day, tpl?.id ?? null);
    const sched = await getSchedule();
    setSchedule(sched);
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
            await clearSchedule();
            setSchedule([]);
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
        {picker !== null && (
          <View style={[styles.overlay, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
            <Card style={[styles.picker, { backgroundColor: theme.colors.surface }]}>
              <Card.Content>
                <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 12 }}>
                  {DAYS[picker]} — Pick Template
                </Text>

                {entry(picker) && (
                  <TouchableRipple
                    onPress={() => assign(picker, null)}
                    style={[styles.pickItem, { borderBottomColor: theme.colors.outlineVariant }]}
                    accessibilityRole="button"
                    accessibilityLabel="Remove template, set as rest day"
                  >
                    <Text variant="bodyMedium" style={{ color: theme.colors.error }}>
                      Remove (Rest Day)
                    </Text>
                  </TouchableRipple>
                )}

                {templates.map((tpl) => (
                  <TouchableRipple
                    key={tpl.id}
                    onPress={() => assign(picker, tpl)}
                    style={[styles.pickItem, { borderBottomColor: theme.colors.outlineVariant }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Select template: ${tpl.name}`}
                  >
                    <Text
                      variant="bodyMedium"
                      style={{
                        color: entry(picker)?.template_id === tpl.id
                          ? theme.colors.primary
                          : theme.colors.onSurface,
                      }}
                      numberOfLines={1}
                    >
                      {tpl.name}
                    </Text>
                  </TouchableRipple>
                ))}

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
        )}
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
