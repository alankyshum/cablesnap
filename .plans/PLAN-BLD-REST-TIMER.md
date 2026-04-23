# Feature Plan: Intelligent Rest Timer

**Issue**: BLD-531
**Author**: CEO
**Date**: 2026-04-23
**Status**: DRAFT → IN_REVIEW

## Problem Statement

CableSnap's rest timer currently resolves to a single static duration per exercise (`templateExercises.rest_seconds`, defaulted to 90s; fallback 90s when no template). This is baked in `lib/db/session-sets.ts → getRestSecondsForExercise` and consumed by `hooks/useRestTimer.ts → startRest`.

In real strength training, required rest is wildly non-uniform:

| Context | Typical rest |
|---|---|
| Warmup set | 15–30s |
| Working set (hypertrophy, RPE 7–8) | 60–120s |
| Top / heavy set (compound, RPE 9+) | 180–300s |
| Drop set | 0–15s |
| Isolation / cable (moderate RPE) | 45–75s |
| Bodyweight working set | 45–90s |

**Today:** the user must manually override every other rest. Engineering telemetry already captures the inputs needed to pick the right default (set_type, rpe, exercise category). We're leaving the smart-default value on the table.

**User emotion today:** "The timer is always wrong — either it's over while I'm still panting from a top-set, or it's droning on after a warmup. I end up ignoring it."

**User emotion after:** "I barely look at the timer. It just knows."

This hits goal #3 (smart defaults: auto-fill weight, **suggest rest timers**, pre-select next exercise) and goal #6 (zero-friction set logging) — the two most-cited UX goals.

## User Stories

- As a lifter, I want the rest timer to be short after a warmup set so I don't wait around
- As a lifter, I want a longer rest after a top-set / RPE 9 set so I can actually recover
- As a lifter, I want near-zero rest after a drop-set so the drop stays a drop
- As a lifter, I can still override the timer per set — my tap always wins
- As a power user, I can tune the adaptive rules in Settings without rewriting every template

## Proposed Solution

### Overview

Replace the single-value resolver `getRestSecondsForExercise(sessionId, exerciseId)` with a pure function `resolveRestSeconds({ baseRestSeconds, setType, rpe, category, userProfile })` that returns the adaptive rest. Baseline stays the existing per-template value (backward compatible). Multipliers and overrides are applied deterministically.

**Critical constraint: the formula is pure + deterministic + user-visible + user-tunable.** No ML, no hidden state. Users should be able to predict what the timer will say.

### UX Design

#### Where the timer fires
In `useSessionActions.handleCheck` (set marked complete) → `startRest(exerciseId)`. Today that resolves one number. We extend `startRest` to accept a `SetContext` so it can call the new resolver.

#### Rest banner visual
Existing rest banner stays. Add a **sub-label** under the countdown: "Top-set · RPE 9 · +90s" (bold = why this rest). Tapping the sub-label opens a bottom-sheet with:
- Numeric rest remaining (big)
- Breakdown: `Base 90s × Top-set 1.8 × RPE 9+ 1.3 = 210s`
- "Cut short" / "+30s" / "+60s" pills (existing, keep)
- "Edit adaptive rules…" link → Settings

#### Keyboard flow
Zero new keystrokes required. Set type is already picked (warmup/working/topset/drop/backoff — they exist). RPE is optional (if absent, assume 7.5 midpoint).

#### First-run UX
Show a one-time toast on the first adaptive rest of a brand-new install: "Rest timer now adapts by set type and RPE — tap the timer to see why."

### Technical Approach

#### 1. New pure module `lib/rest.ts`
```ts
export type SetType = "warmup" | "working" | "topset" | "backoff" | "drop";
export type ExerciseCategory = "compound" | "isolation" | "cable" | "bodyweight";

export type RestInputs = {
  baseRestSeconds: number;      // from template (or 90 default)
  setType: SetType;
  rpe: number | null;           // 1-10, null = unknown
  category: ExerciseCategory;
};

export type RestBreakdown = {
  totalSeconds: number;
  baseSeconds: number;
  factors: Array<{ label: string; multiplier: number }>;
};

export function resolveRestSeconds(inputs: RestInputs): RestBreakdown;
```

Multipliers (v1 constants, tunable later):
- Set type: warmup=0.3, working=1.0, topset=1.8, backoff=0.85, drop=0.1
- RPE: null=1.0, <=6=0.8, 7-8=1.0, 8.5-9=1.15, >=9.5=1.3
- Category: compound=1.0, isolation=0.75, cable=0.8, bodyweight=0.85

Rounded up to nearest 5s for display sanity. Hard floor 10s. Hard ceiling 360s.

#### 2. Wire into `useRestTimer.startRest`
Change signature: `startRest(ctx: SetContext)` where `SetContext = { exerciseId, setType, rpe, category }`. Call sites (`useSessionActions.handleCheck`, drop-set handler in `useSetTypeActions`) already have these — they just need to pass them through.

Keep `startRestWithDuration(secs)` as the manual-override path.

#### 3. Category lookup
Add a pure helper `categorize(exercise: { equipment, is_bodyweight, is_compound }): ExerciseCategory`. Exercises already have these fields per `lib/db/schema.ts`. No migration needed.

#### 4. Settings toggle
Add two settings rows under "Workout":
- **Adaptive rest timer** (on/off, default ON). When off → old behavior (baseRestSeconds only).
- **Show rest breakdown** (on/off, default ON) → controls the sub-label.

Persist via existing `getAppSetting` / `setAppSetting`. Key: `rest_adaptive_enabled`, `rest_show_breakdown`.

#### 5. Rest breakdown sheet
New component `components/session/RestBreakdownSheet.tsx`. Reads the last-computed breakdown from a ref in `useRestTimer`. Pure render, no new hooks.

#### 6. No schema changes
All inputs already exist: `workout_sets.rpe`, `workout_sets.set_type`, `templateExercises.rest_seconds`, `exercises.equipment` / `.is_bodyweight` / `.is_compound`. **Zero migrations.**

### Scope

**In Scope (v1):**
- `lib/rest.ts` with pure `resolveRestSeconds` + `categorize`
- Wire `useRestTimer.startRest` to call resolver
- Sub-label in existing rest banner showing "Top-set · RPE 9"
- Tap-to-expand breakdown sheet
- Settings toggle (master on/off + show-breakdown on/off)
- First-run toast
- Jest tests for the pure resolver (matrix of set_type × rpe × category)
- Default constants live in `lib/rest.ts` — one place to tune

**Out of Scope:**
- User-editable multipliers (maybe v2, once we have data on whether defaults are good)
- ML / personalized profiles
- Per-exercise overrides beyond the existing `rest_seconds` base
- Persisting breakdown history
- iOS/Android rich notifications showing the breakdown (v1 keeps existing notification copy)
- Cross-device sync of adaptive settings

### Acceptance Criteria

- [ ] Given a working set at RPE 8 on a compound, When user taps complete, Then timer shows ~90s (base 90 × 1.0 × 1.0 × 1.0 = 90s)
- [ ] Given a top-set at RPE 9.5 on a compound, When user taps complete, Then timer shows ~210s (90 × 1.8 × 1.3 × 1.0, rounded to 5s)
- [ ] Given a warmup set on any exercise, When user taps complete, Then timer is <= 45s
- [ ] Given a drop-set, When user taps complete, Then timer is <= 15s
- [ ] Given an isolation cable exercise at RPE 7, When user taps complete, Then timer shows ~60s (90 × 1.0 × 1.0 × 0.8 × cable 0.8 — pick one; plan resolves to cable=0.8, isolation not applied twice)
- [ ] Given adaptive rest disabled in Settings, When user taps complete, Then timer uses base `rest_seconds` exactly (old behavior)
- [ ] Given breakdown-display disabled, When timer runs, Then no sub-label renders
- [ ] Tapping the sub-label opens the breakdown sheet with base + each multiplier listed
- [ ] Manual "+30s"/"-30s"/"Cut" controls still work (override path unchanged)
- [ ] New tests in `__tests__/lib/rest.test.ts` cover at least 15 input combinations
- [ ] Typecheck passes, existing Jest suite still green, no new lint warnings

### Edge Cases

| Scenario | Expected Behavior |
|---|---|
| RPE is null (not logged) | Treat as 7.5 → multiplier 1.0, sub-label says "RPE –" |
| setType is null / unknown | Treat as "working" → multiplier 1.0 |
| baseRestSeconds is 0 or negative | Clamp to 60s (fallback) |
| resolved result < 10s | Clamp to 10s (avoid sub-10s timers that feel broken) |
| resolved result > 360s | Clamp to 360s (6 min — realistic max) |
| User has adaptive rest OFF | resolver not called; return base directly |
| First set of a session (no prior RPE) | set.rpe is whatever user just entered on that set — still adaptive |
| Bodyweight exercise with weight > 0 (weighted pull-up) | category = bodyweight still applies; OK by plan |
| Cable + compound (e.g. cable row) | category picked in priority order: bodyweight > cable > isolation > compound (deterministic) |
| User taps "complete" before entering RPE | fallback to null-RPE path |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Users hate the new default | Medium | Med | Settings toggle off by default in first nightly, ON by default in release after a week of telemetry |
| Constants are wrong for some user | High | Low | Sub-label + breakdown make it transparent; user can override per set. v2 can expose tuning. |
| Existing tests rely on `getRestSecondsForExercise` returning a literal number | Low | Low | Keep that function; build resolver on top. Call sites migrate one at a time. |
| Category classifier picks wrong bucket for oddly-tagged exercises | Med | Low | Pure function, trivial to unit-test; users see the bucket in the breakdown and can report bugs |
| Performance regression (resolver called on every set) | Very Low | Low | Pure, no I/O, <1ms per call |

## Review Feedback
<!-- Filled in by reviewers -->

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
