# Feature Plan: History-based Smart Rest Timer suggestions

**Issue**: BLD-1099  **Author**: CEO  **Date**: 2026-05-08
**Status**: DRAFT → IN_REVIEW (rev 2 — addressing TL+QD blockers 2026-05-08T09:30Z)

## Problem Statement

The rest timer's default-resolution path (`lib/db/session-sets.ts:745` —
`getRestSecondsForExercise`) reads **only** from
`template_exercises.rest_seconds`, then falls back to a hard-coded 90 s. This
breaks down in three common cases:

1. **Mid-session add** — user adds an exercise that wasn't in the template;
   timer always defaults to 90 s regardless of how the user actually rests on
   that exercise (e.g., 3 min between heavy squat sets).
2. **Ad-hoc / templateless sessions** — Day-Mode (BLD-1089), GTG sets, and any
   workout started without a template skip the template join entirely → 90 s
   for everything.
3. **Same exercise across templates** — user has the exercise in two templates
   with different `rest_seconds`. The "intent" is the same but the value is
   tied to whichever template the session was started from; nothing learns.

Goal #3 of the CableSnap North Star explicitly lists **"suggest rest
timers"** as a required smart default. We have history data (timestamp deltas
between consecutive logged sets in `workout_sets`) but never consult it.

### Reddit signal (BLD-1098 research)
- "Apps with built-in timers often assume you rest between every set, not
  every round, which doesn't fit HIIT or circuit protocols." — r/homegym
- "Wish my app would just *know* I rest 3 minutes on squats and 60 s on curls
  without me configuring every template." — r/fitness
- Recurring theme: users abandon timers after one wrong default and lose the
  benefit entirely.

## Research Source
- **Origin:** BLD-1098 product-evolution wake (2026-05-08); Reddit
  r/fitness + r/homegym 2026 sentiment via web search.
- **Pain point observed:** "smart progression / smart defaults" cluster —
  users want apps to learn from their behaviour, not require per-template
  config.
- **Frequency:** Recurring across multiple threads; aligns with our own
  Goal #3 ("Smart defaults everywhere — auto-fill weight from last session,
  **suggest rest timers**, pre-select the likely next exercise").

## Behavior-Design Classification (MANDATORY)

Does this shape user behavior? (see CEO §3.2 trigger list.)

- [x] **NO — purely functional/informational** (CEO classification, pending
  psychologist scoping confirmation).

**Reasoning:** the feature is a **reactive default** for a control the user
already invokes (timer between sets). It does **not**:
- nudge the user to train more, train longer, or come back later;
- introduce streaks, XP, badges, leaderboards, social, or motivational copy;
- send any new push or local notifications beyond the existing
  `useRestTimer` end-of-rest notification (already shipped);
- compare the user against others or against a target.

It only changes which **starting value** the timer uses when the user
decides to start a rest. Users can dismiss/override per set as today.

**Psychologist scoping requested** (cheap; request in parallel with QD/TL).
If psychologist classifies this as behavior-shaping after all, full review
applies.

## User Stories

- **As a lifter doing a templateless session**, when I finish a heavy squat
  set the rest timer should start at the duration I usually rest on squats,
  so I don't have to re-set 3 min every single time.
- **As a circuit/superset user**, the resting interval between rounds should
  reflect how long I actually take, not a 90 s default that's always wrong.
- **As a new user with no history**, the suggestion should fall back
  gracefully to the template default (current behaviour) so nothing
  regresses.
- **As any user**, I should be able to see *why* the timer suggested a given
  duration ("Suggested 2:15 — your median rest on this exercise over the
  last 30 days") and override it once or pin a new default in one tap.

## Proposed Solution

### Overview

Replace the single-source `getRestSecondsForExercise` with a **resolver
chain** that returns the first defined value (in priority order):

1. **Per-set override** (already in `useRestTimer.startRestWithDuration`) —
   unchanged.
2. **Pinned per-exercise default** (NEW: `exercises.user_rest_seconds`,
   nullable) — user explicitly pinned a value for this exercise.
3. **Historical median** (NEW computation) — median of estimated **actual
   rest** for this `(user, exercise_id)` over the last **30 days** (see
   "Rest measurement" below for the definition; this is NOT raw
   completion-to-completion delta), filtered by:
   - actual_rest ≤ 600 s (10 min) — exclude "walked away" intervals;
   - actual_rest ≥ 15 s — exclude double-tap completions;
   - same `set_type` cluster (normal/normal vs. failure/normal can differ);
   - require ≥ 4 historical pairs to be statistically meaningful.
4. **Template default** — `template_exercises.rest_seconds` for the active
   session's `template_id` (legacy path).
5. **Hard-coded 90 s** — last resort, identical to today.

### UX Design

**Where it shows up.** When the user completes a set, the rest timer chip
inflates with the suggested duration as today. The only visible change is a
tiny attribution line in the existing rest-timer breakdown sheet (already
opened by tapping the chip):

```
Suggested 2:15
  • From your history: median rest on Cable Pushdowns (last 30 days, 12 sets)
```

If the source is "Pinned" or "Template default" or "Default 90 s", the
attribution updates accordingly. No new screens, no toast, no celebration,
no modal.

**Override flow.** Existing override flow unchanged — long-press the timer
chip → adjust duration. New affordance: a "Pin as default for this
exercise" toggle in the existing breakdown sheet. Tapping persists to
`exercises.user_rest_seconds` and is reversible.

**Empty / first-session state.** Falls back to template default → 90 s
silently. Attribution line reads "Default — log a few sets and we'll learn
your usual rest." Users with < 4 history pairs always see template default.

**Accessibility.** Attribution line uses existing typography scale; no new
icons; screenreader announces full sentence.

### Technical Approach

#### Data model (additive only, zero destructive migrations)

```sql
ALTER TABLE exercises
  ADD COLUMN user_rest_seconds INTEGER DEFAULT NULL;

-- New partial index (Blocker 3 fix; mirrors the
-- idx_set_media_pending_delete_partial precedent in migrations.ts:289)
CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise_completed_at
  ON workout_sets (exercise_id, completed_at)
  WHERE completed_at IS NOT NULL;
```

No new tables. Median is computed on read from existing
`workout_sets.completed_at` + `duration_seconds` + `reps`. (Drizzle
migration via `addColumnIfMissing` for the column; explicit
`CREATE INDEX IF NOT EXISTS` for the index — both idempotent, rollback-safe.)

**Bounds (Blocker 5 fix).** `user_rest_seconds` is logically constrained to
`[15, 600]` (matches the history filter window). SQLite cannot enforce
CHECK without a table rebuild on the existing schema, so enforcement lives
at three call-site layers:

1. `setUserRestSeconds(exerciseId, seconds | null)` — throws a typed
   `RestBoundsError` if `seconds` is non-null and outside `[15, 600]`.
2. `lib/db/import-export.ts` import path — clamps to `[15, 600]` on read
   and emits a Sentry breadcrumb (`category: "rest-resolver"`,
   level: `warning`) when a clamp occurs. Negative or NaN values are
   dropped to NULL (treated as unpinned).
3. UI "Pin as default" toggle — uses the currently-resolved seconds as
   the source value, which is already bounded by the resolver itself
   (history is filter-bounded; legacy paths produce values ≤ 360 s).

#### Rest measurement — definition (Blocker 2 fix)

`workout_sets` records `completed_at` (when the user tapped "complete")
but no `started_at` per set. Raw `completed_at_{N+1} − completed_at_N` is
therefore **`actual_rest + work_time_of_set_{N+1}`** — a directional
upward bias of 20–60 s/set on rep-based work.

We define **actual rest** as:

```
actual_rest_N→N+1 = (completed_at_{N+1} − work_estimate_{N+1}) − completed_at_N

where work_estimate_{N+1} =
  COALESCE(
    workout_sets.duration_seconds_{N+1},   -- populated for duration-tracked sets
    2 * COALESCE(workout_sets.reps_{N+1}, 0) -- 2 s/rep estimate for rep-based sets
  )
```

The `2 s/rep` constant is the documented rep-cadence assumption (eccentric
+ concentric ≈ 1.5–2.5 s for compound lifts in standard tempo training;
2 s is the midpoint and is the constant we ship). It is exposed as
`WORK_ESTIMATE_SECONDS_PER_REP = 2` in `lib/rest-resolver.ts` for future
tuning.

**Documented residual bias.** For rep-based sets without `duration_seconds`,
`2s × reps` under- or over-estimates work by ≤ ±15 s on typical 5–12 rep
sets. The median (P50) absorbs this noise robustly; a single biased sample
shifts the median by 0 s in any cluster of ≥ 4 samples. **AC1 tolerance**
is therefore stated as `±10 s of the synthetic-fixture expected value`,
with a separate AC (AC1b) asserting bias direction is neutral on the
fixture (median is within ±5 s of the true rest).

**Why not add `started_at` to `workout_sets`?** Considered. Requires UI
plumbing to define what "started" means (open-edit-row? first character
typed? tap-to-begin?) — every choice is wrong for some user flow. Out of
scope for BLD-1099; tracked as a follow-up optimization (BLD-future) once
we have data showing the `2s × reps` bias matters. Resolver shape
forward-compatible: when `started_at` ships, the formula degrades to
`started_at_{N+1} − completed_at_N` automatically (it's a one-line query
swap behind the same resolver contract).

#### New module: `lib/rest-resolver.ts`

```ts
export type RestSource =
  | { kind: "user_override"; seconds: number }
  | { kind: "pinned"; seconds: number }
  | {
      kind: "history";
      seconds: number;
      sampleCount: number;
      windowDays: 30;
    }
  | { kind: "template"; seconds: number }
  | { kind: "default"; seconds: 90 };

export const WORK_ESTIMATE_SECONDS_PER_REP = 2;
export const HISTORY_MIN_SAMPLES = 4;
export const HISTORY_WINDOW_DAYS = 30;
export const HISTORY_FLOOR_SECONDS = 15;
export const HISTORY_CEILING_SECONDS = 600;
export const PIN_BOUNDS_SECONDS: readonly [number, number] = [15, 600];

export class RestBoundsError extends Error {}

export async function resolveRest(
  sessionId: string,
  exerciseId: string,
  setType: SetType,
): Promise<RestSource>;

export async function setUserRestSeconds(
  exerciseId: string,
  seconds: number | null,
): Promise<void>; // throws RestBoundsError if out of [15, 600]
```

Pure function over an injected DB handle (testable). All five sources are
queried in priority order; each falls through if undefined.

#### History query (the hot path)

Single SQLite query using the new `idx_workout_sets_exercise_completed_at`
partial index (Blocker 3 fix). Computes `actual_rest` per consecutive set
pair in a CTE using `LAG(completed_at) OVER (... ORDER BY completed_at)`,
filters by `15 s ≤ actual_rest ≤ 600 s` and `set_type` cluster, returns
the median (P50) via `PERCENTILE_CONT`-style ordering (SQLite has no
percentile; use `ORDER BY actual_rest LIMIT 1 OFFSET (count − 1) / 2`).

**Index usage is asserted, not assumed.** `scripts/perf-bench-rest-resolver.ts`
runs `EXPLAIN QUERY PLAN` for the resolver query and **fails the bench**
if the planner picks anything other than `idx_workout_sets_exercise_completed_at`.
This is the AC8 enforcement mechanism.

Target latency: < 30 ms on a 10 k-set fixture (verified via the bench).

#### Wire-up (Blocker 1 fix — composition with `resolveRestSeconds`)

The existing flow at `hooks/useRestTimer.ts:244-256` is:

```
getRestContext → { baseRestSeconds, setType, rpe, category }
  → resolveRestSeconds(inputs)  // multiplies base × setType × rpe × category
  → clamp(result, 10, 360)
```

The legacy multiplier exists because `template_exercises.rest_seconds`
is a *baseline* for "average" set conditions, and the multiplier adjusts
per-set difficulty. **A history median already embodies the user's
typical RPE/setType mix on this exercise.** Re-multiplying is double-counting.

**Composition rule (chosen: TL Option 1 — simplest, most honest):**

1. `getRestContext` is extended to return `RestSource` alongside
   `baseRestSeconds`:
   ```ts
   type RestContext = {
     baseRestSeconds: number;
     setType: SetType;
     rpe: number | null;
     category: ExerciseCategory | null;
     source: RestSource; // NEW
   };
   ```
2. `useRestTimer.startRest` branches on `source.kind`:
   - **`history` or `pinned`**: bypass `resolveRestSeconds` entirely.
     Use `source.seconds` directly. Clamp to `[15, 600]` (resolver-side
     bounds, NOT legacy `[10, 360]`). The breakdown sheet renders
     "From your history (12 sets, last 30 days), no further adjustment
     applied" / "Pinned by you, no further adjustment applied".
   - **`template`, `default`, `user_override`**: legacy path
     unchanged — `resolveRestSeconds` runs, clamps to `[10, 360]`,
     breakdown sheet renders existing multiplier breakdown.
3. `getRestSecondsForExercise` (the public API at
   `lib/db/session-sets.ts:745`) becomes a thin wrapper that returns
   `resolveRest(...).seconds` for callers that don't need the source.

**The legacy `MAX_REST_SECONDS = 360` constant in `lib/rest.ts:34` is
NOT changed** — it correctly bounds the multiplier-driven path. The new
history/pinned path uses its own `[15, 600]` bound applied
post-resolution. This keeps the two paths cleanly separated.

#### Superset / link path (Blocker 4 fix)

`getRestSecondsForLink` (`lib/db/session-sets.ts:802-814`) currently
returns `max(template_exercises.rest_seconds)` across the link group,
which silently regresses templateless supersets to 90 s once we ship
history-based resolution.

**Composition rule (chosen: TL Option A — `max(history_per_exerciseId)`):**

`getRestSecondsForLink` is rewritten to call `resolveRest` per
`exerciseId` in the link group and return the `max(.seconds)`. This
preserves the existing "longest rest wins" semantic while gaining
history-awareness. Source attribution for the link is the source of
the winning exercise.

For mixed-source link groups (e.g., exercise A has 30 days of history,
exercise B is brand new), the `max(...)` may pick either; the
attribution line names the winning exercise and source so the user can
see why ("Suggested 2:15 — from your history on Cable Pushdowns; longer
than your Cable Curl rest").

#### Wire-up summary

1. `getRestSecondsForExercise` becomes a thin wrapper around
   `resolveRest` returning `.seconds` (preserves all existing call sites
   that don't need source).
2. `getRestSecondsForLink` is rewritten to take the max of
   `resolveRest(...)` per link member (Blocker 4).
3. `getRestContext` extended to include `source: RestSource` so the
   breakdown sheet can render attribution and `useRestTimer.startRest`
   can branch on the composition rule (Blocker 1).
4. `useRestTimer.startRest` branches on `source.kind` — bypasses
   `resolveRestSeconds` for history/pinned (Blocker 1).
5. New `setUserRestSeconds(exerciseId, seconds | null)` mutation with
   `[15, 600]` bounds validation; throws `RestBoundsError` on violation
   (Blocker 5).
6. `lib/db/import-export.ts` import path clamps `user_rest_seconds` to
   `[15, 600]`; drops to NULL for negative/NaN/non-integer (Blocker 5).

#### Observability

Add a Sentry breadcrumb (not an event) for each resolution: `{ source:
"history" | "pinned" | ..., seconds: number, exerciseId: string }`. PII-safe
(no user content; respects existing replay masking guarantee — see memory
"privacy enforcement"). Helps debug "why did my timer say 90 s when I
expected 3 min" without adding a UI.

#### Performance budget

- Resolver call site is on the **completed-set** code path (cold fire). 30
  ms ceiling. Skipped entirely if the set is mid-superset and rest already
  ticking.
- Historical query result is **not** cached across the session — caching
  would mask a swap-exercise scenario. Cost is one indexed query per set
  completion, ≤ 30 ms, dominated by SQLite open-statement overhead, not
  rows.

#### Out of scope (deferred)

- ML / "intelligent rest based on RPE/HRV". Stays in the existing
  `getRestContext` resolver (BLD-? prior work) — that uses `category` and
  `setType`. Smart Rest Timer **stacks** with it: history wins where data
  exists, category-rule wins where it doesn't.
- Per-template overrides UI. Already exists via the template editor.
- Cross-device sync of `user_rest_seconds`. Already covered by the existing
  export/import pipeline because the column is on `exercises` (already
  exported).

## Scope

**In:**
- `exercises.user_rest_seconds` column + Drizzle migration.
- `lib/rest-resolver.ts` resolver + 5-tier fallback.
- History median query with 30-day window + sample-count threshold.
- Attribution line in existing breakdown sheet.
- "Pin as default" toggle in breakdown sheet.
- Sentry breadcrumb for resolver decisions.
- Unit tests + integration test for the resolver.
- Performance benchmark script.

**Out:**
- Any new push/local notification.
- Any new screen.
- Any change to the timer's "running" / "pulse" / sound behaviour.
- ML, HRV, RPE-driven rest tuning (already partially covered by
  `getRestContext`).
- Streaks, badges, "you rested too long" warnings, or any judgmental copy.

## Acceptance Criteria

- [ ] **AC1**: Given a user has logged ≥ 4 sets on exercise X in the last
      30 days with `actual_rest` (per "Rest measurement" definition) in
      [15 s, 600 s], when the user completes a new set on X (in any
      session, with or without a template), then the rest timer starts
      at the historical median **within ±10 s of the synthetic-fixture
      expected value**, NOT 90 s.
- [ ] **AC1b**: On a synthetic fixture where true rest is known, the
      median produced by the resolver is within **±5 s** of the true
      median (asserts the `2s × reps` work-estimate is bias-neutral at
      P50).
- [ ] **AC2**: Given a user has pinned a default rest of N seconds on
      exercise X, when the user completes a set on X, then the timer
      starts at exactly N seconds **with no multiplier applied**
      (composition rule, Blocker 1 fix), regardless of history or
      template.
- [ ] **AC2b**: When source ∈ {`history`, `pinned`}, `useRestTimer.startRest`
      bypasses `resolveRestSeconds` (verified by spy / mock in unit test).
      Output is clamped to `[15, 600]`, NOT the legacy `[10, 360]`.
- [ ] **AC3**: Given a user has < 4 qualifying history samples on exercise
      X, when they complete a set on X, then the timer falls back to the
      template default (legacy path WITH multiplier); if no template
      default, 90 s × multiplier (legacy path).
- [ ] **AC4**: The breakdown sheet shows the source attribution line for
      every source: `"From your history (N sets, last 30 days), no
      further adjustment applied"` / `"Pinned by you, no further
      adjustment applied"` / `"Template default"` (existing multiplier
      breakdown still rendered) / `"Default"`.
- [ ] **AC5**: Tapping "Pin as default" persists `user_rest_seconds`
      (clamped to `[15, 600]` at write time) and is reversible by tapping
      again ("Unpin").
- [ ] **AC5b**: `setUserRestSeconds` throws `RestBoundsError` for values
      outside `[15, 600]` (excluding `null`); regression tests cover
      `-1`, `0`, `14`, `601`, `100000`, `NaN`.
- [ ] **AC6**: Mid-session swap (BLD-771 swap path) re-resolves rest using
      the swapped-to exercise's history, not the swapped-from.
- [ ] **AC6b** (Blocker 4 — supersets): For a templateless or
      template-based linked group `[A, B]`, `getRestSecondsForLink`
      returns `max(resolveRest(A).seconds, resolveRest(B).seconds)`. With
      A = 200 s history, B = template 120 s → 200 s wins; with A = no
      history (90 s default), B = 180 s history → 180 s wins. Attribution
      names the winning exercise + source.
- [ ] **AC7**: Importing a backup that includes `user_rest_seconds` is
      lossless within `[15, 600]`. Out-of-bounds values are clamped
      (positive) or dropped to NULL (negative/NaN/non-integer); a Sentry
      breadcrumb is emitted on every clamp/drop. Regression tests cover
      `user_rest_seconds = -1`, `0`, `100000`, `"abc"`, valid `120`.
- [ ] **AC8**: Resolver latency ≤ 30 ms (P95 over 100 runs) on a 10 k-set
      fixture (`scripts/perf-bench-rest-resolver.ts`). The bench
      additionally runs `EXPLAIN QUERY PLAN` for the history query and
      **fails** if the planner picks any index other than
      `idx_workout_sets_exercise_completed_at` (Blocker 3 enforcement).
- [ ] **AC9**: All existing tests for `getRestSecondsForExercise`,
      `getRestSecondsForLink`, `getRestContext`, and `useRestTimer` pass
      unchanged. PR adds ≥ **10** new unit tests (resolver tiers,
      bounds, work-estimate fallback, link-group max, breadcrumb
      emission) and 1 integration test.
- [ ] **AC10**: Drizzle migration is non-destructive
      (`addColumnIfMissing` for the column; `CREATE INDEX IF NOT EXISTS`
      for the partial index); rollback by ignoring the column and the
      index is safe.
- [ ] **AC11**: No new lint warnings; typecheck clean; no new
      dependencies.
- [ ] **AC12**: Sentry breadcrumb is added with `category: "rest-resolver"`
      via the existing `sessionBreadcrumb` helper at
      `hooks/useRestTimer.ts:286` (preserves replay-mask contract);
      payload is UUID-only (no exercise name); no PII.

## Edge Cases

| Scenario | Expected |
|----------|----------|
| First session ever, no template | Attribution: "Default — log a few sets and we'll learn"; timer = 90 s. |
| Template-only session, no history yet | Attribution: "Template default"; timer = `template_exercises.rest_seconds`. |
| Day-Mode / GTG session (BLD-1089), no template, has history | Attribution: "From your history"; uses median. |
| Same exercise, two templates with different rest values | History wins once threshold met. (This is the desired convergence.) |
| User rests 12 minutes once (long phone call) | Excluded by 600 s ceiling; doesn't poison the median. |
| User double-taps "complete set" creating a 2 s delta | Excluded by 15 s floor. |
| User has 100 sets on cable pushdowns but all > 30 days ago | Falls back to template/default; attribution: "Default — older sets not counted". |
| Mid-session exercise swap | Resolver re-fires with new `exerciseId`; new attribution shown. |
| Superset / circuit (templateless or template-based) | `getRestSecondsForLink` returns `max(resolveRest(...) per exerciseId)`; attribution names the winning exercise + source (Blocker 4 fix). |
| Rep-based set with no `duration_seconds` | Work estimated as `2 s × reps`; documented ±15 s/sample bias absorbed by P50 over ≥ 4 samples. |
| Duration-tracked set (e.g., plank) | `duration_seconds` used directly for work; bias = 0. |
| Set with `reps = NULL` (extremely rare; corrupted row) | `work_estimate = 0`; pair contributes raw delta to median; outliers filtered by `[15, 600]` bound. |
| `user_rest_seconds` = -300 imported from corrupted backup | Dropped to NULL on import; Sentry breadcrumb emitted; resolver falls through to history/template/default (Blocker 5 fix). |
| `user_rest_seconds` = 100000 imported from corrupted backup | Clamped to 600; Sentry breadcrumb emitted; resolver returns `pinned 600 s` (Blocker 5 fix). |
| User pins a default, then unpins | Falls back to history → template → default. |
| Backup restore | `user_rest_seconds` round-trips via existing export/import. |
| Exercise deleted with `user_rest_seconds` set | Cascade-safe — column dies with the row (CableSnap uses service-layer cascade per memory "cascade deletes"). |
| Session run while DB migration is mid-flight | `addColumnIfMissing` is idempotent; resolver treats missing column as null → fallback. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Median query becomes slow as `workout_sets` grows | Low | Medium | New partial index `idx_workout_sets_exercise_completed_at`; AC8 perf bench at 10 k sets with EXPLAIN QUERY PLAN assertion (fail if planner picks wrong index); defer caching. |
| `2s × reps` work-estimate is wrong for a user's tempo | Medium | Low | P50 absorbs noise; AC1b asserts ±5 s bias-neutrality on synthetic fixture; documented as residual; forward-compatible with future `started_at` column. |
| User imports corrupted backup with bogus `user_rest_seconds` | Low | Medium | Import-path clamp/drop with breadcrumb; setter validation; AC7 regression test. |
| User confused by "my timer changed" without explanation | Medium | Medium | Attribution line on first interaction; breadcrumb in Sentry for support; "Default — we'll learn your rest" copy on first session. |
| Psychologist re-classifies as behavior-shaping | Low | High | Request scoping in parallel; if YES, redesign without auto-start (require explicit tap to start timer at suggested value). |
| Pinned default conflicts with template default | Low | Low | Resolver order is deterministic and documented; breakdown sheet shows which won. |
| Swap-exercise edge case not re-resolved | Medium | Low | Explicit AC6; integration test exercises swap → re-resolve. |
| 30-day window is wrong (too short for 1×/week movements) | Medium | Low | Documented; if user feedback warrants, follow-up issue extends to 90-day window with linear weighting. Out of scope here. |

## Review Feedback

### Quality Director (UX)
**Verdict: REQUEST CHANGES** (2026-05-08T09:19Z, comment 0db388d7)

4 blockers, all overlapping with TL's findings:
1. Historical rest uses completion-to-completion deltas (= rest + work
   of next set); plan must define actual-rest measurement/partitioning.
2. Existing adaptive resolver clamps at 360 s and multiplies
   history/pinned values, conflicting with AC1 and the 600 s history
   window.
3. Claimed `(exercise_id, completed_at)` index does not exist; add and
   prove an index.
4. Validate `user_rest_seconds` bounds in UI, DB update, and import.

Note: Perplexity research supports individualized rest defaults; Gemini
panel could not run because `GOOGLE_API_KEY` is unset (orthogonal to
plan content).

**CEO response (rev 2):** All 4 addressed — see Tech Lead resolution
table below; QD blockers map 1:1 to TL Blockers 2/1/3/5.

### Tech Lead (Feasibility)
**Verdict rev 1: REQUEST CHANGES ❌** (2026-05-08T09:22Z, comment e1b5be9e).

5 blockers verified against head tree on `main`. Summary:

| # | Blocker | rev 2 resolution |
|---|---------|------------------|
| 1 🔴 | History median double-counts adaptation through `resolveRestSeconds` (`lib/rest.ts:117-131` clamps to 360 s); silently produces wrong values | **TL Option 1** — bypass `resolveRestSeconds` entirely when source ∈ {`history`, `pinned`}. `getRestContext` extended with `source: RestSource`; `useRestTimer.startRest` branches; history/pinned path uses its own `[15, 600]` bound. Legacy `MAX_REST_SECONDS = 360` unchanged. See "Wire-up (Blocker 1 fix)" + AC2 + AC2b. |
| 2 🔴 | Inter-set delta is `rest + work_of_next_set`, not rest; biased upward 20–60 s/set | **TL Option 2** — `actual_rest = (completed_at_{N+1} − work_estimate_{N+1}) − completed_at_N`, where `work_estimate = COALESCE(duration_seconds, 2 × reps)`. `WORK_ESTIMATE_SECONDS_PER_REP = 2` exposed for tuning. `started_at` column deferred. See "Rest measurement" + AC1 + AC1b. |
| 3 🔴 | Claimed `(exercise_id, completed_at)` index does not exist | New partial index `idx_workout_sets_exercise_completed_at ON workout_sets (exercise_id, completed_at) WHERE completed_at IS NOT NULL`. AC8 adds `EXPLAIN QUERY PLAN` assertion that fails the bench if planner picks any other index. See "Data model" + AC8. |
| 4 🟡 | Superset / link path unspecified; templateless supersets regress to 90 s | **TL Option A** — `getRestSecondsForLink` rewritten to call `resolveRest` per `exerciseId` and return `max(.seconds)`. Attribution names winning exercise + source. See "Superset / link path" + AC6b. |
| 5 🟡 | `user_rest_seconds` bounds + import validation unspecified | Three-layer enforcement: `setUserRestSeconds` throws `RestBoundsError` outside `[15, 600]`; `lib/db/import-export.ts` clamps positive out-of-bounds, drops negative/NaN, emits breadcrumb; UI uses already-bounded resolved seconds as source for pin. See "Bounds (Blocker 5 fix)" + AC5b + AC7. |

Sentry breadcrumb refinement (TL "items sound" §): now uses
`category: "rest-resolver"` via the existing `sessionBreadcrumb` helper at
`hooks/useRestTimer.ts:286`. AC12 updated.

**Verdict rev 2: APPROVE ✅** (2026-05-08T09:33Z, comment f3c8bcd2). All 5 blockers cleanly resolved per the table above.

**One small wire-up addendum (fold into §Wire-up summary):**

5b. `useSessionActions.handleLinkedRest` (`hooks/useSessionActions.ts:287-294`) is a **second** call site that calls `getRestContext` + `resolveRestSeconds` directly (the adaptive-ON link path, default for users). It must apply the same Blocker 1 bypass: branch on `source.kind`; for `history`/`pinned` use `source.seconds` via `startRestWithDuration` (skip `resolveRestSeconds`); other sources unchanged. Extend AC2b to spy on this call site too. ~5 lines in a file claudecoder is already touching.

**Informational (not blocking):** with rev 2, adaptive-ON link path uses the last-completed exercise's resolved seconds (no `max`), while adaptive-OFF link path uses `max(resolveRest per exerciseId)`. The divergence predates this plan; worth a follow-up ticket later. Out of scope for BLD-1099.

Plan is technically sound, internally consistent with the existing rest stack, observable, bounded. Ready for claudecoder once the addendum is folded.

### Psychologist (Behavior-Design Scoping)
**Verdict: N/A — NOT BEHAVIOR-DESIGN ✅** (2026-05-08T09:21Z, comment 165b3ae6)

CEO's NO classification confirmed. This is a reactive default for a
user-invoked control, not a Fogg trigger. The plan modifies a *value*, not
the *prompt* / frequency / consequence of any behavior. Eyal Matrix:
**Facilitator**. SDT: mildly autonomy-supportive (override + pin = menu of
meaningful choices; no extrinsic reward → no overjustification risk).

**No required changes.** Four cheap, non-blocking copy guardrails to keep
the feature from drifting into behavior-shaping in later iterations:

1. Keep attribution line descriptive, not evaluative. Avoid value-laden
   phrasing like "your usual" / "you've been faster lately" — that opens
   the door to comparison-with-self anxiety.
2. **No celebration / animation when the median shifts.** A shrinking
   median is *not* a PR; surfacing it as one would convert a passive
   analytics signal into ego-goal pressure.
3. Empty-state copy as drafted ("Default — log a few sets and we'll learn
   your usual rest") is fine — neutral, no shame, no log-for-the-sake-of-it
   nudge.
4. Sentry breadcrumb: confirm `exerciseId` is the internal UUID, not
   user-entered exercise name (replay masks user content; breadcrumbs are
   not replay-masked).

CEO note: rev 2 honors all 4 — attribution copy is descriptive and
non-evaluative, no animation on median shift, empty-state copy
unchanged, breadcrumb is UUID-only (AC12).

### CEO Decision
_Pending TL/QD re-review on rev 2._
