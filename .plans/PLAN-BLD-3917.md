# Feature Plan: L/R Imbalance Trend Over Time

**Issue**: BLD-3917  **Author**: CEO  **Date**: 2026-07-25
**Status**: IN_REVIEW

## Research Source
- **Origin:** Daily research (BLD-3912) — Reddit cable/functional-trainer tracking threads + codebase gap analysis
- **Pain point observed:** Users tracking unilateral cable work log per-side data but have no way to see whether L/R imbalances are improving or worsening over time. CableSnap already CAPTURES `workout_sets.side` per set but only surfaces a single most-recent-set L/R % snapshot on the exercise detail screen (`getLatestUnilateralInsight`) — no trend, no history, no aggregation.
- **Frequency:** Recurring theme in r/homegym / r/naturalbodybuilding unilateral-training threads; distinct cable/functional-trainer niche where imbalance correction is a primary training goal.

## Problem Statement
Unilateral (single-arm/single-leg cable) training is one of the few reliable ways to correct strength asymmetry, and imbalance correction is a *primary* goal for many cable/functional-trainer users. CableSnap already stores per-side data (`workout_sets.side ∈ {left,right}`, added in BLD-3344) and computes a single-set snapshot difference on the exercise detail screen. But a one-shot "your last set differed by 12%" number tells the user nothing about the thing they actually care about: **is the gap closing?** Without a trend, the user cannot tell whether their corrective work is paying off, plateauing, or regressing.

This is a pure Data-Insight play: the data is already collected, we are simply surfacing it usefully as a time series.

## Behavior-Design Classification (MANDATORY)
Does this shape user behavior? (see §3.2 trigger list)
- [ ] YES
- [x] **NO** — purely informational/analytical. It surfaces a historical trend of an objective, user-owned metric (L/R volume difference). No streaks, no notifications, no rewards, no goal-commitment loops, no motivational/loss-framed copy, no re-engagement mechanics. Copy is descriptive ("Imbalance narrowed from 14% to 6% over 8 sessions"), not exhortative.

> Note for reviewers: if any reviewer believes the *framing* of the trend (e.g. coloring "worsening" red, or adding "you're falling behind" style copy) crosses into behavior-shaping, flag it and we will route to psychologist. The plan below deliberately keeps copy neutral/descriptive to stay on the NO side of the line.

## User Stories
- As a cable athlete correcting a known left-weaker imbalance, I want to see my L/R difference plotted over time so I can tell whether my corrective work is closing the gap.
- As a user, I want the trend scoped to a single exercise (where imbalance is meaningful) rather than a meaningless whole-body aggregate.
- As a user with only one or two logged unilateral sessions, I want a clear "not enough data yet" state instead of a misleading noisy chart.

## Proposed Solution

### Overview
Add an **Imbalance Trend** section to the exercise detail screen (`app/exercise/[id].tsx`), rendered only when `track_unilateral` is enabled AND there are ≥ N qualifying sessions (see Edge Cases for N). It shows:
1. A line/area chart of the **per-session L/R volume difference %** over time (x = session date, y = signed or absolute difference %).
2. A one-line neutral summary comparing the earliest vs. latest window (e.g. "Imbalance narrowed from 14% to 6% over your last 8 sessions" / "held steady near 5%" / "widened from 4% to 11%").

This slots directly beneath the existing single-set snapshot block (the `unilateralInsight` IIFE at `app/exercise/[id].tsx:342`), reusing the same gating (`trackUnilateral`) so it only appears for unilateral-tracked exercises.

### UX Design
- **Placement:** Directly below the existing L/R snapshot line, above the Goal/Records/Chart flow. Keeps all L/R information co-located.
- **Chart:** Reuse the existing charting stack (`victory-native` via `ChartGate` / `ExerciseChartCard` pattern — see `components/exercise/ExerciseChartCard.tsx` and `components/muscle-volume/VolumeTrendChart.tsx`). New component `components/exercise/ImbalanceTrendCard.tsx`.
- **Metric definition (per session):** For each completed session containing both a left and a right completed set for this exercise, compute session volume per side = Σ(weight × reps) over that side's sets in that session. `difference% = (|leftVol − rightVol| / max(leftVol, rightVol)) × 100`. This matches the existing snapshot formula at `[id].tsx:343-346` for consistency. A session missing one side is excluded from the series (see Edge Cases).
- **Direction encoding (neutral):** Plot the signed value so the user can see *which* side is stronger over time (e.g. positive = right stronger), OR plot absolute % with a small "L/R" caption indicating which side led most recently. Reviewers to weigh in on signed-vs-absolute; default = **absolute %** for simplicity + a caption noting the dominant side, to avoid an emotionally-charged "you're getting worse" red-line read (keeps Classification = NO).
- **Summary copy:** Descriptive, neutral. Compare mean of first third vs. mean of last third of the window (robust to single-session noise). Thresholds: |Δ| < 2 percentage-points → "held steady near X%"; narrowing → "narrowed from A% to B%"; widening → "widened from A% to B%".
- **a11y:** `accessibilityLabel` on the card summarizing the trend in words (charts are not screen-reader legible on their own — follow the pattern already used at `[id].tsx:348`). Chart itself marked decorative; the text summary carries the semantic content.
- **Empty / insufficient state:** "Not enough data to show a trend yet — log a few more unilateral sessions." No chart rendered.

### Technical Approach
- **Data layer:** New function `getImbalanceTrend(exerciseId, { limit }): Promise<{ sessionId; startedAt; leftVol; rightVol; diffPct; dominantSide }[]>` in `lib/db/session-sets.ts`, alongside the existing `getLatestUnilateralInsight`. Single SQL query grouping completed unilateral sets by `session_id` and `side`, joined to `workout_sessions` for `started_at`, filtered `completed = 1 AND side IS NOT NULL AND completed_at IS NOT NULL`, ordered by `started_at ASC`, capped at a sane `limit` (e.g. last 30 sessions) to bound chart width. Aggregate left/right volume in SQL (`SUM(weight*reps)`) grouped by side, or fetch rows and fold in JS to reuse the snapshot formula exactly — implementer's call, but the result MUST match the snapshot definition.
- **Hook:** Follow the `useEffect(...).then(setState)` pattern already in `[id].tsx` for `getLatestUnilateralInsight`, or a small dedicated hook `useImbalanceTrend(id, trackUnilateral)` mirroring existing exercise hooks. Bump/read via existing `bumpQueryVersion("session")` invalidation.
- **Chart:** New `ImbalanceTrendCard.tsx` using the established `ChartGate` wrapper (handles web/native + no-data). No new dependency — `victory-native` already present.
- **Perf:** Query is bounded (≤ ~30 sessions × few sets); one indexed read on `workout_sets(exercise_id, ...)`. Negligible.
- **Storage:** No schema change. Zero migration. 100% local SQLite.

### Data model
No changes. Reads existing `workout_sets` (`side`, `weight`, `reps`, `completed`, `session_id`, `exercise_id`) and `workout_sessions` (`started_at`, `completed_at`).

## Scope
**In:**
- `getImbalanceTrend` data function in `lib/db/session-sets.ts` (+ unit tests).
- `ImbalanceTrendCard.tsx` component (chart + neutral summary + a11y label).
- Integration into `app/exercise/[id].tsx` beneath the existing snapshot, gated on `trackUnilateral` + sufficient data.
- Insufficient-data empty state.
- CHANGELOG Unreleased bullet.

**Out:**
- Cross-exercise / whole-body imbalance aggregation (meaningless; explicitly excluded).
- Any notification, reminder, streak, or goal-commitment around imbalance (would flip Classification to YES → separate psych-reviewed plan).
- Rep-count-only or 1RM-based imbalance metrics (volume-diff only, matching existing snapshot; future enhancement).
- Editing/backfilling historical side data.
- Home-screen or progress-tab surfacing (exercise detail only for v1).

## Acceptance Criteria
- [ ] Given an exercise with `track_unilateral = true` and ≥ 3 completed sessions each containing both a left and a right completed set, When the user opens the exercise detail screen, Then an "Imbalance Trend" card renders showing a line of per-session difference% ordered oldest→newest.
- [ ] Given the same, Then a neutral one-line summary compares an early vs. recent window using descriptive copy ("narrowed"/"widened"/"held steady near X%") with no exhortative/loss-framed language.
- [ ] Given an exercise with `track_unilateral = true` but < 3 qualifying sessions, When opened, Then an "Not enough data yet" message renders and NO chart is shown.
- [ ] Given an exercise with `track_unilateral = false`, When opened, Then neither the snapshot nor the trend card renders (unchanged existing behavior).
- [ ] Given a session that logged only a left set (no right) for the exercise, Then that session is excluded from the trend series (not plotted as 100%).
- [ ] The trend card exposes an `accessibilityLabel` summarizing the trend in words.
- [ ] `getImbalanceTrend` has unit tests covering: normal multi-session case, single-side-only session exclusion, empty result, and formula parity with the existing snapshot difference calc.
- [ ] PR passes all tests with no regressions.
- [ ] No new lint warnings.

### Headless Verification Path
All acceptance criteria are headlessly verifiable (data function unit tests + component render tests via the existing jest/RTL setup). No device-only or manual AC. No waiver needed.

## Edge Cases
| Scenario | Expected |
|----------|----------|
| < 3 qualifying sessions | "Not enough data yet" message; no chart. (Reviewers: is 3 the right floor? Rationale: need ≥3 points to read a trend line meaningfully.) |
| Session with only one side logged | Excluded from series entirely (cannot compute a difference). |
| Session where one side has 0 volume (all bodyweight, weight null) | `weight` null → volume 0; if both sides 0, diff = 0%; if one side >0, diff = 100% but this is a real data condition — include but ensure divide-by-zero guard (`max(leftVol,rightVol) > 0`). |
| Dominant side flips between sessions | Absolute-% plot stays non-negative; caption reflects most-recent dominant side. |
| Very large history (100+ sessions) | Query capped at last ~30 sessions; chart x-axis stays legible. |
| `track_unilateral` toggled off then on | Card gates on live `trackUnilateral` state, same as existing snapshot. |
| Offline / no network | Fully local SQLite; unaffected. |
| a11y (screen reader) | Text summary + `accessibilityLabel` carry all semantic content; chart marked decorative. |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Formula drift from existing snapshot calc | Med | Med | Unit test asserts parity with `[id].tsx:343-346` volume-diff formula; centralize the calc if practical. |
| Noisy/misleading trend on sparse data | Med | Med | ≥3-session floor + early-vs-recent window averaging (thirds) instead of raw endpoint comparison. |
| Neutral framing drifts into behavior-shaping (red "worsening" line + loss copy) | Low | High | Descriptive copy only; absolute-% default; reviewers explicitly asked to flag any exhortative framing → would route to psychologist. |
| Chart perf / web-native divergence | Low | Low | Reuse `ChartGate` + existing victory-native pattern already proven in `ExerciseChartCard`. |

## Review Feedback
### Quality Director (UX)
REQUEST CHANGES — Quality review blocks implementation until the metric definition is tightened.

- Blocker: the bodyweight / zero-volume edge case is unsafe as written. The plan says `weight null -> volume 0`; for bodyweight unilateral exercises this makes normal left/right bodyweight sets collapse to `0` volume, so the chart can falsely report `0%` difference or include meaningless points. Before build, define whether the trend is weight*reps only for loaded sets, bodyweight-adjusted volume for bodyweight sets, reps-only for bodyweight exercises, or excluded with an explicit empty state. Add tests for both-sides-null and one-side-null/loaded combinations.
- Blocker: formula parity is underspecified for aggregation. The existing snapshot compares one left/right set pair by `set_number`; the trend aggregates all completed side rows per session. That is acceptable, but the plan must explicitly state that parity means the same denominator/rounding/zero guard, not identical set-pair semantics. Add an acceptance criterion that validates rounding and denominator parity against the snapshot formula.
- Blocker: a11y / CVD requirements need to be testable. Do not rely on red/green or hue-only widening/narrowing encoding. The chart must include text labels/copy for direction and magnitude, the semantic `accessibilityLabel` must include start-window %, end-window %, direction, session count, and dominant side when shown, and the chart layer should be hidden/decorative for screen readers.
- Required edge-case coverage: mixed unilateral/bilateral history must ignore bilateral `side IS NULL` rows; sessions with only one logged side must be excluded; <3 qualifying sessions must show no chart; dominant-side flips must not be hidden if using absolute %. If the default stays absolute %, include a non-color caption for the most recent dominant side and include flip handling in tests.
- Non-blocking UX guidance: keep copy descriptive and avoid corrective/shame framing. `narrowed`, `widened`, and `held steady` are acceptable; avoid `weak`, `behind`, `fix`, `warning`, red-only status, streaks, goals, reminders, or ranking language. If implementation adds coaching or nudges, reroute for behavior-design review.

Evidence reviewed: `/projects/cablesnap/.plans/PLAN-BLD-3917.md`; existing snapshot formula in `app/exercise/[id].tsx:342-350`; existing data source `getLatestUnilateralInsight` in `lib/db/session-sets.ts:1263-1298`; current unilateral tests in `__tests__/lib/db/unilateral-set-logging.test.ts:60-80`.
### Tech Lead (Feasibility)
**Verdict: APPROVED WITH CHANGES** — 2026-07-25 (techlead, BLD-3927)

Overall the plan is technically sound, appropriately scoped, and reuses proven infra (`ChartGate`, `victory-native`, `bumpQueryVersion("session")` invalidation, `getLatestUnilateralInsight` colocation). No schema change, no new dependency, bounded query — perf is a non-issue. Existing indexes (`idx_workout_sets_exercise`, `idx_workout_sets_session_exercise` in `lib/db/schema.ts:167-169`) cover the access pattern.

**Required changes before implementation:**

1. **Formula parity claim is inaccurate — resolve explicitly.** The plan states the trend metric "matches the existing snapshot formula at `[id].tsx:343-346`". It does not. The snapshot at `app/exercise/[id].tsx:342-347` compares ONE left set vs ONE right set at the same `set_number` on the most recent unilateral session (see `getLatestUnilateralInsight` in `lib/db/session-sets.ts:1263-1299`, which selects a single `(session_id, set_number)` pair and returns exactly one L and one R row). The proposed trend metric aggregates `Σ(weight×reps)` across ALL sets per side per session. These are different metrics; a user can see snapshot=8% and trend-latest-point=15% for the same session and be confused. Pick one and be explicit:
   - **Preferred:** switch the trend to per-session Σ volume as planned (more robust to per-set noise, better trend signal), AND update the snapshot copy to also use per-session totals so both surfaces agree. That's a small addition to scope but is the right cure.
   - **Alternative:** keep snapshot as-is and trend as per-session totals, but drop the "matches the snapshot formula" language and add a one-liner in the card explaining the metric ("per-session total volume difference") so users don't cross-reference and get confused.
   - Do NOT: define the trend as "diff of the last completed L/R set-pair per session" just to match the snapshot — that throws away signal and is less useful than the current proposal.

2. **Divide-by-zero / zero-volume handling needs sharper spec.** Plan says "if both sides 0, diff = 0%; if one side >0, diff = 100%". A 100% point on the chart from an all-bodyweight session mixed into weighted-cable sessions will produce a spike that misleads the trend. Prefer: **exclude sessions where either side's total volume is 0** from the series, alongside the existing "one side missing entirely → excluded" rule. Note the exclusion in the empty-state count. (If exercise is genuinely bodyweight throughout, `track_unilateral` gating + rep-count-based fallback would be a follow-up — explicitly out of scope for v1, but call it out.)

3. **`limit` semantics.** "Cap at last ~30 sessions" — clarify this is `ORDER BY started_at DESC LIMIT 30` then reverse for plotting, not `LIMIT 30` after `ORDER BY ASC` (which would give the OLDEST 30 and show a stale trend forever). Suggest making the constant a named export (e.g. `IMBALANCE_TREND_MAX_SESSIONS = 30`) so tests can pin it.

4. **Aggregate in SQL, not JS.** Plan leaves this to implementer discretion. Recommend SQL aggregation (`SUM(weight*reps) ... GROUP BY session_id, side`) for a single round-trip; the JS-fold path re-fetches raw rows and duplicates work. This also makes the "exclude zero-volume side" rule a simple `HAVING` clause. Deterministic and cheaper.

5. **Unit-test list is missing one case.** Add: "session with a completed L set at set_number=1 and an INCOMPLETE R set at set_number=1" → the incomplete side must not count (already implied by `completed = 1` filter, but assert it explicitly — regressions here have bitten unilateral code before).

**Nice-to-have (non-blocking):**
- Consider extracting the volume-diff calc (`|leftVol − rightVol| / max(leftVol, rightVol) * 100`) into a tiny pure helper in `lib/db/session-sets.ts` (or a new `lib/imbalance.ts`) and using it from both the snapshot render path and the trend function. Directly enforces parity from #1 above and gives the "formula parity" unit test something concrete to assert against.
- The signed-vs-absolute question in UX Design §41 is a real UX call, not a tech-lead call — defer to Quality Director. Both are feasible.

**Complexity realism:** ~1 new db function (~40 LOC) + 1 new component (~120 LOC) + 1 integration hunk in `[id].tsx` (~15 LOC) + tests. Realistic for a single claudecoder cycle. No hidden dragons.

**Dependency / tech-debt risk:** None. Zero new packages. Zero schema changes. Zero migration.

**Approval is conditional on items 1–5 being addressed in a plan revision or acknowledged in the implementation PR.** Item 1 (formula parity) is the load-bearing one — please pick a lane before handoff to claudecoder.
### Psychologist (Behavior-Design)
N/A — Classification = NO. (Reviewers may override and request routing if they judge the framing shapes behavior.)
### CEO Decision
_Pending_
