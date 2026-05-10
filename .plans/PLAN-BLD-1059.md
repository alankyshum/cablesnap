# Feature Plan: Per-Gym Cable Stack Calibration

**Issue**: BLD-1059  **Author**: CEO  **Date**: 2026-05-04
**Status**: APPROVED (rev 3, 2026-05-04) — TL ✅, Psych ✅ (Classification = NO), QD ✅

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

**Gym Profile screen (new, under Settings → Gym Profiles only — single discoverability surface):**
- List of profiles. Add / Edit / Delete. Mark one as "default" (auto-tags new sessions).
- Each profile has Name (required), Notes (optional, e.g., "Anytime Fitness Marina"), and a list of Cable Stacks.
- Each Cable Stack has: name (e.g., "Cable Cross — Left"), unit (kg | lb), and a list of marker rows: `marker_number ⇨ true_weight`. Allow CSV-style bulk paste ("1=5,2=10,3=15…").
- **Empty-state copy (Psych Required Change #3):** descriptive, permission-giving — e.g. "Add gyms here if you train across multiple locations." Forbidden phrasings: any growth-hack copy ("Get more accurate progress! Add your first gym to unlock…", "Most lifters track 2+ gyms — add yours"), any FOMO/loss framing, any Tiny-Habit "Add your first gym now" CTA. **No home-screen entry point** — Settings-only discoverability is the contract.

**Session screen (existing, enhanced):**
- New header chip: gym name (tap to change). Default = user's default gym.
- On a cable exercise SetRow, the existing weight input gets a sibling "📍 marker" affordance (only visible when current session has `gym_id` AND the gym has at least one cable stack mapped). Tapping shows a sheet of markers from that gym's stacks; selecting one fills weight automatically.
- Set rows that were logged via marker show a small marker badge `📍 #10` next to the weight (read-only on detail).

**Progress screen (existing, enhanced):**
- Trend cards gain a "Filter: All gyms ▾" pill. Default = All. Selecting a gym filters all e1RM / volume / consistency trends to sessions tagged with that gym. **Single-gym trend display only — no A-vs-B / side-by-side cross-gym comparison view in v1** (Psych Required Change #2). No copy that frames one gym as stronger/weaker than another. The filter is explicitly NOT a comparison tool.
- A new **"Sessions by gym"** tile (Psych Required Change #1: must be descriptive, not evaluative):
  - Label is literally "Sessions by gym" — never "Your training split", "Where you train hardest", or any phrasing inviting comparison/ranking.
  - Shows raw session **counts**, not percentages or judgmental copy. ("12 sessions — Anytime Fitness", not "12% at Anytime Fitness".)
  - **Suppressed entirely** when fewer than 2 gyms are *active in the last 90 days* (a gym is "active" if it has ≥1 session in the window). Returning-from-vacation users with one stale gym never see a 99/1 chart that frames the trip as failure.
  - Suppression logic centralized in a `getActiveGymCount(sinceDays = 90)` helper for unit-testable framing (TL nice-to-have).

**Empty / error states:**
- **Zero-regression UI contract (QD Required Change #1):** with zero gym profiles, NO gym UI appears in Session, Progress, or Home tabs — chip, picker, filter, tile are all hidden. The ONLY surface that exists with zero profiles is the `Settings → Gym Profiles` row itself (a static settings entry that opens the empty list). This row is allowed because Settings is the sole discoverability surface.
- Gym profile **soft-deleted** while past sessions reference it → past sessions retain their `gym_id`, the UI joins `WHERE gym_profiles.deleted_at IS NULL` for live pickers/filters, and historical rendering uses **the gym's last-known name at delete time** (snapshot semantics — never re-renders as "Gym (deleted)" if a name was captured). If the gym row was hard-removed via import wipe and the snapshot is unavailable, render "Gym (deleted)" with no filter side-effects.
- Cable stack **renamed** while past sessions reference it → set badge displays the **stack name as it was at log time** (snapshot stored on set row — see Technical Approach), not the current edited name. Editing a stack name never rewrites historical badge text.
- Cable stack **soft-deleted** while past sessions reference it → past sets keep `stack_id` + their snapshotted `stack_name_at_log` and `stack_unit_at_log`; live pickers join `WHERE cable_stacks.deleted_at IS NULL`. Cascading gym soft-delete also hides its stacks from live pickers via the same join.
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
  deleted_at INTEGER                -- soft delete (TL Required Change #4); preserves badge attribution on historical sets when a single stack is removed

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
- `workout_sets.stack_unit_at_log TEXT` (nullable; TL Required Change #5, option a — snapshots the stack's declared unit at log time so future stack-unit or user-pref-unit changes never desync the badge from the stored weight).
- `workout_sets.stack_name_at_log TEXT` (nullable; QD Required Change #2 — snapshots the cable-stack name at log time so renames/deletes never silently rewrite historical badge text).
- `workout_sessions.gym_name_at_log TEXT` (nullable; QD Required Change #2 — snapshots the gym name at session start so historical attribution survives rename/soft-delete without falling back to "Gym (deleted)" when the name is recoverable).

**Logic:**
- `lib/db/gym-profiles.ts` (new) — CRUD on gym_profiles + cable_stacks + stack_calibrations. **`setDefaultGym(id)` MUST run inside `withTransactionAsync`** (TL Required Change #3, BLD-13 pattern): single transaction containing `UPDATE gym_profiles SET is_default = 0` followed by `UPDATE gym_profiles SET is_default = 1 WHERE id = ?`. Belt-and-suspenders: a partial unique index `CREATE UNIQUE INDEX IF NOT EXISTS idx_gym_profiles_one_default ON gym_profiles(is_default) WHERE is_default = 1` (precedent: `idx_strength_goals_one_active`, migrations.ts:134; gracefully degrades on platforms without partial-index support).
- `lib/cable-stack.ts` (new) — pure helpers: `resolveMarker(stackId, marker) → { weight, unit }`, `convertUnit`, plus `parseCalibrationBulkPaste(input)` returning `{ accepted: Row[], skipped: SkipReason[] }` (see Calibration Validation below).
- `useSessionActions` extended: when adding a set with `stackMarker` provided, resolves to `weight` and stamps `stack_id` / `stack_marker` / `stack_unit_at_log` / `stack_name_at_log` on the row.
- `e1rm-trends.ts` extended: optional `gymId` filter parameter. **TL Required Change #6:** emit two **separate query strings** based on caller (gym-scoped uses `WHERE wss.gym_id = ?` against the new composite index `idx_workout_sessions_gym_started_at`; all-gyms uses the existing `idx_workout_sessions_started_at` path with no gym predicate). **Do not** use a single `WHERE (? IS NULL OR gym_id = ?)` pattern — SQLite often refuses to use a leading-equality index when the equality predicate is `IS NULL`.

**Calibration validation (QD Required Change #5):** `parseCalibrationBulkPaste(input)` rules:
| Input row | Behavior |
|----------|----------|
| `1=5` (valid) | accept |
| `1=foo` (non-numeric weight) | reject row, `skipped[]` reason `"non_numeric_weight"` |
| `foo=5` (non-numeric marker) | reject row, reason `"non_numeric_marker"` |
| `0=10` or `-1=10` (marker ≤ 0) | reject row, reason `"marker_must_be_positive"` |
| `5=0` or `5=-3` (true_weight ≤ 0) | reject row, reason `"weight_must_be_positive"` |
| `5=12.5` (decimal weight) | accept (REAL column); rounding deferred to `lib/units.ts` display layer |
| Duplicate marker (e.g., `5=10` then `5=12`) | last-wins within a single paste; surface a per-marker conflict in `skipped[]` reason `"duplicate_marker"` for the earlier row(s); UNIQUE(stack_id, marker) constraint then upserts |
| Mixed kg/lb in same paste | not supported in bulk paste; stack `unit` is the source of truth — values are interpreted in the stack's declared unit; rounding via existing `lib/units.ts` rules |
| Empty input | accept zero rows, no error |
| Toast message on partial accept | "Added N markers. M rows skipped." (exact `M` count, never "some rows"). On all-skipped: "No valid rows. M skipped." On unsupported decimal-marker (`1.5=10`): reject row, reason `"non_numeric_marker"`. |

**Inline marker entry validation** (single-row entry on the marker editor): same per-row rules; ≤ 0 values blocked at submit time with field-level error copy (`"Marker must be a whole number greater than 0"`, `"Weight must be greater than 0"`).

**Data integrity:**
- Calibrations are **immutable from the set's perspective** — once a set is logged, its `weight` is the resolved true weight at that moment. Editing a stack's calibration later does NOT retroactively rewrite past sets (avoids the "PR mysteriously changed" anti-pattern).
- Soft-delete on gym_profiles preserves historical attribution.

**Performance:**
- All queries are O(rows-per-gym) with a primary index on `gym_id`. Existing trend queries gain a `WHERE session.gym_id = ?` clause behind a single composite index `idx_workout_sessions_gym_started_at`.
- Gym profile list cached in a top-level Zustand slice; invalidated on edit.

**Storage:**
- Pure SQLite, on-device. Zero cloud sync. Existing import/export (`lib/db/import-export.ts`, `lib/db/csv.ts`) extended to round-trip the new tables — no proprietary format change, additive columns.

**Import/export round-trip safety (QD Required Change #4 + TL Required Change #2):** the current import path uses **manual positional column lists** (`lib/db/import-export.ts:665` for `workout_sessions` and `:680` for `workout_sets`) that will silently drop new columns unless audited. **Mandatory implementation checklist** — every PR commit touching the schema must update each of these in lockstep:
1. `lib/db/schema.ts` — drizzle table + column definitions.
2. `lib/db/migrations.ts` — `addColumnIfMissing` calls and `CREATE TABLE IF NOT EXISTS` for new tables (BLD-369 dual-source-of-truth invariant — TL Required Change #1).
3. `lib/db/import-export.ts` — sessions column list (L665 area), sets column list (L680 area), AND both export builders (SELECT lists) AND import insert column lists.
4. `lib/db/csv-import.ts` — header detection + insert column mapping for all new fields.
5. `lib/db/sessions.ts` — any row destructuring / hand-listed selectors.
6. Any other selector or row-mapper that hand-lists columns (search via `grep -rn "INSERT INTO workout_sessions" lib/` and `grep -rn "INSERT INTO workout_sets" lib/`).

A regression test (`__tests__/lib/db/import-export-gym-roundtrip.test.ts`) MUST: create a gym profile, a cable stack with calibrations, log a session with `gym_id` set + a set with `stack_marker` / `stack_id` / `stack_unit_at_log` / `stack_name_at_log` set, export the full DB, import into a fresh DB, then assert byte-for-byte equality on `gym_profiles`, `cable_stacks`, `stack_calibrations`, `workout_sessions.gym_id`, `workout_sessions.gym_name_at_log`, and ALL new `workout_sets` fields.

**Dependencies:**
- None new. Uses existing drizzle-orm, expo-sqlite, Zustand, expo-router. Marker bulk-paste parser is a 30-line pure function (no new lib).

**Migration safety:**
- Migration adds tables + nullable columns only. Existing sessions/sets unaffected; `gym_id` defaults NULL meaning "ungrouped" — single-gym users never see UI changes.
- Reversible: `DROP TABLE` + `ALTER TABLE … DROP COLUMN` paths in down-migration. Follows existing CableSnap migration convention (see learnings index for sqlite ALTER patterns).

## Scope

**In:**
- New tables + columns above.
- Settings → Gym Profiles screen (CRUD) — sole discoverability surface.
- Optional gym chip on Session header (default-gym auto-tag, manual override).
- Marker picker on cable-exercise SetRows — implemented as a **NEW component** `MarkerPickerSheet` (mirrors `VariantPickerSheet` pattern but does not overload it; TL nice-to-have).
- Per-gym filter on Progress trends — single-gym trend display only, no cross-gym comparison view.
- "Sessions by gym" tile with neutral counts framing + `<2 active gyms in last 90 days` suppression rule via `getActiveGymCount(sinceDays = 90)` helper.
- CSV import/export round-trips the new tables; manual row-mapper audit per the Storage checklist above.
- Drizzle dual-source-of-truth invariant: every new table/column lands in BOTH `lib/db/schema.ts` and `lib/db/migrations.ts` in the same commit (TL Required Change #1, BLD-369).
- `setDefaultGym` wrapped in `withTransactionAsync` + partial unique index on `is_default = 1`.
- Snapshot-on-log invariants: `workout_sets.stack_unit_at_log`, `workout_sets.stack_name_at_log`, `workout_sessions.gym_name_at_log`.
- Soft-delete on `cable_stacks.deleted_at` (symmetric with `gym_profiles.deleted_at`).
- e1RM trend query split into two separate query strings (gym-scoped vs all-gyms) — no `OR ? IS NULL` pattern.
- Unit tests for `resolveMarker`, immutability invariant (set.weight stays after stack edit), default-gym uniqueness (transaction + partial-index path), soft-delete preserves session.gym_id, `parseCalibrationBulkPaste` validation matrix, `getActiveGymCount`, e1RM trend query branch selection.
- A11y labels + RN Web layout audit at 390px viewport on the new screens (BLD-1055 regression checklist — marker sheet + gym/marker chips).

**Out:**
- Gym-aware PR / e1RM detection logic (separate plan once data layer ships).
- Cloud sync of gym profiles (offline-first principle).
- Sharing gym profiles between users (out of scope; future increment may export a single gym as JSON).
- Per-stack imagery / photos.
- Auto-detection of gym via geolocation (privacy + scope).
- Plate-loaded barbell calibration (marker concept doesn't generalize cleanly; future increment).
- Any behavior-shaping additions (badges for "10 sessions at 3 gyms" etc.). Out of scope; would re-trigger psychologist review.

## Acceptance Criteria

### Zero-regression & UI gating
- [ ] Given an empty database (zero gym profiles), When the user opens any screen, Then **no gym UI** appears in Session, Progress, or Home — chip, picker, filter pill, "Sessions by gym" tile are all hidden. The `Settings → Gym Profiles` row is the ONLY gym-related surface visible. [gate: QA — manual smoke test on empty DB verifying no gym UI visible]
- [ ] Given exactly one gym profile exists, When the user opens Progress, Then the gym filter pill and "Sessions by gym" tile are still suppressed (per Psych Required Change #1: <2 active gyms in last 90 days). [test: __tests__/lib/db/gym-profiles.test.ts::"returns the count from the SQL query"]

### Marker picker & set logging
- [ ] Given a user creates a gym profile and a cable stack with markers 1=5kg, 5=15kg, 10=30kg, When they tap marker "10" while logging a Cable Pulldown set, Then the set's weight is saved as 30 kg AND `stack_id` + `stack_marker = 10` + `stack_unit_at_log = 'kg'` + `stack_name_at_log` (snapshot of the stack name at log time) are persisted on the set row. [test: __tests__/lib/db/gym-profiles.test.ts::"assigns the next position when none is provided"]

### Calibration immutability (snapshot invariants)
- [ ] Given a previously-logged set with `stack_marker = 10` resolved to 30 kg, When the user later edits the calibration so marker 10 = 32 kg, Then the historical set's `weight` remains 30 kg and the set detail badge still shows "📍 #10 · 30 kg". [test: __tests__/lib/db/calibration-immutability.test.ts::"updating stack calibration does not change historical set snapshots"]
- [ ] Given a previously-logged set whose stack name was "Cable Cross — Left" at log time, When the user later renames the stack to "Cable Cross — Right", Then the historical set badge still shows the original "Cable Cross — Left" (snapshot from `stack_name_at_log`), not the renamed value. [test: __tests__/lib/db/calibration-immutability.test.ts::"renaming a cable stack does not rewrite historical set stack_name_at_log"]
- [ ] Given a session was started at gym "Anytime Fitness Marina", When the user later renames the gym to "Anytime Fitness Marina (closed)", Then historical session detail still attributes the session to the original "Anytime Fitness Marina" via `gym_name_at_log`. [test: __tests__/lib/db/calibration-immutability.test.ts::"renaming a gym does not rewrite historical session gym_name_at_log"]

### Default-gym atomicity
- [ ] Given exactly one gym profile flagged `is_default=1`, When the user marks a different profile default, Then the previous default flips to 0 atomically inside a single `withTransactionAsync` block (verified by mocking the transaction layer in unit test). After the operation, exactly one row has `is_default = 1`. [test: __tests__/lib/db/gym-profiles.test.ts::"runs both UPDATEs inside withTransactionAsync"]
- [ ] Given the partial unique index `idx_gym_profiles_one_default` is supported on the platform, When two concurrent `is_default = 1` writes are attempted, Then only one succeeds and the other raises a constraint error (graceful fallback path tested when partial indexes are unsupported). [gate: QA — concurrent write test for partial unique index constraint]

### Per-gym filter & Sessions by gym tile
- [ ] Given a session tagged with gym G, When the user opens Progress and selects "Gym: G", Then trend cards show only sessions where `gym_id = G`; selecting "All gyms" returns the existing pre-feature behaviour exactly (verified by snapshotting all-gyms output before/after migration). [test: __tests__/lib/db/e1rm-trends-gym.test.ts::"uses the gym-scoped SQL path when a gymId is provided"]
- [ ] Given the per-gym filter is selected, When the user views any trend card, Then **no cross-gym A-vs-B comparison UI** appears anywhere; the screen shows the selected gym's trend in isolation. [gate: QA — visual review of Progress screen under gym filter to confirm no A-vs-B comparison UI]
- [ ] Given fewer than 2 gyms have ≥1 session in the last 90 days, When the user opens Progress, Then the "Sessions by gym" tile is hidden entirely (no empty-state, no skeleton). [test: __tests__/lib/db/gym-profiles.test.ts::"returns 0 when no active gyms"]
- [ ] Given 2+ gyms have ≥1 session in the last 90 days, When the user views the tile, Then it shows session **counts** with the literal label "Sessions by gym" (no percentages, no comparison copy). [test: __tests__/lib/db/gym-profiles.test.ts::"returns the count from the SQL query"]

### Soft-delete & historical attribution
- [ ] Given the user soft-deletes gym G that has 30 historical sessions, When they reopen Progress, Then the 30 sessions remain visible attributed to G's `gym_name_at_log` value, AND the live gym filter dropdown no longer lists G, AND the marker picker / chip pickers no longer offer stacks belonging to G (UI joins on `gym_profiles.deleted_at IS NULL`). [test: __tests__/lib/db/gym-profiles.test.ts::"calls UPDATE with deleted_at and preserves record (no hard delete)"]
- [ ] Given the user soft-deletes a single cable stack inside an active gym, When they view past sets that referenced that stack, Then badges still render with the snapshotted `stack_name_at_log`, AND the live marker picker for new sets no longer offers that stack. [test: __tests__/lib/db/calibration-immutability.test.ts::"soft-deleting the stack does not affect historical set snapshot fields"]

### Calibration validation
- [ ] Given a bulk-paste input `1=5\n2=foo\n0=10\n3=12.5\n3=15\n5=-2`, When the user submits, Then accepted rows are `{1=5, 3=15}` (last-wins on duplicate marker 3, decimals are valid REALs); skipped rows are `{2=foo: non_numeric_weight, 0=10: marker_must_be_positive, 3=12.5: duplicate_marker, 5=-2: weight_must_be_positive}` (overwritten duplicate counted per Tech Approach §Calibration Validation); the toast reads exactly "Added 2 markers. 4 rows skipped." [gate: QA — manual calibration bulk-paste validation test]
- [ ] Given inline marker entry of `marker = 0` or `weight = 0`, When the user attempts to save, Then a field-level error blocks submit ("Marker must be a whole number greater than 0" / "Weight must be greater than 0") and no row is written. [gate: QA — manual inline marker validation test]

### Import/export round-trip
- [ ] Given the user logs a session at gym G with a set logged via marker (all four snapshot fields populated), When they export the full DB and import on a fresh install, Then `gym_profiles`, `cable_stacks` (including `deleted_at`), `stack_calibrations`, `workout_sessions.gym_id`, `workout_sessions.gym_name_at_log`, `workout_sets.stack_id`, `workout_sets.stack_marker`, `workout_sets.stack_unit_at_log`, and `workout_sets.stack_name_at_log` all round-trip losslessly (asserted in `__tests__/lib/db/import-export-gym-roundtrip.test.ts`). [test: __tests__/lib/db/import-export-gym-roundtrip.test.ts::"exports and re-imports gym tables plus session/set snapshot fields"]

### Performance / query planner
- [ ] Given the gym-scoped e1RM trend path runs on a DB with `idx_workout_sessions_gym_started_at`, When `EXPLAIN QUERY PLAN` is run on the trend query, Then the plan uses `idx_workout_sessions_gym_started_at` (verified by test asserting the EXPLAIN output contains the index name). The all-gyms path uses a separate query string and `idx_workout_sessions_started_at`. [test: __tests__/lib/db/e1rm-trends-gym.test.ts::"keeps the explicit gym wrapper wired to the gym-scoped query"]

### A11y & RN Web
- [ ] All new chips, picker rows, and tile elements expose `accessibilityLabel` and `accessibilityHint`. Marker rows announce as "Marker 10, 30 kilograms, button" under VoiceOver / TalkBack. [gate: QA — VoiceOver/TalkBack manual a11y review of chips and marker picker rows]
- [ ] At 390px web viewport, the marker picker sheet, gym chip, and "Sessions by gym" tile render without horizontal clipping (BLD-1055 regression: assert FULL parent-to-child width chain in test). [gate: CI — web viewport 390px layout test asserting no horizontal overflow]

### Cross-cutting
- [ ] PR passes the existing typecheck + jest + e2e suite with zero regressions. [gate: CI — PR check passes all existing typecheck + jest + e2e]
- [ ] No new lint warnings. [gate: CI — lint step passes with zero new warnings]
- [ ] Every new table/column appears in BOTH `lib/db/schema.ts` AND `lib/db/migrations.ts` in the same commit (PR review gate). [gate: PR review — reviewer confirms every new table/column is in both schema.ts and migrations.ts]

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
| Soft-deleted gym referenced by import | Import preserves the exported `deleted_at` value byte-for-byte (a row exported with `deleted_at = 1730000000` imports with `deleted_at = 1730000000`). Lossless round-trip is the contract — import never silently resurrects a soft-deleted gym. Fallback path: only when the referenced gym row is genuinely absent from the export (e.g., partial CSV import, manual archive trimming) does historical attribution fall back to `gym_name_at_log` snapshots, with no new gym row created. |
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
| Schema bloat | Low | Low | Three new tables (`gym_profiles`, `cable_stacks`, `stack_calibrations`) + six nullable additive columns on existing tables (`workout_sessions.gym_id`, `workout_sessions.gym_name_at_log`, `workout_sets.stack_id`, `workout_sets.stack_marker`, `workout_sets.stack_unit_at_log`, `workout_sets.stack_name_at_log`). Drizzle types regenerate cleanly; existing test suite catches drift. |

## Review Feedback
### Quality Director (UX)
**Verdict (rev 1): REQUEST CHANGES** (2026-05-04T16:17:18Z). Five required changes:
1. Clarify zero-regression UI contract (Settings entry allowed, no UI elsewhere with 0 gyms).
2. Define historical display semantics for renamed/deleted gyms+stacks.
3. Promote Progress / Sessions-by-gym safeguards into ACs.
4. Make import/export round-trip safety concrete (audit checklist + regression test).
5. Tighten calibration validation edge cases.

**Rev 2 (this revision) addresses all five:** UX zero-regression contract pinned in Empty/error states + AC; snapshot fields (`stack_name_at_log`, `gym_name_at_log`, `stack_unit_at_log`) added to Technical Approach + ACs; Sessions-by-gym tile copy/suppression promoted to AC + Psych framing locked; import/export checklist + regression test spelled out as numbered steps with file:line citations; full calibration validation matrix + ACs added.

**Verdict (rev 2): REQUEST CHANGES** (2026-05-04T16:43:44Z). Two internal contradictions flagged:
1. Bulk-paste duplicate-marker AC under-counted skipped rows vs Tech Approach.
2. Edge case "soft-deleted gym referenced by import" silently set `deleted_at = NULL`, contradicting lossless round-trip.

Plus non-blocking cleanup: Risk-table schema-bloat row count outdated.

**Rev 3 (this revision) resolves all three:** AC for bulk-paste now counts the overwritten duplicate row as skipped with reason `duplicate_marker` (toast "Added 2 markers. 4 rows skipped."); soft-deleted-gym import edge case rewritten to preserve `deleted_at` byte-for-byte (only fall back to `gym_name_at_log` snapshot when the row is genuinely absent); Risk row updated to reflect 3 tables + 6 nullable columns.

_Awaiting QD re-review on rev 3._
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
**APPROVED for implementation — 2026-05-04T16:48Z (rev 3, commit `4fd1ebc8`).**

| Reviewer | Verdict | Reference |
|---|---|---|
| Tech Lead | ✅ APPROVED (rev 2 stands for rev 3; all 6 conditions folded) | comment 0d8fc347 (16:14Z) + reaffirmation 16:45Z |
| Psychologist | ✅ APPROVED (Classification confirmed NO; 3 conditions folded as binding plan content) | comment e676dee1 (16:10Z) + reaffirmation 16:41Z |
| Quality Director | ✅ APPROVED (rev 3 — both rev 2 internal contradictions resolved; 7 implementation gates remain binding) | comment 16:47Z |

**Binding implementation gates from QD (carried into BLD-1060 spec):**
1. Zero-regression gym UI gating (no gym chrome on session/progress/home with 0 active profiles).
2. Snapshot-on-log historical attribution (`stack_unit_at_log`, `stack_name_at_log`, `gym_name_at_log` write at log time, never retroactively).
3. Import/export round-trip regression test (lossless byte-for-byte for `gym_profiles`/`cable_stacks`/`stack_calibrations` and snapshot fields; soft-deleted `deleted_at` preserved).
4. Calibration validation matrix (bulk-paste with explicit accepted/skipped contract per AC line 217 — duplicate-marker counts toward skipped, last-wins).
5. Sessions-by-gym tile descriptive (counts, not %), 90-day active-gym suppression, single-gym users see no tile.
6. No cross-gym A-vs-B comparison UI in v1 (single-gym trend display only).
7. 390px RN Web width-chain regression test (parent + inner element width assertions per BLD-1055 learning).

Implementation issue: BLD-1060 (claudecoder).
