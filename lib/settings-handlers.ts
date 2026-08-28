import { Alert } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import type { Router } from 'expo-router';
import {
  exportAllData,
  validateBackupFileSize,
  validateBackupData,
  BACKUP_TABLE_LABELS,
} from '@/lib/db';
import type { BackupCategoryName, BackupTableName, ExportProgress } from '@/lib/db';
import type { useToast } from '@/components/ui/bna-toast';
import { createImportSession } from '@/lib/import-session';
import { i18n } from '@lingui/core';
import { t } from '@lingui/core/macro';

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---- E2E deterministic import fixture (BLD-1769) ----
//
// The static `expo export -p web` bundle used for Playwright visual regression
// cannot drive the OS file picker (`DocumentPicker.getDocumentAsync`), so the
// production "Import data" → router.push("/settings/import-backup") flow could
// not be exercised headless. The BLD-1769 nav-header guard needs that REAL push
// (not a deep-link `page.goto`) so expo-router's Stack has back-history and the
// header back affordance renders — the recurrence class this issue closes.
//
// Mirroring the BLD-526 exercises fixture (lib/db/exercises.ts `readE2EFixture`):
// when Playwright (`navigator.webdriver === true`) has injected a backup JSON
// string onto `window.__E2E_IMPORT_BACKUP_FIXTURE__`, `pickImportBackup` returns
// it INSTEAD of opening the picker. The webdriver guard means a console-injected
// flag in a real user's browser can never bypass their file picker, and the rest
// of the import flow (category sheet → confirm → router.push) runs unchanged.
function readE2EImportFixture(): { raw: string; data: Record<string, unknown> } | null {
  if (typeof window === 'undefined') return null;
  const nav =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { webdriver?: boolean })
      : null;
  if (!nav?.webdriver) return null;
  const raw = (window as unknown as { __E2E_IMPORT_BACKUP_FIXTURE__?: unknown })
    .__E2E_IMPORT_BACKUP_FIXTURE__;
  if (typeof raw !== 'string') return null;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    return { raw, data };
  } catch {
    return null;
  }
}

type Deps = {
  toast: ReturnType<typeof useToast>;
  setLoading: (v: boolean) => void;
  setExportProgress: (v: string | null) => void;
  router: Router;
};

export async function handleExport(
  { toast, setLoading, setExportProgress }: Deps,
  selectedCategories?: BackupCategoryName[],
  includeCredentials = false,
) {
  setLoading(true);
    setExportProgress(t({ id: 'settingsHandlers.export.preparing', message: 'Preparing export...' }));
  try {
    const data = await exportAllData({ selectedCategories, includeCredentials }, (progress: ExportProgress) => {
      if (progress.table === 'done') {
        setExportProgress(null);
      } else {
        setExportProgress(
           i18n._({ id: 'settingsHandlers.export.progress', message: 'Exporting {label}... ({tableIndex}/{totalTables})', values: { label: BACKUP_TABLE_LABELS[progress.table as BackupTableName] ?? progress.table, tableIndex: progress.tableIndex + 1, totalTables: progress.totalTables } }),
        );
      }
    });
    const totalRecords = Object.values(data.counts).reduce((a, b) => a + b, 0);
    if (totalRecords === 0) {
       toast.info(t({ id: 'settingsHandlers.export.noData', message: 'No data to export' }));
      return;
    }
    const json = JSON.stringify(data, null, 2);
    const file = new File(Paths.cache, `cablesnap-backup-${dateStamp()}.json`);
    await file.write(json);
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
       dialogTitle: t({ id: 'settingsHandlers.export.dialogTitle', message: 'Export CableSnap Data' }),
    });
     toast.success(t({ id: 'settingsHandlers.export.success', message: 'Data exported successfully' }));
  } catch {
     toast.error(t({ id: 'settingsHandlers.export.failure', message: 'Export failed' }));
  } finally {
    setLoading(false);
    setExportProgress(null);
  }
}

export async function pickImportBackup({ toast, setLoading }: Pick<Deps, 'toast' | 'setLoading'>) {
  // E2E seam (BLD-1769): under Playwright (navigator.webdriver), a pre-injected
  // fixture replaces the undriveable OS file picker so the real import →
  // router.push flow runs headless. No-op for real users. See readE2EImportFixture.
  const fixture = readE2EImportFixture();
  if (fixture) return fixture;
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return null;
    const asset = result.assets[0];
    if (asset.size && asset.size > 50 * 1024 * 1024) {
       Alert.alert(t({ id: 'settingsHandlers.import.fileTooLarge', message: 'File Too Large' }), t({ id: 'settingsHandlers.import.backupTooLarge', message: 'This backup file is too large to process safely.' }));
      return null;
    }
    setLoading(true);
    const file = new File(asset.uri);
    const raw = await file.text();
    const sizeError = validateBackupFileSize(raw.length);
    if (sizeError) {
       Alert.alert(t({ id: 'settingsHandlers.import.fileTooLarge', message: 'File Too Large' }), sizeError.message);
      return null;
    }
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw);
    } catch {
       Alert.alert(t({ id: 'settingsHandlers.import.invalidFile', message: 'Invalid File' }), t({ id: 'settingsHandlers.import.invalidBackupFile', message: "This file doesn't appear to be a valid CableSnap backup." }));
      return null;
    }
    const validationError = validateBackupData(data);
    if (validationError) {
       Alert.alert(t({ id: 'settingsHandlers.import.invalidBackup', message: 'Invalid Backup' }), validationError.message);
      return null;
    }
    return { raw, data };
  } catch {
     toast.error(t({ id: 'settingsHandlers.import.failure', message: 'Import failed' }));
    return null;
  } finally {
    setLoading(false);
  }
}

export async function handleImport({ toast, setLoading, router }: Deps) {
  const picked = await pickImportBackup({ toast, setLoading });
  if (!picked) return;
  router.push({ pathname: '/settings/import-backup', params: { importToken: createImportSession(picked.raw) } });
}

// ---- E2E deterministic CSV import fixture (BLD-2463) ----
//
// Mirrors the BLD-1769 `readE2EImportFixture` seam pattern for the JSON backup
// flow. The static `expo export -p web` bundle used for Playwright cannot drive
// the OS file picker (`DocumentPicker.getDocumentAsync`), so the production
// "Choose CSV File…" → router.push("/settings/import-workouts") flow cannot be
// exercised headless without a fixture path.
//
// When Playwright (`navigator.webdriver === true`) has injected a CSV string
// onto `window.__E2E_IMPORT_CSV_FIXTURE__`, `pickImportWorkoutsCsv` returns the
// fixture file URI INSTEAD of opening the picker. The webdriver guard means a
// console-injected flag in a real user's browser can NEVER bypass their picker —
// the check is double-hardened (SSR guard + webdriver guard).
function readE2ECsvImportFixture(): string | null {
  if (typeof window === 'undefined') return null;
  const nav =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { webdriver?: boolean })
      : null;
  if (!nav?.webdriver) return null;
  const raw = (window as unknown as { __E2E_IMPORT_CSV_FIXTURE__?: unknown })
    .__E2E_IMPORT_CSV_FIXTURE__;
  if (typeof raw !== 'string') return null;
  return raw;
}

/**
 * Prompt the user to pick a CSV file for workout history import.
 * Returns the local file URI on success, or null if canceled/failed.
 *
 * E2E seam (BLD-2463): under Playwright (`navigator.webdriver === true`), a
 * pre-injected CSV string on `window.__E2E_IMPORT_CSV_FIXTURE__` is written
 * to a temp cache file and its URI returned, bypassing the OS picker.
 */
export async function pickImportWorkoutsCsv({
  toast,
}: Pick<Deps, 'toast'>): Promise<string | null> {
  // E2E seam: write fixture CSV to a temp file and return its URI
  const fixtureCsv = readE2ECsvImportFixture();
  if (fixtureCsv !== null) {
    try {
      const { File, Paths } = await import('expo-file-system');
      const tempFile = new File(Paths.cache, '__e2e_import_fixture__.csv');
      await tempFile.write(fixtureCsv);
      return tempFile.uri;
    } catch {
      // Fixture write failed — fall through to real picker
    }
  }

  try {
    const result = await DocumentPicker.getDocumentAsync({
      // Accept CSV MIME types; some platforms may not recognize text/csv alone
      type: ['text/csv', 'text/comma-separated-values', '*/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return null;
    const asset = result.assets[0];

    // Validate extension/size
    if (asset.name && !asset.name.toLowerCase().endsWith('.csv')) {
       Alert.alert(t({ id: 'settingsHandlers.csv.invalidFile', message: 'Invalid File' }), t({ id: 'settingsHandlers.csv.invalidMessage', message: 'Please select a .csv file exported from your workout app.' }));
      return null;
    }
    if (asset.size && asset.size > 50 * 1024 * 1024) {
       Alert.alert(t({ id: 'settingsHandlers.csv.fileTooLarge', message: 'File Too Large' }), t({ id: 'settingsHandlers.csv.tooLarge', message: 'This CSV file is too large to process safely.' }));
      return null;
    }
    return asset.uri;
  } catch {
     toast.error(t({ id: 'settingsHandlers.csv.pickerFailure', message: 'Could not open file picker' }));
    return null;
  }
}
