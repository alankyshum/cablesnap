import { useMemo, useState, useEffect } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useLayout } from "../../lib/layout";
import {
  importData,
  getImportCompletionMessage,
  getBackupCategoryCounts,
  BACKUP_CATEGORY_LABELS,
  BACKUP_CATEGORY_ORDER,
  BACKUP_TABLE_LABELS,
  IMPORT_TABLE_ORDER,
  BACKUP_CATEGORY_TABLES,
} from "../../lib/db";
import type { BackupCategoryName, BackupTableName, ImportProgress } from "../../lib/db";
import { useThemeColors } from "@/hooks/useThemeColors";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/bna-toast";
import { clearImportSession, getImportSession } from "@/lib/import-session";
import { i18n } from "@lingui/core";
import { t } from "@lingui/core/macro";

type ImportResult = {
  inserted: number;
  skipped: number;
  perTable: Record<string, { inserted: number; skipped: number; skipped_existing?: number }>;
};

function PreviewList({
  categoriesToShow, categoryCounts, version, totalRecords, exportedAt, appVersion,
  importProgress, loading, onImport, onCancel,
}: {
  categoriesToShow: BackupCategoryName[];
  categoryCounts: Partial<Record<BackupCategoryName, number>>;
  version: number;
  totalRecords: number;
  exportedAt: string | null;
  appVersion: string | null;
  importProgress: string | null;
  loading: boolean;
  onImport: () => void;
  onCancel: () => void;
}) {
  const colors = useThemeColors();
  const layout = useLayout();
  return (
    <FlatList
      data={categoriesToShow}
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
                Categories to Import
              </Text>
              <View style={{ flexDirection: "row", paddingVertical: 8 }}>
                <Text variant="caption" style={{ flex: 1, color: colors.onSurfaceVariant }}>{t({ id: "settings.importBackup.category", message: "Category" })}</Text>
                <Text variant="caption" style={{ width: 60, textAlign: "right", color: colors.onSurfaceVariant }}>{t({ id: "settings.importBackup.count", message: "Count" })}</Text>
              </View>
              <Separator />
            </CardContent>
          </Card>
        </>
      }
      renderItem={({ item: category }) => {
        const count = categoryCounts[category] ?? 0;
        return (
          <View style={{ paddingHorizontal: 0 }}>
            <View style={{ flexDirection: "row", paddingVertical: 10 }} accessibilityLabel={`${BACKUP_CATEGORY_LABELS[category]}: ${count} records`}>
              <Text variant="body" style={{ flex: 1, color: colors.onSurface }}>{BACKUP_CATEGORY_LABELS[category]}</Text>
              <Text variant="body" style={{ width: 60, textAlign: "right", color: colors.onSurface }}>{count}</Text>
            </View>
            <Separator />
          </View>
        );
      }}
      ListFooterComponent={
        <>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginBottom: 8 }}>
            Only the selected categories will be imported. Unchecked categories in your current app data will be left untouched.
          </Text>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginBottom: 16 }}>
                   Existing history and seeded content remain idempotent. User preferences from the backup are restored.
          </Text>
          {importProgress && (
            <Text variant="caption" style={{ color: colors.primary, marginBottom: 8 }} accessibilityLiveRegion="polite" accessibilityLabel={importProgress}>
              {importProgress}
            </Text>
          )}
          <View style={styles.actions}>
             <Button variant="outline" onPress={onCancel} disabled={loading} style={styles.actionBtn} accessibilityLabel={t({ id: "common.cancelImportA11y", message: "Cancel import" })} accessibilityRole="button">
               {t({ id: "common.cancel", message: "Cancel" })}
            </Button>
            <Button variant="default" onPress={onImport} loading={loading} disabled={loading} style={styles.actionBtn} accessibilityLabel={`Import ${totalRecords} records`} accessibilityRole="button">
               {t({ id: "common.import", message: "Import" })}
            </Button>
          </View>
        </>
      }
    />
  );
}

function ResultList({ result, onDone }: { result: ImportResult; onDone: () => void }) {
  const colors = useThemeColors();
  const layout = useLayout();
  const resultTables = useMemo(
    () => IMPORT_TABLE_ORDER.filter((t) => (result.perTable[t]?.inserted ?? 0) > 0 || (result.perTable[t]?.skipped ?? 0) > 0),
    [result],
  );
  const categoryResults = useMemo(() => BACKUP_CATEGORY_ORDER.map((category) => {
    const totals = BACKUP_CATEGORY_TABLES[category].reduce(
      (sum, table) => ({
        inserted: sum.inserted + (result.perTable[table]?.inserted ?? 0),
        skipped: sum.skipped + (result.perTable[table]?.skipped ?? 0),
      }),
      { inserted: 0, skipped: 0 },
    );
    return { category, ...totals };
  }).filter(({ inserted, skipped }) => inserted > 0 || skipped > 0), [result]);
  return (
    <FlatList
      data={resultTables}
      keyExtractor={(item) => item}
      contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding }]}
      ListHeaderComponent={
        <>
          <Text variant="heading" style={{ color: colors.onBackground, marginBottom: 16 }}>
                {t({ id: "settings.importBackup.complete", message: "Import Complete" })}
          </Text>
          <Card style={styles.card}>
            <CardContent>
              <Text variant="subtitle" style={{ color: colors.primary, marginBottom: 8 }}>
                {result.inserted} records imported
              </Text>
              {result.skipped > 0 && (
                <Text variant="body" style={{ color: colors.onSurfaceVariant, marginBottom: 12 }}>
                {getImportCompletionMessage(result.inserted, result.skipped)}
                </Text>
              )}
              <View style={{ flexDirection: "row", paddingVertical: 8 }}>
                <Text variant="caption" style={{ flex: 1, color: colors.onSurfaceVariant }}>{t({ id: "settings.importBackup.data", message: "Data" })}</Text>
                <Text variant="caption" style={{ width: 70, textAlign: "right", color: colors.onSurfaceVariant }}>{t({ id: "settings.importBackup.imported", message: "Imported" })}</Text>
                <Text variant="caption" style={{ width: 70, textAlign: "right", color: colors.onSurfaceVariant }}>{t({ id: "settings.importBackup.skipped", message: "Skipped" })}</Text>
              </View>
              <Separator />
              {categoryResults.map(({ category, inserted, skipped }) => (
                <View key={category} style={{ flexDirection: "row", paddingVertical: 8 }}>
                  <Text variant="caption" style={{ flex: 1, color: colors.onSurfaceVariant }}>{BACKUP_CATEGORY_LABELS[category]}</Text>
                  <Text variant="caption" style={{ width: 70, textAlign: "right", color: colors.onSurfaceVariant }}>{inserted}</Text>
                  <Text variant="caption" style={{ width: 70, textAlign: "right", color: colors.onSurfaceVariant }}>{skipped}</Text>
                </View>
              ))}
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
         <Button variant="default" onPress={onDone} style={{ marginTop: 16 }} accessibilityLabel={t({ id: "common.doneReturnA11y", message: "Done, return to settings" })} accessibilityRole="button">
           {t({ id: "common.done", message: "Done" })}
        </Button>
      }
    />
  );
}

/** Hook to load and parse a backup asynchronously, never during render. */
function useBackupData(filePath?: string, importToken?: string) {
  const [fileData, setFileData] = useState<Record<string, unknown> | null>(null);
  const [fileLoading, setFileLoading] = useState(!!filePath || !!importToken);
  const [fileError, setFileError] = useState(false);

  useEffect(() => {
    if (!filePath && !importToken) return;
    let mounted = true;
    (async () => {
      try {
        let raw: string | null = importToken ? getImportSession(importToken) : null;
        if (filePath) {
          const { File } = await import("expo-file-system");
          raw = await new File(filePath).text();
        }
        if (raw === null) throw new Error("Import session expired");
        const data = JSON.parse(raw) as Record<string, unknown>;
        if (mounted) { setFileData(data); setFileLoading(false); }
      } catch {
        if (mounted) { setFileError(true); setFileLoading(false); }
      }
      if (importToken) clearImportSession(importToken);
    })();
    return () => { mounted = false; };
  }, [filePath, importToken]);

  const parsed = fileData;

  return { parsed, fileLoading, fileError };
}

// eslint-disable-next-line complexity
export default function ImportBackup() {
  const colors = useThemeColors();
  const router = useRouter();
  const toast = useToast();
  const { importToken, filePath, selectedCategories: selectedCategoriesParam } = useLocalSearchParams<{
    importToken?: string;
    filePath?: string;
    selectedCategories?: string;
  }>();
  const [loading, setLoading] = useState(false);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const { parsed, fileLoading, fileError } = useBackupData(filePath, importToken);

  const version = parsed ? Number(parsed.version ?? 0) : 0;
  const exportedAt = parsed ? ((parsed.exported_at as string) ?? null) : null;
  const appVersion = parsed ? ((parsed.app_version as string) ?? null) : null;
  const selectedCategories = useMemo(
    () =>
      (selectedCategoriesParam ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter((value): value is BackupCategoryName => BACKUP_CATEGORY_ORDER.includes(value as BackupCategoryName)),
    [selectedCategoriesParam],
  );
  const categoryCounts = useMemo(
    () => (parsed ? getBackupCategoryCounts(parsed) : ({} as Partial<Record<BackupCategoryName, number>>)),
    [parsed],
  );
  const categoriesToShow = useMemo(() => {
    if (!parsed) return [];
    const base = selectedCategories.length > 0
      ? selectedCategories
      : BACKUP_CATEGORY_ORDER.filter((category) => (categoryCounts[category] ?? 0) > 0);
    return base.filter((category, index) => base.indexOf(category) === index);
  }, [parsed, selectedCategories, categoryCounts]);
  const totalRecords = useMemo(
    () => categoriesToShow.reduce((sum, category) => sum + (categoryCounts[category] ?? 0), 0),
    [categoriesToShow, categoryCounts],
  );

  if (fileLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, padding: 24 }]}>
        <Text variant="body" style={{ color: colors.onBackground }}>{t({ id: "settings.importBackup.loading", message: "Loading backup file…" })}</Text>
      </View>
    );
  }

  if (fileError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, padding: 24 }]}>
        <Text variant="body" style={{ color: colors.error }}>{t({ id: "settings.importBackup.readFailed", message: "Failed to read backup file." })}</Text>
          <Button variant="default" onPress={() => router.back()} style={{ marginTop: 16 }} accessibilityLabel={t({ id: "settings.importBackup.goBackA11y", message: "Go back" })} accessibilityRole="button">
           {t({ id: "settings.importBackup.goBackButton", message: "Go Back" })}
        </Button>
      </View>
    );
  }

  if ((!importToken && !filePath) || !parsed) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, padding: 24 }]}>
        <Text variant="body" style={{ color: !importToken && !filePath ? colors.onBackground : colors.error }}>
          {!importToken && !filePath ? t({ id: "settings.importBackup.noData", message: "No backup data provided." }) : t({ id: "settings.importBackup.invalidData", message: "Invalid backup data." })}
        </Text>
          <Button variant="default" onPress={() => router.back()} style={{ marginTop: 16 }} accessibilityLabel={t({ id: "settings.importBackup.goBackA11y", message: "Go back" })} accessibilityRole="button">
           {t({ id: "settings.importBackup.goBackButton", message: "Go Back" })}
        </Button>
      </View>
    );
  }

  const handleImport = async () => {
    setLoading(true);
    setImportProgress("Starting import...");
    try {
      const importResult = await importData(
        parsed,
        (progress: ImportProgress) => {
          if (progress.table === "done") {
            setImportProgress(null);
          } else {
            const label = BACKUP_TABLE_LABELS[progress.table as BackupTableName] ?? progress.table;
        setImportProgress(i18n._({ id: "settings.importBackup.progress", message: "Importing {label}... ({tableIndex}/{totalTables}){hasRows, select, true { {rowIndex}/{rowCount}} false {}}", values: { label, tableIndex: progress.tableIndex + 1, totalTables: progress.totalTables, hasRows: progress.rowCount ? "true" : "false", rowIndex: progress.rowIndex ?? 0, rowCount: progress.rowCount ?? 0 } }));
          }
        },
        selectedCategories.length > 0 ? { selectedCategories } : undefined,
      );
      setResult(importResult);
       toast.success(t({ id: "settings.importBackup.completeToast", message: `Import complete — ${getImportCompletionMessage(importResult.inserted, importResult.skipped)}` }));
    } catch {
       toast.error(t({ id: "settings.importBackup.failed", message: "Import failed — all changes have been rolled back" }));
    } finally {
      setLoading(false);
      setImportProgress(null);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {!result ? (
        <PreviewList
          categoriesToShow={categoriesToShow}
          categoryCounts={categoryCounts}
          version={version}
          totalRecords={totalRecords}
          exportedAt={exportedAt}
          appVersion={appVersion}
          importProgress={importProgress}
          loading={loading}
          onImport={handleImport}
          onCancel={() => router.back()}
        />
      ) : (
        <ResultList result={result} onDone={() => router.back()} />
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
