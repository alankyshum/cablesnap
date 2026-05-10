# Feature Plan: Per-Exercise Plateau Detection & Break-Through Suggestions

**Issue**: BLD-1121  **Author**: CEO  **Date**: 2026-05-09
**Status**: APPROVED (rev 4 — QD APPROVE, TL APPROVE unconditional, Psych APPROVED rev 2/3 verdict stands)

## Research Source
- **Origin:** 2026-05-09 daily Reddit/competitor research (perplexity sonar; citations: hotelgyms.com, setgraph.app/ai-blog, garagegymreviews, hevyapp.com)
- **Pain point observed:** Across recurring 2025–2026 review threads, the loudest gap in Hevy / Strong / FitNotes / JEFIT is **per-movement plateau awareness**. Users say JEFIT's AI overload "feels generic, not sensitive to fatigue/RPE." Hevy users wish for a "did I plateau?"-style alert. Strong's analytics are "basic." None of the four mainstream trackers tell the user *which specific lift has stalled and what to do next* — they only show raw history charts and let the lifter eyeball it.
- **Frequency:** Recurring, top-level theme across ~6 cited reviews and Reddit-style threads.

## Problem Statement
CableSnap users get a **single-session-back** "Next" suggestion (lib/rm.ts `suggest()`) and a **whole-body** overreaching nudge (lib/overreaching.ts → `DeloadNudgeCard`). Neither answers the highest-value question for an intermediate lifter: **"Has *this exercise* stalled, and what do I do about it?"**

Today, when a user has hit Cable Lat Pulldown 60 kg × 8 for four consecutive sessions with rising RPE, CableSnap silently keeps suggesting the same load via `suggest()` (which only compares the last two sessions). The lifter must notice the stall manually by scrolling history. This is the exact friction Reddit lifters complain about across all four mainstream apps.

## Behavior-Design Classification (MANDATORY)

- [x] **YES — borderline.** The feature surfaces a labeled "plateau" detection and a recommended next action. It overlaps with §3.2 triggers: *motivational progress visualizations* and (mildly) *progression coaching*. **Psychologist review is MANDATORY.**
- [ ] NO

**Design intent (for psych review):**
- Surfacing is **inline / pull, never push.** No notifications, no sounds, no streaks, no shame copy.
- The detection is shown as a passive informational card on the exercise detail screen and as an annotation on the existing in-session "Next" suggestion.
- The user retains full autonomy: they can accept the break-through suggestion (one tap, applies to empty sets via existing apply-suggestion flow), ignore it, or dismiss the badge for the exercise for 14 days.
- Copy is descriptive ("4 sessions at 60 kg × 8 — looks like a stall"), not loss-framed ("You've been stuck — don't let this slide!"). No FOMO, no guilt.
- We explicitly avoid framing plateaus as failure; the body of the card explains plateaus are normal and a deload week is the standard intermediate-lifter response.

## User Stories
1. As an intermediate lifter, when I open the detail screen for a lift I've been hitting weekly, I want to see **at a glance** whether I've stalled on it, so I don't waste another month grinding the same numbers.
2. As a cable / bodyweight athlete with little programming context, when a stall is detected, I want a **specific suggested next session** (deload weight, rep-targeting, or a +1 rep push) so I don't have to know periodization theory.
3. As a user who already knows what they're doing, I want a one-tap dismiss so the same plateau badge doesn't keep nagging me for 14 days.

## Proposed Solution

### Overview
Add a **per-exercise plateau classifier** in `lib/plateau.ts` (new) that runs over the last N completed working sessions for one exercise and emits one of:

| Classification | Definition (working-set scope; warmup/dropset/failure excluded) |
|---|---|
| `progressing` | Top-set load increased OR top-set reps increased in last session vs. prior — no further surfacing. |
| `maintaining` | No top-set change but avg RPE stable (within ±0.5) — no surfacing. |
| `stalled` | ≥3 consecutive sessions with same top-set load × top-set reps AND avg RPE stable or rising. |
| `regressing` | Top-set e1RM trending down ≥5% over 3 sessions. |

When `stalled` or `regressing`, the classifier emits a **primary** `BreakThroughSuggestion` plus, when the alternate branch is computable, a **secondary** `BreakThroughSuggestion` (psych binding change #2 — preserve autonomy by offering two equivalent choices, not one prescription):

| Branch | Primary (chosen by RPE) | Secondary (always shown when computable) |
|---|---|---|
| `stalled`, avg RPE ≥ 8 | **Deload:** `roundDownToStep(lastTopWeight × 0.9, step)` × same reps | **Rep target:** same load × `topReps + 2` |
| `stalled`, avg RPE < 8 | **Rep target:** same load × `topReps + 2` | **Deload:** `roundDownToStep(lastTopWeight × 0.9, step)` × same reps |
| `stalled`, bodyweight (no load) | **Rep +1:** same load × `topReps + 1` (Fogg tiny-habit) | _none — single branch is correct for bodyweight_ |
| `regressing` (loaded only) | **Form check:** link to existing form-clip flow (BLD-1108), no forced recording | _none — coaching action is non-numeric_ |

The `regressing` classification is **internal-only** (psych binding change #1) — the literal token `regressing` must never appear in user-visible strings. User-facing copy for that branch is the neutral form-check phrasing in §UX Design Surface 1.

### UX Design

#### Surface 1 — Exercise Detail Screen (`app/exercise/[id].tsx`)
A new compact `PlateauStatusCard` component appears *only when* classification is `stalled` or `regressing` (otherwise no surface — zero UI cost when not needed). Card layout:

1. **Headline (1 line)** — neutral, descriptive:
   - `stalled`: "4 sessions at 60 kg × 8 — looks like a stall"
   - `regressing` (loaded only): "Recent sessions felt heavier than usual"
   - Bodyweight stall: "4 sessions at 12 reps — ready to push past it?"
2. **Body (1–2 sentences)** — combined normalization + identity-affirming framing (psych binding change #3):
   - Stalled (loaded): "Plateaus are normal. Stalls happen to every lifter past the beginner phase — pushing through them is what intermediate training *is*."
   - Stalled (bodyweight): "Plateaus are normal. Adding one rep is the smallest move that keeps progress real."
   - Regressing (form-check branch): "A quick form clip can help you spot what's drifting."
3. **Primary CTA (button, role="button")** — branch-dependent (see table in Overview). Worked example for `60 kg × 8` stall at avg RPE ≥ 8 with `step=2.5`: deload weight = `roundDownToStep(60 × 0.9, 2.5) = 52.5`, so CTA reads "Try 52.5 kg × 8 next session". With `step=5`: `roundDownToStep(60 × 0.9, 5) = 50`, CTA reads "Try 50 kg × 8 next session". Tap → calls `onApplyBreakThrough(updates)` with the fully-empty-set `updates` array (see Technical Approach §Atomic apply path). If no active session exists, persists a single-shot override in `plateau_state.pending[exercise_id]` consumed at next session-init for this exercise.
4. **Secondary CTA (link, role="button", optional — only when a secondary branch is computed)**: e.g., "or push for +2 reps at 60 kg". Tap → applies the secondary `BreakThroughSuggestion` via the same `onApplyBreakThrough` callback. (Psych binding change #2.)
5. **Dismiss CTA (text button, role="button", own focus order)**: "Not now" — dismisses for 14 days. Persisted in the consolidated `app_settings` JSON row `plateau_state` (see Technical Approach §Storage), under the `dismissals[exercise_id]` key.

User-visible copy never contains the literal token `regressing`, `decline`, `going backwards`, `slipping`, or any pejorative framing. Source-contract test enforces this for any `Plateau*` literal in `components/`, `app/`, `hooks/` (extends BLD-569 AC4 pattern).

#### Surface 2 — In-session annotation (`components/session/LastNextRow.tsx`)
When the user is mid-session on a stalled exercise, the existing "Next" pill gets a small leading icon (lucide `TrendingDown` — PascalCase import from `lucide-react-native`) and the existing `SuggestionExplainerModal` body gets one extra paragraph:
> "Plateau detected: same top-set 4 sessions running. Consider this break-through plan."
No new full-screen UI. No new modal.

#### Accessibility
Three independently focusable controls with separate labels/hints (matches `DeloadNudgeCard` pattern; QD clarification — no gesture choreography):

- **Card container**: `accessibilityRole="none"` (RN does not document `"summary"` — use container w/o role; the container's `accessibilityLabel` summarises the headline + body for screen-reader users who use group navigation, e.g. "Plateau detected on Cable Lat Pulldown. 4 sessions at 60 kilograms by 8 reps. Plateaus are normal.").
- **Primary CTA button**: `accessibilityRole="button"`, templated `accessibilityLabel={\`Try ${weight} ${unit} by ${reps} reps next session\`}` (e.g. for the AC1 worked examples this renders as `"Try 52.5 kg by 8 reps next session"` at step 2.5 or `"Try 50 kg by 8 reps next session"` at step 5; never hard-code the weight/reps literal so it cannot drift from AC1's rounding rule), `accessibilityHint="Applies the suggestion to your next session for this exercise"`.
- **Secondary CTA button** (when present): `accessibilityRole="button"`, `accessibilityLabel="Or push for plus 2 reps at 60 kilograms"`, `accessibilityHint="Applies the alternative suggestion instead"`.
- **Dismiss button**: `accessibilityRole="button"`, `accessibilityLabel="Not now"`, `accessibilityHint="Hides this card for 14 days"`.
- Focus order: container → primary → secondary (if present) → dismiss. Card is fully keyboard / screen-reader navigable.

#### Empty / edge UI
- < 3 sessions of history → no card, no badge (insufficient data).
- **Mixed-unit history (kg ↔ lbs):** No coercion in V1 (the schema does not record unit-at-log; see TL blocker 3 / QD blocker 1). The classifier reads `weight` raw and stall detection is **unit-invariant** — equality of stored numbers across the window correctly classifies a stall regardless of the user's current `body_settings.weight_unit`. The break-through suggestion's displayed weight is rendered via `toDisplay()` at render time, not stored. Per-set `weight_unit_at_log` is tracked as a separate follow-up issue and is explicitly out of scope here.

### Technical Approach

#### New module: `lib/plateau.ts`
Pure-function module (no DB, no React, no `app_settings` writes). Mirrors `lib/overreaching.ts` and `lib/rm.ts` style.

```ts
// Internal — never appears in user-visible strings (psych binding change #1).
// Source-contract test asserts no UI literal contains the token "regressing".
export type PlateauClassification = 'progressing' | 'maintaining' | 'stalled' | 'regressing';

export type BreakThroughSuggestion =
  | { kind: 'deload';      weight: number; reps: number; reason: string }
  | { kind: 'rep_target';  weight: number; reps: number; reason: string }
  | { kind: 'rep_plus_one'; weight: number | null; reps: number; reason: string } // bodyweight branch
  | { kind: 'form_check';  reason: string };

export type PlateauResult = {
  classification: PlateauClassification;
  sessionsObserved: number;
  topSetWeight: number | null;
  topSetReps: number | null;
  avgRPE: number | null;
  primarySuggestion: BreakThroughSuggestion | null;
  secondarySuggestion: BreakThroughSuggestion | null; // null when bodyweight or regressing
};

export function classifyPlateau(
  sessions: PlateauSessionRow[],   // pre-fetched, sorted desc by started_at
  isBodyweight: boolean,
  unitStep: number,                 // smallest weight increment (e.g. 2.5 kg)
): PlateauResult;
```

`PlateauSessionRow` is a flat record per session: `{ session_id, started_at, top_set_weight, top_set_reps, top_set_rpe, avg_rpe, all_completed, set_count, bodyweight_modifier_kg }`.

**Top-set selection within a session (TL blocker 2):** highest `weight × reps` among sets where `set_type = 'normal'` (strict equality — matches `lib/db/exercises.ts:298,313` precedent; *not* the looser `set_type != 'warmup'` used by `session-stats.ts`/`strength-overview.ts`). Rationale: dropset and failure sets artificially inflate top-set load and would mask real stalls. Tie-break: latest `set_number`. RPE averaging uses the same `set_type = 'normal'` filter.

**Deload weight rounding (TL nit):** `roundDownToStep(lastTopWeight * 0.9, step)` where `step` comes from user prefs (`body_settings.weight_unit` → 2.5 kg or 5 lb default; existing `WeightPicker` step source).

**Bodyweight branch contract (TL clarification 3):**
- `bodyweight_modifier_kg` NULL → treat as 0 modifier for that session's effective load (display purposes only).
- Mixed NULL / non-NULL within the window → use raw `weight` only (do not silently substitute 0 mid-window).
- The bodyweight stall heuristic ("same max reps for 3+ sessions, suggest +1 rep") uses `top_set_reps` only and ignores `bodyweight_modifier_kg` for the stall test (otherwise a user gaining bodyweight while reps stay flat would NOT trigger).

#### New DB query: `lib/db/exercise-history.ts → getPlateauWindowBatch(exerciseIds, n=4)`
Batched fetcher mirroring `getRecentExerciseSetsBatch` (`lib/db/exercise-history.ts:388`). Two-step pattern:

1. **Sessions step:** `SELECT exercise_id, session_id, started_at FROM workout_sets ws JOIN workout_sessions wsess ON ws.session_id = wsess.id WHERE ws.exercise_id IN (?, ?, ...) AND ws.set_type = 'normal' GROUP BY ws.exercise_id, ws.session_id ORDER BY ws.exercise_id, wsess.started_at DESC` — capped to last `n` sessions per exercise via post-filter (or per-exercise UNION with `LIMIT n` if benchmarks favour it).
2. **Sets step:** `SELECT * FROM workout_sets WHERE session_id IN (<step-1 sessions>) AND set_type = 'normal'` then group in JS.

Returns `Map<exercise_id, PlateauSessionRow[]>` (rows sorted desc by `started_at`; max `n` per exercise; missing exercises = empty array).

**Index plan (TL clarification 1):** existing `idx_workout_sets_exercise` (correct name — *not* `idx_workout_sets_exercise_id`) and `idx_workout_sets_session_exercise` cover the query. For 200 sessions × ≤8 sets/session this is < 1500 rows fetched; no new index. Plan ships with an `EXPLAIN QUERY PLAN` snapshot in the benchmark test.

Single-exercise convenience: `getPlateauWindow(exerciseId, n=4)` wraps `getPlateauWindowBatch([exerciseId], n).get(exerciseId)`.

#### Hook: `hooks/usePlateauStatus.ts` (single-exercise — detail screen only)
React Query hook keyed `['plateau', exerciseId]`. Fetches the single-exercise window via `getPlateauWindow`, reads the consolidated `plateau_state` JSON blob (see Storage), runs `classifyPlateau` (pure), and **owns dismissal lifecycle** (TL blocker 4 / QD clarification — the impure layer, not the classifier):
- On result `progressing` → clears `plateau_state.dismissals[exercise_id]` AND `plateau_state.pending[exercise_id]`.
- On dismiss-tap → writes/refreshes `plateau_state.dismissals[exercise_id].dismissed_at` in the JSON blob.
- On result `stalled`/`regressing` → if `dismissals[exercise_id].dismissed_at + 14d > now`, returns `result` with `dismissedUntil` set so the UI suppresses the card.

`staleTime: 5 min`. Invalidation key prefix: `['plateau']` (TL clarification 5). Mutations that must `queryClient.invalidateQueries({ queryKey: ['plateau'] })`:
- Set save (`saveSet` / `upsertSet`)
- Set delete
- Session complete (`completeSession`)
- Session delete
- Exercise rename / merge (existing `mergeExercise`)
- Plateau dismiss (self-invalidate)
- Apply break-through (self-invalidate; the new sets will reclassify on next tick)

#### In-session batched fetch: `hooks/useSessionData.ts`
Replaces the rejected per-exercise hook call (TL blocker 1):

1. After the existing `getRecentExerciseSetsBatch` call (line ~115), add a **second batched call** `getPlateauWindowBatch(exerciseIds, 4)` once per `load()`.
2. Run pure `classifyPlateau(...)` synchronously per `exerciseId`.
3. Read the consolidated `plateau_state` blob once and filter out exercises whose `dismissals[exercise_id].dismissed_at + 14d > now`.
4. Build `Record<exercise_id, PlateauResult | null>` and merge into the existing `suggestions` map (or its own `plateauHints` map — implementer's choice; the prop on `LastNextRow` is `plateauHint?: BreakThroughSuggestion | null`).

Result: **2 extra SQL queries per session-data load** (one for sessions step, one for sets step), independent of the number of visible exercises. No hook calls inside loops.

#### Atomic apply path: `lib/rm.ts` ↔ `components/session/LastNextRow.tsx`
`Suggestion` (the existing `increase | maintain | rep_increase` discriminated union) is **not** widened (TL clarification 7 / QD blocker 2). Instead:

1. `BreakThroughSuggestion` is a **separate** type exported from `lib/plateau.ts`.
2. New helper `applyBreakThroughFill(s: BreakThroughSuggestion, sets: WorkoutSet[])` → `{ setId: string; weight: number | null; reps: number | null }[]` lives in `lib/plateau.ts`. **Pure** — does NOT call any update API; it builds the `updates` array.
3. Empty-set predicate: include a set in `updates` when `!completed && (weight == null || weight === 0) && (reps == null || reps === 0)` — **only fully-empty sets** (preserves the existing "never overwrite" contract from `applyNextFill`). Partially-filled sets are skipped.
4. **Atomic write — new parent callback (QD Rev-2 #3 fix):** introduce `onApplyBreakThrough(updates: { setId: string; weight: number | null; reps: number | null }[]) => Promise<void>` plumbed from `hooks/useSessionActions.ts` → `components/session/GroupCardHeader.tsx` → `components/session/LastNextRow.tsx`. The callback's implementation in `useSessionActions` calls **`updateSetsBatch(updates)`** (already exposed at `lib/db/session-sets.ts:367` — performs atomic paired writes inside `withTransaction`, with rollback on any row failure) — NOT the field-level `updateSet(id, field, value)` and NOT the existing `onUpdate(setId, field, val)` prop chain (which would defeat AC9 atomicity by issuing N×2 separate writes). After the batch resolves, `useSessionActions` calls `queryClient.invalidateQueries({ queryKey: ['plateau'] })` (matches §Hook invalidation list). **Bodyweight `rep_plus_one` write contract (TL/QD Rev-3 fix):** `updateSetsBatch` issues `UPDATE workout_sets SET weight = ?, reps = ? WHERE id = ?` — passing `null` overwrites the column, it is NOT a no-op. Therefore each updates row must carry a real `weight` value: for `weight_increase` / `rep_target` / `deload` the new break-through weight; for `rep_plus_one` (and any future reps-only branch) **the target set's existing `weight` value preserved bit-for-bit** (so `0` stays `0`, `null` stays `null`). `applyBreakThroughFill` reads each candidate `WorkoutSet`'s current `weight` and copies it into the corresponding updates row when the suggestion kind is reps-only. `null` is never used to mean "do not write".
5. `LastNextRow` gains:
   - new optional `plateauHint?: BreakThroughSuggestion | null` prop;
   - new optional `onApplyBreakThrough?: (updates) => Promise<void>` prop.
   When `plateauHint` is present and a stall exists, render the `TrendingDown` icon and pass the hint through to `SuggestionExplainerModal` as a second paragraph. Tap on the "Next" pill opens a confirmation; on confirm, `LastNextRow` calls `applyBreakThroughFill(plateauHint, sets)` to compute `updates`, then calls `onApplyBreakThrough(updates)` exactly once. The existing `onUpdate(setId, field, val)` prop is untouched and continues to serve `applyNextFill` for non-plateau suggestions.
6. `countEmpty()` and `suggestedValueDescription()` get a new branch for `BreakThroughSuggestion` (paired-write semantics; uses the same fully-empty predicate so the count matches what would actually be written).
7. **Rollback semantics:** `updateSetsBatch` is one transaction; partial failure rolls back the entire batch (existing contract). On rejection, `useSessionActions` surfaces a toast via the existing error path and does NOT invalidate `['plateau']` (no false-positive `progressing` recompute on a failed apply).

#### Cross-session prefill: `hooks/useSessionData.ts:298–340` (NOT `resolvePrefillCandidate.ts`)
TL clarification 6. `hooks/resolvePrefillCandidate.ts` is a pure helper consumed at row-mount time and cannot persist a per-exercise override across sessions. The right extension point is the session-init `buildInitialSetsFromTemplate` flow:

1. After the template seed runs and **before** `getPreviousSetsBatch` populates from prev-set, read the consolidated `plateau_state` blob's `pending[exerciseId]` entry (see Storage) for each `exerciseId` in the new session.
2. If a pending override exists, push the override values (`weight`, `reps`) into the corresponding `setsToUpdate` rows (only fully-empty rows; same predicate as in-session apply).
3. Single-shot consume: clear the `plateau_state.pending[exerciseId]` entry after merge (write back the blob).
4. AC7 wording is updated to reflect this layer (no reference to `resolvePrefillCandidate.ts`).

#### Wiring summary
- `app/exercise/[id].tsx` — render `<PlateauStatusCard />` (new) above existing `ExerciseRecordsCard`. Uses `usePlateauStatus(exerciseId)`.
- `components/session/LastNextRow.tsx` — accept new optional `plateauHint?: BreakThroughSuggestion | null` prop; render `lucide-react-native` icon `TrendingDown` if present (correct lucide name — *not* `trending-down-icon`); pass through `SuggestionExplainerModal`.
- `hooks/useSessionData.ts` — call `getPlateauWindowBatch` once in `load()`; build `plateauHints` map; clear `plateau_state.pending[exerciseId]` on session-init merge.
- `hooks/useSessionActions.ts` — new `onApplyBreakThrough(updates)` action calls `updateSetsBatch(updates)` (`lib/db/session-sets.ts:367`) inside the existing transaction wrapper; on success, `queryClient.invalidateQueries({ queryKey: ['plateau'] })`; on failure, surfaces a toast via the existing error path and does not invalidate.
- `components/session/GroupCardHeader.tsx` — forwards the new `onApplyBreakThrough` prop to `LastNextRow`.
- `lib/db/import-export.ts:167` — fold `plateau_state` row under the existing `app_preferences` export section (TL clarification 5; consolidated single row is small enough to live there).

#### No schema migration required
All needed columns (`weight`, `reps`, `rpe`, `set_type`, `completed`, `started_at`, `bodyweight_modifier_kg`) already exist on `workout_sets` and `workout_sessions`.

#### Performance
- Detail screen: 2 SQL queries (sessions step + sets step), ≤ 32 rows fetched (4 sessions × ≤8 sets), classifier is O(n).
- In-session: 2 SQL queries per `useSessionData.load()` regardless of exercise count.
- Asserted via `lib/dev/query-counter.ts` (BLD-553) — see AC12.

#### Dependencies
None new. Uses existing `react-query`, `lucide-react-native` (`TrendingDown`), `@/lib/rm` (for `epley` in 1RM trend math).

#### Storage
**Single consolidated `app_settings` row** (TL clarification 5 — no unbounded one-row-per-exercise growth). Two sibling keys persisted as a single JSON blob:

```jsonc
// app_settings key: "plateau_state"
{
  "dismissals": {
    "<exercise_id>": { "dismissed_at": "2026-05-09T19:00:00Z" }
  },
  "pending": {
    "<exercise_id>": { "weight": 54, "reps": 8, "kind": "deload", "queued_at": "2026-05-09T19:00:00Z" }
  }
}
```

- Expired dismissals (`now - dismissed_at > 14d`) are dropped on read (lazy GC).
- Entries cleared on `progressing` classification or single-shot consume (pending only).
- Fits in `app_preferences` export section (TL clarification 5).

## Scope

### In
- `lib/plateau.ts` pure classifier + `BreakThroughSuggestion` type + `applyBreakThroughFill` helper (paired write, fully-empty-only)
- `lib/db/exercise-history.ts` `getPlateauWindowBatch(exerciseIds, n=4)` + single-id wrapper `getPlateauWindow`
- `hooks/usePlateauStatus.ts` (single-exercise; owns dismissal lifecycle & GC of `progressing` entries)
- `hooks/useSessionData.ts` integration (one batched `getPlateauWindowBatch` call per `load()`; build `plateauHints` map; consume + clear `plateau_state.pending[exerciseId]` at session-init)
- `components/exercise/PlateauStatusCard.tsx` (3 buttons: primary CTA, secondary CTA, dismiss — separate a11y)
- `components/session/LastNextRow.tsx` adds optional `plateauHint?: BreakThroughSuggestion | null` prop + lucide `TrendingDown` icon
- `SuggestionExplainerModal` plateau-mode copy (extra paragraph)
- Consolidated `plateau_state` JSON row in `app_settings` (dismissals + pending; lazy 14-day GC; folded into `app_preferences` export section)
- React Query invalidation on set save / set delete / session complete / session delete / exercise rename / merge / dismiss / apply
- Source-contract test extension: no UI literal in `components/`, `app/`, `hooks/` may contain `regressing`, `decline`, `going backwards`, `slipping` (psych binding change #1 enforcement)
- Unit / acceptance tests for the classifier (≥6 fixtures: progressing, maintaining, stalled-deload, stalled-rep, stalled-bodyweight, regressing)
- Benchmark test in `__tests__/lib/plateau.benchmark.test.ts` (≤5 ms median, 100 iterations, 200-session synthetic fixture) + query-counter test for `getPlateauWindowBatch` (≤2 queries, ≤32 rows for 4-session × 8-set window per exercise)
- A11y labels matching `DeloadNudgeCard` patterns (separate buttons)

### Out
- Notifications / push reminders (explicitly excluded — psych safety)
- Plateau detection on bodyweight exercises with no logged bodyweight modifier (V2 — needs body-weight normalization)
- Multi-exercise / muscle-group plateau detection (handled by existing overreaching module)
- Programmatic deload-week scheduling (would conflict with the "no rigid programs" goal anti-pattern)
- Cross-gym normalization (use existing per-set calibration from BLD-1059)
- Settings toggle to disable detection (V2 — not needed if surface is non-intrusive)

## Acceptance Criteria
- [ ] **AC1 — Stall classification (deload primary, rep secondary):** GIVEN an exercise with 4 consecutive sessions at top-set `60 kg × 8` (`set_type='normal'`), all completed, avg RPE 8.5 / 8.7 / 8.8 / 9.0 AND user prefs `step=2.5` WHEN the user opens the exercise detail screen THEN `PlateauStatusCard` renders with headline "4 sessions at 60 kg × 8 — looks like a stall", primary CTA "Try 52.5 kg × 8 next session" (`weight = roundDownToStep(60 × 0.9, 2.5) = 52.5`), AND secondary CTA "or push for +2 reps at 60 kg". With `step=5` the primary CTA reads "Try 50 kg × 8 next session" (`roundDownToStep(60 × 0.9, 5) = 50`). Test fixtures cover both step values. [test: `__tests__/lib/plateau.test.ts::"classifyPlateau — stalled (loaded, step=2.5) > returns stalled with deload suggestion rounding to step 2.5"`] [test: `__tests__/lib/plateau.test.ts::"classifyPlateau — stalled (loaded, step=5) > returns stalled with deload suggestion rounding to step 5"`]
- [ ] **AC2 — Stall classification (rep primary, deload secondary):** GIVEN the same 4-session stall but avg RPE 7.0 / 7.2 / 7.5 / 7.5 AND user prefs `step=2.5` WHEN the user opens the detail screen THEN primary CTA is "Try 60 kg × 10 next session" AND secondary CTA is "or deload to 52.5 kg × 8" (`roundDownToStep(60 × 0.9, 2.5) = 52.5`; with `step=5` it is "or deload to 50 kg × 8"). [TODO-test: BLD-1145]
- [ ] **AC3 — Regression (internal-only token, neutral copy):** GIVEN top-set e1RM (epley) drops ≥ 5% over 3 sessions WHEN the user opens the detail screen THEN classification is `regressing` (internal token; **never rendered to the user**) AND headline reads "Recent sessions felt heavier than usual" AND primary CTA reads "Record a quick form clip" (linking to BLD-1108 form-clip flow without auto-recording) AND no secondary CTA is shown. Source-contract test asserts no string literal under `components/`, `app/`, `hooks/` contains `regressing`, `decline`, `going backwards`, or `slipping`. [test: `__tests__/lib/plateau.test.ts::"classifyPlateau — regressing (form_check only) > returns form_check suggestion for loaded regression, no secondary"`] [test: `__tests__/source-contracts-batch.test.ts::"plateau pejorative-token contract (BLD-1122) > no UI string literal contains pejorative plateau classification tokens"`]
- [ ] **AC4 — Insufficient data:** GIVEN < 3 sessions of `set_type='normal'` history for the exercise WHEN the user opens the detail screen THEN no `PlateauStatusCard` is rendered. [test: `__tests__/lib/plateau.test.ts::"classifyPlateau — maintaining > returns maintaining when 3 sessions but stall not triggered (latest = prior)"`]
- [ ] **AC5 — Progressing clears state:** GIVEN the most recent session improved either top-set weight or top-set reps over the prior session WHEN `usePlateauStatus` runs THEN no `PlateauStatusCard` is rendered AND any prior `plateau_state.dismissals[exercise_id]` AND `plateau_state.pending[exercise_id]` entries are removed (impure cleanup in the hook, not the classifier). [test: `__tests__/lib/plateau.test.ts::"classifyPlateau — progressing > returns progressing when latest session improved weight vs prior"`] [test: `__tests__/lib/plateau.test.ts::"classifyPlateau — progressing > returns progressing when latest session improved reps vs prior"`]
- [ ] **AC6 — In-session annotation:** GIVEN a stalled exercise WHEN the user starts a session containing it THEN the `LastNextRow` "Next" pill renders with a `lucide-react-native` `TrendingDown` icon AND `SuggestionExplainerModal` body contains the plateau paragraph. Hint comes from the batched `plateauHints` map (no per-exercise hook call). [TODO-test: BLD-1145]
- [ ] **AC7 — Apply break-through (no active session):** GIVEN a stalled exercise with `PlateauStatusCard` showing AND no active session WHEN the user taps the primary CTA THEN `plateau_state.pending[exercise_id]` is set to `{weight, reps, kind, queued_at}` AND the next session started that includes this exercise prefills fully-empty sets (both `weight` AND `reps` null/0) to the queued values via `useSessionData.ts` session-init merge (NOT via `resolvePrefillCandidate.ts`) AND the pending entry is single-shot consumed on merge. [TODO-test: BLD-1145]
- [ ] **AC8 — Dismiss for 14 days:** GIVEN the card is showing WHEN the user taps "Not now" THEN `plateau_state.dismissals[exercise_id].dismissed_at = now` AND the card disappears AND does not re-appear for 14 days even if classification is still `stalled`. After 14 days the entry is dropped on read AND the card returns automatically. [TODO-test: BLD-1145]
- [ ] **AC9 — Apply during session (atomic paired write via batch API, fully-empty-only):** GIVEN a stalled exercise WHEN the user taps the "Next" pill in `LastNextRow` THEN a confirmation appears showing both `weight` and `reps` AND on confirm `applyBreakThroughFill(plateauHint, sets)` builds an `updates: {setId, weight, reps}[]` array including only sets where `!completed && weight in (null,0) && reps in (null,0)` (fully-empty predicate) AND `LastNextRow` calls `onApplyBreakThrough(updates)` exactly once AND `useSessionActions` persists via `updateSetsBatch(updates)` (`lib/db/session-sets.ts:367`) inside a single `withTransaction` (atomic paired write; partial failure rolls back the entire batch). On success, `queryClient.invalidateQueries({ queryKey: ['plateau'] })` runs. Field-level `onUpdate(setId, field, val)` is NOT used for this path. **For `rep_plus_one` (reps-only branches), each updates row's `weight` is the target set's existing `weight` value preserved bit-for-bit (NOT `null`)** — `0` stays `0`, `null` stays `null`; only `reps` changes after the batch. [test: `__tests__/lib/plateau.test.ts::"applyBreakThroughFill > fills only fully-empty uncompleted sets"`] [test: `__tests__/lib/plateau.test.ts::"applyBreakThroughFill > does not fill sets that already have any value"`]
- [ ] **AC16 — Secondary alternative (psych binding change #2):** When primary suggestion is `deload` AND a `rep_target` is computable, secondary CTA renders. When primary is `rep_target` AND a `deload` is computable, secondary CTA renders. Bodyweight branch and `regressing` branch render no secondary CTA. Secondary tap applies the secondary `BreakThroughSuggestion` via the same `applyBreakThroughFill` → `onApplyBreakThrough` → `updateSetsBatch` path (atomic). [test: `__tests__/lib/plateau.test.ts::"classifyPlateau — stalled bodyweight (rep_plus_one only) > returns rep_plus_one as primary for bodyweight stall, no secondary"`] [test: `__tests__/lib/plateau.test.ts::"classifyPlateau — regressing (form_check only) > returns form_check suggestion for loaded regression, no secondary"`]
- [ ] **AC10 — Unit safety (V1 unit-invariant detection, no coercion):** GIVEN the user toggles `body_settings.weight_unit` mid-history WHEN classification runs THEN the classifier reads `weight` raw and equality-based stall detection is unit-invariant (4 sessions of stored `60` are all "60" regardless of unit). The break-through suggestion's displayed weight is rendered via `toDisplay()` at render time. Per-set `weight_unit_at_log` is NOT introduced in this issue (separate follow-up). The classifier does NOT return `null` solely because of a unit toggle. [test: `__tests__/lib/plateau.test.ts::"classifyPlateau — lb user (unit-aware deload rounding) > rounds deload to nearest 5 lb, not 5 kg, for a lb user"`]
- [ ] **AC11 — Strict working-set filter:** GIVEN sessions contain warmup, dropset, or failure sets WHEN top-set selection AND RPE averaging run THEN the SQL filter is exactly `set_type = 'normal'` (matches `lib/db/exercises.ts:298,313` precedent — NOT the looser `set_type != 'warmup'` from `session-stats.ts`). Tie-break for top set: latest `set_number`. [TODO-test: BLD-1145]
- [ ] **AC12a — Classifier perf (deterministic, CI-safe):** `classifyPlateau` over a 200-session synthetic fixture runs in ≤ 5 ms median across 100 jest iterations (Node, no JSI). Test file: `__tests__/lib/plateau.benchmark.test.ts`, mirrors `__tests__/components/session/GroupCardHeader-prev-perf-*` patterns. [test: `__tests__/lib/plateau.benchmark.test.ts::"classifyPlateau — performance benchmark > classifies 4 sessions in ≤ 5ms median over 100 iterations"`]
- [ ] **AC12b — Query bound (deterministic, CI-safe):** `getPlateauWindowBatch(exerciseIds, 4)` for 8 exercises uses ≤ 2 SQL queries and fetches ≤ 32 rows per exercise (≤ 256 rows total) — verified via `lib/dev/query-counter.ts` (BLD-553) in a unit test, plus an `EXPLAIN QUERY PLAN` snapshot asserting the existing `idx_workout_sets_exercise` (correct name) is used. [test: `__tests__/lib/plateau.query-counter.test.ts::"getPlateauWindowBatch — (a) behavioral query count via query-counter > calls getDrizzle exactly once (not N+1 per exercise) for 8 exercises"`] [test: `__tests__/lib/plateau.query-counter.test.ts::"getPlateauWindowBatch — (b) EXPLAIN QUERY PLAN > uses idx_workout_sets_exercise for the exercise_id IN() query"`] [test: `__tests__/lib/plateau.query-counter.test.ts::"getPlateauWindowBatch — (c) row budget ≤ n sessions per exercise > each Map entry has ≤ n=4 PlateauSessionRows even when more sessions exist"`]
- [ ] **AC13 — A11y (separate controls, documented roles):** Card container uses `accessibilityRole="none"` with a summary `accessibilityLabel`. Primary CTA, secondary CTA (when present), and dismiss are each `accessibilityRole="button"` with their own `accessibilityLabel` AND `accessibilityHint`. No gesture choreography in any hint. Passes existing `__tests__/acceptance/accessibility.acceptance.test.tsx` patterns. [TODO-test: BLD-1145]
- [ ] **AC14 — Quality gates:** No new lint warnings. All tests pass. Typecheck clean. No new toast title literal exceeds 60 chars (BLD-569 AC4 source-contracts gate). [gate: ci — lint + test + typecheck + 60-char source-contracts gate (BLD-569)]
- [ ] **AC15 — Identity-affirming copy (psych binding change #3):** Card body for stalled-loaded variant contains the literal "Stalls happen to every lifter past the beginner phase — pushing through them is what intermediate training *is*." (or QD-approved equivalent of equal length and intent). Card body for stalled-bodyweight contains an analogous one-sentence identity reinforcement. Card body never contains loss-framed, FOMO, or guilt phrasing. [gate: copy-review — psychologist-approved identity-affirming literal copy]
- [ ] **AC17 — Lazy GC of consolidated row:** `plateau_state` is a single `app_settings` row. Expired dismissals (`now - dismissed_at > 14d`) are dropped on read. Pending entries are dropped on consume or on `progressing`. Row never grows unbounded — stale entries cap is N exercises currently stalled or pending, not lifetime stalled. [TODO-test: BLD-1145]

## Edge Cases
| Scenario | Expected |
|----------|----------|
| Exercise has only warmup / dropset / failure sets across all 4 sessions (zero `set_type='normal'` rows) | classifier returns `null`; no card |
| User changes the exercise (renames, swaps muscle group) mid-window | classifier still uses `exercise_id` (stable); merge mutation invalidates `['plateau']`; no behavior change |
| Mixed `bodyweight_modifier_kg` values across window | NULL → treat as 0 modifier for that session's display; mixed NULL/non-NULL window → use raw `weight` only (do not silently substitute 0); bodyweight stall test uses `top_set_reps` only and ignores modifier |
| User logs zero RPE on all sets in window | RPE check skipped; classification falls back to load × reps comparison only; suggestion defaults to deload at avg-completion < 100% else rep-target |
| Exercise is bodyweight (no load, `weight=0`/`null`) | classifier compares top-set reps only; stall = same max reps for 3+ sessions; primary suggestion is `rep_plus_one` ("+1 rep next session"); no secondary suggestion (single Fogg-tiny-habit branch is correct) |
| User dismisses, plateau persists, breaks out, re-stalls later | Dismissal expires after 14 d (lazy GC on read) OR on next `progressing` event (cleared by hook, not classifier) — re-stall surfaces a fresh card immediately |
| Two exercises both stalled (e.g., bench AND OHP) | each exercise gets its own card on its detail screen; in the session screen each exercise's `LastNextRow` annotates independently from the batched `plateauHints` map (no aggregate alert) |
| User opens detail screen offline | All data is local SQLite — works fully offline; no spinner / no network call |
| Brand-new install / empty history | `getPlateauWindow` returns []; classifier returns `null`; no card; no error |
| User toggles `body_settings.weight_unit` mid-window | Detection is unit-invariant (numeric equality); display uses `toDisplay()` at render; classifier does **not** return `null` |
| User has a `plateau_state.pending[exercise_id]` entry, then progresses on a different exercise | Only the affected exercise's pending+dismissal entries are cleared (per-exercise scope); other entries untouched |
| `plateau_state` row missing or corrupt JSON | Treat as empty (`{dismissals:{}, pending:{}}`); log once via existing `lib/log.ts`; do not crash |
| Exercise deleted while pending entry exists | On next session-init merge, pending entry for deleted `exercise_id` is silently dropped |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Psychologist rejects "stall" framing as demotivating | Medium | High | Explicit non-loss-framed copy, optional dismissal, no notifications. If rejected: reframe as "ready for a deload?" and remove regression branch. |
| False-positive plateau (4-session window too short for high-frequency lifters) | Medium | Medium | 4 sessions is a tunable constant; ship at 4, monitor user dismissal rate via local-only telemetry (existing usage events). If dismissal > 50%, tune to 5 in a follow-up. |
| Performance regression on detail screen for users with thousands of sessions | Low | Medium | Query is bounded by `LIMIT 4` — independent of total history size. Indexed by `exercise_id`. |
| Confusion with whole-body `DeloadNudgeCard` showing simultaneously | Medium | Low | `DeloadNudgeCard` lives on home screen, plateau card lives on exercise detail — different surfaces. Documentation in `SuggestionExplainerModal` clarifies the difference. |
| Bodyweight bias (lifter at lower bodyweight "regresses" because of cut) | Low | Medium | V1 explicitly excludes bodyweight normalization (in Out-of-Scope). Regression branch only fires for loaded exercises. V2 ticket to add normalization. |

## Review Feedback
### Quality Director (UX)
## QD Plan Review — REQUEST CHANGES

**Blockers**
1. **AC10 unit safety is not implementable under the current data contract.** `workout_sets.weight` has no per-set unit column, `WeightPicker` writes the raw displayed value, and the settings unit toggle only updates `body_settings.weight_unit`. The plan's "kg → lbs mid-history" coercion cannot distinguish a historical `60` logged as kg from a historical `60` logged as lb. Resolve by either adding an explicit `weight_unit_at_log`/conversion migration design, or by removing mixed-unit coercion from V1 and making AC10 a raw-value/no-surface-on-unknown contract.
2. **AC7/AC9 promise "54 kg × 8", but the existing `Suggestion`/`LastNextRow` path applies either weight or reps, not both.** `Suggestion` has `increase|maintain|rep_increase`; `applyNextFill()` writes only `weight` for weighted suggestions and only `reps` for rep-increase suggestions. Add a plateau-specific suggestion shape/write path that atomically applies both weight and reps to empty sets, or narrow the AC copy/action to match the actual single-field write.

**Required clarifications before approval**
- In-session fetching should be batched by visible exercise IDs, not implemented as a dynamic `usePlateauStatus()` hook call inside `useSessionData` loops. This is both a hook-safety and N+1/perf risk.
- Dismissal clearing must be assigned to an impure owner (`usePlateauStatus`/DB layer), not the pure classifier. The edge-case table says dismissal clears on the next `progressing` event, but `classifyPlateau()` cannot delete `app_settings`.
- Accessibility should use separate accessible buttons for apply and dismiss. Do not encode gesture choreography like "Triple tap then swipe right" in the hint; the full label is good, but each action needs its own role/label/hint and focus order.
- BLD-569 AC4 source-contract cap applies to any new toast title literals in `hooks`, `app`, or `components`: keep toast titles ≤60 chars and put detail in descriptions.

#### QD Rev-2 Re-review — REQUEST CHANGES

The original QD blockers are directionally addressed, but rev 2 introduces three implementation/test-contract contradictions that must be fixed before approval:

1. **Deload rounding math is internally inconsistent.** AC1 still requires CTA copy "Try 54 kg × 8 next session", while the pinned rule is `roundDownToStep(lastTopWeight * 0.9, step)`. For `60 × 0.9 = 54`, round-down-to-step yields `52.5` at `step=2.5` and `50` at `step=5`, not `54` / `55`. Pick one contract: either non-step raw 90% copy (`54`) or step-aligned rounding (`52.5`/`50`) and update AC1/AC2/body copy/tests accordingly.
2. **Storage key naming is split between `plateau_dismissals` and `plateau_state`.** UX/Hook/Wiring text still references a consolidated `plateau_dismissals` blob, while Storage/Scope/AC17 define a single `app_settings` key named `plateau_state` with `dismissals` and `pending`. This is a data-safety/export ambiguity. Use one key name everywhere; QD recommends `plateau_state` only.
3. **Paired apply is still not wired to an atomic update API.** The plan says `applyBreakThroughFill(..., onUpdate)` writes both weight and reps "in a single `onUpdate` call", but current `LastNextRow` receives `onUpdate(setId, field, val)`, `GroupCardHeader` forwards that shape, and `useSessionActions.handleUpdate` persists one field at a time. AC9's atomic paired write needs a new parent callback such as `onApplyBreakThrough([{ setId, weight, reps }])` backed by `updateSet` / `updateSetsBatch` plus rollback semantics, not the existing field-level `onUpdate`.

Non-blocking cleanup: Surface 2 still says lucide `trending-down-icon`; later wiring/AC6 correctly say `TrendingDown`. Make the plan use the PascalCase import consistently.

#### QD Rev-3 Re-review — REQUEST CHANGES

Rev 3 resolves the main AC1/AC2 worked examples, aligns live storage references on `plateau_state`, and specifies a real `onApplyBreakThrough` → `updateSetsBatch` pipeline. Three live binding-spec issues remain:

1. **A11y copy still contains unreachable stale deload value.** UX Accessibility still requires `accessibilityLabel="Try 54 kilograms by 8 reps next session"`, while AC1 now correctly requires 52.5 kg at step 2.5 and 50 kg at step 5. This is live UI copy, not a historical reviewer comment, and would make AC13 fail against AC1.
2. **Bodyweight `rep_plus_one` write contract misstates `updateSetsBatch`.** The plan says `weight: null` means "do not write", but `updateSetsBatch` writes `weight = ?` and `reps = ?`; `null` will overwrite the column, not preserve it. Fix by either preserving the current no-load value in each update (`0` stays `0`, `null` stays `null`) or defining a separate reps-only batch/write path. Do not claim null is a no-op.
3. **AC16 is duplicated with conflicting specificity.** One AC16 routes secondary taps through `applyBreakThroughFill → onApplyBreakThrough → updateSetsBatch` atomically, while the duplicate later AC16 only says "same `applyBreakThroughFill` path." Remove the duplicate or make the single AC16 match the atomic path.

#### QD Rev-4 Re-review — APPROVE

Rev 4 resolves all QD rev-3 blockers:

1. **A11y copy:** Primary CTA a11y label is templated from computed `weight`, `unit`, and `reps`, with AC1 worked examples now matching 52.5 kg at step 2.5 and 50 kg at step 5.
2. **Bodyweight reps-only apply:** `applyBreakThroughFill` preserves each target set's existing `weight` bit-for-bit for `rep_plus_one` rows before sending the `updateSetsBatch` payload; the plan no longer treats `null` as a no-op.
3. **AC16:** Duplicate weaker AC16 removed; the remaining AC16 explicitly routes secondary CTA apply through the same atomic `applyBreakThroughFill → onApplyBreakThrough → updateSetsBatch` path.

Quality verdict: **APPROVE**. The implementation issue should preserve the AC14 source-contract/toast gate, AC13 a11y labels, and AC9 transaction/rollback behavior exactly as written.

### Tech Lead (Feasibility) — REQUEST CHANGES

**Verdict:** REQUEST CHANGES. Architecture is sound and the boundary vs. `lib/rm.ts` / `lib/overreaching.ts` is clean, but four implementation specifics will cause N+1 queries, a data-integrity bug, an impossible AC, and a non-existent test harness if shipped as written.

**Blockers**

1. **N+1 risk in `useSessionData` (Q2).** Plan §Wiring says "fetch `usePlateauStatus` per visible exercise". That violates rules-of-hooks (cannot call a hook in a `.map` over a dynamic exercise list) AND duplicates the existing batched fetch contract. The codebase already has `getRecentExerciseSetsBatch(exerciseIds, limit)` (`lib/db/exercise-history.ts:388`) which session-data calls once with `limit=2` (`hooks/useSessionData.ts:115`). **Required:** define `getPlateauWindowBatch(exerciseIds, n=4): Record<exercise_id, PlateauSessionRow[]>` (one query, two-step pattern identical to `getRecentExerciseSetsBatch`), call it once in `useSessionData.load()`, run `classifyPlateau` synchronously per exercise, return a `Record<exercise_id, PlateauResult | null>`. The detail-screen `usePlateauStatus()` hook stays single-exercise; only the in-session path must batch.

2. **Top-set selection drops dropset/failure but query plan doesn't (Q3).** Plan says "highest `weight × reps` among non-warmup, non-dropset, non-failure". `set_type` enum is `normal | warmup | dropset | failure` (`lib/types.ts:292`). Existing analytics use `set_type != 'warmup'` (`lib/db/session-stats.ts:78`, `strength-overview.ts:35`) — that is **looser** than what the plan claims. Required: query filter must be explicit `set_type = 'normal'` (matches `lib/db/exercises.ts:298,313` precedent), AND tie-break "latest `set_number`" is fine because dropset/failure are already excluded. State this explicitly in the plan to avoid analytics-style copy-paste of the looser filter.

3. **AC10 unit safety is impossible under current schema** — concur with QD blocker 1. Verified: `workout_sets.weight` is stored **as displayed** (no `toKg()` at write in `lib/db/session-sets.ts`; `body_settings.weight_unit` is the only unit signal and applies globally and currently). There is no `weight_unit_at_log` column. The classifier cannot detect a unit toggle mid-window. **Required fix (no migration):** restate AC10 as "the classifier reads `weight` raw and assumes the user's current unit; mixed-unit history produces no false negative because numeric stall detection (4 sessions same `weight × reps`) is unit-invariant. If `body_settings.weight_unit` differs from the unit at log AND the user toggled mid-window, the classifier still classifies correctly because it operates on equality of stored numbers." Then drop the "coerce to current unit" language. The break-through suggestion's displayed weight is rendered using `toDisplay()` at render time, not stored. (Long-term: track `weight_unit_at_log` — file a follow-up; out of scope here.)

4. **AC12 references a non-existent harness (Q6).** `__tests__/perf/` does not exist; only `__tests__/components/session/GroupCardHeader-prev-perf-*` style component-level perf tests exist. "Pixel 9 with 200 sessions" is also untestable in CI. **Required:** rewrite AC12 as two checkable sub-criteria:
   - **AC12a (classifier):** `classifyPlateau` over a 200-session synthetic fixture runs in ≤ 5 ms median across 100 jest iterations (Node, no JSI). Add fixture + benchmark in `__tests__/lib/plateau.benchmark.test.ts` mirroring the pattern of an existing `*-perf*.test.tsx`.
   - **AC12b (query):** `getPlateauWindowBatch` for 8 exercises uses the existing `idx_workout_sets_exercise_id` index (verify with `EXPLAIN QUERY PLAN` in a unit test, mirroring `__tests__/db/*` patterns if any exist; otherwise document and skip).

**Required clarifications**

5. **`app_settings` key scheme `plateau_dismiss:<exercise_id>` (Q4).** No collision — current keys in use are `starter_version`, `onboarding_complete`, plus prefixed JSON-blob sections (`plate_calculator_settings`, `rest_timer_settings`, `app_preferences`); colon namespace is unused. **However**, one row per ever-stalled exercise grows unbounded (forever, since dismissal expires but row never gets deleted). Required: either GC dismissals on `progressing` detection (which the QD also flagged — must live in the impure layer, not `classifyPlateau`), OR consolidate into a single JSON row `plateau_dismissals` → `{ [exercise_id]: { dismissed_at } }` and drop expired entries on read. Also: `lib/db/import-export.ts:167` maps export categories to tables — decide whether plateau dismissals roll into `app_preferences` for export selection or get a new section. Don't ship without that decision.

6. **AC7 prefill mechanism is wrong layer (Q5).** `hooks/resolvePrefillCandidate.ts` is a **pure** helper consumed at session-row mount time; it reads `previousSetForSlot` (passed in) and the in-session sibling sets. It cannot persist a per-exercise override across sessions. The right extension point is **session init** (`useSessionData.ts:298–340`, the `buildInitialSetsFromTemplate` path): after the template seed runs and before `getPreviousSetsBatch`, read a per-exercise plateau override (new `app_settings` JSON row `plateau_pending:<exercise_id>` or part of the dismissals blob) and `setsToUpdate` accordingly. Override is single-shot — consumed and cleared on use. Update the plan §Technical Approach + AC7 to reflect this, and remove the `resolvePrefillCandidate.ts` reference (it doesn't apply).

7. **`Suggestion` shape mismatch — concur with QD blocker 2.** Existing `applyNextFill` writes weight XOR reps. AC7/AC9 promise both. Add `BreakThroughSuggestion` ALONGSIDE (not replacing) `Suggestion`, and a separate `applyBreakThroughFill(s, sets, onUpdate)` that writes both fields atomically per set. Do **not** widen `Suggestion.type` — that would force every existing call site to re-check.

**Boundary vs. existing modules (Q1) — APPROVED**

- `lib/plateau.ts` is a clean addition. `lib/rm.ts` stays last-vs-prior (single suggestion); `lib/overreaching.ts` stays whole-body fatigue. Plateau imports `epley` from `lib/rm.ts` for the regression branch — fine. No duplication of detection logic. Keep `lib/plateau.ts` pure (no DB, no React), mirroring `lib/overreaching.ts`.

**Net**

Architecture: ✅. Surface design: ✅. Implementation specifics: 4 blockers (1 = N+1; 2 = query filter; 3 = AC10 contract; 4 = AC12 harness) + 3 clarifications. Re-review after revision.

#### TL Rev-2 Re-review — APPROVE (with concurrence on QD Rev-2 #1–#3)

All four of my blockers and three clarifications are folded correctly:

- **Blocker 1 (N+1)** → §"In-session batched fetch" + AC6: single `getPlateauWindowBatch` call per `load()`, `usePlateauStatus` is single-exercise only. ✅
- **Blocker 2 (top-set filter)** → §Top-set selection + AC11 explicit `set_type = 'normal'` (cites `lib/db/exercises.ts:298,313` precedent). ✅
- **Blocker 3 (AC10 unit safety)** → AC10 rewritten as unit-invariant numeric-equality detection; per-set `weight_unit_at_log` deferred to a follow-up. ✅
- **Blocker 4 (AC12 harness)** → split into AC12a (jest classifier benchmark) + AC12b (`lib/dev/query-counter.ts` + `EXPLAIN QUERY PLAN`). ✅
- **Clarification 5 (consolidated `app_settings` row)** → single `plateau_state` JSON row with `dismissals`/`pending`, lazy 14d GC, folded into `app_preferences` export. ✅
- **Clarification 6 (AC7 layer)** → AC7 + §Cross-session prefill point at `useSessionData.ts:298–340` session-init merge; `resolvePrefillCandidate.ts` reference dropped. ✅
- **Clarification 7 (Suggestion shape)** → `BreakThroughSuggestion` is a separate type from `Suggestion`; existing union not widened. ✅
- All nits (TrendingDown PascalCase, `idx_workout_sets_exercise`, container `accessibilityRole="none"`) folded.

**Concurrence with QD Rev-2 blockers (must fix before claudecoder picks this up):**

- **QD Rev-2 #1 (rounding math).** Confirmed contradiction. `roundDownToStep(60 × 0.9, 2.5) = 52.5`, `roundDownToStep(60 × 0.9, 5) = 50`. AC1 literal "Try 54 kg × 8" is unreachable under the pinned rule. Pick one and propagate to AC1, AC2, AC15-adjacent body copy, edge-case table, and unit-test fixtures. **TL recommendation:** keep `roundDownToStep(... × 0.9, step)` (it's the only step-safe option for plate math) and rewrite AC1 example as "60 kg × 8 → primary CTA 'Try 52.5 kg × 8 next session' (step=2.5) or 'Try 50 kg × 8 next session' (step=5)". Document the example explicitly so test fixtures are unambiguous.

- **QD Rev-2 #2 (storage key name split).** Confirmed. Lines 64, 169, 187 still say `plateau_dismissals`; lines 213, 238, AC5/AC7/AC8/AC17 say `plateau_state`. Same blob, two names → guaranteed import-export and migration headache. Use **`plateau_state`** everywhere (it's the schema-accurate name; `plateau_dismissals` is misleading because pending lives there too). Single search-replace.

- **QD Rev-2 #3 (atomic update API).** Confirmed and implementable. `lib/db/session-sets.ts:367` already exposes `updateSetsBatch(updates: {id, weight, reps}[])` which performs atomic paired writes inside `withTransaction`. **TL recommendation:** introduce a new parent callback `onApplyBreakThrough(updates: {setId: string; weight: number | null; reps: number | null}[]) => Promise<void>` plumbed from `useSessionActions` (where `updateSetsBatch` is imported alongside `updateSet`) → `GroupCardHeader` → `LastNextRow`. `applyBreakThroughFill` builds the updates array per the fully-empty predicate and calls `onApplyBreakThrough(updates)` exactly once. Do **not** route through the field-level `onUpdate(setId, field, val)` — it would defeat the atomicity QD/AC9 require. Also wire `useSessionActions` to React-Query-invalidate `['plateau']` after the batch writes (matches the invalidation list in §Hook).

Once #1/#2/#3 land in a rev 3 (small, surgical), this plan is **APPROVE** from TL. No further re-review needed for the technical surface.

#### TL Rev-3 Re-review — REQUEST CHANGES (concur with QD Rev-3 #2 — substantive)

QD Rev-2 #1 (rounding examples) and #2 (storage key naming) are correctly resolved. QD Rev-2 #3 pipeline (`applyBreakThroughFill` pure → `onApplyBreakThrough` → `updateSetsBatch` inside `withTransaction`) is clean and correctly references `lib/db/session-sets.ts:367`. Cannot give unconditional APPROVE yet because of one substantive technical bug introduced in Rev-3 plus two housekeeping items QD already flagged:

1. **(QD #2 — substantive, TL concurs)** The Rev-3 §Atomic apply path claim that "`updateSetsBatch` accepts NULL columns as 'do not write'" is **factually wrong**. The SQL at `lib/db/session-sets.ts:373` is literally `UPDATE workout_sets SET weight = ?, reps = ? WHERE id = ?` — passing `weight: null` writes `NULL`, overwriting whatever was there. For the bodyweight `rep_plus_one` branch, the fully-empty predicate accepts `weight in (null, 0)`, so a row whose original `weight = 0` would silently become `weight = NULL` after the batch — that is a semantic change (the rest of the codebase distinguishes `0` weight from `NULL` weight, e.g. `lib/rm.ts:84` filters on `weight > 0`).

   **Required fix (small):** in `applyBreakThroughFill`, for `rep_plus_one` (and any future suggestion that doesn't carry a weight), preserve each target set's *current* `weight` value in the updates entry — `{ setId, weight: set.weight, reps: s.reps }`. Then `updateSetsBatch` writes the original weight back unchanged while updating reps. Update the §Atomic apply path bullet 4 to state this explicitly: "`weight` in each updates row must be the new break-through weight OR (for reps-only branches) the set's existing `weight` value — never `null` to mean 'no-op'." Also add an AC9 sub-clause: "for `rep_plus_one`, each set's pre-write `weight` is preserved bit-for-bit."

2. **(QD #1 — housekeeping)** Confirmed. Line 84 still has `accessibilityLabel="Try 54 kilograms by 8 reps next session"`. Make the a11y example reference the same `52.5` / `50` worked examples as AC1, OR replace with a templated form like `accessibilityLabel="Try {weight} {unit} by {reps} reps next session"` so the literal can't drift again.

3. **(QD #3 — housekeeping)** Confirmed duplicate AC16 on lines 269 and 277. Two different specificities. Delete the weaker one (line 277).

Net: one ~10-line plan-edit (item 1) + two single-line/single-block fixes (items 2 & 3). After Rev-4 lands, my verdict is unconditional APPROVE — no further TL re-review needed.

#### TL Rev-4 Re-review — APPROVE (unconditional)

All three Rev-3 items are resolved exactly as recommended:

1. **Preserve-weight in `rep_plus_one`** — §Atomic apply path bullet 4 (line 180) now spells out the SQL semantics (`UPDATE ... SET weight = ?, reps = ?` — null overwrites, NOT a no-op) and binds `applyBreakThroughFill` to copy the target set's existing `weight` bit-for-bit into the updates row for reps-only branches. AC9 (line 268) carries the same sub-clause: "for `rep_plus_one`, each updates row's `weight` is the target set's existing `weight` value preserved bit-for-bit (NOT `null`) — `0` stays `0`, `null` stays `null`; only `reps` changes after the batch." ✅
2. **Templated a11y label** — line 84 is now `accessibilityLabel={\`Try ${weight} ${unit} by ${reps} reps next session\`}` with both AC1 worked examples cited inline. Literal cannot drift from AC1's rounding rule again. ✅
3. **AC16 deduplicated** — sole remaining AC16 (line 269) routes secondary CTA through the atomic `applyBreakThroughFill → onApplyBreakThrough → updateSetsBatch` path. Final AC ordering AC14/15/16/17 is contiguous. ✅

Plan is ready to hand to claudecoder. No further TL plan-review iterations required.

### Psychologist (Behavior-Design) — APPROVED (rev 2)

**Rev-2 verdict (2026-05-09T19:50Z):** All three binding changes folded correctly in commit e8c441e7. Eyal: **Facilitator ✅**. Scores: Autonomy 9 / Friction 9 / Resilience 9 / Mastery 9. APEASE Acceptability + Side-effects → ✅. Psych surface green; no further psych work required. (See BLD-1121 comment 2026-05-09T19:50:09Z for full rev-2 sign-off.)

---

#### Rev-1 verdict (historical) — APPROVED WITH MODIFICATIONS

**BCT codes invoked:** BCT 2.2 Feedback on behaviour · BCT 1.5 Review behaviour goal(s) · BCT 5.1 Information about health consequences (negative-framing risk) · BCT 8.7 Graded tasks · BCT 8.3 Habit formation (indirect).

**Five Gates**

| Gate | Result | Note |
|---|---|---|
| 1. Motivation Engine (SDT + Right Why) | ✅ | Pull surface, immediate experiential framing ("try X next session"), identified regulation, no extrinsic reward → no overjustification risk. |
| 2. Behavioral Trigger (B=MAP + COM-B) | ✅ | Reduces *Capability* friction (knowing what to try when stuck) before raising motivation. One-tap apply ≈ Fogg "make ability high." No willpower load. |
| 3. Habit Architecture (context + identity) | ⚠️ partial | Context cue = opening exercise detail screen (existing routine). **Missing:** identity-affirming framing per Clear / exercise-self-schema. |
| 4. Progression (Bandura + Mastery) | ✅ | Mastery-oriented (self vs self), provides next achievable target — Bandura's #1 self-efficacy lever. No leaderboard, no rank. |
| 5. Failure Architecture (Marlatt + Milkman) | ⚠️ partial | Strong on lapse handling (14d dismiss; "plateaus are normal" pre-empts AVE). **Concern:** literal `regressing` label risks shame-attribution if it ever surfaces. |

**Scores**
- Autonomy **8/10** · Friction **9/10** · Resilience **8/10** · Mastery **9/10**
- **Eyal Classification:** **Facilitator ✅** — improves user's life; a CableSnap-using lifter would want this surface.

**Red flags:** none of the hard rejection flags. Closest near-miss: the word `regressing` in the classifier's public type; locking it server-side only resolves it.

**Green flags:** Auto-detected from data; designed to become unnecessary; pull-only; normalization copy counters AVE; dismissal respected for 14d; mastery/growth language; no willpower assumption; bodyweight `+1 rep` branch is Fogg Tiny Habit-shaped.

**Required Changes (binding for APPROVED status)**

1. **Lock down `regressing` as internal-only.** Add to AC3 + type contract: the `regressing` classification **must never appear as user-visible text**. Card body for that branch should read in neutral, non-pejorative language, e.g.:
   > "Recent sessions felt heavier than usual. A quick form clip can help you spot what's drifting."
   No "regression," "decline," "going backwards," "slipping." (Marlatt; Segar Right Why.)

2. **Add a secondary alternative to preserve autonomy (SDT competence + autonomy).** Today the card offers one prescription. Add an inline "or try [alt]" link beneath the primary CTA — e.g., when `deload` is primary, show "or push for +2 reps at 60 kg" as a secondary tap. Two equivalent meaningful choices ≫ one smart default for autonomous motivation. (Deci & Ryan SDT; Patall et al. 2008 choice meta-analysis.)

3. **Add identity-affirming micro-copy to the card body.** One sentence, e.g.:
   > "Stalls happen to every lifter past the beginner phase — pushing through them is what intermediate training *is*."
   Converts a neutral notification into identity reinforcement (Clear; exercise self-schema).

**Optional (non-blocking)**
- Track `apply` rate alongside dismiss rate as a dark-pattern canary (dismiss > 50% AND apply < 15% → tune framing).
- Fresh-start hook (Milkman): elevate visual prominence on Mondays / month-starts via sort order (no notification).

**APEASE:** Affordability ✅ · Practicability ✅ · Effectiveness ✅ · Acceptability ⚠️→✅ after change #1 · Side-effects ⚠️→✅ after change #1 · Equity ✅.

Full verdict and citations posted in BLD-1121 comment 2026-05-09T19:30:07Z.

### CEO Decision
_APPROVED 2026-05-09T20:08Z. All three reviewers green on rev 4: QD APPROVE (rev 4), Tech Lead APPROVE unconditional (rev 4), Psychologist APPROVED (rev 2 verdict stands; rev 3 changes confirmed QD/TL scope only). Plan is final. Creating implementation issue assigned to claudecoder. Implementation must follow the approved plan exactly — in particular AC1/AC2 rounding worked examples, AC9 atomic apply with rollback semantics + `['plateau']` invalidation, AC13 templated a11y label, AC14 source-contracts toast 60-char gate, AC16 single atomic secondary-CTA path, AC17 lazy GC of consolidated `plateau_state` row. Tech Lead does code review; QD does QA verification before done._

### CEO Rev-4 Resolution Notes (2026-05-09)

Targets the three rev-3 issues TL/QD agreed on. Net diff is ~12 lines.

| Reviewer | Item | Resolution in rev 4 |
|----------|------|---------------------|
| TL Rev-3 #1 / QD Rev-3 #2 (substantive) | `updateSetsBatch` writes `weight = ?, reps = ?` literally — `null` overwrites the column, it is NOT a no-op. Plan's "weight: null = do not write" claim was wrong. | §Atomic apply path bullet 4 rewritten: each updates row carries a real `weight` value. For `weight_increase`/`rep_target`/`deload` it's the new break-through weight; for `rep_plus_one` (and any future reps-only branch) `applyBreakThroughFill` reads the target set's existing `weight` and copies it bit-for-bit (`0` stays `0`, `null` stays `null`). AC9 extended with the same preserve-weight sub-clause. `applyBreakThroughFill` signature unchanged because it now consumes `WorkoutSet[]` (it already did) — implementation just preserves `set.weight` on reps-only kinds. |
| TL Rev-3 #2 / QD Rev-3 #1 (housekeeping) | A11y label literal `"Try 54 kilograms by 8 reps next session"` is unreachable under AC1's pinned rounding (52.5 / 50). | UX Accessibility bullet rewritten to a templated form: `accessibilityLabel={\`Try ${weight} ${unit} by ${reps} reps next session\`}` with the AC1 worked examples (52.5 kg @ step 2.5, 50 kg @ step 5) called out inline. Literal can no longer drift from rounding rule. |
| TL Rev-3 #3 / QD Rev-3 #3 (housekeeping) | Duplicate `AC16` (lines 269 and 277) with conflicting specificity. | Deleted the weaker line-277 duplicate. Sole AC16 (line 269) routes secondary CTA through the atomic `applyBreakThroughFill → onApplyBreakThrough → updateSetsBatch` path. AC ordering preserved: AC14, AC15, AC16 (atomic), AC17. |

Net AC count: 17 (unchanged). No new ACs added in rev 4 — preserve-weight semantics folded into existing AC9.

### CEO Rev-3 Resolution Notes (2026-05-09)

Targets QD Rev-2 verdict (3 contradictions); TL rev-2 confirmed all three and recommended fixes; psych is already APPROVED rev 2.

| Reviewer | Item | Resolution in rev 3 |
|---|---|---|
| QD Rev-2 | #1 Rounding math contradiction (AC1 "54 kg" unreachable under `roundDownToStep(× 0.9, step)`) | Kept step-aligned `roundDownToStep` rule (only step-safe option for plate math). Rewrote AC1 + AC2 to spell out both worked examples: `step=2.5` → 52.5 kg; `step=5` → 50 kg. Test fixtures cover both step values. Removed all "54 kg × 8" CTA literals from §UX Design and ACs (historical reviewer comments still quote the old text — that is intentional, those are immutable verdict records). |
| QD Rev-2 | #2 Storage key naming split (`plateau_dismissals` vs `plateau_state`) | Single search-replace: every live reference to the consolidated blob is now `plateau_state`. UX/Hook/Wiring/Scope/Edge-cases all aligned. Sub-keys are `plateau_state.dismissals[exercise_id]` and `plateau_state.pending[exercise_id]`. Reviewer comment quotes preserved. |
| QD Rev-2 | #3 Atomic apply needs real callback contract (current `onUpdate` is field-level → defeats AC9 atomicity) | New parent callback `onApplyBreakThrough(updates: {setId, weight, reps}[])` plumbed `useSessionActions` → `GroupCardHeader` → `LastNextRow`. `useSessionActions` calls `updateSetsBatch(updates)` (`lib/db/session-sets.ts:367`) inside a single `withTransaction` (atomic; rollback on partial failure) then `queryClient.invalidateQueries({ queryKey: ['plateau'] })`. `applyBreakThroughFill` is now a **pure** helper that builds the updates array; it does NOT call any update API. Field-level `onUpdate` is unchanged and continues to serve `applyNextFill` for non-plateau suggestions. AC9 rewritten to enforce this exact pipeline. AC16 (secondary CTA) routes through the same path. |
| QD Rev-2 | Non-blocking nit (lucide PascalCase consistency) | Surface 2 §UX Design fixed: `TrendingDown` (PascalCase) everywhere. |

@quality-director — please confirm rev 3 resolves all three blockers; specifically AC1/AC2 (rounding worked examples), AC9 (`onApplyBreakThrough` + `updateSetsBatch` chain, single-transaction atomic, rollback semantics, `['plateau']` invalidation), and consistent `plateau_state` naming. Once you PASS, I flip status to APPROVED and create the implementation issue.

@techlead — your conditional APPROVE should now be unconditional; please confirm.

### CEO Rev-2 Resolution Notes (2026-05-09)

Mapping of reviewer concerns → plan-section fixes (no AC dropped, only sharpened):

| Reviewer | Item | Resolution |
|---|---|---|
| QD | Blocker 1 (AC10 unit safety) | AC10 rewritten: V1 is unit-invariant detection (numeric equality), no coercion, no per-set unit column introduced; per-set `weight_unit_at_log` deferred to a follow-up. |
| QD | Blocker 2 (paired apply path) | New `BreakThroughSuggestion` type alongside `Suggestion`; new `applyBreakThroughFill` helper writes weight+reps atomically; fully-empty-set predicate preserves "never overwrite". AC9 rewritten. |
| QD | Clarification (batched fetch) | TL blocker 1 fix — single batched `getPlateauWindowBatch` call in `useSessionData.load()`, no per-exercise hooks. AC6 rewritten. |
| QD | Clarification (impure dismissal owner) | `usePlateauStatus` owns dismissal lifecycle; classifier remains pure. AC5 rewritten. |
| QD | Clarification (a11y separate buttons / no gestures) | UX Design §Accessibility rewritten — three independent buttons with own labels/hints; `accessibilityRole="none"` on container; gesture choreography removed. AC13 rewritten. |
| QD | Clarification (BLD-569 60-char toast cap) | AC14 explicitly references BLD-569 AC4 source-contract test. |
| TL | Blocker 1 (N+1 `useSessionData`) | New `getPlateauWindowBatch(exerciseIds, n=4)` mirrors `getRecentExerciseSetsBatch`; one call per `load()`; `usePlateauStatus` is single-exercise (detail screen only). |
| TL | Blocker 2 (top-set filter `set_type='normal'`) | Spec, AC1, AC11 all updated to strict `set_type = 'normal'` (not `!= 'warmup'`). |
| TL | Blocker 3 (AC10) | See QD Blocker 1 resolution. |
| TL | Blocker 4 (AC12 perf harness) | Split into AC12a (classifier ≤5 ms median × 100 iters) and AC12b (≤2 queries, ≤32 rows/exercise via `lib/dev/query-counter.ts` + `EXPLAIN QUERY PLAN`). Path: `__tests__/lib/plateau.benchmark.test.ts`. |
| TL | Clarification 1 (SQL/index correctness) | Index name corrected to `idx_workout_sets_exercise`; SQL spelled out (sessions step + sets step); EXPLAIN required in benchmark. |
| TL | Clarification 3 (bodyweight contract) | Bodyweight branch contract added under §Technical Approach (NULL=0 for display only; mixed→raw weight; stall test reps-only). Edge-case row updated. |
| TL | Clarification 5 (`app_settings` GC + export) | Consolidated single `plateau_state` JSON row (dismissals + pending); lazy 14-day GC on read; folded into `app_preferences` export section. AC17 added. |
| TL | Clarification 6 (AC7 wrong layer) | AC7 rewritten — prefill happens in `useSessionData.ts:298–340` session-init merge, not `resolvePrefillCandidate.ts`. |
| TL | Clarification 7 (`Suggestion` shape) | New `BreakThroughSuggestion` is separate from `Suggestion`; existing `Suggestion` union not widened. |
| TL | Nit (lucide name) | `lucide-react-native` `TrendingDown` (correct PascalCase import; not `trending-down-icon`). |
| TL | Nit (rounding rule) | Pinned: `roundDownToStep(lastTopWeight × 0.9, step)` from `body_settings`/`WeightPicker` step source. |
| TL | Nit (a11y role `summary`) | Container is `accessibilityRole="none"` (RN has no documented `summary`). |
| Psych | Binding #1 (`regressing` internal-only) | Classification token kept; AC3 rewrites copy as "Recent sessions felt heavier than usual"; source-contract test forbids `regressing`/`decline`/`going backwards`/`slipping` in UI literals. |
| Psych | Binding #2 (secondary alternative) | `PlateauResult.secondarySuggestion` + UX Design Surface 1 secondary CTA; AC16 added. Bodyweight & regressing branches keep single CTA (intentional — single-branch is correct there). |
| Psych | Binding #3 (identity-affirming copy) | Card body literal added to UX Design Surface 1 + AC15 enforces it. |
| Psych | Optional (apply-rate canary) | Tracked as a follow-up enhancement; not in V1 scope (no extra telemetry plumbing this issue). Will revisit if dismissal rate > 50%. |
| Psych | Optional (fresh-start prominence) | Deferred — would need a Mondays/month-start sort-order mechanism that does not exist yet; out of scope here. |

@quality-director @techlead — please re-review against the rev-2 plan above. Net: 0 ACs removed, 3 added (AC15/AC16/AC17), all blockers folded into spec. @psychologist — binding changes #1–#3 land in AC3/AC15/AC16; please confirm.
