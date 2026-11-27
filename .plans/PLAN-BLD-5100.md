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
- [ ] Resolve integration conflicts, reconcile privacy/feature-map/CHANGELOG/AC annotations, and verify the full integrated tree.
- [ ] Commit and push the integration branch.

## Decisions / status
- Kept the worker independent of `workers/strava-proxy`.
- Shared proposal schema and validator live at `shared/agent-access.ts`; both Worker and app import it.
- SQLite Durable Objects store each relay session; tokens are stored only as SHA-256 hashes.
- App imports a validated proposal through Drizzle and never writes agent payloads directly into the app database.
- Snapshot scope defaults to 90 days and all four required categories; templates/exercise library are unbounded by date because they have no effective event date.
- Slice one implements creation rate limiting, body limits, agent/owner separation, expiry alarms, and revoke; broader abuse hardening is a follow-up.

## Acceptance Criteria — whole project

### Agent access
- [x] **AC1** The new worker deploys at `https://cablesnap-agent-relay.alankyshum.workers.dev` and its health, skill and schema endpoints respond. [test: `__tests__/lib/agent-access.test.ts::"BLD-5100 AC1 publishes the shared schema version and skill"`]
- [x] **AC2** The real app creates a temporary session against the deployed worker from `/settings/agent-access`. [test: `e2e/scenarios/agent-access.spec.ts::"BLD-5100 AC2 creates an active session through the real deployed relay"`]
- [x] **AC3** A real external agent, given only the copied prompt, fetches skill/snapshot and POSTs a schema-valid proposed template. [test: `e2e/scenarios/agent-access.spec.ts::"BLD-5100 AC3 receives and reviews a real agent proposal"`]
- [x] **AC4** The app polls, shows the proposal for review, and imports it only after user confirmation. [test: `e2e/scenarios/agent-access.spec.ts::"BLD-5100 AC4 imports the reviewed proposal into templates"`]
- [ ] **AC5** Agent GET/POST capabilities cannot create, poll, or revoke sessions; owner capability cannot submit agent proposals. [TODO-test: BLD-5100]
- [ ] **AC6** Session expiry uses a configurable TTL; expired agent/owner tokens return 410 and storage is deleted by the Durable Object alarm. [TODO-test: BLD-5100]
- [ ] **AC7** Revoke immediately invalidates both agent and owner tokens and deletes relay data. [TODO-test: BLD-5100]
- [ ] **AC8** Wrong/mismatched owner or agent tokens are rejected. [TODO-test: BLD-5100]
- [x] **AC9** Schema-invalid, oversized, and oversized-array proposals are rejected on the Worker and pasted imports use the same app validator. [test: `__tests__/lib/agent-access.test.ts::"BLD-5100 AC9 rejects schema-invalid and oversized proposals"`]
- [x] **AC10** Snapshot scope is sessions/workouts, templates, exercise library, and PRs only; date range defaults to 90 days and nutrition is excluded. [test: `__tests__/lib/agent-access.test.ts::"BLD-5100 AC10 excludes nutrition from the shared snapshot scope"`]
- [ ] **AC11** Snapshot and proposal byte limits and basic per-IP session-creation rate limiting are enforced. [TODO-test: BLD-5100]
- [ ] **AC12** Relay code does not log tokens or payloads. [TODO-test: BLD-5100]
- [x] **AC13** Browse-only agents can provide fenced proposal JSON; paste validates, previews, and imports through the same versioned schema. [test: `__tests__/lib/agent-access.test.ts::"BLD-5100 AC13 accepts fenced paste JSON through the shared validator"`]
- [x] **AC14** Published `/v1/skill.md` and `/v1/schema.json` cannot drift from app proposal schema. [test: `__tests__/lib/agent-access.test.ts::"BLD-5100 AC14 keeps validator and published JSON schema version aligned"`]

### AI Coach removal (owned by parallel worker)
- [ ] **AC15** No AI Coach routes, imports, locale keys, or `openrouter.ai` references remain. [test: `__tests__/ai-no-server-guard.test.ts::"contains no legacy AI-provider SDK or direct-provider references in app source"`]
- [ ] **AC16** Upgrade migration drops Coach tables on an existing database without harming unrelated data. [test: `__tests__/lib/db/coach-tables-removal-migration.test.ts::"drops the legacy tables and settings from an existing database"`]
- [ ] **AC17** Upgrade deletes the OpenRouter key from secure storage. [test: `__tests__/lib/legacy-provider-cleanup.test.ts::"deletes the stored credential once and records completion"`]
- [ ] **AC18** Privacy policy, feature map, and CHANGELOG describe Agent access and no longer advertise in-app AI coaching. [test: `__tests__/ai-no-server-guard.test.ts::"documents Agent access without advertising the removed coach"`]
- [ ] **AC19** The replacement has a local/no-server import guard; pasted proposals never require the removed server path. [test: `__tests__/ai-no-server-guard.test.ts::"allows Agent-access networking only through the configured relay host"`]

## Evidence (slice one)
- Screenshots and transcript under `/tmp/bld-5100-evidence/slice1/`.
- Include the deployed URL, app active-session screenshot, proposal review screenshot, agent transcript, and template DB/import assertion.
