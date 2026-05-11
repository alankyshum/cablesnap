# Feature Plan: Adaptive Macro Coach

**Issue**: BLD-1163  **Author**: CEO  **Date**: 2026-05-11
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

## Research Source
- **Origin:** Reddit pain-point synthesis (r/loseit, r/macros, r/MacroFactor); product-mission gap analysis.
- **Pain point observed:** Free-tier users repeatedly cite *"I want MacroFactor's adaptive macros without paying $11.99/month"* as a top wish. MyFitnessPal/LoseIt!'s static targets that don't auto-adjust to actual progress is the most common reason users churn to MacroFactor.
- **Frequency:** Recurring theme across multiple subs and 2025–2026 app comparison threads — not a one-off.
- **Why CableSnap:** Our project description literally says *"Open-source workout & macro tracker. Free alternative to Macro/MuscleWiki."* Adaptive macros is the headline feature gap that prevents us from being a true free alternative. We already collect every input the algorithm needs (`bodyWeight`, `food_entries → daily_log`, `macro_targets`, `nutrition-calc.ts`).

## Problem Statement

CableSnap currently sets calorie + macro targets **once** during onboarding via Mifflin-St Jeor (`lib/nutrition-calc.ts`) and never updates them. In reality:

- Estimated TDEE drifts as body weight, training volume, NEAT, and metabolic adaptation change.
- A static `cut: -500 kcal` deficit may be too aggressive (rapid loss → muscle wasting, ED risk) or too conservative (no progress → user disengages).
- Users have to *manually* recompute and re-enter targets — most never do, then conclude the app "stopped working."

The result: users with the data we already have logged still get worse outcomes than MacroFactor users, despite us being free and offline-first.

## Behavior-Design Classification (MANDATORY)

- [x] **YES** — triggers present:
  - **Goal-setting / commitments** (the coach proposes a target the user accepts/declines).
  - **Motivational progress visualizations** (trend weight chart, "your TDEE is X").
  - **Progression** loop (weekly cadence of suggestions creates a recurring engagement hook).
  - **ED-adjacent risk** — auto-adjusting calorie targets downward in response to lack of weight loss is a known pathway to disordered eating if not safeguarded. **This must be the centerpiece of psychologist review.**
- [ ] NO

**Psychologist review is MANDATORY and binding.** No implementation begins without `APPROVED` or `APPROVED WITH CONDITIONS` (with all conditions incorporated). A `REJECTED` verdict means redesign or board escalation, not override.

## User Stories

- **As a user trying to lose weight**, I want my calorie target to automatically reflect what's actually happening with my weight, so I keep making progress without doing math myself.
- **As a user who is bulking**, I want the app to nudge my calories up if my trend weight stalls, so I don't waste a training cycle eating maintenance.
- **As a user maintaining**, I want a quiet weekly "your TDEE looks like ~2,350 kcal" check-in, so I trust my targets without obsessing.
- **As any user**, I want to be able to **decline** every suggestion (advisory, never silent) and to **disable the coach entirely** with one tap.
- **As a user with ED history**, I want to opt-out at install time and never see deficit-adjustment prompts.

## Proposed Solution

### Overview

A **weekly advisory** that:
1. Computes a **trend weight** (7-day exponentially-weighted moving average) from `body_weight` rows.
2. Computes **observed average daily intake** (kcal) over the same window from `daily_log` joined with `food_entries`.
3. Estimates **observed TDEE** using the energy-balance equation:
   `observed_TDEE_kcal = avg_daily_intake_kcal + (weight_change_kg × 7700) / days`
   (1 kg fat ≈ 7,700 kcal; this is the standard MacroFactor-style formula.)
4. Proposes a **new daily target** = `observed_TDEE + goal_adjustment` (using the existing `cut/-500`, `maintain/0`, `bulk/+300` table; **bounded** — see Risk Assessment).
5. Presents the suggestion to the user as an **opt-in, dismissible** card. Never silently mutates `macro_targets`.

### UX Design

**Surface 1 — Weekly card on `/nutrition` tab (only when ready):**

```
┌─────────────────────────────────────────────┐
│ 📈  Macro Coach — week of May 4–10          │
│                                             │
│ Your trend weight: 78.4 kg (was 79.1)       │
│ You averaged 2,180 kcal/day                 │
│ Estimated TDEE: ~2,520 kcal                 │
│                                             │
│ Suggested new target: 2,020 kcal            │
│ (current: 1,950 — +70)                      │
│                                             │
│ [ Update target ] [ Keep current ] [ ⓘ ]    │
└─────────────────────────────────────────────┘
```

- Card appears **only on Sundays** (or first app-open after Sunday) and **only if** preconditions met (see "Required data quality" below).
- "Update target" applies the new target and recomputes protein/carbs/fat using existing `nutrition-calc.calculateMacros` (so split rules stay consistent).
- "Keep current" dismisses; coach won't re-prompt for 7 days.
- "ⓘ" opens a one-screen explainer of the math + a link to disable.

**Surface 2 — Settings → Nutrition → Adaptive Macro Coach:**

- **Master toggle** (off by default — opt-in only).
- "Show me weekly TDEE check-ins even if I don't want target changes" sub-toggle (info-only mode).
- "Pause for N weeks" (1 / 2 / 4 / indefinite).
- Hard floor display: "Suggestions will never go below 1,200 kcal or your custom floor." Editable floor input.
- Educational disclosure: "If you have a history of disordered eating, we recommend keeping this off. Talk to a clinician before adjusting calories."

**Empty / error / a11y states:**

| Condition | Behavior |
|---|---|
| <14 daily weigh-ins in last 21 days | Card hidden; explainer in Settings: "Need 14 days of weights." |
| <10 days of food logs in window | Card hidden; explainer: "Log meals more consistently." |
| Trend weight delta within ±0.2% bodyweight | Card shows "Weight stable — no change suggested." |
| Suggested target below user's floor | Card capped at floor; warning copy: "Capped at your floor (X kcal)." |
| Suggested change > ±300 kcal in one week | Card capped at ±300 kcal/week; copy: "Limited to ±300 kcal/week for safety." |
| Screen-reader users | All numbers announced with units; chart has alt-text summary; buttons fully labeled. |
| RTL / large font / Dynamic Type | Card uses `Text` with `allowFontScaling`; layout reflows; tested up to 200% font size. |

### Technical Approach

**Architecture — pure functions + thin UI:**

- **New pure module** `lib/macro-coach.ts` (≈150 LOC) with no DB / RN imports — fully unit-testable. Exposes:
  ```ts
  computeTrendWeight(weights: BodyWeightRow[], windowDays: number): number | null;
  computeAvgIntake(logs: DailyLogRow[], window: DateRange): number | null;
  estimateTDEE(avgIntake: number, weightDeltaKg: number, days: number): number;
  suggestTarget(opts: SuggestOpts): CoachSuggestion | { reason: SkipReason };
  ```
- **DB integration** in `lib/db/macro-coach.ts` (thin orchestrator, queries the three tables).
- **Settings** in existing `app_settings` table (no schema change for v1):
  - `macro_coach.enabled` (string "0"/"1")
  - `macro_coach.floor_kcal` (string number, default "1200")
  - `macro_coach.last_dismissed_at` (string epoch ms)
  - `macro_coach.paused_until` (string epoch ms)
- **UI** new `components/nutrition/MacroCoachCard.tsx` (renders only when `coach.shouldShow()` returns true) + new screen `app/settings/macro-coach.tsx`.
- **No new dependencies.** All math is arithmetic. No background jobs — recompute on `/nutrition` tab focus.

**Data model:** No new tables. All inputs already exist in `body_weight`, `food_entries`, `daily_log`, `macro_targets`, `app_settings`.

**Performance:** Window is bounded to 21 days. Each weekly compute reads ≤21 weight rows + ≤21×N food rows; trivially under one frame on the slowest target devices.

**Storage:** No new persistent storage beyond settings keys above.

**Offline-first:** Pure local computation, no network. Aligned with project privacy-first stance.

## Scope

**In:**
- Weekly trend-weight + observed-TDEE computation.
- One advisory card on `/nutrition` tab.
- Settings screen with master toggle + floor + pause.
- Hard floor (default 1,200 kcal, user-editable upward only).
- Hard cap on weekly target change (±300 kcal/week).
- Pure-function module + unit tests covering all branches.
- Opt-in default: feature is **OFF** until user enables it from Settings.
- Educational disclosure copy reviewed by psychologist.

**Out (deferred):**
- Push notifications for weekly check-ins (would re-trigger psychologist review).
- Macro-split adaptation (we keep existing 0.25 fat / 2.2 g·kg⁻¹ protein rules; only kcal floats).
- Body-composition-aware adjustments (DEXA / smart-scale impedance).
- Multi-week trend visualizations (we already have a body-weight chart in `/progress`).
- Streaks, gamification, reminder badges (intentionally avoided).
- Group / social features.

## Acceptance Criteria

- [ ] Given the user has logged ≥14 daily weights in the last 21 days **AND** ≥10 days of food in the last 14 days **AND** the coach is enabled in Settings **AND** ≥7 days have passed since last dismissal, When they open `/nutrition` on or after the next Sunday, Then the Macro Coach card appears with computed trend weight, avg intake, estimated TDEE, and a suggested new daily kcal target.
- [ ] Given the suggested target would be lower than the user's configured floor (default 1,200 kcal), When the card is shown, Then the suggestion is capped at the floor and the card displays the cap warning copy: "Capped at your floor (X kcal)."
- [ ] Given the change between current and suggested target exceeds ±300 kcal, When the card is shown, Then the suggestion is capped at ±300 kcal and the card displays: "Limited to ±300 kcal/week for safety."
- [ ] Given the user taps "Update target", When confirmed, Then `macro_targets.calories` is updated and protein/carbs/fat are recomputed via existing `calculateMacros`, and a confirmation toast appears.
- [ ] Given the user taps "Keep current", When confirmed, Then `app_settings.macro_coach.last_dismissed_at` is set and the card hides for ≥7 days.
- [ ] Given the master toggle is OFF, When the user opens `/nutrition` under any data condition, Then no card is rendered. (Default state for all existing and new users.)
- [ ] Given trend-weight delta is within ±0.2% bodyweight over the window, When the card is shown, Then it shows "Weight stable — no change suggested" with disabled "Update" button.
- [ ] Given insufficient data (any precondition unmet), When the user opens `/nutrition`, Then no card appears, but Settings → Macro Coach displays the specific missing prerequisite.
- [ ] All `lib/macro-coach.ts` pure functions have ≥95% branch coverage in `__tests__/macro-coach.test.ts`.
- [ ] Settings screen passes a11y audit (TalkBack / VoiceOver labels for every control, contrast AA, font scaling 200%).
- [ ] PR passes all tests, typecheck, lint with no regressions.
- [ ] No new lint warnings.
- [ ] No new third-party dependencies.

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| First-week user (no body weights) | Card hidden; Settings shows "Log a weight to get started." |
| User logs weights but no food | Card hidden; explainer surfaced. |
| User unit = lb / height = in | All math operates in metric (use `convertToMetric`); display honours user's unit preferences. |
| Goal = `maintain` | Coach still surfaces TDEE info but suggested target = TDEE (no deficit/surplus). |
| Goal switched mid-window | Use the **current** goal at compute time; don't blend. |
| Negative weight delta during a bulk | Coach suggests **increasing** kcal (correct direction). |
| Positive weight delta during a cut | Coach suggests **decreasing** kcal — but always respects floor and cap. |
| User on a long pause (>4 weeks back) | Last_dismissed cleared on resume; recompute fresh. |
| Time zone change / DST | Use ISO date strings (already how `body_weight.date` is stored). |
| Clock skew (device date in the past) | Skip compute if `now < latest_weight_date`. |
| Corrupted / extreme weight entry (e.g. 0 or 500 kg) | Filter out entries outside [30 kg, 300 kg] before EWMA. |
| Empty / null `serving` or 0-cal foods | Already handled in existing `nutrition-calc`; coach inherits. |
| RTL languages | Card uses `flex-direction: row-reverse` aware components (existing patterns). |
| User disables coach mid-render | UI subscribes to settings; card unmounts on next render. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| **ED-adjacent harm** — auto-suggesting deficits triggers restrictive cycles in vulnerable users | Medium | **Severe** | Off by default; install-time disclosure; hard kcal floor (default 1,200, user-editable upward only); ±300 kcal/week cap; psychologist review of every copy string; explicit "if you have ED history, keep this off" messaging; no streaks/gamification. |
| Bad math from outliers (one bad weigh-in skews EWMA) | High | Medium | EWMA smoothing + filter out implausible weights ([30, 300] kg) + require ≥14 weights in 21 days. |
| Users misinterpret advisory as authoritative | Medium | Medium | Copy: "Estimated TDEE — your true value may differ." ⓘ link to explainer. Buttons read "Update" / "Keep" — never "Accept" / "Reject". |
| Feature creep into push notifications / streaks | Medium | High (behavior risk) | Explicitly out-of-scope; any addition re-triggers psychologist gate. |
| Computation perceived as slow on low-end devices | Low | Low | All inputs ≤21 days; pure JS arithmetic; <1ms in benchmarks. |
| Migration risk | Very low | Low | No schema change; only new `app_settings` keys (which are append-only). |
| Wrong sign for bulk (negative weight change → suggest more kcal) — easy to flip | Low | High | Property-based tests in `macro-coach.test.ts` covering all 6 (goal × delta sign) combinations. |
| Conflict with manual user edits to `macro_targets` between Sundays | Medium | Low | Always read fresh `macro_targets` at compute time; suggest delta from current actual target. |

## Review Feedback

### Quality Director (UX)
_Pending_

### Tech Lead (Feasibility)
_Pending_

### Psychologist (Behavior-Design) — MANDATORY GATE
_Pending_

### CEO Decision
_Pending_
