/**
 * BLD-2446 / BLD-3124 — Sentry localhost/CI event filter.
 *
 * The Sentry real-user dashboard was polluted by CI/E2E traffic originating
 * from localhost:8081 (Metro dev server) or HeadlessChrome in CI. Real users
 * on iOS/Android never run on localhost or in HeadlessChrome. This module
 * provides a `beforeSend` hook that drops any event whose `url` tag host
 * resolves to a local-only address, or whose browser context/user-agent
 * indicates a headless browser environment.
 *
 * Design decisions:
 *   - Filter on URL host and Headless/User-Agent, NOT on `environment` tag.
 *     The `environment` tag is forgeable by misconfigured CI (proven by
 *     REACT-NATIVE-F in BLD-2444).
 *   - Fail-open: if the local-only/headless signals are absent, the event is
 *     sent unchanged. We never silently swallow real errors.
 *   - The filter is a pure function so it can be unit-tested without
 *     initialising the Sentry SDK.
 */

import type { ErrorEvent } from '@sentry/core';
import { redactSentryEvent } from './ai/redact';

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
 * Returns `true` if the event context or user-agent headers indicate a
 * headless browser environment (such as HeadlessChrome in E2E tests).
 */
function isHeadlessEvent(event: ErrorEvent): boolean {
  // Check browser name in contexts
  const contexts = event.contexts as Record<string, Record<string, string>> | undefined;
  const browserName = contexts?.browser?.name;
  if (typeof browserName === 'string' && browserName.includes('Headless')) {
    return true;
  }

  // Check User-Agent in request headers (case-insensitive key)
  const request = event.request as Record<string, unknown> | undefined;
  const headers = request?.headers as Record<string, string> | undefined;
  if (headers && typeof headers === 'object') {
    const userAgentKey = Object.keys(headers).find(
      (key) => key.toLowerCase() === 'user-agent'
    );
    if (userAgentKey) {
      const userAgent = String(headers[userAgentKey]);
      if (userAgent.includes('Headless')) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Sentry `beforeSend` callback that drops CI/dev events originating from
 * a localhost URL or headless browser environment.
 *
 * Usage:
 *   Sentry.init({ ..., beforeSend: filterLocalhostEvents });
 *
 * @param event - The Sentry error event about to be sent.
 * @returns The event unchanged, or `null` to drop it.
 */
export function filterLocalhostEvents(event: ErrorEvent): ErrorEvent | null {
  // Scrub in place so the existing callback identity and localhost filtering
  // contract remain unchanged while secrets are removed before serialization.
  const scrubbed = redactSentryEvent(event);
  for (const key of Object.keys(event)) delete (event as unknown as Record<string, unknown>)[key];
  Object.assign(event, scrubbed);

  // 1. Headless environment check → drop immediately
  if (isHeadlessEvent(event)) {
    return null;
  }

  // 2. Localhost URL check
  const urlTag = event.tags?.['url'];
  const requestUrl = event.request?.url;

  // No url tag or request url → fail-open: send the event.
  if ((urlTag === undefined || urlTag === null) && (requestUrl === undefined || requestUrl === null)) {
    return event;
  }

  const urlString = String(urlTag ?? requestUrl);

  // Local host → drop the event (returns null to Sentry SDK).
  if (isLocalUrl(urlString)) {
    return null;
  }

  // Production URL or non-parseable string → send unchanged.
  return event;
}
