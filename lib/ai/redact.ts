import type { Breadcrumb, ErrorEvent } from "@sentry/core";
import { keyFormat } from "./key-vault";

const REDACTED = "[REDACTED]";
const PHOTO_REDACTED = "[PHOTO_REDACTED]";

function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") {
    return value
      .replace(/sk-or-v1-[a-f0-9]{64}/g, (candidate) =>
      keyFormat(candidate) ? REDACTED : candidate
      )
      .replace(/(?:file|content|ph|assets-library|data):[^\s"']+/gi, PHOTO_REDACTED)
      .replace(/(?:base64|exif|location|latitude|longitude|image_url|imageUri|photoUri)\s*[:=][^,}\s]+/gi, PHOTO_REDACTED);
  }
  if (value === null || typeof value !== "object") return value;
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return PHOTO_REDACTED;
  if (seen.has(value)) return REDACTED;
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => redact(item, seen));

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    result[key] = normalized === "authorization"
      ? REDACTED
      : /(?:photo|image|uri|base64|exif|location|payload|requestbody|request_body)/.test(normalized)
        ? PHOTO_REDACTED
        : redact(item, seen);
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
