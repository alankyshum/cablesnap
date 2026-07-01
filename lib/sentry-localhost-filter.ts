/**
 * BLD-2446 — Sentry localhost/CI event filter.
 *
 * The Sentry real-user dashboard was polluted by CI/E2E traffic originating
 * from localhost:8081 (Metro dev server). Real users on iOS/Android never
 * hit localhost. This module provides a `beforeSend` hook that drops any
 * event whose `url` tag host resolves to a local-only address.
 *
 * Design decisions:
 *   - Filter on URL host, NOT on `environment` tag. The `environment` tag is
 *     forgeable by misconfigured CI (proven by REACT-NATIVE-F in BLD-2444).
 *   - Fail-open: if the `url` tag is absent or the URL is malformed, the
 *     event is sent unchanged. We never silently swallow real errors.
 *   - The filter is a pure function so it can be unit-tested without
 *     initialising the Sentry SDK.
 */

import type { ErrorEvent } from '@sentry/core';

/** Hosts that always indicate a local dev / CI environment. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

/**
 * Returns `true` when the given URL string has a local-only host
 * (`localhost`, `127.0.0.1`, or `0.0.0.0`, any port).
 *
 * Returns `false` for any production URL, and also `false` if the
 * string is not a parseable URL (fail-open).
 */
function isLocalUrl(urlString: string): boolean {
  try {
    const { hostname } = new URL(urlString);
    return LOCAL_HOSTS.has(hostname);
  } catch {
    // Malformed URL — fail-open, do not drop the event.
    return false;
  }
}

/**
 * Sentry `beforeSend` callback that drops CI/dev events originating from
 * a localhost URL.
 *
 * Usage:
 *   Sentry.init({ ..., beforeSend: filterLocalhostEvents });
 *
 * @param event - The Sentry error event about to be sent.
 * @returns The event unchanged, or `null` to drop it.
 */
export function filterLocalhostEvents(event: ErrorEvent): ErrorEvent | null {
  const urlTag = event.tags?.['url'];

  // No url tag → fail-open: send the event.
  if (urlTag === undefined || urlTag === null) {
    return event;
  }

  const urlString = String(urlTag);

  // Local host → drop the event (returns null to Sentry SDK).
  if (isLocalUrl(urlString)) {
    return null;
  }

  // Production URL or non-parseable string → send unchanged.
  return event;
}
