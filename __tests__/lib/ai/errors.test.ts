import { redactSentryBreadcrumb } from "../../../lib/ai/redact";
import {
  parseOpenRouterError,
  toChatErrorState,
  type AIError,
} from "../../../lib/ai/errors";

const errors: AIError[] = [
  { kind: "missing_key" },
  { kind: "invalid_key", status: 401 },
  { kind: "insufficient_credits", status: 402 },
  { kind: "rate_limited", status: 429 },
  { kind: "upstream_provider_unavailable", status: 429 },
  { kind: "model_not_in_catalog" },
  { kind: "model_lacks_tools" },
  { kind: "catalog_unavailable" },
  { kind: "stale_catalog_warning" },
  { kind: "network_error" },
  { kind: "forbidden", status: 403 },
  { kind: "server_error", status: 500 },
  { kind: "aborted_by_user" },
  { kind: "step_limit_reached" },
];

describe("AI error taxonomy", () => {
  it("maps every union member to a chat state", () => {
    expect(errors.map((error) => toChatErrorState(error))).toHaveLength(errors.length);
    expect(toChatErrorState({ kind: "insufficient_credits", status: 402 })).toEqual(
      expect.objectContaining({
        message: expect.stringContaining("Key-scoped usage"),
        recovery: expect.objectContaining({
          kind: "add_credits",
          href: "https://openrouter.ai/credits",
        }),
      })
    );
    expect(toChatErrorState({ kind: "rate_limited", status: 429 }).message).toEqual(
      expect.stringContaining("20 rpm, 50/day under $10 purchased, or 1000/day at $10+")
    );
    expect(toChatErrorState({ kind: "model_not_in_catalog" }).recovery.kind).toBe(
      "pick_another_model"
    );
    expect(toChatErrorState({ kind: "model_lacks_tools" }).recovery.kind).toBe(
      "pick_another_model"
    );
    expect(toChatErrorState({ kind: "missing_key" }).recovery.href).toBe("settings/ai-key");
    expect(toChatErrorState({ kind: "invalid_key", status: 401 }).recovery.href).toBe(
      "settings/ai-key"
    );
  });

  it("keeps the wire envelope and credentials out of typed errors", () => {
    const sentinel = `sk-or-v1-${"b".repeat(64)}`;
    const error = parseOpenRouterError(402, {
      error: { message: `Bearer ${sentinel}`, headers: { Authorization: sentinel } },
    });
    const serialized = JSON.stringify(redactSentryBreadcrumb({ data: { error } }));
    expect(serialized).not.toContain(sentinel);
    expect(serialized).not.toContain("authorization");
    expect(error).toEqual({ kind: "insufficient_credits", status: 402 });
  });

  it("maps step-limit errors to retry-only copy", () => {
    expect(toChatErrorState({ kind: "step_limit_reached" })).toEqual({
      message: "The coach reached its data-checking limit before writing an answer. Retry the question.",
      recovery: { kind: "retry_step_limit", label: "Retry" },
    });
    expect(toChatErrorState({ kind: "step_limit_reached" }).message).not.toContain("another model");
  });

  it("keeps HTTP status parsing at one seam", () => {
    expect(parseOpenRouterError(401, { anything: true })).toEqual({
      kind: "invalid_key",
      status: 401,
    });
    expect(parseOpenRouterError(429, { anything: true })).toEqual({
      kind: "rate_limited",
      status: 429,
    });
    expect(parseOpenRouterError(403, null)).toEqual({ kind: "forbidden", status: 403 });
    expect(parseOpenRouterError(500, null)).toEqual({ kind: "server_error", status: 500 });
  });

  it("extracts the captured rate-limit reset and source", () => {
    expect(parseOpenRouterError(429, {
      error: {
        message: "Rate limit exceeded: free-models-per-min. ",
        code: 429,
        metadata: {
          headers: {
            "X-RateLimit-Limit": "20",
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": "1787042700000",
          },
          limit_source: "openrouter_free_tier_per_minute",
          remedy_hint: "Slow down requests to free models, or retry after the per-minute window resets.",
        },
      },
    })).toEqual({
      kind: "rate_limited",
      status: 429,
      resetAt: 1787042700000,
      limitSource: "openrouter_free_tier_per_minute",
    });
  });

  it("tolerates rate-limit fields being absent", () => {
    expect(parseOpenRouterError(429, { error: { message: "Rate limited" } })).toEqual({
      kind: "rate_limited",
      status: 429,
    });
  });

  it("distinguishes free-tier and upstream-provider 429 envelopes", () => {
    const upstream = parseOpenRouterError(429, {
      error: { message: "Provider returned error", code: 429, metadata: {
        limit_source: "upstream_provider_shared_pool",
        provider_name: "Chutes",
      } },
    });
    expect(upstream).toEqual({
      kind: "upstream_provider_unavailable",
      status: 429,
      providerName: "Chutes",
    });
    expect(toChatErrorState(upstream)).toEqual(expect.objectContaining({
      message: "The selected model's upstream provider is unavailable.",
      recovery: expect.objectContaining({ kind: "pick_another_model", label: "Open model picker" }),
    }));
    expect(toChatErrorState({ kind: "rate_limited", status: 429 }).message).not.toContain("upstream provider");
  });

  it.each([
    [502, "provider_unavailable"],
    [503, "provider_overloaded"],
  ] as const)("maps %i provider envelopes before the generic 5xx fallback", (status, errorType) => {
    expect(parseOpenRouterError(status, {
      error: {
        code: status,
        message: "Provider unavailable",
        metadata: { error_type: errorType, provider_name: "Chutes" },
      },
    })).toEqual({
      kind: "upstream_provider_unavailable",
      status,
      providerName: "Chutes",
    });
  });

  it("keeps a plain OpenRouter 5xx as a server error", () => {
    expect(parseOpenRouterError(500, {
      error: { code: 500, message: "Internal server error" },
    })).toEqual({ kind: "server_error", status: 500 });
  });

  it("keeps a transport failure with no HTTP status as a network error", () => {
    expect(parseOpenRouterError(undefined, new TypeError("Network request failed")))
      .toEqual({ kind: "network_error" });
  });

  it("does not treat an untyped 502 as an upstream provider failure", () => {
    expect(parseOpenRouterError(502, {
      error: { code: 502, message: "Bad gateway" },
    })).toEqual({ kind: "server_error", status: 502 });
  });

  it("renders parsed retry-at guidance", () => {
    const error = parseOpenRouterError(429, {
      error: {
        metadata: {
          headers: { "X-RateLimit-Reset": "1787042700000" },
          limit_source: "openrouter_free_tier_per_minute",
        },
      },
    });
    const state = toChatErrorState(error);
    expect(state.message).toContain("openrouter_free_tier_per_minute");
    expect(state.message).toContain(new Date(1787042700000).toLocaleString());
  });
});
