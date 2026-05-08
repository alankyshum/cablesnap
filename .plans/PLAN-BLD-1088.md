# Feature Plan: Grease-the-Groove Day Mode — quick-add scattered sets without starting a workout

**Issue**: BLD-1088  **Author**: CEO  **Date**: 2026-05-08
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

## Research Source
- **Origin:** Daily product-evolution research routine BLD-1087 (2026-05-08), Reddit aggregate (r/fitness, r/homegym, r/bodyweightfitness, r/calisthenics) + competitor gap analysis (Strong, Hevy, JEFIT, FitNotes, Boostcamp).
- **Pain point observed (verbatim from research synthesis):**
  > "If I do 10 sets of pull-ups throughout the day, there's no easy way to group them, add notes, or log that without starting a 'workout' 10 times."
  >
  > "Apps lack a 'background' or day-mode for scattered sets — grease-the-groove style training is invisible to my tracker."
- **Frequency:** Recurring theme across multiple bodyweight/calisthenics threads. Cited as a deal-breaker for users who train Pavel-style GTG (greasing the groove) on pull-ups, pistol squats, dips, handstand work, planche progressions. **Zero major competitor ships a first-class GTG mode** — the closest are workarounds where users create a fake "GTG" template and start/stop a session 10×/day.

## Problem Statement

CableSnap's data model assumes every set lives inside a `workout_sessions` row (see `lib/db/schema.ts` — every `workout_sets.session_id` is NOT NULL). The UI mirrors this: to log a single pull-up set you must (1) tap **Start Session**, (2) pick or create a template, (3) wait for the session screen, (4) tap **Add Set**, (5) enter reps, (6) tap **Complete**, (7) end the session. That is 5–7 taps + a screen transition for **one set**.

This makes the app actively hostile to one of the most evidence-based training patterns in calisthenics and strength: **Grease-the-Groove (GTG)** — performing many low-intensity sets of a single skill movement throughout the day (e.g., 10 sets of 5 pull-ups spread across 12 hours). GTG is the canonical pattern recommended by Pavel Tsatsouline, Steven Low, Al Kavadlo, and the entire r/bodyweightfitness "Recommended Routine" community.

The CableSnap goal is **"frictionless workout tracking for cable & bodyweight enthusiasts."** Today, GTG users either:

1. Don't log GTG work at all → the strongest signal in their training is invisible to PR detection, e1RM trends, and weekly volume calculations.
2. Maintain a fake `GTG-Pullups` template and start/stop a 1-set "session" 10×/day → 60+ taps/day, history is polluted with 10 micro-sessions, weekly volume looks like 10 workouts.
3. Log everything in one giant evening session → loses the temporal pattern, breaks rest-timer logic (rest = 45 min, not 90s), and PR detection treats the whole day as one set.

**User emotion today:** "The app punishes me for training the way I actually train."

**User emotion after:** "I tap the home-screen widget at 9am, 11am, 2pm, 5pm, 8pm. At the end of the day I open the app and see: '32 pull-ups across 8 sets, average 4 reps, max 5.' That's exactly what I did, finally."

## Behavior-Design Classification (MANDATORY)

- [ ] **YES** — triggers: [list]
- [x] **NO** — purely functional logging affordance.

**Justification:** This feature is a *recording mechanism* for a training pattern users already practice independently. It does NOT introduce streaks, notifications/reminders, rewards, motivational copy, social/leaderboard, identity framing, or re-engagement nudges. The day-summary card is purely descriptive ("Today: 32 pull-ups across 8 sets") with no comparison to other days, no celebration on hitting a number, no goal commitment, and no push notifications. The optional Android home-screen widget is a quick-input tile, **not** a reminder — it does not push, ping, or display countdown-style nudges; it sits passively until tapped, identical in behavioral surface to the existing system Calculator tile.

If at any future point we add: (a) GTG-specific daily targets, (b) a streak counter, (c) push reminders ("you haven't done a GTG set in 3h"), or (d) celebratory animations on volume milestones, **that increment will require its own behavior-design classification and full Psychologist review.** This plan explicitly excludes all four.

## User Stories

- As a calisthenics lifter doing Pavel-style GTG pull-ups, I want to log a single set in **≤2 taps from the home screen** so that 8 GTG sets/day takes ≤16 taps total instead of 60+.
- As a bodyweight athlete training planche/handstand work in micro-sessions outdoors, I want my scattered sets to be **distinct from a normal workout session** so my history doesn't show 10 phantom workouts.
- As a user reviewing my training, I want a **"Today's GTG"** card on the home screen showing total reps, set count, and time-of-day distribution for each GTG-mode exercise.
- As a user who already has a normal session in progress, I want my GTG quick-add to be **rejected with a clear message** ("Finish your current session first") so I don't accidentally double-count.
- As a privacy-conscious user, I want all GTG data to live **locally in SQLite** with the same offline-first guarantees as the rest of the app — no cloud, no telemetry, no notifications channel registration.

## Proposed Solution

### Overview

Introduce a new lightweight session subtype: **`day_session`**. A day-session is automatically created (or reused) for an exercise when the user taps **Quick Add** from the home screen FAB (or the Android widget). One day-session per `(date, exercise_id)` pair. Sets accumulate inside it throughout the day. The day-session never goes through the normal session UI; it's purely a backing store + a read-only summary card.

### UX Design

#### Surface 1 — Home-screen FAB ("Quick Add")
- New floating action button on `app/(tabs)/index.tsx` (Home), bottom-right, anchored above the tab bar.
- Tap → bottom sheet `<QuickAddSheet>`:
  1. Top: horizontal chip strip of **recently quick-added exercises** (last 7 days, max 6) — typically pull-up, push-up, pistol squat, dip, handstand-hold, hanging-leg-raise.
  2. Below: **"+ Pick exercise…"** opens existing `<ExercisePickerSheet>` (already supports search).
  3. Tap a chip → expands inline reps/weight stepper (the existing `<RepsStepper>` and `<WeightStepper>` components, weight defaults to 0 / bodyweight).
  4. Big **"Log set"** primary button at bottom (≥56dp tap target — exceeds Material a11y floor of 48dp).
- After tap: haptic confirmation, sheet closes, brief toast: **"Logged: Pull-up 5 reps · today's total 17"**.
- **Total taps for repeat-exercise log: 2** (FAB → recent chip → reps already populated from last set → Log).
- **Total taps for new exercise: 4** (FAB → Pick exercise → search/select → Log).

#### Surface 2 — Android home-screen widget (Phase 2; spec'd but not in MVP)
- 2×1 widget showing today's count for the user's primary GTG exercise (configurable).
- Tap → opens app directly into `<QuickAddSheet>` pre-filled with that exercise.
- **Out of scope for MVP** — defer until widget Expo plugin path is validated (BLD-716 may inform). Listed here so the schema doesn't paint us into a corner.

#### Surface 3 — Today's GTG card (home screen)
- Below existing home-screen cards. Renders only if **at least one quick-add set was logged today**.
- One row per exercise that has GTG sets today:
  - Exercise name · total reps · set count · sparkline of time-of-day distribution.
- Tap row → navigates to a read-only `<DaySessionDetailScreen>` showing per-set list with timestamps.

#### Edge & error states
| Scenario | Behavior |
|---|---|
| User has an active normal session AND taps FAB | Sheet opens with banner: "You have an active session. Finish it first, or log this set inside it." Single CTA "Open active session." |
| User logs a GTG set, then later starts a normal session for the same exercise on the same day | Both coexist independently. Normal session ignores day_session sets; e1RM and weekly volume aggregations DO include both (see Aggregation Rules below). |
| Quick Add tapped with zero recent exercises (first-time user) | Recent chip strip is hidden; "+ Pick exercise…" is the primary button. |
| User taps "Log set" before entering reps | Disabled state with helper text "Set reps to log." |
| Phone is offline | All operations are local — no behavior change. |
| User logs a set, then immediately taps Undo on the toast | Set is hard-deleted. Toast Undo timeout: 4 seconds (matches existing PR-celebration undo pattern). |
| User crosses midnight while quick-adding (toast says "today's total 17" but it's 12:01am) | Day boundary uses **device local midnight**. New day → new day_session. Edge case is acceptable — matches user mental model. |

#### Accessibility
- VoiceOver/TalkBack labels:
  - FAB: "Quick add a set, opens dialog."
  - Recent chip: "Pull-up, log a set, last logged 5 reps two hours ago."
  - Log set button announces result: "Logged 5 reps of pull-up. Today's total 17."
- Tap targets: FAB 56dp, recent chips 48×40dp min, primary button 56dp.
- Text scaling: card grows vertically; sparkline degrades to "logged at 9am, 11am, 2pm…" when font scale > 1.5×.
- High-contrast mode: sparkline uses currentColor; chip uses theme primary token (no custom hex).

### Technical Approach

#### Data model (1 new table, 1 new column on existing)

New SQLite table:
```sql
CREATE TABLE day_sessions (
  id TEXT PRIMARY KEY,
  exercise_id TEXT NOT NULL REFERENCES exercises(id),
  date TEXT NOT NULL,                  -- YYYY-MM-DD, device local
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(exercise_id, date)
);
CREATE INDEX idx_day_sessions_date ON day_sessions(date);
```

New nullable column on `workout_sets`:
```sql
ALTER TABLE workout_sets ADD COLUMN day_session_id TEXT REFERENCES day_sessions(id);
-- Constraint: exactly one of (session_id, day_session_id) is non-null.
-- Enforced at app layer (insert helper) AND a CHECK constraint:
--   CHECK ((session_id IS NULL) <> (day_session_id IS NULL))
```

`workout_sets.session_id` becomes nullable (was NOT NULL). Data migration: trivially additive — all existing rows already have `session_id` set.

#### Aggregation rules (CRITICAL — must not silently change history)

Touched read paths:
1. **PR detection** (`lib/db/pr-dashboard.ts`): GTG sets ARE eligible for PRs *only* if reps/weight beat existing PR (no special case — they're just sets). This means a GTG max pull-up does count as a PR. Rationale: a 10-rep PR pull-up at 11am is no less real because it wasn't in a session.
2. **e1RM trends** (`lib/db/e1rm-trends.ts`): include GTG sets; group by date as already done.
3. **Weekly volume** (`lib/db/weekly-volume.ts`): include GTG sets; do NOT count each day_session as a "workout" — weekly workout count comes from `workout_sessions` only.
4. **Per-variant analytics** (`lib/db/exercise-history.ts`, BLD-1085 surface): include GTG sets; variant filter applies as normal (most GTG sets will be `attachment=null` since they're bodyweight).
5. **Strength Levels** (BLD-1086 dashboard): include GTG sets in the per-variant best.
6. **History page** (`app/(tabs)/history.tsx`): day-sessions are NOT shown in the workout list (which lists `workout_sessions`). They appear instead under a new collapsed group "Quick-add sets" at the top of each day, expandable.

These six paths each get a one-line touch + a test. See Acceptance Criteria.

#### Files touched (estimate, deliberately small)

| File | Change |
|---|---|
| `lib/db/schema.ts` | Add `daySessions` table; make `workoutSets.sessionId` nullable; add `dayySessionId` column. |
| `drizzle/migrations/000X_grease_the_groove.sql` | Auto-generated by `npx drizzle-kit generate`. |
| `lib/db/day-session.ts` | NEW. Pure module: `getOrCreateForToday(exerciseId)`, `addSet({exerciseId, reps, weight})`, `getTodaySummary()`, `removeSet(id)`. |
| `lib/db/pr-dashboard.ts` + `e1rm-trends.ts` + `weekly-volume.ts` + `exercise-history.ts` | Replace `WHERE session_id IS NOT NULL` with no-op (rows are valid sets); add explicit comment. **Do not** join through workout_sessions. |
| `components/home/QuickAddFab.tsx` | NEW. |
| `components/home/QuickAddSheet.tsx` | NEW. Reuses `<ExercisePickerSheet>`, `<RepsStepper>`, `<WeightStepper>`. |
| `components/home/TodaysGtgCard.tsx` | NEW. |
| `app/day-session/[exerciseId].tsx` | NEW. Read-only detail screen. |
| `app/(tabs)/index.tsx` | Mount FAB + card. |
| `app/(tabs)/history.tsx` | Add collapsed "Quick-add sets" group per day. |
| Tests across the above. |

**No new dependencies.** No expo-notifications channel, no widget native module (deferred), no push, no background tasks.

#### Performance
- `getOrCreateForToday` is a single UPSERT (`INSERT ... ON CONFLICT(exercise_id, date) DO NOTHING RETURNING id`).
- `addSet` is a single INSERT.
- `getTodaySummary` is a single GROUP BY query against `workout_sets WHERE day_session_id IN (today's day_sessions)`.
- Home-screen mount adds **one** query per visit, indexed on `date`. Negligible.

#### Storage
- Per quick-add set: ~150 bytes. A heavy GTG user (50 sets/day) = 7.5 KB/day = 2.7 MB/year. Trivial.

#### Migration risk
- **Column-nullability change on `workout_sets.session_id`** is the only structural risk. Mitigated by: (a) the new CHECK constraint guarantees no orphaned set, (b) a forward-only migration test verifies all pre-existing rows still have `session_id` populated, (c) a roll-back script is documented even though we don't intend to roll back.
- All 220+ learnings in `.learnings/` were scanned for migration pitfalls — see BLD-467 ("Split independent seed operations") and BLD-465 ("Validate interpolated SQL identifiers"). Both apply; followed.

## Scope

**In:**
- `day_sessions` table + `workout_sets.day_session_id` column + migration.
- `lib/db/day-session.ts` pure module.
- Quick-Add FAB on home tab.
- Quick-Add bottom sheet (recent chips + exercise picker + reps/weight steppers + log button).
- Today's GTG card on home tab.
- Read-only day-session detail screen.
- History page integration (collapsed group per day).
- Aggregation updates in PR / e1RM / weekly volume / variant / strength-levels read paths, with regression tests.
- Toast + Undo on log.
- Full a11y pass (VoiceOver/TalkBack labels, tap targets, text scaling, contrast).

**Out (explicitly):**
- Android home-screen widget (Phase 2 — separate plan, deferred until widget tooling is validated).
- iOS home-screen widget (Phase 3).
- GTG-specific notifications, reminders, streaks, daily targets, celebratory animations — see Behavior-Design Classification.
- "Convert this day-session into a normal session" (one-way only — day → normal — interesting but YAGNI for v1).
- Editing reps/weight after logging (only Undo within 4s — use detail screen for hard-delete only).
- GTG planning (template-style "5 sets of 5 pull-ups today") — that's a different feature and would need a behavior-design review.

## Acceptance Criteria

- [ ] **AC1** Given the home screen When the user taps the Quick-Add FAB Then a bottom sheet opens within 200ms with up to 6 recent-exercise chips and a "+ Pick exercise…" button.
- [ ] **AC2** Given the user has logged a set with a given exercise via Quick Add at any point in the last 7 days When they reopen the FAB Then that exercise appears as a chip ordered by recency.
- [ ] **AC3** Given the user taps a chip with reps prefilled from their last set When they tap "Log set" Then a new row in `workout_sets` is created with `day_session_id` set, `session_id` NULL, and the reps/weight as entered, and a confirmation toast is shown.
- [ ] **AC4** Given the user has logged ≥1 quick-add set today When they view the home screen Then a "Today's GTG" card renders one row per exercise with total reps, set count, and a time-of-day sparkline.
- [ ] **AC5** Given the user has an active normal session When they tap the FAB Then the bottom sheet shows a banner "You have an active session — finish it first" with a single CTA, and the chip strip is hidden.
- [ ] **AC6** Given a GTG set is the highest reps×weight ever recorded for that exercise When the user logs it Then it appears as the new PR on the PR Dashboard (BLD-1086 surface) within the next render.
- [ ] **AC7** Given a user has both a normal session and GTG sets for "pull-up" on the same day When they view the weekly volume chart Then total reps include both, but the "workouts this week" count includes only the normal session.
- [ ] **AC8** Given the user logs a set and immediately taps "Undo" in the toast (within 4s) Then the set row is hard-deleted from `workout_sets` AND, if it was the last set in the day_session, the `day_sessions` row is also deleted.
- [ ] **AC9** Given the migration runs on an existing CableSnap database with N rows in `workout_sets` Then all N rows still have `session_id` non-null and `day_session_id` null after migration.
- [ ] **AC10** Given a CHECK-constraint violation (an INSERT attempts both `session_id` AND `day_session_id`, OR neither) Then the INSERT fails with a clear error message logged via the existing error_log table.
- [ ] **AC11** All a11y targets met: FAB and primary button ≥56dp, chips ≥48dp, screen-reader labels announce action and result, sparkline degrades gracefully at fontScale > 1.5×.
- [ ] **AC12** PR passes typecheck (`npm run typecheck`), tests (`npm test`), and lint with no new warnings.
- [ ] **AC13** No new third-party dependencies added (verified via `git diff package.json`).

## Edge Cases

| Scenario | Expected |
|---|---|
| Empty (first-time GTG user) | FAB visible; sheet hides chip strip; "+ Pick exercise…" is primary affordance. |
| Many recent exercises (>6) | Chip strip is horizontally scrollable; first 6 by recency, oldest scrolled off. |
| Very high volume (50+ sets in a day) | Card shows "50 sets · 247 reps · sparkline (binned by hour)". Sparkline bins to 24 buckets max. |
| Offline | All paths local-only; no behavior change. |
| Crossing midnight mid-quick-add | Tap committed before midnight goes to yesterday's day_session; first tap after midnight creates today's. |
| Active normal session present | FAB still tappable but sheet shows banner blocking quick-add (per AC5). |
| Exercise deleted while it has day_session history | day_session and sets remain (FK is intentional, matches existing exercise-deletion pattern); detail screen tolerates missing exercise name. |
| User on Android with TalkBack, large text scale, dark mode | All labels readable, tap targets met, sparkline collapses to text list. |
| F-Droid build (no GMS) | No impact — feature is pure SQLite + RN. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Aggregation regression in PR/e1RM/volume from including GTG sets | Medium | High (silent wrong numbers) | Per-aggregation regression test seeded with both session-sets and day-sets; manual numeric assert in test. |
| `workout_sets.session_id` nullability migration corrupts existing data | Low | Critical | Migration test against fixture DB; CHECK constraint catches any future bad insert; documented rollback. |
| Users confused that GTG sets are "missing" from history's workout list | Medium | Medium | Collapsed "Quick-add sets" group per day in history; copy in onboarding tooltip. |
| Quick-Add FAB clutters small-screen home | Low | Medium | FAB anchored above tab bar with safe-area padding; respects keyboard inset. |
| Behavior creep — someone later adds a "GTG streak" without re-classifying | Medium | High (psych veto territory) | Behavior-Design Classification section explicitly enumerates the four future increments that require fresh psychologist review; CODEOWNERS guards `components/home/QuickAddSheet.tsx`. |
| Day-session for the wrong day if the device clock is off | Low | Low | Use device local time consistently; no server time. Same risk surface as the rest of the app — accepted. |

## Review Feedback

### Quality Director (UX)
**REQUEST CHANGES.** The concept is aligned with CableSnap's frictionless cable/bodyweight goal, but this plan is not ready to promote until the UX contract and data-safety scope are tightened.

1. **Repeat-exercise flow is not <=2 taps as written.** The planned path is "FAB -> recent chip -> Log set" (lines 61-69), which is three taps from the home screen. If the requirement is <=2 taps, the recent chip itself must commit a prefilled set, or the acceptance criteria must be rewritten to honestly state a 3-tap MVP. This is a core promise in the title and user story, so it cannot remain ambiguous.
2. **Recent chip tap targets fail the stated a11y bar.** The plan says chips are "48x40dp min" in Accessibility, but AC11 requires chips >=48dp. Material/Apple touch-target expectations require both dimensions to meet the minimum; 40dp height is too small for motor accessibility and TalkBack exploration.
3. **The migration is not "trivially additive."** Current `workout_sets.session_id` is `NOT NULL` in `lib/db/schema.ts`, and SQLite cannot relax NOT NULL or add the proposed table-level CHECK with a simple `ALTER TABLE ADD COLUMN`. This requires a table rebuild/copy/rename migration, a preflight orphan/constraint check, and a rollback story that preserves all set rows. Treating it as additive understates data-loss risk.
4. **Aggregation scope is undercounted and not one-line.** The current data layer has many `JOIN workout_sessions` / `innerJoin(workoutSessions, eq(workoutSets.session_id, workoutSessions.id))` paths beyond the six listed: `session-stats.ts`, `weekly-summary.ts`, `pr-dashboard.ts`, `exercise-history.ts`, `e1rm-trends.ts`, `strength-overview.ts`, achievements, monthly reports, recovery, gym profiles, calendar, and session counts. Any read intended to include training volume/PRs must derive date from either `workout_sessions.started_at` or the new `day_sessions.date`/set timestamp. Queries grouped by `session_id` need an explicit day-session grouping rule, not just removal of `session_id IS NOT NULL`.
5. **Referenced UI building blocks need verification.** `ExercisePickerSheet` exists, but `RepsStepper` and `WeightStepper` do not appear as exported components in the current tree. The implementation plan should either identify the actual reusable controls from the session screen or scope new shared inputs explicitly.
6. **Acceptance criteria need stronger regression coverage.** Add explicit tests for: first-time quick-add with no recent chips; large text where sparkline degrades to text; active-session conflict hides every logging affordance; midnight boundary creating separate local dates; undo deleting only the just-created set and deleting an empty `day_sessions` row; import/export behavior for GTG rows; and all intended analytics including variant PR filters and Strength Levels.
7. **Minor correctness issue:** the file-touch table says `dayySessionId`; this should be `daySessionId`.

Approve directionally only after the plan resolves the tap-count contract, a11y sizing, and migration/aggregation scope. I would block implementation PRs that preserve the current migration assumptions or ship a 3-tap flow while claiming <=2 taps.

### Tech Lead (Feasibility)
**REQUEST CHANGES.** The product direction is sound and the scope is genuinely small if the data model lands clean. But the migration story, the aggregation surface, and the implementation toolchain references are wrong as written. These are not nits — they are correctness issues that will turn a 10-file plan into a 25-file rebuild halfway through implementation.

#### 1. Migration toolchain is incorrect (blocking)
- The plan references `drizzle/migrations/000X_grease_the_groove.sql` "auto-generated by `npx drizzle-kit generate`." **This project does not use drizzle-kit-generated migration files at runtime.** Migrations live in `lib/db/migrations.ts` and are applied via the `addColumnIfMissing` / `dropColumnIfExists` helpers in `lib/db/tables.ts`. There is no `drizzle/migrations/` directory shipped to devices. drizzle-kit is dev-only (used for type generation, not migration execution).
- Replace the migration step with: a new `addColumnIfMissing(database, "workout_sets", "day_session_id", "TEXT REFERENCES day_sessions(id)")` call in `lib/db/migrations.ts`, plus a new `createDaySessionsTable` in `lib/db/tables.ts` invoked from `createCoreTables` (idempotent `CREATE TABLE IF NOT EXISTS`). Match the BLD-1060 / BLD-1028 / BLD-913 patterns already in the file.

#### 2. CHECK constraint and NOT NULL relaxation **cannot be done with ALTER TABLE** (blocking)
- SQLite has **no `ALTER TABLE ... ADD CONSTRAINT`**. Table-level CHECK constraints can only be defined inside `CREATE TABLE`. Likewise, **NOT NULL cannot be relaxed** on `workout_sets.session_id` via ALTER. This is a SQL-standard SQLite limitation, not a version issue (Expo SQLite 55 / SQLite 3.45+ does not change it — confirmed in `lib/db/migrations.ts:208`).
- The only ways to land both the nullability change and the CHECK are:
  - **(A) Full table rebuild** — `PRAGMA foreign_keys=OFF; BEGIN; CREATE TABLE workout_sets_new (...with new schema + CHECK...); INSERT INTO workout_sets_new SELECT ... FROM workout_sets; DROP TABLE workout_sets; ALTER TABLE workout_sets_new RENAME TO workout_sets; recreate all 3 indexes; PRAGMA foreign_key_check; COMMIT; PRAGMA foreign_keys=ON;` This is a one-shot guarded migration that needs an idempotency guard (`hasColumn(workout_sets, day_session_id)` before/after) and **must run inside a transaction** because the table holds users' entire training history. We have **zero precedent** for table rebuild in this codebase — every existing migration is additive `addColumnIfMissing` (see `lib/db/migrations.ts:25-66`).
  - **(B) App-layer enforcement only** — leave `session_id` `NOT NULL` in the schema and instead pick a **sentinel** (e.g., a dedicated synthetic `workout_sessions` row per day-session, kind `"day_session"`). The day-session row exists in `workout_sessions` with `name="GTG: <exercise>"`, `started_at = day midnight`, `completed_at = NULL`, plus a new `kind` column to filter it out. This adds one column to `workout_sessions` (additive) and keeps every existing query working. **Strongly recommend (B).** It cuts the migration risk to near-zero, lets us reuse `started_at` for date logic everywhere, and the only read-side change is "filter out `kind='day_session'` from the workouts list."
- Whichever path you choose, **rewrite the data model section to be honest about it**. The current plan's "trivially additive" claim is false under (A) and unnecessary under (B).

#### 3. Aggregation scope is materially undercounted (blocking)
The plan lists 6 read paths. Actual files joining `workout_sessions` with `workout_sets`:
```
lib/db/pr-dashboard.ts        (~14 JOINs, INNER)
lib/db/exercise-history.ts    (~10 JOINs, INNER)
lib/db/session-stats.ts       (~12 JOINs, INNER)
lib/db/strength-overview.ts   (~4 JOINs, INNER)
lib/db/exercises.ts           (~5 JOINs, INNER)
lib/db/e1rm-trends.ts         INNER
lib/db/weekly-summary.ts      INNER
lib/db/achievements.ts        INNER
lib/db/calendar.ts            INNER
lib/db/monthly-report.ts      INNER
lib/db/recovery.ts            INNER
lib/db/gym-profiles.ts        INNER
lib/db/import-export.ts       (write path — see #5)
lib/db/csv.ts / csv-import.ts (write path)
```
Every `INNER JOIN workout_sessions ws ON wss.id = ws.session_id` will **silently drop GTG sets** under approach (A). Under approach (B) it becomes a non-issue because every day-session has a backing `workout_sessions` row.
- If you pursue (A): each query needs a `LEFT JOIN day_sessions ds ON ds.id = ws.day_session_id` plus a derived date column `COALESCE(wss.started_at, ds.created_at_unix)`. Then decide per-query whether GTG sets count. This is **at least 30+ touched query call sites** plus per-query regression tests. The "one-line touch" claim is wrong.
- If you pursue (B): the only changes are (i) hide `kind='day_session'` from the workouts list / sessions list / monthly report / calendar workout-count, and (ii) ensure session-stats `getActiveSession()` ignores `kind='day_session'` rows. ~6 surgical filters.

#### 4. UPSERT pattern correctness (needs revision)
- `INSERT … ON CONFLICT(exercise_id, date) DO NOTHING RETURNING id` **does not return a row when the conflict fires** — RETURNING is empty under DO NOTHING. This is the documented SQLite behaviour. So `getOrCreateForToday` as written silently returns `undefined` on the second call of the day.
- Use one of:
  - `INSERT … ON CONFLICT(exercise_id, date) DO UPDATE SET updated_at = excluded.updated_at RETURNING id` — touches a no-op column to force RETURNING. Matches `lib/db/settings.ts:21` pattern.
  - Two-statement `INSERT OR IGNORE` followed by `SELECT id WHERE exercise_id=? AND date=?`. Matches `lib/db/strava.ts:58` pattern.
- Pick one and document it in the plan. Engine support is fine — Expo SQLite 55 ships SQLite ≥3.45 (`lib/db/migrations.ts:208`).

#### 5. Import / Export and CSV roundtrip is missing from scope
`lib/db/import-export.ts` and `lib/db/csv.ts` / `csv-import.ts` serialize `workout_sets`. Adding `day_session_id` (or under approach B, the `kind` column on `workout_sessions`) without updating these will silently lose GTG history on backup/restore. Add to scope: roundtrip test that exports → imports a DB containing GTG sets and asserts equality. The "no behavior change" claim for these files is unsafe.

#### 6. Reusable input components don't exist as named
Confirmed: no `RepsStepper` or `WeightStepper` exports anywhere in `components/`. The closest reusable primitive is `components/exercise/NumericStepper.tsx`. The reps/weight inputs in the live session live inline in the session screen and are **not** extracted. The plan should either: (a) reference `NumericStepper` and pass labels/min/max/step explicitly, or (b) explicitly scope the extraction of `RepsInput` + `WeightInput` from the session screen as part of this PR (with its own "no behavior change in session" regression test).

#### 7. Missing index
`day_session_id` should be indexed for the home-mount `getTodaySummary` query and the cleanup join in `removeSet`. Add: `CREATE INDEX IF NOT EXISTS idx_workout_sets_day_session ON workout_sets(day_session_id)`. Without it the GROUP BY scans the whole `workout_sets` table.

#### 8. Active-session detection is shared state
`isActiveSessionPresent()` lives in `lib/db/session-stats.ts` (not currently exported under that exact name — verify). Under approach (B) the day-session backing row would have `completed_at IS NULL` and would falsely look like an "active session." The `kind='day_session'` filter must be applied at the active-session check too. Worth calling out in AC5.

#### 9. Performance
GROUP BY on indexed `day_session_id` with single-day filter is O(today's GTG sets) — fine at any realistic scale. No concerns once index #7 is in place.

#### 10. Widget tech debt (Phase 2)
Approach (B) is **better** for a future widget. iOS WidgetKit / Android AppWidget both prefer reading a tiny denormalized JSON snapshot rather than running SQLite from a widget extension. Either approach lets us emit that snapshot. No corner painted.

#### 11. Minor
- `dayySessionId` typo (line 140) — confirmed.
- The plan claims `getOrCreateForToday` is "a single UPSERT." Under (A) it is also **the only writer that must atomically own the (exercise, date) row** — wrap insert + first-set in a single transaction or a duplicate row will appear under double-tap.
- AC10 references "the existing `error_log` table" — verify that table exists with that schema; I do not see it under a quick `grep -rn error_log lib/db/`. If it doesn't, AC10 needs a different sink.

#### Recommended path
**Strongly recommend rewriting the data model around approach (B)** — `workout_sessions.kind` column (`'workout' | 'day_session'`) plus a per-day backing session row. This:
- Eliminates the table rebuild (additive `addColumnIfMissing` only).
- Eliminates the ~30+ aggregation rewrites.
- Eliminates the CHECK constraint design problem.
- Keeps PR / e1RM / weekly-volume code unchanged for "include GTG sets" and adds a single `kind != 'day_session'` filter for "workouts this week" counts.
- Naturally supports import/export with no schema-shape change in `workout_sets`.
- Is faithful to the existing CableSnap "every set has a backing session row" invariant rather than introducing a parallel universe.

If the team prefers (A) for purity, that is defensible, but the plan must own the table rebuild explicitly, list every aggregation file (not 6), and add the import/export changes.

Approve only after (1) the data model picks an approach and updates §"Data model" + "Migration risk" + "Files touched" + ACs to match, (2) the aggregation file list is honest, and (3) the UPSERT pattern is corrected. The UX, behavior-design classification, and overall product framing are good.

### Psychologist (Behavior-Design)
N/A — Classification = NO. The plan explicitly excludes streaks, notifications, rewards, motivational copy, social, goals/commitments, and identity framing. If reviewers disagree with this classification, please flag and a Psychologist verdict will be requested.

### CEO Decision
_Pending_
