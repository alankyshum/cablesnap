import { asc, desc, eq } from "drizzle-orm";
import { uuid } from "../uuid";
import { getDrizzle, withTransaction } from "./helpers";
import { coachMessages, coachSessions } from "./schema";

export type CoachSession = typeof coachSessions.$inferSelect;
export type CoachMessage = typeof coachMessages.$inferSelect;
export type CreateCoachSession = typeof coachSessions.$inferInsert;
export type AppendCoachMessage = typeof coachMessages.$inferInsert;

export async function createSession(
  input: Pick<CreateCoachSession, "title" | "model_id">,
): Promise<CoachSession> {
  const db = await getDrizzle();
  const now = Date.now();
  const id = uuid();
  await db.insert(coachSessions).values({
    id,
    title: input.title,
    model_id: input.model_id,
    created_at: now,
    updated_at: now,
  });
  return (await db.select().from(coachSessions).where(eq(coachSessions.id, id)).get())!;
}

export async function listSessions(): Promise<CoachSession[]> {
  const db = await getDrizzle();
  return db.select().from(coachSessions).orderBy(desc(coachSessions.updated_at), desc(coachSessions.created_at)).all();
}

export async function renameSession(id: string, title: string): Promise<CoachSession> {
  const db = await getDrizzle();
  await db.update(coachSessions)
    .set({ title, updated_at: Date.now() })
    .where(eq(coachSessions.id, id));
  return (await db.select().from(coachSessions).where(eq(coachSessions.id, id)).get())!;
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDrizzle();
  await withTransaction(async () => {
    await db.delete(coachMessages).where(eq(coachMessages.session_id, id));
    await db.delete(coachSessions).where(eq(coachSessions.id, id));
  });
}

export async function appendMessage(
  input: Pick<AppendCoachMessage, "session_id" | "role" | "content"> &
    Partial<Pick<AppendCoachMessage, "tool_calls" | "error">>,
): Promise<CoachMessage> {
  if (input.role === "assistant" && input.error == null && input.content.trim() === "") {
    throw new Error("Assistant messages without content must include an error");
  }
  const db = await getDrizzle();
  const id = uuid();
  const now = Date.now();
  await db.insert(coachMessages).values({
    id,
    session_id: input.session_id,
    role: input.role,
    content: input.content,
    tool_calls: input.tool_calls,
    error: input.error,
    created_at: now,
  });
  await db.update(coachSessions).set({ updated_at: now }).where(eq(coachSessions.id, input.session_id));
  return (await db.select().from(coachMessages).where(eq(coachMessages.id, id)).get())!;
}

export async function getMessages(sessionId: string): Promise<CoachMessage[]> {
  const db = await getDrizzle();
  return db.select().from(coachMessages)
    .where(eq(coachMessages.session_id, sessionId))
    .orderBy(asc(coachMessages.created_at), asc(coachMessages.id))
    .all();
}
