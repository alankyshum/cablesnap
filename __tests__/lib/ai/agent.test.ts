jest.mock("ai", () => ({
  stepCountIs: jest.fn(() => jest.fn()),
  streamText: jest.fn(),
}));
jest.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: jest.fn(() => ({ chat: jest.fn((model: string) => model) })),
}));
jest.mock("expo/fetch", () => ({ fetch: jest.fn() }));
jest.mock("../../../lib/ai/catalog", () => ({
  getModel: jest.fn(),
  getCurrentGymPhotoModel: jest.fn(),
  canSendGymPhoto: jest.fn((model: { supportedParameters?: string[]; supportsImageInput?: boolean }) =>
    model.supportedParameters?.includes("tools") === true && model.supportsImageInput === true),
}));
jest.mock("../../../lib/ai/key-vault", () => ({ get: jest.fn() }));
jest.mock("../../../lib/db/coach", () => ({ appendMessage: jest.fn(), getMessages: jest.fn() }));

import { persistedMessagesToModelMessages, runCoachAgent, startCoachAgent } from "../../../lib/ai/agent";
import * as ai from "ai";
import * as provider from "@openrouter/ai-sdk-provider";
import { fetch as expoFetch } from "expo/fetch";
import * as catalog from "../../../lib/ai/catalog";
import * as keyVault from "../../../lib/ai/key-vault";
import * as coach from "../../../lib/db/coach";

const mockGetModel = catalog.getModel as jest.MockedFunction<typeof catalog.getModel>;
const mockGetCurrentGymPhotoModel = catalog.getCurrentGymPhotoModel as jest.MockedFunction<typeof catalog.getCurrentGymPhotoModel>;
const mockCanSendGymPhoto = catalog.canSendGymPhoto as jest.MockedFunction<typeof catalog.canSendGymPhoto>;
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
    mockGetCurrentGymPhotoModel.mockResolvedValue({ id: "provider/vision/tool-model", name: "Vision tools", contextLength: null, pricing: { prompt: "", completion: "" }, supportedParameters: ["tools"], inputModalities: ["text", "image"], supportsImageInput: true });
    mockCanSendGymPhoto.mockImplementation((model) => model.supportsImageInput === true && model.supportedParameters.includes("tools"));
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

  it("persists completed structured results when final text is empty", async () => {
    mockStreamText.mockReturnValue(result((async function* () {
      yield { type: "tool-call", toolCallId: "create-1", toolName: "create_gym_workout_draft", input: { equipment: [{ label: "dumbbell" }] } };
      yield { type: "tool-result", toolCallId: "create-1", toolName: "create_gym_workout_draft", input: { equipment: [{ label: "dumbbell" }] }, output: { ok: true, operation: "create_draft", data: { draftId: "draft-1" } } };
      yield { type: "finish", finishReason: "tool-calls", totalUsage: {} };
    })()));

    await runCoachAgent({ sessionId: "session-1", modelId: "provider/tool-model", prompt: "Build it" });
    expect(mockAppendMessage).toHaveBeenCalledWith({
      session_id: "session-1", role: "assistant", content: "", model_id: "provider/tool-model",
      tool_calls: JSON.stringify([{ toolCallId: "create-1", name: "create_gym_workout_draft", input: { equipment: [{ label: "dumbbell" }] }, output: { ok: true, operation: "create_draft", data: { draftId: "draft-1" } } }]),
    });
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
    mockStreamText.mockImplementationOnce((() => {
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
    mockStreamText.mockImplementation((() => {
      return result((async function* () {
        yield { type: "tool-call", toolCallId: "probe-1", toolName: "record_probe", input: { marker: "ok" } };
        yield { type: "tool-result", toolCallId: "probe-1", toolName: "record_probe", input: { marker: "ok" }, output: { completed: true } };
        yield { type: "text-delta", text: "done" };
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
      { type: "tool-call", toolCallId: "probe-1", name: "record_probe", input: { marker: "ok" } },
      { type: "tool-result", toolCallId: "probe-1", name: "record_probe", input: { marker: "ok" }, output: { completed: true } },
      { type: "delta", text: "done" },
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
    mockStreamText.mockImplementation((() => {
      return result((async function* () {
        yield { type: "tool-call", toolCallId: "probe-1", toolName: "record_probe", input: { marker: "ok" } };
        await toolResultReady;
        yield { type: "tool-result", toolCallId: "probe-1", toolName: "record_probe", input: { marker: "ok" }, output: { completed: true } };
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
    expect(events).toEqual([]);
    releaseToolResult();
    await run;

    expect(mockStreamText).toHaveBeenCalledWith(expect.objectContaining({
      tools: { record_probe: localTool },
      toolChoice: "auto",
    }));
    expect(events).toEqual([
      { type: "tool-call", toolCallId: "probe-1", name: "record_probe", input: { marker: "ok" } },
      { type: "tool-result", toolCallId: "probe-1", name: "record_probe", input: { marker: "ok" }, output: { completed: true } },
      { type: "delta", text: "The tool completed." },
    ]);
    expect(mockAppendMessage).toHaveBeenCalledTimes(1);
    expect(mockAppendMessage).toHaveBeenCalledWith({
      session_id: "session-1",
      role: "assistant",
      content: "The tool completed.",
      model_id: "provider/tool-model",
      tool_calls: JSON.stringify([{ toolCallId: "probe-1", name: "record_probe", input: { marker: "ok" }, output: { completed: true } }]),
    });
  });

  it("persists and replays a multi-step gym detection/create tool loop", async () => {
    const events: unknown[] = [];
    mockStreamText.mockImplementation((() => {
      return result((async function* () {
        yield { type: "tool-call", toolCallId: "detect-1", toolName: "detect_gym_equipment", input: { equipment: [{ label: "dumbbell", confidence: 0.9 }] } };
        yield { type: "tool-result", toolCallId: "detect-1", toolName: "detect_gym_equipment", input: { equipment: [{ label: "dumbbell", confidence: 0.9 }] }, output: { ok: true, operation: "detect_equipment", data: { equipment: [{ label: "dumbbell", confidence: 0.9 }] } } };
        yield { type: "tool-call", toolCallId: "create-1", toolName: "create_gym_workout_draft", input: { coachSessionId: "session-1", equipment: [{ label: "dumbbell", confidence: 0.9 }] } };
        yield { type: "tool-result", toolCallId: "create-1", toolName: "create_gym_workout_draft", input: { coachSessionId: "session-1", equipment: [{ label: "dumbbell", confidence: 0.9 }] }, output: { ok: true, operation: "create_draft", data: { draftId: "draft-1", revision: 1, equipment: [{ label: "dumbbell", confidence: 0.9 }], draft: {}, reasons: [{ code: "duration.fallback" }] } } };
        yield { type: "text-delta", text: "Draft saved." };
      })());
    // The mocked SDK callback only models the tool-step fields used by this test.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);

    await runCoachAgent({
      sessionId: "session-1",
      modelId: "provider/tool-model",
      prompt: "Build a workout from this gym photo",
      tools: { detect_gym_equipment: { description: "detect" } as never, create_gym_workout_draft: { description: "create" } as never },
      onEvent: (event) => events.push(event),
    });

    expect(events).toEqual(expect.arrayContaining([
      { type: "tool-call", toolCallId: "detect-1", name: "detect_gym_equipment", input: expect.any(Object) },
      { type: "tool-result", toolCallId: "detect-1", name: "detect_gym_equipment", input: expect.any(Object), output: expect.objectContaining({ ok: true }) },
      { type: "tool-call", toolCallId: "create-1", name: "create_gym_workout_draft", input: expect.any(Object) },
      { type: "tool-result", toolCallId: "create-1", name: "create_gym_workout_draft", input: expect.any(Object), output: expect.objectContaining({ ok: true }) },
    ]));
    expect(mockAppendMessage).toHaveBeenCalledWith(expect.objectContaining({
      tool_calls: expect.stringContaining("create_gym_workout_draft"),
    }));

    mockGetMessages.mockResolvedValue([{
      id: "assistant-1", session_id: "session-1", role: "assistant", content: "Draft saved.",
      tool_calls: JSON.stringify([{ name: "create_gym_workout_draft", input: { coachSessionId: "session-1" }, output: { ok: true, operation: "create_draft", data: { draftId: "draft-1", revision: 1, equipment: [{ label: "dumbbell", confidence: 0.9 }], draft: {}, reasons: [{ code: "duration.fallback" }] } } }]),
      error: null, created_at: 1,
    }]);
    const replay = persistedMessagesToModelMessages(await mockGetMessages("session-1"));
    expect(JSON.stringify(replay)).toContain("create_gym_workout_draft");
    expect(JSON.stringify(replay)).toContain("duration.fallback");
  });

  it("sends one current-request text and image part, persists no image data, and never retries without tools", async () => {
    mockGetModel.mockResolvedValue({
      id: "vision/tool-model", name: "Vision tools", contextLength: null,
      pricing: { prompt: "", completion: "" }, supportedParameters: ["tools"],
      inputModalities: ["text", "image"], supportsImageInput: true,
    });
    mockStreamText.mockReturnValue(result((async function* () {
      yield { type: "finish", finishReason: "stop", totalUsage: {} };
    })()));

    const photo = {
      uri: "file:///private/gym.jpg",
      bytes: new Uint8Array([1, 2, 3]),
      mediaType: "image/jpeg" as const,
      width: 100,
      height: 100,
      delete: jest.fn(),
    };
    await expect(runCoachAgent({
      sessionId: "session-1", modelId: photo.mediaType ? "vision/tool-model" : "vision/tool-model",
      prompt: "Identify equipment", gymPhoto: photo, tools: { record_probe: { description: "local" } as never },
    })).rejects.toEqual({ kind: "empty_response" });

    const request = mockStreamText.mock.calls[0][0] as { messages: Array<{ content: unknown }> };
    expect(request.messages.at(-1)?.content).toEqual([
      { type: "text", text: "[Gym photo uploaded]\nIdentify equipment" },
      { type: "image", image: photo.bytes, mediaType: "image/jpeg" },
    ]);
    expect(mockStreamText).toHaveBeenCalledTimes(1);
    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it("rejects a photo before key/provider construction when live capability is absent", async () => {
    mockGetModel.mockResolvedValue({
      id: "text/tool-model", name: "Text tools", contextLength: null,
      pricing: { prompt: "", completion: "" }, supportedParameters: ["tools"],
      inputModalities: ["text"], supportsImageInput: false,
    });
    mockGetCurrentGymPhotoModel.mockResolvedValue({
      id: "text/tool-model", name: "Text tools", contextLength: null,
      pricing: { prompt: "", completion: "" }, supportedParameters: ["tools"],
      inputModalities: ["text"], supportsImageInput: false,
    });
    await expect(runCoachAgent({
      sessionId: "session-1", modelId: "text/tool-model", prompt: "Identify equipment",
      gymPhoto: { uri: "file:///private/gym.jpg", bytes: new Uint8Array([1]), mediaType: "image/jpeg", width: 1, height: 1, delete: jest.fn() },
    })).rejects.toEqual({ kind: "model_lacks_image_input" });
    expect(mockGetKey).not.toHaveBeenCalled();
    expect(mockCreateOpenRouter).not.toHaveBeenCalled();
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it("does not add a gym marker or image part to ordinary text turns", async () => {
    await runCoachAgent({ sessionId: "session-1", modelId: "provider/tool-model", prompt: "What should I do today?" });
    const request = mockStreamText.mock.calls[0][0] as { messages: Array<{ content: unknown }> };
    const current = request.messages.at(-1)?.content;
    expect(current).toBe("What should I do today?");
    expect(JSON.stringify(current)).not.toContain("Gym photo uploaded");
    expect(JSON.stringify(current)).not.toContain("image");
  });

  it("persists only the neutral marker for a successful photo turn", async () => {
    mockGetCurrentGymPhotoModel.mockResolvedValue({
      id: "vision/tool-model", name: "Vision tools", contextLength: null,
      pricing: { prompt: "", completion: "" }, supportedParameters: ["tools"], supportsImageInput: true,
    });
    mockStreamText.mockReturnValue(result(deltas("detected")));
    await runCoachAgent({
      sessionId: "session-1", modelId: "vision/tool-model", prompt: "Identify equipment",
      gymPhoto: { uri: "file:///private/original.jpg", bytes: new Uint8Array([9, 8]), mediaType: "image/jpeg", width: 100, height: 100, delete: jest.fn() },
    });
    expect(mockAppendMessage).toHaveBeenCalledWith(expect.objectContaining({
      content: "detected",
    }));
    expect(JSON.stringify(mockAppendMessage.mock.calls[0][0])).not.toContain("file:///private");
    expect(JSON.stringify(mockAppendMessage.mock.calls[0][0])).not.toContain("base64");
  });
});
