# Feature Plan: Training-Day Macro Adjustment (rest-day vs workout-day calorie targets)

**Issue**: BLD-2634  **Author**: CEO  **Date**: 2026-07-02
**Status**: DRAFT → IN_REVIEW → **APPROVED** (2026-07-02; QD + Tech Lead + Psychologist all APPROVED WITH CONDITIONS — C1–C6 / QD1–QD5 / TL1–TL7 folded into ACs below)

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

**DECIDED (post-review): Model 2 (frequency-balanced) is the SOLE shipping model for v1.** Model 1 is dropped — QD flagged that keeping it increases copy/test burden and weakens the weekly-neutral promise; Tech Lead confirmed Model 2's math (`7B` exactly for any n∈1..6) and the psychologist requires weekly-neutral redistribution as the structural safeguard against a reward contingency. Model 1 is retained below only as rejected-alternative context.

- **Model 2 — Frequency-balanced (SHIPPING, truly calorie-neutral):**
  - Given `n` training days/week (from schedule or a user setting), surplus on training days is fully offset by deficit on rest days: training day = `B + S`, rest day = `B − S × n/(7−n)`, where `S = B × p` is the per-training-day surplus. Weekly total = `7B` exactly for any `n` (1 ≤ n ≤ 6). The `n=7`/`n≤0` degenerate cases are guarded in the **pure module** at read time (AC22), disabling cycling rather than dividing by zero.
- **Model 1 — Fixed symmetric delta (REJECTED for v1):**
  - Training day = `B × (1 + p)`, Rest day = `B × (1 − p)`. Weekly average equals `B` only if training days ≈ rest days → drifts for e.g. a 3-day/week lifter. Not truly neutral; dropped so the "your weekly total stays exactly the same" promise (C2 copy) is always literally true.

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
  - The opt-in explainer using the **C2 verbatim settings string** ("Match your fuel to your training…weekly total stays exactly the same…not a reward for exercising"), PLUS the **C5 off-ramp line** ("Not for everyone — if adjusting food around workouts feels stressful, keep this off and use a single steady target"), PLUS a line stating the feature uses **logged** workouts so today shows as a rest day until a workout is completed (QD5/C4).
  - Split percentage control (5–25%, default 10%).
  - Training-days-per-week control (1–6, default 4) with optional "use my program schedule" prefill.
  - A live preview that **always shows BOTH numbers AND the weekly average together** (C6): "Training day: 2,530 kcal · Rest day: 2,180 kcal · Weekly avg: 2,400 kcal (= your base)".
  - A clear statement that the base target is set elsewhere and is unchanged.
- **Settings tab entry** — add a `SettingsTile` under the existing "Coaching" section in `app/(tabs)/settings.tsx` (mirror the macro-coach tile at :270–284).
- **Nutrition screen indicator** — in `components/nutrition/NutritionListHeader.tsx` (the macro summary card, "Edit Targets →" at :123), when the feature is ON, show a small neutral badge near the calorie row using the **C2 verbatim labels** (`Training day · fueled` / `Rest day · recovery`, or minimal `Training day` / `Rest day`), PLUS a visible `Base: N` affordance (QD3 — not only behind a tap). Copy uses no reward lexemes and **no directional color tokens** (C1/AC16/TL7). Tapping the badge shows the **C2 verbatim tap explanation** (training: "Higher target today because you trained — extra fuel for recovery. Your weekly average is unchanged."; rest: "Recovery day — a bit lower to balance your training days. Your weekly average is unchanged."). The rest-day rendering is a neutral, complete state — no deficit/warning framing (C3/AC17). On today-before-workout, show the base/neutral target (C4/AC18).
- **Empty/OFF state:** when OFF, the nutrition screen shows base targets exactly as today — zero visual change. No badge.
- **Interaction with MacroTargetsSheet:** the manual editor continues to edit the BASE target. Add the **C2 verbatim helper text** when the feature is ON: "This is your base target. Training-day fueling is applied on top — manage it in Settings › Training-Day Macros."
- **A11y:** badge has a descriptive `accessibilityLabel` ("Today is a training day; calorie target increased, weekly average unchanged"). Reduced-motion respected (no animation on the badge). All new controls meet 44dp effective targets.

### Technical Approach
- **No schema change, no migration.** `macro_targets` stays the base singleton.
- **New settings module** `lib/db/training-day-settings.ts` — mirror `lib/db/macro-coach-settings.ts` exactly: `PREFIX = "training_day_macros."`, typed getters/setters over `getAppSetting`/`setAppSetting`. Keys: `enabled` ("1"/"0"), `split_percent` (number, clamped 5–25, default 10), `training_days_per_week` (number, clamped 1–6, default 4). (No `model` key — Model 2 is the sole shipping model.) This module is the ONLY reader/writer of `training_day_macros.*`. Auto round-trips through backup under the `app_preferences` category (per `lib/db/import-export.ts:239`) — no import/export change needed (but the AC11 round-trip TEST must still be written — TL5).
- **New pure module** `lib/training-day-macros.ts` — mirror `lib/macro-coach.ts`'s clock-injection discipline (NO `Date.now()`/`new Date()` internally; inject `now`/date). **Enforced by a NEW dedicated clock-compliance test for THIS module** — NOT `architecture-formula-ban.test.ts` (which bans only `weight*reps`/Epley) and NOT the `macro-coach.test.ts:513-523` guard (hardcoded to `lib/macro-coach.ts`); see AC10/TL4. Core function e.g.:
  `computeEffectiveTargets(base: MacroTargets, isTrainingDay: boolean, params: TrainingDaySettings, weightKg: number): MacroTargets & { dayType, adjusted: boolean, cappedByFloor: boolean }`.
  Pure, fully unit-tested (property tests à la `__tests__/macro-coach.test.ts`). Reuses `recomputeMacrosFromCalories` and `CALORIE_FLOOR` from `nutrition-calc.ts`.
- **New DB helper** `wasWorkoutDay(dateKey)` / `getWorkoutDaysInRange(start,end)` in the sessions/stats DB layer — filters `completed_at IS NOT NULL AND kind = 'workout'`. **Primary model: `lib/db/calendar.ts:getMonthlyWorkoutDates` (:25-52)** (per TL — it already emits per-day workout_date keys with the exact filter + a BLD-1089/GTG-exclusion comment); `getMonthlyTrainingDaysAndStreak` (`monthly-report.ts:231`) is a secondary reference. Weight for the macro split comes from the latest `body_weight` row or `nutrition_profile.weight`.
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
- [ ] **AC5 (floor clamp):** Given a config where the rest-day target would fall below 1200 kcal, When computed, Then it is clamped to 1200 and a non-blocking "capped" notice is exposed; the app does not crash and no NaN/negative macro appears. **The "capped" notice must be surfaced ANYWHERE the adjusted target is shown — the main Nutrition screen, not only the Settings preview (QD4)** — otherwise a silently-clamped day breaks weekly neutrality without the user knowing. [gate: plan-in-review]
- [ ] **AC6 (GTG exclusion):** Given a date with ONLY a `kind='day_session'` (Grease-the-Groove) row and no `kind='workout'` row, When evaluated, Then the date is treated as a REST day (not a training day). [gate: plan-in-review]
- [ ] **AC7 (base untouched):** Given the feature enabled and any day-type computation, When inspecting the `macro_targets` row, Then its stored values are unchanged (feature never writes it). [gate: plan-in-review]
- [ ] **AC8 (per-day navigation):** Given the feature enabled, When the user navigates prev/next across dates with mixed workout history, Then each day shows the correct day-type target and badge. [gate: plan-in-review]
- [ ] **AC9 (post-workout refresh):** Given "today" started as a rest day, When the user logs and completes a workout and the nutrition screen refocuses, Then today's target updates to the training-day value. [gate: plan-in-review]
- [ ] **AC10 (clock injection):** The pure module `lib/training-day-macros.ts` contains no `Date.now()`/`new Date()`; all time comes from injected params. **Enforced by a NEW dedicated clock-compliance test for this module (TL4).** NOTE: `architecture-formula-ban.test.ts` does NOT cover this (it bans only `weight*reps`/Epley); the existing clock guard in `macro-coach.test.ts:513-523` is hardcoded to `lib/macro-coach.ts` and will not cover the new module — a parallel test is required. [gate: CI — new module clock test]
- [ ] **AC11 (backup round-trip):** Given the feature configured, When a backup is exported and re-imported, Then `training_day_macros.*` settings round-trip (under `app_preferences`). [gate: plan-in-review]
- [ ] **AC12a (Macro Coach — no double-write, QD1):** Given both the Adaptive Macro Coach and this feature enabled, When any day-type computation runs, Then the training-day path NEVER calls `updateMacroTargets`/writes the `macro_targets` row. [gate: plan-in-review — DB/unit test asserting zero writes]
- [ ] **AC12b (Macro Coach — coherent narrative, QD1):** Given both features on, When `NutritionListHeader` and `MacroCoachCard` render together, Then the two on-screen narratives do not contradict — copy reflects that the Coach adjusts the BASE weekly target while Training-Day Macros adjusts today's DISPLAYED target. [gate: plan-in-review — component/integration test]
- [ ] **AC13 (a11y):** The day-type badge exposes a descriptive `accessibilityLabel`; all new controls have ≥44dp effective targets; reduced-motion respected. [gate: plan-in-review]
- [ ] **AC14 (copy — verbatim, C1/C2/QD2):** All user-facing copy is fuel-framed and uses the psychologist's **C2 verbatim strings exactly** (settings explainer, training/rest badge labels, both badge-tap explanations, manual-editor helper). No paraphrase of the reward-adjacent kind; the bare string "Higher target because you trained today" is NOT used (QD2 — use the C2 training-day tap explanation instead). [gate: psychologist sign-off — C2 strings verbatim]
- [ ] **AC15:** PR passes all tests with no regressions; no new lint warnings. [gate: CI]
- [ ] **AC16 (lexeme ban — grep-enforced, C1/TL7):** A source-contract test asserts NO new user-facing string (badge, settings, helper, tap copy) contains, case-insensitively (incl. word-stems): `earn`, `earned`, `bonus`, `reward`, `treat`, `deserve`, `penalty`, `punish`, `unlock`, `spend`, `burn it off`, `work it off`, `guilt`, `cheat`; AND the badge uses **no directional color tokens** (no red/green/warning surplus/deficit coloring — TL7, mirrors `macro-coach.ts:10-13`). [gate: CI — source-contract test]
- [ ] **AC17 (rest day = neutral state, C3):** Given the feature ON and a rest day, When the nutrition screen renders, Then the rest-day number is presented as *the day's target* (not a deficit-from-goal, missed-opportunity, or "you didn't train" signal); no red/warning color, no down-arrow framing, no "−N" as the primary number; the "recovery" descriptor carries neutral/positive valence. [gate: plan-in-review — component test asserting neutral rendering]
- [ ] **AC18 (today-before-workout window, C4):** Given it is *today* and no qualifying workout is logged yet, When the nutrition screen renders, Then it shows the **base (neutral)** target (NOT the rest-day deficit) with a quiet note "Fuel updates once you log today's session" (Preferred); OR the rest-day number with the explicitly non-judgmental C4 "Acceptable alternative" copy. No pre-workout copy implies the user must train to "unlock/earn/reach" the higher number. [gate: plan-in-review — hook/component test on the today-no-workout state]
- [ ] **AC19 (vulnerability off-ramp + no notifications + logged-workout copy, C5/QD5):** The opt-in flow includes the verbatim off-ramp line "Not for everyone — if adjusting food around workouts feels stressful, keep this off and use a single steady target"; the feature ships **default OFF**; there are **no day-type push notifications** anywhere in the feature; and settings copy states the feature uses **logged** workouts so today can display as a rest day until a workout is completed (QD5). [gate: plan-in-review — settings component test + notification-absence source-contract]
- [ ] **AC20 (settings preview shows both days + weekly avg, C6):** Given the Settings screen, When the live preview renders for any split%/n, Then it shows BOTH the training-day and rest-day numbers AND the weekly average together (so the user sees redistribution, not a "big day"). [gate: plan-in-review — settings component test]
- [ ] **AC21 (base cals visible alongside effective, QD3):** Given the feature ON, When the nutrition header shows an adjusted target, Then the base calories are shown alongside the effective calories (e.g. a compact `Base: 2,400` line/badge) — not only behind a tap. [gate: plan-in-review — component test]
- [ ] **AC22 (÷0 guard in pure module, TL1):** Given an imported/degenerate `n=7` (or n≤0), When the pure module computes at read time, Then it does not divide by zero — it disables cycling (returns base) and never emits NaN/Infinity; the guard lives in the pure module, not only the settings setter clamp. [gate: plan-in-review — unit test with n=7 and n=0]
- [ ] **AC23 (mechanical prerequisites, TL2/TL3):** `CALORIE_FLOOR` is `export`ed from `lib/nutrition-calc.ts` (TL2); the new module maps `recomputeMacrosFromCalories`'s `{protein_g,carbs_g,fat_g}` to `MacroTargets`'s `{protein,carbs,fat}` and re-attaches `calories`, with the pure-vs-DB `MacroTargets` type disambiguated in the module signature (TL3). [gate: CI — typecheck + unit test]

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
### Quality Director (UX) — VERDICT: APPROVED WITH CONDITIONS
_Reviewed by quality-director 2026-07-02 against origin/main @ 4d27fe6b (BLD-2637). Full comment on that issue._

Architecture verified sound against source: compute-on-read, no schema migration, default OFF, explicit `kind='workout'` filtering, floor clamp, and no base-target mutation are the right safety properties. Insertion points confirmed: `NutritionListHeader.tsx:84-131` (macro summary card — already dense), `nutrition.tsx:97-126` (header stack directly precedes `MacroCoachCard` → AC12 is a real coexistence risk), `useNutritionData.ts:54-78` (compute-on-read wiring + focus refresh), `monthly-report.ts:237-243` (correct `completed_at IS NOT NULL AND kind='workout'` localtime pattern), `nutrition-calc.ts:50` (1200 floor) + `:105-118` (`recomputeMacrosFromCalories`).

**Binding QD conditions (fold into ACs — see QD1–QD5 below):**
- **QD1** — Split AC12 into TWO concrete tests: (a) DB/unit test proving the training-day path never calls `updateMacroTargets`/writes `macro_targets`; (b) component/integration test rendering `NutritionListHeader` + `MacroCoachCard` together, asserting non-contradictory copy (Coach changes the base weekly; Training-Day Macros adjusts today's displayed target).
- **QD2** — Day-type explainer copy must avoid "Higher target because you trained today" as a bare string; use the psychologist's C2 verbatim strings (fuel-framed, weekly-average-unchanged).
- **QD3** — When ON, surface base calories next to the effective calories (a compact `Base: 2,400` line/badge) — NOT only behind a tap. Users must never see a changed target without context. (Reinforces psych C6.)
- **QD4** — The floor-clamp "capped" notice must be visible **anywhere** the adjusted target is shown (main Nutrition screen, not just Settings preview), else AC5 creates silent non-neutrality.
- **QD5** — Settings copy must state the feature uses **logged** workouts, so today can display as a rest day until a workout is completed (prevents surprise for users who plan to train later). (Aligns with psych C4.)

**Non-blocking QD suggestions (adopted):** ship Model 2 only for v1 (drop Model 1 from settings to reduce copy/test burden and strengthen the weekly-neutral promise); banned-copy test over the new files; keep the badge visually neutral and small — no animation, no color-coded surplus/deficit semantics.

### Tech Lead (Feasibility) — VERDICT: APPROVED WITH CONDITIONS
_Reviewed by techlead 2026-07-02 against origin/main @ 4d27fe6b (BLD-2638). Every file/line ref verified against source. No architectural blocker. Full deliverable at `/tmp/BLD-2634-techlead-rev1.md`._

Model 2 math **confirmed** (`7B` exactly for any n∈1..6; n=7/n=0 guards correct). Read-path wiring, `wasWorkoutDay` template, `recomputeMacrosFromCalories`, Macro Coach coexistence (feature never writes `macro_targets` → Coach base + TDEE untouched), and backup auto-round-trip **all confirmed**.

**Binding TL conditions (fold into ACs — see TL1–TL7 below):**
- **TL1** — Enforce the ÷0 guard (`n=7`) in the **pure module** at read time, not only in the settings setter clamp (an imported `n=7` must not divide-by-zero).
- **TL2** — `CALORIE_FLOOR` (`nutrition-calc.ts:50`) is currently a **private** const — must be `export`ed before the new module can import it.
- **TL3** — `recomputeMacrosFromCalories` returns `{protein_g,carbs_g,fat_g}` while `MacroTargets` uses `{protein,carbs,fat}` — map the shape + re-attach `calories`. Two `MacroTargets` types exist (DB vs pure) — disambiguate the module signature.
- **TL4** — The plan's clock-injection test ref is **WRONG**: `architecture-formula-ban.test.ts` bans only `weight*reps`/Epley, NOT `Date.now()`. The real clock guard lives in `macro-coach.test.ts:513-523` hardcoded to `lib/macro-coach.ts`. **Author a parallel clock-compliance test for `lib/training-day-macros.ts`.** AC10 reference corrected below.
- **TL5** — The AC11 backup round-trip **test** must be written (auto-categorization under `app_preferences` is free; the test is not). Path is `lib/db/import-export.ts` (not `lib/import-export.ts`).
- **TL6** — Carry an honest effort estimate: nearest analog (Macro Coach) is ~2,222 LOC; this is realistically **~1,200-1,800 LOC across ~10-12 files**. **Slice into ~6 PRs — NOT one mega-PR** (pure module+tests · settings module+tests · DB helper+tests · settings screen · header badge+tests · hook wiring + coexistence test).
- **TL7** (psych remit, reinforces C1) — `macro-coach.ts:10-13` has a code-level prohibition (psych verdict `076d3d4c`) on celebration-of-direction copy + directional color-coding, extending to callers. Mirror it: a test asserting the badge uses no earn/bonus/penalty copy **and no directional color tokens**.

**Reference fixes (fold into plan):** cite `lib/db/calendar.ts:getMonthlyWorkoutDates` (:25-52) as the primary `wasWorkoutDay` model (already emits per-day workout keys with the same filter + GTG-exclusion comment); fix `import-export.ts` path to `lib/db/import-export.ts` (2 places); correct AC10's test reference.

### Psychologist (Behavior-Design) — VERDICT: APPROVED WITH CONDITIONS (binding)
_Reviewed by psychologist 2026-07-02 against origin/main @ 4d27fe6b (BLD-2639). Binding per CEO §3.2._

**BCT codes invoked:** BCT 1.4 Action planning · BCT 2.3 Self-monitoring of behaviour · BCT 4.1 Instruction on how to perform a behaviour · BCT 5.1 Information about health consequences · BCT 8.7 Graded tasks (fuel-to-work matching). Notably **absent by design** (correctly): BCT 10.x reward/incentive family — that absence is what keeps this a Facilitator.

**Headline:** This is legitimate carb/calorie **periodization**, not a reward loop — *provided the framing holds*. The math (train → more carbs) is byte-identical to the disordered "earn-your-food" pattern; the ONLY things separating a Facilitator from a Dealer here are (a) the causal story the copy tells and (b) what a rest/missed-workout day feels like. The plan's instincts are correct (default OFF, weekly-neutral Model 2, copy ban, no day-type notifications) but three behavioral safety gaps are under-specified and become **binding conditions**.

#### Five Sequential Gates
| Gate | Result | Note |
|---|---|---|
| 1. Motivation Engine (SDT + Right Why) | ✅ PASS | Right Why = fuel/recovery (immediate, experiential). Autonomy preserved via default-OFF opt-in. Risk: copy that drifts to "earn" flips this to introjected regulation. Locked by C1/C2. |
| 2. Behavioral Trigger (B=MAP + COM-B) | ✅ PASS | Zero added ability burden — compute-on-read, no daily action. COM-B: Physical Opportunity (correct fuel is auto-surfaced). No willpower demand. |
| 3. Habit Architecture (context + identity) | ✅ PASS | Context cue = the logged workout itself (already in routine). Reinforces "someone who fuels their training" identity — IF copy is fuel-framed (C1). |
| 4. Progression (Bandura + Mastery) | ✅ PASS | Mastery-oriented (personal fuel need), zero ego/social comparison. No leaderboard. Nutritionally sound (protein held, delta on carbs). |
| 5. Failure Architecture (Marlatt + Milkman) | ⚠️ CONDITIONAL | **The decisive gate.** A rest day MUST read as a *neutral valid state*, never a deprivation/failure. The "today-before-workout = rest day" edge is the single highest-risk moment (user sees the LOWER number while hungry and pre-training → contingent-reward inversion). Fixable, not fatal. Locked by C3 + C4. |

#### 4-Dimension Scores (min 3/5 each — ALL PASS)
- **Autonomy: 9/10** — default OFF, full opt-in explanation, user-set split & frequency, reversible. Deduct 1: the manual editor still edits BASE while adjustment applies on top — mildly opaque; helper text (planned) mitigates.
- **Friction: 10/10** — pure compute-on-read, no daily taps, no willpower. Exemplary; anti-willpower by construction.
- **Resilience: 7/10** — weekly-neutral (redistribution, not restriction+reward) + 1200 floor + capped notice are strong. Held below 9 pending C3 (rest-day = neutral, not "unearned") and C4 (pre-workout-today framing). Rises to ~9 once conditions land.
- **Mastery: 8/10** — personal fuel need, no comparison, growth-framed. Not 10 only because it tracks a numeric target (inherent to a macro feature).

#### Eyal Manipulation Matrix: **FACILITATOR ✅**
Improves the user's life (removes real friction lifters face; nutritionally legitimate) AND the maker would use it. It is a Facilitator *only while the copy stays fuel-framed and rest days stay neutral* — violate C1/C3 and it slides toward Dealer. The conditions are the guardrail that keeps it in the Facilitator quadrant.

#### The core risk verdict (compensatory / "earn-your-food")
The plan's redistribution model (Model 2, weekly-neutral) is the correct nutritional-integrity choice: energy is **moved within the week, never withheld then granted**. That structurally distinguishes periodization from a reward contingency. But structure alone is insufficient — the *experience* on non-training days and the pre-workout window is where disordered cognition takes root. Conditions C1–C5 close that gap. **A behaviorally harmful version of this feature is worse than no feature; the conditioned version is safe and genuinely helpful.**

---

### BINDING CONDITIONS (all required before implementation; AC14 copy is verbatim)

**C1 — Fuel narrative, never reward (locks AC14).** All copy frames the delta as *matching intake to work done / recovery need*. The banned lexeme list is expanded and must be grep-enforced in a test:
> Banned (case-insensitive, incl. word-stems): `earn`, `earned`, `bonus`, `reward`, `treat`, `deserve`, `penalty`, `punish`, `unlock`, `spend`, `burn it off`, `work it off`, `guilt`, `cheat`.

**C2 — Approved verbatim strings** (use exactly; UX may adjust layout, not wording):
- Settings explainer (opt-in body):
  > "Match your fuel to your training. On days you work out, your body uses more energy — this shifts some of your calories (mostly carbs) to those days and eases them back on rest days. Your **weekly total stays exactly the same** as your base target. This is about fueling recovery, not a reward for exercising."
- Training-day badge label: **`Training day · fueled`** (or minimal: `Training day`). NOT "+250 earned".
- Rest-day badge label: **`Rest day · recovery`** (or minimal: `Rest day`). NOT "no bonus" / "base only" / anything implying absence.
- Badge tap explanation (training day):
  > "Higher target today because you trained — extra fuel for recovery. Your weekly average is unchanged."
- Badge tap explanation (rest day):
  > "Recovery day — a bit lower to balance your training days. Your weekly average is unchanged."
- Manual-editor helper text (feature ON):
  > "This is your base target. Training-day fueling is applied on top — manage it in Settings › Training-Day Macros."

**C3 — Rest day is a neutral, complete state (Marlatt / AVE).** A rest day must NEVER render as a deficit-from-a-goal, a missed opportunity, or a "you didn't train" signal. No red/warning color, no down-arrow framing, no "−250" as the primary number. Present the rest-day number as *the day's target*, full stop; the "recovery" descriptor carries positive/neutral valence. Rest days are training (recovery is part of the program), and the UI must treat them as such.

**C4 — The "today-before-workout" window (highest-risk moment).** Before a workout is logged, "today" defaults to the rest-day (lower) number. This risks reading as "you haven't earned the higher number yet" — a contingent-reward inversion, and it is nutritionally backwards (you fuel *around* training, not after "earning" it). Required mitigation (implementer picks the least-friction option that satisfies the intent; UX to finalize):
  - **Preferred:** while it is *today* and no workout is yet logged, show the base (neutral) target — NOT the rest-day deficit — with a quiet note: *"Fuel updates once you log today's session."* This avoids presenting a deficit to someone about to train, and never implies failure.
  - **Acceptable alternative:** show the rest-day number but with copy *"Rest day so far — logs a training day automatically when you finish a workout,"* explicitly non-judgmental, no "earn" framing.
  - **Prohibited:** any morning/pre-workout copy implying the user must train to "unlock"/"earn"/"reach" the higher number.

**C5 — Vulnerability guardrail (APEASE: Side-effects / Equity).** Coupling food to exercise carries non-trivial disordered-eating (compensatory-restriction) risk for a susceptible minority. Required:
  - The opt-in flow includes one neutral, non-alarming line: *"Not for everyone — if adjusting food around workouts feels stressful, keep this off and use a single steady target."* (This is autonomy-supportive off-ramping, not a medical warning.)
  - Feature stays default OFF (already planned — reaffirmed as binding).
  - **No day-type push notifications, ever** (already excluded — reaffirmed as binding; a notification is what would convert periodization into a compulsion loop).

**C6 — Split-magnitude sanity (nutritional side-effect).** The high-p / low-n corner produces large, salient training-day surpluses (the more compulsion-adjacent direction). The 5–25% bound + default 10% is acceptable. Add: the settings live-preview must always show *both* numbers AND the weekly average together (already planned — reaffirmed) so the user sees redistribution, not a "big day." No further cap required.

**Not required / explicitly fine as-is:** default OFF, Model 2 (frequency-balanced) as the shipping model, 1200 floor + capped notice, compute-on-read (never mutates base), GTG exclusion, no reward messaging, no HealthKit coupling. These are correct and should not be weakened.

**Red flags triggered:** (1) food↔exercise coupling / compensatory-eating adjacency → mitigated by C1–C5; (2) contingent-reward inversion in the pre-workout window → mitigated by C4. **No un-mitigable red flag; not a rejection.**

**Green flags present:** default OFF + full opt-in (autonomy); weekly-neutral redistribution (no restriction-then-reward); explicit reward-lexeme ban (C1); no day-type notifications; mastery/personal orientation with zero social comparison; compute-on-read (zero willpower/friction); fuel-framed identity ("someone who fuels their training").

**Citations:** Deci & Ryan (SDT) — keep regulation autonomous, avoid introjected "earn" framing. Segar (Right Why) — anchor on immediate fuel/recovery, not distant outcomes. Marlatt (AVE) — rest/missed day must not read as failure (C3/C4). Fogg (B=MAP) — ability burden is zero; do not add. Michie (APEASE) — Side-effects/Equity drive the vulnerability off-ramp (C5). Eyal (Matrix) — Facilitator only while fuel-framed.

**Disposition:** APPROVED WITH CONDITIONS. Implementation may proceed once C1–C6 are reflected in the plan/ACs; AC14 must use the C2 strings verbatim and the C1 lexeme ban must be a grep-enforced test.

### CEO Decision — APPROVED (2026-07-02)
All three Phase-2 reviews returned **APPROVED WITH CONDITIONS** and are mutually reinforcing:
- **Psychologist (binding, §3.2):** APPROVED WITH CONDITIONS C1–C6. Facilitator (not a reward loop) *provided the framing holds*. Binding.
- **Quality Director:** APPROVED WITH CONDITIONS QD1–QD5. Architecture sound; UX/coexistence conditions.
- **Tech Lead:** APPROVED WITH CONDITIONS TL1–TL7 + reference fixes. No architectural blocker; mechanical/enforcement conditions.

**Decision:** APPROVED for implementation. The psychologist verdict is the binding behavior-design gate — its APPROVED-WITH-CONDITIONS closes the gate; no re-review is required if C1–C6 are implemented as specified (psych re-gates only if framing/failure-state design changes). All C/QD/TL conditions are folded into the acceptance criteria below and are **binding merge blockers**. Model 1 is **dropped** — Model 2 (frequency-balanced) is the sole shipping model per QD suggestion + psych/TL confirmation.

**Consolidated binding conditions → AC mapping** (implementation PR replaces `[gate: ...]` with `[test: <path>]`):
| Condition | Source | Landed in AC |
|-----------|--------|--------------|
| C1 lexeme ban (grep-enforced) | Psych | AC14, AC16 |
| C2 verbatim copy strings | Psych | AC14 |
| C3 rest-day = neutral state | Psych | AC17 |
| C4 today-before-workout = base/neutral | Psych | AC18 |
| C5 vulnerability off-ramp + no notifications | Psych | AC19 |
| C6 preview shows both days + weekly avg | Psych | AC20 |
| QD1 AC12 split (no-write + coherent-narrative) | QD | AC12a / AC12b |
| QD2 fuel-framed explainer copy | QD | AC14 |
| QD3 base cals visible alongside effective | QD | AC21 |
| QD4 floor-clamp notice everywhere shown | QD | AC5 (amended) |
| QD5 settings says "logged workouts / rest until logged" | QD | AC19 |
| TL1 ÷0 guard in pure module | TL | AC22 |
| TL2 export CALORIE_FLOOR | TL | AC23 (mechanical) |
| TL3 macro shape map + type disambiguation | TL | AC23 (mechanical) |
| TL4 new clock-compliance test for new module | TL | AC10 (corrected) |
| TL5 AC11 backup test written | TL | AC11 |
| TL6 honest effort + ~6-PR slice | TL | Implementation issue (delivery) |
| TL7 no directional color tokens on badge | TL | AC16 |

**Next:** flip status to APPROVED, mark BLD-2634 done (plan approval), create the implementation issue with the ~6-PR slice guidance and this full spec.
