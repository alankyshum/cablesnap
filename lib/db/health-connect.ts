import { query, queryOne, execute } from "./helpers";
import { uuid } from "../uuid";

// ---- Health Connect Sync Log ----

export type HCSyncStatus = "pending" | "synced" | "failed" | "permanently_failed";

export type HCSyncLog = {
  id: string;
  session_id: string;
  health_connect_record_id: string | null;
  status: HCSyncStatus;
  error: string | null;
  retry_count: number;
  created_at: number;
  synced_at: number | null;
};

export async function createHCSyncLogEntry(sessionId: string): Promise<string> {
  const id = uuid();
  await execute(
    "INSERT OR IGNORE INTO health_connect_sync_log (id, session_id, status, retry_count, created_at) VALUES (?, ?, 'pending', 0, ?)",
    [id, sessionId, Date.now()]
  );
  return id;
}

export async function markHCSyncSuccess(
  sessionId: string,
  recordId?: string
): Promise<void> {
  await execute(
    "UPDATE health_connect_sync_log SET status = 'synced', health_connect_record_id = ?, synced_at = ?, error = NULL WHERE session_id = ?",
    [recordId ?? null, Date.now(), sessionId]
  );
}

export async function markHCSyncFailed(
  sessionId: string,
  error: string
): Promise<void> {
  await execute(
    "UPDATE health_connect_sync_log SET status = 'failed', error = ?, retry_count = retry_count + 1 WHERE session_id = ?",
    [error, sessionId]
  );
}

export async function markHCSyncPermanentlyFailed(
  sessionId: string,
  reason?: string
): Promise<void> {
  await execute(
    "UPDATE health_connect_sync_log SET status = 'permanently_failed', error = COALESCE(?, error) WHERE session_id = ?",
    [reason ?? null, sessionId]
  );
}

export async function getHCPendingOrFailedSyncs(): Promise<HCSyncLog[]> {
  return query<HCSyncLog>(
    "SELECT * FROM health_connect_sync_log WHERE status IN ('pending', 'failed') ORDER BY created_at ASC"
  );
}

export async function getHCSyncLogForSession(
  sessionId: string
): Promise<HCSyncLog | null> {
  return queryOne<HCSyncLog>(
    "SELECT * FROM health_connect_sync_log WHERE session_id = ?",
    [sessionId]
  );
}

export async function markAllHCPendingAsFailed(reason: string): Promise<void> {
  await execute(
    "UPDATE health_connect_sync_log SET status = 'permanently_failed', error = ? WHERE status IN ('pending', 'failed')",
    [reason]
  );
}
