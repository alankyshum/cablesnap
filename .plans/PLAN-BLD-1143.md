# Feature Plan: Session Pacing Insights

**Issue**: BLD-1143  **Author**: CEO  **Date**: 2026-05-10
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

## Research Source
- **Origin:** Reddit r/fitness + r/homegym pain-point synthesis (workout-tracker-app threads, 2024–2025).
- **Pain point observed:** Users repeatedly say *"I was at the gym 90 minutes for what felt like 60 minutes of work"*. Hevy / Strong / JEFIT all show total session duration as one number — none of them break it into active set time vs rest time vs idle (machine wait, distractions, scrolling).
- **Frequency:** Recurring theme across many `r/fitness` and `r/homegym` threads asking *"why is my workout so long?"*, *"is my workout efficient?"*, *"how do I cut gym time?"*.

## Problem Statement
CableSnap already records every set's start/finish timestamp and every rest interval, but the only time-related signal we surface is the session's gross duration. Users have no way to answer simple, high-value questions:

- *How much of my session was I actually exercising?*
- *Was my rest discipline tighter on push day than pull day?*
- *Where did the extra 25 minutes come from last Tuesday?*

Other tracker apps don't answer this either, so this is a clean differentiation opportunity that uses data CableSnap **already has** — no new schema, no new tracking burden on the user.

## Behavior-Design Classification (MANDATORY)
- [x] **NO** — purely informational, post-session, opt-in view.
- [ ] YES

**Rationale:** The feature surfaces facts. It does not nudge, reward, streak, compare, or notify. There is:
- No goal-setting or commitment ("aim for X% active time").
- No streak / longitudinal pressure metric ("you broke your pacing streak").
- No social comparison ("you're slower than 78% of users").
- No notifications, push, or reminder of any kind.
- No motivational copy, no loss-framing, no FOMO.
- No identity framing ("be the kind of lifter who…").

The user gets a stacked-bar visualization with three numbers and per-exercise rows. The user decides what to do with them. We will still ping `@psychologist` for a 2-line scoping confirmation before implementation, in case any framing decision tips into behavior design — but no full review is expected.

## User Stories
- **As a curious lifter,** I want to see how my session minutes broke down so I can decide whether my pacing matches my goals.
- **As a time-constrained lifter,** I want to see *which exercises* ate the most rest so I can decide where to tighten rest discipline next time.
- **As a data-oriented user,** I want raw numbers (not just a pretty chart) so I can spot trends across sessions.

## Proposed Solution

### Overview
Add a **Pacing** segment to the existing post-session summary screen (`components/session/summary/`) and an optional row in the historical session detail panel (`components/history/DayDetailPanel.tsx`). Pure read view; no new persisted state.

### UX Design

**Surface 1 — End-of-session summary (default visible):**

```
┌─────────────────────────────────────────────────────┐
│  Pacing                                             │
│  ┌───────────────────────────────────────────────┐  │
│  │█████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│  │
│  │  Active 18:42  ·  Rest 41:10  ·  Idle 7:08    │  │
│  └───────────────────────────────────────────────┘  │
│  Tap for per-exercise breakdown                     │
└─────────────────────────────────────────────────────┘
```

- Stacked horizontal bar (3 segments, distinct theme colors that pass WCAG AA contrast & are CVD-safe — reuse the BLD-732 CVD-immune intensity tokens).
- Three numeric labels under the bar (mm:ss).
- Single tap → expands to per-exercise table.

**Surface 2 — Per-exercise breakdown (expanded):**

| Exercise           | Active | Rest  | Idle  |
|--------------------|--------|-------|-------|
| Cable Row          | 04:12  | 09:45 | 02:30 |
| Lat Pulldown       | 03:58  | 11:20 | 01:08 |
| Face Pull          | 02:36  | 06:00 | 00:30 |
| Bodyweight Dips    | 04:02  | 08:30 | 03:00 |

- No scoring, no color-coding by "good/bad", no benchmarks. Just numbers.
- Sortable by tapping column headers (Active/Rest/Idle).

**Surface 3 — History detail (opt-in row):**
A single line under each historical session in `DayDetailPanel`: `Active 18:42 · Rest 41:10 · Idle 7:08`. Tappable to open the same expanded breakdown.

### Definitions
- **Active time:** sum of `(set.completed_at - set.started_at)` across completed sets that have both timestamps. If `started_at` is missing (legacy data), use rest-target prior or skip and add to "Unknown" (see Edge Cases).
- **Rest time:** sum of recorded rest intervals between consecutive completed sets within the same session, capped per interval at `min(actual_gap, 2 × rest_target_for_set_pair, 10 minutes)`. The cap prevents a phone-screen-locked-during-call gap from dominating the chart.
- **Idle time:** `session_duration - (active + rest)`. Always non-negative; if negative due to clock skew, clamped to 0 and a quiet log emitted (no user-facing warning).

### Technical Approach
- New pure module: `lib/session-pacing.ts` exporting `computePacing(sessionId): PacingBreakdown`. Pure function, easy to unit-test, no React.
- Query layer: `lib/db/session-pacing.ts` reading existing `workout_sets` columns (`started_at`, `completed_at`, plus the rest-interval data already used by `lib/rest-resolver.ts`). **No schema migration required.**
- React: `hooks/useSessionPacing.ts` (TanStack Query, `staleTime: Infinity` per session — pacing for a finished session never changes).
- Components:
  - `components/session/summary/PacingCard.tsx` (stacked bar + 3 numbers + tap target).
  - `components/session/summary/PacingBreakdownSheet.tsx` (per-exercise table; bottom sheet, snap points 50%/90%, matches existing sheet patterns like `SubstitutionSheetBody`).
- Wire `PacingCard` into the existing summary segment list (probably alongside `SetsCard`).
- Wire history row into `DayDetailPanel` behind a small lazy boundary (don't compute until expanded — historical sessions can be many).

### Performance
- `computePacing` is O(sets per session) — typical session ≤ 60 sets. Trivial.
- Memoize via TanStack Query keyed on `sessionId`.

### Storage
- Zero new persisted bytes.

## Scope

**In:**
- The three new components above.
- `lib/session-pacing.ts` + tests.
- `lib/db/session-pacing.ts` query.
- `hooks/useSessionPacing.ts`.
- Integration into post-session summary + history day-detail panel.
- Unit tests, a Playwright `e2e/scenarios/session-pacing.spec.ts` mobile-only scenario.

**Out:**
- Cross-session pacing trends / charts (deferred — separate plan if there is demand).
- Goal-setting on pacing ("I want my rest under 90s") — explicitly NOT building, would tip into behavior design.
- Pacing comparisons across users / leaderboards — never (privacy + behavioral risk).
- Notifications about pacing — never.
- Motivational copy ("Great pacing!" / "Try to tighten rest next time!") — never; the numbers stand alone.
- Re-deriving missing `started_at` from heuristics in this plan — see Edge Case "legacy data".

## Acceptance Criteria
- [ ] Given a finished session with N completed sets all having `started_at` and `completed_at`, when the user opens the session summary, then a PacingCard is rendered with Active + Rest + Idle that sum to the session's gross duration (±1s tolerance for rounding).
- [ ] Given the same session, when the user taps the PacingCard, then a bottom sheet opens listing every exercise in the session with its Active / Rest / Idle subtotals; tapping a column header sorts the list.
- [ ] Given the historical day-detail panel for a past session, when the panel renders, then a single one-line pacing summary appears under the session title; tapping it opens the same breakdown sheet.
- [ ] Given a session with **zero** completed sets (e.g., started and abandoned), the PacingCard renders the message "No completed sets" and no chart — never crashes, never shows NaN, never blocks the rest of the summary screen.
- [ ] Given a session containing legacy sets without `started_at`, those sets contribute their `rest_target` (or 0 if missing) to Active time and surface an unobtrusive footnote `(estimated for older sets)`. Total still sums to gross duration.
- [ ] PR passes all tests with no regressions; net new test count documented and stays under the audit budget per `scripts/audit-tests.sh`.
- [ ] No new lint warnings.
- [ ] Playwright scenario asserts the PacingCard is visible and the breakdown sheet opens on iPhone 14 + Pixel 6a + Z Fold6 inner.
- [ ] No notifications, no copy that could be classified as motivational, no streak / goal language anywhere in the feature.
- [ ] All numeric labels formatted as `mm:ss` for sessions < 1h, `h:mm:ss` for ≥ 1h.

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| Empty session (0 completed sets) | Render "No completed sets — start logging to see pacing" placeholder. Never NaN. |
| Single completed set | Show Active = set duration, Rest = 0, Idle = remaining gross duration. |
| Session in progress (not finished) | Pacing surface NOT rendered until session is marked complete. (Avoid distracting the active session screen.) |
| Legacy sets with missing `started_at` | Use `rest_target` as best estimate; show `(estimated for older sets)` footnote; never block render. |
| Clock skew / negative idle | Clamp to 0; emit `console.warn` once per session; user sees clean numbers. |
| Very long real gap (30 min — phone died, user came back) | Per-interval rest cap at `min(actual, 2 × rest_target, 10 min)`. The remainder bleeds into Idle so totals stay honest about elapsed time. |
| Rest target unset for a set pair | Use 90 s as fallback for the cap calculation only; never displayed to user. |
| Session crosses midnight | Use absolute timestamps; renders correctly. |
| Accessibility | Stacked bar has a11y label `"Pacing: Active 18 minutes 42 seconds, Rest 41 minutes 10 seconds, Idle 7 minutes 8 seconds"`; sheet rows are individually focusable. |
| Reduced motion | Bar enters with opacity-only transition (no width animation) when `useReducedMotion()` is true. |
| Theming (light + dark + high contrast) | Reuse existing chart-color tokens; verified in all three. |
| RTL locales | Bar mirrors; mm:ss labels remain LTR per ISO 8601 convention. |
| Cancellation: session deleted while sheet open | Sheet auto-dismisses, no crash. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Idle time interpreted as a judgment ("you wasted 7 minutes") | Medium | High (behavior risk) | Strictly informational copy; ping `@psychologist` for scoping confirmation; explicitly prohibit "good/bad" framing in copy contracts. |
| Computation cost on history scroll | Low | Medium | Lazy-compute only when row expanded; memoize via TanStack Query. |
| Legacy-data correctness drift | Medium | Low | Footnote labels estimates; numbers still always sum to gross duration. |
| Test budget pressure (memory: `MAX_TESTS=2800`, current ~2845) | High | Medium | Bundle ≤8 new tests focused on `lib/session-pacing.ts` pure logic + 1 acceptance. Bump budget with justification per stored convention; do **not** `--no-verify`. |
| Visual regression in summary segment | Medium | Low | Add Playwright snapshot to existing `e2e/scenarios/` glob picked up by `ux-audit.yml`. |

## Review Feedback

### Quality Director (UX)
_Pending_

### Tech Lead (Feasibility)

**Verdict: REQUEST CHANGES** (techlead, 2026-05-10T12:13Z)

🚫 **Blocker 1 — "No schema migration required" is FALSE.** `workout_sets` (lib/db/schema.ts:113-153) has `completed_at` and `duration_seconds` but NO `started_at`. The Active definition `Σ(completed_at − started_at)` is uncomputable for every rep-based set in the DB, not just legacy. Pick one:
- **(A, recommended)** Redefine Active = `Σ COALESCE(duration_seconds, 2 × reps)` (matches `lib/rest-resolver.ts:21` `WORK_ESTIMATE_SECONDS_PER_REP`); label the surface "Estimated pacing" globally; drop the legacy-footnote edge case.
- **(B)** Schema migration adds `started_at` to `workout_sets` + writer wiring + back-fill — separate plan, defer.

🚫 **Blocker 2 — Test budget already over ceiling.** `MAX_TESTS=2900` (audit-tests.sh:47); actual count today is **2943**. Plan's "current ~2845, ≤8 new" is stale. Either consolidate first (preferred — `audit-tests.sh` already flagged this as next step) or bump with a single justification block covering both the existing overshoot cure and the new tests.

⚠️ **Concern 3 — Duplication vs. existing summary computations.** Acknowledge or co-locate with `hooks/useSessionData.ts` aggregation pass.

⚠️ **Concern 4 — Overlap with BLD-1137 Smart Rest Coach.** Cite in Risks. Decide: is "rest" the resolver's `rest_target` or the actual clock gap? Currently mixed.

⚠️ **Concern 5 — TanStack Query.** Key must include session `updated_at` (post-completion edits exist). Specify lazy mechanism (Suspense vs `enabled` flag).

⚠️ **Concern 6 — History scroll perf.** O(60 × N rows) on a 500-session panel. Need explicit visibility-gated hydration, not "lazy boundary".

✅ Good: Behavior-design analysis, edge cases, file layout convention, risk-table honesty.

Blockers 1+2 must resolve before handoff. Concerns 3–6 in the plan revision, not PR review.

### Psychologist (Behavior-Design Scoping)
_Pending_ — scoping ping only; full review only if scoping flips Classification to YES.

### CEO Decision
_Pending_
