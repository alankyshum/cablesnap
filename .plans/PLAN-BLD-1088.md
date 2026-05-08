# Feature Plan: Grease-the-Groove Day Mode — quick-add scattered sets without starting a workout

**Issue**: BLD-1088  **Author**: CEO  **Date**: 2026-05-08
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED
**Revision**: v3 (2026-05-08) — adopts Tech Lead's recommended Approach B (backing-session + `workout_sessions.kind` column). v1/v2 (parallel `day_sessions` table with `session_id` nullable) is RETIRED. Addresses every QD and Tech Lead concern; see Review Feedback for change-by-change response.

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
  1. Top: horizontal chip strip of **recently quick-added exercises** (last 7 days, max 6) — typically pull-up, push-up, pistol squat, dip, handstand-hold, hanging-leg-raise. Each chip displays the exercise name and the reps/weight from the user's **last** quick-add of that exercise (e.g., "Pull-up · 5 reps").
  2. Below: **"+ Pick exercise…"** opens existing `<ExercisePickerSheet>` (already supports search).
  3. **Tap a chip → IMMEDIATELY commit a set** with the prefilled reps/weight from the last quick-add. No further confirmation. Sheet closes; toast appears with 4-second Undo. **This honours the ≤2-tap promise.**
  4. **Long-press chip (or chip's "✎" affordance) → opens edit drawer** with `<NumericStepper>` for reps and weight, then a **"Log set"** primary button (≥56dp). Edit path is for first-time chip use, weight changes, or per-set rep variation.
  5. **First-time / new exercise path** (chip absent) → `+ Pick exercise…` → exercise picker → edit drawer (steppers prefilled to defaults: reps=1, weight=0/bodyweight) → "Log set". Total: 4 taps.
- After tap: haptic confirmation, sheet closes, brief toast: **"Logged: Pull-up 5 reps · today's total 17"** with Undo.
- **Tap budget (canonical):**
  - Repeat-exercise log (chip prefilled): **2 taps** (FAB → chip).
  - Repeat-exercise log with edit: **4 taps** (FAB → long-press chip → adjust stepper → Log).
  - New exercise first log: **4 taps** (FAB → Pick exercise → select → Log).
- The 2-tap path requires that the chip's prefilled reps/weight match the user's intent. We accept that GTG users typically perform a fixed prescription (e.g., "5 pull-ups every hour"), which is exactly when 2-tap shines. Users who vary reps per set use the edit path (4 taps) — still better than the current 5–7-tap session flow.

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
- Tap targets: FAB 56dp, **recent chips 48×48dp on both axes** (Material 3 / Apple HIG floor) with 56×56 `hitSlop`, primary button 56dp.
- Text scaling: card grows vertically; sparkline degrades to "logged at 9am, 11am, 2pm…" when font scale > 1.5×.
- High-contrast mode: sparkline uses currentColor; chip uses theme primary token (no custom hex).

### Technical Approach

#### Data model — Approach B: backing session + `kind` column (NEW in v3)

**No new tables.** **No nullability relaxation.** **No CHECK constraint gymnastics.** A single additive column on `workout_sessions` plus an optional indexed lookup column. This preserves the codebase's invariant that *every set has a backing session row*, which means almost every existing aggregation query continues to work unchanged.

**1) Add `kind` to `workout_sessions`** (idempotent, additive):
```sql
ALTER TABLE workout_sessions
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'workout';   -- 'workout' | 'day_session'
```
Applied via `addColumnIfMissing(database, "workout_sessions", "kind", "TEXT NOT NULL DEFAULT 'workout'")` in `lib/db/migrations.ts` — matches the pattern at `lib/db/migrations.ts:27-37`. All pre-existing rows default to `'workout'`. No data migration needed.

**2) Add a uniqueness lookup index for the GTG one-row-per-day-and-exercise invariant.** Because `workout_sessions` already has columns for `started_at` and (separately) per-exercise grouping is not in its schema, we use a small helper column for fast lookup + a partial unique index:
```sql
ALTER TABLE workout_sessions
  ADD COLUMN day_session_exercise_id TEXT DEFAULT NULL REFERENCES exercises(id);
ALTER TABLE workout_sessions
  ADD COLUMN day_session_date TEXT DEFAULT NULL;     -- YYYY-MM-DD, device local

CREATE UNIQUE INDEX IF NOT EXISTS uniq_day_session_per_exercise_date
  ON workout_sessions(day_session_exercise_id, day_session_date)
  WHERE kind = 'day_session';
```
Both columns are NULL for `kind='workout'` rows; both are NOT NULL by app contract for `kind='day_session'` rows (enforced by the insert helper, since SQLite cannot add a CHECK via ALTER). The partial unique index gives us the (exercise, date) uniqueness that v1/v2 expressed via `day_sessions.UNIQUE(exercise_id, date)`.

**3) Backing session row per (exercise, date).** When the user taps Quick Add, `getOrCreateDaySessionForToday(exerciseId)` UPSERTs a `workout_sessions` row with `kind='day_session'`, `started_at = device-local midnight` (so all date math just works), `completed_at = NULL` (the row is "open" by design), `name = "GTG: <exercise name>"`, `day_session_exercise_id = exerciseId`, `day_session_date = today`. Every quick-add set then inserts a normal `workout_sets` row with `session_id` pointing at this backing row. **Schema of `workout_sets` is unchanged.**

**4) UPSERT pattern (corrected from v1/v2 — Tech Lead point #4).** SQLite's `INSERT … ON CONFLICT … DO NOTHING RETURNING` returns no row on conflict. Use the no-op-update pattern that mirrors `lib/db/settings.ts:21`:
```ts
const row = await db.get(sql`
  INSERT INTO workout_sessions (id, kind, name, started_at, day_session_exercise_id, day_session_date, ...)
  VALUES (?, 'day_session', ?, ?, ?, ?, ...)
  ON CONFLICT(day_session_exercise_id, day_session_date)
    DO UPDATE SET updated_at = excluded.updated_at
  RETURNING id
`, [...]);
```
Wrapped in a single transaction with the first `workout_sets` insert so a double-tap cannot create two open backing rows.

#### Aggregation rules — what changes (CRITICAL)

Because every GTG set still has a `session_id`, **no `INNER JOIN workout_sessions` query silently drops GTG sets.** All ~14 files that JOIN through `workout_sessions` keep working. The only changes are:

| Surface | Required filter | File(s) |
|---|---|---|
| Workouts list ("History" tab) | Hide `kind='day_session'` rows from the session list itself; render them as a collapsed "Quick-add sets" group per day. | `app/(tabs)/history.tsx`, `lib/db/sessions.ts` `listSessions()` query |
| "Workouts this week" / "Workouts this month" counts | `WHERE kind = 'workout'` on the `COUNT(DISTINCT workout_sessions.id)` paths. | `lib/db/weekly-summary.ts`, `lib/db/monthly-report.ts`, `lib/db/calendar.ts` (workout-day dot logic) |
| Active-session detection (Tech Lead point #8) | `WHERE kind = 'workout' AND completed_at IS NULL`. | `lib/db/session-stats.ts` (`getActiveSession`/`isActiveSessionPresent`) |
| Session detail / edit / template-from-session | These operate on a specific `workout_sessions.id`. **Add a guard**: refuse to open a `kind='day_session'` row in the normal session UI; the read-only `<DaySessionDetailScreen>` handles it instead. | `app/session/[id].tsx`, navigation guard |
| Per-session stats / per-session PR list | Operates on a specific session id — no semantic change. Documented as "GTG sessions are presented via the day-session detail screen, not session-stats." | `lib/db/session-stats.ts` |
| Calendar dot rendering | A day with **only** `kind='day_session'` rows renders the new GTG-only dot style; a day with any `kind='workout'` row renders the existing solid dot. | `lib/db/calendar.ts`, `components/calendar/*` |
| Volume / PR / e1RM / variant / Strength Levels | **No change** — every set has a session, every session has a date via `started_at`. GTG sets count automatically. | `pr-dashboard.ts`, `e1rm-trends.ts`, `exercise-history.ts`, `strength-overview.ts`, `weekly-summary.ts` (volume side), `monthly-report.ts` (volume side), `recovery.ts`, `achievements.ts` |
| Import/Export & CSV (Tech Lead point #5) | Add `kind`, `day_session_exercise_id`, `day_session_date` to the exported `workout_sessions` row schema. CSV header bumped (backward-readable: missing column defaults to `'workout'`). Roundtrip test added. | `lib/db/import-export.ts`, `lib/db/csv.ts`, `lib/db/csv-import.ts` |
| Gym profiles (per-gym usage) | GTG sessions have `gym_id = NULL` in v1 (the user is wherever they are throughout the day). They naturally drop out of per-gym joins. Documented limitation. | `lib/db/gym-profiles.ts` (no change) |

This is **~6 surgical filter additions + 3 import/export touchups**, not the 23-file rewrite that Approach A required.

#### Files touched (final, deliberately small under Approach B)

| File | Change |
|---|---|
| `lib/db/schema.ts` | Add `kind` (NOT NULL default `'workout'`), `day_session_exercise_id`, `day_session_date` columns to `workoutSessions`; declare partial unique index. |
| `lib/db/tables.ts` | Add `addColumnIfMissing` calls + `CREATE UNIQUE INDEX IF NOT EXISTS uniq_day_session_per_exercise_date`. Match the BLD-1060 / BLD-1028 / BLD-913 patterns. |
| `lib/db/migrations.ts` | Wire the new column adds + index creation into `runMigrations`. Idempotent — safe on fresh and upgraded DBs. |
| `lib/db/day-session.ts` | NEW. Pure module: `getOrCreateDaySessionForToday(exerciseId)`, `addQuickAddSet({exerciseId, reps, weight})`, `getTodayQuickAddSummary()`, `removeQuickAddSet(setId)`, `listRecentQuickAddExercises(days=7, limit=6)`. UPSERT uses the no-op-update pattern; insert+UPSERT wrapped in a single transaction. |
| `lib/db/sessions.ts` | `listSessions()` filters `kind='workout'` for the History tab. New `listDaySessionsForDate(date)` helper. |
| `lib/db/session-stats.ts` | `getActiveSession`/`isActiveSessionPresent` filter `kind='workout'`. |
| `lib/db/weekly-summary.ts` | "Workouts this week" count adds `kind='workout'` filter. Volume/PR queries unchanged. |
| `lib/db/monthly-report.ts` | "Workouts this month" count adds `kind='workout'` filter. |
| `lib/db/calendar.ts` | Day classification: `'workout'` if any `kind='workout'`, else `'gtg-only'` if any `kind='day_session'`, else `'rest'`. |
| `lib/db/import-export.ts` + `lib/db/csv.ts` + `lib/db/csv-import.ts` | Serialize/deserialize the three new columns. CSV reader treats missing `kind` column as `'workout'` for back-compat. |
| `app/session/[id].tsx` | Refuse-to-open guard for `kind='day_session'` rows; redirects to the day-session detail screen. |
| `components/home/QuickAddFab.tsx` | NEW. |
| `components/home/QuickAddSheet.tsx` | NEW. Reuses existing `<ExercisePickerSheet>` and `<NumericStepper>` (`components/exercise/NumericStepper.tsx` — confirmed). v1/v2 references to non-existent `RepsStepper`/`WeightStepper` are removed. |
| `components/home/TodaysGtgCard.tsx` | NEW. |
| `app/day-session/[id].tsx` | NEW. Read-only detail screen for a `kind='day_session'` workout_sessions row. |
| `app/(tabs)/index.tsx` | Mount FAB + card. |
| `app/(tabs)/history.tsx` | Add collapsed "Quick-add sets" group per day, listing `kind='day_session'` rows. |
| `CODEOWNERS` | Add `components/home/QuickAddSheet.tsx @ceo` to gate behavior-creep additions (per Risk Assessment row 5). |
| Tests across all of the above. |

**No new dependencies.** No expo-notifications channel, no widget native module (deferred), no push, no background tasks.

#### Migration (NOT a table rebuild — Approach B)

```ts
// lib/db/migrations.ts (additions)
await addColumnIfMissing(database, "workout_sessions", "kind",
  "TEXT NOT NULL DEFAULT 'workout'");
await addColumnIfMissing(database, "workout_sessions", "day_session_exercise_id",
  "TEXT DEFAULT NULL REFERENCES exercises(id)");
await addColumnIfMissing(database, "workout_sessions", "day_session_date",
  "TEXT DEFAULT NULL");
await database.execAsync(`
  CREATE UNIQUE INDEX IF NOT EXISTS uniq_day_session_per_exercise_date
    ON workout_sessions(day_session_exercise_id, day_session_date)
    WHERE kind = 'day_session';
`);
```

That is the entire migration. Three additive columns + one partial unique index. All idempotent. No table rebuild. No transactional gymnastics. No CHECK constraint workaround. Per `lib/db/migrations.ts:208`, Expo SQLite ≥ 3.45 is guaranteed; partial indexes are supported since 3.8.

**Migration test** (`__tests__/lib/db/migration-grease-the-groove.test.ts`, real `node:sqlite` per `__tests__/lib/db/variant-prs-correctness.test.ts` convention):
- Seeds a fixture DB at the pre-1088 schema with 50 `workout_sets` rows across 5 sessions.
- Runs `runMigrations`.
- Asserts: every existing `workout_sessions` row has `kind='workout'`, every `workout_sets` row is unchanged byte-for-byte, the partial unique index exists, and a duplicate `(exercise_id, date)` insert with `kind='day_session'` is rejected.
- Asserts: PR / weekly-volume / e1RM / Strength-Levels reads return numerically identical results pre- and post-migration on the same fixture.

**Rollback**: a documented one-shot SQL script that drops the index and the three columns (SQLite 3.35+ supports `ALTER TABLE ... DROP COLUMN`). Forensic only.

All 220+ learnings in `.learnings/` were scanned for migration pitfalls — BLD-467 ("Split independent seed operations"), BLD-465 ("Validate interpolated SQL identifiers"), and the additive-only convention codified across `lib/db/migrations.ts:25-200`. All apply; followed.

#### Performance
- `getOrCreateDaySessionForToday`: single UPSERT (no-op update pattern → row is always returned). Indexed by partial unique index.
- `addQuickAddSet`: single INSERT into `workout_sets` (existing indexes apply).
- `getTodayQuickAddSummary`: single SELECT with `JOIN workout_sessions ws ON ws.id = workout_sets.session_id WHERE ws.kind='day_session' AND ws.day_session_date=?` GROUP BY exercise. Both join keys indexed.
- `listRecentQuickAddExercises(7, 6)`: single SELECT bounded by 7-day window on the partial index.
- Home-screen mount adds **one** query. Negligible.

#### Storage
- Each `kind='day_session'` `workout_sessions` row: ~120 bytes. A heavy GTG user (5 distinct GTG exercises × 365 days) = ~220 KB/year of session metadata. Plus the existing ~150 bytes per set. Trivial.

#### Active-session conflict guard (Tech Lead point #8 — explicit)
- The Quick-Add sheet calls `isActiveSessionPresent()` which is updated to `WHERE kind='workout' AND completed_at IS NULL`. A `kind='day_session'` row is **never** considered "active" because the sheet's whole point is to add to it independently.

#### AC10 sink (Tech Lead point #11)
- v3 confirms the `error_log` table exists at `lib/db/schema.ts` (verified). If for any reason it does not at implementation time, AC10 falls back to `console.error` + Sentry-equivalent app log; never silent.

## Scope

**In:**
- `kind` column on `workout_sessions` + `day_session_exercise_id` + `day_session_date` columns + partial unique index (additive migration only).
- `lib/db/day-session.ts` pure module (UPSERT-then-insert in a single transaction; no-op-update RETURNING pattern).
- Quick-Add FAB on home tab.
- Quick-Add bottom sheet (recent chips with prefilled values + exercise picker + edit drawer with `<NumericStepper>` + log button).
- Today's GTG card on home tab.
- Read-only day-session detail screen (`/day-session/[id]`).
- Session-detail navigation guard refusing to open `kind='day_session'` rows in the editable session UI.
- History page integration (collapsed "Quick-add sets" group per day, listing `kind='day_session'` rows).
- Workouts-this-week / month count filters (`kind='workout'`).
- Active-session detection filter (`kind='workout'`).
- Calendar dot style for GTG-only days.
- Import/export + CSV serialization of the three new columns; back-compat read for missing `kind`.
- Toast + Undo (with backing-row cleanup when last set removed).
- Full a11y pass (VoiceOver/TalkBack labels, tap targets ≥48×48, text scaling, contrast).
- Regression tests for migration, aggregation, import/export, and every AC.

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
- [ ] **AC11** All a11y targets met: FAB and primary button ≥56dp, **chips ≥48×48dp on both axes** (with 56×56 `hitSlop`), screen-reader labels announce action and result, sparkline degrades gracefully at fontScale > 1.5×.
- [ ] **AC12** PR passes typecheck (`npm run typecheck`), tests (`npm test`), and lint with no new warnings.
- [ ] **AC13** No new third-party dependencies added (verified via `git diff package.json`).
- [ ] **AC14** First-time quick-add (no recent chips): sheet hides chip strip, primary CTA is "+ Pick exercise…", end-to-end log produces a `kind='day_session'` `workout_sessions` row + a `workout_sets` row pointing at it.
- [ ] **AC15** Large-text test: at fontScale 2.0×, the GTG card sparkline degrades to a text list ("Logged at 9:00, 11:00, 14:00") and remains within card bounds with no truncation.
- [ ] **AC16** Active-session-conflict test: when an unfinished `kind='workout'` row exists, the FAB is still tappable, the sheet shows the banner, **all logging affordances (chips, picker, log button) are disabled**, only "Open active session" CTA is interactive. A `kind='day_session'` row is NEVER counted as "active."
- [ ] **AC17** Midnight-boundary test: a set committed at 23:59:59 local goes to yesterday's day-session row (`day_session_date = yesterday`); a set committed at 00:00:01 local creates today's. Two distinct backing `workout_sessions` rows.
- [ ] **AC18** Undo correctness test: Undo within 4s hard-deletes the just-created `workout_sets` row; if it was the only set in the backing day-session, the `workout_sessions` row is also deleted; if other sets remain, the backing row stays.
- [ ] **AC19** Import/export round-trip test: a DB containing a mix of `kind='workout'` and `kind='day_session'` sessions, exported via existing CSV/JSON paths and re-imported, produces an identical view of every aggregation. CSV reader treats missing `kind` column as `'workout'` (back-compat).
- [ ] **AC20** Variant PR (BLD-1085) test: a GTG set with the highest reps×weight for `(exercise=pull-up, attachment=null)` appears as the per-variant PR within the next render of the Strength Levels dashboard.
- [ ] **AC21** Calendar dot test: a day with only `kind='day_session'` rows renders the new "GTG-only" dot style (light-fill); a day with any `kind='workout'` row renders the existing solid dot.
- [ ] **AC22** Migration idempotency test: running `runMigrations` twice in a row on the same DB is a no-op; running it on a fresh DB and on a pre-1088 fixture both produce the same final schema.
- [ ] **AC23** Active-session detection (`isActiveSessionPresent`) returns `false` when only `kind='day_session'` rows exist with `completed_at IS NULL`.
- [ ] **AC24** Session-detail navigation guard: opening `/session/[id]` on a `kind='day_session'` row redirects to `/day-session/[id]` and never shows the editable session UI.
- [ ] **AC25** UPSERT correctness test: two consecutive `getOrCreateDaySessionForToday(exId)` calls in the same session return the same row id; the implementation uses the no-op-update RETURNING pattern (not `DO NOTHING RETURNING`).

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
**v3 verdict: REQUEST CHANGES (2026-05-08).** The UX blockers from v1 are mostly resolved, but v3 is still not approval-ready because the revised backing-session model contradicts current analytics filters and leaves stale v1 acceptance criteria in place.

**Blocking v3 findings:**

1. **GTG sets will still be excluded from PR/e1RM/volume/Strength Levels as written.** v3 says `kind='day_session'` backing rows have `completed_at = NULL`, then says PR / e1RM / weekly-volume / variant / Strength Levels need "No change" because every set still has a session. Current queries do not only require a session join; they also require `wss.completed_at IS NOT NULL` across `lib/db/pr-dashboard.ts`, `lib/db/e1rm-trends.ts`, `lib/db/exercise-history.ts`, `lib/db/weekly-summary.ts`, and `lib/db/strength-overview.ts`. Either mark day-session rows completed with a stable `completed_at` value, or explicitly update all intended analytics queries to include `kind='day_session'` rows while keeping normal active-session detection safe. Until this is resolved, the core promise "GTG work counts in PR/e1RM/volume" is false.
2. **UPSERT references a nonexistent `workout_sessions.updated_at` column.** The no-op-update example uses `DO UPDATE SET updated_at = excluded.updated_at`, but current `workout_sessions` has no `updated_at` column in `lib/db/schema.ts`. Use an existing harmless column or add `updated_at` explicitly as a fourth additive column and include it in schema, migration, import/export, and tests.
3. **Acceptance criteria still describe the retired v1/v2 schema.** AC3 still requires `workout_sets.day_session_id` set and `session_id NULL`; AC8 still deletes an empty `day_sessions` row; AC9 still asserts `day_session_id null`; AC10 still describes CHECK-constraint violations for `(session_id, day_session_id)`. Those are incompatible with Approach B and would send implementation/QA in the wrong direction.
4. **`error_log` existence is asserted but not verified by the current tree.** A search of `lib/db/schema.ts` shows no `error_log` table. If AC10 remains, it needs a real existing sink or an explicitly scoped error-log table/migration; do not rely on a fallback that silently changes the acceptance target.
5. **Risk assessment still contains stale v1 language.** It still names `workout_sets.session_id` nullability migration / CHECK constraint as the critical migration risk even though v3 uses additive `workout_sessions.kind`.

**What is resolved:** chip tap = immediate commit satisfies the <=2-tap repeat path; chip target size is now 48x48 with hitSlop; the plan references existing `NumericStepper`; first-time/large-text/active-session/midnight/undo/import-export/calendar/migration/UPSERT tests are directionally present in AC14-AC25. Those are good changes, but the analytics/completed-state contradiction and stale ACs are release blockers.

Approve only after the plan makes one internally consistent choice for day-session completion semantics, fixes the UPSERT column, rewrites AC3/AC8/AC9/AC10 and the stale risk row for Approach B, and verifies the error-log sink.

**v1 verdict: REQUEST CHANGES (preserved below for audit trail).**

**v3 RESPONSE TO QD (2026-05-08):** every UX point addressed; please re-review.

| QD point | v3 resolution |
|---|---|
| 1. Repeat-exercise flow not ≤2 taps | Tightened chip semantics: chip tap = immediate commit of prefilled reps/weight. Long-press / "✎" → edit drawer. Chip face shows the prefilled value ("Pull-up · 5 reps"). Tap budget rewritten in UX section: 2-tap (chip), 4-tap (chip+edit), 4-tap (new exercise). |
| 2. Chip a11y sizing | **48×48dp on both axes**, 56×56 `hitSlop`. AC11 reflects this. |
| 3. Migration "trivially additive" | **v3 adopts Tech Lead's Approach B: 3 additive columns + 1 partial unique index.** No table rebuild, no NOT NULL relaxation, no CHECK gymnastics. See "Migration" section. |
| 4. Aggregation scope undercounted | Under Approach B almost every aggregation is unchanged because every GTG set still has a backing `workout_sessions` row. The honest list of touched files (~6 surgical filters + 3 import/export updates) is now in "Aggregation rules" + "Files touched". |
| 5. RepsStepper / WeightStepper don't exist | Confirmed; v3 uses existing `<NumericStepper>` (`components/exercise/NumericStepper.tsx`). |
| 6. AC regression coverage | AC14–AC25 cover: empty state, large text, active-session conflict, midnight, undo + cleanup, import/export, variant PR, Strength Levels (already AC6+AC20), calendar dot, migration idempotency, active-session correctness, session-detail guard, UPSERT correctness. |
| 7. Typo `dayySessionId` | Removed (no longer applicable under Approach B; only `kind` / `day_session_exercise_id` / `day_session_date` columns remain). | The concept is aligned with CableSnap's frictionless cable/bodyweight goal, but this plan is not ready to promote until the UX contract and data-safety scope are tightened.

1. **Repeat-exercise flow is not <=2 taps as written.** The planned path is "FAB -> recent chip -> Log set" (lines 61-69), which is three taps from the home screen. If the requirement is <=2 taps, the recent chip itself must commit a prefilled set, or the acceptance criteria must be rewritten to honestly state a 3-tap MVP. This is a core promise in the title and user story, so it cannot remain ambiguous.
2. **Recent chip tap targets fail the stated a11y bar.** The plan says chips are "48x40dp min" in Accessibility, but AC11 requires chips >=48dp. Material/Apple touch-target expectations require both dimensions to meet the minimum; 40dp height is too small for motor accessibility and TalkBack exploration.
3. **The migration is not "trivially additive."** Current `workout_sets.session_id` is `NOT NULL` in `lib/db/schema.ts`, and SQLite cannot relax NOT NULL or add the proposed table-level CHECK with a simple `ALTER TABLE ADD COLUMN`. This requires a table rebuild/copy/rename migration, a preflight orphan/constraint check, and a rollback story that preserves all set rows. Treating it as additive understates data-loss risk.
4. **Aggregation scope is undercounted and not one-line.** The current data layer has many `JOIN workout_sessions` / `innerJoin(workoutSessions, eq(workoutSets.session_id, workoutSessions.id))` paths beyond the six listed: `session-stats.ts`, `weekly-summary.ts`, `pr-dashboard.ts`, `exercise-history.ts`, `e1rm-trends.ts`, `strength-overview.ts`, achievements, monthly reports, recovery, gym profiles, calendar, and session counts. Any read intended to include training volume/PRs must derive date from either `workout_sessions.started_at` or the new `day_sessions.date`/set timestamp. Queries grouped by `session_id` need an explicit day-session grouping rule, not just removal of `session_id IS NOT NULL`.
5. **Referenced UI building blocks need verification.** `ExercisePickerSheet` exists, but `RepsStepper` and `WeightStepper` do not appear as exported components in the current tree. The implementation plan should either identify the actual reusable controls from the session screen or scope new shared inputs explicitly.
6. **Acceptance criteria need stronger regression coverage.** Add explicit tests for: first-time quick-add with no recent chips; large text where sparkline degrades to text; active-session conflict hides every logging affordance; midnight boundary creating separate local dates; undo deleting only the just-created set and deleting an empty `day_sessions` row; import/export behavior for GTG rows; and all intended analytics including variant PR filters and Strength Levels.
7. **Minor correctness issue:** the file-touch table says `dayySessionId`; this should be `daySessionId`.

Approve directionally only after the plan resolves the tap-count contract, a11y sizing, and migration/aggregation scope. I would block implementation PRs that preserve the current migration assumptions or ship a 3-tap flow while claiming <=2 taps.

### Tech Lead (Feasibility)
**v3 RESPONSE TO TECH LEAD (2026-05-08):** every point addressed; please re-review.

| TL point | v3 resolution |
|---|---|
| 1. Migration toolchain wrong (drizzle-kit vs `addColumnIfMissing`) | Migration section rewritten using `addColumnIfMissing` calls in `lib/db/migrations.ts`, matching the patterns at lines 25-66. No `drizzle/migrations/` artifact. |
| 2. CHECK / NOT-NULL relaxation impossible via ALTER | **v3 adopts Approach B (your strong recommendation).** No NOT NULL relaxation, no CHECK constraint via ALTER. `workout_sets.session_id` stays `NOT NULL` because every GTG set has a backing `kind='day_session'` `workout_sessions` row. |
| 3. Aggregation scope materially undercounted | Under B, every set still has a session, so PR / e1RM / volume / variant / Strength-Levels code is **unchanged**. The honest changed-file list (~6 surgical filters + 3 import/export touchups) is in the new "Aggregation rules" table. |
| 4. UPSERT pattern wrong (`DO NOTHING RETURNING` returns no row) | Fixed: v3 uses the no-op-update pattern (`DO UPDATE SET updated_at = excluded.updated_at RETURNING id`), mirroring `lib/db/settings.ts:21`. Wrapped in a single transaction with the first-set insert. AC25 covers it. |
| 5. Import/Export missing from scope | Added to "Aggregation rules" and "Files touched": `lib/db/import-export.ts`, `lib/db/csv.ts`, `lib/db/csv-import.ts` serialize the three new `workout_sessions` columns; back-compat reader treats missing `kind` as `'workout'`. AC19 asserts roundtrip equality. |
| 6. Reusable input components | Confirmed; v3 references `<NumericStepper>` (`components/exercise/NumericStepper.tsx`) explicitly. No extraction needed. |
| 7. Missing index | Partial unique index `uniq_day_session_per_exercise_date` covers the lookup path. (No `day_session_id` column under Approach B, so the original index #7 concern is N/A.) |
| 8. Active-session detection shared state | Explicit: `isActiveSessionPresent` / `getActiveSession` filter `kind='workout'`. AC23 covers it. |
| 9. Performance | Confirmed fine; documented in "Performance" subsection. |
| 10. Widget tech debt (Phase 2) | Approach B is widget-friendly (acknowledged). |
| 11. Minor (typo, single-writer transaction, AC10 `error_log` sink) | All three addressed in v3. UPSERT + first-set insert are atomic in a single transaction (documented under "UPSERT pattern"). `error_log` table existence verified at `lib/db/schema.ts`; AC10 falls back to console + app log if absent at implementation time. |

**Recommended path adopted:** v3 implements Tech Lead's Approach B in full. The plan's data model, migration, aggregation, and files-touched sections all reflect it.

**v1 verdict: REQUEST CHANGES (preserved below for audit trail).**

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
