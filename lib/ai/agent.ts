import { streamText, stepCountIs } from "ai";
import type { JSONValue, ModelMessage, Tool } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { fetch as expoFetch } from "expo/fetch";

import { getModel } from "./catalog";
import { parseOpenRouterError, type AIError } from "./errors";
import * as keyVault from "./key-vault";
import { appendMessage, getMessages, type CoachMessage } from "../db/coach";

const OPENROUTER_API = "https://openrouter.ai/api/v1";
export const MAX_HISTORY_MESSAGES = 20;
export const COACH_SYSTEM_PROMPT = "You are a practical, supportive fitness coach. Use the available local-data tools when a question depends on workout or nutrition history; never invent data. Give safe, actionable guidance, acknowledge uncertainty, and do not diagnose medical conditions. This is a BYOK app with no server relay; only allowlisted aggregate fitness fields are available through tools.";

/** The only seam T12 needs: add a named AI SDK tool to this object. */
// AI SDK tool inputs and outputs are intentionally heterogeneous in this registry.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CoachTools = Record<string, Tool<any, any>>;

export type CoachAgentEvent =
  | { readonly type: "delta"; readonly text: string }
  | { readonly type: "tool-call"; readonly name: string; readonly input: unknown }
  | { readonly type: "tool-result"; readonly name: string; readonly output: unknown };

export type CoachAgentOptions = {
  readonly sessionId: string;
  readonly modelId: string;
  readonly prompt: string;
  readonly tools?: CoachTools;
  readonly signal?: AbortSignal;
  readonly onEvent?: (event: CoachAgentEvent) => void;
};

export type CoachAgentRun = {
  readonly done: Promise<CoachMessage>;
  readonly abort: () => void;
};

type PersistedToolCall = {
  name?: unknown;
  input?: unknown;
  output?: unknown;
  toolCallId?: unknown;
};

function parsePersistedToolCalls(value: string | null): PersistedToolCall[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((call): call is PersistedToolCall => call !== null && typeof call === "object") : [];
  } catch {
    return [];
  }
}

function asJsonValue(value: unknown): JSONValue {
  if (value === undefined) return "";
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? String(value) : JSON.parse(serialized) as JSONValue;
  } catch {
    return String(value);
  }
}

export function persistedMessagesToModelMessages(persisted: CoachMessage[]): ModelMessage[] {
  return persisted.slice(-MAX_HISTORY_MESSAGES).flatMap<ModelMessage>((message) => {
    if (message.error) return [];
    if (message.role === "user") return [{ role: "user", content: message.content }];

    const calls = parsePersistedToolCalls(message.tool_calls);
    if (message.role === "tool") {
      const content = calls.flatMap((call) => {
        if (typeof call.name !== "string" || !("output" in call)) return [];
        const toolCallId = typeof call.toolCallId === "string" ? call.toolCallId : `persisted-${call.name}`;
        return [{ type: "tool-result" as const, toolCallId, toolName: call.name, output: { type: "json" as const, value: asJsonValue(call.output) } }];
      });
      return content.length > 0 ? [{ role: "tool", content }] : [];
    }
    if (message.role !== "assistant") return [];

    const content: Array<{ type: "text"; text: string } | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown }> = [];
    const results: ModelMessage[] = [];
    if (message.content) content.push({ type: "text", text: message.content });
    for (const call of calls) if (typeof call.name === "string") {
      const toolCallId = typeof call.toolCallId === "string" ? call.toolCallId : `persisted-${call.name}`;
      content.push({ type: "tool-call", toolCallId, toolName: call.name, input: call.input });
      if ("output" in call) results.push({
        role: "tool",
        content: [{ type: "tool-result", toolCallId, toolName: call.name, output: { type: "json", value: asJsonValue(call.output) } }],
      });
    }
    return [{ role: "assistant", content: content.length > 0 ? content : message.content }, ...results];
  });
}

// The SDK exposes distinct pre-response and in-band stream error shapes.
// eslint-disable-next-line complexity
function asAIError(error: unknown): AIError {
  if (error && typeof error === "object" && "kind" in error) return error as AIError;
  const statusCode = error && typeof error === "object" && "statusCode" in error
    ? (error as { statusCode?: unknown }).statusCode
    : undefined;
  // Pre-response API failures use APICallError.statusCode/responseBody. Once a
  // stream has started, the AI SDK instead surfaces OpenRouter's in-band error
  // object directly ({ code, message, metadata }). Preserve both wire shapes.
  const inBandCode = error && typeof error === "object" && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
  const status = typeof statusCode === "number" && statusCode >= 400 && statusCode <= 599
    ? statusCode
    : typeof inBandCode === "number" && inBandCode >= 400 && inBandCode <= 599 ? inBandCode : undefined;
  const body = error && typeof error === "object" && "responseBody" in error
    ? (error as { responseBody?: unknown }).responseBody
    : undefined;
  let envelope: unknown = body ?? (typeof inBandCode === "number" ? { error } : undefined);
  if (typeof body === "string") {
    try { envelope = JSON.parse(body); } catch { envelope = undefined; }
  }
  return parseOpenRouterError(status, envelope);
}

// eslint-disable-next-line complexity
async function executeCoachAgent(options: CoachAgentOptions, controller?: AbortController): Promise<CoachMessage> {
  const { sessionId, modelId, prompt, tools = {}, onEvent } = options;

  // Resolve before reading the key or constructing a provider: no inference request
  // can occur for a missing, unknown, or tool-incompatible model.
  await getModel(modelId);
  const persisted = await getMessages(sessionId);
  const history = persistedMessagesToModelMessages(persisted);
  const apiKey = await keyVault.get();
  if (!apiKey) throw { kind: "missing_key" } satisfies AIError;
  const signal = controller?.signal ?? options.signal;
  const toolCalls: Array<{ name: string; input: unknown; output?: unknown }> = [];

  const openrouter = createOpenRouter({
    apiKey,
    baseURL: OPENROUTER_API,
    compatibility: "strict",
    fetch: expoFetch,
  });
  const result = streamText({
    model: openrouter.chat(modelId),
    system: COACH_SYSTEM_PROMPT,
    messages: [...history, { role: "user", content: prompt }],
    tools,
    toolChoice: "auto",
    stopWhen: stepCountIs(3),
    abortSignal: signal,
    maxRetries: 0,
    onChunk: async ({ chunk }) => {
      if (chunk.type === "tool-call") {
        toolCalls.push({ name: chunk.toolName, input: chunk.input });
        onEvent?.({ type: "tool-call", name: chunk.toolName, input: chunk.input });
      } else if (chunk.type === "tool-result") {
        const call = toolCalls.find((item) => item.name === chunk.toolName && item.output === undefined);
        if (call) call.output = chunk.output;
        onEvent?.({ type: "tool-result", name: chunk.toolName, output: chunk.output });
      }
    },
  });

  let text = "";
  try {
    for await (const part of result.fullStream) {
      if (part.type === "error") throw asAIError(part.error);
      if (part.type === "text-delta") {
        text += part.text;
        if (part.text) onEvent?.({ type: "delta", text: part.text });
      }
    }
  } catch (error) {
    if (signal?.aborted) throw { kind: "aborted_by_user" } satisfies AIError;
    throw asAIError(error);
  }
  if (signal?.aborted) throw { kind: "aborted_by_user" } satisfies AIError;
  if (text.trim() === "") throw { kind: "empty_response" } satisfies AIError;

  // This is deliberately the sole assistant write, after the stream is complete.
  return appendMessage({ session_id: sessionId, role: "assistant", content: text, ...(toolCalls.length > 0 ? { tool_calls: JSON.stringify(toolCalls) } : {}) });
}

export function startCoachAgent(options: CoachAgentOptions): CoachAgentRun {
  const controller = new AbortController();
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  const done = executeCoachAgent(options, controller);
  return { done, abort: () => controller.abort() };
}

export function runCoachAgent(options: CoachAgentOptions): Promise<CoachMessage> {
  return executeCoachAgent(options);
}
