# BLD-5100 — Agent access (slice one)

## Steps
- [x] Create isolated `bld-5100-agent-access` worktree and inspect app/worker contracts.
- [x] Define the shared versioned snapshot/proposal contract and worker skill.
- [x] Implement the SQLite-backed Durable Object relay, capability tokens, expiry, revoke, proposal and poll endpoints.
- [x] Implement Drizzle snapshot export, relay client, Settings screen, proposal review/import and paste path.
- [x] Deploy and smoke-test the new Worker (short TTL `200 → 410`; wrong token, invalid proposal, revoke verified).
- [x] Run focused unit/type/lint/i18n/feature-map checks.
- [x] Drive the real web app and Codex through create → curl proposal POST → review → import; save evidence.
- [x] Update feature map and CHANGELOG.
- [x] Commit and push to `bld-5100-agent-access`.
- [x] Create `bld-5100-integration` from `origin/main` and merge the accepted Agent access and AI Coach removal branches with merge commits.
- [x] Merge updated Agent access tip `0d4b87e9` with AI Coach removal `00a938a8`, resolve privacy/feature-map/CHANGELOG/e2e conflicts, and verify the full integrated tree.
- [ ] Commit and push the integration branch (E2E against currently deployed relay attempted once; blocked because deployed owner prompt lacks updated curl guidance and Codex's Python client receives 403; no integration-side redeploy per lead).

## Decisions / status
- Kept the worker independent of `workers/strava-proxy`.
- Shared proposal schema and validator live at `shared/agent-access.ts`; both Worker and app import it.
- SQLite Durable Objects store each relay session; tokens are stored only as SHA-256 hashes.
- App imports a validated proposal through Drizzle and never writes agent payloads directly into the app database.
- Snapshot scope defaults to 90 days and all four required categories; templates/exercise library are unbounded by date because they have no effective event date.
- Owner and agent capability tests now run against the deployed Worker; short TTL is requestable only below `SESSION_TTL_SECONDS` and clamped to `[30, 1800]` seconds.
- Expiry deletes snapshot/proposal rows and records only a one-bit session-state tombstone so expired requests return 410 while revoked/unknown requests return 401.
- Verification script `scripts/verify-agent-relay.ts` covers capability separation, short TTL expiry, wrong/revoked tokens, schema/size rejection, read-after-write polling, no-scope expansion, and creation rate limiting.
- Broader abuse hardening (production observability, replay defenses, quotas, and richer app session recovery) remains a follow-up.

## Acceptance Criteria — whole project

### Agent access
- [x] **AC1** The new worker deploys at `https://cablesnap-agent-relay.alankyshum.workers.dev` and its health, skill and schema endpoints respond. [test: `__tests__/lib/agent-access.test.ts::"BLD-5100 AC1 publishes the shared schema version and skill"`]
- [x] **AC2** The real app creates a temporary session against the deployed worker from `/settings/agent-access`. [test: `e2e/scenarios/agent-access.spec.ts::"BLD-5100 AC2 creates an active session through the real deployed relay"`]
- [x] **AC3** A real external agent, given only the copied prompt, fetches skill/snapshot and POSTs a schema-valid proposed template. [test: `e2e/scenarios/agent-access.spec.ts::"BLD-5100 AC3 receives and reviews a real agent proposal"`]
- [x] **AC4** The app polls, shows the proposal for review, and imports it only after user confirmation. [test: `e2e/scenarios/agent-access.spec.ts::"BLD-5100 AC4 imports the reviewed proposal into templates"`]
- [x] **AC5** Agent GET/POST capabilities cannot create, poll, or revoke sessions; owner capability cannot submit agent proposals. [gate: `scripts/verify-agent-relay.ts` deployed capability matrix]
- [x] **AC6** Session expiry uses a configurable TTL; expired agent/owner tokens return 410 and storage is deleted by the Durable Object alarm. [gate: `scripts/verify-agent-relay.ts` deployed 30-second expiry test]
- [x] **AC7** Revoke immediately invalidates both agent and owner tokens and deletes relay data. [gate: `scripts/verify-agent-relay.ts` deployed revoke test]
- [x] **AC8** Wrong/mismatched owner or agent tokens are rejected. [gate: `scripts/verify-agent-relay.ts` deployed wrong-token matrix]
- [x] **AC9** Schema-invalid, oversized, and oversized-array proposals are rejected on the Worker and pasted imports use the same app validator. [test: `__tests__/lib/agent-access.test.ts::"BLD-5100 AC9 rejects schema-invalid and oversized proposals"`]
- [x] **AC10** Snapshot scope is sessions/workouts, templates, exercise library, and PRs only; date range defaults to 90 days and nutrition is excluded. [test: `__tests__/lib/agent-access.test.ts::"BLD-5100 AC10 excludes nutrition from the shared snapshot scope"`]
- [x] **AC11** Snapshot and proposal byte limits and basic per-IP session-creation rate limiting are enforced. [gate: `scripts/verify-agent-relay.ts` deployed size and 429 rate-limit assertions]
- [x] **AC12** Relay code does not log tokens or payloads. [test: `__tests__/lib/agent-access.test.ts::"BLD-5100 AC12 relay contains no payload/token logging and alarm deletes relay rows"`]
- [x] **AC13** Browse-only agents can provide fenced proposal JSON; paste validates, previews, and imports through the same versioned schema. [test: `__tests__/lib/agent-access.test.ts::"BLD-5100 AC13 accepts fenced paste JSON through the shared validator"`]
- [x] **AC14** Published `/v1/skill.md` and `/v1/schema.json` cannot drift from app proposal schema. [test: `__tests__/lib/agent-access.test.ts::"BLD-5100 AC14 keeps validator and published JSON schema version aligned"`]

### AI Coach removal (owned by parallel worker)
- [x] **AC15** No AI Coach routes, imports, locale keys, or legacy provider-host references remain. [test: `__tests__/ai-no-server-guard.test.ts::"contains no legacy AI-provider SDK or direct-provider references in app source"`]
- [x] **AC16** Upgrade migration drops Coach tables on an existing database without harming unrelated data. [test: `__tests__/lib/db/coach-tables-removal-migration.test.ts::"drops the legacy tables and settings from an existing database"`]
- [x] **AC17** Upgrade deletes the legacy AI-provider key from secure storage. [test: `__tests__/lib/legacy-provider-cleanup.test.ts::"deletes the stored credential once and records completion"`]
- [x] **AC18** Privacy policy, feature map, and CHANGELOG describe Agent access and no longer advertise in-app AI coaching. [test: `__tests__/ai-no-server-guard.test.ts::"documents Agent access without advertising the removed coach"`]
- [x] **AC19** The replacement has a local/no-server import guard; pasted proposals never require the removed server path. [test: `__tests__/ai-no-server-guard.test.ts::"allows Agent-access networking only through the configured relay host"`]

## Integration evidence
- Integrated branch includes merge commits for accepted Agent access (`8957128569d9` plus updated hardening tip `0d4b87e9`) and AI Coach removal (`00a938a8`).
- `npm run lint`, `npm run typecheck`, `npm run i18n:check`, `npm run feature-map:check`, license and AC audits pass.
- Full Jest: 485 suites, 5820 tests, 3 snapshots pass; wall time 118.85s (<150s).
- Migration test passes with a populated pre-existing Coach database; grep acceptance output is saved at `/tmp/bld-5100-evidence/integration/grep-acceptance.txt`.
- Playwright Agent access E2E attempted with the installed Chrome binary. Session creation succeeded, but the deployed relay's legacy prompt led Codex to use a scripted Python client that received 403 for public skill/schema plus snapshot; no proposal was submitted. Evidence: `/tmp/bld-5100-evidence/integration/agent-access-playwright.log` and redacted transcript. No redeploy was performed, per lead.

## Evidence (slice one)
- `/tmp/bld-5100-evidence/slice1/01-agent-access-active.png` — real web app with deployed relay session active.
- `/tmp/bld-5100-evidence/slice1/02-proposal-review.png` — relayed proposal rendered for explicit review.
- `/tmp/bld-5100-evidence/slice1/03-template-imported.png` — imported template visible after approval.
- `/tmp/bld-5100-evidence/slice1/copied-prompt.txt` — sanitized copy of the prompt supplied to the real agent.
- `/tmp/bld-5100-evidence/slice1/real-agent-transcript.txt` — Codex tool transcript: curl GET skill/schema/snapshot and curl POST proposal.
- `/tmp/bld-5100-evidence/slice1/template-import-assertion.txt` — same-run UI assertion for the imported template.
- `/tmp/bld-5100-evidence/slice1/verify-agent-relay.txt` — deployed capabilities/expiry/revoke/size/rate verification results.
- `/tmp/bld-5100-evidence/slice1/worker-health.json` and `/tmp/bld-5100-evidence/slice1/worker-deploy-final.txt` — health and deployment version.
- `/tmp/bld-5100-evidence/slice1/expired-token.txt` — explicit 30-second `200 → 410` deployed expiry check.
- `/tmp/bld-5100-evidence/slice1/schema.json` and `/tmp/bld-5100-evidence/slice1/skill.md` — published versioned contract.
