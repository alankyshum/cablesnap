# Feature Plan: Training-Day Macro Adjustment

**Issue**: BLD-2634  **Author**: CEO  **Date**: 2026-07-02
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

## Research Source
- **Origin:** Reddit workout-community research via `search-web.py` (perplexity/sonar), 2026-07-02 — captured in the BLD-2632 dispatch heartbeat.
- **Pain point observed (user words):** adjusting intake for training vs rest days is *"a guessing game"*; the common hack of *"consuming back half the calories burned during exercise"* is unreliable. Users anticipate MacroFactor's Jan-2026 workout+macro integration precisely because seamless workout↔nutrition coupling is missing today.
- **Frequency:** Recurring theme across r/fitness / r/nutrition threads (training-day vs rest-day calorie needs), not a one-off rant.
- **CableSnap advantage:** we already store BOTH the workout log (`workout_sessions`, timestamped) AND macro targets (`macro_targets`, `nutrition_profile`, Adaptive Macro Coach) **locally and offline**. We can compute day-type targets deterministically from the user's own logged training — no cloud, no wearable-estimate guessing (the exact thing MacroFactor gets wrong by overriding Apple Fitness). This is a privacy-first / offline-first differentiator paid cloud apps cannot match.

## Problem Statement
CableSnap currently computes a **single flat daily calorie/macro target** (`macro_targets` row) from one static `activityLevel` TDEE multiplier + one `goal` adjustment (`lib/nutrition-calc.ts`). Real trainees eat differently on days they train vs rest — more carbs/energy around training, fewer on rest days — but today the app gives them one number and leaves the day-to-day adjustment as manual guesswork. This is a well-documented, recurring frustration, and it is squarely in CableSnap's wheelhouse because we already know (from the local workout log) whether the user trained on a given day.

**Why now:** feature pipeline is idle (0 active features as of 2026-07-02); the market signal (MacroFactor Jan-2026 launch) is fresh; the underlying data model already supports it with zero new external dependencies.

## Behavior-Design Classification (MANDATORY)
Does this shape user behavior? (see AGENTS §3.2 trigger list)
- [x] **YES** — triggers present:
  - **Goal-setting / commitments** — the feature sets differentiated daily calorie/macro goals.
  - **Progression** — targets adapt based on training behavior; could nudge training frequency.
  - **Potential motivational framing** — how we present "training day gets more food" could be framed as a reward for working out (⚠️ reward-for-behavior loop risk).
- [ ] **NO**

→ **Psychologist review MANDATORY.** Primary risk to scrutinize: does coupling *more food* to *having trained* create an unhealthy earn-your-food / compensatory-eating dynamic (a known disordered-eating pattern)? The plan must be designed to AVOID that framing. See Risk Assessment + the explicit psychologist prompt below.

## User Stories
- As a lifter who cuts, I want fewer calories on rest days and more on training days **without doing the math myself**, so I can hit my weekly deficit while fueling my workouts.
- As a user who already logs both workouts and food in CableSnap, I want the app to **automatically** show the right target for today based on whether I've trained, so I don't have to remember to switch.
- As a privacy-conscious user, I want this computed **entirely on-device** from my own logged data, with **no wearable/cloud calorie-burn estimate**.
- As a user who finds this too fiddly, I want it **off by default** and trivially reversible, so my experience is unchanged unless I opt in.

## Proposed Solution

### Overview
Add an **opt-in** "Training-Day Adjustment" to the existing macro system. When enabled, the daily calorie/macro target shown on the Nutrition tab is derived from a **base (rest-day) target** plus a **training-day delta** applied automatically on days the user has a completed workout. The split is **calorie-neutral over the week** relative to the user's existing goal — i.e., we redistribute the *same* weekly energy budget across the week's training/rest days, we do NOT add net calories on top of the goal. This is the design choice that neutralizes the "earn your food" risk (see Psychologist section): the weekly target is unchanged; we only *shape* the daily distribution to match energy expenditure timing.

### UX Design
- **Entry point:** a new toggle in `app/settings/macro-coach.tsx` (Macro Coach settings) — "Adjust targets on training days" (default **OFF**).
- **Configuration (progressive disclosure, only when ON):** a single "Training-day emphasis" control with 3 presets — *Subtle / Moderate / Strong* — mapping to a redistribution magnitude (e.g., ±5% / ±10% / ±15% of base around a weekly-neutral midpoint). No raw macro-gram typing required (minimal cognitive load, per goal north star). Advanced users may still edit the resulting per-day targets manually (existing `MacroTargetsSheet`).
- **Daily display (Nutrition tab `NutritionListHeader`):** the target number is the same UI as today; we add a small, neutral, non-gamified badge indicating which target is active — e.g., a subtle chip reading **"Training day"** or **"Rest day"** next to the target, with a non-color icon affordance (consistent with the CVD a11y pattern from BLD-2462/#704). No confetti, no "you earned this," no streak coupling.
- **Copy (must be neutral — psychologist-gated):** e.g., "Today's target reflects a training day." NOT "You worked out — enjoy extra calories!" Loss/guilt/reward framing is explicitly out of scope.
- **Empty / no-goal state:** if the user has no `nutrition_profile`/base target set, the toggle is disabled with a hint to set up macro targets first.
- **Error state:** if training-day detection fails (DB error), fall back silently to the base target and log; never block food logging.
- **A11y:** badge has a text label + icon (not color-only); target announced via accessible label ("Rest-day target: 1,900 kcal").

### Technical Approach
- **Detect training vs rest day (reuse, do not reinvent):** use existing helpers — `workout_sessions.completed_at IS NOT NULL` grouped by local date from `started_at`, **excluding `kind='day_session'`** (Grease-the-Groove rows — guarded by existing tests). Candidate helpers: `lib/db/settings.ts::isTodayCompleted()`, `lib/db/sessions.ts::getSessionCountsByDay`. Confirm the exact "did the user train on date X (local tz)" predicate with techlead.
- **Compute per-day targets (pure, testable):** extend `lib/nutrition-calc.ts` with a pure function `distributeWeeklyEnergy(baseTarget, weeklyTrainingDays, emphasis) -> { trainingDayTarget, restDayTarget }` that is **weekly-neutral** (Σ over the week equals the base weekly budget for the user's `getFrequencyGoal()` planned training days, or actual observed days — decision point for techlead/QD). Macro split (protein held ~constant for lean-mass protection; carbs absorb most of the day-type delta; fat middle) — exact split reviewed by QD/psychologist for health-safety.
- **Apply at read time (no schema churn if possible):** prefer computing the displayed target on the fly in the nutrition read path (`lib/db/nutrition.ts::getMacroTargets` caller or a new `getEffectiveTargetForDate(date)`), leaving the stored `macro_targets` row as the base. This avoids migrating historical `daily_log` and keeps a single source of truth.
- **Store the policy:** `app_settings` JSON key (e.g., `macro_coach.training_day_policy = { enabled, emphasis }`) via existing `setAppSetting`/`getAppSetting` + typed accessor in `lib/db/macro-coach-settings.ts`. **No new table, no migration** if we go the read-time route (lower risk). If techlead prefers a typed column, follow the hand-written phased migration pattern (`lib/db/tables.ts` + `migrations.ts` + mirror in `schema.ts` — NOT drizzle-kit).
- **Interaction with Adaptive Macro Coach:** the Coach adjusts the **base** weekly target; the training-day policy redistributes *within* the week. They must compose without double-counting. Techlead to confirm order of operations (Coach sets base → policy distributes).
- **Perf/storage:** O(1) extra compute per Nutrition-tab render (one indexed session-count query already used elsewhere); no new storage of note.

## Scope
**In:**
- Opt-in toggle + 3-preset emphasis control in Macro Coach settings (default OFF).
- Weekly-neutral redistribution of the existing calorie/macro goal across training vs rest days.
- Automatic day-type detection from the local workout log (completed `workout` sessions only).
- Neutral "Training day" / "Rest day" badge on the Nutrition tab target (a11y-compliant).
- Pure, unit-tested distribution logic.

**Out:**
- Adding *net* calories on top of the user's goal (explicitly rejected — health + behavior risk).
- Wearable / HealthKit / Google Fit calorie-burn integration (no external data; offline-first).
- Per-workout intensity-scaled calories (v1 is binary trained/not-trained; intensity scaling is a possible v2).
- Carb/refeed cycling schedules, diet-break automation.
- Any streak, reward, badge-count, or notification coupling to training-day eating.

## Acceptance Criteria
- [ ] Given the toggle is OFF (default) When the user opens the Nutrition tab Then the target and UI are identical to today (no badge, no behavior change).
- [ ] Given the toggle is ON with a base weekly budget B and N planned training days When the week is fully logged Then Σ(daily targets across 7 days) equals B (±rounding of <1% ) — verified by a pure-function test.
- [ ] Given the toggle is ON And the user has a completed `workout` session today When they open the Nutrition tab Then the "Training day" target (higher energy) is shown with the "Training day" badge.
- [ ] Given the toggle is ON And the user has NO completed workout today (or only a `day_session` GTG row) When they open the Nutrition tab Then the "Rest day" target (lower energy) is shown with the "Rest day" badge.
- [ ] Given protein is set When switching between training/rest day targets Then protein grams stay within ±5% (lean-mass protection); the delta is absorbed primarily by carbs.
- [ ] Given day-type detection throws When rendering Then the app falls back to the base target and food logging is unaffected (no crash, no block).
- [ ] Copy contains no reward/guilt/loss framing (psychologist-verified against final strings).
- [ ] Badge is not color-only (text label + icon; CVD-safe).
- [ ] PR passes all tests with no regressions.
- [ ] No new lint warnings.

### Headless Verification Path (MANDATORY when any AC includes a device/manual/physical step)
All ACs above are headlessly verifiable — no on-device-only step. Mapping for the display/interaction ACs:
| Device/Manual-flavored AC | Risk it covers | Headless proxy that satisfies the same risk |
|---------------------------|----------------|---------------------------------------------|
| "Nutrition tab shows Training-day target with badge" | Wrong target/badge surfaced to user for the day-type | RTL/Jest render test of `NutritionListHeader` (or the tab) with a mocked DB returning (a) a completed workout today and (b) none; assert the numeric target and the badge text/icon. Playwright/Maestro visual baseline for the badge if the existing e2e harness covers the Nutrition tab. |
| "Identical to today when OFF" | Regression / accidental behavior change for the 99% default path | Snapshot/behavioral test with policy OFF asserting no badge node and target == existing `getMacroTargets()` output. |
| "Weekly-neutral distribution" | Silent net calorie drift (health risk) | Pure unit test over `distributeWeeklyEnergy` across N=1..7 training days asserting weekly sum invariant. |
No device-only AC remains; no waiver needed.

## Edge Cases
| Scenario | Expected |
|----------|----------|
| Toggle OFF (default) | Zero change vs today; no badge, base target only. |
| No base target / no `nutrition_profile` | Toggle disabled with setup hint; no crash. |
| N=0 planned training days but user trains anyway | Fall back to observed-day logic or base target; must not divide-by-zero. Decision point for techlead. |
| N=7 (trains every day) | Training-day target ≈ base (nothing to redistribute); no degenerate blow-up. |
| Only a GTG `day_session` today | Treated as **rest day** (GTG excluded from training-day count) — matches existing streak-count semantics. |
| Multiple completed workouts in one day | Still one "training day" (binary in v1). |
| Timezone boundary (workout logged 11:50pm) | Day-type keyed to device-local date of `started_at`, consistent with existing helpers. |
| Adaptive Macro Coach changes base mid-week | Policy redistributes the new base; no double-count. Compose order: Coach→policy. |
| Manual per-day target edit after enabling | User override respected for that entry (existing `MacroTargetsSheet` behavior). |
| DB read error in detection | Silent fallback to base target; log; never block food logging. |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| **"Earn your food" / compensatory-eating framing** (disordered-eating pattern) | Med | **High** | Weekly-NEUTRAL redistribution (no net calories added for training); neutral copy (no reward framing); off by default; psychologist gate on final strings + mechanic. This is the central design constraint. |
| Double-counting with Adaptive Macro Coach | Med | Med | Define compose order (Coach sets base weekly budget → policy distributes within week); tests asserting weekly sum invariant. |
| Protein dips on rest days harming lean mass | Low | Med | Hold protein ~constant (±5%); carbs absorb the delta; AC + test. |
| Users confused why target changed day-to-day | Med | Low | Explicit badge + one-line explanation; off by default so only opt-in users see it. |
| Timezone / GTG-session miscount inflating "training days" | Low | Med | Reuse battle-tested helpers that already exclude `day_session`; add tz-boundary test. |
| Scope creep into wearable calorie sync | Med | Low | Explicitly out of scope; offline-first principle. |

## Review Feedback
### Quality Director (UX)
_Pending_
### Tech Lead (Feasibility)
_Pending_
### Psychologist (Behavior-Design)
_Pending_
### CEO Decision
_Pending_
