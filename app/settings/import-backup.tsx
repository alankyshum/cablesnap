import { useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
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
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/bna-toast";

// eslint-disable-next-line max-lines-per-function, complexity
export default function ImportBackup() {
  const colors = useThemeColors();
  const router = useRouter();
  const layout = useLayout();
  const toast = useToast();
  const { backupJson } = useLocalSearchParams<{ backupJson: string }>();
  const [loading, setLoading] = useState(false);
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
              ["programs", "program_days", "program_log", "app_settings", "program_schedule", "achievements_earned"].includes(t),
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
        <Text variant="body" style={{ color: colors.onBackground }}>
          No backup data provided.
        </Text>
        <Button
          variant="default"
          onPress={() => router.back()}
          style={{ marginTop: 16 }}
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
        <Text variant="body" style={{ color: colors.error }}>
          Invalid backup data.
        </Text>
        <Button
          variant="default"
          onPress={() => router.back()}
          style={{ marginTop: 16 }}
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
      toast.success(`Import complete — ${importResult.inserted} records added, ${importResult.skipped} skipped`);
    } catch {
      toast.error("Import failed — all changes have been rolled back");
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
              <Text variant="heading" style={{ color: colors.onBackground, marginBottom: 16 }}>
                Import Preview
              </Text>

              {(exportedAt || appVersion) && (
                <Card style={styles.card}>
                  <CardContent>
                    <Text variant="body" style={{ color: colors.onSurface }}>
                      {exportedAt && `Exported: ${new Date(exportedAt).toLocaleDateString()}`}
                      {exportedAt && appVersion && " · "}
                      {appVersion && `App version: ${appVersion}`}
                    </Text>
                    <Text variant="body" style={{ color: colors.onSurface }}>
                      Format version: {version} · Total records: {totalRecords}
                    </Text>
                  </CardContent>
                </Card>
              )}

              <Card style={styles.card}>
                <CardContent>
                  <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 8 }}>
                    Records to Import
                  </Text>
                  <View style={{ flexDirection: "row", paddingVertical: 8 }}>
                    <Text variant="caption" style={{ flex: 1, color: colors.onSurfaceVariant }}>Data</Text>
                    <Text variant="caption" style={{ width: 60, textAlign: "right", color: colors.onSurfaceVariant }}>Count</Text>
                  </View>
                  <Separator />
                </CardContent>
              </Card>
            </>
          }
          renderItem={({ item: tableName }) => (
            <View style={{ paddingHorizontal: 0 }}>
              <View style={{ flexDirection: "row", paddingVertical: 10 }} accessibilityLabel={`${BACKUP_TABLE_LABELS[tableName]}: ${counts[tableName]} records`}>
                <Text variant="body" style={{ flex: 1, color: colors.onSurface }}>{BACKUP_TABLE_LABELS[tableName]}</Text>
                <Text variant="body" style={{ width: 60, textAlign: "right", color: colors.onSurface }}>{counts[tableName]}</Text>
              </View>
              <Separator />
            </View>
          )}
          ListFooterComponent={
            <>
              {missingTables.length > 0 && (
                <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginBottom: 8 }}>
                  {missingTables.length} table{missingTables.length !== 1 ? "s" : ""} not present in this v{version} backup (this is normal for older backups).
                </Text>
              )}

              <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginBottom: 16 }}>
                Existing records with the same ID will be skipped — your current data will not be overwritten.
              </Text>

              {importProgress && (
                <Text
                  variant="caption"
                  style={{ color: colors.primary, marginBottom: 8 }}
                  accessibilityLiveRegion="polite"
                  accessibilityLabel={importProgress}
                >
                  {importProgress}
                </Text>
              )}

              <View style={styles.actions}>
                <Button
                  variant="outline"
                  onPress={() => router.back()}
                  disabled={loading}
                  style={styles.actionBtn}
                  accessibilityLabel="Cancel import"
                  accessibilityRole="button"
                >
                  Cancel
                </Button>
                <Button
                  variant="default"
                  onPress={handleImport}
                  loading={loading}
                  disabled={loading}
                  style={styles.actionBtn}
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
              <Text variant="heading" style={{ color: colors.onBackground, marginBottom: 16 }}>
                Import Complete
              </Text>

              <Card style={styles.card}>
                <CardContent>
                  <Text variant="subtitle" style={{ color: colors.primary, marginBottom: 8 }}>
                    {result.inserted} records imported
                  </Text>
                  {result.skipped > 0 && (
                    <Text variant="body" style={{ color: colors.onSurfaceVariant, marginBottom: 12 }}>
                      {result.skipped} records skipped (already existed)
                    </Text>
                  )}

                  <View style={{ flexDirection: "row", paddingVertical: 8 }}>
                    <Text variant="caption" style={{ flex: 1, color: colors.onSurfaceVariant }}>Data</Text>
                    <Text variant="caption" style={{ width: 70, textAlign: "right", color: colors.onSurfaceVariant }}>Imported</Text>
                    <Text variant="caption" style={{ width: 70, textAlign: "right", color: colors.onSurfaceVariant }}>Skipped</Text>
                  </View>
                  <Separator />
                </CardContent>
              </Card>
            </>
          }
          renderItem={({ item: tableName }) => (
            <View style={{ paddingHorizontal: 0 }}>
              <View
                style={{ flexDirection: "row", paddingVertical: 10 }}
                accessibilityLabel={`${BACKUP_TABLE_LABELS[tableName]}: ${result.perTable[tableName]?.inserted ?? 0} imported, ${result.perTable[tableName]?.skipped ?? 0} skipped`}
              >
                <Text variant="body" style={{ flex: 1, color: colors.onSurface }}>{BACKUP_TABLE_LABELS[tableName]}</Text>
                <Text variant="body" style={{ width: 70, textAlign: "right", color: colors.onSurface }}>{result.perTable[tableName]?.inserted ?? 0}</Text>
                <Text variant="body" style={{ width: 70, textAlign: "right", color: colors.onSurface }}>{result.perTable[tableName]?.skipped ?? 0}</Text>
              </View>
              <Separator />
            </View>
          )}
          ListFooterComponent={
            <Button
              variant="default"
              onPress={() => router.back()}
              style={{ marginTop: 16 }}
              accessibilityLabel="Done, return to settings"
              accessibilityRole="button"
            >
              Done
            </Button>
          }
        />
      )}
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
