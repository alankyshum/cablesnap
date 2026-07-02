# Feature Plan: Training-Day Macro Adjustment (rest-day vs workout-day calorie targets)

**Issue**: BLD-2634  **Author**: CEO  **Date**: 2026-07-02
**Status**: **DRAFT** → IN_REVIEW → APPROVED / REJECTED

## Research Source
- **Origin:** Reddit workout-community research via search-web (perplexity/sonar), 2026-07-02 — see BLD-2632 heartbeat. Corroborated by a codebase feasibility map (this run, ses_0dcd160).
- **Pain point observed:** Users manually guess how to adjust calories on training vs rest days ("consuming back half the calories burned is a guessing game"). MacroFactor's anticipated Jan-2026 workout+macro integration highlights unmet demand for seamless workout↔nutrition coupling.
- **Frequency:** Recurring theme across r/fitness / r/nutrition / r/gainit threads, not a one-off. The specific ask is "calorie/carb cycling by training day" — a mainstream nutrition practice (higher intake on training days to fuel/recover, lower on rest days for a weekly deficit) that today requires either a spreadsheet or a paid coach.
- **CableSnap advantage:** We already store BOTH the workout log (`workout_sessions`) AND macro targets (`macro_targets`) locally/offline. We can compute a day-type target with **zero cloud and zero guessing** — paid cloud apps (e.g. MacroFactor overriding Apple Fitness) get this wrong because their calorie-burn signal is noisy estimation. Ours is deterministic: did a real workout get logged on this date, yes/no.

## Problem Statement
CableSnap gives every user a single global calorie/macro target (`macro_targets` singleton). Real lifters who "calorie cycle" want a higher target on training days and a lower one on rest days that still averages out to their weekly goal. Today they must either ignore this practice or manually edit their targets every single day — high friction, error-prone, and directly against our "minimal cognitive load" north star. No competitor solves this well for free/offline. We already own both halves of the data, so we can surface a correct per-day target automatically.

## Behavior-Design Classification (MANDATORY)
Does this shape user behavior? (see CEO §3.2 trigger list: gamification, streaks, notifications, onboarding, rewards, motivational progress viz, social, habit loops, goal-setting/commitments, motivational copy, identity framing, re-engagement)

- [x] **YES** — triggers present:
  - **Goal-setting / commitments** — the feature sets a differentiated daily numeric target the user is implicitly asked to hit.
  - **Progression** — it couples nutrition to training behavior (train → earn more calories), which is a reward-adjacent contingency.
  - **Potential motivational framing** — any copy like "You earned +X kcal for training today" would be an explicit reward loop and MUST be reviewed.
- [ ] NO

> **Psychologist review is MANDATORY (see §3.2).** The core behavioral risk this plan must be scrutinized for: coupling food to exercise can foster a compensatory / "earn-your-food" mindset that is disordered-eating adjacent. The plan below deliberately frames the split as **fuel/recovery periodization**, defaults the feature OFF, uses neutral copy, and avoids any "reward" language — but the psychologist's verdict on framing, defaults, and safety rails is binding.

## User Stories
- As a lifter who calorie-cycles, I want CableSnap to automatically show a higher calorie/carb target on days I train and a lower one on rest days, so that I don't have to edit my macros manually every day.
- As a user, I want the weekly average of my adjusted targets to stay equal to my base/maintenance goal, so that cycling does not silently change my overall energy balance.
- As a user, I want this OFF by default and fully explained before I enable it, so that I am never surprised by a changing target.
- As a user, I want to see clearly on the nutrition screen WHY today's target differs from my base (training day vs rest day), so that the number is never mysterious.

## Proposed Solution

### Overview
A **compute-on-read** adjustment layer. `macro_targets` remains the single source of truth for the user's **base (weekly-average / maintenance) target** — unchanged, never mutated by this feature. A new pure module derives a **per-day effective target** by asking "was `date` a training day?" and applying a user-configured, calorie-neutral split. The nutrition screen already re-derives its view per displayed date, so the adjusted number appears correctly for today and for any date the user navigates to, with **no schema change and no migration**.

This mirrors the existing **Adaptive Macro Coach** architecture (compute suggestions on-read from raw data; only write `macro_targets` on explicit user action), which is the strongest in-repo precedent.

### Calorie-neutral split model (the math)
Let `B` = base daily calories from `macro_targets.calories`. The user picks a **split percentage** `p` (e.g. 15%), bounded to a safe range (proposed **5–25%**, default **10%**). We compute training-day and rest-day targets so the **weekly average equals `B`**, given the user's actual/expected training frequency.

Two candidate models — **reviewers to confirm which ships** (Techlead + Psychologist input wanted):

- **Model 1 — Fixed symmetric delta (simplest, default recommendation):**
  - Training day = `B × (1 + p)`, Rest day = `B × (1 − p)`.
  - Weekly average equals `B` **only if training days ≈ rest days**. For other frequencies the average drifts. Simple and predictable, but not truly neutral for e.g. a 3-day/week lifter.
- **Model 2 — Frequency-balanced (truly calorie-neutral):**
  - Given `n` training days/week (from schedule or a user setting), surplus on training days is fully offset by deficit on rest days: training day = `B + S`, rest day = `B − S × n/(7−n)`, where `S = B × p` is the per-training-day surplus. Weekly total = `7B` exactly for any `n` (1 ≤ n ≤ 6).
  - **CEO lean: Model 2** — it delivers the actual user promise ("cycle without changing my weekly intake"). Model 1 is a fallback if reviewers judge Model 2's rest-day deficit too aggressive at high `p`/low `n` (mitigated by the calorie floor below).

**Safety floor (hard, non-negotiable):** the rest-day target is clamped to `CALORIE_FLOOR` (1200 kcal, already defined in `lib/nutrition-calc.ts:50`). If the computed rest-day target would fall below the floor, clamp it and **surface a non-blocking notice** that the split was capped (so the displayed average may exceed `B`). This reuses the exact `belowFloor` pattern the Macro Coach already uses.

**Macro split:** once the per-day calorie number is computed, derive protein/carb/fat via the existing **`recomputeMacrosFromCalories(calories, weight_kg)`** (`lib/nutrition-calc.ts:105`) — NEVER `calculateMacros` (avoids the documented goal-double-apply trap). Protein is held ~constant (bodyweight-driven); the calorie delta lands mostly on carbs, which matches the real-world "carb cycling" mental model and is nutritionally sound for training-day fueling.

### "Training day" definition
A date is a **training day** if a real workout was logged on it:
`completed_at IS NOT NULL AND kind = 'workout'` with `started_at` on that local date.
- **MUST filter `kind = 'workout'`** to exclude Grease-the-Groove `day_session` rows (BLD-1089; guarded by `__tests__/lib/db/streak-creep-production.test.ts`). Counting GTG as a training day would wrongly inflate calories.
- New DB helper `wasWorkoutDay(dateKey)` (or `getWorkoutDaysInRange(start, end)` for batch), modeled on the correctly-filtered `getMonthlyTrainingDaysAndStreak` query (`lib/db/monthly-report.ts:231`).
- **Actual vs scheduled (decision point):** v1 uses **actual logged workouts** (deterministic, no dependency on having an active program). A future enhancement could offer "scheduled training day" via `program_schedule`. Out of scope for v1 — noted so reviewers don't expect it.
- **Today, mid-day, not-yet-trained:** before a workout is logged, "today" is treated as a rest day and the target updates the moment the workout is logged and the screen refocuses. This edge case is explicitly called out in Edge Cases and needs psychologist input on framing (we must NOT imply the user "failed" to earn calories).

### Frequency input for Model 2
`n` (expected training days/week) is needed for the neutral split. Sources, in priority order:
1. Explicit user setting in the feature's settings screen (slider 1–6), **default 4**.
2. If a program schedule exists, offer to prefill `n` from `program_schedule` distinct training weekdays.
This keeps the feature usable with zero program setup while letting power users bind it to their plan.

### UX Design
- **Settings screen** `app/settings/training-day-macros.tsx` — copy the structure of `app/settings/macro-coach.tsx` (573 lines: `Switch` toggle at :377, opt-in explanation flow, numeric parameter input, `Stack.Screen options={{title}}`). Contains:
  - Master `Switch` (default OFF).
  - A plain-language explanation of calorie cycling and that the weekly average is preserved (Model 2) — psychologist to approve copy.
  - Split percentage control (5–25%, default 10%).
  - Training-days-per-week control (1–6, default 4) with optional "use my program schedule" prefill.
  - A live preview: "Training day: 2,530 kcal · Rest day: 2,180 kcal · Weekly avg: 2,400 kcal (= your base)".
  - A clear statement that the base target is set elsewhere and is unchanged.
- **Settings tab entry** — add a `SettingsTile` under the existing "Coaching" section in `app/(tabs)/settings.tsx` (mirror the macro-coach tile at :270–284).
- **Nutrition screen indicator** — in `components/nutrition/NutritionListHeader.tsx` (the macro summary card, "Edit Targets →" at :123), when the feature is ON, show a small neutral badge/label near the calorie row indicating the day type driving today's number, e.g. `Training day` / `Rest day`, plus an affordance to see the base. Copy MUST be neutral (no "earned"/"bonus"/"penalty"). Tapping it can explain "Higher target because you trained today — your weekly average is unchanged."
- **Empty/OFF state:** when OFF, the nutrition screen shows base targets exactly as today — zero visual change. No badge.
- **Interaction with MacroTargetsSheet:** the manual editor continues to edit the BASE target. Add one line of helper text when the feature is ON: "This is your base target. Training/rest-day adjustment is applied on top — manage it in Settings › Training-Day Macros."
- **A11y:** badge has a descriptive `accessibilityLabel` ("Today is a training day; calorie target increased, weekly average unchanged"). Reduced-motion respected (no animation on the badge). All new controls meet 44dp effective targets.

### Technical Approach
- **No schema change, no migration.** `macro_targets` stays the base singleton.
- **New settings module** `lib/db/training-day-settings.ts` — mirror `lib/db/macro-coach-settings.ts` exactly: `PREFIX = "training_day_macros."`, typed getters/setters over `getAppSetting`/`setAppSetting`. Keys (proposed): `enabled` ("1"/"0"), `split_percent` (number, clamped 5–25), `training_days_per_week` (number, clamped 1–6), `model` ("frequency_balanced" | "fixed_symmetric"). This module is the ONLY reader/writer of `training_day_macros.*`. Auto round-trips through backup under the `app_preferences` category (per `import-export.ts:239`) — no import/export change needed.
- **New pure module** `lib/training-day-macros.ts` — mirror `lib/macro-coach.ts`'s clock-injection discipline (NO `Date.now()`/`new Date()` internally; inject `now`/date; grep-enforced by `__tests__/architecture-formula-ban.test.ts`). Core function e.g.:
  `computeEffectiveTargets(base: MacroTargets, isTrainingDay: boolean, params: TrainingDaySettings, weightKg: number): MacroTargets & { dayType, adjusted: boolean, cappedByFloor: boolean }`.
  Pure, fully unit-tested (property tests à la `__tests__/macro-coach.test.ts`). Reuses `recomputeMacrosFromCalories` and `CALORIE_FLOOR` from `nutrition-calc.ts`.
- **New DB helper** `wasWorkoutDay(dateKey)` / `getWorkoutDaysInRange(start,end)` in the sessions/stats DB layer — filters `completed_at IS NOT NULL AND kind = 'workout'`; models `getMonthlyTrainingDaysAndStreak` (`monthly-report.ts:231`). Weight for the macro split comes from the latest `body_weight` row or `nutrition_profile.weight`.
- **Read-path wiring** — in `hooks/useNutritionData.ts:load()` (verified at :54–78): after `getMacroTargets()` (:59), if the feature is enabled, wrap the result with `computeEffectiveTargets` using `wasWorkoutDay(formatDateKey(date.getTime()))` (the displayed date is already computed at :55). The screen re-derives on `useFocusEffect` (:80) and after every mutation, and supports arbitrary date navigation (`prev`/`next` at :87–88) — so per-day correctness and post-workout refresh come **for free**. Expose `dayType`/`adjusted` alongside `targets` for the header badge.
- **Coexistence with Adaptive Macro Coach (PRIMARY RISK):** the Coach reads/writes the SAME `macro_targets` singleton and its TDEE estimation averages logged intake. Because this feature is **compute-on-read and never writes `macro_targets`**, the Coach's base is untouched — they do not fight over the stored value. BUT two second-order interactions need explicit handling and reviewer sign-off:
  1. **Coach TDEE estimation vs. cycled intake:** if a user eats to a cycled target (more on training days), the Coach's intake-averaging still sees the weekly average (Model 2 preserves it), so estimation should remain valid. This must be verified — if the Coach reads *targets* rather than *logged intake* anywhere, cycling could perturb it.
  2. **Two badges / conflicting narratives:** the Coach card and the training-day badge could both explain the target. UX must ensure they read coherently (Coach adjusts the BASE weekly; training-day adjusts WITHIN the week). Techlead + QD to confirm no display conflict.
- **Memoization (optional):** if the effective-target computation is memoized, key it on `dateKey | base.updated_at | settingsHash | workoutDaySignature` and clear on settings write, mirroring `clearMacroCoachMemo()`.
- **Dependencies:** none new.

## Scope
**In (v1):**
- Settings screen + toggle (default OFF) + split% + training-days/week + live preview.
- Compute-on-read effective daily target (calorie-neutral, Model 2 recommended) with floor clamp.
- `wasWorkoutDay` DB helper (actual logged workouts, `kind='workout'` filtered).
- Nutrition-header day-type badge + explanation, neutral copy.
- Full unit tests (pure module + settings module), DB-helper tests, component tests, backup round-trip confirmation.

**Out (v1):**
- Scheduled-training-day mode (via `program_schedule`) — future enhancement.
- Per-macro (protein/carb-specific) custom cycling beyond the standard `recomputeMacrosFromCalories` split.
- Retroactive rewriting of historical days' targets (targets are derived on view, not stored per-day; history shows the base unless we later persist snapshots — explicitly out).
- Any push notification / reminder tied to day type (would add a new §3.2 trigger; separate plan + psych review).
- Any "you earned N calories" reward messaging (explicitly excluded on behavioral-safety grounds).
- Integration with external calorie-burn estimates (HealthKit/Google Fit) — deterministic logged-workout signal only.

## Acceptance Criteria

> **AC audit note:** DRAFT plan under Phase-1 review. Per the Feature Lifecycle, AC tests are authored during Phase 5 implementation. Each AC carries a `[gate: ...]` marker; the implementing PR replaces these with concrete `[test: <path>]` references before merge.

- [ ] **AC1 (default off):** Given a user who has never opened the feature, When they view the nutrition screen, Then targets equal the base `macro_targets` with no day-type badge and no behavior change. [gate: plan-in-review]
- [ ] **AC2 (training-day target):** Given the feature enabled with split `p` and `n` training days/week (Model 2), When the displayed date has a logged workout (`completed_at NOT NULL AND kind='workout'`), Then the calorie target = `B + B×p` (rounded) and macros are derived via `recomputeMacrosFromCalories`. [gate: plan-in-review]
- [ ] **AC3 (rest-day target):** Given the same config, When the displayed date has NO qualifying workout, Then the calorie target = `B − B×p×n/(7−n)` (rounded), clamped to ≥1200 kcal. [gate: plan-in-review]
- [ ] **AC4 (weekly neutrality):** Given Model 2 and any `n` in 1..6 with no floor clamping, When summing 7 days' effective targets (n training + (7−n) rest), Then the total equals `7×B` within rounding tolerance. [gate: plan-in-review — property test]
- [ ] **AC5 (floor clamp):** Given a config where the rest-day target would fall below 1200 kcal, When computed, Then it is clamped to 1200 and a non-blocking "capped" notice is exposed; the app does not crash and no NaN/negative macro appears. [gate: plan-in-review]
- [ ] **AC6 (GTG exclusion):** Given a date with ONLY a `kind='day_session'` (Grease-the-Groove) row and no `kind='workout'` row, When evaluated, Then the date is treated as a REST day (not a training day). [gate: plan-in-review]
- [ ] **AC7 (base untouched):** Given the feature enabled and any day-type computation, When inspecting the `macro_targets` row, Then its stored values are unchanged (feature never writes it). [gate: plan-in-review]
- [ ] **AC8 (per-day navigation):** Given the feature enabled, When the user navigates prev/next across dates with mixed workout history, Then each day shows the correct day-type target and badge. [gate: plan-in-review]
- [ ] **AC9 (post-workout refresh):** Given "today" started as a rest day, When the user logs and completes a workout and the nutrition screen refocuses, Then today's target updates to the training-day value. [gate: plan-in-review]
- [ ] **AC10 (clock injection):** The pure module contains no `Date.now()`/`new Date()` (passes `architecture-formula-ban` grep test); all time comes from injected params. [gate: CI]
- [ ] **AC11 (backup round-trip):** Given the feature configured, When a backup is exported and re-imported, Then `training_day_macros.*` settings round-trip (under `app_preferences`). [gate: plan-in-review]
- [ ] **AC12 (Macro Coach coexistence):** Given both the Adaptive Macro Coach and this feature enabled, When both render, Then the Coach's base logic is unaffected (no double-write to `macro_targets`) and the two on-screen narratives do not contradict. [gate: plan-in-review + QD manual/e2e]
- [ ] **AC13 (a11y):** The day-type badge exposes a descriptive `accessibilityLabel`; all new controls have ≥44dp effective targets; reduced-motion respected. [gate: plan-in-review]
- [ ] **AC14 (copy):** All user-facing copy is neutral (no "earned/bonus/penalty/reward"); psychologist-approved strings are used verbatim. [gate: psychologist sign-off]
- [ ] **AC15:** PR passes all tests with no regressions; no new lint warnings. [gate: CI]

### Headless Verification Path (MANDATORY — device/manual ACs)
This feature is fully unit/logic-testable and web-viewport-testable at the 390×844 baseline. The math (AC2–AC5, AC10), day-type classification (AC6), read-path wiring (AC7–AC9), and backup (AC11) are all pure/DB-layer and covered by jest without a device. The only inherently experiential ACs are badge ergonomics/legibility and Coach coexistence narrative — proxied below.

| Device/Manual AC | Risk it covers | Headless proxy that satisfies the same risk |
|------------------|----------------|---------------------------------------------|
| "Day-type badge is legible / not cramped on a real phone" (AC13) | Layout/contrast regression on device | jest render snapshot of `NutritionListHeader` in training/rest/OFF states at 390px; assert badge present + `accessibilityLabel` + contrast token usage |
| "Target updates feel immediate after logging a workout" (AC9) | Perceived staleness / missed refocus refresh | Unit test: `computeEffectiveTargets` returns training value once `wasWorkoutDay` is true; hook test asserts `load()` re-runs on focus and re-reads day type; e2e (Maestro) logs a workout then asserts nutrition target changed |
| "Coach + training-day badge read coherently" (AC12) | Conflicting on-screen narratives | Component test rendering both `MacroCoachCard` and the day-type badge together asserting distinct, non-contradictory copy; DB test asserting no write to `macro_targets` from the training-day path |
| "Cycling doesn't secretly change my weekly intake" (AC4) | User trust / silent energy-balance drift | Property test summing 7 days = 7×B for all n∈1..6 (no device needed) |

No device-only AC remains un-proxied. A physical-device confirmation of badge feel is a nice-to-have and is **pre-authorized as a waiver here** (not a merge blocker).

## Edge Cases
| Scenario | Expected |
|----------|----------|
| Feature OFF | Base targets shown; zero visual change; no badge |
| No `macro_targets` yet | Lazy default row inserted (existing behavior); split applies to defaults; still neutral |
| No workouts ever logged | Every day is a rest day → user sees rest-day target daily; settings preview still shows both values |
| Today, before logging a workout | Treated as rest day; flips to training day when workout completes + screen refocuses. Copy must NOT imply failure to "earn" calories (psych-reviewed) |
| Only a GTG (`day_session`) logged today | Rest day (kind filter) — AC6 |
| Rest-day target below 1200 kcal | Clamped to 1200; non-blocking "capped" notice; weekly average may exceed base (documented) |
| `n = 7` (trains every day) | Model 2 undefined (÷0). Guard: if `n ≥ 7`, disable cycling (every day is a training day → no rest day to offset) and show an explainer. Clamp `n` to 1..6 in the setter |
| `n = 0` | Guard/clamp to minimum 1; if truly 0 training days, feature is inert (all rest days) |
| Very high split % + low n | Rest-day deficit large → floor clamp engages; notice shown |
| Timezone / day boundary | Uses local-date keys consistently (`formatDateKey` JS-side, `date(...,'localtime')` SQL-side) — matches existing `daily_log.date` convention |
| Adaptive Macro Coach also enabled | No double-write (compute-on-read); narratives coordinated — AC12 |
| Manual target edit while feature on | Edits BASE; helper text clarifies adjustment is applied on top |
| Historical date view | Shows that date's day-type target derived from that date's logged workouts; base unchanged |
| Screen reader / reduced motion | Descriptive label; no animation — AC13 |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| **Behavioral harm: "earn your food" / compensatory-eating mindset** | Medium | **High** | Default OFF; framed as fuel/recovery periodization not reward; neutral copy (no "earned/bonus"); mandatory psychologist gate on framing, defaults, and safety rails; explicit exclusion of reward messaging and day-type notifications |
| Coexistence conflict with Adaptive Macro Coach | Medium | Medium | Compute-on-read never writes `macro_targets`; AC12 verifies base untouched + coherent narrative; techlead traces whether Coach reads targets vs logged intake |
| Weekly average silently drifts (Model 1) | Medium | Medium | Recommend Model 2 (frequency-balanced, exactly neutral); AC4 property test; floor-clamp notice when neutrality is intentionally broken |
| Rest-day target unsafely low | Low | High | Hard `CALORIE_FLOOR` (1200) clamp reusing existing pattern; capped notice |
| GTG rows inflate training days | Medium | Medium | `kind='workout'` filter (AC6); reuse the correctly-filtered monthly-report query; regression test |
| User confusion about changing number | Medium | Low | Always-visible day-type badge + one-tap explanation; live preview in settings; helper text in manual editor |
| `n=7`/`n=0` division/degenerate config | Low | Medium | Clamp `n` to 1..6; disable cycling at extremes with explainer (edge cases) |
| Scope creep (scheduled days, notifications, HealthKit) | Medium | Low | Explicitly out-of-scope; future plans |

## Review Feedback
### Quality Director (UX)
_Pending_

### Tech Lead (Feasibility)
_Pending_

### Psychologist (Behavior-Design)
_Pending — Classification = YES. Mandatory gate. Focus: compensatory-eating risk, framing/copy, default-off, safety rails, and the "today-before-workout" narrative._

### CEO Decision
_Pending_
