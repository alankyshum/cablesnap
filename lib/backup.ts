import { File, Directory, Paths } from "expo-file-system";
import { getAppSetting, setAppSetting } from "./db/settings";
import { exportAllData } from "./db/import-export";

export type BackupFileInfo = {
  filename: string;
  uri: string;
  size: number;
  sizeLabel: string;
  date: Date;
};

const BACKUP_DIR = "backups";
const BACKUP_ENABLED_KEY = "auto_backup_enabled";
const BACKUP_RETENTION_KEY = "auto_backup_retention";
const LAST_BACKUP_KEY = "last_backup_at";
const DEFAULT_RETENTION = 5;

function getBackupDir(): Directory {
  return new Directory(Paths.document, BACKUP_DIR);
}

function ensureBackupDir(): void {
  const dir = getBackupDir();
  if (!dir.exists) dir.create({ intermediates: true });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildFilename(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const ms = pad(now.getMilliseconds(), 3);
  return `cablesnap-${stamp}-${ms}.json`;
}

export async function isAutoBackupEnabled(): Promise<boolean> {
  const val = await getAppSetting(BACKUP_ENABLED_KEY);
  // Default true (opt-out)
  return val !== "false";
}

export async function setAutoBackupEnabled(enabled: boolean): Promise<void> {
  await setAppSetting(BACKUP_ENABLED_KEY, enabled ? "true" : "false");
}

export async function getBackupRetention(): Promise<number> {
  const val = await getAppSetting(BACKUP_RETENTION_KEY);
  if (val) {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n > 0) return n;
  }
  return DEFAULT_RETENTION;
}

export async function setBackupRetention(count: number): Promise<void> {
  await setAppSetting(BACKUP_RETENTION_KEY, String(count));
}

export async function getLastBackupTime(): Promise<string | null> {
  return getAppSetting(LAST_BACKUP_KEY);
}

export async function getBackupFiles(): Promise<BackupFileInfo[]> {
  const dir = getBackupDir();
  if (!dir.exists) return [];

  const entries = dir.list();
  const files: BackupFileInfo[] = [];

  for (const entry of entries) {
    if (entry instanceof Directory) continue;
    if (!entry.uri.endsWith(".json")) continue;

    const file = entry as File;
    const filename = file.uri.split("/").pop() ?? "";

    // Parse date from filename: cablesnap-YYYY-MM-DD-HHmmss-XXX.json
    const match = filename.match(
      /cablesnap-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})-(\d{3})\.json$/
    );
    let date: Date;
    if (match) {
      const [, y, mo, d, h, mi, s, ms] = match;
      date = new Date(
        parseInt(y), parseInt(mo) - 1, parseInt(d),
        parseInt(h), parseInt(mi), parseInt(s), parseInt(ms)
      );
    } else {
      // Fallback: use a very old date so unknown files sort last
      date = new Date(0);
    }

    let size = 0;
    try {
      size = file.size ?? 0;
    } catch {
      // Size unavailable
    }

    files.push({
      filename,
      uri: file.uri,
      size,
      sizeLabel: formatFileSize(size),
      date,
    });
  }

  // Sort newest first
  files.sort((a, b) => b.date.getTime() - a.date.getTime());
  return files;
}

export async function pruneOldBackups(keep: number): Promise<number> {
  const files = await getBackupFiles(); // Already sorted newest-first by date
  if (files.length <= keep) return 0;

  const toDelete = files.slice(keep);
  let deleted = 0;

  for (const f of toDelete) {
    try {
      const file = new File(f.uri);
      if (file.exists) {
        file.delete();
        deleted++;
      }
    } catch {
      // Best-effort deletion
    }
  }

  return deleted;
}

export async function deleteBackup(filename: string): Promise<void> {
  const dir = getBackupDir();
  const file = new File(dir.uri + "/" + filename);
  if (file.exists) file.delete();
}

export async function performAutoBackup(): Promise<{
  success: boolean;
  path?: string;
  error?: string;
}> {
  try {
    ensureBackupDir();

    const data = await exportAllData();
    const json = JSON.stringify(data);
    const filename = buildFilename();
    const dir = getBackupDir();
    const file = new File(dir.uri + "/" + filename);
    await file.write(json);

    const retention = await getBackupRetention();
    await pruneOldBackups(retention);

    await setAppSetting(LAST_BACKUP_KEY, new Date().toISOString());

    return { success: true, path: file.uri };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.warn("Auto-backup failed:", message);
    return { success: false, error: message };
  }
}
