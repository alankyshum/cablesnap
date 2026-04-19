import { eq, sql, asc } from "drizzle-orm";
import { getDrizzle } from "./helpers";
import { healthConnectSyncLog } from "./schema";
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
  const db = await getDrizzle();
  await db.insert(healthConnectSyncLog)
    .values({ id, session_id: sessionId, status: "pending", retry_count: 0, created_at: Date.now() })
    .onConflictDoNothing();
  return id;
}

export async function markHCSyncSuccess(
  sessionId: string,
  recordId?: string
): Promise<void> {
  const db = await getDrizzle();
  await db.update(healthConnectSyncLog)
    .set({ status: "synced", health_connect_record_id: recordId ?? null, synced_at: Date.now(), error: null })
    .where(eq(healthConnectSyncLog.session_id, sessionId));
}

export async function markHCSyncFailed(
  sessionId: string,
  error: string
): Promise<void> {
  const db = await getDrizzle();
  await db.update(healthConnectSyncLog)
    .set({ status: "failed", error, retry_count: sql`retry_count + 1` })
    .where(eq(healthConnectSyncLog.session_id, sessionId));
}

export async function markHCSyncPermanentlyFailed(
  sessionId: string,
  reason?: string
): Promise<void> {
  const db = await getDrizzle();
  await db.update(healthConnectSyncLog)
    .set({ status: "permanently_failed", error: sql`COALESCE(${reason ?? null}, error)` })
    .where(eq(healthConnectSyncLog.session_id, sessionId));
}

export async function getHCPendingOrFailedSyncs(): Promise<HCSyncLog[]> {
  const db = await getDrizzle();
  return db.select()
    .from(healthConnectSyncLog)
    .where(sql`${healthConnectSyncLog.status} IN ('pending', 'failed')`)
    .orderBy(asc(healthConnectSyncLog.created_at)) as unknown as Promise<HCSyncLog[]>;
}

export async function getHCSyncLogForSession(
  sessionId: string
): Promise<HCSyncLog | null> {
  const db = await getDrizzle();
  const row = await db.select()
    .from(healthConnectSyncLog)
    .where(eq(healthConnectSyncLog.session_id, sessionId))
    .get();
  return (row as unknown as HCSyncLog) ?? null;
}

export async function markAllHCPendingAsFailed(reason: string): Promise<void> {
  const db = await getDrizzle();
  await db.update(healthConnectSyncLog)
    .set({ status: "permanently_failed", error: reason })
    .where(sql`${healthConnectSyncLog.status} IN ('pending', 'failed')`);
}
