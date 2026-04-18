import { useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { Button, Card, DataTable, Snackbar, Text } from "react-native-paper";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useLayout } from "../../lib/layout";
import {
  importData,
  getBackupCounts,
  BACKUP_TABLE_LABELS,
  IMPORT_TABLE_ORDER,
} from "../../lib/db";
import type { BackupTableName, ImportProgress } from "../../lib/db";
import { useThemeColors } from "@/hooks/useThemeColors";

export default function ImportBackup() {
  const colors = useThemeColors();
  const router = useRouter();
  const layout = useLayout();
  const { backupJson } = useLocalSearchParams<{ backupJson: string }>();
  const [loading, setLoading] = useState(false);
  const [snack, setSnack] = useState("");
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [result, setResult] = useState<{
    inserted: number;
    skipped: number;
    perTable: Record<string, { inserted: number; skipped: number }>;
  } | null>(null);

  const parsed = useMemo(() => {
    if (!backupJson) return null;
    try {
      return JSON.parse(backupJson) as Record<string, unknown>;
    } catch {
      return null;
    }
  }, [backupJson]);

  const version = parsed ? Number(parsed.version ?? 0) : 0;
  const exportedAt = parsed ? ((parsed.exported_at as string) ?? null) : null;
  const appVersion = parsed ? ((parsed.app_version as string) ?? null) : null;
  const counts = useMemo(
    () => (parsed ? getBackupCounts(parsed) : ({} as Record<BackupTableName, number>)),
    [parsed],
  );
  const totalRecords = useMemo(
    () => (parsed ? IMPORT_TABLE_ORDER.reduce((sum, t) => sum + (counts[t] ?? 0), 0) : 0),
    [parsed, counts],
  );

  const missingTables = useMemo(
    () =>
      parsed && version <= 2
        ? IMPORT_TABLE_ORDER.filter(
            (t) =>
              (counts[t] ?? 0) === 0 &&
              ["programs", "program_days", "program_log", "app_settings", "weekly_schedule", "program_schedule", "achievements_earned"].includes(t),
          )
        : [],
    [parsed, version, counts],
  );

  const tablesToShow = useMemo(
    () => (parsed ? IMPORT_TABLE_ORDER.filter((t) => (counts[t] ?? 0) > 0) : []),
    [parsed, counts],
  );

  const resultTablesToShow = useMemo(
    () =>
      result
        ? IMPORT_TABLE_ORDER.filter(
            (t) => (result.perTable[t]?.inserted ?? 0) > 0 || (result.perTable[t]?.skipped ?? 0) > 0,
          )
        : [],
    [result],
  );

  if (!backupJson) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, padding: 24 }]}>
        <Text variant="bodyLarge" style={{ color: colors.onBackground }}>
          No backup data provided.
        </Text>
        <Button
          mode="contained"
          onPress={() => router.back()}
          style={{ marginTop: 16 }}
          contentStyle={{ paddingVertical: 8 }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          Go Back
        </Button>
      </View>
    );
  }

  if (!parsed) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, padding: 24 }]}>
        <Text variant="bodyLarge" style={{ color: colors.error }}>
          Invalid backup data.
        </Text>
        <Button
          mode="contained"
          onPress={() => router.back()}
          style={{ marginTop: 16 }}
          contentStyle={{ paddingVertical: 8 }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          Go Back
        </Button>
      </View>
    );
  }

  const handleImport = async () => {
    setLoading(true);
    setImportProgress("Starting import...");
    try {
      const importResult = await importData(parsed, (progress: ImportProgress) => {
        if (progress.table === "done") {
          setImportProgress(null);
        } else {
          const label = BACKUP_TABLE_LABELS[progress.table as BackupTableName] ?? progress.table;
          setImportProgress(`Importing ${label}... (${progress.tableIndex + 1}/${progress.totalTables})`);
        }
      });
      setResult(importResult);
      setSnack(`Import complete — ${importResult.inserted} records added, ${importResult.skipped} skipped`);
    } catch {
      setSnack("Import failed — all changes have been rolled back");
    } finally {
      setLoading(false);
      setImportProgress(null);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {!result ? (
        <FlatList
          data={tablesToShow}
          keyExtractor={(item) => item}
          contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding }]}
          ListHeaderComponent={
            <>
              <Text variant="headlineSmall" style={{ color: colors.onBackground, marginBottom: 16 }}>
                Import Preview
              </Text>

              {(exportedAt || appVersion) && (
                <Card style={[styles.card, { backgroundColor: colors.surface }]}>
                  <Card.Content>
                    <Text variant="bodyMedium" style={{ color: colors.onSurface }}>
                      {exportedAt && `Exported: ${new Date(exportedAt).toLocaleDateString()}`}
                      {exportedAt && appVersion && " · "}
                      {appVersion && `App version: ${appVersion}`}
                    </Text>
                    <Text variant="bodyMedium" style={{ color: colors.onSurface }}>
                      Format version: {version} · Total records: {totalRecords}
                    </Text>
                  </Card.Content>
                </Card>
              )}

              <Card style={[styles.card, { backgroundColor: colors.surface }]}>
                <Card.Content>
                  <Text variant="titleSmall" style={{ color: colors.onSurface, marginBottom: 8 }}>
                    Records to Import
                  </Text>
                  <DataTable>
                    <DataTable.Header accessibilityRole="none">
                      <DataTable.Title accessibilityLabel="Data type">Data</DataTable.Title>
                      <DataTable.Title numeric accessibilityLabel="Number of records">Count</DataTable.Title>
                    </DataTable.Header>
                  </DataTable>
                </Card.Content>
              </Card>
            </>
          }
          renderItem={({ item: tableName }) => (
            <View style={{ paddingHorizontal: 0 }}>
              <DataTable>
                <DataTable.Row accessibilityLabel={`${BACKUP_TABLE_LABELS[tableName]}: ${counts[tableName]} records`}>
                  <DataTable.Cell>{BACKUP_TABLE_LABELS[tableName]}</DataTable.Cell>
                  <DataTable.Cell numeric>{counts[tableName]}</DataTable.Cell>
                </DataTable.Row>
              </DataTable>
            </View>
          )}
          ListFooterComponent={
            <>
              {missingTables.length > 0 && (
                <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant, marginBottom: 8 }}>
                  {missingTables.length} table{missingTables.length !== 1 ? "s" : ""} not present in this v{version} backup (this is normal for older backups).
                </Text>
              )}

              <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant, marginBottom: 16 }}>
                Existing records with the same ID will be skipped — your current data will not be overwritten.
              </Text>

              {importProgress && (
                <Text
                  variant="bodySmall"
                  style={{ color: colors.primary, marginBottom: 8 }}
                  accessibilityLiveRegion="polite"
                  accessibilityLabel={importProgress}
                >
                  {importProgress}
                </Text>
              )}

              <View style={styles.actions}>
                <Button
                  mode="outlined"
                  onPress={() => router.back()}
                  disabled={loading}
                  style={styles.actionBtn}
                  contentStyle={{ paddingVertical: 8 }}
                  accessibilityLabel="Cancel import"
                  accessibilityRole="button"
                >
                  Cancel
                </Button>
                <Button
                  mode="contained"
                  onPress={handleImport}
                  loading={loading}
                  disabled={loading}
                  style={styles.actionBtn}
                  contentStyle={{ paddingVertical: 8 }}
                  accessibilityLabel={`Import ${totalRecords} records`}
                  accessibilityRole="button"
                >
                  Import
                </Button>
              </View>
            </>
          }
        />
      ) : (
        <FlatList
          data={resultTablesToShow}
          keyExtractor={(item) => item}
          contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding }]}
          ListHeaderComponent={
            <>
              <Text variant="headlineSmall" style={{ color: colors.onBackground, marginBottom: 16 }}>
                Import Complete
              </Text>

              <Card style={[styles.card, { backgroundColor: colors.surface }]}>
                <Card.Content>
                  <Text variant="titleMedium" style={{ color: colors.primary, marginBottom: 8 }}>
                    {result.inserted} records imported
                  </Text>
                  {result.skipped > 0 && (
                    <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant, marginBottom: 12 }}>
                      {result.skipped} records skipped (already existed)
                    </Text>
                  )}

                  <DataTable>
                    <DataTable.Header accessibilityRole="none">
                      <DataTable.Title accessibilityLabel="Data type">Data</DataTable.Title>
                      <DataTable.Title numeric accessibilityLabel="Records imported">Imported</DataTable.Title>
                      <DataTable.Title numeric accessibilityLabel="Records skipped">Skipped</DataTable.Title>
                    </DataTable.Header>
                  </DataTable>
                </Card.Content>
              </Card>
            </>
          }
          renderItem={({ item: tableName }) => (
            <View style={{ paddingHorizontal: 0 }}>
              <DataTable>
                <DataTable.Row
                  accessibilityLabel={`${BACKUP_TABLE_LABELS[tableName]}: ${result.perTable[tableName]?.inserted ?? 0} imported, ${result.perTable[tableName]?.skipped ?? 0} skipped`}
                >
                  <DataTable.Cell>{BACKUP_TABLE_LABELS[tableName]}</DataTable.Cell>
                  <DataTable.Cell numeric>{result.perTable[tableName]?.inserted ?? 0}</DataTable.Cell>
                  <DataTable.Cell numeric>{result.perTable[tableName]?.skipped ?? 0}</DataTable.Cell>
                </DataTable.Row>
              </DataTable>
            </View>
          )}
          ListFooterComponent={
            <Button
              mode="contained"
              onPress={() => router.back()}
              style={{ marginTop: 16 }}
              contentStyle={{ paddingVertical: 8 }}
              accessibilityLabel="Done, return to settings"
              accessibilityRole="button"
            >
              Done
            </Button>
          }
        />
      )}

      <Snackbar
        visible={!!snack}
        onDismiss={() => setSnack("")}
        duration={4000}
        action={{ label: "OK", onPress: () => setSnack("") }}
      >
        {snack}
      </Snackbar>
    </View>
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
  card: {
    marginBottom: 16,
    borderRadius: 12,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
  },
  actionBtn: {
    minWidth: 120,
  },
});
