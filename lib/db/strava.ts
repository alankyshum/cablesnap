import { query, queryOne, execute } from "./helpers";
import { uuid } from "../uuid";
import type { StravaConnectionRow } from "./schema";

// ---- Strava Connection (singleton) ----

export type StravaConnection = StravaConnectionRow;

export async function getStravaConnection(): Promise<StravaConnection | null> {
  return queryOne<StravaConnection>(
    "SELECT * FROM strava_connection WHERE id = 1"
  );
}

export async function saveStravaConnection(
  athleteId: number,
  athleteName: string
): Promise<void> {
  await execute(
    "INSERT OR REPLACE INTO strava_connection (id, athlete_id, athlete_name, connected_at) VALUES (1, ?, ?, ?)",
    [athleteId, athleteName, Date.now()]
  );
}

export async function deleteStravaConnection(): Promise<void> {
  await execute("DELETE FROM strava_connection WHERE id = 1");
}

// ---- Strava Sync Log ----

export type StravaSyncStatus = "pending" | "synced" | "failed" | "permanently_failed";

export type StravaSyncLog = {
  id: string;
  session_id: string;
  strava_activity_id: string | null;
  status: StravaSyncStatus;
  error: string | null;
  retry_count: number;
  created_at: number;
  synced_at: number | null;
};

export async function createSyncLogEntry(sessionId: string): Promise<string> {
  const id = uuid();
  await execute(
    "INSERT OR IGNORE INTO strava_sync_log (id, session_id, status, retry_count, created_at) VALUES (?, ?, 'pending', 0, ?)",
    [id, sessionId, Date.now()]
  );
  return id;
}

export async function markSyncSuccess(
  sessionId: string,
  stravaActivityId: string
): Promise<void> {
  await execute(
    "UPDATE strava_sync_log SET status = 'synced', strava_activity_id = ?, synced_at = ?, error = NULL WHERE session_id = ?",
    [stravaActivityId, Date.now(), sessionId]
  );
}

export async function markSyncFailed(
  sessionId: string,
  error: string
): Promise<void> {
  await execute(
    "UPDATE strava_sync_log SET status = 'failed', error = ?, retry_count = retry_count + 1 WHERE session_id = ?",
    [error, sessionId]
  );
}

export async function markSyncPermanentlyFailed(
  sessionId: string
): Promise<void> {
  await execute(
    "UPDATE strava_sync_log SET status = 'permanently_failed' WHERE session_id = ?",
    [sessionId]
  );
}

export async function getPendingOrFailedSyncs(): Promise<StravaSyncLog[]> {
  return query<StravaSyncLog>(
    "SELECT * FROM strava_sync_log WHERE status IN ('pending', 'failed') ORDER BY created_at ASC"
  );
}

export async function getSyncLogForSession(
  sessionId: string
): Promise<StravaSyncLog | null> {
  return queryOne<StravaSyncLog>(
    "SELECT * FROM strava_sync_log WHERE session_id = ?",
    [sessionId]
  );
}
