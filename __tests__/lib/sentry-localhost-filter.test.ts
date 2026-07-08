/**
 * BLD-2446 — Unit tests for filterLocalhostEvents (sentry-localhost-filter).
 *
 * Covers all three acceptance criteria from the issue spec:
 *   AC1: event with localhost:8081 url tag → dropped (null)
 *   AC2: event with a real production URL/app-scheme → sent unchanged
 *   AC3: event with NO url tag → sent unchanged (fail-open)
 *
 * Plus the edge cases from the issue spec:
 *   - 127.0.0.1 and 0.0.0.0 (any port) → dropped
 *   - Malformed URL string → sent (fail-open)
 */

import { filterLocalhostEvents } from '../../lib/sentry-localhost-filter';
import type { ErrorEvent } from '@sentry/core';

/** Build a minimal ErrorEvent fixture with optional tags. */
function makeEvent(tags?: Record<string, string | number | boolean | null | bigint | symbol>): ErrorEvent {
  return {
    type: undefined,
    ...(tags !== undefined ? { tags } : {}),
  } as ErrorEvent;
}

describe('filterLocalhostEvents — AC1: localhost url tag → drop event', () => {
  it('drops an event whose url tag is localhost:8081', () => {
    const event = makeEvent({ url: 'http://localhost:8081/progress' });
    expect(filterLocalhostEvents(event)).toBeNull();
  });

  it('drops an event whose url tag is localhost with a different port', () => {
    const event = makeEvent({ url: 'http://localhost:3000/' });
    expect(filterLocalhostEvents(event)).toBeNull();
  });

  it('drops an event whose url tag is localhost with no port', () => {
    const event = makeEvent({ url: 'http://localhost/' });
    expect(filterLocalhostEvents(event)).toBeNull();
  });

  it('drops an event whose url tag is 127.0.0.1 (any port)', () => {
    const event = makeEvent({ url: 'http://127.0.0.1:8081/foo' });
    expect(filterLocalhostEvents(event)).toBeNull();
  });

  it('drops an event whose url tag is 0.0.0.0 (any port)', () => {
    const event = makeEvent({ url: 'http://0.0.0.0:19000/' });
    expect(filterLocalhostEvents(event)).toBeNull();
  });

  it('drops an event whose url tag is localhost with https scheme', () => {
    const event = makeEvent({ url: 'https://localhost:443/' });
    expect(filterLocalhostEvents(event)).toBeNull();
  });
});

describe('filterLocalhostEvents — AC2: production URL → send event unchanged', () => {
  it('sends an event with a real https URL', () => {
    const event = makeEvent({ url: 'https://app.example.com/home' });
    expect(filterLocalhostEvents(event)).toBe(event);
  });

  it('sends an event with an Expo app scheme (exp://)', () => {
    const event = makeEvent({ url: 'exp://u.expo.dev/some-uuid' });
    expect(filterLocalhostEvents(event)).toBe(event);
  });

  it('sends an event with an app:// custom scheme', () => {
    const event = makeEvent({ url: 'app://cablesnap/workout' });
    expect(filterLocalhostEvents(event)).toBe(event);
  });

  it('sends an event with a sentry-style URL (sentry.io host)', () => {
    const event = makeEvent({ url: 'https://cablesnap.sentry.io/' });
    expect(filterLocalhostEvents(event)).toBe(event);
  });

  it('sends an event whose url contains the word localhost in the path but not the host', () => {
    const event = makeEvent({ url: 'https://example.com/redirect?from=localhost' });
    expect(filterLocalhostEvents(event)).toBe(event);
  });
});

describe('filterLocalhostEvents — AC3: missing url tag → fail-open (send event)', () => {
  it('sends an event with no tags at all', () => {
    const event: ErrorEvent = { type: undefined };
    expect(filterLocalhostEvents(event)).toBe(event);
  });

  it('sends an event whose tags object lacks the url key', () => {
    const event = makeEvent({ environment: 'production' });
    expect(filterLocalhostEvents(event)).toBe(event);
  });

  it('sends an event whose url tag is null', () => {
    // null is a valid Primitive value in the Sentry event.tags type
    const event = makeEvent({ url: null });
    expect(filterLocalhostEvents(event)).toBe(event);
  });
});

describe('filterLocalhostEvents — edge case: malformed url → fail-open', () => {
  it('sends an event whose url tag is not a parseable URL', () => {
    const event = makeEvent({ url: 'not-a-url' });
    expect(filterLocalhostEvents(event)).toBe(event);
  });

  it('sends an event whose url tag is an empty string', () => {
    const event = makeEvent({ url: '' });
    expect(filterLocalhostEvents(event)).toBe(event);
  });

  it('sends an event whose url tag is a bare hostname (no scheme)', () => {
    // "localhost" without scheme is not parseable by URL() as an absolute URL
    const event = makeEvent({ url: 'localhost:8081' });
    // URL("localhost:8081") parses with protocol="localhost:" and pathname="8081"
    // — hostname will be "" not "localhost", so it passes through
    expect(filterLocalhostEvents(event)).toBe(event);
  });

  it('does not throw when tags is undefined (event has no tags property)', () => {
    const event: ErrorEvent = { type: undefined, tags: undefined };
    expect(() => filterLocalhostEvents(event)).not.toThrow();
    expect(filterLocalhostEvents(event)).toBe(event);
  });
});

describe('filterLocalhostEvents — environment tag does NOT determine filtering', () => {
  it('sends an event with environment=production even if url is localhost (url wins, drop)', () => {
    // Regression guard for REACT-NATIVE-F: a misconfigured CI host can emit
    // environment=production. URL-based filtering must still drop it.
    const event = makeEvent({ environment: 'production', url: 'http://localhost:8081/foo' });
    expect(filterLocalhostEvents(event)).toBeNull();
  });

  it('sends an event with environment=development but a real url (url wins, send)', () => {
    const event = makeEvent({ environment: 'development', url: 'https://app.example.com/' });
    expect(filterLocalhostEvents(event)).toBe(event);
  });
});

describe('filterLocalhostEvents — request.url support for Web client', () => {
  it('drops an event whose request.url is localhost:8081', () => {
    const event = {
      type: undefined,
      request: { url: 'http://localhost:8081/progress' },
    } as unknown as ErrorEvent;
    expect(filterLocalhostEvents(event)).toBeNull();
  });

  it('drops an event whose request.url has 127.0.0.1 or 0.0.0.0', () => {
    const event = {
      type: undefined,
      request: { url: 'http://127.0.0.1:8081/foo' },
    } as unknown as ErrorEvent;
    expect(filterLocalhostEvents(event)).toBeNull();
  });

  it('sends an event whose request.url is a production https URL', () => {
    const event = {
      type: undefined,
      request: { url: 'https://app.example.com/home' },
    } as unknown as ErrorEvent;
    expect(filterLocalhostEvents(event)).toBe(event);
  });
});

describe('filterLocalhostEvents — BLD-3124: Headless / User-Agent detection', () => {
  it('drops an event with browser.name containing Headless and no localhost URL', () => {
    const event = {
      type: undefined,
      contexts: {
        browser: {
          name: 'HeadlessChrome',
        },
      },
    } as unknown as ErrorEvent;
    expect(filterLocalhostEvents(event)).toBeNull();
  });

  it('drops an event with browser.name being exactly Headless', () => {
    const event = {
      type: undefined,
      contexts: {
        browser: {
          name: 'Headless',
        },
      },
    } as unknown as ErrorEvent;
    expect(filterLocalhostEvents(event)).toBeNull();
  });

  it('drops an event with a Headless User-Agent in headers (case-insensitive key)', () => {
    const event1 = {
      type: undefined,
      request: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36',
        },
      },
    } as unknown as ErrorEvent;
    expect(filterLocalhostEvents(event1)).toBeNull();

    const event2 = {
      type: undefined,
      request: {
        headers: {
          'user-agent': 'HeadlessChrome/120.0.0.0',
        },
      },
    } as unknown as ErrorEvent;
    expect(filterLocalhostEvents(event2)).toBeNull();
  });

  it('keeps a production event with a real User-Agent, real URL, and environment=production', () => {
    const event = {
      type: undefined,
      environment: 'production',
      tags: {
        url: 'https://app.example.com/home',
      },
      request: {
        url: 'https://app.example.com/home',
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        },
      },
      contexts: {
        browser: {
          name: 'Mobile Safari',
        },
      },
    } as unknown as ErrorEvent;
    expect(filterLocalhostEvents(event)).toBe(event);
  });
});
