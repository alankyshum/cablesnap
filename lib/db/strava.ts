import { eq, sql, asc } from "drizzle-orm";
import { getDrizzle, execute } from "./helpers";
import { stravaConnection, stravaSyncLog } from "./schema";
import { uuid } from "../uuid";

// ---- Strava Connection (singleton) ----

export type StravaConnection = {
  id: number;
  athlete_id: number;
  athlete_name: string;
  connected_at: number;
};

export async function getStravaConnection(): Promise<StravaConnection | null> {
  const db = await getDrizzle();
  const row = await db.select()
    .from(stravaConnection)
    .where(eq(stravaConnection.id, 1))
    .get();
  return (row as unknown as StravaConnection) ?? null;
}

export async function saveStravaConnection(
  athleteId: number,
  athleteName: string
): Promise<void> {
  const db = await getDrizzle();
  await db.insert(stravaConnection)
    .values({ id: 1, athlete_id: athleteId, athlete_name: athleteName, connected_at: Date.now() })
    .onConflictDoUpdate({
      target: stravaConnection.id,
      set: { athlete_id: athleteId, athlete_name: athleteName, connected_at: Date.now() },
    });
}

export async function deleteStravaConnection(): Promise<void> {
  const db = await getDrizzle();
  await db.delete(stravaConnection).where(eq(stravaConnection.id, 1));
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
  const db = await getDrizzle();
  await db.insert(stravaSyncLog)
    .values({ id, session_id: sessionId, status: "pending", retry_count: 0, created_at: Date.now() })
    .onConflictDoNothing();
  return id;
}

export async function markSyncSuccess(
  sessionId: string,
  stravaActivityId: string
): Promise<void> {
  const db = await getDrizzle();
  await db.update(stravaSyncLog)
    .set({ status: "synced", strava_activity_id: stravaActivityId, synced_at: Date.now(), error: null })
    .where(eq(stravaSyncLog.session_id, sessionId));
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
  const db = await getDrizzle();
  await db.update(stravaSyncLog)
    .set({ status: "permanently_failed" })
    .where(eq(stravaSyncLog.session_id, sessionId));
}

export async function getPendingOrFailedSyncs(): Promise<StravaSyncLog[]> {
  const db = await getDrizzle();
  return db.select()
    .from(stravaSyncLog)
    .where(sql`${stravaSyncLog.status} IN ('pending', 'failed')`)
    .orderBy(asc(stravaSyncLog.created_at)) as unknown as Promise<StravaSyncLog[]>;
}

export async function getSyncLogForSession(
  sessionId: string
): Promise<StravaSyncLog | null> {
  const db = await getDrizzle();
  const row = await db.select()
    .from(stravaSyncLog)
    .where(eq(stravaSyncLog.session_id, sessionId))
    .get();
  return (row as unknown as StravaSyncLog) ?? null;
}
