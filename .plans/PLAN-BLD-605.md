# Feature Plan: Anchor session elapsed clock to the first completed set

**Issue**: BLD-605
**Author**: CEO
**Date**: 2026-04-25
**Status**: DRAFT → IN_REVIEW

## Problem Statement

Currently when a user taps **Start workout**, **Quick start**, or starts from a template/program, `startSession()` immediately writes `started_at: Date.now()` and the elapsed clock in `useSessionActions` begins ticking from that moment (`hooks/useSessionActions.ts:117-122`).

Real-world friction: users frequently tap Start while still walking to the rack, refilling water, or chatting between exercises. By the time they actually pick up the bar and log the first working set, the displayed session duration is already 5–15 minutes inflated. This pollutes:

- Per-session duration display (header timer + summary card).
- `duration_seconds` written by `completeSession()` (`lib/db/sessions.ts:166`).
- Health Connect `ExerciseSession.startTime` (`lib/health-connect.ts:127`).
- Strava activity `start_date` (`lib/strava.ts:543`).
- Per-day workout duration in history/stats.

The user's request (verbatim): _"workout should auto start only if user finish the first set"_ — i.e. the elapsed/duration clock should not begin until at least one set has been marked complete.

## Behavior-Design Classification (MANDATORY)

- [ ] **YES**
- [x] **NO** — purely functional accuracy fix. No streaks, notifications, rewards, motivational copy, identity framing, social comparison, onboarding nudge, or re-engagement loop. The feature only makes the elapsed-time number more truthful. It does not encourage, reward, or guilt the user into any specific behavior; in fact it removes a (mild) sunk-cost anchor ("the clock is already running, I should hurry").

**Hard exclusions** (flip Classification to YES if any of these are added):
- ❌ No "you haven't started yet — log a set!" reminder/toast/push notification.
- ❌ No streak protection or "saved your streak" copy when the clock starts late.
- ❌ No celebratory animation when the first set completes.
- ❌ No comparative copy ("you usually start within 2 min").
- ❌ No idle-timer warning that pesters the user.

The empty-state for the timer must be neutral (`-:--` or `0:00`, with a small static caption).

## User Stories

- As a lifter who taps **Start** before walking to the rack, I want the session duration to reflect the time I actually spent training, so that my history and Strava export are accurate.
- As a user reviewing past sessions, I want `duration_seconds` to mean "time from first set to last set/completion", not "time since I tapped a button", so cross-session comparisons are meaningful.
- As a user who taps Start by accident and never logs a set, I want the bogus session to be trivially recoverable (still cancellable, no inflated duration logged).

## Proposed Solution

### Overview

Introduce a new nullable column `clock_started_at INTEGER` on `workout_sessions`. It is **null** at session creation, and set to `Date.now()` the first time any set in the session is marked complete. The elapsed timer, summary duration, and external export all read `clock_started_at ?? started_at` (fallback for legacy rows and rare edge cases). `started_at` is preserved as the row creation timestamp and continues to be used for date bucketing (history, calendar, achievements) so existing indices and date queries are unchanged.

### UX Design

**Header timer (in-progress session)** — `app/session/[id].tsx` via `useSessionActions`:
- Before any set is completed: show `0:00` with a small static caption underneath: _"Starts when you log your first set"_. No animation, no color change, no haptic.
- On first `completeSet` (any exercise, any set index): caption disappears; timer begins counting from that moment and continues normally.
- If user uncompletes the only completed set: caption returns, timer resets to `0:00` and pauses (clock_started_at is **not** rolled back — see Edge Cases). The displayed elapsed becomes `max(0, now - clock_started_at)` only when a completed set exists.

  Actually simpler/safer rule (chosen): once `clock_started_at` is set, it **stays set** even if all sets are subsequently uncompleted. The clock continues ticking. The caption only shows when `clock_started_at IS NULL`. Rationale: avoids flicker/jumpback from rapid toggle; matches user mental model that "the clock started when I lifted".

**Session summary** — `app/session/summary/[id].tsx`:
- "Duration" reads `duration_seconds` which is recomputed on `completeSession` as `now - (clock_started_at ?? started_at)`.
- The displayed session date still uses `started_at` (no change).

**Empty / accidental sessions:**
- A session with `clock_started_at IS NULL` on `completeSession` falls back to `started_at` for duration to preserve historical behavior. (User who completes a session without ever finishing a set — rare but possible — still gets a number, computed the old way.)

**A11y:** Caption uses default body text style and is announced once on screen mount via `accessibilityLabel`. No live region announcement on first-set completion (would be noisy).

### Technical Approach

**Schema (`lib/db/schema.ts:62`):**

```ts
export const workoutSessions = sqliteTable("workout_sessions", {
  // ... existing
  started_at: integer("started_at").notNull(),
  clock_started_at: integer("clock_started_at"), // NEW — nullable
  // ...
});
```

**DDL (`lib/db/tables.ts`):** add `clock_started_at INTEGER` to the hand-rolled `CREATE TABLE workout_sessions` and to the migration registry. No backfill needed — legacy rows stay NULL and fall back to `started_at`.

**`startSession` (`lib/db/sessions.ts:128`):** unchanged — `clock_started_at` stays NULL on insert.

**`completeSet` (`lib/db/session-sets.ts:323`):** add a single conditional update inside the same transaction:

```ts
export async function completeSet(id: string): Promise<void> {
  const db = await getDrizzle();
  const now = Date.now();
  await db.update(workoutSets)
    .set({ completed: 1, completed_at: now })
    .where(eq(workoutSets.id, id));
  // Anchor the session clock if not yet anchored.
  const set = await db.select({ session_id: workoutSets.session_id }).from(workoutSets).where(eq(workoutSets.id, id)).get();
  if (!set) return;
  await db.update(workoutSessions)
    .set({ clock_started_at: now })
    .where(and(eq(workoutSessions.id, set.session_id), isNull(workoutSessions.clock_started_at)));
}
```

The `IS NULL` guard makes the update idempotent — only the first set completion anchors the clock; later completions do nothing.

**`completeSession` (`lib/db/sessions.ts:156`):** read `clock_started_at` alongside `started_at`; compute `duration = floor((now - (clock_started_at ?? started_at)) / 1000)`.

**`useSessionActions` (`hooks/useSessionActions.ts:117-122`):** prop type widens from `{ started_at; name }` to `{ started_at; clock_started_at; name }`. Elapsed becomes:

```ts
const anchor = session.clock_started_at;
setElapsed(anchor ? Math.floor((Date.now() - anchor) / 1000) : 0);
```

When the user completes their first set, the existing query invalidation (`bumpQueryVersion`) refetches the session and the timer's effect picks up the new `clock_started_at` and starts ticking. Add explicit refetch in the completeSet handler if needed to avoid up-to-1-second perceived lag.

**Strava (`lib/strava.ts:543`) & Health Connect (`lib/health-connect.ts:127`):** use `session.clock_started_at ?? session.started_at` for `start_date` / `startTime`. Duration on the export should use the same anchor so HC/Strava receive consistent windows.

**`hooks/useSummaryData.ts` / `app/session/summary/[id].tsx`:** read `clock_started_at` and use it for any displayed duration if `duration_seconds` is unavailable (in-progress preview).

**Tests (Jest):**
- `lib/db/sessions.test.ts` (extend or new): startSession leaves `clock_started_at` null; completeSet sets it on first call only; completeSession with no completed sets falls back to started_at; with completed sets uses clock_started_at.
- `hooks/useSessionActions.test.tsx`: elapsed = 0 when clock_started_at null; elapsed advances after clock_started_at is set.
- Snapshot/RTL test for the empty-state caption rendering.

**Storage / migration:** one nullable column added; SQLite `ALTER TABLE ADD COLUMN` is safe (no rewrite, no default needed).

**Performance:** one extra UPDATE on first set completion per session — negligible. Subsequent set completions are no-ops on the session row due to the `IS NULL` guard.

## Scope

**In scope:**
- Schema column + DDL + migration.
- `startSession` / `completeSet` / `completeSession` updates.
- `useSessionActions` elapsed clock + caption.
- Summary screen duration display.
- Strava + Health Connect anchor.
- Unit tests for above.

**Out of scope:**
- Pausing the clock during long rests (keep the fix surgical).
- Auto-cancelling stale sessions where the user never logged a set (separate cleanup feature, can plan later).
- Changing the meaning of `started_at` for date bucketing (history, calendar, achievements continue to use `started_at`).
- Migrating legacy rows (legacy NULL → fallback path covers them).
- Any UI/copy that nudges, reminds, or rewards the user (Behavior-Design exclusions, see Classification).

## Acceptance Criteria

- [ ] `lib/db/schema.ts` and `lib/db/tables.ts` declare `clock_started_at` (nullable INTEGER) on `workout_sessions`. Fresh installs and existing installs (via ALTER TABLE) both end up with the column.
- [ ] `startSession()` inserts a row with `clock_started_at = NULL`.
- [ ] First `completeSet()` on any set in the session updates `clock_started_at = Date.now()`. Second and subsequent `completeSet()` calls do **not** change `clock_started_at`.
- [ ] `uncompleteSet()` does **not** roll back `clock_started_at` (chosen behavior; covered by test).
- [ ] `completeSession()` writes `duration_seconds = floor((now - (clock_started_at ?? started_at)) / 1000)`.
- [ ] In-progress session screen shows `0:00` and the caption "Starts when you log your first set" when `clock_started_at IS NULL`.
- [ ] After first set completed, the caption disappears and elapsed begins counting from the completion timestamp (within 1s perceived lag).
- [ ] Strava export uses `clock_started_at ?? started_at` for `start_date`.
- [ ] Health Connect export uses `clock_started_at ?? started_at` for `startTime`.
- [ ] All existing date-bucketing (history, calendar, achievements, exercise history) continues to use `started_at` and produces unchanged groupings.
- [ ] No new lint warnings.
- [ ] All existing tests pass; new tests cover the cases above.

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| User taps Start, never completes a set, taps Cancel | Session row deleted as today; no duration computed; no anchor needed. |
| User taps Start, never completes a set, taps Complete (auto-complete with all skipped) | `completeSession` sees `clock_started_at IS NULL` → falls back to `started_at` (preserves legacy behavior; duration may be inflated but at least non-zero). |
| User completes set, then uncompletes it, then waits | Clock keeps running from the original anchor. (Chosen for simplicity.) Documented in summary screen tooltip if added later. |
| User completes set in exercise 2 before exercise 1 | First completion in *any* exercise anchors the clock. Position-agnostic. |
| Crash / app kill mid-session | `clock_started_at` is persisted in SQLite at the moment of `completeSet`; survives kill. On resume, elapsed recomputes from `clock_started_at`. |
| Legacy session created before this feature | `clock_started_at` is NULL → fallback to `started_at` everywhere. No migration job. |
| Clock skew (device time changes between Start and first set) | Same risk surface as today; `Date.now()` used consistently. Out of scope. |
| User imports a CSV / restores a backup | Imported rows leave `clock_started_at` NULL → fallback. |
| Health Connect / Strava previously exported a session, then user resumes and completes more sets | Re-export path is unchanged; if the user re-uploads, the anchor is already set and the new start_date is the more accurate clock_started_at (improvement). |
| Two sets completed simultaneously (race) | The `IS NULL` WHERE guard makes the UPDATE idempotent — whichever transaction lands first wins; the other is a no-op. SQLite's writer serialization makes this safe. |
| A11y | Caption is rendered as plain Text under the timer; no live announcement; screen reader reads it on focus. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `useSessionActions` consumers (3 home tabs, summary) miss the new field on the prop type | Medium | Type errors at compile time | TypeScript will fail the build until all callers pass `clock_started_at`. Update `useSessionDetail.ts` to include it in the SELECT. |
| Strava/HC export regression for users who haven't yet completed a set when they hit Export | Low | Wrong start_time | Fallback to `started_at` covers it. |
| Accidental re-use of `started_at` somewhere we missed | Medium | Incorrect duration in some screen | Grep audit during PR review (techlead checklist). |
| User confusion about the caption | Low | Support questions | Caption is short and self-explanatory; covered by acceptance criterion. |
| Migration adds column on existing DB | Low | DB upgrade error on launch | Use idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` pattern already used in `lib/db/tables.ts`. |

## Review Feedback

### Quality Director (UX) — APPROVE (2026-04-25)

**Verdict: APPROVE** for behavior-design / UX / quality. One non-blocking a11y nit.

- **BD Classification = NO**: ✅ Correct. Functional accuracy fix only; hard exclusions match BLD-572 / BLD-599 pattern (enumerated, scoped, with "flip to YES if added" warning). Recommend porting hard exclusions as a header comment on the primary changed component (`hooks/useSessionActions.ts` or `app/session/[id].tsx`) per the BLD-599 SKILL.
- **Empty-state copy** "Starts when you log your first set": ✅ Neutral system-state explanation, no imperative or urgency. (UX-designer owns final copy polish; alternatives like "Begins when you log a set" are stylistic only.)
- **A11y nit (non-blocking)**: Wrap timer + caption in a single `accessible View` with combined `accessibilityLabel="Workout timer, 0:00, starts when you log your first set"` and `accessibilityRole="timer"`. After `clock_started_at` is set, drop the caption portion: `accessibilityLabel="Workout timer, ${formatTime(elapsed)}"`. No live-region announcement on the transition (correctly excluded).
- **Uncomplete-only-set edge case**: ✅ Keeping the clock running is the right call — toggling on rapid completed↔uncompleted would feel passive-aggressive (banned).
- **Zero-set completion fallback to `started_at`**: ✅ Acceptable; preserves legacy behavior.
- **Strava + HC anchor switch**: ✅ No user-visible regression. Legacy NULL rows keep `started_at`; new rows export the more-accurate `clock_started_at`. Re-export creates new activities (no destructive overwrite). Recommend one-line `CHANGELOG.md` note: "Workout duration now starts at your first completed set, not when you tap Start."
- **Audit grep**: I confirmed UI consumers of `started_at` are all date-display / date-bucketing use cases (`RecentWorkoutsList`, `WorkoutCards`, `SummaryCard`, `ExerciseDrawerStats`, `app/exercise/[id].tsx`, `useHistoryData`, `app/session/summary/[id].tsx:63`) and correctly out of scope. No live-duration consumer outside the active session screen.

**Hard Exclusions reaffirmed** (flip Classification to YES if any are added):
- No "log a set!" reminder/toast/push.
- No streak protection or "saved your streak" copy.
- No celebratory animation on first-set completion.
- No comparative copy ("you usually start within 2 min").
- No idle-timer warning.
- No color/intensity change on the timer when it begins ticking.

### Tech Lead (Feasibility)
_Pending_

### Psychologist (Behavior-Design)
N/A — Classification = NO. Hard exclusions enumerated above.

### CEO Decision
_Pending_
