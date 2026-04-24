# Feature Plan: Bodyweight Load Modifier

**Issue**: BLD-539
**Author**: CEO
**Date**: 2026-04-24
**Status**: DRAFT

## Problem Statement

Bodyweight exercises (pull-up, chin-up, dip, push-up, inverted row, pistol squat, L-sit, muscle-up) currently track **reps only**. The `workout_sets.weight` column is `null` for these exercises and rep-based PRs are the only progression signal.

Real-world strength athletes progress bodyweight lifts in two dimensions beyond reps:

1. **Added weight** — weighted belt, weighted vest, dumbbell between ankles. "Pull-up + 20kg × 5".
2. **Assistance reduction** — resistance band, assisted-dip/pull-up machine. "Band-assisted pull-up −25kg × 8" → "−15kg × 8" as strength grows.

Today the app hides both. Users cannot:
- Log that today's pull-up set was weighted +10kg
- Log that today's dip was band-assisted at −20kg
- See "my assisted-pull-up is down from −30kg band to −10kg band over 8 weeks" — one of the most motivating progression narratives in fitness.
- Get a correct 1RM estimate or e1RM for weighted calisthenics.

**User emotion today**: "I did a weighted pull-up with +15kg, but the app just says 5 reps. My logbook can't tell the difference between bodyweight and weighted."

**User emotion after**: "I can see my pull-up went from BW×5 → BW+5kg×5 → BW+15kg×5. That's real progress I can feel."

Hits three product goals simultaneously:
- **#3 Smart defaults** — remember last modifier per exercise, pre-fill automatically
- **#4 Cable + bodyweight first-class** — bodyweight progression finally has a weight axis
- **#6 Zero friction set logging** — compact chip, one tap to adjust

## Behavior-Design Classification (MANDATORY)

**Does this feature shape user behavior?**

- [ ] YES
- [x] **NO** — feature is purely a functional load-tracking affordance. It records an already-existing real-world variable (added/assisted weight). No gamification, no streaks, no notifications, no rewards, no motivational framing, no social. PR tracking changes are mechanical (effective-load computation), not reward-design. **Skip psychologist review.**

## User Stories

- As a lifter doing weighted pull-ups, I want to log "+20kg" so that my progression tracks the added load, not just reps.
- As a beginner using a resistance band for pull-ups, I want to log "−25kg band" so I can watch my assistance shrink over time.
- As a weighted-dip athlete, I want my PR dashboard to show "Dip BW+30kg × 5" instead of just "Dip × 5 reps".
- As any bodyweight lifter, I want the app to remember my last modifier per exercise so I don't re-enter it every set.

## Proposed Solution

### Overview

Repurpose the existing nullable `workoutSets.weight` column on bodyweight exercises as a signed **modifier**:

| Value | Meaning | UI display |
|---|---|---|
| `null` | Pure bodyweight, no modifier | "BW × 5" |
| `> 0` | Added weight (belt, vest) | "BW +15 × 5" |
| `< 0` | Assistance (band, machine) | "BW −20 × 5" |

For non-bodyweight exercises (`exercises.equipment !== 'bodyweight'` — i.e., `is_bodyweight = false`), the column semantics are unchanged: it remains the absolute weight lifted.

**No schema change is required.** The `weight` column is already nullable real. The semantic shift applies only to exercises tagged bodyweight.

### UX Design

#### 1. Set row (session screen, `components/session/SetRow.tsx`)

For bodyweight exercises, the current row shows `[reps]` only. Replace with a compact two-field layout:

```
┌──────────────────────────────┐
│  [ BW+15 ]  [ 5 reps ]   ✓   │
└──────────────────────────────┘
```

- The modifier chip shows `BW`, `BW+N`, or `BW−N`. Tap opens a **bottom sheet** (consistent with existing CableSnap pattern — BLD-432 learning: bottom sheets over FlatList inline editors).
- Modifier sheet has: `BW only` button, `+` / `−` toggle, numeric stepper (0.5kg / 1kg / 2.5kg / 5kg taps + keyboard), Clear/Done buttons. Respects user's weight unit (kg/lb).
- Long-press the chip to clear to `BW only`.

#### 2. Smart defaults

- When logging a new set for a bodyweight exercise, pre-fill modifier from the **most recent completed set of the same exercise in the last 90 days**. If none, default to `null` (BW only).
- Warmup sets (set_type=warmup) default to `null` regardless of history.
- Smart default is one query: `SELECT weight FROM workout_sets WHERE exercise_id = ? AND set_type != 'warmup' AND completed = 1 ORDER BY completed_at DESC LIMIT 1`. Index `idx_workout_sets_exercise` already exists.

#### 3. Exercise detail page (`components/session/ExerciseDrawerStats.tsx`, `app/exercise/[id].tsx`)

- **Best set** — currently shows "5 reps" for bodyweight. Change to "BW +20 × 5" when best set had a modifier. Fall back to "BW × N" when pure bodyweight.
- **Last session** — same treatment.
- **Estimated 1RM** — when `is_bodyweight && weight != null && user_bodyweight_kg` is known, compute **effective load** = `user_bodyweight_kg + weight` (weight may be negative). Apply existing Epley formula. When `user_bodyweight_kg` is unknown, hide the e1RM line for bodyweight exercises (do NOT guess — unchanged from today).

#### 4. PR Dashboard (`lib/db/pr-dashboard.ts`)

Today, bodyweight PRs = max-reps PRs. Extend:

- **Weighted bodyweight PR** — for a bodyweight exercise, the max non-null `weight` value (signed) at any rep count ≥ 1 is a PR. Track separately from rep PRs.
- PR delta formatting:
  - First-ever weighted set on a bodyweight exercise → "+BW+Nkg" (new dimension unlocked)
  - Assisted improvement (e.g., −30kg → −15kg) → display as "Assistance reduced by 15kg"
  - Added-weight PR (e.g., +10kg → +15kg) → "+5kg"
- PR celebration (`hooks/usePRCelebration.ts`) triggers on weighted bodyweight PRs using the same existing celebration.

#### 5. CSV export / backup

- Existing CSV export already emits the `weight` column as a number or empty. No format change; the semantic shift is documented inline in the CSV header row for bodyweight exercises. Backup JSON unchanged.

### Scope

**In Scope:**
- SetRow modifier chip + bottom sheet (bodyweight exercises only)
- Smart-default pre-fill from last completed set
- ExerciseDrawerStats "best set" / "last session" displays with modifier
- Effective-load e1RM when bodyweight is known
- PR dashboard: weighted bodyweight PR tracking + delta strings
- PR celebration trigger for weighted bodyweight PRs
- Acceptance tests (Jest) for all data paths
- Zero-migration: semantic shift only; existing null-weight bodyweight rows remain valid "BW only"

**Out of Scope:**
- Separate `modifier_kg` column (explicitly rejected — adds schema complexity for identical expressivity)
- Per-attachment tracking (rope vs bar — separate future feature)
- Template-level modifier plans (e.g., "plan a pull-up session with +10kg") — templates already seed reps; modifier is logged per session
- Change to volume calculations for bodyweight exercises (current behavior: volume = 0 for null-weight sets — unchanged)
- Importing/exporting from external apps that use different conventions

### Technical Approach

**Data layer** (`lib/db/`)
- No schema migration.
- Add `lib/bodyweight.ts` helper module: `formatBodyweightLoad(weightKg, isBodyweight, unit)` → `"BW"`, `"BW+15"`, `"BW−20 band"`, with kg/lb conversion using existing `lib/units.ts`.
- Add `getLastBodyweightModifier(exerciseId)` query in `lib/db/session-sets.ts`.
- Extend `lib/db/pr-dashboard.ts`:
  - `getWeightedBodyweightPRs()` query that only runs for bodyweight exercises and finds signed-weight PRs (both positive and less-negative qualify).
  - `getAllTimeBests()` includes modifier when non-null.
- Extend `lib/db/exercise-history.ts` `LastSession` type with optional `modifier: number | null`.

**UI layer** (`components/session/`, `app/exercise/`)
- `SetRow.tsx`: conditional render modifier chip for `is_bodyweight` exercises. Chip triggers `BodyweightModifierSheet`.
- New component: `components/session/BodyweightModifierSheet.tsx` (bottom sheet, follows existing SetTypeSheet pattern).
- `ExerciseGroupCard.tsx` passes `is_bodyweight` down (already available via `group.is_bodyweight`).
- `ExerciseDrawerStats.tsx`: use `formatBodyweightLoad` for best set / last session display.
- `PRCard`/`PRDashboard` (`app/progress/records.tsx`): show modifier in the PR row.

**Hooks**
- `useSessionActions` `addSet` / `updateSet`: accept optional modifier parameter, default-load it from `getLastBodyweightModifier` when adding a new bodyweight set.
- `usePRCelebration`: add weighted-bodyweight PR branch.

**State & cache**
- React Query invalidation on set write (existing `mutationVersion` pattern, BLD-367 learning).
- No new query keys — extends existing ones.

**Performance**
- One extra SELECT per new bodyweight set (for smart default) — single-row indexed query, negligible.
- PR dashboard gains one extra SELECT per bodyweight exercise batch. Use existing `exercise_id IN (...)` batch query pattern (BLD-363 learning: batch N+1 + add missing indexes).

### Acceptance Criteria

- [ ] Given a bodyweight exercise When I tap the modifier chip Then a bottom sheet opens with BW/+/− toggles and a numeric stepper
- [ ] Given a modifier of +15kg is set on a set When I tap Done Then the set row displays "BW+15" and the value persists to DB
- [ ] Given I logged a pull-up set with +15kg last session When I start a new pull-up session Then the next new set pre-fills +15kg
- [ ] Given I log a weighted pull-up at +20kg for the first time When the set is marked complete Then a weighted bodyweight PR is recorded and PR celebration fires
- [ ] Given my assisted-dip modifier was −30kg and today's set is −20kg When the set completes Then this is recorded as a weighted-bodyweight PR with delta "Assistance reduced by 10kg"
- [ ] Given a non-bodyweight exercise (e.g., barbell squat) When I log sets Then the modifier chip does NOT appear (UI unchanged for weighted exercises)
- [ ] Given I long-press the modifier chip on a set When the gesture completes Then the modifier clears to null (BW only)
- [ ] Given user's bodyweight is set in BodyProfile (e.g., 75kg) When I view a pull-up with weight=+15kg Then e1RM is computed from effective load (90kg × reps)
- [ ] Given user has no bodyweight recorded When I view a bodyweight exercise with a modifier Then e1RM line is hidden (no guessing)
- [ ] Given existing bodyweight sets in DB with weight=null When the app starts Then they render as "BW × N reps" with zero visual regressions
- [ ] All existing Jest tests pass; new tests cover modifier persistence, smart-default query, PR detection, e1RM with effective load
- [ ] CSV export unchanged; JSON backup unchanged

### Edge Cases

| Scenario | Expected Behavior |
|---|---|
| User switches weight unit kg→lb mid-session | Existing set values stored in kg; display converts via `lib/units.ts`. Stepper respects current unit. |
| User enters +0kg | Normalize to `null` (BW only). |
| Negative modifier larger than bodyweight (e.g., −80kg assist on a 75kg user) | Allow (some machines fully deload). Effective load floor = 0. e1RM computes but capped at reps×0 = 0, so e1RM is hidden. |
| Warmup set on a bodyweight exercise | Modifier defaults to null regardless of history; user can still set one manually. |
| Drop-set of bodyweight (e.g., weighted pull-ups → bodyweight continuation) | Normal workflow: child drop-set inherits parent modifier, user can edit. Existing drop-set linking unchanged. |
| User edits set_type to `dropset` after logging | Modifier persists; no special handling needed. |
| Exercise switched mid-session via substitution from weighted→bodyweight or vice versa | Each exercise's modifier is independent; substituted exercise follows its own `is_bodyweight` flag. |
| Template seeds weight=50 on a bodyweight exercise (data corruption) | Defensive: treat as modifier (display "BW+50"). Surface in QA, but do not crash. |
| Existing rep PR on a bodyweight exercise (e.g., BW × 12 from 6 months ago) | Still a valid rep PR. Rep PRs and weighted-bodyweight PRs are tracked as separate dimensions; both may exist. |
| Rapid set creation (tap +Set 3 times fast) | Each new set independently fetches last-modifier via React Query cache; no race. Smart default query is cached per exerciseId. |
| User has bodyweight=0 in profile (sentinel "not set") | e1RM hidden; modifier UI unchanged. |
| Accessibility (screen reader) | Modifier chip has `accessibilityLabel="Load modifier: bodyweight plus 15 kilograms"` (kg/lb); bottom sheet sliders fully keyboard accessible on web |
| Dark mode | Chip uses existing design tokens; no hard-coded colors (BLD-385 learning). |
| Empty state (no bodyweight exercises logged) | No UI change — modifier chip simply doesn't render without a bodyweight exercise. |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Semantic overload of `weight` column causes developer confusion | Med | Med | Add type-safe wrapper `BodyweightLoad` in `lib/bodyweight.ts`; document semantic shift in schema.ts JSDoc; add `lib/bodyweight.test.ts` |
| Existing analytics queries that assume `weight IS NULL = bodyweight-only` may now miscount | Med | Med | Audit all `weight IS NULL` queries before merge: `grep -rn "weight IS NULL\|weight is null" lib/db/`. Affected queries treat non-null weight on bodyweight as absolute — must switch to effective-load semantics (BLD-419 learning: audit all instances when fixing a root-cause pattern). |
| CSV/backup importers from other apps that use "weight + reps" for true absolute load would silently misimport on bodyweight rows | Low | Low | Existing import path already treats weight as-provided; no change needed. Document convention in README. |
| Confusing UX when user sees "BW−20" and doesn't know what negative means | Med | Med | First-run in-sheet helper text: "+ weight = belt/vest added, − weight = band/machine assistance". Not a tutorial; just a small caption in the sheet. |
| PR celebration spam on first session where every weighted set is a "first time" | Med | Low | Rate-limit existing celebration (already once-per-session for same exercise per BLD-400). Extend: weighted-BW PR celebration fires at most once per exercise per session. |
| Misuse for equipment-specific tracking (user expects "rope vs bar" via sign) | Low | Low | Out of scope; future feature. Document in plan. |
| Volume aggregation on bodyweight exercises double-counts when modifier is negative | Low | Med | Volume on bodyweight exercises = 0 today (weight is null). Keep it 0 when weight < 0 (assisted). Volume for weighted bodyweight = effective_load × reps when bodyweight is known. If bodyweight unknown, volume = 0 (conservative). Add test. |

## Review Feedback

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)
_Pending review_

### UX Designer (Visual Review)
_Pending review_

### Psychologist (Behavior-Design Verdict)
N/A — Behavior-Design Classification = NO. No gamification, streaks, notifications, rewards, or motivational framing. Purely functional load tracking.

### CEO Decision
_Pending reviews_
