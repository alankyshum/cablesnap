# Feature Plan: Anchor session elapsed clock to the first completed set

**Issue**: BLD-605
**Author**: CEO
**Date**: 2026-04-25
**Status**: APPROVED (2026-04-25T04:36Z)

**Revision history**
- rev 1 (2026-04-25 03:30Z) — initial draft.
- rev 2 (2026-04-25 04:10Z) — fold QD APPROVE + Tech Lead REQUEST CHANGES. Adds optimistic local-state path so the live timer actually starts ticking; names `lib/db/migrations.ts` + `addColumnIfMissing` explicitly; enumerates type-update surface (`WorkoutSession`, `SessionData`, Drizzle); enumerates test-fixture updates; collapses SELECT+UPDATE into single UPDATE-with-subquery; adds combined a11y label; adds CHANGELOG entry.

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

**A11y:** Wrap the timer + caption in a single `accessible` View with combined `accessibilityLabel="Workout timer, 0:00, starts when you log your first set"` and `accessibilityRole="timer"` (per QD a11y refinement). After `clockStartedAt` is set, drop the caption portion: `accessibilityLabel="Workout timer, ${formatTime(elapsed)}"`. **No live-region announcement on the transition** (would be noisy).

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

**DDL — two files (per Tech Lead rev 2):**

1. **Fresh-install (`lib/db/tables.ts:89-99`)** — add `clock_started_at INTEGER` to the hand-rolled `CREATE TABLE workout_sessions` block. No DEFAULT (NULL is the desired sentinel for "not yet anchored").
2. **Upgrade-install (`lib/db/migrations.ts:46-47`)** — append a line next to the existing `program_day_id` / `rating` migrations:
   ```ts
   await addColumnIfMissing(database, "workout_sessions", "clock_started_at", "INTEGER");
   ```
   `addColumnIfMissing` (`lib/db/tables.ts:32-46`) gates on `hasColumn(...)` — SQLite has **no** `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` syntax; idempotency comes from the `hasColumn` check, not from SQL-level guards.

No backfill — legacy rows stay NULL and the read-side fallback (`clock_started_at ?? started_at`) covers them.

**`startSession` (`lib/db/sessions.ts:128`):** unchanged — `clock_started_at` stays NULL on insert.

**`completeSet` (`lib/db/session-sets.ts:323`):** persist the anchor with one UPDATE-with-subquery (one round-trip, idempotent under SQLite writer serialization, no transaction wrapper needed):

```ts
import { sql } from "drizzle-orm";

export async function completeSet(id: string): Promise<void> {
  const db = await getDrizzle();
  const now = Date.now();
  await db.update(workoutSets)
    .set({ completed: 1, completed_at: now })
    .where(eq(workoutSets.id, id));
  // Anchor the parent session's clock on the first set completion only.
  // The IS NULL guard makes this idempotent — second+ calls are no-ops.
  await db.run(sql`
    UPDATE workout_sessions
    SET clock_started_at = ${now}
    WHERE id = (SELECT session_id FROM workout_sets WHERE id = ${id})
      AND clock_started_at IS NULL
  `);
}
```

No `db.transaction(...)` wrapper is needed: SQLite's writer-side serialization plus the `IS NULL` predicate make concurrent set completions on the same session safe (whichever transaction lands first wins; the other is a no-op).

**`completeSession` (`lib/db/sessions.ts:156`):** read `clock_started_at` alongside `started_at`; compute `duration = floor((now - (clock_started_at ?? started_at)) / 1000)`.

**TypeScript types — three files must update or compilation breaks:**

1. **`lib/db/schema.ts:62`** (Drizzle) — add `clock_started_at: integer("clock_started_at")` (no `.notNull()`).
2. **`lib/types.ts:187-196`** (`WorkoutSession`) — add `clock_started_at: number | null;`. Without this `getSessionById` typing won't expose the column even though the underlying SELECT returns it.
3. **`lib/health-connect.ts:113-118`** (local `SessionData`) — add `clock_started_at: number | null;` so the export anchor switch type-checks.

**`useSessionActions` — optimistic local anchor (resolves Tech Lead 🔴 blocker):**

The blocker: `hooks/useSessionDetail.ts:61-93` fetches the session inside `useEffect(..., [id])` and never re-runs (no `bumpQueryVersion` subscription). Without an explicit propagation path, writing `clock_started_at` to SQLite will **never** make the in-memory `session.clock_started_at` change for the lifetime of the active session screen, and the live header timer will stay frozen at `0:00`.

**Resolution — Tech Lead Option A (optimistic local override):**

```ts
// hooks/useSessionActions.ts
const [clockStartedAt, setClockStartedAt] = useState<number | null>(
  session?.clock_started_at ?? null
);

// Re-sync from prop when the session id changes (resume / navigate to another session).
useEffect(() => {
  setClockStartedAt(session?.clock_started_at ?? null);
}, [session?.id, session?.clock_started_at]);

// Elapsed effect now reads the LOCAL anchor.
useEffect(() => {
  if (clockStartedAt == null) {
    setElapsed(0);
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    return;
  }
  const update = () => setElapsed(Math.floor((Date.now() - clockStartedAt) / 1000));
  update();
  if (!timer.current) timer.current = setInterval(update, 1000);
  return () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
}, [clockStartedAt]);

// In handleCheck's completion branch, BEFORE awaiting completeSet:
if (clockStartedAt == null) setClockStartedAt(now);
await completeSet(set.id);
```

DB write is still authoritative for persistence/export; local state ensures the UI reflects the anchor within one render cycle, satisfying the "elapsed begins counting within 1s perceived lag" acceptance criterion. On screen re-mount or app resume, the prop sync re-hydrates from the DB.

**Inline comment update (`useSessionActions.ts:117`):** the existing comment says "we recompute elapsed from session.started_at on resume." Update it to reference `clockStartedAt` (local) and the BLD-605 anchor semantics so future readers debugging BLD-553/560 battery work aren't misled.

**Strava (`lib/strava.ts:543`) & Health Connect (`lib/health-connect.ts:127`):** use `session.clock_started_at ?? session.started_at` for `start_date` / `startTime`. Duration on the export should use the same anchor so HC/Strava receive consistent windows.

**`hooks/useSummaryData.ts` / `app/session/summary/[id].tsx`:** read `clock_started_at` and use it for any displayed duration if `duration_seconds` is unavailable (in-progress preview).

**Tests (Jest):**
- `lib/db/sessions.test.ts` (extend or new): startSession leaves `clock_started_at` null; first completeSet sets it; second completeSet does NOT change it (idempotency); completeSession with no completed sets falls back to started_at; with completed sets uses clock_started_at.
- `__tests__/hooks/useSessionActions-elapsed-clock.test.ts:147` — fixture `session: { started_at: startedAt, name: "T" }` will fail to compile after the prop type widens. Update the fixture to include `clock_started_at` and add a new test asserting:
  1. `elapsed` stays at `0` while `clockStartedAt` is null.
  2. After `handleCheck` completes the first set, `elapsed` advances within the next 1Hz tick (use jest fake timers).
  3. Uncompleting the only completed set does NOT roll back `clockStartedAt` (timer keeps running).
- Snapshot/RTL test for the empty-state caption + combined a11y label (see UX Design).
- Audit existing tests for any other fixtures constructing partial `session` objects passed to `useSessionActions`; update them all in the same PR.

**Storage / migration:** one nullable column added; SQLite `ALTER TABLE ADD COLUMN` is safe (no rewrite, no default needed).

**Performance:** one extra UPDATE on first set completion per session — negligible. Subsequent set completions are no-ops on the session row due to the `IS NULL` guard.

## Scope

**In scope:**
- Schema column + DDL (fresh + upgrade in `lib/db/tables.ts` and `lib/db/migrations.ts`).
- TypeScript types: Drizzle `lib/db/schema.ts`, `WorkoutSession` in `lib/types.ts`, `SessionData` in `lib/health-connect.ts`.
- `startSession` / `completeSet` (single UPDATE-with-subquery) / `completeSession` updates.
- `useSessionActions` optimistic local anchor + elapsed clock + caption + combined a11y label.
- Inline comment update at `useSessionActions.ts:117`.
- Summary screen duration display.
- Strava + Health Connect anchor (`clock_started_at ?? started_at`).
- Test fixture updates (existing) + new tests for the optimistic anchor path.
- One-line `CHANGELOG.md` entry: "Workout duration now starts at your first completed set, not the moment you tap Start."
- Audit grep at PR time: `grep -rn "session\.started_at\|sessions\.started_at\|\.started_at" --include='*.ts' --include='*.tsx' lib/ hooks/ app/ components/` — confirm every duration-bearing usage uses the anchor or is intentionally a date-bucket.

**Out of scope:**
- Pausing the clock during long rests (keep the fix surgical).
- Auto-cancelling stale sessions where the user never logged a set (separate cleanup feature, can plan later).
- Changing the meaning of `started_at` for date bucketing (history, calendar, achievements continue to use `started_at`).
- Migrating legacy rows (legacy NULL → fallback path covers them).
- Any UI/copy that nudges, reminds, or rewards the user (Behavior-Design exclusions, see Classification).

## Acceptance Criteria

- [ ] `lib/db/schema.ts`, `lib/db/tables.ts`, and `lib/db/migrations.ts` declare `clock_started_at` (nullable INTEGER) on `workout_sessions`. Fresh installs (CREATE TABLE) and existing installs (`addColumnIfMissing`) both end up with the column.
- [ ] `WorkoutSession` (`lib/types.ts`) and `SessionData` (`lib/health-connect.ts`) include `clock_started_at: number | null`.
- [ ] `startSession()` inserts a row with `clock_started_at = NULL`.
- [ ] First `completeSet()` on any set in the session updates `clock_started_at = Date.now()` via single UPDATE-with-subquery. Second and subsequent `completeSet()` calls do **not** change `clock_started_at` (idempotency under `IS NULL` guard).
- [ ] `uncompleteSet()` does **not** roll back `clock_started_at`.
- [ ] `completeSession()` writes `duration_seconds = floor((now - (clock_started_at ?? started_at)) / 1000)`.
- [ ] In-progress session screen shows `0:00` and the caption "Starts when you log your first set" when `clockStartedAt` (local state in `useSessionActions`) is null.
- [ ] After first set completion, the local `clockStartedAt` is set **synchronously** (before `await completeSet`) so elapsed begins counting within one render cycle (≤1s perceived lag). Verified by an explicit unit test using fake timers.
- [ ] Re-mounting the session screen (or app resume) re-hydrates `clockStartedAt` from the persisted DB row.
- [ ] Strava export uses `clock_started_at ?? started_at` for `start_date`.
- [ ] Health Connect export uses `clock_started_at ?? started_at` for `startTime`.
- [ ] Timer + caption share a single combined `accessibilityLabel`; no live-region announcement on transition.
- [ ] All existing date-bucketing (history, calendar, achievements, exercise history) continues to use `started_at` and produces unchanged groupings.
- [ ] All existing tests pass after fixture updates; new tests cover the cases above.
- [ ] `CHANGELOG.md` includes the one-line user-facing note.
- [ ] No new lint warnings.

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
| Live header timer doesn't tick after first-set completion (the Tech Lead 🔴 blocker) | Was high in rev 1 | Acceptance failure | Resolved in rev 2 via optimistic local `clockStartedAt` state in `useSessionActions`; explicit unit test required. |
| `useSessionActions` consumers (3 home tabs, summary, history) miss the new field on the prop type | Medium | Compile-time error | TypeScript will fail until all callers pass `clock_started_at`. Update `useSessionDetail.ts`, `WorkoutSession`, and `SessionData` together; grep audit at PR time. |
| Test fixtures break compilation | High | CI red | Plan lists `__tests__/hooks/useSessionActions-elapsed-clock.test.ts:147` as the known fixture; engineer greps for any other partial-`session` fixtures in the same PR. |
| Strava/HC export regression for users who haven't completed a set when they hit Export | Low | Wrong start_time | `clock_started_at ?? started_at` fallback covers it. |
| Accidental re-use of `started_at` somewhere we missed | Medium | Incorrect duration in some screen | PR-time grep audit (covered in scope); QD already spot-checked UI surface. |
| User confusion about the caption | Low | Support questions | Caption is short, neutral, and self-explanatory; CHANGELOG note sets expectation. |
| Migration adds column on existing DB | Low | DB upgrade error | Use `addColumnIfMissing` (gated by `hasColumn` — not by SQL `IF NOT EXISTS` syntax). |

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

### Tech Lead (Feasibility) — APPROVE rev 2 (2026-04-25)

**Verdict: APPROVE.** All rev 1 blockers and required corrections resolved. Cleared for implementation.

| Rev 1 Finding | Status |
|---|---|
| 🔴 Live timer never sees `clock_started_at` | ✅ Option A adopted — optimistic local `clockStartedAt` set synchronously before `await completeSet`; prop-sync `useEffect` re-hydrates from DB on remount. Acceptance test with fake timers required. |
| 🟠 Migration registry naming | ✅ Both `lib/db/tables.ts` and `lib/db/migrations.ts` named with line refs. Wrong "ADD COLUMN IF NOT EXISTS" wording removed. |
| 🟠 Type updates | ✅ `lib/db/schema.ts`, `lib/types.ts`, `lib/health-connect.ts` all in scope. |
| 🟠 Test fixtures | ✅ Existing fixture flagged; PR-time grep for additional partial-`session` fixtures in scope. |
| 🟡 Single UPDATE-with-subquery | ✅ Implemented; "same transaction" prose dropped. Concurrency rationale (writer serialization + `IS NULL`) explicit. |
| 🟡 Stale comment fix | ✅ In scope. |
| 🟡 PR-time audit grep | ✅ In scope. |
| QD a11y refinement | ✅ Combined `accessibilityLabel` + `accessibilityRole="timer"` adopted. |
| QD CHANGELOG note | ✅ One-line entry in scope. |

The synchronous `if (clockStartedAt == null) setClockStartedAt(now)` before `await completeSet(set.id)` is the right shape — React schedules the state update before the async hop, so elapsed picks it up on the next render regardless of write latency. The prop-sync effect will not clobber the optimistic value because `useSessionDetail` does not refetch; on screen re-mount, re-hydrating from DB is the correct behavior.

Minor non-blocking nit: the prop-sync `useEffect` deps `[session?.id, session?.clock_started_at]` would benefit from a one-line inline comment explaining *why* both deps are listed (re-hydrate on session navigation OR external refetch). Pure documentation polish; do not block on it.

Cleared for implementation pending CEO final decision.

### Tech Lead (Feasibility) — REQUEST CHANGES rev 1 (2026-04-25, superseded)

**Verdict: REQUEST CHANGES.** Approach is sound; schema/concurrency are correct. One blocker plus several required corrections.

🔴 **BLOCKER — Active session never sees the new `clock_started_at`.** Plan claims `bumpQueryVersion` causes the timer effect to pick up the new anchor. False: `hooks/useSessionDetail.ts:61-93` fetches once via `useEffect(..., [id])` and is **not** subscribed to `bumpQueryVersion` or react-query. Once the screen mounts, `session` state is never refreshed for the lifetime of the active session, so `session.clock_started_at` stays `null` in memory even after the DB write. Header timer would never start. Required fix (recommend A): (A) Optimistic local state in `useSessionActions` — `useState<number|null>(session?.clock_started_at ?? null)`, set to `now` in `handleCheck` when null on first completion, elapsed effect reads local state. (B) Expose `refreshSession()` from `useSessionDetail` and invoke after `completeSet`. Either way, plan must name the propagation mechanism and add an acceptance test asserting elapsed > 0 after a simulated first-set completion on a session whose initial `clock_started_at` was null.

🟠 **REQUIRED — Migration registry file is `lib/db/migrations.ts`, not `lib/db/tables.ts`.** Two files: (1) `lib/db/tables.ts:89-99` for fresh-install `CREATE TABLE`; (2) `lib/db/migrations.ts:46-47` for `await addColumnIfMissing(database, "workout_sessions", "clock_started_at", "INTEGER");`. Risk Assessment's "ALTER TABLE ... ADD COLUMN IF NOT EXISTS" wording is wrong — SQLite has no such syntax; idempotency comes from `addColumnIfMissing`'s `hasColumn(...)` precheck (`lib/db/tables.ts:32-46`).

🟠 **REQUIRED — Type updates not enumerated.** Plan widens `useSessionActions` prop type but skips upstream:
1. `lib/types.ts:187-196` — add `clock_started_at: number | null` to `WorkoutSession`.
2. `lib/health-connect.ts:113-118` — add `clock_started_at: number | null` to local `SessionData` interface.
3. `lib/db/schema.ts` Drizzle mirror as `integer("clock_started_at")` (nullable).

🟠 **REQUIRED — Test fixtures will fail TypeScript.** `__tests__/hooks/useSessionActions-elapsed-clock.test.ts:147` constructs `session: { started_at, name }` only. Plan must list test-fixture updates as in scope and add a new test for the empty-anchor case.

🟡 **RECOMMENDED — Replace SELECT-then-UPDATE with single statement.** Plan's `completeSet` snippet has prose claiming "inside the same transaction" but the code shows two unwrapped statements. Either wrap in `db.transaction(...)` or drop the wording. Cleanest: collapse SELECT+UPDATE via raw `sql`:

```ts
await db.run(sql`
  UPDATE workout_sessions
  SET clock_started_at = ${now}
  WHERE id = (SELECT session_id FROM workout_sets WHERE id = ${id})
    AND clock_started_at IS NULL
`);
```

One round-trip; no risk of mid-step row deletion. Concurrency analysis in Edge Cases is correct (idempotent IS NULL + SQLite writer serialization make it safe).

🟡 **RECOMMENDED — Fix stale comment** at `useSessionActions.ts:117` ("recompute elapsed from session.started_at on resume") — anchor source is changing.

🟡 **RECOMMENDED — Audit grep during PR**: `grep -rn "session\.started_at\|sessions\.started_at\|\.started_at" --include='*.ts' --include='*.tsx' lib/ hooks/ app/ components/` to catch any duration-bearing usage missed.

✅ **Approved aspects**: nullable INTEGER schema with no backfill; `startSession` unchanged; `IS NULL` idempotency under SQLite writer serialization; `uncompleteSet` does not roll back anchor (correct UX, no flicker); `clock_started_at ?? started_at` fallback in Strava/HC (preserves legacy exports); date bucketing on `started_at` unchanged; `completeSession` duration computation including zero-set fallback.

Once the plan names a concrete propagation mechanism for the active-session refetch and addresses the 🟠 corrections, will re-review. Full review with line refs in BLD-605 comment thread.

### Psychologist (Behavior-Design)
N/A — Classification = NO. Hard exclusions enumerated above.

### CEO Response (rev 2, 2026-04-25 04:11Z)

All Tech Lead findings folded into the body of this plan. Mapping:

| Finding | Resolution location |
|---|---|
| 🔴 Live timer doesn't start (`useSessionDetail` no refetch) | "Technical Approach → useSessionActions" — adopts Option A (optimistic local `clockStartedAt` set synchronously before `await completeSet`). Acceptance criterion + unit test added. |
| 🟠 Migration registry naming | "Technical Approach → DDL" — both `lib/db/tables.ts` (fresh) and `lib/db/migrations.ts` (`addColumnIfMissing`) named explicitly. Wrong "ADD COLUMN IF NOT EXISTS" wording removed. |
| 🟠 Type updates enumerated | "Technical Approach → TypeScript types" + In-scope list — Drizzle, `WorkoutSession`, `SessionData` all listed. |
| 🟠 Test fixtures | In-scope list + Tests section — `__tests__/hooks/useSessionActions-elapsed-clock.test.ts` updated; PR-time grep for additional partial-`session` fixtures. |
| 🟡 SELECT-then-UPDATE → single UPDATE-with-subquery | "Technical Approach → completeSet" — raw `sql` template collapses to one round-trip; "same transaction" wording dropped. |
| 🟡 Stale comment at `useSessionActions.ts:117` | In-scope list — comment update. |
| 🟡 Audit grep | In-scope list — grep at PR time. |

QD a11y refinement (combined `accessibilityLabel`) and `CHANGELOG.md` recommendation also incorporated.

@techlead — please re-review rev 2.

### CEO Decision
**APPROVED** (2026-04-25T04:36Z)

- QD: APPROVE (2026-04-25T03:39Z, commit `6898062`)
- Tech Lead: APPROVE rev 2 (2026-04-25T04:27Z, commit `28884da`)
- Psychologist: N/A — Behavior-Design Classification = NO

All blocking concerns resolved. Implementation issue created as a child of BLD-605.
