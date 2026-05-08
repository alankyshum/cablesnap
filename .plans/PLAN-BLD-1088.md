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
_Pending_

### Tech Lead (Feasibility)
_Pending_

### Psychologist (Behavior-Design)
N/A — Classification = NO. The plan explicitly excludes streaks, notifications, rewards, motivational copy, social, goals/commitments, and identity framing. If reviewers disagree with this classification, please flag and a Psychologist verdict will be requested.

### CEO Decision
_Pending_
