import { modelMessageSchema } from "ai";

import { persistedMessagesToModelMessages } from "../../../lib/ai/agent";
import type { CoachMessage } from "../../../lib/db/coach";

function row(input: Partial<CoachMessage> & Pick<CoachMessage, "role" | "content">): CoachMessage {
  return {
    id: input.id ?? "message-1",
    session_id: input.session_id ?? "session-1",
    role: input.role,
    content: input.content,
    tool_calls: input.tool_calls ?? null,
    error: input.error ?? null,
    created_at: input.created_at ?? 1,
  };
}

describe("persisted coach message history", () => {
  it("produces messages accepted by the AI SDK ModelMessage schema for every row variant", () => {
    const messages = persistedMessagesToModelMessages([
      row({ role: "user", content: "How is my bench press?" }),
      row({ role: "assistant", content: "Let me check your recent sessions." }),
      row({
        role: "assistant",
        content: "I checked your history.",
        tool_calls: JSON.stringify([{
          toolCallId: "call-1",
          name: "exercise_history",
          input: { exercise: "bench" },
          output: { trend: "up" },
        }]),
      }),
      row({
        role: "tool",
        content: "",
        tool_calls: JSON.stringify([{
          toolCallId: "call-2",
          name: "nutrition_macros",
          output: { calories: 2400 },
        }]),
      }),
      row({ role: "assistant", content: "The previous request failed.", error: "network error" }),
    ]);

    expect(messages).toHaveLength(5);
    expect(messages.every((message) => modelMessageSchema.safeParse(message).success)).toBe(true);
    expect(messages).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ content: "The previous request failed." }),
    ]));
  });
});
