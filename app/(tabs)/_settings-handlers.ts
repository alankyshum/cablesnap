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

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
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
) {
  setLoading(true);
  setExportProgress('Preparing export...');
  try {
    const data = await exportAllData({ selectedCategories }, (progress: ExportProgress) => {
      if (progress.table === 'done') {
        setExportProgress(null);
      } else {
        setExportProgress(
          `Exporting ${BACKUP_TABLE_LABELS[progress.table as BackupTableName] ?? progress.table}... (${progress.tableIndex + 1}/${progress.totalTables})`,
        );
      }
    });
    const totalRecords = Object.values(data.counts).reduce((a, b) => a + b, 0);
    if (totalRecords === 0) {
      toast.info('No data to export');
      return;
    }
    const json = JSON.stringify(data, null, 2);
    const file = new File(Paths.cache, `cablesnap-backup-${dateStamp()}.json`);
    await file.write(json);
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Export CableSnap Data',
    });
    toast.success('Data exported successfully');
  } catch {
    toast.error('Export failed');
  } finally {
    setLoading(false);
    setExportProgress(null);
  }
}

export async function pickImportBackup({ toast, setLoading }: Pick<Deps, 'toast' | 'setLoading'>) {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return null;
    const asset = result.assets[0];
    if (asset.size && asset.size > 50 * 1024 * 1024) {
      Alert.alert('File Too Large', 'This backup file is too large to process safely.');
      return null;
    }
    setLoading(true);
    const file = new File(asset.uri);
    const raw = await file.text();
    const sizeError = validateBackupFileSize(raw.length);
    if (sizeError) {
      Alert.alert('File Too Large', sizeError.message);
      return null;
    }
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw);
    } catch {
      Alert.alert('Invalid File', "This file doesn't appear to be a valid CableSnap backup.");
      return null;
    }
    const validationError = validateBackupData(data);
    if (validationError) {
      Alert.alert('Invalid Backup', validationError.message);
      return null;
    }
    return { raw, data };
  } catch {
    toast.error('Import failed');
    return null;
  } finally {
    setLoading(false);
  }
}

export async function handleImport({ toast, setLoading, router }: Deps) {
  const picked = await pickImportBackup({ toast, setLoading });
  if (!picked) return;
  router.push({ pathname: '/settings/import-backup', params: { backupJson: picked.raw } });
}
