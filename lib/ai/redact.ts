import type { Breadcrumb, ErrorEvent } from "@sentry/core";
import { keyFormat } from "./key-vault";

const REDACTED = "[REDACTED]";

function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") {
    return value.replace(/sk-or-v1-[a-f0-9]{64}/g, (candidate) =>
      keyFormat(candidate) ? REDACTED : candidate
    );
  }
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return REDACTED;
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => redact(item, seen));

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = key.toLowerCase() === "authorization" ? REDACTED : redact(item, seen);
  }
  return result;
}

export function redactSentryEvent(event: ErrorEvent): ErrorEvent {
  return redact(event) as ErrorEvent;
}

export function redactSentryBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  return redact(breadcrumb) as Breadcrumb;
}

export { keyFormat };
