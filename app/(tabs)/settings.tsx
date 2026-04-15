import { useCallback, useEffect, useState } from "react";
import { Linking, ScrollView, StyleSheet, Switch, TextInput, View } from "react-native";
import { Button, Card, SegmentedButtons, Snackbar, Text, useTheme, Divider } from "react-native-paper";
import { useLayout } from "../../lib/layout";
import FlowContainer, { flowCardStyle } from "../../components/ui/FlowContainer";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import {
  exportAllData,
  importData,
  getWorkoutCSVData,
  getNutritionCSVData,
  getBodyWeightCSVData,
  getBodyMeasurementsCSVData,
  getCSVCounts,
  getAppSetting,
  setAppSetting,
  getSchedule,
  getBodySettings,
  updateBodySettings,
} from "../../lib/db";

import { getErrorCount } from "../../lib/errors";
import { workoutCSV, nutritionCSV, bodyWeightCSV, bodyMeasurementsCSV } from "../../lib/csv-format";
import { setEnabled as setAudioEnabled } from "../../lib/audio";
import {
  requestPermission,
  scheduleReminders,
  cancelAll,
  getPermissionStatus,
} from "../../lib/notifications";

const RANGE_BUTTONS = [
  { value: "7", label: "7 days", accessibilityLabel: "Date range 7 days" },
  { value: "30", label: "30 days", accessibilityLabel: "Date range 30 days" },
  { value: "90", label: "90 days", accessibilityLabel: "Date range 90 days" },
  { value: "all", label: "All", accessibilityLabel: "Date range All" },
];

function sinceForRange(range: string): number {
  if (range === "all") return 0;
  const days = Number(range);
  return Date.now() - days * 86_400_000;
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Settings() {
  const theme = useTheme();
  const router = useRouter();
  const layout = useLayout();
  const [loading, setLoading] = useState(false);
  const [snack, setSnack] = useState("");
  const [count, setCount] = useState(0);
  const [range, setRange] = useState("30");
  const [counts, setCounts] = useState({ sessions: 0, entries: 0 });
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [reminders, setReminders] = useState(false);
  const [reminderTime, setReminderTime] = useState("08:00");
  const [permDenied, setPermDenied] = useState(false);
  const [scheduleCount, setScheduleCount] = useState(0);
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">("kg");
  const [measureUnit, setMeasureUnit] = useState<"cm" | "in">("cm");
  const [weightGoal, setWeightGoal] = useState<number | null>(null);
  const [fatGoal, setFatGoal] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      getErrorCount().then(setCount);
      getBodySettings().then((s) => {
        setWeightUnit(s.weight_unit);
        setMeasureUnit(s.measurement_unit as "cm" | "in");
        setWeightGoal(s.weight_goal);
        setFatGoal(s.body_fat_goal);
      }).catch(() => {});
      getAppSetting("timer_sound_enabled").then((val) => {
        const on = val !== "false";
        setSoundEnabled(on);
        setAudioEnabled(on);
      }).catch(() => {
        setSoundEnabled(true);
        setAudioEnabled(true);
        setSnack("Could not load sound setting");
      });
      Promise.all([
        getAppSetting("reminders_enabled"),
        getAppSetting("reminder_time"),
        getPermissionStatus(),
        getSchedule(),
      ]).then(([enabled, time, perm, sched]) => {
        const on = enabled === "true" && perm === "granted";
        setReminders(on);
        if (time) setReminderTime(time);
        setPermDenied(perm === "denied");
        setScheduleCount(sched.length);
      }).catch(() => {});
    }, [])
  );

  useEffect(() => {
    getCSVCounts(sinceForRange(range)).then(setCounts);
  }, [range]);

  const handleWorkoutCSV = async () => {
    setLoading(true);
    try {
      const rows = await getWorkoutCSVData(sinceForRange(range));
      if (rows.length === 0) { setSnack("No data to export"); setLoading(false); return; }
      const csv = workoutCSV(rows);
      const file = new File(Paths.cache, `fitforge-workouts-${dateStamp()}.csv`);
      await file.write(csv);
      await Sharing.shareAsync(file.uri, {
        mimeType: "text/csv",
        dialogTitle: "Export Workouts CSV",
      });
    } catch {
      setSnack("Export failed");
    } finally {
      setLoading(false);
    }
  };

  const handleNutritionCSV = async () => {
    setLoading(true);
    try {
      const rows = await getNutritionCSVData(sinceForRange(range));
      if (rows.length === 0) { setSnack("No data to export"); setLoading(false); return; }
      const csv = nutritionCSV(rows);
      const file = new File(Paths.cache, `fitforge-nutrition-${dateStamp()}.csv`);
      await file.write(csv);
      await Sharing.shareAsync(file.uri, {
        mimeType: "text/csv",
        dialogTitle: "Export Nutrition CSV",
      });
    } catch {
      setSnack("Export failed");
    } finally {
      setLoading(false);
    }
  };

  const handleBodyWeightCSV = async () => {
    setLoading(true);
    try {
      const rows = await getBodyWeightCSVData(sinceForRange(range));
      if (rows.length === 0) { setSnack("No data to export"); setLoading(false); return; }
      const csv = bodyWeightCSV(rows);
      const file = new File(Paths.cache, `fitforge-body-weight-${dateStamp()}.csv`);
      await file.write(csv);
      await Sharing.shareAsync(file.uri, {
        mimeType: "text/csv",
        dialogTitle: "Export Body Weight CSV",
      });
    } catch {
      setSnack("Export failed");
    } finally {
      setLoading(false);
    }
  };

  const handleBodyMeasurementsCSV = async () => {
    setLoading(true);
    try {
      const rows = await getBodyMeasurementsCSVData(sinceForRange(range));
      if (rows.length === 0) { setSnack("No data to export"); setLoading(false); return; }
      const csv = bodyMeasurementsCSV(rows);
      const file = new File(Paths.cache, `fitforge-body-measurements-${dateStamp()}.csv`);
      await file.write(csv);
      await Sharing.shareAsync(file.uri, {
        mimeType: "text/csv",
        dialogTitle: "Export Body Measurements CSV",
      });
    } catch {
      setSnack("Export failed");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setLoading(true);
    try {
      const data = await exportAllData();
      const json = JSON.stringify(data, null, 2);
      const file = new File(Paths.cache, "fitforge-export.json");
      await file.write(json);
      await Sharing.shareAsync(file.uri, {
        mimeType: "application/json",
        dialogTitle: "Export FitForge Data",
      });
      setSnack("Data exported successfully");
    } catch {
      setSnack("Export failed");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/json",
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;

      setLoading(true);
      const uri = result.assets[0].uri;
      const file = new File(uri);
      const raw = await file.text();

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw);
      } catch {
        setSnack("Invalid file format");
        setLoading(false);
        return;
      }

      if (typeof data !== "object" || data === null) {
        setSnack("Invalid file format");
        setLoading(false);
        return;
      }

      if (data.version !== 1 && data.version !== 2) {
        setSnack("Unsupported format version");
        setLoading(false);
        return;
      }

      const { inserted } = await importData(
        data as Parameters<typeof importData>[0]
      );
      setSnack(`Import complete — ${inserted} records added`);
    } catch {
      setSnack("Import failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding }]}
    >
      <Text variant="headlineMedium" style={{ color: theme.colors.onBackground, marginBottom: 24 }}>
        Settings
      </Text>

      <FlowContainer gap={16}>
      <Card style={[styles.flowCard, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 16 }}>
            Units
          </Text>

          <View style={styles.row}>
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, flex: 1 }}>
              Weight
            </Text>
            <View style={styles.unitToggle}>
              <SegmentedButtons
                value={weightUnit}
                onValueChange={async (val) => {
                  const u = val as "kg" | "lb";
                  setWeightUnit(u);
                  try {
                    await updateBodySettings(u, measureUnit, weightGoal, fatGoal);
                  } catch {
                    setSnack("Could not save unit");
                  }
                }}
                buttons={[
                  { value: "kg", label: "kg" },
                  { value: "lb", label: "lb" },
                ]}
                density="medium"
              />
            </View>
          </View>

          <View style={[styles.row, { marginTop: 12 }]}>
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, flex: 1 }}>
              Measurements
            </Text>
            <View style={styles.unitToggle}>
              <SegmentedButtons
                value={measureUnit}
                onValueChange={async (val) => {
                  const m = val as "cm" | "in";
                  setMeasureUnit(m);
                  try {
                    await updateBodySettings(weightUnit, m, weightGoal, fatGoal);
                  } catch {
                    setSnack("Could not save unit");
                  }
              }}
                buttons={[
                  { value: "cm", label: "cm" },
                  { value: "in", label: "in" },
                ]}
                density="medium"
              />
            </View>
          </View>
        </Card.Content>
      </Card>

      <Card style={[styles.flowCard, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 16 }}>
            Preferences
          </Text>

          <View style={styles.row}>
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, flex: 1 }}>
              Workout Reminders
            </Text>
            <Switch
              value={reminders}
              onValueChange={async (val) => {
                if (val) {
                  if (scheduleCount === 0) {
                    setSnack("No workout days scheduled — set up your schedule first");
                    return;
                  }
                  try {
                    const granted = await requestPermission();
                    if (!granted) {
                      setPermDenied(true);
                      setSnack("Notification permission denied");
                      return;
                    }
                    setPermDenied(false);
                    const parts = reminderTime.split(":"); const h = Number(parts[0]); const m = Number(parts[1]);
                    const count = await scheduleReminders({ hour: h, minute: m });
                    await setAppSetting("reminders_enabled", "true");
                    setReminders(true);
                    setSnack(`Reminders set for ${count} day${count !== 1 ? "s" : ""}`);
                  } catch {
                    setSnack("Couldn't set reminders. Try again later.");
                  }
                } else {
                  try {
                    await cancelAll();
                    await setAppSetting("reminders_enabled", "false");
                    setReminders(false);
                  } catch {
                    setSnack("Couldn't disable reminders. Try again later.");
                  }
                }
              }}
              accessibilityLabel="Workout Reminders"
              accessibilityRole="switch"
              accessibilityHint="Enable or disable push notifications for scheduled workout days"
            />
          </View>

          {reminders && (
            <>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
                {`You'll be reminded at ${reminderTime} on days with scheduled workouts`}
              </Text>
              <View style={styles.row}>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, marginRight: 12 }}>
                  Time
                </Text>
                <TextInput
                  value={reminderTime}
                  onChangeText={setReminderTime}
                  onBlur={async () => {
                    const match = reminderTime.match(/^(\d{1,2}):(\d{2})$/);
                    if (!match) {
                      setReminderTime("08:00");
                      setSnack("Invalid time format. Use HH:MM");
                      return;
                    }
                    const h = Number(match[1]);
                    const m = Number(match[2]);
                    if (h > 23 || m > 59) {
                      setReminderTime("08:00");
                      setSnack("Invalid time. Hours 0-23, minutes 0-59");
                      return;
                    }
                    const padded = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                    setReminderTime(padded);
                    try {
                      await setAppSetting("reminder_time", padded);
                      await scheduleReminders({ hour: h, minute: m });
                    } catch {
                      setSnack("Couldn't set reminders. Try again later.");
                    }
                  }}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  style={[
                    styles.timeInput,
                    {
                      color: theme.colors.onSurface,
                      borderColor: theme.colors.outlineVariant,
                      backgroundColor: theme.colors.surfaceVariant,
                    },
                  ]}
                  accessibilityLabel="Reminder time"
                  accessibilityValue={{ text: reminderTime }}
                />
              </View>
            </>
          )}

          {!reminders && scheduleCount === 0 && (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
              Set a weekly schedule on your active program to enable reminders.
            </Text>
          )}

          {permDenied && !reminders && (
            <View style={{ marginTop: 8 }}>
              <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 8 }}>
                Notification permission is denied. Enable it in your device settings to use reminders.
              </Text>
              <Button
                mode="outlined"
                onPress={() => Linking.openSettings()}
                compact
                style={{ alignSelf: "flex-start" }}
                accessibilityLabel="Open device notification settings"
              >
                Open Settings
              </Button>
            </View>
          )}

          <View style={[styles.row, { marginTop: 16 }]}>
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, flex: 1 }}>
              Timer Sound
            </Text>
            <Switch
              value={soundEnabled}
              onValueChange={async (val) => {
                setSoundEnabled(val);
                setAudioEnabled(val);
                try {
                  await setAppSetting("timer_sound_enabled", val ? "true" : "false");
                } catch {
                  setSnack("Failed to save timer sound setting");
                }
              }}
              accessibilityLabel="Timer Sound"
              accessibilityRole="switch"
              accessibilityHint="Enable or disable audio cues for workout timers"
            />
          </View>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Audio cues for interval timers and rest countdowns.
          </Text>
        </Card.Content>
      </Card>

      <Card style={[styles.flowCard, styles.wideCard, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 16 }}>
            Data
          </Text>

          <View style={styles.buttonFlow}>
            <Button
              mode="contained"
              icon="export"
              onPress={handleExport}
              loading={loading}
              disabled={loading}
              contentStyle={styles.exportBtnContent}
              accessibilityLabel="Export all data as JSON"
            >
              Export All
            </Button>

            <Button
              mode="outlined"
              icon="import"
              onPress={handleImport}
              loading={loading}
              disabled={loading}
              contentStyle={styles.exportBtnContent}
              accessibilityLabel="Import data"
            >
              Import
            </Button>
          </View>

          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, marginBottom: 16 }}>
            Export as JSON or import a previously exported file. Duplicates are skipped.
          </Text>

          <Text variant="labelLarge" style={{ color: theme.colors.onSurface, marginBottom: 8 }}>
            CSV Export
          </Text>

          <SegmentedButtons
            value={range}
            onValueChange={setRange}
            buttons={RANGE_BUTTONS}
            style={styles.segment}
          />

          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12, marginTop: 8 }}
            accessibilityLabel={`${counts.sessions} workout sessions, ${counts.entries} nutrition entries`}
          >
            {counts.sessions} session{counts.sessions !== 1 ? "s" : ""}, {counts.entries} entr{counts.entries !== 1 ? "ies" : "y"}
          </Text>

          <View style={styles.buttonFlow}>
            <Button
              mode="outlined"
              icon="file-export-outline"
              onPress={handleWorkoutCSV}
              loading={loading}
              disabled={loading}
              contentStyle={styles.exportBtnContent}
              accessibilityLabel="Export workouts as CSV"
            >
              Workouts
            </Button>

            <Button
              mode="outlined"
              icon="food-apple-outline"
              onPress={handleNutritionCSV}
              loading={loading}
              disabled={loading}
              contentStyle={styles.exportBtnContent}
              accessibilityLabel="Export nutrition as CSV"
            >
              Nutrition
            </Button>

            <Button
              mode="outlined"
              icon="scale-bathroom"
              onPress={handleBodyWeightCSV}
              loading={loading}
              disabled={loading}
              contentStyle={styles.exportBtnContent}
              accessibilityLabel="Export body weight as CSV"
            >
              Body Weight
            </Button>

            <Button
              mode="outlined"
              icon="human"
              onPress={handleBodyMeasurementsCSV}
              loading={loading}
              disabled={loading}
              contentStyle={styles.exportBtnContent}
              accessibilityLabel="Export body measurements as CSV"
            >
              Measurements
            </Button>
          </View>

          <Divider style={{ marginVertical: 16 }} />

          <Text variant="labelLarge" style={{ color: theme.colors.onSurface, marginBottom: 8 }}>
            CSV Import
          </Text>

          <Button
            mode="outlined"
            icon="file-import-outline"
            onPress={() => router.push("/settings/import-strong")}
            contentStyle={styles.exportBtnContent}
            accessibilityLabel="Import workout data from Strong CSV export"
          >
            Import from Strong
          </Button>

          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
            Import workout history from the Strong app using a CSV export file.
          </Text>
        </Card.Content>
      </Card>

      <Card style={[styles.flowCard, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 16 }}>
            Feedback &amp; Reports
          </Text>

          <View style={styles.buttonFlow}>
            <Button
              mode="contained"
              icon="bug-outline"
              onPress={() => router.push({ pathname: "/feedback", params: { type: "bug" } })}
              contentStyle={styles.exportBtnContent}
              accessibilityLabel="Report a bug"
            >
              Report Bug
            </Button>

            <Button
              mode="outlined"
              icon="lightbulb-outline"
              onPress={() => router.push({ pathname: "/feedback", params: { type: "feature" } })}
              contentStyle={styles.exportBtnContent}
              accessibilityLabel="Request a feature"
            >
              Feature Request
            </Button>

            <Button
              mode="outlined"
              icon="format-list-bulleted"
              onPress={() => router.push("/errors")}
              contentStyle={styles.exportBtnContent}
              accessibilityLabel={`View error log, ${count} ${count === 1 ? "error" : "errors"}`}
            >
              Errors ({count})
            </Button>

          </View>
        </Card.Content>
      </Card>

      <Card style={[styles.flowCard, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 8 }}>
            About
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            FitForge v1.0.0{"\n"}Free & open-source workout tracker.
          </Text>
        </Card.Content>
      </Card>
      </FlowContainer>

      <Snackbar
        visible={!!snack}
        onDismiss={() => setSnack("")}
        duration={3000}
        action={{ label: "OK", onPress: () => setSnack("") }}
      >
        {snack}
      </Snackbar>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingTop: 16,
    paddingBottom: 48,
  },
  flowCard: {
    ...flowCardStyle,
    maxWidth: undefined,
  },
  wideCard: {
    minWidth: 340,
    flexBasis: 340,
  },
  segment: {
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  unitToggle: {
    width: 140,
    flexShrink: 0,
  },
  buttonFlow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  exportBtnContent: {
    paddingHorizontal: 8,
  },
  timeInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    textAlign: "center",
    width: 80,
  },
});
