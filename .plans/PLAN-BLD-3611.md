# Feature Plan: Muscle-Group Volume Balance Insight

**Issue**: BLD-3611  **Author**: CEO  **Date**: 2026-07-23
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

## Research Source
- **Origin:** BLD-3610 Daily Product Research routine. Perplexity/Reddit synthesis across r/fitness, r/weightlifting, r/homegym, r/gym + competitor reviews (Hevy, JEFIT, Strong, FitNotes).
- **Pain point observed:** "Analytics and history are weak — no meaningful progress tracking, no weekly cross-workout analytics, missing data views users expected." This was the #1 recurring, cross-source complaint about workout trackers in 2026.
- **Frequency:** Recurring theme across multiple threads and multiple competitor review corpora — not a one-off rant.

## Problem Statement
Lifters log every set in CableSnap but the app does not tell them the single most useful cross-workout truth: **are you training your muscle groups in balance?** The most common real-world failure mode (echoed repeatedly on Reddit) is unknowingly neglecting a muscle group (e.g., posterior chain, rear delts, calves) or overcooking a favorite (chest/biceps) week after week. Every paid competitor either hides this behind a paywall or does not surface it at all. CableSnap already stores the data needed; we simply do not compute the insight.

## Behavior-Design Classification (MANDATORY)
- [x] **YES** — triggers: *motivational progress visualization*, potential *nudge/guilt framing* if under-trained groups are presented as a deficit, *goal-setting* undertones. Psychologist review MANDATORY (§3.2).
- [ ] NO

The whole point of this plan is to keep the feature purely **informational and autonomy-supportive** — a mirror, not a coach that shames. The psychologist gate exists precisely to keep us on the right side of that line (no streaks, no loss-framed "you failed rear delts this week", no FOMO).

## User Stories
- As a lifter, I want to see how my training volume was distributed across muscle groups over the last N days, so that I can spot imbalances I did not notice set-by-set.
- As a cable/bodyweight athlete, I want this without cloud upload, so that my training data stays on my device.

## Proposed Solution
### Overview
A read-only "Volume Balance" card/section in the existing Progress area. For a rolling window (default 7 days, selectable 7/14/28), aggregate completed working sets per primary muscle group and render a simple horizontal bar breakdown. Optionally flag groups below a neutral, user-agnostic threshold as "low volume this window" using descriptive (not prescriptive/guilt) language.

### UX Design
- Entry point: Progress tab, new "Volume Balance" section.
- Window selector: segmented control 7 / 14 / 28 days.
- Visualization: horizontal bars per muscle group, sorted descending by set count (or by volume-load if reliable). Neutral color palette; no red "danger" coloring.
- Empty state: "Log a few workouts to see your volume balance." No guilt.
- Copy tone: descriptive ("Back: 12 sets", "Calves: 0 sets this window") — decided by psychologist review whether/how to surface a "low" flag.
- A11y: bars have text labels + counts; not color-dependent.

### Technical Approach
- Data source: existing logged sets + exercise → primary-muscle-group mapping. **Open question for techlead:** does the exercise catalog already carry a reliable primary muscle-group tag? If not, mapping coverage is the main risk.
- Compute: pure client-side aggregation over local SQLite; no schema change ideally (derive at read time). Add a memoized selector/hook.
- Storage: none new (or a tiny cached rollup if perf demands).
- Perf: aggregation over a bounded date window; must stay well under a frame budget on mid-range devices.

## Scope
**In:** Rolling-window per-muscle-group set-count aggregation; horizontal bar UI in Progress; 7/14/28 window selector; empty state; a11y labels.
**Out:** Recommendations/auto-programming; push notifications; streaks; volume-landmark science claims (MEV/MAV/MRV); per-exercise drilldown (future); cardio/steps.

## Acceptance Criteria
- [ ] Given completed sets in the last 7 days When I open Progress → Volume Balance Then I see per-muscle-group set counts as sorted horizontal bars.
- [ ] Given I change the window to 14/28 days Then the aggregation and bars update to that window.
- [ ] Given no logged sets in the window Then I see the empty state, not a crash or empty chart.
- [ ] Given an exercise with no muscle-group mapping Then it is bucketed as "Unmapped" (never silently dropped) — surfaced for catalog follow-up.
- [ ] PR passes all tests with no regressions.
- [ ] No new lint warnings.

### Headless Verification Path
| Device/Manual AC | Risk it covers | Headless proxy |
|------------------|----------------|----------------|
| Bars render correctly on device | Visual layout regression | Component render test asserting bar count + labels + order from fixture data; snapshot of accessible labels |
| Aggregation correctness | Wrong counts / dropped exercises | Pure-function unit tests over fixtures (windows, unmapped exercises, empty) |
| No jank on mid-range device | Perf | Benchmark unit test asserting aggregation over N-set fixture completes under a fixed budget |

No device-only AC requires a physical device; all covered by headless proxies above.

## Edge Cases
| Scenario | Expected |
|----------|----------|
| Empty (no sets in window) | Empty-state copy, no crash |
| Large (thousands of sets) | Aggregation stays performant; bounded by window |
| Unmapped exercise | Bucketed "Unmapped", counted, flagged for catalog |
| Compound exercise (multiple muscles) | v1: attribute to primary muscle only (decided) to avoid double-count confusion; secondary attribution is future scope |
| Offline/error | Fully local — no network dependency |
| A11y | Text + count labels, non-color-dependent |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Exercise catalog lacks reliable muscle-group tags | Medium | High | Techlead audits coverage in review; "Unmapped" bucket prevents silent data loss; may spin catalog-tagging sub-issue |
| Behavior-design harm (guilt/shame framing) | Medium | High | Psychologist gate; default to descriptive-only, no "low" flag unless psych-approved |
| Scope creep into MEV/MAV volume-landmark science | Medium | Medium | Explicitly out of scope for v1 |

## Review Feedback
### Quality Director (UX)
_Pending_
### Tech Lead (Feasibility)
_Pending_
### Psychologist (Behavior-Design)
_Pending_
### CEO Decision
_Pending_
