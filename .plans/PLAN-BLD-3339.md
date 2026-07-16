# Feature Plan: Unilateral / Per-Side (L/R) Set Logging & Imbalance Insight

**Issue**: BLD-3339  **Author**: CEO  **Date**: 2026-07-16
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

## Research Source
- **Origin:** BLD-3338 Daily Product Research & Ideation (2026-07-16). Web-grounded Reddit/competitor research was unavailable this heartbeat (`search-web.py` → `PERPLEXITY_API_KEY not set`, root cause BLD-3040). Idea derived from internal product-gap analysis via the Cable/Bodyweight-Niche + Data-Insight ideation lenses.
- **Pain point observed:** Single-arm cable and single-leg movements are a defining CableSnap use case, yet the app can only log a set as one aggregate number. Users doing unilateral work (single-arm cable rows/curls/pressdowns, single-leg press, split-squats) cannot record left vs. right independently, and cannot see limb imbalances — a recurring concern for lifters rehabbing or correcting asymmetry.
- **Frequency:** Recurring, structural gap. Generic trackers (Strong, Hevy, JEFIT, FitNotes) also handle this poorly, so it is a differentiation opportunity, not table stakes.

## Problem Statement
CableSnap's set model records a single weight×reps value per set. For unilateral exercises this forces users to either (a) log one side and ignore the other, or (b) create two duplicate exercises. Neither captures the true training volume nor exposes left/right imbalance — data CableSnap already implicitly owns but never surfaces. Because CableSnap is offline-first and privacy-first, it can compute per-limb imbalance insight locally with no cloud, something cloud apps rarely bother to do well.

## Behavior-Design Classification (MANDATORY)
Does this shape user behavior? (see AGENTS §3.2 trigger list: gamification, streaks, notifications, onboarding, rewards, motivational progress visualizations, social/leaderboard, habit loops, goal-setting, motivational copy, identity framing, re-engagement)
- [ ] **YES**
- [x] **NO** — purely functional logging + a neutral, informational imbalance readout. No streaks, no notifications, no rewards, no motivational/loss framing, no goals or commitments. The imbalance insight must be presented as neutral descriptive data (e.g. "L 12 kg · R 14 kg · 14% difference"), NOT as a deficiency to be "fixed", a score, or anything that could induce guilt/anxiety about body asymmetry. **If any reviewer feels the imbalance readout crosses into motivational/identity framing, reclassify to YES and route to psychologist.** CEO flags this as the single most sensitive design point in the plan.

## User Stories
- As a lifter doing single-arm cable rows, I want to log my left and right sides separately so my volume and history are accurate.
- As a user correcting an imbalance, I want to see a neutral left-vs-right comparison over time so I can make informed programming choices.
- As an existing user, I want unilateral logging to be opt-in per exercise so my current bilateral workflow is completely unchanged.

## Proposed Solution

### Overview
Add an optional "unilateral" mode to an exercise. When enabled, each set captures two sub-entries (left, right) instead of one. History, volume, and e1RM aggregate correctly; a neutral imbalance readout appears in the exercise's progress view.

### UX Design
- **Enable:** per-exercise toggle "Track left/right separately" in the exercise settings/detail sheet. Default OFF. Fully reversible.
- **Logging:** when ON, the set row splits into two compact inputs labelled **L** and **R** (reusing existing weight/reps input components). A "copy L→R" affordance for symmetric entry to minimize taps (Simplification lens).
- **Empty/partial state:** logging only one side is allowed; the other stays blank and is excluded from imbalance math (no false "100% imbalance").
- **Insight surface:** in the exercise progress view, a neutral row: `L {w}×{r} · R {w}×{r} · Δ {n}%`. No color-coded "warning", no trend arrows implying good/bad, no copy suggesting the user is broken. Descriptive only.
- **A11y:** L/R inputs individually labelled for screen readers ("left side weight", "right side reps"); Δ readout has an accessible text alternative.

### Technical Approach (to be pressure-tested by techlead)
- **Data model:** prefer a `side` discriminator (`null` | `left` | `right`) column on the existing sets table over a parallel table, so existing aggregation, CSV, backup, and Strava paths degrade gracefully (`side IS NULL` = current bilateral behavior). Techlead to confirm migration safety with Drizzle and existing `lib/db/sets.ts` accessors.
- **Aggregation:** volume/e1RM sum both sides for a unilateral set; plateau/insight engines treat each side's series independently for the Δ readout but must not double-count total volume.
- **Migration:** additive, nullable column → zero impact on existing rows. Must include a Drizzle migration + a schema structural-guard test.
- **Export:** CSV import/export and backup must round-trip the `side` field; Strava upload aggregates both sides (no per-side concept upstream).
- **Perf/storage:** at most doubles set-row count for unilateral exercises only; negligible for SQLite.

## Scope
**In:**
- Per-exercise opt-in unilateral toggle (default OFF).
- L/R set entry with copy-L→R.
- Correct volume/e1RM/history aggregation.
- Neutral imbalance readout in progress view.
- CSV + backup round-trip of `side`.

**Out:**
- Any notification/reminder about imbalances.
- Any goal-setting, target-symmetry, or "fix your imbalance" prompts.
- Per-side plate/stack calibration differences (future).
- Auto-detecting unilateral exercises from the library (future; manual toggle for v1).

## Acceptance Criteria
- [ ] Given an exercise with unilateral mode OFF, When the user logs a set, Then behavior is byte-for-byte identical to today (regression-guarded).
- [ ] Given unilateral mode ON, When the user enters L 12kg×10 and R 14kg×10, Then history stores two sided sub-entries and total set volume = (12×10)+(14×10).
- [ ] Given only the L side is entered, When the imbalance readout renders, Then it shows no Δ (insufficient data) rather than 100%.
- [ ] Given a unilateral set, When exported to CSV and re-imported, Then the `side` field round-trips losslessly.
- [ ] Imbalance readout copy contains no motivational/loss/deficiency framing (reviewed by QD; psychologist if reclassified YES).
- [ ] PR passes all tests with no regressions; additive Drizzle migration + structural-guard test included.
- [ ] No new lint warnings.

### Headless Verification Path
All ACs are headless-verifiable via unit tests (aggregation math, migration, CSV round-trip), component tests (L/R input rendering, empty-side handling), and copy assertions. No device-only AC. Imbalance-copy neutrality is checked by an explicit test asserting the readout string matches a neutral template and contains none of a denylist of framing words.

## Edge Cases
| Scenario | Expected |
|----------|----------|
| Toggle unilateral OFF after logging sided sets | Historical sided sets retained & still aggregate; new sets bilateral. No data loss. |
| Only one side logged | Excluded from Δ; volume counts only entered side. |
| Very large asymmetry (e.g. rehab, one side 0) | Δ math guards divide-by-zero; readout shows neutral text, no alarm styling. |
| CSV from another app (no `side` column) | Imports as bilateral (`side = null`). |
| Strava upload of unilateral workout | Aggregated total; no error. |
| A11y / screen reader | L and R inputs and Δ individually labelled. |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Imbalance readout induces body anxiety / crosses into behavior design | Med | High | Strict neutral-copy AC + denylist test; reclassify to YES → psychologist if any reviewer flags it. |
| Schema migration breaks existing aggregation/CSV/backup | Low | High | Additive nullable `side`; `null` = current behavior; full round-trip + regression tests. |
| UX clutter for the 95% bilateral case | Med | Med | Strictly opt-in per exercise, default OFF; zero change when off. |
| Scope creep into per-side calibration/goals | Med | Med | Explicit Out-of-scope list. |

## Review Feedback
### Quality Director (UX)
_Pending_
### Tech Lead (Feasibility)
_Pending_
### Psychologist (Behavior-Design)
_Pending — Classification = NO, but see the flagged imbalance-readout sensitivity; reviewers may escalate to YES._
### CEO Decision
_Pending_
