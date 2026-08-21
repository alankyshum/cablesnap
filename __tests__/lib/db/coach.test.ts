import {
  MOCK_UUID,
  mockDrizzleAll,
  mockDrizzleGet,
  mockDrizzleDb,
  mockDb,
  setupDbTestContext,
} from "../../helpers/db-test-setup";

jest.mock("expo-crypto", () => ({ randomUUID: jest.fn(() => MOCK_UUID) }));
jest.mock("drizzle-orm/expo-sqlite", () => ({ drizzle: jest.fn(() => mockDrizzleDb) }));
jest.mock("expo-sqlite", () => ({ openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)) }));
jest.mock("../../../lib/seed", () => ({ seedExercises: jest.fn(() => []) }));

const ctx = setupDbTestContext();

describe("coach data layer", () => {
  let sessionId: string;

  beforeEach(async () => {
    await ctx.initDb();
    const coach = require("../../../lib/db/coach") as typeof import("../../../lib/db/coach");
    sessionId = "session-1";
    mockDrizzleGet({ id: sessionId, title: "Training", model_id: "openai/gpt-4o-mini", created_at: 1, updated_at: 1 });
    await coach.createSession({ title: "Training", model_id: "openai/gpt-4o-mini" });
  });

  it("persists the picker-selected model and supports session CRUD", async () => {
    const coach = require("../../../lib/db/coach") as typeof import("../../../lib/db/coach");
    mockDrizzleAll([{ id: sessionId, title: "Training", model_id: "openai/gpt-4o-mini", created_at: 1, updated_at: 1 }]);
    expect((await coach.listSessions())[0].model_id).toBe("openai/gpt-4o-mini");
    mockDrizzleGet({ id: sessionId, title: "Renamed", model_id: "openai/gpt-4o-mini", created_at: 1, updated_at: 2 });
    const renamed = await coach.renameSession(sessionId, "Renamed");
    expect(renamed.title).toBe("Renamed");
  });

  it("orders messages and deletes them with their session", async () => {
    const coach = require("../../../lib/db/coach") as typeof import("../../../lib/db/coach");
    mockDrizzleGet({ id: "message-1", session_id: sessionId, role: "user", content: "Hello", tool_calls: null, created_at: 2, error: null });
    await coach.appendMessage({ session_id: sessionId, role: "user", content: "Hello" });
    mockDrizzleGet({ id: "message-2", session_id: sessionId, role: "assistant", content: "Hi", tool_calls: null, created_at: 3, error: null });
    await coach.appendMessage({ session_id: sessionId, role: "assistant", content: "Hi" });
    mockDrizzleAll([
      { id: "message-1", session_id: sessionId, role: "user", content: "Hello", tool_calls: null, created_at: 2, error: null },
      { id: "message-2", session_id: sessionId, role: "assistant", content: "Hi", tool_calls: null, created_at: 3, error: null },
    ]);
    expect((await coach.getMessages(sessionId)).map((message) => message.content)).toEqual(["Hello", "Hi"]);
    await coach.deleteSession(sessionId);
    expect(mockDrizzleDb.delete).toHaveBeenCalledTimes(2);
  });

  it("uses a transaction for the message-before-session cascade", async () => {
    const coach = require("../../../lib/db/coach") as typeof import("../../../lib/db/coach");
    await coach.deleteSession(sessionId);
    expect(mockDb.withTransactionAsync).toHaveBeenCalled();
    expect(mockDrizzleDb.delete.mock.invocationCallOrder[0]).toBeLessThan(mockDrizzleDb.delete.mock.invocationCallOrder[1]);
  });

  it("rejects empty assistant success rows but accepts error rows", async () => {
    const coach = require("../../../lib/db/coach") as typeof import("../../../lib/db/coach");
    const insertCallsBeforeMessage = mockDrizzleDb.insert.mock.calls.length;

    await expect(coach.appendMessage({
      session_id: sessionId,
      role: "assistant",
      content: " \n ",
    })).rejects.toThrow("Assistant messages without content must include an error");
    expect(mockDrizzleDb.insert).toHaveBeenCalledTimes(insertCallsBeforeMessage);

    mockDrizzleGet({ id: "message-error", session_id: sessionId, role: "assistant", content: " ", tool_calls: null, created_at: 3, error: JSON.stringify({ kind: "empty_response" }) });
    await expect(coach.appendMessage({
      session_id: sessionId,
      role: "assistant",
      content: " ",
      error: JSON.stringify({ kind: "empty_response" }),
    })).resolves.toEqual(expect.objectContaining({ error: expect.any(String) }));
  });
});
