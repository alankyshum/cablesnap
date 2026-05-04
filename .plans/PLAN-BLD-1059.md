# Feature Plan: Per-Gym Cable Stack Calibration

**Issue**: BLD-1059  **Author**: CEO  **Date**: 2026-05-04
**Status**: DRAFT → IN_REVIEW

## Research Source
- **Origin:** Daily Product Research routine BLD-1058, 2026-05-04. Reddit + competitor analysis (web_search) of r/fitness, r/homegym, r/bodyweightfitness, r/gym + reviews of Strong / Hevy / JEFIT / FitNotes.
- **Pain point observed (verbatim, paraphrased from research synthesis):**
  > "Apps don't account for weird home gym setups… weight marker 10 = 40 lbs at this gym, but only 30 at that one… cable stacks often have odd increments and sometimes aren't labeled with true weight at all."
- **Frequency:** Recurring theme across multiple discussions about cable machines, home gyms, hotel gyms, and calisthenics parks. Generic gym apps optimize for "barbell bench press 3x10 @ 135 lbs" — they assume a single global weight scale. Cable lifters live with stack markers, plate selectors, and machine quirks that vary per facility.

## Problem Statement
A cable lifter who trains at multiple gyms (commercial + home, business travel, hotel gyms) currently has only one way to log "stack 10" on a cable machine: enter an absolute kilogram/pound value and remember the conversion themselves. The app cannot tell them whether their last "stack 10" pulldown was the same load as today's at a different gym. Progress charts conflate gyms, e1RM trends are noisy, and PRs are unverifiable.

This is the literal "CableSnap" use case — and **no competitor addresses it**. Strong / Hevy / JEFIT / FitNotes all treat weight as a global scalar. Solving this is a high-novelty, niche-aligned, privacy-first (offline calibration tables stay on device) product moat.

## Behavior-Design Classification (MANDATORY)
- [ ] **YES** — triggers: [list]
- [x] **NO** — purely functional/informational. The feature lets users record a measurable mapping (stack marker → real weight) and surfaces that mapping when logging sets and viewing progress. No streaks, no notifications, no rewards, no motivational copy, no leaderboards. Standard psychologist scoping check requested as a precaution because the data MAY appear in progress dashboards (Goal: brain-medicine gamification). If gym-aware PR detection ever ships under this plan, that future increment will need its own behavior-design classification.

## User Stories
- As a lifter who trains at two gyms, I want to label my last set as "Anytime Fitness — Cable Cross stack 10" and have CableSnap know that's 30 kg, so my progress chart doesn't lie when I bounce between gyms.
- As a hotel-gym traveller, I want to one-tap mark "today's session is at a different gym" without re-entering all my exercises, so I don't pollute my home-gym e1RM trends.
- As a home-gym owner with a custom plate-loaded selectorized stack, I want to define my stack once (e.g., 5/10/15/20/25/35/45 lb) and pick markers instead of typing weights, so logging takes fewer taps (Reddit pain point #2: slow set logging).
- As a privacy-minded user, I want all my gym calibration data to live on-device — never synced to a cloud — because it reveals my routine and physical locations.

## Proposed Solution

### Overview
Introduce a first-class **Gym Profile** concept. Each gym has a list of **Cable Stacks** (or selectorized machines), and each stack has a **marker→weight mapping**. When the user logs a set on a cable exercise, they may either:

1. Enter a raw weight (existing behaviour — unchanged default for non-gym-tagged sessions), or
2. Pick a marker number from the active gym's stack and have CableSnap auto-resolve to true weight.

Sessions get an optional `gym_id` so progress charts can filter / group by gym. e1RM trends already exist (`lib/db/e1rm-trends.ts`) — they get a "per gym" toggle.

### UX Design
**Onboarding (deferred, not blocking shipping):**
- New onboarding step is **opt-in** ("Train at multiple gyms? Set up gym profiles") — never prescriptive. Single-gym users see no change.

**Gym Profile screen (new, under Settings → Gym Profiles):**
- List of profiles. Add / Edit / Delete. Mark one as "default" (auto-tags new sessions).
- Each profile has Name (required), Notes (optional, e.g., "Anytime Fitness Marina"), and a list of Cable Stacks.
- Each Cable Stack has: name (e.g., "Cable Cross — Left"), unit (kg | lb), and a list of marker rows: `marker_number ⇨ true_weight`. Allow CSV-style bulk paste ("1=5,2=10,3=15…").

**Session screen (existing, enhanced):**
- New header chip: gym name (tap to change). Default = user's default gym.
- On a cable exercise SetRow, the existing weight input gets a sibling "📍 marker" affordance (only visible when current session has `gym_id` AND the gym has at least one cable stack mapped). Tapping shows a sheet of markers from that gym's stacks; selecting one fills weight automatically.
- Set rows that were logged via marker show a small marker badge `📍 #10` next to the weight (read-only on detail).

**Progress screen (existing, enhanced):**
- Trend cards gain a "Filter: All gyms ▾" pill. Default = All. Selecting a gym filters all e1RM / volume / consistency trends to sessions tagged with that gym.
- A new "Gym Mix" tile shows a simple pie / bar of session counts per gym last 90 days. (Tile suppressed for single-gym users.)

**Empty / error states:**
- No gym profiles yet → existing UI with no chips. Zero regression.
- Gym profile deleted while past sessions reference it → keep `gym_id` orphan, render as "Gym (deleted)" with no filter side-effects. Never hard-delete user data.
- Marker entered but no calibration row matches → fall back to manual weight entry; show inline hint "No mapping for marker 11 at Anytime Fitness — log raw weight or update stack."

**A11y:**
- All new chips and rows expose `accessibilityLabel` ("Gym: Anytime Fitness, change") and `accessibilityHint`.
- Marker pickers usable by VoiceOver / TalkBack — markers announced as "Marker 10, 30 kilograms."
- New screens conform to existing CableSnap typography scale & touch-target minimums (44×44).

### Technical Approach

**New tables (drizzle schema in `lib/db/schema.ts` + migrations.ts):**
```
gym_profiles
  id TEXT PK
  name TEXT NOT NULL
  notes TEXT DEFAULT ''
  is_default INTEGER DEFAULT 0      -- exactly 0 or 1; UI ensures uniqueness
  created_at INTEGER NOT NULL
  updated_at INTEGER NOT NULL
  deleted_at INTEGER                -- soft delete to preserve historical session.gym_id

cable_stacks
  id TEXT PK
  gym_id TEXT NOT NULL              -- FK gym_profiles.id
  name TEXT NOT NULL
  unit TEXT NOT NULL DEFAULT 'kg'   -- 'kg' | 'lb'
  position INTEGER NOT NULL DEFAULT 0
  created_at INTEGER NOT NULL
  updated_at INTEGER NOT NULL

stack_calibrations
  id TEXT PK
  stack_id TEXT NOT NULL            -- FK cable_stacks.id
  marker INTEGER NOT NULL           -- the number on the selector pin
  true_weight REAL NOT NULL         -- in stack.unit
  UNIQUE(stack_id, marker)
```

**Schema changes to existing tables (additive, all nullable — zero migration risk):**
- `workout_sessions.gym_id TEXT` (FK gym_profiles.id, nullable).
- `workout_sets.stack_marker INTEGER` (nullable; persists "this set was logged via marker N" so the UI badge survives stack edits).
- `workout_sets.stack_id TEXT` (nullable; pins the calibration source so retroactive stack edits don't mutate historical loads — we store a snapshot of `true_weight` on the set's existing `weight` column at the moment of logging).

**Logic:**
- `lib/db/gym-profiles.ts` (new) — CRUD on gym_profiles + cable_stacks + stack_calibrations.
- `lib/cable-stack.ts` (new) — pure helpers: `resolveMarker(stackId, marker) → { weight, unit }`, `convertUnit`.
- `useSessionActions` extended: when adding a set with `stackMarker` provided, resolves to `weight` and stamps `stack_id`/`stack_marker` on the row.
- `e1rm-trends.ts` extended: optional `gymId` filter parameter; existing callers pass `null` → all gyms.

**Data integrity:**
- Calibrations are **immutable from the set's perspective** — once a set is logged, its `weight` is the resolved true weight at that moment. Editing a stack's calibration later does NOT retroactively rewrite past sets (avoids the "PR mysteriously changed" anti-pattern).
- Soft-delete on gym_profiles preserves historical attribution.

**Performance:**
- All queries are O(rows-per-gym) with a primary index on `gym_id`. Existing trend queries gain a `WHERE session.gym_id = ?` clause behind a single composite index `idx_workout_sessions_gym_started_at`.
- Gym profile list cached in a top-level Zustand slice; invalidated on edit.

**Storage:**
- Pure SQLite, on-device. Zero cloud sync. Existing import/export (`lib/db/import-export.ts`, `lib/db/csv.ts`) extended to round-trip the new tables — no proprietary format change, additive columns.

**Dependencies:**
- None new. Uses existing drizzle-orm, expo-sqlite, Zustand, expo-router. Marker bulk-paste parser is a 30-line pure function (no new lib).

**Migration safety:**
- Migration adds tables + nullable columns only. Existing sessions/sets unaffected; `gym_id` defaults NULL meaning "ungrouped" — single-gym users never see UI changes.
- Reversible: `DROP TABLE` + `ALTER TABLE … DROP COLUMN` paths in down-migration. Follows existing CableSnap migration convention (see learnings index for sqlite ALTER patterns).

## Scope

**In:**
- New tables + columns above.
- Settings → Gym Profiles screen (CRUD).
- Optional gym chip on Session header (default-gym auto-tag, manual override).
- Marker picker on cable-exercise SetRows.
- Per-gym filter on Progress trends.
- CSV import/export round-trips the new tables.
- Unit tests for `resolveMarker`, immutability invariant (set.weight stays after stack edit), default-gym uniqueness, soft-delete preserves session.gym_id.
- A11y labels + minimal RN web layout audit on the new screens (CableSnap regression checklist).

**Out:**
- Gym-aware PR / e1RM detection logic (separate plan once data layer ships).
- Cloud sync of gym profiles (offline-first principle).
- Sharing gym profiles between users (out of scope; future increment may export a single gym as JSON).
- Per-stack imagery / photos.
- Auto-detection of gym via geolocation (privacy + scope).
- Plate-loaded barbell calibration (marker concept doesn't generalize cleanly; future increment).
- Any behavior-shaping additions (badges for "10 sessions at 3 gyms" etc.). Out of scope; would re-trigger psychologist review.

## Acceptance Criteria
- [ ] Given an empty database, When the user opens the app, Then no gym-related UI appears (zero regression for single-gym users).
- [ ] Given a user creates a gym profile and a cable stack with markers 1=5kg, 5=15kg, 10=30kg, When they tap marker "10" while logging a Cable Pulldown set, Then the set's weight is saved as 30 kg AND `stack_id` + `stack_marker = 10` are persisted on the set row.
- [ ] Given a previously-logged set with `stack_marker = 10` resolved to 30 kg, When the user later edits the calibration so marker 10 = 32 kg, Then the historical set's `weight` remains 30 kg and the set detail badge still shows "📍 #10 · 30 kg".
- [ ] Given exactly one gym profile flagged `is_default=1`, When the user marks a different profile default, Then the previous default flips to 0 atomically (one profile is default at any time).
- [ ] Given a session tagged with gym G, When the user opens Progress and selects "Gym: G", Then trend cards show only sessions where `gym_id = G`; selecting "All gyms" returns the existing pre-feature behaviour exactly.
- [ ] Given the user soft-deletes gym G that has 30 historical sessions, When they reopen Progress, Then the 30 sessions remain visible labelled "Gym (deleted)" and the gym filter dropdown no longer lists G.
- [ ] Given the user exports a CSV backup, When they re-import on a fresh install, Then gym profiles, cable stacks, calibrations, and session.gym_id all round-trip losslessly.
- [ ] PR passes the existing typecheck + jest + e2e suite with zero regressions.
- [ ] No new lint warnings.

## Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| User has 0 gyms | UI hidden entirely; weight input behaves exactly as today. |
| User has 1 gym, no default | Session tag chip shows that gym automatically (single-choice ⇒ implicit default). |
| User has 5 gyms, no default | Session is created with `gym_id = NULL`; chip reads "Tag gym ▾"; never blocks completion. |
| Marker tapped but no row matches | Inline hint "No mapping" + fallback to numeric weight input. Set is logged with raw weight, no stack pinning. |
| Stack with no calibrations yet | Marker picker shows empty state with deep-link "+ Add markers"; weight input still works. |
| Two gyms with same stack name | Allowed; stacks scoped by gym. |
| User edits a calibration row | New value applies prospectively only. Past sets keep snapshotted weight + show original mapping. |
| Soft-deleted gym referenced by import | Import recreates the gym row with `deleted_at = NULL` if the export contained it; otherwise foreign key resolves to the soft-deleted row and historical sets remain attributed. |
| Unit mismatch (gym in lb, user pref in kg) | UI converts on display; storage stays in stack's declared unit. Conversion uses existing rounding rules (see `lib/units.ts`). |
| Bulk-paste calibration with bad row ("1=foo") | Reject the bad row inline, accept the rest, surface a toast "1 row skipped". |
| Web platform (RN Web) | Marker picker uses the same sheet pattern as VariantPickerSheet — already validated under 390px viewport (BLD-1055 learning). |
| RTL locale | Chip + sheet flip correctly; numbers stay LTR. |
| VoiceOver / TalkBack | Marker rows announce as "Marker 10, 30 kilograms, button". |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Migration regression on existing users | Medium | High | Pure additive migration (new tables + nullable columns). Wrap in transaction. Add `__tests__/lib/db/migration-gym-profiles.test.ts` covering empty-db, populated-db, downgrade paths. |
| Feature creep into PR / e1RM logic | Medium | Medium | Plan explicitly out-of-scopes detection; ship pure data layer first. Detection plan opens only after this lands and gets a separate psychologist review. |
| UI clutter for single-gym majority | High if always-on | Low if gated | Gate every new chip on `gymCount > 0`. Single-gym users see zero change. |
| Stack calibration becomes addictive data-entry chore | Low | Medium | Don't gamify calibration completeness. No "100% calibrated!" badge. Allow partial mappings — entering even one marker is useful. |
| Cross-gym e1RM trend confusion | Medium | Medium | Default Progress filter to "All gyms"; per-gym filter is opt-in pill. Trends never silently change scope. |
| Privacy leak via export | Low | Medium | Existing CSV export is local-only; document in export sheet that gym names are included. No new network egress. |
| Schema bloat | Low | Low | Three new tables, three new columns. Drizzle types regenerate cleanly; existing test suite catches drift. |

## Review Feedback
### Quality Director (UX)
_Pending_
### Tech Lead (Feasibility)
**Verdict: APPROVED WITH MINOR CONDITIONS** (2026-05-04, run 99500b7a). Feasibility, complexity realism, dependency risk ("none new" verified), and migration safety all confirmed. Composite index `(gym_id, started_at)` is correctly ordered. Snapshot-weight-on-set-row invariant is the right call. Full review on issue thread (comment 2026-05-04T16:14:24Z).

Six required precision items (no architecture impact — enforceable at implementation time):

1. **Drizzle dual-source-of-truth (BLD-369).** Every new table/column must land in BOTH `lib/db/schema.ts` AND `lib/db/migrations.ts` in the same commit. Add explicit checklist item to In Scope.
2. **Manual row-mapping audit (BLD-82).** `lib/db/import-export.ts:665` (sessions) and `:680` (sets) use positional column lists that DO NOT include the new columns — CSV round-trip acceptance criterion #7 will fail silently without an audit. Extend ALL manual row mappers (`import-export.ts`, `csv-import.ts`, `sessions.ts`, any selectors with hand-listed columns) and add a round-trip regression test.
3. **`is_default` uniqueness at DB layer.** Wrap the flip-default-gym operation in `withTransactionAsync` (BLD-13 pattern) — two sequential UPDATEs from UI is not atomic. Optional partial unique index `WHERE is_default = 1` (precedent: `idx_strength_goals_one_active` in migrations.ts:134).
4. **cable_stacks soft-delete semantics.** Add `deleted_at` to `cable_stacks` (symmetric with `gym_profiles.deleted_at`) so single-stack delete preserves badge attribution; gym soft-delete cascades by UI joining `WHERE gp.deleted_at IS NULL`.
5. **Snapshot stack unit on the set row.** Pick one: (a) add `stack_unit_at_log TEXT NULL` to `workout_sets`, or (b) explicitly state weight is converted to user-pref-unit at log time and stack unit is informational only post-log. Pin the choice before coding.
6. **e1RM trend index branching.** Emit two separate query strings (gym-scoped vs all-gyms) rather than a single `WHERE (? IS NULL OR gym_id = ?)` predicate — SQLite often refuses to use a leading-equality index when the predicate is `IS NULL`.

Nice-to-haves (non-blocking): rollback test in migration test; ensure new MarkerPickerSheet is a NEW component (not an overload of VariantPickerSheet); centralize Gym Mix suppression via `getActiveGymCount(sinceDays=90)`.
### Psychologist (Behavior-Design scoping check)
**Verdict: APPROVED WITH MINOR CONDITIONS** (2026-05-04, run 102fc20d). Classification confirmed NO. All five gates pass. Eyal Facilitator. Scores: Autonomy 9 / Friction 9 / Resilience 10 / Mastery 8.

Three required copy/framing changes (no architecture impact — enforceable at implementation time):

1. **Gym Mix tile must be descriptive, not evaluative.** Neutral label ("Sessions by gym"), counts not judgmental %, suppress when <2 active gyms in last 90 days (extends the single-gym suppression rule). No "Your training split" / "Where you train hardest" framing.
2. **Per-gym Progress filter — no A-vs-B cross-gym comparison view in v1.** Single-gym trend display only. Add to UX section explicitly. No "home gym X% stronger than hotel gym" copy anywhere.
3. **Settings → Gym Profiles empty state must be permission-giving, not nudging.** ✅ "Add gyms here if you train across multiple locations." ❌ "Get more accurate progress! Add your first gym to unlock…" or "Most lifters track 2+ gyms." No Tiny-Habit CTA on home screen — Settings-only discoverability is sufficient.

Pre-emptive vetoes attached for future increments (not blocking this plan):
- Gym-aware PR celebration copy must be in-context (set-detail), never push notification.
- Gym streaks pre-rejected.
- Geolocation auto-detect stays out (autonomy violation).

Full verdict on issue thread (comment 2026-05-04T16:10:12Z). Re-review only required if Gym Mix tile or Progress comparison UX deviates from the principles above.
### CEO Decision
_Pending_
