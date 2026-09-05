jest.mock("ai", () => ({
  stepCountIs: jest.fn(() => jest.fn()),
  streamText: jest.fn(),
}));
jest.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: jest.fn(() => ({ chat: jest.fn((model: string) => model) })),
}));
jest.mock("expo/fetch", () => ({ fetch: jest.fn() }));
jest.mock("../../../lib/ai/catalog", () => ({ getModel: jest.fn() }));
jest.mock("../../../lib/ai/key-vault", () => ({ get: jest.fn() }));
jest.mock("../../../lib/db/coach", () => ({ appendMessage: jest.fn(), getMessages: jest.fn() }));

import { runCoachAgent, startCoachAgent } from "../../../lib/ai/agent";
import * as ai from "ai";
import * as provider from "@openrouter/ai-sdk-provider";
import { fetch as expoFetch } from "expo/fetch";
import * as catalog from "../../../lib/ai/catalog";
import * as keyVault from "../../../lib/ai/key-vault";
import * as coach from "../../../lib/db/coach";

const mockGetModel = catalog.getModel as jest.MockedFunction<typeof catalog.getModel>;
const mockGetKey = keyVault.get as jest.MockedFunction<typeof keyVault.get>;
const mockAppendMessage = coach.appendMessage as jest.MockedFunction<typeof coach.appendMessage>;
const mockGetMessages = coach.getMessages as jest.MockedFunction<typeof coach.getMessages>;
const mockStreamText = ai.streamText as jest.MockedFunction<typeof ai.streamText>;
const mockCreateOpenRouter = provider.createOpenRouter as jest.MockedFunction<typeof provider.createOpenRouter>;
const mockExpoFetch = expoFetch as jest.MockedFunction<typeof expoFetch>;

function result(fullStream: AsyncIterable<unknown>, textStream: AsyncIterable<string> = deltasText()): ReturnType<typeof ai.streamText> {
  return { fullStream, textStream } as ReturnType<typeof ai.streamText>;
}

async function* deltas(...items: string[]) {
  for (const text of items) yield { type: "text-delta", text };
}

async function* deltasText(...items: string[]) {
  yield* items;
}

describe("coach agent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetModel.mockResolvedValue({ id: "provider/tool-model", name: "Tool model", contextLength: null, pricing: { prompt: "", completion: "" }, supportedParameters: ["tools"] });
    mockGetKey.mockResolvedValue("sk-or-v1-test-key");
    mockAppendMessage.mockResolvedValue({ id: "assistant-1", session_id: "session-1", role: "assistant", content: "done", tool_calls: null, error: null, created_at: 1 });
    mockGetMessages.mockResolvedValue([]);
    mockStreamText.mockReturnValue(result(deltas("done")));
  });

  it("rejects an unknown model before any inference fetch", async () => {
    mockGetModel.mockRejectedValue({ kind: "model_not_in_catalog" });

    await expect(runCoachAgent({
      sessionId: "session-1",
      modelId: "provider/unknown",
      prompt: "Hello",
    })).rejects.toEqual({ kind: "model_not_in_catalog" });

    expect(mockGetKey).not.toHaveBeenCalled();
    expect(mockCreateOpenRouter).not.toHaveBeenCalled();
    expect(mockExpoFetch).not.toHaveBeenCalled();
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it("does not persist partial text when aborted mid-stream", async () => {
    let signal: AbortSignal | undefined;
    mockStreamText.mockImplementation(((options: { abortSignal?: AbortSignal }) => {
      signal = options.abortSignal;
      return result((async function* () {
        yield { type: "text-delta", text: "partial" };
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        await new Promise<void>((resolve) => {
          const finish = () => resolve();
          if (signal?.aborted) return resolve();
          signal?.addEventListener("abort", finish, { once: true });
        });
        throw new DOMException("Aborted", "AbortError");
      })());
    // The mocked SDK callback only models the abort signal used by this test.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);

    const run = startCoachAgent({
      sessionId: "session-1",
      modelId: "provider/tool-model",
      prompt: "Hello",
    });
    await new Promise<void>((resolve) => {
      const wait = () => mockStreamText.mock.calls.length > 0 ? resolve() : queueMicrotask(wait);
      wait();
    });
    run.abort();

    await expect(run.done).rejects.toEqual({ kind: "aborted_by_user" });
    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it("rejects a completed stream with no text as an empty response", async () => {
    mockStreamText.mockReturnValue(result(deltas("  ", "\n"), deltasText("  ", "\n")));

    await expect(runCoachAgent({
      sessionId: "session-1",
      modelId: "provider/tool-model",
      prompt: "Hello",
    })).rejects.toEqual({ kind: "empty_response" });
    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it("maps a failed underlying request to a network error instead of an empty response", async () => {
    mockStreamText.mockReturnValue(result((async function* () {
      yield* [];
      throw new TypeError("Network request failed");
    })(), deltasText()));

    await expect(runCoachAgent({
      sessionId: "session-1",
      modelId: "provider/tool-model",
      prompt: "Hello",
    })).rejects.toEqual({ kind: "network_error" });
    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it("maps an in-band provider-unavailable stream error before transport fallback", async () => {
    mockStreamText.mockReturnValue(result((async function* () {
      yield {
        type: "error",
        error: {
          code: 502,
          message: "Service temporarily overloaded",
          metadata: { error_type: "provider_unavailable" },
        },
      };
    })()));

    await expect(runCoachAgent({
      sessionId: "session-1",
      modelId: "provider/tool-model",
      prompt: "Hello",
    })).rejects.toEqual({ kind: "upstream_provider_unavailable", status: 502 });
    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it("keeps a successful completion with no text as an empty response", async () => {
    mockStreamText.mockReturnValue(result((async function* () {
      yield { type: "finish", finishReason: "stop", totalUsage: {} };
    })(), deltasText("text-only stream must not be consumed")));

    await expect(runCoachAgent({
      sessionId: "session-1",
      modelId: "provider/tool-model",
      prompt: "Hello",
    })).rejects.toEqual({ kind: "empty_response" });
    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it("retries once without advertised tools when a model silently returns an empty tool response", async () => {
    const localTool = { description: "local" } as never;
    mockStreamText
      .mockReturnValueOnce(result((async function* () {
        yield { type: "finish-step", finishReason: "stop", usage: {} };
        yield { type: "finish", finishReason: "stop", totalUsage: {} };
      })()))
      .mockReturnValueOnce(result(deltas("Fallback answer")));

    const answer = await runCoachAgent({
      sessionId: "session-1",
      modelId: "stealth/ox-alpha",
      prompt: "How can I recover better?",
      tools: { recent_sessions: localTool },
    });

    expect(answer).toEqual(expect.objectContaining({ role: "assistant" }));
    expect(mockStreamText).toHaveBeenCalledTimes(2);
    expect(mockStreamText.mock.calls[0][0]).toEqual(expect.objectContaining({
      tools: { recent_sessions: localTool },
    }));
    expect(mockStreamText.mock.calls[1][0]).toEqual(expect.objectContaining({
      tools: {},
    }));
    expect(mockAppendMessage).toHaveBeenCalledTimes(1);
    expect(mockAppendMessage).toHaveBeenCalledWith(expect.objectContaining({
      content: "Fallback answer",
      model_id: "stealth/ox-alpha",
    }));
  });

  it("does not discard a real tool interaction to use the compatibility fallback", async () => {
    const localTool = { description: "local" } as never;
    mockStreamText.mockImplementationOnce(((options: { onChunk: (event: { chunk: unknown }) => Promise<void> }) => {
      void options.onChunk({ chunk: { type: "tool-call", toolName: "recent_sessions", input: {} } });
      return result((async function* () {
        yield { type: "tool-call", toolName: "recent_sessions", input: {} };
        yield { type: "finish", finishReason: "stop", totalUsage: {} };
      })());
    // The mocked SDK callback only models the tool event fields used by this test.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);

    await expect(runCoachAgent({
      sessionId: "session-1",
      modelId: "provider/tool-model",
      prompt: "Read my sessions",
      tools: { recent_sessions: localTool },
    })).rejects.toEqual({ kind: "empty_response" });

    expect(mockStreamText).toHaveBeenCalledTimes(1);
    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it("emits each tool event exactly once when fullStream also contains tool parts", async () => {
    mockStreamText.mockImplementation(((options: { onChunk: (event: { chunk: unknown }) => Promise<void> }) => {
      void options.onChunk({ chunk: { type: "tool-call", toolName: "record_probe", input: { marker: "ok" } } });
      return result((async function* () {
        yield { type: "tool-call", toolName: "record_probe", input: { marker: "ok" } };
        yield { type: "tool-result", toolName: "record_probe", output: { completed: true } };
        yield { type: "text-delta", text: "done" };
        await options.onChunk({ chunk: { type: "tool-result", toolName: "record_probe", output: { completed: true } } });
      })());
    // The mocked SDK callback only models the tool-step fields used by this test.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);

    const events: unknown[] = [];
    await runCoachAgent({
      sessionId: "session-1",
      modelId: "provider/tool-model",
      prompt: "Use the tool",
      onEvent: (event) => events.push(event),
    });

    expect(events).toEqual([
      { type: "tool-call", name: "record_probe", input: { marker: "ok" } },
      { type: "delta", text: "done" },
      { type: "tool-result", name: "record_probe", output: { completed: true } },
    ]);
  });

  it("passes a bounded history window and a model-independent system prompt", async () => {
    mockGetMessages.mockResolvedValue(Array.from({ length: 25 }, (_, index) => ({
      id: `message-${index}`, session_id: "session-1", role: index % 2 ? "assistant" : "user",
      content: `message-${index}`, tool_calls: null, error: null, created_at: index,
    })));
    await runCoachAgent({ sessionId: "session-1", modelId: "provider/tool-model", prompt: "latest" });
    const call = mockStreamText.mock.calls[0][0] as { messages: Array<{ content: unknown }>; system: string };
    expect(call.messages).toHaveLength(21);
    expect(call.messages[0].content).toEqual([{ type: "text", text: "message-5" }]);
    expect(call.messages.at(-1)?.content).toBe("latest");
    expect(call.system).toContain("fitness coach");
    expect(call.system).not.toContain("provider/tool-model");
  });

  it("converts persisted tool calls and results into AI SDK history messages", async () => {
    mockGetMessages.mockResolvedValue([{
      id: "message-1", session_id: "session-1", role: "assistant", content: "I checked.",
      tool_calls: JSON.stringify([{ toolCallId: "call-1", name: "exercise_history", input: { exercise: "bench" }, output: { trend: "up" } }]),
      error: null, created_at: 1,
    }]);
    await runCoachAgent({ sessionId: "session-1", modelId: "provider/tool-model", prompt: "What did you find?" });
    const call = mockStreamText.mock.calls[0][0] as { messages: Array<{ role: string; content: unknown }> };
    expect(call.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "assistant", content: expect.arrayContaining([expect.objectContaining({ type: "tool-call", toolCallId: "call-1" })]) }),
      expect.objectContaining({ role: "tool", content: [expect.objectContaining({ type: "tool-result", toolCallId: "call-1", output: { type: "json", value: { trend: "up" } } })] }),
    ]));
  });

  it("injects tools and completes a tool round-trip", async () => {
    const localTool = { description: "local" } as never;
    let releaseToolResult!: () => void;
    const toolResultReady = new Promise<void>((resolve) => { releaseToolResult = resolve; });
    mockStreamText.mockImplementation(((options: {
      tools: Record<string, unknown>;
      onChunk: (event: { chunk: unknown }) => Promise<void>;
    }) => {
      void options.onChunk({ chunk: { type: "tool-call", toolName: "record_probe", input: { marker: "ok" } } });
      return result((async function* () {
        yield { type: "tool-call", toolName: "record_probe", input: { marker: "ok" } };
        await toolResultReady;
        yield { type: "tool-result", toolName: "record_probe", output: { completed: true } };
        await options.onChunk({ chunk: { type: "tool-result", toolName: "record_probe", output: { completed: true } } });
        yield { type: "text-delta", text: "The tool completed." };
      })());
    // The mocked SDK callback only models the tool-step fields used by this test.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);

    const events: unknown[] = [];
    const run = runCoachAgent({
      sessionId: "session-1",
      modelId: "provider/tool-model",
      prompt: "Use the tool",
      tools: { record_probe: localTool },
      onEvent: (event) => events.push(event),
    });

    await new Promise<void>((resolve) => {
      const wait = () => mockStreamText.mock.calls.length > 0 ? resolve() : queueMicrotask(wait);
      wait();
    });
    expect(events).toEqual([
      { type: "tool-call", name: "record_probe", input: { marker: "ok" } },
    ]);
    releaseToolResult();
    await run;

    expect(mockStreamText).toHaveBeenCalledWith(expect.objectContaining({
      tools: { record_probe: localTool },
      toolChoice: "auto",
    }));
    expect(events).toEqual([
      { type: "tool-call", name: "record_probe", input: { marker: "ok" } },
      { type: "tool-result", name: "record_probe", output: { completed: true } },
      { type: "delta", text: "The tool completed." },
    ]);
    expect(mockAppendMessage).toHaveBeenCalledTimes(1);
    expect(mockAppendMessage).toHaveBeenCalledWith({
      session_id: "session-1",
      role: "assistant",
      content: "The tool completed.",
      model_id: "provider/tool-model",
      tool_calls: JSON.stringify([{ name: "record_probe", input: { marker: "ok" }, output: { completed: true } }]),
    });
  });
});
