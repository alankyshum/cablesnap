import { Alert } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import type { Router } from 'expo-router';
import {
  exportAllData,
  estimateExportSize,
  validateBackupFileSize,
  validateBackupData,
  BACKUP_TABLE_LABELS,
} from '@/lib/db';
import type { BackupTableName, ExportProgress } from '@/lib/db';
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

export async function handleExport({ toast, setLoading, setExportProgress }: Deps) {
  try {
    const { label } = await estimateExportSize();
    Alert.alert(
      'Export All Data',
      `Your backup will be approximately ${label}. This may take a moment. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Export',
          onPress: async () => {
            setLoading(true);
            setExportProgress('Preparing export...');
            try {
              const data = await exportAllData((progress: ExportProgress) => {
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
                setLoading(false);
                setExportProgress(null);
                return;
              }
              const json = JSON.stringify(data, null, 2);
              const file = new File(Paths.cache, `fitforge-backup-${dateStamp()}.json`);
              await file.write(json);
              await Sharing.shareAsync(file.uri, {
                mimeType: 'application/json',
                dialogTitle: 'Export FitForge Data',
              });
              toast.success('Data exported successfully');
            } catch {
              toast.error('Export failed');
            } finally {
              setLoading(false);
              setExportProgress(null);
            }
          },
        },
      ],
    );
  } catch {
    toast.error('Could not estimate export size');
  }
}

export async function handleImport({ toast, setLoading, router }: Deps) {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    if (asset.size && asset.size > 50 * 1024 * 1024) {
      Alert.alert('File Too Large', 'This backup file is too large to process safely.');
      return;
    }
    setLoading(true);
    const file = new File(asset.uri);
    const raw = await file.text();
    const sizeError = validateBackupFileSize(raw.length);
    if (sizeError) {
      Alert.alert('File Too Large', sizeError.message);
      setLoading(false);
      return;
    }
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw);
    } catch {
      Alert.alert('Invalid File', "This file doesn't appear to be a valid FitForge backup.");
      setLoading(false);
      return;
    }
    const validationError = validateBackupData(data);
    if (validationError) {
      Alert.alert('Invalid Backup', validationError.message);
      setLoading(false);
      return;
    }
    setLoading(false);
    router.push({ pathname: '/settings/import-backup', params: { backupJson: raw } });
  } catch {
    toast.error('Import failed');
    setLoading(false);
  }
}
