---
name: cablesnap--strava-oauth
description: "CableSnap Strava OAuth ops: app config (id 227474), Cloudflare Worker proxy at strava-proxy.alankyshum.workers.dev, redirect URI architecture. Use when debugging 'Connect Strava' failures, 'invalid redirect URI' errors, or modifying the Strava connect/token/refresh flow." <!-- skill-lint: allow -->
---

# Goal

Securely manage Strava OAuth flow, app configurations, worker proxy redirects, and token exchange routines for CableSnap.

# Critical Rules

- **NEVER** use a custom URI scheme (`cablesnap://...`) as `redirect_uri` to Strava — Strava's `/oauth/authorize` and `/oauth/mobile/authorize` both reject it with `{"field":"redirect_uri","code":"invalid"}`. Only `http(s)://` URLs whose host matches the registered Authorization Callback Domain are accepted.
- **MUST** route Strava → app via the worker bounce: Strava → `https://strava-proxy.alankyshum.workers.dev/callback?code=...` → 302 → `cablesnap://strava-callback?code=...` → app.
- **MUST** keep app's `state` param matching between authorize URL and callback (CSRF). Generated via `lib/uuid.ts`.
- **NEVER** commit `STRAVA_CLIENT_SECRET` (lives in Cloudflare Worker via `wrangler secret put`) or the Strava session cookie / CSRF token (lives in `.env.local`).
- **MUST** register an explicit route (e.g. `app/strava-callback.tsx` via Expo Router) to handle Android deep links, as Android may relaunch the app fresh and bypass Custom Tab watchers.
- **MUST** implement a single-consume lock: check in-flight guard, validate, and delete the pending state from `SecureStore` *before* initiating `exchangeCodeForTokens` to prevent concurrent/duplicate exchanges of single-use codes.

# Architecture

```
[App] WebBrowser.openAuthSessionAsync(authorizeUrl, "cablesnap://strava-callback")
  └─ authorizeUrl: https://www.strava.com/oauth/authorize
       ?client_id=227474
       &redirect_uri=https://strava-proxy.alankyshum.workers.dev/callback
       &response_type=code&scope=activity:write&state=<uuid>
[Strava] consent → 302 → worker /callback?code=...&state=...
[Worker] GET /callback → 302 → cablesnap://strava-callback?<all-params>
[OS] routes deep link → app
[App] parses code, POSTs worker /token → access_token + refresh_token + athlete
```

# Key Locations

| Component | Path |
|---|---|
| App OAuth client | `lib/strava.ts` |
| Worker source | `workers/strava-proxy/src/index.ts` |
| Worker config | `workers/strava-proxy/wrangler.toml` |
| App config (client_id, proxy URL) | `app.config.ts` → `extra.stravaClientId`, `extra.stravaProxyUrl` |
| Tests | `__tests__/lib/strava.test.ts` |
| Mock | `__mocks__/expo-web-browser.js` (`openAuthSessionAsync`) |

# Identifiers

- Strava member id: `22254762`
- Strava app id: `227474`
- Cloudflare account: `alan200994@gmail.com` (id `fbe46925529a77537b36114bed4e1ae1`)
- Worker subdomain (account-wide, ONE per account): `alankyshum.workers.dev` — verify the live value with `curl -s https://api.cloudflare.com/client/v4/accounts/<id>/workers/subdomain -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"`. If the account handle is ever renamed, every `*.workers.dev` URL changes and the old one returns NXDOMAIN.

# Credentials Setup (one-time)

The Strava developer-dashboard internal API needs your logged-in session cookie + CSRF token. Capture them from devtools at https://www.strava.com/settings/api (Network tab → any XHR → Headers), then add to `.env.local`:

```
STRAVA_DASHBOARD_SESSION=<value of _strava4_session cookie>
STRAVA_DASHBOARD_CSRF=<value of x-csrf-token request header>
```

These rotate when you log out — refresh as needed. See `.env.example` for the full template.

# Common Operations

All scripts live in `scripts/` and read from `.env.local`. Run with `bash .claude/skills/cablesnap--strava-oauth/scripts/<name>.sh`.

| Operation | Script |
|---|---|
| Get current Strava app config | `get-app.sh` |
| Update Strava app config (name, description, domain) | `update-app.sh` |
| Verify Strava accepts our redirect_uri | `verify-redirect.sh` |
| Verify worker bounces correctly | `verify-worker.sh` |
| Run full E2E (requires manual login) | `e2e-oauth.sh` |
| Deploy worker | `deploy-worker.sh` |

# Verification (smoke checks — no auth needed)

| Check | Expected |
|---|---|
| `bash scripts/verify-redirect.sh` | `HTTP/2 302` (bad: 400) |
| `bash scripts/verify-worker.sh` | `Location: cablesnap://strava-callback?...` with all params |
| `npm test -- __tests__/lib/strava.test.ts` | 50/50 pass |

# Live OAuth E2E (when needed)

Strava login automation is blocked by anti-bot — user must log in manually first.

1. `open -a "Google Chrome" "https://www.strava.com/login"` → ask user to log in.
2. Attach via tool--chrome (CDP port 9222), navigate to authorize URL with `&approval_prompt=force&state=verify-test`.
3. Capture real `code` via CDP `Network.requestWillBeSent` listener on `strava-proxy.alankyshum.workers.dev/callback` (the `cablesnap://` final hop fails in Chrome — that's correct).
4. POST code to worker `/token` → verify `access_token`, `refresh_token`, `expires_at`, `athlete{id,firstname,lastname}`.
5. Cleanup: `curl -X POST https://www.strava.com/oauth/deauthorize -H "Authorization: Bearer <token>"` → 200.

# Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Callback page shows `DNS_PROBE_FINISHED_NXDOMAIN` / host won't resolve after Strava authorizes | Cloudflare account `workers.dev` subdomain was renamed, so `strava-proxy.<old>.workers.dev` no longer exists | Get the current subdomain (see Identifiers), then update `app.config.ts` extra.stravaProxyUrl, `lib/strava.ts`, the Strava app `domain` (run `update-app.sh`), and all skill scripts to the new host |
| `{"errors":[{"resource":"Application","field":"redirect_uri","code":"invalid"}]}` | `redirect_uri` host doesn't match registered `domain`, OR is a custom scheme | Run `get-app.sh`; ensure `domain` is `alankyshum.workers.dev` and `redirect_uri` is `https://strava-proxy.alankyshum.workers.dev/callback` |
| Auth completes but app never gets callback | Native binary built before `scheme: "cablesnap"` was added to `app.config.ts` | `npx expo prebuild --clean` + rebuild |
| Worker `/token` returns 401 from Strava | Wrong `STRAVA_CLIENT_SECRET` in worker | `cd workers/strava-proxy && npx wrangler secret put STRAVA_CLIENT_SECRET` |
| Test mock missing | `expo-web-browser.openAuthSessionAsync` not stubbed | `__mocks__/expo-web-browser.js` needs `openAuthSessionAsync: jest.fn()` |
| `expo-auth-session` re-introduced | Old pattern reintroduced | Removed intentionally — use `WebBrowser.openAuthSessionAsync` only |
| Dashboard scripts return HTML login page | Session cookie expired | Re-capture `_strava4_session` + `x-csrf-token` from devtools, update `.env.local` |
| Empty `code=` query parameter | Callback contains parameter without value, returning `""` instead of `null` | Change code guard to falsy check `if (!code)` instead of `if (code === null)` to handle empty strings properly |
| Testing concurrent in-flight guards | Module-local `inFlight` booleans can be tricky to test without network calls | Call async function twice concurrently (without awaiting), mocking dependency to return a manually-resolved deferred Promise, then `await Promise.all` and assert single mock call |

# Notes

- **Use `/usr/bin/curl` directly** in scripts — environment wrappers may truncate response bodies.
- `domain` field in Strava app config MUST be `alankyshum.workers.dev` (NOT `cablesnap` — that has no public DNS).
- Strava accepts the registered domain AND its subdomains as redirect_uri hosts.
