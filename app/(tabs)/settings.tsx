import { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { Button, Card, SegmentedButtons, Snackbar, Text, useTheme } from "react-native-paper";
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
} from "../../lib/db";
import type { WorkoutCSVRow, NutritionCSVRow, BodyWeightCSVRow, BodyMeasurementsCSVRow } from "../../lib/db";
import { getErrorCount, clearErrorLog, generateReport } from "../../lib/errors";
import { csvEscape } from "../../lib/csv";

function workoutCSV(rows: WorkoutCSVRow[]): string {
  const header = "date,exercise,set_number,weight,reps,duration_seconds,notes,set_rpe,set_notes,link_id";
  const lines = rows.map((r) =>
    [
      csvEscape(r.date),
      csvEscape(r.exercise),
      csvEscape(r.set_number),
      csvEscape(r.weight),
      csvEscape(r.reps),
      csvEscape(r.duration_seconds),
      csvEscape(r.notes),
      csvEscape(r.set_rpe),
      csvEscape(r.set_notes),
      csvEscape(r.link_id),
    ].join(",")
  );
  return [header, ...lines].join("\n");
}

function nutritionCSV(rows: NutritionCSVRow[]): string {
  const header = "date,meal,food,servings,calories,protein,carbs,fat";
  const lines = rows.map((r) =>
    [
      csvEscape(r.date),
      csvEscape(r.meal),
      csvEscape(r.food),
      csvEscape(r.servings),
      csvEscape(r.calories),
      csvEscape(r.protein),
      csvEscape(r.carbs),
      csvEscape(r.fat),
    ].join(",")
  );
  return [header, ...lines].join("\n");
}

function bodyWeightCSV(rows: BodyWeightCSVRow[]): string {
  const header = "date,weight_kg,notes";
  const lines = rows.map((r) =>
    [csvEscape(r.date), csvEscape(r.weight), csvEscape(r.notes)].join(",")
  );
  return [header, ...lines].join("\n");
}

function bodyMeasurementsCSV(rows: BodyMeasurementsCSVRow[]): string {
  const header = "date,waist_cm,chest_cm,hips_cm,left_arm_cm,right_arm_cm,left_thigh_cm,right_thigh_cm,left_calf_cm,right_calf_cm,neck_cm,body_fat_pct,notes";
  const lines = rows.map((r) =>
    [
      csvEscape(r.date),
      csvEscape(r.waist),
      csvEscape(r.chest),
      csvEscape(r.hips),
      csvEscape(r.left_arm),
      csvEscape(r.right_arm),
      csvEscape(r.left_thigh),
      csvEscape(r.right_thigh),
      csvEscape(r.left_calf),
      csvEscape(r.right_calf),
      csvEscape(r.neck),
      csvEscape(r.body_fat),
      csvEscape(r.notes),
    ].join(",")
  );
  return [header, ...lines].join("\n");
}

const RANGES = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "all", label: "All Time" },
] as const;

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
  const [loading, setLoading] = useState(false);
  const [snack, setSnack] = useState("");
  const [count, setCount] = useState(0);
  const [range, setRange] = useState("30");
  const [counts, setCounts] = useState({ sessions: 0, entries: 0 });

  useFocusEffect(
    useCallback(() => {
      getErrorCount().then(setCount);
    }, [])
  );

  useEffect(() => {
    getCSVCounts(sinceForRange(range)).then(setCounts);
  }, [range]);

  const handleWorkoutCSV = async () => {
    setLoading(true);
    try {
      const rows = await getWorkoutCSVData(sinceForRange(range));
      const csv = workoutCSV(rows);
      if (rows.length === 0) setSnack("No data to export");
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
      const csv = nutritionCSV(rows);
      if (rows.length === 0) setSnack("No data to export");
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
      const csv = bodyWeightCSV(rows);
      if (rows.length === 0) setSnack("No data to export");
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
      const csv = bodyMeasurementsCSV(rows);
      if (rows.length === 0) setSnack("No data to export");
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

      if (data.version !== 1) {
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
    <FlatList
      data={[]}
      renderItem={null}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <>
          <Text variant="headlineMedium" style={{ color: theme.colors.onBackground, marginBottom: 24 }}>
            Settings
          </Text>

      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 16 }}>
            Data Export (CSV)
          </Text>

          <SegmentedButtons
            value={range}
            onValueChange={setRange}
            buttons={RANGES.map((r) => ({
              value: r.value,
              label: r.label,
              accessibilityLabel: `Date range ${r.label}`,
            }))}
            style={styles.segment}
          />

          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16, marginTop: 8 }}
            accessibilityLabel={`${counts.sessions} workout sessions, ${counts.entries} nutrition entries`}
          >
            {counts.sessions} workout session{counts.sessions !== 1 ? "s" : ""},{" "}
            {counts.entries} nutrition entr{counts.entries !== 1 ? "ies" : "y"}
          </Text>

          <Button
            mode="contained"
            icon="file-export-outline"
            onPress={handleWorkoutCSV}
            loading={loading}
            disabled={loading}
            style={styles.btn}
            accessibilityLabel="Export workouts as CSV"
          >
            Export Workouts CSV
          </Button>

          <Button
            mode="contained"
            icon="food-apple-outline"
            onPress={handleNutritionCSV}
            loading={loading}
            disabled={loading}
            style={styles.btn}
            accessibilityLabel="Export nutrition as CSV"
          >
            Export Nutrition CSV
          </Button>

          <Button
            mode="contained"
            icon="scale-bathroom"
            onPress={handleBodyWeightCSV}
            loading={loading}
            disabled={loading}
            style={styles.btn}
            accessibilityLabel="Export body weight as CSV"
          >
            Export Body Weight CSV
          </Button>

          <Button
            mode="contained"
            icon="human"
            onPress={handleBodyMeasurementsCSV}
            loading={loading}
            disabled={loading}
            style={styles.btn}
            accessibilityLabel="Export body measurements as CSV"
          >
            Export Measurements CSV
          </Button>
        </Card.Content>
      </Card>

      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 16 }}>
            Data Management
          </Text>

          <Button
            mode="contained"
            icon="export"
            onPress={handleExport}
            loading={loading}
            disabled={loading}
            style={styles.btn}
            accessibilityLabel="Export all data"
          >
            Export All Data
          </Button>

          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
            Export all exercises, templates, sessions, and sets as a JSON file.
          </Text>

          <Button
            mode="outlined"
            icon="import"
            onPress={handleImport}
            loading={loading}
            disabled={loading}
            style={styles.btn}
            accessibilityLabel="Import data"
          >
            Import Data
          </Button>

          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Import a previously exported FitForge JSON file. Duplicate records are skipped.
          </Text>
        </Card.Content>
      </Card>

      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 16 }}>
            Crash Reporting ({count} {count === 1 ? "error" : "errors"})
          </Text>

          <Button
            mode="contained"
            icon="bug-outline"
            onPress={() => router.push("/errors")}
            style={styles.btn}
            accessibilityLabel={`View error log, ${count} ${count === 1 ? "error" : "errors"}`}
          >
            View Error Log
          </Button>

          <Button
            mode="outlined"
            icon="share-variant"
            onPress={async () => {
              setLoading(true);
              try {
                const report = await generateReport();
                const file = new File(Paths.cache, "fitforge-crash-report.json");
                await file.write(report);
                await Sharing.shareAsync(file.uri, {
                  mimeType: "application/json",
                  dialogTitle: "Share Crash Report",
                });
                setSnack("Crash report shared");
              } catch {
                setSnack("Unable to share");
              } finally {
                setLoading(false);
              }
            }}
            loading={loading}
            disabled={loading}
            style={styles.btn}
            accessibilityLabel="Share crash report"
          >
            Share Crash Report
          </Button>

          <Button
            mode="outlined"
            icon="delete-outline"
            onPress={async () => {
              await clearErrorLog();
              setCount(0);
              setSnack("Error log cleared");
            }}
            style={styles.btn}
            textColor={theme.colors.error}
            accessibilityLabel="Clear error log"
          >
            Clear Error Log
          </Button>
        </Card.Content>
      </Card>

      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 8 }}>
            About
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            FitForge v1.0.0{"\n"}Free & open-source workout tracker.
          </Text>
        </Card.Content>
      </Card>

      <Snackbar
        visible={!!snack}
        onDismiss={() => setSnack("")}
        duration={3000}
        action={{ label: "OK", onPress: () => setSnack("") }}
      >
        {snack}
      </Snackbar>
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    marginBottom: 16,
  },
  btn: {
    marginBottom: 8,
  },
  segment: {
    marginBottom: 4,
  },
});
