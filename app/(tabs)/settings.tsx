import { useCallback, useEffect, useState } from "react";
import { AccessibilityInfo, Linking, Platform, ScrollView, StyleSheet, Switch, TextInput, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/bna-toast";
import { Download, Upload, FileUp, FileOutput, Apple, Scale, User, Bug, Lightbulb, List, Activity, HeartPulse } from "lucide-react-native";
import { useLayout } from "../../lib/layout";
import { useFloatingTabBarHeight } from "../../components/FloatingTabBar";
import FlowContainer, { flowCardStyle } from "../../components/ui/FlowContainer";
import BodyProfileCard from "../../components/BodyProfileCard";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Alert } from "react-native";
import {
  exportAllData,
  estimateExportSize,
  validateBackupFileSize,
  validateBackupData,
  BACKUP_TABLE_LABELS,
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
  getStravaConnection,
} from "../../lib/db";
import type { BackupTableName, ExportProgress } from "../../lib/db";

import { getErrorCount } from "../../lib/errors";
import { workoutCSV, nutritionCSV, bodyWeightCSV, bodyMeasurementsCSV } from "../../lib/csv-format";
import { setEnabled as setAudioEnabled } from "../../lib/audio";
import {
  requestPermission,
  scheduleReminders,
  cancelAll,
  getPermissionStatus,
} from "../../lib/notifications";
import { connectStrava, disconnect as disconnectStrava } from "../../lib/strava";
import ErrorBoundary from "../../components/ErrorBoundary";
import { useThemeColors } from "@/hooks/useThemeColors";

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
  const colors = useThemeColors();
  const router = useRouter();
  const layout = useLayout();
  const tabBarHeight = useFloatingTabBarHeight();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
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
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const [stravaAthlete, setStravaAthlete] = useState<string | null>(null);
  const [stravaLoading, setStravaLoading] = useState(false);
  const [hcEnabled, setHcEnabled] = useState(false);
  const [hcLoading, setHcLoading] = useState(false);
  const [hcSdkStatus, setHcSdkStatus] = useState<"available" | "needs_install" | "needs_update" | "unavailable">("unavailable");

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
        toast.error("Could not load sound setting");
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
      if (Platform.OS !== "web") {
        getStravaConnection().then((conn) => {
          setStravaAthlete(conn?.athlete_name ?? null);
        }).catch(() => {});
      }
      // Health Connect status check (Android only, dynamic import)
      if (Platform.OS === "android") {
        (async () => {
          try {
            const { getHealthConnectSdkStatus, checkHealthConnectPermissionStatus } =
              await import("../../lib/health-connect");
            const status = await getHealthConnectSdkStatus();
            setHcSdkStatus(status);
            if (status === "available") {
              const setting = await getAppSetting("health_connect_enabled");
              if (setting === "true") {
                const hasPermission = await checkHealthConnectPermissionStatus();
                if (!hasPermission) {
                  await setAppSetting("health_connect_enabled", "false");
                  setHcEnabled(false);
                  toast.error("Health Connect permission was revoked");
                  AccessibilityInfo.announceForAccessibility("Health Connect permission was revoked");
                } else {
                  setHcEnabled(true);
                }
              } else {
                setHcEnabled(false);
              }
            }
          } catch {
            setHcSdkStatus("unavailable");
          }
        })();
      }
    }, [toast])
  );

  useEffect(() => {
    getCSVCounts(sinceForRange(range)).then(setCounts);
  }, [range]);

  const handleWorkoutCSV = async () => {
    setLoading(true);
    try {
      const rows = await getWorkoutCSVData(sinceForRange(range));
      if (rows.length === 0) { toast.info("No data to export"); setLoading(false); return; }
      const csv = workoutCSV(rows);
      const file = new File(Paths.cache, `fitforge-workouts-${dateStamp()}.csv`);
      await file.write(csv);
      await Sharing.shareAsync(file.uri, {
        mimeType: "text/csv",
        dialogTitle: "Export Workouts CSV",
      });
    } catch {
      toast.error("Export failed");
    } finally {
      setLoading(false);
    }
  };

  const handleNutritionCSV = async () => {
    setLoading(true);
    try {
      const rows = await getNutritionCSVData(sinceForRange(range));
      if (rows.length === 0) { toast.info("No data to export"); setLoading(false); return; }
      const csv = nutritionCSV(rows);
      const file = new File(Paths.cache, `fitforge-nutrition-${dateStamp()}.csv`);
      await file.write(csv);
      await Sharing.shareAsync(file.uri, {
        mimeType: "text/csv",
        dialogTitle: "Export Nutrition CSV",
      });
    } catch {
      toast.error("Export failed");
    } finally {
      setLoading(false);
    }
  };

  const handleBodyWeightCSV = async () => {
    setLoading(true);
    try {
      const rows = await getBodyWeightCSVData(sinceForRange(range));
      if (rows.length === 0) { toast.info("No data to export"); setLoading(false); return; }
      const csv = bodyWeightCSV(rows);
      const file = new File(Paths.cache, `fitforge-body-weight-${dateStamp()}.csv`);
      await file.write(csv);
      await Sharing.shareAsync(file.uri, {
        mimeType: "text/csv",
        dialogTitle: "Export Body Weight CSV",
      });
    } catch {
      toast.error("Export failed");
    } finally {
      setLoading(false);
    }
  };

  const handleBodyMeasurementsCSV = async () => {
    setLoading(true);
    try {
      const rows = await getBodyMeasurementsCSVData(sinceForRange(range));
      if (rows.length === 0) { toast.info("No data to export"); setLoading(false); return; }
      const csv = bodyMeasurementsCSV(rows);
      const file = new File(Paths.cache, `fitforge-body-measurements-${dateStamp()}.csv`);
      await file.write(csv);
      await Sharing.shareAsync(file.uri, {
        mimeType: "text/csv",
        dialogTitle: "Export Body Measurements CSV",
      });
    } catch {
      toast.error("Export failed");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const { label } = await estimateExportSize();
      Alert.alert(
        "Export All Data",
        `Your backup will be approximately ${label}. This may take a moment. Continue?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Export",
            onPress: async () => {
              setLoading(true);
              setExportProgress("Preparing export...");
              try {
                const data = await exportAllData((progress: ExportProgress) => {
                  if (progress.table === "done") {
                    setExportProgress(null);
                  } else {
                    const label = BACKUP_TABLE_LABELS[progress.table as BackupTableName] ?? progress.table;
                    setExportProgress(`Exporting ${label}... (${progress.tableIndex + 1}/${progress.totalTables})`);
                  }
                });

                const totalRecords = Object.values(data.counts).reduce((a, b) => a + b, 0);
                if (totalRecords === 0) {
                  toast.info("No data to export");
                  setLoading(false);
                  setExportProgress(null);
                  return;
                }

                const json = JSON.stringify(data, null, 2);
                const file = new File(Paths.cache, `fitforge-backup-${dateStamp()}.json`);
                await file.write(json);
                await Sharing.shareAsync(file.uri, {
                  mimeType: "application/json",
                  dialogTitle: "Export FitForge Data",
                });
                toast.success("Data exported successfully");
              } catch {
                toast.error("Export failed");
              } finally {
                setLoading(false);
                setExportProgress(null);
              }
            },
          },
        ]
      );
    } catch {
      toast.error("Could not estimate export size");
    }
  };

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/json",
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];

      // File size check
      if (asset.size && asset.size > 50 * 1024 * 1024) {
        Alert.alert("File Too Large", "This backup file is too large to process safely.");
        return;
      }

      setLoading(true);
      const uri = asset.uri;
      const file = new File(uri);
      const raw = await file.text();

      // File size validation on content
      const sizeError = validateBackupFileSize(raw.length);
      if (sizeError) {
        Alert.alert("File Too Large", sizeError.message);
        setLoading(false);
        return;
      }

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw);
      } catch {
        Alert.alert("Invalid File", "This file doesn't appear to be a valid FitForge backup.");
        setLoading(false);
        return;
      }

      const validationError = validateBackupData(data);
      if (validationError) {
        Alert.alert("Invalid Backup", validationError.message);
        setLoading(false);
        return;
      }

      // Navigate to import preview screen with the parsed data
      setLoading(false);
      router.push({
        pathname: "/settings/import-backup",
        params: { backupJson: raw },
      });
    } catch {
      toast.error("Import failed");
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding, paddingBottom: tabBarHeight + 16 }]}
    >
      <Text variant="heading" style={{ color: colors.onBackground, marginBottom: 24 }}>
        Settings
      </Text>

      <FlowContainer gap={16}>
      <Card style={StyleSheet.flatten([styles.flowCard, { backgroundColor: colors.surface }])}>
        <CardContent>
          <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 16 }}>
            Units
          </Text>

          <View style={styles.row}>
            <Text variant="body" style={{ color: colors.onSurface, flex: 1 }}>
              Weight
            </Text>
            <View style={styles.unitToggle}>
              <SegmentedControl
                value={weightUnit}
                onValueChange={async (val) => {
                  const u = val as "kg" | "lb";
                  setWeightUnit(u);
                  try {
                    await updateBodySettings(u, measureUnit, weightGoal, fatGoal);
                  } catch {
                    toast.error("Could not save unit");
                  }
                }}
                buttons={[
                  { value: "kg", label: "kg" },
                  { value: "lb", label: "lb" },
                ]}
              />
            </View>
          </View>

          <View style={[styles.row, { marginTop: 12 }]}>
            <Text variant="body" style={{ color: colors.onSurface, flex: 1 }}>
              Measurements
            </Text>
            <View style={styles.unitToggle}>
              <SegmentedControl
                value={measureUnit}
                onValueChange={async (val) => {
                  const m = val as "cm" | "in";
                  setMeasureUnit(m);
                  try {
                    await updateBodySettings(weightUnit, m, weightGoal, fatGoal);
                  } catch {
                    toast.error("Could not save unit");
                  }
              }}
                buttons={[
                  { value: "cm", label: "cm" },
                  { value: "in", label: "in" },
                ]}
              />
            </View>
          </View>
        </CardContent>
      </Card>

      <BodyProfileCard />

      <Card style={StyleSheet.flatten([styles.flowCard, { backgroundColor: colors.surface }])}>
        <CardContent>
          <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 16 }}>
            Preferences
          </Text>

          <View style={styles.row}>
            <Text variant="body" style={{ color: colors.onSurface, flex: 1 }}>
              Workout Reminders
            </Text>
            <Switch
              value={reminders}
              onValueChange={async (val) => {
                if (val) {
                  if (scheduleCount === 0) {
                    toast.info("Set up a weekly workout schedule in your active program first");
                    return;
                  }
                  try {
                    const granted = await requestPermission();
                    if (!granted) {
                      setPermDenied(true);
                      toast.error("Notification permission denied. Tap 'Open Settings' below to enable.");
                      return;
                    }
                    setPermDenied(false);
                    const parts = reminderTime.split(":"); const h = Number(parts[0]); const m = Number(parts[1]);
                    const count = await scheduleReminders({ hour: h, minute: m });
                    await setAppSetting("reminders_enabled", "true");
                    setReminders(true);
                    toast.success(`Reminders set for ${count} day${count !== 1 ? "s" : ""}`);
                  } catch {
                    toast.error("Couldn't set reminders. Try again later.");
                  }
                } else {
                  try {
                    await cancelAll();
                    await setAppSetting("reminders_enabled", "false");
                    setReminders(false);
                  } catch {
                    toast.error("Couldn't disable reminders. Try again later.");
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
              <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginBottom: 8 }}>
                {`You'll be reminded at ${reminderTime} on days with scheduled workouts`}
              </Text>
              <View style={styles.row}>
                <Text variant="body" style={{ color: colors.onSurface, marginRight: 12 }}>
                  Time
                </Text>
                <TextInput
                  value={reminderTime}
                  onChangeText={setReminderTime}
                  onBlur={async () => {
                    const match = reminderTime.match(/^(\d{1,2}):(\d{2})$/);
                    if (!match) {
                      setReminderTime("08:00");
                      toast.error("Invalid time format. Use HH:MM");
                      return;
                    }
                    const h = Number(match[1]);
                    const m = Number(match[2]);
                    if (h > 23 || m > 59) {
                      setReminderTime("08:00");
                      toast.error("Invalid time. Hours 0-23, minutes 0-59");
                      return;
                    }
                    const padded = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                    setReminderTime(padded);
                    try {
                      await setAppSetting("reminder_time", padded);
                      await scheduleReminders({ hour: h, minute: m });
                    } catch {
                      toast.error("Couldn't set reminders. Try again later.");
                    }
                  }}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  style={[
                    styles.timeInput,
                    {
                      color: colors.onSurface,
                      borderColor: colors.outlineVariant,
                      backgroundColor: colors.surfaceVariant,
                    },
                  ]}
                  accessibilityLabel="Reminder time"
                  accessibilityValue={{ text: reminderTime }}
                />
              </View>
            </>
          )}

          {!reminders && scheduleCount === 0 && (
            <Text variant="caption" style={{ color: colors.error, marginTop: 4 }}>
              No workout days scheduled. Set a weekly schedule on your active program to enable reminders.
            </Text>
          )}

          {permDenied && !reminders && (
            <View style={{ marginTop: 8 }}>
              <Text variant="caption" style={{ color: colors.error, marginBottom: 8 }}>
                Notification permission is denied. Enable it in your device settings to use reminders.
              </Text>
              <Button
                variant="outline"
                onPress={() => Linking.openSettings()}
                style={{ alignSelf: "flex-start" }}
                accessibilityLabel="Open device notification settings"
              >
                Open Settings
              </Button>
            </View>
          )}

          <View style={[styles.row, { marginTop: 16 }]}>
            <Text variant="body" style={{ color: colors.onSurface, flex: 1 }}>
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
                  toast.error("Failed to save timer sound setting");
                }
              }}
              accessibilityLabel="Timer Sound"
              accessibilityRole="switch"
              accessibilityHint="Enable or disable audio cues for workout timers"
            />
          </View>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
            Audio cues for interval timers and rest countdowns.
          </Text>
        </CardContent>
      </Card>

      {Platform.OS !== "web" && (
        <ErrorBoundary>
        <Card style={StyleSheet.flatten([styles.flowCard, { backgroundColor: colors.surface }])}>
          <CardContent>
            <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 16 }}>
              Integrations
            </Text>

            {stravaAthlete ? (
              <View>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text variant="body" style={{ color: colors.onSurface }}>
                      Strava
                    </Text>
                    <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                      Connected as {stravaAthlete}
                    </Text>
                  </View>
                  <Button
                    variant="outline"
                    onPress={async () => {
                      setStravaLoading(true);
                      try {
                        await disconnectStrava();
                        setStravaAthlete(null);
                        toast.success("Strava disconnected");
                      } catch {
                        toast.error("Failed to disconnect Strava");
                      } finally {
                        setStravaLoading(false);
                      }
                    }}
                    loading={stravaLoading}
                    disabled={stravaLoading}
                    accessibilityRole="button"
                    accessibilityLabel={`Disconnect Strava account (${stravaAthlete})`}
                  >
                    Disconnect
                  </Button>
                </View>
                <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>
                  Completed workouts are automatically uploaded to Strava.
                </Text>
              </View>
            ) : (
              <View>
                <Button
                  variant="default"
                  icon={Activity}
                  onPress={async () => {
                    setStravaLoading(true);
                    try {
                      const result = await connectStrava();
                      if (result) {
                        setStravaAthlete(result.athleteName);
                        toast.success("Connected to Strava!");
                      }
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : "Connection failed";
                      toast.error(msg);
                    } finally {
                      setStravaLoading(false);
                    }
                  }}
                  loading={stravaLoading}
                  disabled={stravaLoading}
                  accessibilityRole="button"
                  accessibilityLabel="Connect your Strava account"
                >
                  Connect Strava
                </Button>
                <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginTop: 8 }}>
                  Automatically upload completed workouts to your Strava account.
                </Text>
              </View>
            )}

            {/* Health Connect toggle (Android only) */}
            {Platform.OS === "android" && hcSdkStatus !== "unavailable" && (
              <View style={{ marginTop: 16 }}>
                <Separator style={{ marginBottom: 16 }} />
                {hcSdkStatus === "available" ? (
                  <View>
                    <View style={styles.row}>
                      <View style={{ flex: 1 }}>
                        <Text variant="body" style={{ color: colors.onSurface }}>
                          Health Connect
                        </Text>
                        <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                          {hcEnabled ? "Enabled" : "Disabled"}
                        </Text>
                      </View>
                      <Switch
                        value={hcEnabled}
                        disabled={hcLoading}
                        accessibilityRole="switch"
                        accessibilityLabel="Sync workouts to Health Connect"
                        onValueChange={async (value) => {
                          if (value) {
                            setHcLoading(true);
                            try {
                              const { requestHealthConnectPermission } =
                                await import("../../lib/health-connect");
                              const granted = await requestHealthConnectPermission();
                              if (granted) {
                                await setAppSetting("health_connect_enabled", "true");
                                setHcEnabled(true);
                                toast.success("Health Connect enabled");
                              } else {
                                setHcEnabled(false);
                                toast.error("Health Connect permission required");
                                AccessibilityInfo.announceForAccessibility(
                                  "Health Connect permission required"
                                );
                              }
                            } catch {
                              setHcEnabled(false);
                              toast.error("Failed to enable Health Connect");
                            } finally {
                              setHcLoading(false);
                            }
                          } else {
                            setHcLoading(true);
                            try {
                              const { disableHealthConnect } =
                                await import("../../lib/health-connect");
                              await disableHealthConnect();
                              setHcEnabled(false);
                              toast.success("Health Connect disabled");
                            } catch {
                              toast.error("Failed to disable Health Connect");
                            } finally {
                              setHcLoading(false);
                            }
                          }
                        }}
                      />
                    </View>
                    <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>
                      Completed workouts appear in Google Fit, Samsung Health, and other Health Connect apps.
                    </Text>
                  </View>
                ) : (
                  <View>
                    <View style={styles.row}>
                      <View style={{ flex: 1 }}>
                        <Text variant="body" style={{ color: colors.onSurface }}>
                          Health Connect
                        </Text>
                        <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                          {hcSdkStatus === "needs_update" ? "Update required" : "Not installed"}
                        </Text>
                      </View>
                      <Button
                        variant="outline"
                        icon={HeartPulse}
                        style={{ minHeight: 48 }}
                        onPress={() => {
                          import("../../lib/health-connect").then(({ openHealthConnectPlayStore }) =>
                            openHealthConnectPlayStore()
                          );
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={
                          hcSdkStatus === "needs_update"
                            ? "Update Health Connect"
                            : "Install Health Connect from Play Store"
                        }
                      >
                        {hcSdkStatus === "needs_update" ? "Update" : "Install"}
                      </Button>
                    </View>
                    <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>
                      Completed workouts appear in Google Fit, Samsung Health, and other Health Connect apps.
                    </Text>
                  </View>
                )}
              </View>
            )}
          </CardContent>
        </Card>
        </ErrorBoundary>
      )}

      <Card style={StyleSheet.flatten([styles.flowCard, styles.wideCard, { backgroundColor: colors.surface }])}>
        <CardContent>
          <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 16 }}>
            Data Management
          </Text>

          <View style={styles.buttonFlow}>
            <Button
              variant="default"
              icon={Download}
              onPress={handleExport}
              loading={loading}
              disabled={loading}
              accessibilityLabel="Export all data as JSON"
              accessibilityRole="button"
            >
              Export All Data
            </Button>

            <Button
              variant="outline"
              icon={Upload}
              onPress={handleImport}
              loading={loading}
              disabled={loading}
              accessibilityLabel="Import data"
              accessibilityRole="button"
            >
              Import FitForge Backup
            </Button>
          </View>

          {exportProgress && (
            <Text
              variant="caption"
              style={{ color: colors.primary, marginTop: 8 }}
              accessibilityLiveRegion="polite"
              accessibilityLabel={exportProgress}
            >
              {exportProgress}
            </Text>
          )}

          <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginTop: 8, marginBottom: 16 }}>
            Export your complete FitForge data as a JSON backup file, or restore from a previous backup. Duplicates are skipped.
          </Text>

          <Separator style={{ marginBottom: 16 }} />

          <Button
            variant="outline"
            icon={FileUp}
            onPress={() => router.push("/settings/import-strong")}
            accessibilityLabel="Import workout data from Strong CSV export"
            accessibilityRole="button"
          >
            Import from Strong
          </Button>

          <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginTop: 8 }}>
            Import workout history from the Strong app using a CSV export file.
          </Text>
        </CardContent>
      </Card>

      <Card style={StyleSheet.flatten([styles.flowCard, styles.wideCard, { backgroundColor: colors.surface }])}>
        <CardContent>
          <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 16 }}>
            CSV Export
          </Text>

          <SegmentedControl
            value={range}
            onValueChange={setRange}
            buttons={RANGE_BUTTONS}
            style={styles.segment}
          />

          <Text
            variant="caption"
            style={{ color: colors.onSurfaceVariant, marginBottom: 12, marginTop: 8 }}
            accessibilityLabel={`${counts.sessions} workout sessions, ${counts.entries} nutrition entries`}
          >
            {counts.sessions} session{counts.sessions !== 1 ? "s" : ""}, {counts.entries} entr{counts.entries !== 1 ? "ies" : "y"}
          </Text>

          <View style={styles.buttonFlow}>
            <Button
              variant="outline"
              icon={FileOutput}
              onPress={handleWorkoutCSV}
              loading={loading}
              disabled={loading}
              accessibilityLabel="Export workouts as CSV"
            >
              Workouts
            </Button>

            <Button
              variant="outline"
              icon={Apple}
              onPress={handleNutritionCSV}
              loading={loading}
              disabled={loading}
              accessibilityLabel="Export nutrition as CSV"
            >
              Nutrition
            </Button>

            <Button
              variant="outline"
              icon={Scale}
              onPress={handleBodyWeightCSV}
              loading={loading}
              disabled={loading}
              accessibilityLabel="Export body weight as CSV"
            >
              Body Weight
            </Button>

            <Button
              variant="outline"
              icon={User}
              onPress={handleBodyMeasurementsCSV}
              loading={loading}
              disabled={loading}
              accessibilityLabel="Export body measurements as CSV"
            >
              Measurements
            </Button>
          </View>
        </CardContent>
      </Card>

      <Card style={StyleSheet.flatten([styles.flowCard, { backgroundColor: colors.surface }])}>
        <CardContent>
          <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 16 }}>
            Feedback &amp; Reports
          </Text>

          <View style={styles.buttonFlow}>
            <Button
              variant="default"
              icon={Bug}
              onPress={() => router.push({ pathname: "/feedback", params: { type: "bug" } })}
              accessibilityLabel="Report a bug"
            >
              Report Bug
            </Button>

            <Button
              variant="outline"
              icon={Lightbulb}
              onPress={() => router.push({ pathname: "/feedback", params: { type: "feature" } })}
              accessibilityLabel="Request a feature"
            >
              Feature Request
            </Button>

            <Button
              variant="outline"
              icon={List}
              onPress={() => router.push("/errors")}
              accessibilityLabel={`View error log, ${count} ${count === 1 ? "error" : "errors"}`}
            >
              Errors ({count})
            </Button>

          </View>
        </CardContent>
      </Card>

      <Card style={StyleSheet.flatten([styles.flowCard, { backgroundColor: colors.surface }])}>
        <CardContent>
          <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 8 }}>
            About
          </Text>
          <Text variant="body" style={{ color: colors.onSurfaceVariant }}>
            FitForge v1.0.0{"\n"}Free & open-source workout tracker.
          </Text>
        </CardContent>
      </Card>
      </FlowContainer>

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
