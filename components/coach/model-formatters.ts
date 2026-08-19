import type { ModelPricing } from "@/lib/ai/catalog";

/**
 * Format a per-token price string (e.g. "0.00000015") into a human-readable
 * price per 1 million tokens (e.g. "$0.15/1M").
 */
export function formatTokenPrice(pricePerTokenStr: string | undefined): string {
  if (!pricePerTokenStr || pricePerTokenStr === "0" || pricePerTokenStr === "0.0") {
    return "$0.00";
  }
  const price = parseFloat(pricePerTokenStr);
  if (isNaN(price) || price === 0) {
    return "$0.00";
  }
  const perMillion = price * 1_000_000;
  if (perMillion < 0.01) {
    return `$${perMillion.toFixed(4)}/1M`;
  }
  return `$${perMillion.toFixed(2)}/1M`;
}

/**
 * Formats prompt and completion pricing into a concise readability string.
 * Returns "Free" if both prompt and completion are $0.
 */
export function formatModelPricing(pricing: ModelPricing | undefined): string {
  if (!pricing) return "Pricing unavailable";
  const promptNum = parseFloat(pricing.prompt || "0");
  const completionNum = parseFloat(pricing.completion || "0");
  if ((isNaN(promptNum) || promptNum === 0) && (isNaN(completionNum) || completionNum === 0)) {
    return "Free";
  }
  const promptFormatted = formatTokenPrice(pricing.prompt);
  const completionFormatted = formatTokenPrice(pricing.completion);
  return `Prompt: ${promptFormatted} · Comp: ${completionFormatted}`;
}

/**
 * Formats context length in tokens into a clean, human-readable string.
 * e.g. 128000 -> "128k context", 1000000 -> "1M context", 4096 -> "4,096 tokens".
 */
export function formatContextLength(tokens: number | null | undefined): string {
  if (tokens == null || isNaN(tokens)) return "Unknown context";
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M context`;
  }
  if (tokens >= 1_000) {
    const k = tokens / 1_000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k context`;
  }
  return `${tokens.toLocaleString()} tokens`;
}

/**
 * Formats a cache timestamp for user display.
 */
export function formatCachedTimestamp(timestamp: number | undefined): string {
  if (!timestamp) return "recently";
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
