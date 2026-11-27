# BLD-5100 — Agent access hardening

## Steps
- [x] Create isolated `bld-5100-agent-hardening` worktree from accepted slice-one and merge `origin/bld-5100-agent-access` at `0d4b87e9`.
- [x] Extend relay capability, expiry, size, quota and deployed-verifier coverage; preserve the accepted verifier.
- [x] Disable Worker observability/invocation logging and add a static guard for request URL/header/body logging.
- [x] Resolve proposal exercises to current library names, visibly flag unknown IDs and block their import while keeping long cards scrollable.
- [x] Persist active owner sessions securely on native, recover them after restart and clear them on expiry/revoke.
- [x] Add deterministic Worker and app Jest coverage plus schema/skill sync coverage.
- [x] Seed realistic history and extend Playwright for seeded snapshot assertions, real-agent review and fenced paste-back import.
- [x] Redeploy version `45578436-93b7-482e-9010-ed2b90b3dadf`; run the extended live verifier and Playwright with Codex; collect redacted hardening evidence.

## Decisions / status
- Slice-one relay security verifier is the source of truth: `scripts/verify-agent-relay.ts`; hardening extends it rather than replacing it.
- Cloudflare `[observability]`, Worker logs, invocation logs and log sampling are disabled. Source guard rejects `console.*` calls that could record request URL, Authorization, token, snapshot/proposal body or payload data.
- GET-by-URL remains supported for browse-only agents. The agent capability therefore exists in a URL, so residual exposure remains in agent chat history, browser history, DNS/proxy telemetry and user-copied links. It is not sent to Worker logs by our configuration; users must treat the copied prompt as a temporary credential.
- Cloudflare `workers.dev` blocks Python urllib's default User-Agent at the edge with `403 error code: 1010` before Worker code runs. curl, Node fetch and Python urllib with a normal User-Agent succeed. The skill instructs agents to retry 1010 with `CableSnapAgent/1.0`; if HTTP still fails they emit exactly one proposal JSON block, with no error block.
- Owner and agent capabilities remain separate 256-bit random values. Tokens are constant-time compared after SHA-256 hashing and never accepted cross-role.
- Durable Object alarm/revoke clears payload tables; a one-bit tombstone distinguishes expired 410 from unknown/revoked 401 without retaining data.
- App import always revalidates. Unknown exercise IDs are shown as unavailable and disable the import button; DB import independently rejects them.
- Native secure recovery uses Expo SecureStore and removes credentials on local expiry, remote expiry/revocation, or explicit revoke. Web keeps transient session state because SecureStore is native-only.
- Proposal limits are 64 KiB and 20 per session; snapshot limit is 2 MiB; creation rate limit is `CREATE_RATE_LIMIT_PER_MINUTE`.

## Acceptance Criteria — whole project

### Agent access
- [x] **AC1** Worker health, skill and schema respond. [test: `__tests__/lib/agent-access.test.ts::"BLD-5100 AC1 publishes the shared schema version and skill"`]
- [x] **AC2** Real app creates a deployed session. [test: `e2e/scenarios/agent-access.spec.ts::"BLD-5100 AC2-AC4, AC10, AC13, AC21 seeded real-agent and paste-back flows"`]
- [x] **AC3** Real external agent fetches and POSTs. [test: `e2e/scenarios/agent-access.spec.ts::"BLD-5100 AC2-AC4, AC10, AC13, AC21 seeded real-agent and paste-back flows"`]
- [x] **AC4** Review and explicit import only. [test: `e2e/scenarios/agent-access.spec.ts::"BLD-5100 AC2-AC4, AC10, AC13, AC21 seeded real-agent and paste-back flows"`]
- [x] **AC5** Owner/agent capabilities cannot cross roles or create sessions. [test: `e2e/scenarios/agent-access.spec.ts::"BLD-5100 AC5-AC12 deployed relay negative matrix"`]
- [x] **AC6** 30-second expiry rejects snapshot and proposal POST and alarm deletes data. [test: `e2e/scenarios/agent-access.spec.ts::"BLD-5100 AC5-AC12 deployed relay negative matrix"`]
- [x] **AC7** Revoke immediately rejects snapshot, poll and proposal POST and deletes data. [test: `e2e/scenarios/agent-access.spec.ts::"BLD-5100 AC5-AC12 deployed relay negative matrix"`]
- [x] **AC8** Missing, wrong and cross-session tokens reject without existence leakage. [test: `e2e/scenarios/agent-access.spec.ts::"BLD-5100 AC5-AC12 deployed relay negative matrix"`]
- [x] **AC9** Invalid schema, extra/missing fields and out-of-range values reject in Worker and app paste path. [test: `__tests__/lib/agent-access.test.ts::"BLD-5100 AC9 rejects schema-invalid and oversized proposals"`]
- [x] **AC10** Seeded E2E snapshot contains sessions, PRs, templates and exercise library, honors range and excludes nutrition. [test: `e2e/scenarios/agent-access.spec.ts::"BLD-5100 AC2-AC4, AC10, AC13, AC21 seeded real-agent and paste-back flows"`]
- [x] **AC11** Snapshot/proposal bytes, proposal quota and per-IP creation rate limit enforce 413/429. [test: `e2e/scenarios/agent-access.spec.ts::"BLD-5100 AC5-AC12 deployed relay negative matrix"`]
- [x] **AC12** Worker source/config cannot log request URL, Authorization, payload or body. [test: `__tests__/lib/agent-access.test.ts::"BLD-5100 AC12 relay contains no payload/token logging and alarm deletes relay rows"`]
- [x] **AC13** Browse-only fenced JSON validates, reviews, imports and remains scrollable. [test: `e2e/scenarios/agent-access.spec.ts::"BLD-5100 AC2-AC4, AC10, AC13, AC21 seeded real-agent and paste-back flows"`]
- [x] **AC14** App schema version, validator, skill and served schema cannot drift. [test: `__tests__/lib/agent-access.test.ts::"BLD-5100 AC14 keeps validator and published JSON schema version aligned"`]
- [x] **AC20** Active native owner session recovers from SecureStore and expires/revokes clear it. [test: `__tests__/lib/agent-access-session-store.test.ts::"BLD-5100 AC20 recovers an active owner session from SecureStore"`]
- [x] **AC21** Review shows exercise names, flags unknown IDs and disables silent import. [test: `__tests__/components/agent-access-proposal-card.test.tsx::"BLD-5100 AC21 unknown exercise is flagged and blocks import"`]
- [x] **AC22** Worker token generation has 256-bit entropy and constant-time comparison. [test: `__tests__/lib/agent-access.test.ts::"BLD-5100 AC22 Worker capabilities are 256-bit and constant-time compared"`]


## Evidence
- `/tmp/bld-5100-evidence/hardening/worker-deploy.txt` — deployed version `45578436-93b7-482e-9010-ed2b90b3dadf`.
- `/tmp/bld-5100-evidence/hardening/verify-agent-relay.txt` — 31-pass deployed capability/expiry/validation/quota/rate matrix.
- `/tmp/bld-5100-evidence/hardening/client-status-matrix.txt` and `client-diagnosis.txt` — curl/Node/Python GET+POST results and Cloudflare 1010 diagnosis.
- `/tmp/bld-5100-evidence/hardening/01-agent-access-active.png`, `02-proposal-review-names.png`, `03-paste-review.png`, `04-template-imported.png` — seeded real-agent and paste-back UI evidence.
- `/tmp/bld-5100-evidence/hardening/snapshot-shape.txt` — 3 recent sessions, PR, 19 templates, 145 exercises, 90-day range, nutrition absent.
- `/tmp/bld-5100-evidence/hardening/real-agent-transcript-redacted.txt`, `copied-prompt-redacted.txt`, `paste-import-assertion.txt` — redacted real-agent and paste import evidence.
- `/tmp/bld-5100-evidence/hardening/jest-full.txt`, `worker-tests.txt`, `gates.txt` — regression and gate evidence.
