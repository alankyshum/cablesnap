# Feature Plan: L/R Imbalance Trend Over Time

**Issue**: BLD-3917  **Author**: CEO  **Date**: 2026-07-25
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

## Research Source
- **Origin:** Daily research (BLD-3912) — Reddit cable/functional-trainer tracking threads + CableSnap codebase gap analysis.
- **Pain point observed:** Athletes doing unilateral cable/functional-trainer work want to know whether their left/right strength imbalance is *improving or worsening over time*. CableSnap already captures `workout_sets.side` per set and computes a per-set L/R % difference, but only surfaces the single most-recent set's snapshot on the exercise detail screen. There is no trend, no history, no aggregation.
- **Frequency:** Recurring theme in r/homegym, r/naturalbodybuilding, and r/bodyweightfitness unilateral-training discussions. Correcting side-to-side imbalance is a primary training goal for cable/functional-trainer users — the exact niche CableSnap serves and generic apps (Strong, Hevy, FitNotes, JEFIT) largely ignore.

## Problem Statement
Unilateral training's whole point is to detect and correct side-to-side asymmetry. CableSnap collects the raw data to do this (`workout_sets.side`, `track_unilateral`) but only shows a one-set snapshot (`getLatestUnilateralInsight()` on `app/exercise/[id].tsx`). A user cannot answer the single most important question unilateral work exists to answer: *"Is my weaker side catching up?"*

This is a **Data Insight** gap (data already collected, not surfaced usefully) and a **Cable/Bodyweight Niche** differentiator. It is fully local (**Privacy Advantage**) — no cloud, no account.

## Behavior-Design Classification (MANDATORY)
Does this shape user behavior? (see §3.2 trigger list: gamification, streaks, notifications, onboarding, rewards, motivational progress visualizations, social, habit loops, goal-setting/commitments, motivational copy, identity framing, re-engagement)

- [x] **NO** — purely informational/analytical. This surfaces existing objective training data (L/R % difference) as a historical trend, in the same neutral analytical family as the existing per-muscle `VolumeTrendChart` and per-exercise `ExerciseChartCard`. No goals, streaks, rewards, notifications, or motivational framing are introduced.

> Guardrail for reviewers: if any reviewer believes a proposed element (e.g. a "your weak side is catching up!" celebratory callout, or a goal to "reach <5% imbalance") crosses into behavior-shaping, flag it and it will be cut or routed to `@psychologist`. The baseline design below deliberately avoids motivational copy — it presents neutral numbers and a trend line only.

## User Stories
- As a cable/functional-trainer user, I want to see my L/R imbalance for an exercise plotted over time, so I can tell whether my weaker side is catching up.
- As a lifter recovering from a unilateral injury, I want to see the imbalance trend narrowing (or not), so I can decide whether to keep emphasizing the weak side.
- As a data-minded user, I want a neutral, factual readout (percentages + direction), not gamified nudges.

## Proposed Solution

### Overview
Add a historical L/R imbalance trend to the **exercise detail screen** (`app/exercise/[id].tsx`), directly beneath the existing single-set unilateral insight, for exercises where `track_unilateral = true` and at least N (proposed: 3) sessions of bilateral-side data exist.

### UX Design
- **Placement:** New `ExerciseImbalanceTrendCard` rendered on `app/exercise/[id].tsx` immediately after the existing latest-set unilateral readout (`:342-354`), only when `track_unilateral` and sufficient history.
- **Content:**
  1. A line chart of **per-session L/R imbalance %** over the last up-to-8 sessions (reuse the existing chart component used by `VolumeTrendChart`/`ExerciseChartCard` for visual consistency).
  2. A neutral one-line summary: current imbalance %, which side is stronger, and the delta vs the oldest session in the window (e.g. "Left 8% stronger — imbalance narrowed 4 points over last 8 sessions"). Factual, no motivational framing.
  3. A short factual definition tooltip/legend: "Imbalance = (stronger side − weaker side) ÷ stronger side, using top working set volume per side per session."
- **Empty/insufficient state:** If `track_unilateral` but < N qualifying sessions: show a muted "Not enough unilateral history yet — log a few more sessions to see your imbalance trend." (No nudge, no CTA to work out.)
- **Non-unilateral exercises:** card is absent entirely (no change).
- **A11y:** chart has an accessible text-summary fallback (VoiceOver reads the neutral summary line + per-session values); color is not the sole encoder of stronger side (use label + value). Must pass the existing CVD/contrast bar the team applies to charts.

### Technical Approach
- **Data:** All data already exists in `workout_sets` (`side`, weight, reps, `completed`, `set_type`) joined to workouts for `date`. No schema change, no migration.
- **New pure function** in `lib/db/session-sets.ts` (alongside `getLatestUnilateralInsight` `:1263`): `getUnilateralImbalanceTrend(exerciseId, { limit: 8 })` → per-session `{ date, leftMetric, rightMetric, imbalancePct, strongerSide }[]`, ordered oldest→newest.
- **Per-session metric:** use **top working-set volume per side** (max of weight×reps across that session's non-warmup `normal` completed sets, per side). Rationale: robust to set-count differences between sides; consistent with how "top set" is used elsewhere. Reviewers: confirm this vs. e1RM or total-volume alternatives.
- **Imbalance %:** `(strong − weak) / strong * 100`, guarded against divide-by-zero and sessions missing one side (skip sessions lacking both sides).
- **New component:** `components/exercises/ExerciseImbalanceTrendCard.tsx` + hook `hooks/useUnilateralImbalanceTrend.ts` (thin wrapper, same pattern as existing insight hooks).
- **Perf:** single indexed query over one exercise's sets; windowed to 8 sessions. Negligible.
- **Storage:** none added. 100% local SQLite.

## Scope
**In:**
- `getUnilateralImbalanceTrend()` query + unit tests.
- `ExerciseImbalanceTrendCard` + hook.
- Integration into `app/exercise/[id].tsx` (unilateral exercises only).
- Empty/insufficient-history state.
- A11y text fallback + CVD-safe encoding.

**Out:**
- Any cross-exercise / whole-body imbalance aggregation (future).
- Any goal/target imbalance %, celebration, or notification (explicitly excluded — would trigger behavior-design review).
- Changes to how L/R data is captured during a session (already exists).
- Body-measurement L/R fields (unrelated).

## Acceptance Criteria
- [ ] Given a unilateral exercise with ≥3 sessions each having both L and R completed working sets, When the user opens its exercise detail screen, Then an imbalance trend card renders a line chart of per-session imbalance % (oldest→newest, up to 8 sessions) plus a neutral summary line stating current %, stronger side, and delta vs window start.
- [ ] Given a unilateral exercise with <3 qualifying sessions, When the user opens exercise detail, Then the card shows the neutral insufficient-history message and no chart.
- [ ] Given a non-unilateral (`track_unilateral = false`) exercise, When the user opens exercise detail, Then no imbalance trend card is rendered.
- [ ] Given a session missing one side entirely, When computing the trend, Then that session is excluded (not counted as 100% imbalance).
- [ ] `getUnilateralImbalanceTrend()` has unit tests covering: normal case, divide-by-zero guard, missing-side exclusion, warmup/incomplete-set exclusion, ordering.
- [ ] VoiceOver reads an accessible summary of the chart; stronger side is conveyed by label+value, not color alone.
- [ ] PR passes all tests with no regressions.
- [ ] No new lint warnings.

### Headless Verification Path (MANDATORY when any AC includes a device/manual/physical step)
| Device/Manual AC | Risk it covers | Headless proxy that satisfies the same risk |
|------------------|----------------|---------------------------------------------|
| "VoiceOver reads accessible summary" | Screen-reader users can't perceive chart | Assert `accessibilityLabel`/accessible text-summary node exists and contains current %, stronger side, and delta; snapshot/RTL test querying that node — no physical device needed. |
| "Chart renders correctly on device" | Visual layout / CVD encoding | Component render test (RTL) asserting data-driven props + that stronger side is encoded via text label (not color-only); existing chart CVD lint/contrast check in CI. |
No AC requires physical-device-only verification; all are covered headlessly.

## Edge Cases
| Scenario | Expected |
|----------|----------|
| Empty (no sessions) | Card absent (falls under insufficient-history). |
| Insufficient (<3 qualifying sessions) | Neutral message, no chart. |
| Session missing one side | Session excluded from trend. |
| Divide-by-zero (a side's metric = 0) | Guard: skip/clamp; never NaN/Infinity. |
| Large history (>8 sessions) | Windowed to most recent 8. |
| Warmup / incomplete sets | Excluded from per-side metric. |
| Perfectly balanced (0% imbalance) | Renders 0% flat line + "sides balanced" neutral summary. |
| A11y / CVD | Text fallback present; stronger side not color-only. |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| "Top set volume" metric misleads if set schemes differ per side | Medium | Medium | Reviewers confirm metric choice; document definition in-UI; exclude sessions missing a side. |
| Scope-creep into goals/celebrations (behavior design) | Medium | High | Explicitly out of scope; guardrail note for reviewers; would require `@psychologist`. |
| Chart a11y/CVD regression | Low | Medium | Reuse existing chart component + CI contrast checks; text fallback AC. |
| Users misread imbalance % as diagnosis | Low | Low | Neutral factual copy + definition tooltip; no medical claims. |

## Review Feedback
### Quality Director (UX)
_Pending_
### Tech Lead (Feasibility)
_Pending_
### Psychologist (Behavior-Design)
N/A — Classification = NO. (Reviewers: escalate only if you believe a proposed element crosses into behavior-shaping; baseline is neutral analytics.)
### CEO Decision
_Pending_
