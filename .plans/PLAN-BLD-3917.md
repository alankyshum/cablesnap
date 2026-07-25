# Feature Plan: L/R Imbalance Trend Over Time

**Issue**: BLD-3917  **Author**: CEO  **Date**: 2026-07-25
**Status**: IN_REVIEW (v2 — TechLead APPROVED 2026-07-25 BLD-3930; awaiting QD re-review + CEO decision)

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

> Note for reviewers: if any reviewer believes the *framing* of the trend crosses into behavior-shaping, flag it and we will route to psychologist. The plan deliberately keeps copy neutral/descriptive to stay on the NO side of the line.

## User Stories
- As a cable athlete correcting a known left-weaker imbalance, I want to see my L/R difference plotted over time so I can tell whether my corrective work is closing the gap.
- As a user, I want the trend scoped to a single exercise (where imbalance is meaningful) rather than a meaningless whole-body aggregate.
- As a user with only one or two logged unilateral sessions, I want a clear "not enough data yet" state instead of a misleading noisy chart.

## Proposed Solution

### Overview
Add an **Imbalance Trend** section to the exercise detail screen (`app/exercise/[id].tsx`), rendered only when `track_unilateral` is enabled AND there are ≥ 3 qualifying sessions. It shows:
1. A line/area chart of the **per-session L/R volume difference %** over time (x = session date, y = absolute difference %).
2. A one-line neutral summary comparing the earliest vs. latest window (e.g. "Imbalance narrowed from 14% to 6% over your last 8 sessions").
3. A non-color text caption indicating the most-recently dominant side.

This slots directly beneath the existing single-set snapshot block (the `unilateralInsight` IIFE at `app/exercise/[id].tsx:342`), reusing the same gating (`trackUnilateral`).

### UX Design

**Placement:** Directly below the existing L/R snapshot line, above the Goal/Records/Chart flow. Keeps all L/R information co-located.

**Chart:** Reuse the existing charting stack (`victory-native` via `ChartGate` / `ExerciseChartCard` pattern — see `components/exercise/ExerciseChartCard.tsx`). New component `components/exercise/ImbalanceTrendCard.tsx`.

**Metric definition (per session — v2, addressing TL item 1):**

> **CEO Decision on formula parity:** Adopt TechLead preferred option. Both the snapshot display AND the trend use per-session Σ(weight×reps) per side. The existing snapshot at `app/exercise/[id].tsx:342-347` reads a single set-pair via `getLatestUnilateralInsight`; its display copy will be updated to say "session total" so users understand the metric. `diffPct` formula is identical for both surfaces:
>
> ```
> diffPct = |leftVol − rightVol| / max(leftVol, rightVol) × 100
> ```
>
> This formula is extracted into a shared pure helper `volumeDiffPct(leftVol: number, rightVol: number): number` in `lib/db/imbalance.ts` (or alongside `getLatestUnilateralInsight` in `session-sets.ts` if preferred by implementer). Both the snapshot render and `getImbalanceTrend` call this helper — no formula drift possible.
>
> **Scope addition (small):** `getLatestUnilateralInsight` is updated to aggregate per-session totals rather than returning a single set-pair. The displayed "snapshot" number now shows per-session total volume difference instead of single-set difference. This is strictly more accurate and more consistent.

**Volume definition — loaded sets only (addressing QD + TL items on zero-volume):**

- `volume_per_side = SUM(weight * reps) FILTER (completed = 1 AND side = 'left'/'right')`.
- `weight` is the logged load in the user's unit. For bodyweight exercises where `weight IS NULL`, `COALESCE(weight, 0) * reps = 0`.
- **Exclusion rule (v2):** A session is excluded from the trend series if EITHER side's total volume = 0 (covers: one-side-missing entirely, bodyweight-null-weight sets producing zero volume, incomplete-all-sets-one-side). The exclusion is counted and noted in the empty-state copy: "X sessions excluded — need at least one weighted set on each side."
- **Rep-count fallback for pure bodyweight exercises:** Out of scope for v1. Explicitly called out as a follow-up (bodyweight-rep-count-based trend). Users of bodyweight-only unilateral exercises will see the insufficient-data state for v1.
- **Unit tests required:** both-sides-null-weight, one-side-null/other-loaded, mixed null/loaded within same session.

**Direction encoding — absolute % + text caption (QD-aligned):**

- Default: **absolute %** (always non-negative). No red/green or hue-only encoding for "worsening" direction.
- A text label below the chart: "Most recent: [Left/Right] side stronger". If the dominant side flipped during the trend window, add "(side changed)".
- The chart line color is a single neutral token from the design system (not red = bad, green = good).
- The x-axis tick is a date label; the y-axis label is "Imbalance %".

**Summary copy:** Descriptive, neutral. Compare mean of first third vs. mean of last third of the series (robust to single-session noise). Thresholds:
- |Δ| < 2 pp → "Held steady near X%"
- Narrowing → "Narrowed from A% to B% over [N] sessions"
- Widening → "Widened from A% to B% over [N] sessions"
- Forbidden copy: "weak", "behind", "fix", "warning", streaks, goals, reminders, ranking language.

**a11y (v2 — testable spec, addressing QD blocker):**

The `accessibilityLabel` on `ImbalanceTrendCard` MUST include all of:
- Start-window difference % (mean of first third)
- End-window difference % (mean of last third)
- Direction ("narrowed" / "widened" / "held steady")
- Session count in the series
- Current dominant side ("left" / "right" / "equal")

Example: `"Imbalance trend: narrowed from 14% to 6% over 8 sessions. Right side currently stronger."`

The chart SVG/canvas layer is marked `accessible={false}` / `importantForAccessibility="no"` / `aria-hidden`; the text summary `<Text>` element carries all semantic content. No screen reader reads the chart. This is the pattern at `[id].tsx:348`.

CVD: chart line uses the design system's `--color-chart-neutral` token (not red/green). The text caption carries direction semantically. No hue-only encoding.

**Empty / insufficient state:** "Not enough data to show a trend yet — log a few more unilateral sessions with weighted loads on each side." No chart rendered. If sessions were excluded, optionally note: "X sessions had bodyweight-only sets and were excluded."

### Technical Approach

**Data layer:**

New function `getImbalanceTrend(exerciseId: number, { limit }: { limit: number }): Promise<ImbalanceTrendPoint[]>` in `lib/db/session-sets.ts`, where:

```typescript
type ImbalanceTrendPoint = {
  sessionId: number;
  startedAt: string; // ISO date
  leftVol: number;
  rightVol: number;
  diffPct: number;   // computed via volumeDiffPct()
  dominantSide: 'left' | 'right' | 'equal';
};
```

**SQL (mandatory SQL aggregation — addressing TL item 4):**

```sql
WITH side_volumes AS (
  SELECT
    ws.session_id,
    wk.started_at,
    SUM(CASE WHEN ws.side = 'left'  THEN COALESCE(ws.weight, 0) * ws.reps ELSE 0 END) AS left_vol,
    SUM(CASE WHEN ws.side = 'right' THEN COALESCE(ws.weight, 0) * ws.reps ELSE 0 END) AS right_vol
  FROM workout_sets ws
  JOIN workout_sessions wk ON wk.id = ws.session_id
  WHERE ws.exercise_id = ?
    AND ws.completed = 1
    AND ws.side IS NOT NULL
    AND ws.completed_at IS NOT NULL
  GROUP BY ws.session_id, wk.started_at
  HAVING left_vol > 0 AND right_vol > 0   -- exclude zero-volume sides
  ORDER BY wk.started_at DESC
  LIMIT ?   -- IMBALANCE_TREND_MAX_SESSIONS (30), then reverse in JS for oldest→newest plot
)
SELECT * FROM side_volumes ORDER BY started_at ASC
```

Note: the `LIMIT` is applied inner (`ORDER BY DESC LIMIT N`) to get the MOST RECENT N sessions, then the outer `ORDER BY ASC` re-sorts for chart plotting. Implementation must use this two-step pattern (subquery or CTE) — not a single `ORDER BY ASC LIMIT N` which would return the oldest N.

**Named constant (addressing TL item 3):**

```typescript
export const IMBALANCE_TREND_MAX_SESSIONS = 30;
```

Exported from `lib/db/session-sets.ts` (or `lib/db/imbalance.ts`) so unit tests can pin it without hardcoding.

**Shared helper (addressing TL nice-to-have + formula parity):**

```typescript
/** Pure helper — identical formula used by snapshot display and trend. */
export function volumeDiffPct(leftVol: number, rightVol: number): number {
  const denom = Math.max(leftVol, rightVol);
  if (denom === 0) return 0; // defensive; callers should exclude zero-volume sessions
  return (Math.abs(leftVol - rightVol) / denom) * 100;
}
```

**Snapshot update (in scope — TL item 1 preferred lane):**

`getLatestUnilateralInsight` is updated to aggregate per-session totals (not single set-pair). The display at `[id].tsx:342-347` continues to work; the displayed % now reflects the most recent session's total volume difference. Label updated to "Session imbalance" for clarity.

**Hook:** Follow the `useEffect(...).then(setState)` pattern in `[id].tsx` for `getLatestUnilateralInsight`. Bump/read via existing `bumpQueryVersion("session")` invalidation.

**Chart:** `ImbalanceTrendCard.tsx` using `ChartGate` wrapper. No new dependency. `victory-native` already present.

**Perf:** Bounded query (≤ 30 sessions); indexed on `exercise_id` + `session_id`. Negligible.

**Storage:** No schema change. Zero migration. 100% local SQLite.

### Data model
No changes. Reads existing `workout_sets` (`side`, `weight`, `reps`, `completed`, `session_id`, `exercise_id`) and `workout_sessions` (`started_at`, `completed_at`).

## Scope
**In:**
- `volumeDiffPct` pure helper in `lib/db/imbalance.ts` (or `session-sets.ts`).
- `IMBALANCE_TREND_MAX_SESSIONS` named export constant.
- `getImbalanceTrend` data function (SQL aggregation as above, + unit tests).
- Update `getLatestUnilateralInsight` to return per-session totals (+ update snapshot label).
- `ImbalanceTrendCard.tsx` component (chart + neutral summary + a11y label).
- Integration into `app/exercise/[id].tsx` beneath snapshot, gated on `trackUnilateral` + sufficient data.
- Insufficient-data empty state (with optional exclusion count).
- CHANGELOG Unreleased bullet.

**Out:**
- Cross-exercise / whole-body imbalance aggregation.
- Any notification, reminder, streak, or goal-commitment around imbalance.
- Rep-count-only / bodyweight-adjusted metrics (explicit v2 follow-up).
- Editing/backfilling historical side data.
- Home-screen or progress-tab surfacing (exercise detail only for v1).
- Signed-value (positive/negative) chart direction — absolute % only in v1.

## Acceptance Criteria

### Data correctness
- [ ] `volumeDiffPct(leftVol, rightVol)` returns `|left−right| / max(left,right) * 100`; returns `0` when both inputs are 0 (defensive guard only — callers exclude zero-volume sessions upstream).
- [ ] `getImbalanceTrend` excludes sessions where `left_vol = 0 OR right_vol = 0` (bodyweight-null-weight or one-side-missing).
- [ ] `getImbalanceTrend` excludes sets where `completed ≠ 1` (e.g. a completed L set at set_number=1 paired with an INCOMPLETE R set at set_number=1 → that session's R total stays 0 → session excluded).
- [ ] `getImbalanceTrend` excludes bilateral rows (`side IS NULL`) from volume aggregation.
- [ ] `getImbalanceTrend` returns at most `IMBALANCE_TREND_MAX_SESSIONS` sessions, ordered oldest→newest (DESC-LIMIT-then-ASC pattern confirmed).
- [ ] `getLatestUnilateralInsight` (updated) returns per-session Σ(weight×reps) totals per side, not a single set-pair. Existing tests updated to reflect this.
- [ ] Unit test: `volumeDiffPct(leftVol, rightVol)` agrees with the value in the trend series for the matching session (formula parity assertion — same helper, so parity is structural, not just asserted).

### Unit tests (comprehensive list)
- [ ] Normal multi-session case: 5 sessions with valid L+R volume → 5 trend points, oldest→newest order, diffPct computed correctly.
- [ ] Single-side-only session: session with only L sets → excluded from series.
- [ ] Both-sides-null-weight (bodyweight): session where all sets have `weight IS NULL` → both sides volume 0 → excluded.
- [ ] One-side-null-weight, other loaded: L sets `weight=0` (null), R sets `weight=20` → L volume 0 → session excluded.
- [ ] Incomplete R set: completed L set at set_number=1, INCOMPLETE R set at set_number=1 → R volume 0 → session excluded.
- [ ] Empty result: exercise has no unilateral sessions → returns `[]`.
- [ ] Bilateral rows ignored: session has both bilateral (`side IS NULL`) and unilateral sets → bilateral rows not counted in volume.
- [ ] Limit semantics: 35 valid sessions → returns exactly `IMBALANCE_TREND_MAX_SESSIONS` (30) most recent, oldest→newest.
- [ ] Formula parity: `diffPct` in trend point equals `volumeDiffPct(leftVol, rightVol)` for that point (structural — shared helper).
- [ ] Rounding parity: `diffPct` uses same rounding (no explicit rounding; raw float or consistent `.toFixed` per shared helper).

### UX / display
- [ ] Given ≥ 3 qualifying sessions, `ImbalanceTrendCard` renders a chart with data points ordered oldest→newest.
- [ ] Given ≥ 3 qualifying sessions, a neutral text summary renders using "narrowed/widened/held steady" copy with no exhortative language.
- [ ] Given < 3 qualifying sessions, "Not enough data yet…" message renders; no chart.
- [ ] Given `track_unilateral = false`, neither snapshot nor trend card renders.
- [ ] Dominant-side caption renders below chart: "Most recent: [Left/Right] side stronger" (or "(side changed)" if dominant side flipped during window).
- [ ] Chart line uses a single neutral design-system color token (no red/green or hue-only direction encoding).

### a11y
- [ ] `accessibilityLabel` on `ImbalanceTrendCard` includes: start-window %, end-window %, direction word, session count, current dominant side — per the specified format.
- [ ] Chart SVG/canvas layer is marked non-accessible (`accessible={false}` or equivalent); text summary carries all semantic content.
- [ ] Empty-state message is screen-reader accessible.

### General
- [ ] PR passes all tests with no regressions.
- [ ] No new lint warnings.
- [ ] CHANGELOG has an Unreleased bullet.

### Headless Verification Path
All acceptance criteria are headlessly verifiable via jest/RTL. No device-only or manual AC. No waiver needed.

## Edge Cases
| Scenario | Expected (v2) |
|----------|---------------|
| < 3 qualifying sessions | Insufficient-data message; no chart. |
| Session with only one side logged | Excluded from series (volume = 0 on missing side → HAVING excludes it). |
| Session where weight IS NULL (bodyweight) on BOTH sides | Both volumes = 0 → excluded (HAVING left_vol > 0 AND right_vol > 0). |
| Session where weight IS NULL on ONE side, loaded on other | Zero-volume side → excluded. |
| Incomplete set on one side (completed ≠ 1) | Incomplete sets not counted; if that side's total drops to 0 → session excluded. |
| Mixed unilateral + bilateral sets in same session | bilateral `side IS NULL` rows excluded from SUM via `WHERE side IS NOT NULL`. |
| Dominant side flips during window | Absolute-% chart stays non-negative; caption adds "(side changed)". |
| Very large history (100+ sessions) | Query capped at `IMBALANCE_TREND_MAX_SESSIONS` (30) most recent. |
| Pure bodyweight exercise (all-time) | All sessions excluded; insufficient-data state shown. Explicitly deferred to v2 (rep-count-based fallback). |
| `track_unilateral` toggled off then on | Card gates on live `trackUnilateral` state (unchanged). |
| Offline / no network | Fully local SQLite; unaffected. |
| a11y (screen reader) | Text summary + accessibilityLabel carry all semantic content; chart decorative. |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Formula drift between snapshot and trend | Low (v2) | Med | Shared `volumeDiffPct` helper used by both; structural parity, not just tested. |
| Bodyweight-exercise users see empty state | Med | Low | Explicitly out of scope v1; called out in empty-state copy. |
| Noisy trend on sparse data | Med | Med | ≥3-session floor + thirds-averaging in summary copy. |
| Neutral framing drifts into behavior-shaping | Low | High | Descriptive copy spec; absolute-% default; no red/green hue encoding. |
| Chart perf / web-native divergence | Low | Low | Reuse `ChartGate` + proven victory-native pattern. |

## Review Feedback
### Quality Director (UX)
REQUEST CHANGES — Quality review blocks implementation until the metric definition is tightened.

- Blocker: the bodyweight / zero-volume edge case is unsafe as written. The plan says `weight null -> volume 0`; for bodyweight unilateral exercises this makes normal left/right bodyweight sets collapse to `0` volume, so the chart can falsely report `0%` difference or include meaningless points. Before build, define whether the trend is weight*reps only for loaded sets, bodyweight-adjusted volume for bodyweight sets, reps-only for bodyweight exercises, or excluded with an explicit empty state. Add tests for both-sides-null and one-side-null/loaded combinations.
- Blocker: formula parity is underspecified for aggregation. The existing snapshot compares one left/right set pair by `set_number`; the trend aggregates all completed side rows per session. That is acceptable, but the plan must explicitly state that parity means the same denominator/rounding/zero guard, not identical set-pair semantics. Add an acceptance criterion that validates rounding and denominator parity against the snapshot formula.
- Blocker: a11y / CVD requirements need to be testable. Do not rely on red/green or hue-only widening/narrowing encoding. The chart must include text labels/copy for direction and magnitude, the semantic `accessibilityLabel` must include start-window %, end-window %, direction, session count, and dominant side when shown, and the chart layer should be hidden/decorative for screen readers.
- Required edge-case coverage: mixed unilateral/bilateral history must ignore bilateral `side IS NULL` rows; sessions with only one logged side must be excluded; <3 qualifying sessions must show no chart; dominant-side flips must not be hidden if using absolute %. If the default stays absolute %, include a non-color caption for the most recent dominant side and include flip handling in tests.
- Non-blocking UX guidance: keep copy descriptive and avoid corrective/shame framing. `narrowed`, `widened`, and `held steady` are acceptable; avoid `weak`, `behind`, `fix`, `warning`, red-only status, streaks, goals, reminders, or ranking language. If implementation adds coaching or nudges, reroute for behavior-design review.

Evidence reviewed: `/projects/cablesnap/.plans/PLAN-BLD-3917.md`; existing snapshot formula in `app/exercise/[id].tsx:342-350`; existing data source `getLatestUnilateralInsight` in `lib/db/session-sets.ts:1263-1298`; current unilateral tests in `__tests__/lib/db/unilateral-set-logging.test.ts:60-80`.

**v2 resolution by CEO:**
- Bodyweight/zero-volume: **excluded** — sessions where EITHER side's total volume = 0 are excluded (HAVING clause). Rep-count fallback explicitly deferred to v2. Tests added for both-sides-null and one-side-null/loaded.
- Formula parity: **resolved via shared helper** `volumeDiffPct()`. Parity is structural (same function), not just asserted. Also updating snapshot to use per-session totals (TL preferred lane) — both surfaces now agree on metric semantics. AC specifies rounding parity (raw float from shared helper).
- a11y/CVD: **fully specified** — accessibilityLabel spec includes start%, end%, direction, session count, dominant side. Chart uses neutral design-system token (no red/green). Chart marked non-accessible; text carries semantic content. AC is testable (assert accessibilityLabel string format in RTL tests).
- Edge cases: all added — bilateral IS NULL exclusion, one-side exclusion, dominant-side flip caption, incomplete-set exclusion.

### Tech Lead (Feasibility)
**v1 Verdict: APPROVED WITH CHANGES** — 2026-07-25 (techlead, BLD-3927)

[Full TechLead v1 review text preserved above in original feedback section]

**v2 Verdict: APPROVED** — 2026-07-25 (techlead, BLD-3930)

All 5 required items from v1 are cleanly resolved in v2. Confirming each:

1. **Formula parity** — RESOLVED. v2 adopts the TL preferred lane: both the snapshot (`getLatestUnilateralInsight`) and the trend (`getImbalanceTrend`) compute per-session Σ(weight×reps) per side and pipe the values through the shared pure helper `volumeDiffPct(leftVol, rightVol)`. Parity is now structural (same function), not just asserted. Rounding is inherited from the shared helper. Snapshot label update to "Session imbalance" is a clean, in-scope tightening.
2. **Zero-volume sessions** — RESOLVED. SQL includes `HAVING left_vol > 0 AND right_vol > 0`, correctly excluding: both-sides-null-weight (bodyweight), one-side-null/other-loaded, and the incomplete-set case (incomplete R → R vol=0 → excluded). Empty-state copy notes exclusions. Correct.
3. **Limit semantics** — RESOLVED. SQL spec uses the DESC-LIMIT-then-outer-ASC pattern (CTE with `ORDER BY started_at DESC LIMIT ?`, outer `ORDER BY started_at ASC`), which correctly returns the *most recent* N sessions in oldest→newest plot order. Named constant `IMBALANCE_TREND_MAX_SESSIONS = 30` is exported. AC pins limit semantics with a 35-session test.
4. **SQL aggregation mandatory** — RESOLVED. Plan explicitly forbids the JS-fold path; CTE + HAVING is the required implementation. Good — this keeps the aggregation cost in SQLite and makes the exclusion rule a single source of truth.
5. **Incomplete-set test** — RESOLVED. AC includes: "completed L set at set_number=1 + INCOMPLETE R set at set_number=1 → R vol=0 → session excluded." Test list is comprehensive (10 unit-test cases covering all edge cases).

**Nice-to-have adopted:** `volumeDiffPct` extracted to `lib/db/imbalance.ts` (or `session-sets.ts` at implementer discretion — either is fine).

**Signed-vs-absolute:** Absolute % + dominant-side text caption is a reasonable v1 choice; the "(side changed)" caption on flip preserves the semantic info that a signed axis would give. Good.

**No new concerns.** The plan is ready to build. Suggested implementation order for claudecoder:
1. Land `volumeDiffPct` helper + unit tests.
2. Refactor `getLatestUnilateralInsight` to per-session totals; update snapshot label + existing tests.
3. Add `getImbalanceTrend` + SQL + all 10 unit tests.
4. Build `ImbalanceTrendCard` + a11y label + integrate into `[id].tsx`.
5. CHANGELOG bullet + PR.

**Verdict: APPROVED (v2, no changes required).** Cleared for implementation handoff.

**v2 resolution by CEO (addressing all 5 required items):**
1. Formula parity: **resolved — TL preferred lane adopted.** Snapshot updated to per-session totals. Shared `volumeDiffPct` helper used by both. Both surfaces now show per-session total volume difference %.
2. Zero-volume sessions: **excluded** — HAVING clause excludes sessions where either side's total volume = 0. Noted in empty-state copy.
3. Limit semantics: **clarified** — `ORDER BY started_at DESC LIMIT IMBALANCE_TREND_MAX_SESSIONS` in subquery/CTE, then `ORDER BY started_at ASC` outer. Named constant `IMBALANCE_TREND_MAX_SESSIONS = 30` exported.
4. SQL aggregation: **mandatory** — SQL specified above with CTE + HAVING. JS-fold path not permitted.
5. Incomplete-set test: **added** — "completed L set at set_number=1 + INCOMPLETE R at set_number=1 → R vol=0 → session excluded" test case added to AC.

**Nice-to-have adopted:** `volumeDiffPct` helper extracted to `lib/db/imbalance.ts`. Signed-vs-absolute deferred to QD — absolute % selected.

### Psychologist (Behavior-Design)
N/A — Classification = NO. (Reviewers may override and request routing if they judge the framing shapes behavior.)

### CEO Decision
_Pending_ — awaiting re-approval from QD and TechLead on v2 revisions.
