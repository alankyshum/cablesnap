/**
 * Opt-in, real-network OpenRouter tests. Run with:
 *   OPENROUTER_TEST_API_KEY=... npm run test:ai:live
 *
 * The credential is read only by the key-vault mock and is never included in
 * output, assertions, fixtures, or snapshots. The suite is skipped without it.
 * Empty/network/server failures are intentionally left to the deterministic
 * mocked suite: manufacturing those responses here would not test the real API.
 * Observed live behavior: OpenRouter 401/User not found -> invalid_key;
 * typed provider-unavailable 502/503 envelopes -> upstream_provider_unavailable.
 */
import type { CoachMessage } from "../../lib/db/coach";

// jest-expo installs Expo's stream polyfill, while the Node fetch response and
// AI SDK use Node's web-stream implementation. Align the constructors before
// importing the provider so pipeThrough does not reject a cross-realm stream.
const nodeStreams = require("node:stream/web") as typeof import("node:stream/web");
Object.assign(globalThis, {
  ReadableStream: nodeStreams.ReadableStream,
  WritableStream: nodeStreams.WritableStream,
  TransformStream: nodeStreams.TransformStream,
});

jest.mock("../../lib/ai/key-vault", () => ({
  get: jest.fn(async () => process.env.OPENROUTER_TEST_API_KEY ?? null),
}));

// expo/fetch cannot load its native response class in the Jest Node runtime.
// This is not a network mock: it is the real undici fetch used by Node, exposed
// through the production module's fetch-shaped seam.
jest.mock("expo/fetch", () => ({ fetch: global.fetch }));

// Keep persistence deterministic and local while the inference transport is live.
// This also makes the abort assertion verify the agent's sole-write invariant.
const mockMessages = new Map<string, CoachMessage[]>();
jest.mock("../../lib/db/coach", () => ({
  getMessages: jest.fn(async (sessionId: string) => mockMessages.get(sessionId) ?? []),
  appendMessage: jest.fn(async (input: Pick<CoachMessage, "session_id" | "role" | "content"> & Partial<Pick<CoachMessage, "tool_calls" | "error">>) => {
    const message = { id: `live-${Date.now()}-${Math.random()}`, ...input, tool_calls: input.tool_calls ?? null, error: input.error ?? null, created_at: Date.now() } as CoachMessage;
    mockMessages.set(input.session_id, [...(mockMessages.get(input.session_id) ?? []), message]);
    return message;
  }),
}));

import { coachTools } from "../../lib/ai/tools";
import { runCoachAgent, startCoachAgent } from "../../lib/ai/agent";
import { invalidateModelCatalog } from "../../lib/ai/catalog";

const PRIMARY_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";
const BACKUP_MODELS = ["nvidia/nemotron-3.5-lightning:free", "google/gemma-4-26b-a4b-it:free"];
const OX_ALPHA_MODEL = "stealth/ox-alpha";
const NO_TOOLS_MODEL = "google/lyria-3-clip-preview";
const WRONG_KEY = `sk-or-v1-${"0".repeat(64)}`;
const live = Boolean(process.env.OPENROUTER_TEST_API_KEY);

function errorKind(error: unknown): string {
  return error && typeof error === "object" && "kind" in error
    ? String((error as { kind: unknown }).kind)
    : "untyped_error";
}

function session(name: string): string {
  return `openrouter-live-${name}-${Date.now()}`;
}

function retryableLiveFailure(error: unknown): boolean {
  return ["upstream_provider_unavailable", "server_error", "network_error"].includes(errorKind(error));
}

async function runWithFreeModelFallback<T>(run: (modelId: string) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (const model of [PRIMARY_MODEL, ...BACKUP_MODELS]) {
    try {
      return await run(model);
    } catch (error) {
      lastError = error;
      if (!retryableLiveFailure(error)) throw error;
      console.warn(`OpenRouter live: ${model} unavailable (${errorKind(error)}); trying the next verified free model.`);
    }
  }
  throw lastError;
}

const describeLive = live ? describe : describe.skip;
describeLive(live ? "OpenRouter live integration suite" : "OpenRouter live integration suite (skipped: no OPENROUTER_TEST_API_KEY)", () => {
  beforeEach(() => {
    mockMessages.clear();
    invalidateModelCatalog();
  });

  it("streams incremental deltas and persists one final assistant message", async () => {
    const startedAt = Date.now();
    const events: Array<{ type: string; text?: string; atMs: number }> = [];
    const id = session("stream");
    const result = await runWithFreeModelFallback((modelId) => runCoachAgent({
      sessionId: id,
      modelId,
      prompt: "Reply with exactly three very short sentences: name a warmup, name a lift, and name a cooldown.",
      onEvent: (event) => events.push({
        ...(event.type === "delta" ? event : { type: event.type }),
        atMs: Date.now() - startedAt,
      }),
    }));

    const deltas = events.filter((event) => event.type === "delta").map((event) => event.text ?? "");
    expect(deltas.length).toBeGreaterThan(1);
    expect(deltas.join("").trim()).not.toBe("");
    expect(result.role).toBe("assistant");
    expect(result.content.trim()).not.toBe("");
    expect(mockMessages.get(id)).toEqual([expect.objectContaining({ role: "assistant", content: result.content })]);
    const deltaTimes = events.filter((event) => event.type === "delta").map((event) => event.atMs);
    console.info(`OpenRouter live incremental delta timings (ms): ${deltaTimes.join(", ")}`);
    expect(new Set(deltaTimes).size).toBeGreaterThan(1);
  });

  it("recovers when Ox Alpha silently returns an empty tool-advertised completion", async () => {
    const events: Array<{ type: string; text?: string }> = [];
    const id = session("ox-alpha-tools");
    const result = await runCoachAgent({
      sessionId: id,
      modelId: OX_ALPHA_MODEL,
      prompt: "Give one concise, general recovery tip without reading my local records.",
      tools: coachTools,
      onEvent: (event) => events.push(event),
    });

    expect(events.filter((event) => event.type === "delta").map((event) => event.text ?? "").join("").trim())
      .not.toBe("");
    expect(result.content.trim()).not.toBe("");
    expect(mockMessages.get(id)).toEqual([
      expect.objectContaining({ role: "assistant", content: result.content, model_id: OX_ALPHA_MODEL }),
    ]);
  });

  it("aborts after the first delta and does not persist partial assistant text", async () => {
    const id = session("abort");
    let firstDelta!: () => void;
    const first = new Promise<void>((resolve) => { firstDelta = resolve; });
    const run = startCoachAgent({
      sessionId: id,
      // The backup is used here to reduce the chance that provider overload
      // prevents reaching the mid-stream abort point.
      modelId: BACKUP_MODELS[0],
      prompt: "Write a detailed, multi-paragraph explanation of progressive overload and include several examples.",
      onEvent: (event) => { if (event.type === "delta") firstDelta(); },
    });
    await first;
    run.abort();

    await expect(run.done).rejects.toMatchObject({ kind: "aborted_by_user" });
    expect(mockMessages.get(id) ?? []).toHaveLength(0);
  });

  // These probes intentionally cannot fail when model behavior is nondeterministic.
  it("probe: observes tool event shapes when the free model elects to call a local tool", async () => {
    const events: Array<{ type: string; name?: string; input?: unknown; output?: unknown }> = [];
    await runWithFreeModelFallback((modelId) => runCoachAgent({
      sessionId: session("tools"),
      modelId,
      prompt: "Use the recent_sessions tool, then briefly summarize my most recent completed workout. Do not guess if there is no data.",
      tools: coachTools,
      onEvent: (event) => events.push(event),
    }));
    const toolCalls = events.filter((event) => event.type === "tool-call");
    const toolResults = events.filter((event) => event.type === "tool-result");
    if (toolCalls.length === 0) {
      // Free model tool selection is nondeterministic; retain this as a smoke
      // test and make the known provider limitation visible in CI logs.
      console.warn("OpenRouter live tool smoke test: model did not select a tool; tolerated for free-tier model variability.");
      return;
    }
    expect(toolCalls).toEqual(expect.arrayContaining([expect.objectContaining({ name: expect.any(String), input: expect.anything() })]));
    expect(toolResults).toEqual(expect.arrayContaining([expect.objectContaining({ name: expect.any(String) })]));
  });

  it("maps a syntactically valid wrong key to invalid_key", async () => {
    const keyVault = jest.requireMock("../../lib/ai/key-vault") as { get: jest.Mock };
    keyVault.get.mockResolvedValueOnce(WRONG_KEY);
    await expect(runCoachAgent({ sessionId: session("invalid-key"), modelId: PRIMARY_MODEL, prompt: "Say hello." }))
      .rejects.toMatchObject({ kind: "invalid_key" });
  });

  it("maps an unknown model before inference", async () => {
    const unknown = "openrouter/definitely-not-a-real-model-for-live-tests";
    try {
      await runCoachAgent({ sessionId: session("unknown-model"), modelId: unknown, prompt: "Say hello." });
      throw new Error("unknown model unexpectedly completed");
    } catch (error) {
      expect(["model_not_in_catalog", "catalog_unavailable"]).toContain(errorKind(error));
    }
  });

  // These probes intentionally cannot fail when model behavior is nondeterministic.
  it("documents: real no-tools model behavior", async () => {
    try {
      await runCoachAgent({ sessionId: session("no-tools"), modelId: NO_TOOLS_MODEL, prompt: "Say hello." });
      throw new Error("no-tools model unexpectedly completed");
    } catch (error) {
      const kind = errorKind(error);
      // Catalog gating is the expected behavior; retain the observed API
      // fallback in the accepted set because catalog contents can change.
      expect(["model_lacks_tools", "model_not_in_catalog", "upstream_provider_unavailable", "server_error"]).toContain(kind);
    }
  });
});
