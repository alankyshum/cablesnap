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
┌─────────────────────────────────────────────────────┐
│ 📈  Macro Coach — week of May 4–10                  │
│                                                     │
│ Here's what your data suggests. You set your target.│
│                                                     │
│ You logged 4 workouts this week and weighed in 6 of │
│ 7 days. Your body has good data to work with.       │
│                                                     │
│ Your trend weight: 78.4 kg (was 79.1)               │
│ You averaged ~2,200 kcal/day                        │
│ Estimated TDEE: ~2,500 kcal (range 2,400–2,650)     │
│                                                     │
│ Suggested target: 2,000 kcal/day                    │
│ (you're currently at 1,950)                         │
│                                                     │
│ How did your training feel this week?               │
│   ( Strong )  ( OK )  ( Drained )                   │
│                                                     │
│ [ Use this number ] [ Set my own ] [ Not this week ]│
│                                                     │
│ Logging consistency this month: 22/30 days.         │
│ That consistency is doing more for you than any     │
│ number on this card.                                │
│                                                     │
│ ⓘ How this is computed                              │
└─────────────────────────────────────────────────────┘
```

- Card appears **only on Sundays** (or first app-open after Sunday) and **only if** preconditions met (see "Required data quality" below).
- **All numbers user-facing are rounded to the nearest 50 kcal or shown as ranges.** No 4-significant-figure precision (per psych verdict §Required Change 2).
- **Direction is conveyed by the literal number, not by color.** No green-down / red-up arrows. Both directions render in identical neutral chrome (per psych §Required Change 10).
- **Authority inversion (per psych §4):** Header reads *"Here's what your data suggests. You set your target."* Buttons:
  - **`Use this number`** — applies the suggestion via the **new** `recomputeMacrosFromCalories(calories, weight_kg)` helper in `nutrition-calc.ts` (avoids the goal-double-apply trap; see Tech Lead item #6 / footnote).
  - **`Set my own`** — opens manual entry; user types the kcal target they want.
  - **`Not this week`** — escalating cooldown: first decline = 14-day cooldown, second consecutive decline = 28-day cooldown + adds in-card line *"You've passed twice. Want to pause this for a while?"* with one-tap "Pause 1 month." Cooldown resets to 14 days only after one acceptance OR explicit user re-enable from Settings (per psych §6).
- **Right Why prompt** (Strong / OK / Drained) is captured per week, stored locally. **If the user reports `Drained` two weeks in a row AND the algorithm would suggest a deficit, the card suppresses the deficit suggestion that week** (per psych §1, §11). After a `Use this number` tap, the next week's card opens with: *"Last Sunday you set 2,000 kcal/day. How did the week feel?"* — same Strong/OK/Drained tap; `Drained` suppresses any further reduction for 14 days regardless of trend (per psych §11).
- **Mastery overlay** (logging-consistency line) is computed from existing `daily_log` data and rendered **below** (not above) the kcal numbers — outcome stays primary because the user opted in, but mastery is acknowledged (per psych §9). No badge, no streak counter elsewhere.
- **No celebration-of-direction copy. Ever.** This is enforced in code via the `MacroCoachCard.tsx` header comment (see Risk Assessment) and is a quality-director PR-review checklist item (per psych §5).
- "ⓘ" opens a one-screen explainer of the math + a link to disable.

**Surface 2 — Settings → Nutrition → Adaptive Macro Coach:**

- **Master toggle** (off by default — opt-in only).
- **First-opt-in disclosure flow (per psych §7 Required Change — binding consent architecture, NOT gatekeeping):**
  - On the **very first tap** of the master toggle (not buried in a separate explainer), present a single full-screen panel containing:
    1. Plain-language summary of what the coach does and does not do (advisory, weekly, never silently mutates targets, has a hard safety floor).
    2. **One SCOFF-lite passive screening item** (single question, no diagnostic claim): *"Have you ever felt out of control around food, or worried about food/weight in a way that interfered with daily life?"* — Yes / No / Prefer not to say.
    3. **Two outcomes** — both valid, neither dead-end:
       - **Continue** → full coach with target suggestions.
       - **Use info-only mode** → shows weekly TDEE estimate but **never** suggests target changes. (Default routing if user answered "Yes" or "Prefer not to say" to the screen, but user can override either way.)
    4. Final paragraph: *"If food and weight have been a hard area for you, the safest path is to talk to a clinician. This app cannot replace that."*
- **Identity + implementation-intention capture (per psych §8, on the same opt-in flow):**
  - One optional free-text prompt: *"In one sentence: who are you fueling?"* (stored locally; surfaced occasionally above the card as: *"You said: '<their words>'."*).
  - One if-then plan: *"When the card appears on Sunday, I will:* ☐ check it before lunch ☐ check it after my Sunday workout ☐ check it whenever." (Two taps; BCT 1.4 Action Planning + Clear identity loop.)
- "Show me weekly TDEE check-ins even if I don't want target changes" sub-toggle (info-only mode — also reachable here without re-doing the screening).
- "Pause for N weeks" (1 / 2 / 4 / indefinite).
- **Safety floor display (per psych §3 — supersedes the original 1,200 kcal floor; binding):**
  > *"Suggestions will never go below your safety floor of **X kcal** — your body's resting energy needs."*
  - `X = max(1500 if female, 1800 if male, mifflin_st_jeor_RMR(user))`. (Existing `lib/nutrition-calc.ts` already exposes the Mifflin-St Jeor RMR computation.)
  - **Floor is read-only-down. User can RAISE it; user cannot lower it below the computed value.** This is a code-level invariant, not a soft validation. `lib/db/macro-coach-settings.ts::getFloorKcal()` clamps to the computed safety floor on read, even if the underlying `app_settings` row was corrupted to a smaller value (per Tech Lead §4 + Psych §3 ack from techlead at comment `30553def`).
- Educational disclosure remains visible in Settings (separate from the first-opt-in screen): "If you have a history of disordered eating, we recommend keeping this off or using info-only mode. Talk to a clinician before adjusting calories."

**Empty / error / a11y states:**

| Condition | Behavior |
|---|---|
| <14 daily weigh-ins in last 21 days | Card hidden; explainer in Settings: "Need 14 days of weights." |
| <10 days of food logs in window | Card hidden; explainer: "Log meals more consistently." |
| Trend weight delta within ±0.2% bodyweight | Card shows "Weight stable — no change suggested." |
| Suggested target below user's safety floor | Suggestion **clamped at the safety floor** (`max(1500F/1800M, RMR)`); card displays neutral copy: *"Held at your safety floor (X kcal)."* No alarming language; no red affordance. |
| Suggested change > ±300 kcal from current target in one week | Capped at ±300 kcal/week; copy: *"Limited to ±300 kcal/week."* (Drop the trailing "for safety" — psych: makes the algorithm sound paternalistic; the cap is operational.) |
| User reports `Drained` on Right Why prompt | Stored. If two consecutive `Drained` weeks AND algorithm would suggest a deficit, deficit suggestion is suppressed; card shows info-only mode that week. |
| Post-decision suppression active (Drained week after `Use this number` for a deficit) | Card suppresses any further reduction for 14 days regardless of trend (per psych §11). |
| Cooldown active (after `Not this week`) | Card hidden until cooldown elapses (14 days first decline; 28 days second consecutive decline). |
| Color coding | **Prohibited.** Direction is conveyed by the literal number only. Both deficit and surplus suggestions render in identical neutral chrome (per psych §10). |
| Screen-reader users | All numbers announced with units; chart has alt-text summary; buttons fully labeled; Right Why prompt buttons announce "Strong / OK / Drained — log how training felt this week." |
| RTL / large font / Dynamic Type | Card uses `Text` with `allowFontScaling`; layout reflows; tested up to 200% font size. |

### Technical Approach

**Architecture — pure functions + thin UI** (incorporates Tech Lead §1–§6 tightenings):

- **New pure module** `lib/macro-coach.ts` with no DB / RN imports — fully unit-testable. Exposes:
  ```ts
  // EWMA with α=0.1 (Hacker's-Diet trend formula; ~10-day half-life). α exported as a named constant; not user-configurable.
  computeTrendWeight(weights: BodyWeightRow[], windowDays: number, now: Date): number | null;
  computeAvgIntake(logs: DailyLogRow[], window: DateRange): number | null;
  // Hardened per Tech Lead §2: rejects days<7, rejects |Δw|/window<0.002, caps |TDEE−avg_intake| at 750 kcal/day.
  estimateTDEE(avgIntake: number, weightDeltaKg: number, days: number): number | { reason: SkipReason };
  // Composable helpers (Tech Lead §5):
  clampToFloor(target: number, floor: number): { value: number; capped: boolean };
  clampToWeeklyDelta(current: number, target: number, maxDelta: number): { value: number; capped: boolean };
  classifyStability(deltaKg: number, windowKg: number): "stable" | "loss" | "gain";
  // Orchestrator:
  suggestTarget(opts: SuggestOpts): CoachSuggestion | { reason: SkipReason };
  ```
  **Determinism (Tech Lead §6):** No `new Date()` / `Date.now()` calls in this module. `now: Date` and `tz: string` are injected. The DB orchestrator captures wallclock.

- **DB integration** in `lib/db/macro-coach.ts` (thin orchestrator + memoization, per Tech Lead §3). Memo key: `${todayIso}|${latestWeightRowId}|${latestLogId}|${settingsHash}`. Compute lives in a `useMacroCoach()` hook returning `{ status: 'loading' | 'hidden' | 'ready', suggestion? }`. Module-level `Map`, cleared on settings change. No background timers, no `useEffect` polling.

- **Settings accessor** `lib/db/macro-coach-settings.ts` (typed, single owner of `app_settings.macro_coach.*` parsing — per Tech Lead §4, **with floor logic updated per psych §3**):
  - `getEnabled(): boolean` (default `false`).
  - `getMode(): 'full' | 'info_only'` (set during first-opt-in screening; default `'info_only'` if user answered "Yes" or "Prefer not to say" to the SCOFF-lite item; user can override).
  - `getFloorKcal(user: UserProfile): number` — **always returns `max(1500 if female, 1800 if male, mifflin_st_jeor_RMR(user))`** regardless of any value persisted in the row. The persisted value can only RAISE the floor above this minimum, never lower it. This is a code-level invariant (per psych §3 + techlead ack `30553def`).
  - `getRightWhyHistory(): RightWhyEntry[]` — last 4 weeks of Strong/OK/Drained taps.
  - `getDismissalCount(): number` — consecutive `Not this week` count; resets to 0 on accept or explicit re-enable.
  - `getLastDismissedAt(): number | null`.
  - `getPausedUntil(): number | null`.
  - `getDeficitSuppressedUntil(): number | null` — set when post-decision Drained suppresses further reductions (per psych §11).
  - `getIdentitySentence(): string | null` and `getIfThenChoice(): 'before_lunch' | 'after_workout' | 'whenever' | null` (from opt-in capture, per psych §8).
  - All `setX(...)` mirrors apply the same clamps. **No `parseFloat` outside this module.**

- **UI** new `components/nutrition/MacroCoachCard.tsx` (renders only when `useMacroCoach().status === 'ready'`) + new screen `app/settings/macro-coach.tsx` (master toggle + first-opt-in flow + safety floor display + identity prompt + pause + history viewer).

- **NEW helper required** in `lib/nutrition-calc.ts` per Tech Lead §"Foot-gun flagged (preferred fix)":
  ```ts
  // Recompute protein/carbs/fat from a coach-supplied calorie target WITHOUT re-applying GOAL_ADJUSTMENTS.
  // Prevents the goal-double-apply trap when the coach calls `calculateMacros(suggestedTarget, weight, goal)`.
  recomputeMacrosFromCalories(calories: number, weight_kg: number): { protein_g: number; carbs_g: number; fat_g: number };
  ```
  This is the preferred fix (vs. per-call subtraction in coach code). The coach never calls `calculateMacros` directly with its suggested target.

- **No new dependencies.** All math is arithmetic. No background jobs — recompute on `/nutrition` tab focus, memoized. Sunday detection uses `Intl.DateTimeFormat` with the injected tz (do NOT add Luxon/date-fns-tz).

**Data model:** No new tables. All inputs already exist in `body_weight`, `food_entries`, `daily_log`, `macro_targets`, `app_settings`. New `app_settings.macro_coach.*` keys (append-only): `enabled`, `mode`, `floor_kcal_user_override`, `right_why_w-N` (4 keys, last 4 weeks), `dismissal_count`, `last_dismissed_at`, `paused_until`, `deficit_suppressed_until`, `identity_sentence`, `if_then_choice`, `screening_answer`, `screening_completed_at`. All string-typed; the typed accessor module is the only reader/writer.

**Performance:** Window is bounded to 21 days. Each weekly compute reads ≤21 weight rows + ≤21×N food rows; trivially under one frame on the slowest target devices. Memoized so navigation back to `/nutrition` is O(1) after first compute per Sunday.

**Storage:** No new persistent storage beyond settings keys above.

**Offline-first:** Pure local computation, no network. Aligned with project privacy-first stance.

**Scope-creep gate (per Tech Lead "LOC honesty check"):** Realistic PR target is **~1,100–1,500 LOC across ~6 files**. Anything materially larger triggers a split. Files in scope:
- `lib/macro-coach.ts` (pure): 180–230 LOC.
- `lib/db/macro-coach.ts` (orchestrator + memo): 100–140 LOC.
- `lib/db/macro-coach-settings.ts`: 80–110 LOC (slightly larger than original estimate due to Right Why + identity + suppression keys).
- `lib/nutrition-calc.ts` (add `recomputeMacrosFromCalories`): +30 LOC.
- `__tests__/macro-coach.test.ts` (95% branch + property tests + safety-floor invariant tests + color-neutrality snapshot + Drained-suppression tests): 400–550 LOC.
- `components/nutrition/MacroCoachCard.tsx`: 220–300 LOC.
- `app/settings/macro-coach.tsx` (incl. first-opt-in flow): 230–320 LOC.

## Scope

**In:**
- Weekly trend-weight (EWMA α=0.1) + observed-TDEE computation with hardened guards (days<7 reject, ±0.2% stability skip, |TDEE−intake|>750 kcal/d reject).
- One advisory card on `/nutrition` tab with three-button authority-inverted UX (`Use this number` / `Set my own` / `Not this week`).
- Right Why prompt (Strong / OK / Drained) on every card; two-week-Drained suppression of deficit suggestions.
- Post-decision check-in loop (the week after `Use this number` for a deficit asks Drained-status; Drained → 14-day suppression of further reductions).
- Mastery-overlay line (logging consistency this month) rendered below the kcal numbers.
- All user-facing kcal numbers rounded to nearest 50 or shown as ranges. No 4-sig-fig precision.
- Color-neutral chrome: no green-down / red-up direction signaling.
- Settings screen with master toggle, info-only mode, pause, identity prompt + if-then plan, Right Why history viewer.
- **First-opt-in disclosure flow** with SCOFF-lite single-question screening, info-only fallback route, clinician-talk reminder.
- **Safety floor = `max(1500F / 1800M, mifflin_st_jeor_RMR)`** — code-level invariant, read-only-down, surfaced in Settings as the user's resting energy needs.
- Hard cap on weekly target change (±300 kcal/week).
- Escalating `Not this week` cooldowns (14 → 28 days) with one-tap "Pause 1 month" surfaced after second consecutive decline.
- `recomputeMacrosFromCalories(calories, weight_kg)` helper added to `lib/nutrition-calc.ts` to remove the goal-double-apply foot-gun.
- Pure-function module + unit tests covering all branches (≥95% branch coverage), property tests for goal × delta-sign combos, safety-floor invariant tests, color-neutrality snapshot, Drained-suppression tests.
- Opt-in default: feature is **OFF** until user enables it from Settings.
- **Written prohibition on celebration-of-direction copy**, enforced by:
  - Code comment at top of `MacroCoachCard.tsx` (and any future coach-copy file) stating the rule verbatim.
  - QD PR-review checklist item on every PR touching `MacroCoach*` files.
- All copy reviewed by psychologist before merge.

**Out (deferred — adding any of these re-triggers the psychologist gate):**
- Push notifications of any kind for the coach.
- Streaks of any kind tied to coach acceptance, logging, or weigh-ins.
- Badges / achievements for hitting suggested targets.
- Social / leaderboard surfacing of TDEE, weight, or coach acceptance.
- Any "smart" upward auto-suggest on bulks that compares user to other users.
- Any in-app celebration animation tied to body-weight movement.
- Macro-split adaptation (we keep existing 0.25 fat / 2.2 g·kg⁻¹ protein rules; only kcal floats; protein recomputed via `recomputeMacrosFromCalories` from new kcal but the formula itself is unchanged).
- Body-composition-aware adjustments (DEXA / smart-scale impedance).
- Multi-week trend visualizations (we already have a body-weight chart in `/progress`).
- Group / social features.

## Acceptance Criteria

- [ ] Given the user has logged ≥14 daily weights in the last 21 days **AND** ≥10 days of food in the last 14 days **AND** the coach is enabled in Settings (mode = `full`) **AND** no active cooldown / pause / Drained-suppression, When they open `/nutrition` on or after the next Sunday, Then the Macro Coach card appears with: trend weight, avg intake (rounded to nearest 50), estimated TDEE shown as a range (`X – Y kcal`), suggested target (rounded to nearest 50), Right Why prompt (Strong/OK/Drained), three buttons (`Use this number` / `Set my own` / `Not this week`), and the mastery-overlay logging-consistency line.
- [ ] **Safety floor invariant.** Given any input combination (including malformed `app_settings` rows, missing user profile fields, or extreme weight outliers), When `suggestTarget` returns a value, Then the value is **always** ≥ `max(1500 if female, 1800 if male, mifflin_st_jeor_RMR(user))`. Enforced by `lib/db/macro-coach-settings.ts::getFloorKcal()` and asserted by a property test that exhaustively probes corruption modes.
- [ ] Given the suggested target would be lower than the safety floor, When the card is shown, Then the suggestion is held at the floor and the card displays the neutral copy: *"Held at your safety floor (X kcal)."* No alarming language, no red color.
- [ ] Given the change between current and suggested target exceeds ±300 kcal, When the card is shown, Then the suggestion is capped at ±300 kcal and the card displays: *"Limited to ±300 kcal/week."*
- [ ] Given the user taps **`Use this number`**, When confirmed, Then `macro_targets.calories` is updated and protein/carbs/fat are recomputed via the new `recomputeMacrosFromCalories(calories, weight_kg)` helper (NOT via `calculateMacros`, which would double-apply the goal delta), and a confirmation toast appears.
- [ ] Given the user taps **`Set my own`**, When they enter a kcal value and confirm, Then `macro_targets.calories` is updated to the user-entered value (subject to the same safety-floor clamp), and macros are recomputed via the new helper.
- [ ] Given the user taps **`Not this week`** for the first time, When confirmed, Then `app_settings.macro_coach.last_dismissed_at` is set, `dismissal_count` increments to 1, and the card hides for **14 days** (not 7).
- [ ] Given the user taps **`Not this week`** twice consecutively, When the second decline is confirmed, Then `dismissal_count` = 2, the card hides for **28 days**, and the card showed an in-card line on that second decline: *"You've passed twice. Want to pause this for a while?"* with a one-tap "Pause 1 month" affordance.
- [ ] Given the user taps **`Use this number`** OR explicitly re-enables the coach in Settings, When confirmed, Then `dismissal_count` resets to 0.
- [ ] Given the user reports `Drained` two consecutive weeks AND the algorithm would suggest a deficit, When the card would render, Then the deficit suggestion is suppressed and the card shows info-only mode (TDEE range only, no target suggestion) for that week.
- [ ] **Post-decision check-in.** Given the user tapped `Use this number` for a deficit suggestion last Sunday, When the next week's card renders, Then it opens with the line *"Last Sunday you set X kcal/day. How did the week feel?"* with the same Strong/OK/Drained buttons. If the user taps `Drained`, Then `deficit_suppressed_until` is set 14 days out and any further reduction is suppressed for that period regardless of trend.
- [ ] Given the master toggle is OFF, When the user opens `/nutrition` under any data condition, Then no card is rendered. (Default state for all existing and new users.)
- [ ] **First-opt-in screening.** Given the user taps the master toggle for the first time, When the screen appears, Then it presents (in this order) plain-language summary, the SCOFF-lite single-question screen, two routing buttons (`Continue` → full, `Use info-only mode`), and the clinician-talk paragraph. Both routes are valid; neither is a dead-end.
- [ ] Given the user answered "Yes" or "Prefer not to say" to the SCOFF-lite item, When the routing screen appears, Then **`Use info-only mode` is the default-highlighted option** (user can still choose `Continue`).
- [ ] **Identity prompt.** Given the user is in the first-opt-in flow, When the identity-capture screen renders, Then it shows the optional free-text prompt *"In one sentence: who are you fueling?"* and the if-then radio (`before_lunch` / `after_workout` / `whenever`); both are skippable.
- [ ] Given trend-weight delta is within ±0.2% bodyweight over the window, When the card is shown, Then it shows "Weight stable — no change suggested" with the suggestion buttons hidden (mastery overlay still visible).
- [ ] Given insufficient data (any precondition unmet), When the user opens `/nutrition`, Then no card appears, but Settings → Macro Coach displays the specific missing prerequisite.
- [ ] All `lib/macro-coach.ts` pure functions have ≥95% branch coverage in `__tests__/macro-coach.test.ts`.
- [ ] Property test covers all 6 (goal × delta-sign) combinations and asserts correct suggestion direction.
- [ ] **Color-neutrality snapshot test.** `MacroCoachCard.tsx` renders deficit and surplus suggestions; snapshot diff between the two outputs is empty for any color/affordance attribute (only the literal numeric content differs).
- [ ] No `new Date()` / `Date.now()` calls inside `lib/macro-coach.ts` (lint rule or grep assertion in test).
- [ ] Settings screen passes a11y audit (TalkBack / VoiceOver labels for every control, contrast AA, font scaling 200%).
- [ ] First-opt-in screen passes a11y audit (full-screen panel scrolls under large fonts; SCOFF-lite buttons have explicit labels including "Prefer not to say").
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
| User answers "Prefer not to say" on SCOFF-lite | Defaults to info-only mode; can override to full from Settings; both routes valid. |
| User skips identity sentence + if-then on opt-in | Both fields stored as `null`; surfaces are simply omitted; no nag to revisit. |
| Drained → Drained two consecutive weeks | Deficit suggestion suppressed for week 2; card shows info-only mode (TDEE range only). |
| Post-decision: user tapped `Use this number` for a deficit, then reports `Drained` next week | `deficit_suppressed_until` set 14 days out; further reductions suppressed regardless of trend. |
| Goal switched to `bulk` while deficit-suppressed | Suppression applies only to deficit suggestions; surplus suggestions on a bulk are unaffected. |
| User raises floor above algorithm output | Algorithm output clamps to user floor; copy: *"Held at your custom floor (X kcal)."* |
| User attempts to lower floor below safety floor in Settings | UI rejects with non-blocking explainer; Settings cannot persist a floor below `max(1500F/1800M, RMR)`. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| **ED-adjacent harm** — auto-suggesting deficits triggers restrictive cycles in vulnerable users | Medium | **Severe** | Off by default; **first-opt-in SCOFF-lite screening with info-only routing**; install-time disclosure; **safety floor = `max(1500F/1800M, RMR)`** as code-level invariant (not user-lowerable); ±300 kcal/week cap; **two-week-Drained suppression of deficit suggestions**; **post-decision Drained → 14-day suppression**; **escalating dismissal cooldowns (14 → 28 d)**; psychologist review of every copy string; explicit "if you have ED history, use info-only" messaging; no streaks/gamification; **written prohibition on celebration-of-direction copy enforced via code comment + QD PR-checklist item**; color-neutral chrome (no red-up/green-down). |
| **False precision / authority** ("the app said 2,520 kcal, why am I not losing?") | High | Medium | All user-facing kcal numbers rounded to nearest 50 or shown as ranges. TDEE shown as range (e.g., 2,400–2,650). "Estimated" prefix on every TDEE display. ⓘ link to one-screen explainer of formula limits. |
| **Algorithm-as-authority framing** undermines user autonomy | Medium | Medium | Three-button card: `Use this number` / `Set my own` / `Not this week`. Header reads *"Here's what your data suggests. You set your target."* User is decider; algorithm is informant. (SDT autonomy support.) |
| **Wrong Why dominance** — outcome-only motivation collapses on bad scale days | Medium | Medium | Right Why prompt (Strong/OK/Drained) on every card. Identity sentence + if-then plan captured at opt-in and surfaced occasionally. Mastery overlay (logging consistency) below the kcal numbers. |
| Bad math from outliers (one bad weigh-in skews EWMA) | High | Medium | EWMA α=0.1 + filter implausible weights ([30, 300] kg) + require ≥14 weights in 21 days + reject `days<7` in pure fn (defense in depth). |
| Energy-balance noise from water shifts injects ±275 kcal/d/week | High | Medium | `estimateTDEE` caps `|TDEE − avg_intake|` at 750 kcal/d; values above this return `reason: "implausible_balance"` and skip the suggestion that week. |
| Goal-double-apply trap (`calculateMacros` adds `GOAL_ADJUSTMENTS` internally) | Medium | High | New `recomputeMacrosFromCalories(calories, weight_kg)` helper in `nutrition-calc.ts`. Coach **never** calls `calculateMacros` with its suggested target. Lint/test asserts this. |
| Feature creep into push notifications / streaks / badges / social | Medium | High (behavior risk) | Explicitly out-of-scope; any addition re-triggers psychologist gate. List enumerated in §Out (deferred). |
| **Watering down any of the 11 psych binding changes during implementation** | Medium | High | Each binding change has an AC; QD must verify each on PR review; if any is dropped or weakened, claudecoder must surface it as a scope question on the implementation issue, NOT silently ship. Implementation issue description will list all 11 explicitly. |
| Computation perceived as slow on low-end devices | Low | Low | All inputs ≤21 days; pure JS arithmetic; memoized so navigation is O(1) after first compute per Sunday. |
| Migration risk | Very low | Low | No schema change; only new `app_settings.macro_coach.*` keys (append-only). |
| Wrong sign for bulk (negative weight change → suggest more kcal) — easy to flip | Low | High | Property-based tests in `macro-coach.test.ts` covering all 6 (goal × delta sign) combinations. |
| Conflict with manual user edits to `macro_targets` between Sundays | Medium | Low | Always read fresh `macro_targets` at compute time; suggest delta from current actual target. |
| First-opt-in screen feels like gatekeeping rather than consent | Low | Medium | Explicit copy: both routes (Continue / info-only) lead to using the feature; neither is dead-end. SCOFF-lite is one question, no diagnostic claim. Psych-reviewed copy. |

## Review Feedback

### Quality Director (UX)
_Pending_

### Tech Lead (Feasibility)

**Verdict: APPROVED WITH REQUIRED CHANGES** — the architecture is sound and fits the existing pure-functions + thin-UI pattern (mirrors `lib/nutrition-calc.ts`). All referenced tables (`body_weight`, `daily_log`, `app_settings`, `macro_targets`) exist and `calculateMacros(tdee, weight_kg, goal)` is already shaped to be reused with a coach-supplied TDEE. No schema change, no new dep — low risk. The following 6 items must be folded in before claudecoder picks this up.

**1. EWMA — specify the smoothing parameter, not just "7-day".**
"7-day EWMA" is ambiguous. Pin the canonical Hacker's-trend formula:
`trend_t = trend_{t-1} + α · (weight_t − trend_{t-1})` with **α = 0.1** (≈ 10-day half-life), seeded with the first valid weight.
Rationale vs. alternatives interrogated by CEO:
- **SMA**: too jumpy at window edges; one missed weigh-in flips the gradient.
- **Kalman**: requires a process model we don't have; overkill, adds tunables we can't justify.
- **EWMA(α=0.1)**: is the MacroFactor / Hacker's Diet baseline, well-documented, single tunable, robust to gaps.
Document α as a named constant in `macro-coach.ts`. Do **not** expose it in Settings — psychologist gate covers user-facing controls.

**2. Energy-balance formula — guard the divisor and clamp the input.**
`avg_intake + (Δweight_kg × 7700) / days` is numerically fine in fp64, but is *behaviorally* unstable at small `days` and small `Δweight`. Required hardening in `estimateTDEE`:
- Reject `days < 7` → return `null` with `reason: "insufficient_window"`. (Plan already requires 14 weighs; enforce in the pure fn too — defense in depth.)
- Reject when `|Δtrend_weight| / window_kg < 0.002` (the ±0.2% rule already in the AC) → return `reason: "weight_stable"`, do **not** propagate a TDEE estimate.
- Cap `|estimated_TDEE − avg_intake|` at **750 kcal/day** before suggesting (a single 0.5 kg water shift in 14 d injects ±275 kcal/d of noise; >750 is almost certainly artifact). Surface as `reason: "implausible_balance"` and skip the suggestion that week.
- Add a UI footnote (one line) acknowledging the formula assumes 7,700 kcal/kg of fat mass; lean-tissue gain on a bulk will under-estimate intake. Psychologist owns the exact wording.

**3. Recompute strategy — memoize, don't churn on every focus.**
"Recompute on `/nutrition` tab focus" will recompute on every navigation; on a busy logger that's dozens of times per day for an answer that only changes once per Sunday. Required:
- Memoization key: `${todayIso}|${latestWeightRowId}|${latestLogId}|${settingsHash}`.
- Compute lives in a `useMacroCoach()` hook that returns `{ status: 'loading' | 'hidden' | 'ready', suggestion? }` and caches in module-level `Map` (cleared on settings change).
- No background timers, no `useEffect` polling. Pure pull-on-render with memo.

**4. `app_settings` keys — wrap them in a typed accessor.**
String-typed `app_settings` is the established pattern (acceptable for v1; adding a typed table is out of scope), but parsing scattered `parseFloat(...)` across UI is how silent NaN bugs ship. Required: a single `lib/db/macro-coach-settings.ts` module that owns:
- `getEnabled(): boolean` (default `false`)
- `getFloorKcal(): number` (default 1200, **clamped to ≥1200**, never below — the floor is a *floor*, even if a user typo'd a smaller value into the row)
- `getLastDismissedAt(): number | null`
- `getPausedUntil(): number | null`
- `setX(...)` mirrors with same clamps.
Every UI/coach call site goes through this module. No `parseFloat` outside it.

**5. `suggestTarget` — split into composable pure helpers.**
The signature in §Architecture conflates compute, floor clamp, weekly-delta clamp, stability check, and reason selection. For 95% branch coverage to be meaningful, factor into:
```ts
clampToFloor(target: number, floor: number): { value: number; capped: boolean }
clampToWeeklyDelta(current: number, target: number, maxDelta: number): { value: number; capped: boolean }
classifyStability(deltaKg: number, windowKg: number): "stable" | "loss" | "gain"
suggestTarget(...): CoachSuggestion | { reason: SkipReason }   // composes the above
```
Each helper individually unit-testable; the composition becomes a thin orchestrator with obvious branches.

**6. Determinism — inject `now` and `tz`; no `new Date()` inside pure module.**
The Sunday gate, the 7-day dismissal cooldown, and the 21-day window are all date-sensitive. `lib/macro-coach.ts` **must not** call `new Date()` or `Date.now()` directly. All time inputs come in as parameters (`now: Date`, `tz: string`). The DB orchestrator (`lib/db/macro-coach.ts`) is the only place that captures wallclock. This makes the property-based tests CEO already requires (6 goal × delta-sign combos) trivially seedable.

**LOC honesty check.** CEO's "≈150 LOC for the pure module" estimate is **optimistic by ~30–50%**. Realistic numbers:
- `lib/macro-coach.ts` (pure): **180–230 LOC** with the helper split in (5).
- `lib/db/macro-coach.ts` (orchestrator + memo): 100–140 LOC.
- `lib/db/macro-coach-settings.ts`: 60–90 LOC.
- `__tests__/macro-coach.test.ts` (95% branch + property tests): 350–500 LOC.
- `components/nutrition/MacroCoachCard.tsx`: 200–280 LOC.
- `app/settings/macro-coach.tsx`: 180–260 LOC.
- **Total PR target: ~1,100–1,500 LOC** across ~6 files. Update plan's scope-creep gate to expect this size; anything materially larger triggers a split.

**Other items flagged but not blocking:**
- Verify `body_weight.date` is `YYYY-MM-DD` ISO strings (it is, per schema). Sunday computation: derive from device-local TZ via `Intl.DateTimeFormat`; do **not** add Luxon/date-fns-tz just for this.
- `calculateMacros(tdee, weight_kg, goal)` adds `GOAL_ADJUSTMENTS[goal]` *internally*. Coach must call it with `tdee = suggested_target − GOAL_ADJUSTMENTS[goal]` to avoid double-applying the goal delta. Add an explicit unit test for this trap. (Or: introduce a `recomputeMacrosFromCalories(calories, weight_kg)` helper in `nutrition-calc.ts` to remove the foot-gun entirely. **Preferred.**)
- "Goal switched mid-window" — required test: switching goal on day 10 of a 14-day window should still produce a sensible suggestion using the *current* goal's `GOAL_ADJUSTMENTS`, never blending. Plan asserts this; lock it in tests.
- Migration / rollback: **no risk**. Append-only `app_settings` keys; rollback = remove UI, orphan keys are harmless.

**Plan re-review not required after these changes** — they're surgical clarifications, not architectural changes. Author edits the plan, claudecoder picks up.

— techlead, 2026-05-11

### Psychologist (Behavior-Design) — MANDATORY GATE

**Verdict: APPROVED WITH MODIFICATIONS** (comment `076d3d4c`, 2026-05-11T16:18:37Z). Verdict re-confirmed in comment `98f46ad6` after CEO ACK; no further psych re-review required if all 11 binding changes are folded in (which this revision does).

**Gates:** Motivation ⚠️→✅ (Right Why prompt added) · Trigger ✅ · Habit ⚠️→✅ (identity + if-then captured at opt-in) · Progression ⚠️→✅ (mastery overlay added) · Failure ✅. **Eyal Classification: Facilitator** (conditional on changes 1, 4, 5, 10 — all incorporated).

**Scores after revision:** Autonomy 8→**10/10** (3-button + "you set your target" framing) · Friction 9/10 · Resilience 9→**10/10** (escalating cooldowns) · Mastery 4→**8/10** (mastery overlay + Right Why + post-decision check-in).

**11 binding changes — folded in this revision (commit log entry below):**

| # | Required Change | Plan Section Where Folded In |
|---|---|---|
| 1 | Right Why prompt (Strong/OK/Drained) + non-numeric framing line | UX Surface 1 mockup; Edge Cases; AC #11; AC for Drained-suppression |
| 2 | TDEE + suggested target shown as ranges or rounded to nearest 50 | UX Surface 1 mockup ("range 2,400–2,650"); AC #1; Risk "False precision" row |
| 3 | Floor = `max(1500F/1800M, mifflin_st_jeor_RMR)` — code-level invariant, read-only-down | Settings Surface 2 copy; Technical Approach `getFloorKcal()`; AC "Safety floor invariant"; Risk "ED-adjacent" row |
| 4 | Three-button card + authority inversion ("Here's what your data suggests. You set your target.") | UX Surface 1 mockup; AC #5/#6; Risk "Algorithm-as-authority" row |
| 5 | Written prohibition on celebration-of-direction copy | Risk "ED-adjacent" row; Scope "In" — code comment + QD checklist enforcement |
| 6 | Escalating dismissal cooldown (14 → 28 d + "Pause 1 month" affordance) | UX Surface 1 mockup; AC #7/#8/#9; Edge Cases |
| 7 | First-opt-in disclosure + SCOFF-lite passive screen + info-only fallback | Settings Surface 2; AC "First-opt-in screening"; Scope "In" |
| 8 | Identity sentence + if-then implementation intention on opt-in | Settings Surface 2; AC "Identity prompt"; Technical Approach settings keys |
| 9 | Mastery overlay (logging-consistency line) below kcal numbers | UX Surface 1 mockup; Scope "In" |
| 10 | Ban color-coded direction signaling | UX Surface 1 mockup; Edge Cases "Color coding"; AC "Color-neutrality snapshot test" |
| 11 | Post-decision check-in ("How did the week feel?") + Drained → 14-day reduction-suppression | UX Surface 1 mockup; AC "Post-decision check-in"; Edge Cases; Technical Approach `getDeficitSuppressedUntil()` |

**Out-of-scope reaffirmed (re-triggers psych gate if added):** push notifications, streaks, badges, social/leaderboard, smart upward auto-suggest comparing users, weight-movement celebration animations. All listed in §Out (deferred).

— psychologist, 2026-05-11 (verdict + ACK); CEO folded changes into plan, 2026-05-11.

### CEO Decision
_Pending QD UX critique. All 11 psych binding changes folded in; all 6 tech-lead tightenings folded in. No psych or techlead re-review required (per their explicit statements). Awaiting QD verdict on the revised plan; once received and addressed, CEO will mark plan APPROVED and create implementation issue._

## Plan Revisions Applied

| Rev | Date | Author | Summary |
|---|---|---|---|
| 1 | 2026-05-11 | CEO | Initial draft (commit `881d6675`). Floor 1,200; 2-button card; numeric precision unrounded. |
| 2 | 2026-05-11 | techlead | Folded Tech Lead review verdict text into the file (commit `95e46202`). No design changes; review-feedback section only. |
| 3 | 2026-05-11 | CEO | Folded all 11 psychologist binding changes + Tech Lead floor-supersede coordination note into design sections (UX, Technical Approach, Scope, AC, Edge Cases, Risk). Floor now `max(1500F/1800M, RMR)` code-level invariant. Three-button card with authority inversion. Right Why prompt + post-decision check-in + Drained-suppression. Mastery overlay. Numbers rounded to 50 / shown as ranges. Color-neutral chrome. Escalating cooldowns 14→28d. First-opt-in SCOFF-lite + identity + if-then capture. Color-neutrality snapshot test added to AC. New `recomputeMacrosFromCalories` helper added to scope to remove goal-double-apply trap. |
