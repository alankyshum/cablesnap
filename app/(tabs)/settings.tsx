import { useCallback, useState } from "react";
import { AccessibilityInfo, Alert, Linking, Platform, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/bna-toast";
import { Download, Upload, FileUp, Bug, Lightbulb, List } from "lucide-react-native";
import { useLayout } from "../../lib/layout";
import { useFloatingTabBarHeight } from "../../components/FloatingTabBar";
import FlowContainer, { flowCardStyle } from "../../components/ui/FlowContainer";
import BodyProfileCard from "../../components/BodyProfileCard";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import Constants from "expo-constants";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import {
  exportAllData,
  estimateExportSize,
  validateBackupFileSize,
  validateBackupData,
  BACKUP_TABLE_LABELS,
  getAppSetting,
  getSchedule,
  getBodySettings,
  updateBodySettings,
  getStravaConnection,
} from "../../lib/db";
import type { BackupTableName, ExportProgress } from "../../lib/db";
import { getErrorCount } from "../../lib/errors";
import { setEnabled as setAudioEnabled } from "../../lib/audio";
import { getPermissionStatus } from "../../lib/notifications";
import PreferencesCard from "../../components/settings/PreferencesCard";
import IntegrationsCard from "../../components/settings/IntegrationsCard";
import CSVExportCard from "../../components/settings/CSVExportCard";
import AppearanceCard from "../../components/settings/AppearanceCard";
import ReminderSection from "../../components/settings/ReminderSection";
import { useThemeColors } from "@/hooks/useThemeColors";

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
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [restNotifications, setRestNotifications] = useState(true);
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
      }).catch(() => { setSoundEnabled(true); setAudioEnabled(true); toast.error("Could not load sound setting"); });
      getAppSetting("rest_notification_enabled").then((val) => {
        setRestNotifications(val !== "false");
      }).catch(() => { setRestNotifications(true); });
      Promise.all([getAppSetting("reminders_enabled"), getAppSetting("reminder_time"), getPermissionStatus(), getSchedule()])
        .then(([enabled, time, perm, sched]) => {
          setReminders(enabled === "true" && perm === "granted");
          if (time) setReminderTime(time);
          setPermDenied(perm === "denied");
          setScheduleCount(sched.length);
        }).catch(() => {});
      if (Platform.OS !== "web") {
        getStravaConnection().then((conn) => setStravaAthlete(conn?.athlete_name ?? null)).catch(() => {});
      }
      if (Platform.OS === "android") {
        (async () => {
          try {
            const { getHealthConnectSdkStatus, checkHealthConnectPermissionStatus } = await import("../../lib/health-connect");
            const status = await getHealthConnectSdkStatus();
            setHcSdkStatus(status);
            if (status === "available") {
              const setting = await getAppSetting("health_connect_enabled");
              if (setting === "true") {
                const hasPermission = await checkHealthConnectPermissionStatus();
                if (!hasPermission) {
                  await import("../../lib/db").then(({ setAppSetting: set }) => set("health_connect_enabled", "false"));
                  setHcEnabled(false);
                  toast.error("Health Connect permission was revoked");
                  AccessibilityInfo.announceForAccessibility("Health Connect permission was revoked");
                } else { setHcEnabled(true); }
              } else { setHcEnabled(false); }
            }
          } catch { setHcSdkStatus("unavailable"); }
        })();
      }
    }, [toast])
  );

  const handleExport = async () => {
    try {
      const { label } = await estimateExportSize();
      Alert.alert("Export All Data", `Your backup will be approximately ${label}. This may take a moment. Continue?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Export", onPress: async () => {
          setLoading(true);
          setExportProgress("Preparing export...");
          try {
            const data = await exportAllData((progress: ExportProgress) => {
              if (progress.table === "done") { setExportProgress(null); }
              else { setExportProgress(`Exporting ${BACKUP_TABLE_LABELS[progress.table as BackupTableName] ?? progress.table}... (${progress.tableIndex + 1}/${progress.totalTables})`); }
            });
            const totalRecords = Object.values(data.counts).reduce((a, b) => a + b, 0);
            if (totalRecords === 0) { toast.info("No data to export"); setLoading(false); setExportProgress(null); return; }
            const json = JSON.stringify(data, null, 2);
            const file = new File(Paths.cache, `fitforge-backup-${dateStamp()}.json`);
            await file.write(json);
            await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: "Export FitForge Data" });
            toast.success("Data exported successfully");
          } catch { toast.error("Export failed"); }
          finally { setLoading(false); setExportProgress(null); }
        }},
      ]);
    } catch { toast.error("Could not estimate export size"); }
  };

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "application/json", copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (asset.size && asset.size > 50 * 1024 * 1024) { Alert.alert("File Too Large", "This backup file is too large to process safely."); return; }
      setLoading(true);
      const file = new File(asset.uri);
      const raw = await file.text();
      const sizeError = validateBackupFileSize(raw.length);
      if (sizeError) { Alert.alert("File Too Large", sizeError.message); setLoading(false); return; }
      let data: Record<string, unknown>;
      try { data = JSON.parse(raw); } catch { Alert.alert("Invalid File", "This file doesn't appear to be a valid FitForge backup."); setLoading(false); return; }
      const validationError = validateBackupData(data);
      if (validationError) { Alert.alert("Invalid Backup", validationError.message); setLoading(false); return; }
      setLoading(false);
      router.push({ pathname: "/settings/import-backup", params: { backupJson: raw } });
    } catch { toast.error("Import failed"); setLoading(false); }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding, paddingBottom: tabBarHeight + 16 }]}
    >
      <Text variant="heading" style={{ color: colors.onBackground, marginBottom: 24 }}>Settings</Text>
      <FlowContainer gap={16}>
        <UnitsCard colors={colors} toast={toast} weightUnit={weightUnit} setWeightUnit={setWeightUnit} measureUnit={measureUnit} setMeasureUnit={setMeasureUnit} weightGoal={weightGoal} fatGoal={fatGoal} />
        <AppearanceCard colors={colors} />
        <BodyProfileCard />
        <PreferencesCard colors={colors} toast={toast} soundEnabled={soundEnabled} setSoundEnabled={setSoundEnabled}>
          <ReminderSection colors={colors} toast={toast} reminders={reminders} setReminders={setReminders} reminderTime={reminderTime} setReminderTime={setReminderTime} permDenied={permDenied} setPermDenied={setPermDenied} scheduleCount={scheduleCount} restNotifications={restNotifications} setRestNotifications={setRestNotifications} />
        </PreferencesCard>
        <IntegrationsCard colors={colors} toast={toast} stravaAthlete={stravaAthlete} setStravaAthlete={setStravaAthlete} stravaLoading={stravaLoading} setStravaLoading={setStravaLoading} hcEnabled={hcEnabled} setHcEnabled={setHcEnabled} hcLoading={hcLoading} setHcLoading={setHcLoading} hcSdkStatus={hcSdkStatus} />
        <DataManagementCard colors={colors} loading={loading} exportProgress={exportProgress} onExport={handleExport} onImport={handleImport} onImportStrong={() => router.push("/settings/import-strong")} />
        <CSVExportCard colors={colors} />
        <FeedbackCard colors={colors} count={count} onBug={() => router.push({ pathname: "/feedback", params: { type: "bug" } })} onFeature={() => router.push({ pathname: "/feedback", params: { type: "feature" } })} onErrors={() => router.push("/errors")} />
        <Card style={StyleSheet.flatten([styles.flowCard, { backgroundColor: colors.surface }])}>
          <CardContent>
            <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 8 }}>About</Text>
            <Text variant="body" style={{ color: colors.onSurfaceVariant }}>FitForge v{Constants.expoConfig?.version ?? "0.0.0"}{"\n"}Free & open-source workout tracker.</Text>
            <Text variant="body" style={{ color: colors.primary, marginTop: 4 }} onPress={() => Linking.openURL("https://github.com/alankyshum/fitforge/blob/main/LICENSE")}>MIT License</Text>
          </CardContent>
        </Card>
      </FlowContainer>
    </ScrollView>
  );
}

/* ── Small inline sub-components ── */

function UnitsCard({ colors, toast, weightUnit, setWeightUnit, measureUnit, setMeasureUnit, weightGoal, fatGoal }: {
  colors: ReturnType<typeof useThemeColors>; toast: ReturnType<typeof useToast>;
  weightUnit: "kg" | "lb"; setWeightUnit: (v: "kg" | "lb") => void;
  measureUnit: "cm" | "in"; setMeasureUnit: (v: "cm" | "in") => void;
  weightGoal: number | null; fatGoal: number | null;
}) {
  return (
    <Card style={StyleSheet.flatten([styles.flowCard, { backgroundColor: colors.surface }])}>
      <CardContent>
        <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 16 }}>Units</Text>
        <View style={styles.row}>
          <Text variant="body" style={{ color: colors.onSurface, flex: 1 }}>Weight</Text>
          <View style={styles.unitToggle}>
            <SegmentedControl value={weightUnit} onValueChange={async (val) => { const u = val as "kg" | "lb"; setWeightUnit(u); try { await updateBodySettings(u, measureUnit, weightGoal, fatGoal); } catch { toast.error("Could not save unit"); } }} buttons={[{ value: "kg", label: "kg" }, { value: "lb", label: "lb" }]} />
          </View>
        </View>
        <View style={[styles.row, { marginTop: 12 }]}>
          <Text variant="body" style={{ color: colors.onSurface, flex: 1 }}>Measurements</Text>
          <View style={styles.unitToggle}>
            <SegmentedControl value={measureUnit} onValueChange={async (val) => { const m = val as "cm" | "in"; setMeasureUnit(m); try { await updateBodySettings(weightUnit, m, weightGoal, fatGoal); } catch { toast.error("Could not save unit"); } }} buttons={[{ value: "cm", label: "cm" }, { value: "in", label: "in" }]} />
          </View>
        </View>
      </CardContent>
    </Card>
  );
}

function DataManagementCard({ colors, loading, exportProgress, onExport, onImport, onImportStrong }: {
  colors: ReturnType<typeof useThemeColors>; loading: boolean; exportProgress: string | null;
  onExport: () => void; onImport: () => void; onImportStrong: () => void;
}) {
  return (
    <Card style={StyleSheet.flatten([styles.flowCard, styles.wideCard, { backgroundColor: colors.surface }])}>
      <CardContent>
        <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 16 }}>Data Management</Text>
        <View style={styles.buttonFlow}>
          <Button variant="default" icon={Download} onPress={onExport} loading={loading} disabled={loading} accessibilityLabel="Export all data as JSON" accessibilityRole="button">Export All Data</Button>
          <Button variant="outline" icon={Upload} onPress={onImport} loading={loading} disabled={loading} accessibilityLabel="Import data" accessibilityRole="button">Import FitForge Backup</Button>
        </View>
        {exportProgress && <Text variant="caption" style={{ color: colors.primary, marginTop: 8 }} accessibilityLiveRegion="polite" accessibilityLabel={exportProgress}>{exportProgress}</Text>}
        <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginTop: 8, marginBottom: 16 }}>Export your complete FitForge data as a JSON backup file, or restore from a previous backup. Duplicates are skipped.</Text>
        <Separator style={{ marginBottom: 16 }} />
        <Button variant="outline" icon={FileUp} onPress={onImportStrong} accessibilityLabel="Import workout data from Strong CSV export" accessibilityRole="button">Import from Strong</Button>
        <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginTop: 8 }}>Import workout history from the Strong app using a CSV export file.</Text>
      </CardContent>
    </Card>
  );
}

function FeedbackCard({ colors, count, onBug, onFeature, onErrors }: {
  colors: ReturnType<typeof useThemeColors>; count: number; onBug: () => void; onFeature: () => void; onErrors: () => void;
}) {
  return (
    <Card style={StyleSheet.flatten([styles.flowCard, { backgroundColor: colors.surface }])}>
      <CardContent>
        <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 16 }}>Feedback &amp; Reports</Text>
        <View style={styles.buttonFlow}>
          <Button variant="default" icon={Bug} onPress={onBug} accessibilityLabel="Report a bug">Report Bug</Button>
          <Button variant="outline" icon={Lightbulb} onPress={onFeature} accessibilityLabel="Request a feature">Feature Request</Button>
          <Button variant="outline" icon={List} onPress={onErrors} accessibilityLabel={`View error log, ${count} ${count === 1 ? "error" : "errors"}`}>{`Errors (${count})`}</Button>
        </View>
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 16, paddingBottom: 48 },
  flowCard: { ...flowCardStyle, maxWidth: undefined },
  wideCard: { minWidth: 340, flexBasis: 340 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  unitToggle: { width: 140, flexShrink: 0 },
  buttonFlow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
