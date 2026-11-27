# BLD-5100 — Replace AI Coach with Agent access

## Steps
- [x] Create isolated integration worktree from `origin/main` and merge accepted Agent access (`0d4b87e9`) and AI Coach removal (`00a938a8`) with merge commits.
- [x] Harden Agent access: observability/logging disabled, exercise names and unknown-ID blocking, session recovery, schema sync, live verification, and Python User-Agent retry/paste fallback (`a1874d21`).
- [x] Merge hardening tip into integration and resolve conflicts while preserving coach removal and one coherent Agent access design (merge `f9f2aff3`). Conflicts in plan, CHANGELOG, route registry and e2e were combined; privacy policy gained final logging/URL-retention wording.
- [x] Run final repository, worker, migration, removal, acceptance-criteria and live gates; record `/tmp/bld-5100-evidence/final/` outputs.
- [x] Run final seeded Codex and paste-back Playwright acceptance, with distinct proposal names and targeted screenshots for both reviews, unknown-ID blocking and both imported rows (1 passed, 53.2s).
- [ ] Push only `bld-5100-integration`, open one draft PR to `main`, and reconcile CI until green without merging.

## Decisions / status
- Kept the Worker independent of `workers/strava-proxy`; shared proposal schema and validator live in `shared/agent-access.ts`.
- SQLite Durable Objects store relay sessions; tokens are stored only as SHA-256 hashes, generated with 256-bit entropy and compared by constant-time role-specific checks.
- App imports a validated proposal through Drizzle only after explicit approval; unknown exercise IDs block import independently in UI and database boundaries.
- Snapshot scope is sessions/workouts, templates, exercise library and PRs, defaulting to 90 days; nutrition is excluded. Templates/library are not date-bounded because they have no event date.
- Relay observability, invocation logs and sampling are disabled. Source/config guards reject request, token, header, URL and payload logging.
- GET-by-URL remains required for browse-only agents. The agent capability can therefore remain in chat/browser/proxy history; users must treat the copied prompt as a temporary credential. Worker logging is disabled but cannot erase downstream copies.
- Cloudflare `workers.dev` blocks Python urllib's default User-Agent with 403/1010 before Worker execution. The skill retries with `CableSnapAgent/1.0`; persistent HTTP failure falls back to exactly one fenced proposal JSON block.
- Native owner sessions recover from Expo SecureStore and clear on local/remote expiry, revoke or explicit revocation. Web session state remains transient.
- Durable Object alarm/revoke deletes snapshot/proposal rows and stores only a one-bit expired tombstone, distinguishing 410 expired from 401 revoked/unknown.
- Proposal/snapshot limits are 64 KiB/2 MiB; per-session proposal quota is 20 and session creation is rate-limited per IP.
- Final acceptance uses deployed Worker version `45578436-93b7-482e-9010-ed2b90b3dadf`; do not redeploy when merged `workers/agent-relay` exactly matches `a1874d21`.

## Acceptance Criteria — whole project

### Agent access
- [x] **AC1** Worker health, skill and schema respond. [test: `__tests__/lib/agent-access.test.ts::"BLD-5100 AC1 publishes the shared schema version and skill"`]
- [x] **AC2** Real app creates a deployed session. [test: `e2e/scenarios/agent-access.spec.ts::"BLD-5100 AC2-AC4, AC10, AC13, AC21 seeded real-agent and paste-back flows"`]
- [x] **AC3** Real external agent fetches and POSTs a distinct named proposal. [test: `e2e/scenarios/agent-access.spec.ts::"BLD-5100 AC2-AC4, AC10, AC13, AC21 seeded real-agent and paste-back flows"`]
- [x] **AC4** Review and explicit import only, with deterministic text assertions for distinct agent and pasted names. [test: `e2e/scenarios/agent-access.spec.ts::"BLD-5100 AC2-AC4, AC10, AC13, AC21 seeded real-agent and paste-back flows"`]
- [x] **AC5** Owner/agent capabilities cannot cross roles or create sessions. [test: `e2e/scenarios/agent-access.spec.ts::"BLD-5100 AC5-AC12 deployed relay negative matrix"`]
- [x] **AC6** Expiry returns 410 and deletes relay data. [test: `e2e/scenarios/agent-access.spec.ts::"BLD-5100 AC5-AC12 deployed relay negative matrix"`]
- [x] **AC7** Revoke immediately rejects snapshot, poll and proposal POST and deletes data. [test: `e2e/scenarios/agent-access.spec.ts::"BLD-5100 AC5-AC12 deployed relay negative matrix"`]
- [x] **AC8** Missing, wrong and cross-session tokens reject without existence leakage. [test: `e2e/scenarios/agent-access.spec.ts::"BLD-5100 AC5-AC12 deployed relay negative matrix"`]
- [x] **AC9** Invalid schema, extra/missing fields and out-of-range values reject in Worker and app. [test: `__tests__/lib/agent-access.test.ts::"BLD-5100 AC9 rejects schema-invalid and oversized proposals"`]
- [x] **AC10** Seeded snapshot honors the 90-day scope and contains sessions, PRs, templates and library but no nutrition. [test: `e2e/scenarios/agent-access.spec.ts::"BLD-5100 AC2-AC4, AC10, AC13, AC21 seeded real-agent and paste-back flows"`]
- [x] **AC11** Byte, proposal-quota and per-IP creation limits enforce 413/429. [test: `e2e/scenarios/agent-access.spec.ts::"BLD-5100 AC5-AC12 deployed relay negative matrix"`]
- [x] **AC12** Worker source/config cannot log request URL, Authorization, payload or body. [test: `__tests__/lib/agent-access.test.ts::"BLD-5100 AC12 relay contains no payload/token logging and alarm deletes relay rows"`]
- [x] **AC13** Browse-only fenced JSON validates, reviews and imports through the shared schema. [test: `e2e/scenarios/agent-access.spec.ts::"BLD-5100 AC2-AC4, AC10, AC13, AC21 seeded real-agent and paste-back flows"`]
- [x] **AC14** App validator, skill and served JSON schema stay synchronized. [test: `__tests__/lib/agent-access.test.ts::"BLD-5100 AC14 keeps validator and published JSON schema version aligned"`]
- [x] **AC20** Active native owner sessions recover from SecureStore and expiry/revoke clear them. [test: `__tests__/lib/agent-access-session-store.test.ts::"BLD-5100 AC20 recovers an active owner session from SecureStore"`]
- [x] **AC21** Review resolves exercise names, flags unknown IDs and disables silent import. [test: `e2e/scenarios/agent-access.spec.ts::"BLD-5100 AC2-AC4, AC10, AC13, AC21 seeded real-agent and paste-back flows"`]
- [x] **AC22** Worker capabilities have 256-bit entropy and use constant-time comparison. [test: `__tests__/lib/agent-access.test.ts::"BLD-5100 AC22 Worker capabilities are 256-bit and constant-time compared"`]

### AI Coach removal
- [x] **AC15** No AI Coach routes, imports, locale keys or legacy provider-host references remain. [test: `__tests__/ai-no-server-guard.test.ts::"contains no legacy AI-provider SDK or direct-provider references in app source"`]
- [x] **AC16** Upgrade migration drops Coach tables on an existing populated database without harming unrelated data. [test: `__tests__/lib/db/coach-tables-removal-migration.test.ts::"drops the legacy tables and settings from an existing database"`]
- [x] **AC17** Upgrade deletes the legacy AI-provider key from secure storage. [test: `__tests__/lib/legacy-provider-cleanup.test.ts::"deletes the stored credential once and records completion"`]
- [x] **AC18** Privacy policy, feature map and CHANGELOG describe Agent access and no longer advertise coaching. [test: `__tests__/ai-no-server-guard.test.ts::"documents Agent access without advertising the removed coach"`]
- [x] **AC19** Paste import never requires the removed server path. [test: `__tests__/ai-no-server-guard.test.ts::"allows Agent-access networking only through the configured relay host"`]

## Integration evidence
- Merge `f9f2aff3` resolved four conflicts: plan content combined both AC sets; CHANGELOG became one removal/replacement bullet; route registry uses `Agent Access`; Playwright kept hardening behavior plus stronger distinct-path evidence. Privacy MD/HTML now disclose disabled Worker logs and the token-in-GET-URL history risk.
- Merged `workers/agent-relay` is byte-identical to deployed `a1874d21`; no redeploy was performed.
- Jest: 487 suites, 5,826 tests and 3 snapshots passed in 115.41s wall time (114.252s Jest, below 150s).
- Deployed verifier: 31/31 passed in 38s; covers missing/wrong/cross-role tokens, schema/size/rate limits, expiry/revoke and capability separation.
- Worker: TypeScript passed and 2/2 node security tests plus sensitive-logging guard passed.
- Final Playwright: 1/1 seeded Codex + paste-back flow passed in 53.2s; Codex fetched skill/schema/snapshot and POSTed `Agent POST Progression`; pasted `Browse-only Paste Progression` imported separately; unknown-ID proposal was visibly blocked. Both names were asserted on the Templates list.
- Final evidence: `/tmp/bld-5100-evidence/final/` (`lint.txt`, `typecheck.txt`, `jest-full.txt`, `i18n-check.txt`, `feature-map-check.txt`, `license-check.txt`, `acceptance-audit.txt`, `worker-tsc.txt`, `worker-tests.txt`, `verify-agent-relay.txt`, `playwright-agent-access.log`, screenshots `02`–`05`, transcripts and assertions).
