/** Errors that may cross the AI/catalog/agent boundary. Never add credentials or headers here. */
export type AIError =
  | MissingKeyError
  | InvalidKeyError
  | InsufficientCreditsError
  | RateLimitedError
  | UpstreamProviderUnavailableError
  | ModelNotInCatalogError
  | ModelLacksToolsError
  | CatalogUnavailableError
  | StaleCatalogWarning
  | NetworkError
  | ForbiddenError
  | ServerError
  | AbortedByUser
  | EmptyResponseError
  | StepLimitReachedError;

export type MissingKeyError = { readonly kind: "missing_key" };
export type InvalidKeyError = { readonly kind: "invalid_key"; readonly status: 401 };
export type InsufficientCreditsError = {
  readonly kind: "insufficient_credits";
  readonly status: 402;
};
export type RateLimitedError = {
  readonly kind: "rate_limited";
  readonly status: 429;
  readonly resetAt?: number;
  readonly limitSource?: string;
};
export type UpstreamProviderUnavailableError = {
  readonly kind: "upstream_provider_unavailable";
  readonly status: 429;
  readonly providerName?: string;
};
export type ModelNotInCatalogError = { readonly kind: "model_not_in_catalog" };
export type ModelLacksToolsError = { readonly kind: "model_lacks_tools" };
export type CatalogUnavailableError = { readonly kind: "catalog_unavailable" };
export type StaleCatalogWarning = { readonly kind: "stale_catalog_warning" };
export type NetworkError = { readonly kind: "network_error" };
export type ForbiddenError = { readonly kind: "forbidden"; readonly status: 403 };
export type ServerError = { readonly kind: "server_error"; readonly status: number };
export type AbortedByUser = { readonly kind: "aborted_by_user" };
export type EmptyResponseError = { readonly kind: "empty_response" };
export type StepLimitReachedError = { readonly kind: "step_limit_reached" };

/**
 * The sole OpenRouter wire-format seam. T1 can replace this status/envelope mapping
 * when the real 402/429 response envelopes are captured, without changing consumers.
 */
// This is a wire-format boundary; the explicit status mapping keeps provider errors typed.
// eslint-disable-next-line complexity
export function parseOpenRouterError(status: number, envelope: unknown): AIError {
  switch (status) {
    case 401:
      return { kind: "invalid_key", status: 401 };
    case 402:
      return { kind: "insufficient_credits", status: 402 };
    case 403:
      return { kind: "forbidden", status: 403 };
    case 429:
      {
        const error = envelope && typeof envelope === "object" && "error" in envelope
          ? (envelope as { error?: unknown }).error
          : undefined;
        const metadata = error && typeof error === "object" && "metadata" in error
          ? (error as { metadata?: unknown }).metadata
          : undefined;
        const headers = metadata && typeof metadata === "object" && "headers" in metadata
          ? (metadata as { headers?: unknown }).headers
          : undefined;
        const reset = headers && typeof headers === "object"
          ? (headers as Record<string, unknown>)["X-RateLimit-Reset"]
          : undefined;
        const source = metadata && typeof metadata === "object"
          ? (metadata as Record<string, unknown>).limit_source
          : undefined;
        if (source === "upstream_provider_shared_pool") {
          const providerName = metadata && typeof metadata === "object"
            ? (metadata as Record<string, unknown>).provider_name
            : undefined;
          return {
            kind: "upstream_provider_unavailable",
            status: 429,
            ...(typeof providerName === "string" ? { providerName } : {}),
          };
        }
        return {
          kind: "rate_limited",
          status: 429,
          ...(typeof reset === "string" && /^\d+$/.test(reset) ? { resetAt: Number(reset) } : {}),
          ...(typeof source === "string" ? { limitSource: source } : {}),
        };
      }
    default:
      if (status >= 500) return { kind: "server_error", status };
      return { kind: "network_error" };
  }
}

export type ChatErrorState = {
  readonly message: string;
  readonly recovery: {
    readonly kind:
      | "open_key_settings"
      | "add_credits"
      | "retry_rate_limit"
      | "pick_another_model"
      | "refresh_catalog"
      | "use_cached_catalog"
       | "retry_network"
       | "retry_empty_response"
       | "retry_step_limit"
       | "dismiss";
    readonly label: string;
    readonly href?: "settings/ai-key" | "https://openrouter.ai/credits";
  };
};

// eslint-disable-next-line complexity
export function toChatErrorState(err: AIError): ChatErrorState {
  switch (err.kind) {
    case "missing_key":
      return {
        message: "Add your OpenRouter key to use AI Coach.",
        recovery: { kind: "open_key_settings", label: "Add key", href: "settings/ai-key" },
      };
    case "invalid_key":
      return {
        message: "That OpenRouter key was rejected. Check it and try again.",
        recovery: { kind: "open_key_settings", label: "Check key", href: "settings/ai-key" },
      };
    case "insufficient_credits":
      return {
        message: "This key has insufficient credits. Key-scoped usage is shown in Settings.",
        recovery: {
          kind: "add_credits",
          label: "Add credits at openrouter.ai",
          href: "https://openrouter.ai/credits",
        },
      };
    case "rate_limited":
      return {
        message: `${err.limitSource ? `${err.limitSource}: ` : ""}${err.resetAt
          ? `OpenRouter rate limit reached. Retry after ${new Date(err.resetAt).toLocaleString()}.`
          : "OpenRouter rate limit reached. Retry later; free-tier limits are 20 rpm, 50/day under $10 purchased, or 1000/day at $10+."}`,
        recovery: { kind: "retry_rate_limit", label: "Retry later" },
      };
    case "upstream_provider_unavailable":
      return {
        message: `The selected model's upstream providers${err.providerName ? ` (${err.providerName})` : ""} are unavailable.`,
        recovery: { kind: "pick_another_model", label: "Open model picker" },
      };
    case "model_not_in_catalog":
      return {
        message: "That model is no longer in the live catalog.",
        recovery: { kind: "pick_another_model", label: "Pick another model" },
      };
    case "model_lacks_tools":
      return {
        message: "That model does not support the tools AI Coach needs.",
        recovery: { kind: "pick_another_model", label: "Pick another model" },
      };
    case "catalog_unavailable":
      return {
        message: "The model catalog is unavailable, so no model can be selected safely.",
        recovery: { kind: "refresh_catalog", label: "Refresh catalog" },
      };
    case "stale_catalog_warning":
      return {
        message: "The model catalog is stale; selections may have changed.",
        recovery: { kind: "use_cached_catalog", label: "Use cached catalog" },
      };
    case "network_error":
      return {
        message: "The AI request could not reach OpenRouter.",
        recovery: { kind: "retry_network", label: "Retry" },
      };
    case "forbidden":
      return { message: "OpenRouter refused this request. Check key permissions or model access.", recovery: { kind: "open_key_settings", label: "Check key", href: "settings/ai-key" } };
    case "server_error":
      return { message: "OpenRouter encountered a server error. Retry shortly or choose another model.", recovery: { kind: "retry_network", label: "Retry" } };
    case "aborted_by_user":
      return {
        message: "The AI request was stopped.",
        recovery: { kind: "dismiss", label: "Dismiss" },
      };
    case "empty_response":
      return {
        message: "The model returned nothing. Retry or try another model.",
        recovery: { kind: "retry_empty_response", label: "Retry" },
      };
    case "step_limit_reached":
      return {
        message: "The coach reached its data-checking limit before writing an answer. Retry the question.",
        recovery: { kind: "retry_step_limit", label: "Retry" },
      };
  }
}
