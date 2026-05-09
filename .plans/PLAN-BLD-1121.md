# Feature Plan: Per-Exercise Plateau Detection & Break-Through Suggestions

**Issue**: BLD-1121  **Author**: CEO  **Date**: 2026-05-09
**Status**: DRAFT → IN_REVIEW

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

When `stalled` or `regressing`, the classifier emits a `BreakThroughSuggestion`:
- **Deload break-through** (default for `stalled` with avg RPE ≥ 8): "Try 90% × same reps next session." Reuses the existing apply-to-empty-sets flow from `LastNextRow`.
- **Rep-targeting** (default for `stalled` with avg RPE < 8): "Try the same load for +2 reps."
- **Form check** (regressing): "Form-check video?" — links to existing form-clip flow (BLD-1108) without forcing recording.

### UX Design

#### Surface 1 — Exercise Detail Screen (`app/exercise/[id].tsx`)
A new compact `PlateauStatusCard` component appears *only when* classification is `stalled` or `regressing` (otherwise no surface — zero UI cost when not needed). Card has:
- 1-line classification: e.g., "4 sessions at 60 kg × 8 — looks like a stall"
- 1-sentence body: e.g., "Plateaus are normal. A short deload often breaks them."
- Primary action: "Try 54 kg × 8 next session" (taps → applies the suggestion to the next started session of this exercise; if no active session, sets a per-exercise prefill that the next session-start picks up via existing prefill mechanism in `hooks/resolvePrefillCandidate.ts`).
- Secondary action: "Not now" (dismisses for 14 days; persists in `app_settings` keyed `plateau_dismiss:<exercise_id>`).

#### Surface 2 — In-session annotation (`components/session/LastNextRow.tsx`)
When the user is mid-session on a stalled exercise, the existing "Next" pill gets a small leading icon (lucide `trending-down-icon`) and the existing `SuggestionExplainerModal` body gets one extra paragraph:
> "Plateau detected: same top-set 4 sessions running. Consider this break-through plan."
No new full-screen UI. No new modal.

#### Accessibility
- `accessibilityLabel`: e.g., "Plateau detected on Cable Lat Pulldown — 4 sessions at 60 kilograms by 8 reps. Suggested break-through: 54 kilograms by 8 reps next session."
- `accessibilityHint`: "Double tap to apply the break-through suggestion. Triple tap then swipe right to dismiss for 14 days."
- Card is fully keyboard / screen-reader navigable; matches existing `DeloadNudgeCard` patterns.

#### Empty / edge UI
- < 3 sessions of history → no card, no badge (insufficient data).
- Mixed unit changes (kg ↔ lbs) within window → classifier coerces to user's current unit using existing conversions; if conversion ambiguous, classifier returns `null` (no surface).

### Technical Approach

#### New module: `lib/plateau.ts`
Pure-function module (no DB, no React). Mirrors `lib/overreaching.ts` and `lib/rm.ts` style.

```ts
export type PlateauClassification = 'progressing' | 'maintaining' | 'stalled' | 'regressing';

export type BreakThroughSuggestion =
  | { kind: 'deload';      weight: number; reps: number; reason: string }
  | { kind: 'rep_target';  weight: number; reps: number; reason: string }
  | { kind: 'form_check';  reason: string };

export type PlateauResult = {
  classification: PlateauClassification;
  sessionsObserved: number;
  topSetWeight: number | null;
  topSetReps: number | null;
  avgRPE: number | null;
  suggestion: BreakThroughSuggestion | null;
};

export function classifyPlateau(
  sessions: PlateauSessionRow[],   // pre-fetched, sorted desc by started_at
  isBodyweight: boolean,
  unitStep: number,                 // smallest weight increment (e.g. 2.5 kg)
): PlateauResult;
```

`PlateauSessionRow` is a flat record per session: `{ session_id, started_at, top_set_weight, top_set_reps, top_set_rpe, avg_rpe, all_completed, set_count }`. Selection rule for "top set" within a session: highest `weight × reps` among non-warmup, non-dropset, non-failure sets. Ties broken by latest `set_number`.

#### New DB query: `lib/db/exercises.ts → getPlateauWindow(exercise_id, n=4)`
Returns the last `n` non-empty working-set sessions for the exercise as `PlateauSessionRow[]`. Single SQL query reusing existing `workout_sets` indices (`idx_workout_sets_exercise_id`). No new index needed for n≤8.

#### Hook: `hooks/usePlateauStatus.ts`
React Query hook keyed on `['plateau', exercise_id]`, fetches the window + dismissal state, runs `classifyPlateau`, returns `{ result, dismissedUntil }`. 5-minute `staleTime`. Invalidated on every session save (existing `invalidateQueries(['session-*'])` plus a new key).

#### Wiring
- `app/exercise/[id].tsx` — render `<PlateauStatusCard />` (new) above existing `ExerciseRecordsCard`.
- `components/session/LastNextRow.tsx` — accept new optional `plateauHint?: BreakThroughSuggestion | null` prop; render trending-down icon if present; pass through `SuggestionExplainerModal`.
- `hooks/useSessionData.ts` — fetch `usePlateauStatus` per visible exercise; merge into `suggestions` map.
- New `app_setting` row for dismissal: `plateau_dismiss:<exercise_id>` → ISO timestamp of dismissal (computed `dismissedUntil = parsed + 14 d`).

#### No schema migration required
All needed columns (`weight`, `reps`, `rpe`, `set_type`, `completed`, `started_at`) already exist on `workout_sets` and `sessions`.

#### Performance
- Detail screen: 1 query, ≤ 32 rows (4 sessions × ≤8 sets), classifier is O(n).
- In-session: piggybacks on existing per-exercise `useSessionData` fetch; one extra small query per visible exercise. Cached for 5 min.

#### Dependencies
None new. Uses existing `react-query`, `lucide-react-native`, `@/lib/rm` (for `epley` in 1RM trend math).

#### Storage
~50 bytes per dismissal in `app_settings` (one row per dismissed exercise; cleaned up by classifier on next stall — overwrites old timestamp).

## Scope

### In
- `lib/plateau.ts` pure classifier + types
- `lib/db/exercises.ts` `getPlateauWindow()` query
- `hooks/usePlateauStatus.ts`
- `components/exercise/PlateauStatusCard.tsx`
- Wiring into `app/exercise/[id].tsx` and `components/session/LastNextRow.tsx`
- `SuggestionExplainerModal` plateau-mode copy
- 14-day dismissal in `app_settings`
- Unit / acceptance tests for the classifier (5 fixtures: progressing, maintaining, stalled-deload, stalled-rep, regressing)
- A11y labels matching `DeloadNudgeCard` patterns

### Out
- Notifications / push reminders (explicitly excluded — psych safety)
- Plateau detection on bodyweight exercises with no logged bodyweight modifier (V2 — needs body-weight normalization)
- Multi-exercise / muscle-group plateau detection (handled by existing overreaching module)
- Programmatic deload-week scheduling (would conflict with the "no rigid programs" goal anti-pattern)
- Cross-gym normalization (use existing per-set calibration from BLD-1059)
- Settings toggle to disable detection (V2 — not needed if surface is non-intrusive)

## Acceptance Criteria
- [ ] **AC1 — Stall classification (deload):** GIVEN an exercise with 4 consecutive sessions at top-set 60 kg × 8, all completed, avg RPE 8.5 / 8.7 / 8.8 / 9.0 WHEN the user opens the exercise detail screen THEN `PlateauStatusCard` renders with classification text "4 sessions at 60 kg × 8 — looks like a stall" AND primary action "Try 54 kg × 8 next session" (using `step` rounding from user prefs).
- [ ] **AC2 — Stall classification (rep-target):** GIVEN the same 4-session stall but avg RPE 7.0 / 7.2 / 7.5 / 7.5 (sub-8) WHEN the user opens the exercise detail screen THEN the primary action is "Try 60 kg × 10 next session".
- [ ] **AC3 — Regression:** GIVEN top-set e1RM (epley) drops from 75 to 70 to 67 across 3 sessions WHEN the user opens the exercise detail screen THEN classification is "regressing" and suggestion is "form check" with a link to record a form clip.
- [ ] **AC4 — Insufficient data:** GIVEN < 3 sessions of history for the exercise WHEN the user opens the exercise detail screen THEN no `PlateauStatusCard` is rendered.
- [ ] **AC5 — Progressing:** GIVEN the most recent session improved either top-set weight or top-set reps over the prior session WHEN the user opens the exercise detail screen THEN no `PlateauStatusCard` is rendered.
- [ ] **AC6 — In-session annotation:** GIVEN a stalled exercise WHEN the user starts a session containing it THEN the `LastNextRow` "Next" pill renders with a `trending-down-icon` AND the `SuggestionExplainerModal` body contains the plateau paragraph.
- [ ] **AC7 — Apply break-through:** GIVEN a stalled exercise with `PlateauStatusCard` showing AND no active session WHEN the user taps "Try 54 kg × 8 next session" THEN a per-exercise prefill is persisted; AND the next session started that includes this exercise prefills empty sets to 54 kg × 8 (using existing prefill flow).
- [ ] **AC8 — Dismiss for 14 days:** GIVEN the card is showing WHEN the user taps "Not now" THEN the card disappears AND does not re-appear for 14 days even if classification is still `stalled`. After 14 days, the card returns automatically.
- [ ] **AC9 — Apply during session:** GIVEN a stalled exercise WHEN the user taps the "Next" pill in `LastNextRow` THEN the existing apply-to-empty-sets confirmation appears with the break-through values (no new modal).
- [ ] **AC10 — Unit safety:** GIVEN the user toggles units mid-history (kg → lbs) WHEN classification runs THEN values are coerced to current unit; if any conversion produces non-finite values, classifier returns `null` (no surface).
- [ ] **AC11 — Warmup/dropset/failure exclusion:** GIVEN sessions contain warmup or dropset or failure sets WHEN classification runs THEN those sets are excluded from top-set selection AND from RPE averaging.
- [ ] **AC12 — Performance:** Classification + DB fetch must complete in ≤ 30 ms median on a Pixel 9 with a history of 200 sessions for the exercise (measured via existing perf harness in `__tests__/perf/`).
- [ ] **AC13 — A11y:** All new UI passes existing `__tests__/acceptance/accessibility.acceptance.test.tsx` patterns; `PlateauStatusCard` is listed as a `View accessibilityRole="summary"` with full label / hint.
- [ ] **AC14 — No new lint warnings, all tests pass, typecheck clean.**

## Edge Cases
| Scenario | Expected |
|----------|----------|
| Exercise has only warmup sets across all 4 sessions | classifier returns `null`; no card |
| User changes the exercise (renames, swaps muscle group) mid-window | classifier still uses `exercise_id` (stable); no behavior change |
| Mixed bodyweight modifier values across window | classifier compares total effective load (`weight + bodyweight_modifier_kg`); if `bodyweight_modifier_kg` missing on any row, that session falls back to raw `weight` |
| User logs zero RPE on all sets in window | RPE check is skipped; classification falls back to load × reps comparison only; suggestion defaults to deload at avg-completion < 100% else rep-target |
| Exercise is bodyweight (no load) | classifier compares top-set reps only; stall = same max reps for 3+ sessions; suggestion is "+1 rep next session" (no deload branch) |
| User dismisses the card and the same plateau persists, then they break out, then re-stall later | Dismissal expires after 14 d OR on next `progressing` event (cleared by the classifier on detection) — re-stall surfaces a fresh card immediately |
| Two exercises both stalled (e.g., bench AND OHP) | each exercise gets its own card on its detail screen; in the session screen, each exercise's `LastNextRow` annotates independently (no aggregate alert — keeps focus per-lift) |
| User opens detail screen offline | All data is local SQLite — works fully offline; no spinner / no network call |
| Brand-new install / empty history | `getPlateauWindow` returns []; classifier returns `null`; no card; no error |

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
_Pending_

### Tech Lead (Feasibility)
_Pending_

### Psychologist (Behavior-Design)
_Pending_

### CEO Decision
_Pending_
