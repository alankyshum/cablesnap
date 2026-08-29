import { t } from "@lingui/core/macro";
import { i18n } from "@lingui/core";

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
  readonly status: 429 | 502 | 503;
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
 * The sole OpenRouter wire-format seam. HTTP responses are classified from their
 * status and stable envelope discriminators; a missing status is a transport failure.
 */
// This is a wire-format boundary; the explicit status mapping keeps provider errors typed.
// eslint-disable-next-line complexity
export function parseOpenRouterError(status: number | undefined, envelope: unknown): AIError {
  if (status === undefined) return { kind: "network_error" };

  const error = envelope && typeof envelope === "object" && "error" in envelope
    ? (envelope as { error?: unknown }).error
    : undefined;
  const metadata = error && typeof error === "object" && "metadata" in error
    ? (error as { metadata?: unknown }).metadata
    : undefined;
  const errorType = error && typeof error === "object" && "error_type" in error
    ? (error as { error_type?: unknown }).error_type
    : metadata && typeof metadata === "object" && "error_type" in metadata
      ? (metadata as { error_type?: unknown }).error_type
      : undefined;
  const providerName = metadata && typeof metadata === "object"
    ? (metadata as Record<string, unknown>).provider_name
    : undefined;

  // Status alone is insufficient: an untyped OpenRouter 5xx is its own server
  // failure, while these stable body discriminators identify an upstream model
  // provider failure. Do this before the generic 5xx fallback.
  if (
    (status === 502 || status === 503) &&
    (errorType === "provider_unavailable" || errorType === "provider_overloaded")
  ) {
    return {
      kind: "upstream_provider_unavailable",
      status,
      ...(typeof providerName === "string" ? { providerName } : {}),
    };
  }

  switch (status) {
    case 401:
      return { kind: "invalid_key", status: 401 };
    case 402:
      return { kind: "insufficient_credits", status: 402 };
    case 403:
      return { kind: "forbidden", status: 403 };
    case 429:
      {
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
        message: t({ id: "ai.errors.missingKey", message: "Add your OpenRouter key to use AI Coach." }),
        recovery: { kind: "open_key_settings", label: t({ id: "ai.errors.addKey", message: "Add key" }), href: "settings/ai-key" },
      };
    case "invalid_key":
      return {
        message: t({ id: "ai.errors.invalidKey", message: "That OpenRouter key was rejected. Check it and try again." }),
        recovery: { kind: "open_key_settings", label: t({ id: "ai.errors.checkKey", message: "Check key" }), href: "settings/ai-key" },
      };
    case "insufficient_credits":
      return {
        message: t({
          id: "ai.errors.insufficientCredits",
          message: "This key has insufficient credits. Key-scoped usage is shown in Settings.",
        }),
        recovery: {
          kind: "add_credits",
          label: t({ id: "ai.errors.addCredits", message: "Add credits at openrouter.ai" }),
          href: "https://openrouter.ai/credits",
        },
      };
    case "rate_limited": {
      const prefix = err.limitSource ? `${err.limitSource}: ` : "";
      const baseMessage = err.resetAt
        ? i18n._({
            id: "ai.errors.rateLimitedReset",
            message: "OpenRouter rate limit reached. Retry after {resetAt}.",
            values: { resetAt: new Date(err.resetAt).toLocaleString() },
          })
        : t({
            id: "ai.errors.rateLimitedGeneric",
            message:
              "OpenRouter rate limit reached. Retry later; free-tier limits are 20 rpm, 50/day under $10 purchased, or 1000/day at $10+.",
          });
      return {
        message: `${prefix}${baseMessage}`,
        recovery: { kind: "retry_rate_limit", label: t({ id: "ai.errors.retryLater", message: "Retry later" }) },
      };
    }
    case "upstream_provider_unavailable":
      return {
        message: t({
          id: "ai.errors.upstreamProviderUnavailable",
          message: "The selected model's upstream provider is unavailable.",
        }),
        recovery: {
          kind: "pick_another_model",
          label: t({ id: "ai.errors.openModelPicker", message: "Open model picker" }),
        },
      };
    case "model_not_in_catalog":
      return {
        message: t({ id: "ai.errors.modelNotInCatalog", message: "That model is no longer in the live catalog." }),
        recovery: { kind: "pick_another_model", label: t({ id: "ai.errors.pickAnotherModel", message: "Pick another model" }) },
      };
    case "model_lacks_tools":
      return {
        message: t({
          id: "ai.errors.modelLacksTools",
          message: "That model does not support the tools AI Coach needs.",
        }),
        recovery: { kind: "pick_another_model", label: t({ id: "ai.errors.pickAnotherModel", message: "Pick another model" }) },
      };
    case "catalog_unavailable":
      return {
        message: t({
          id: "ai.errors.catalogUnavailable",
          message: "The model catalog is unavailable, so no model can be selected safely.",
        }),
        recovery: { kind: "refresh_catalog", label: t({ id: "components.coach.refreshCatalog", message: "Refresh catalog" }) },
      };
    case "stale_catalog_warning":
      return {
        message: t({
          id: "ai.errors.staleCatalogWarning",
          message: "The model catalog is stale; selections may have changed.",
        }),
        recovery: { kind: "use_cached_catalog", label: t({ id: "ai.errors.useCachedCatalog", message: "Use cached catalog" }) },
      };
    case "network_error":
      return {
        message: t({ id: "ai.errors.networkError", message: "The AI request could not reach OpenRouter." }),
        recovery: { kind: "retry_network", label: t({ id: "ai.errors.retry", message: "Retry" }) },
      };
    case "forbidden":
      return {
        message: t({
          id: "ai.errors.forbidden",
          message: "OpenRouter refused this request. Check key permissions or model access.",
        }),
        recovery: { kind: "open_key_settings", label: t({ id: "ai.errors.checkKey", message: "Check key" }), href: "settings/ai-key" },
      };
    case "server_error":
      return {
        message: t({
          id: "ai.errors.serverError",
          message: "OpenRouter encountered a server error. Retry shortly or choose another model.",
        }),
        recovery: { kind: "retry_network", label: t({ id: "ai.errors.retry", message: "Retry" }) },
      };
    case "aborted_by_user":
      return {
        message: t({ id: "ai.errors.abortedByUser", message: "The AI request was stopped." }),
        recovery: { kind: "dismiss", label: t({ id: "ai.errors.dismiss", message: "Dismiss" }) },
      };
    case "empty_response":
      return {
        message: t({ id: "ai.errors.emptyResponse", message: "The model returned nothing. Retry or try another model." }),
        recovery: { kind: "retry_empty_response", label: t({ id: "ai.errors.retry", message: "Retry" }) },
      };
    case "step_limit_reached":
      return {
        message: t({
          id: "ai.errors.stepLimitReached",
          message: "The coach reached its data-checking limit before writing an answer. Retry the question.",
        }),
        recovery: { kind: "retry_step_limit", label: t({ id: "ai.errors.retry", message: "Retry" }) },
      };
  }
}
