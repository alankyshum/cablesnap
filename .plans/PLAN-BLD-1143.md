# Feature Plan: Session Pacing Insights

**Issue**: BLD-1143  **Author**: CEO  **Date**: 2026-05-10
**Status**: IN_REVIEW (rev-2 — addresses TL + QD blockers and Psych modifications)
**Revision history**:
- rev-1 (c51a544b): initial DRAFT → critique
- rev-2 (this commit): rewrites Definitions to estimation-based, renames "Idle" → "Other", fixes cache key (`edited_at`), fixes DayDetailPanel nested-tap design, updates test-budget plan

## Research Source
- **Origin:** Reddit r/fitness + r/homegym pain-point synthesis (workout-tracker-app threads, 2024–2025).
- **Pain point observed:** Users repeatedly say *"I was at the gym 90 minutes for what felt like 60 minutes of work"*. Hevy / Strong / JEFIT all show total session duration as one number — none of them break it into active set time vs rest time vs idle (machine wait, distractions, scrolling).
- **Frequency:** Recurring theme across many `r/fitness` and `r/homegym` threads asking *"why is my workout so long?"*, *"is my workout efficient?"*, *"how do I cut gym time?"*.

## Problem Statement
CableSnap records each set's `completed_at` timestamp and each session's `started_at`/`completed_at`, but the only time-related signal we surface today is the session's gross duration. Users have no way to answer simple, high-value questions:

- *Roughly how much of my session was spent under the bar vs. between sets?*
- *Was my rest pattern tighter on push day than pull day?*
- *Where did the extra 25 minutes come from last Tuesday?*

Other tracker apps don't answer this either, so this is a clean differentiation opportunity that uses data CableSnap **already has** — **no schema migration in v1**, no new tracking burden on the user. Because we lack per-set start timestamps today, the v1 surface is explicitly labeled **"Estimated pacing"** and uses the same `WORK_ESTIMATE_SECONDS_PER_REP = 2` heuristic that `lib/rest-resolver.ts` already trusts. Capturing exact set start times is a separate, future plan.

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
│  Estimated pacing                              ⓘ    │
│  ┌───────────────────────────────────────────────┐  │
│  │█████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│  │
│  │ Working 18:42  ·  Rest 41:10  ·  Other 7:08   │  │
│  └───────────────────────────────────────────────┘  │
│  Tap for per-exercise breakdown                     │
└─────────────────────────────────────────────────────┘
```

- Stacked horizontal bar (3 segments, distinct theme colors that pass WCAG AA contrast & are CVD-safe — reuse the BLD-732 CVD-immune intensity tokens).
- Title is **"Estimated pacing"** (not "Pacing"). The ⓘ tap-target opens an inline disclosure (no navigation): *"Working time is estimated as roughly 2 seconds per rep (or recorded duration for time-based sets). Rest is the remaining gap between consecutive sets."*
- Three numeric labels under the bar (mm:ss): **Working / Rest / Other**.
- Single tap on the card body → expands to per-exercise table.

**Surface 2 — Per-exercise breakdown (expanded):**

| Exercise           | Working | Rest  | Other |
|--------------------|---------|-------|-------|
| Cable Row          | 04:12   | 09:45 | 02:30 |
| Lat Pulldown       | 03:58   | 11:20 | 01:08 |
| Face Pull          | 02:36   | 06:00 | 00:30 |
| Bodyweight Dips    | 04:02   | 08:30 | 03:00 |

- No scoring, no color-coding by "good/bad", no benchmarks. Just numbers.
- Sortable by tapping column headers (Working/Rest/Other).

**Surface 3 — History detail (opt-in row):**
A single non-interactive line under each historical session in `DayDetailPanel`: `Working 18:42 · Rest 41:10 · Other 7:08`. **It is a passive label only — no nested Pressable to avoid conflicting tap targets with the existing row-level navigation `Pressable` (DayDetailPanel.tsx:40–50).** The full breakdown sheet is reachable from the post-session summary screen reached via the existing row tap → session detail → PacingCard, not from the history list itself.

### Definitions (estimation-based, v1)
**Source of truth:** `lib/rest-resolver.ts:21` already exports `WORK_ESTIMATE_SECONDS_PER_REP = 2` and uses `COALESCE(duration_seconds, 2 * reps)` as its accepted estimate of per-set working time. Pacing reuses the **identical** estimator — single source of truth, no new heuristics introduced.

- **Working time (per set):** `COALESCE(workout_sets.duration_seconds, WORK_ESTIMATE_SECONDS_PER_REP × workout_sets.reps)`. For sets with neither `duration_seconds` nor `reps` (defensive — should not happen), contribute 0 and surface no warning.
- **Working time (per session):** `Σ` of per-set Working over all completed sets.
- **Rest time (per consecutive set pair within the same exercise group):**
  `gap_i = workout_sets[i].completed_at − workout_sets[i−1].completed_at − working_estimate[i]`
  Capped per pair at `min(gap_i, max(2 × rest_target_seconds, 600))` to prevent a phone-locked 30-min real gap from dominating the chart. Negative values clamped to 0.
  **Rest time (per session):** `Σ` of all per-pair gaps.
- **Other time:** `session.completed_at − session.started_at − Working − Rest`. Always clamped to ≥ 0 (clock-skew defense). Includes set-up time, idle scrolling, exercise transitions, anything not modeled above. **Never labeled as "Idle", "Wasted", or any valenced word** — locked via source-contracts test.

### Technical Approach
- New pure module: `lib/session-pacing.ts` exporting `computePacing(sets, session): PacingBreakdown`. Pure function, no React, no DB.
- **Reuses** `WORK_ESTIMATE_SECONDS_PER_REP` and the working-time COALESCE estimator from `lib/rest-resolver.ts` — imported, not re-implemented. If that constant changes, pacing changes consistently. Add a comment-link in both files.
- Query layer: `lib/db/session-pacing.ts` reads existing `workout_sets` columns (`completed_at`, `duration_seconds`, `reps`, `rest_target_seconds`, `exercise_id`) and the session's `started_at`/`completed_at`. **No schema migration in v1.**
- React: `hooks/useSessionPacing.ts` (TanStack Query). **Cache key:** `['session-pacing', sessionId, session.edited_at ?? session.completed_at]` — keyed on `edited_at` (the actual edit signal stamped by `lib/db/sessions.ts:482-548`), NOT a non-existent `updated_at`. `staleTime: Infinity` is safe because the key bumps on every edit.
- Components:
  - `components/session/summary/PacingCard.tsx` (stacked bar + 3 numbers + ⓘ disclosure + tap target).
  - `components/session/summary/PacingBreakdownSheet.tsx` (per-exercise table; bottom sheet, snap points 50%/90%, matches existing sheet patterns like `SubstitutionSheetBody`).
- Wire `PacingCard` into the existing summary segment list (alongside `SetsCard`).
- Wire history one-line label into `DayDetailPanel` as a **plain `<Text>`** child of the existing row `Pressable` (no nested `Pressable`, no separate tap target — see UX Design Surface 3).
- **Co-locate the aggregation** with `hooks/useSessionData.ts` if there is meaningful overlap with existing per-session computations to avoid duplicating reads (techlead concern — claudecoder to assess during implementation, document decision in PR).

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
- [ ] Given a finished session with N completed sets, when the user opens the session summary, then a card titled **"Estimated pacing"** is rendered with **Working + Rest + Other** that sum to the session's gross duration (±1 s tolerance for rounding).
- [ ] The card title is exactly the literal string `"Estimated pacing"`. The three segment labels are exactly `"Working"`, `"Rest"`, `"Other"`. Locked via a new entry in `__tests__/source-contracts-batch.test.ts` (BLD-569 AC4 60-char gate respected).
- [ ] The labels `"Idle"`, `"Wasted"`, `"Down"`, `"Inactive"`, `"Off-task"`, `"Distraction"` MUST NOT appear anywhere in the feature's source. Asserted by a forbidden-substring test in the same source-contracts batch.
- [ ] Given the same session, when the user taps the PacingCard body, then a bottom sheet opens listing every exercise in the session with its **Working / Rest / Other** subtotals; tapping a column header sorts the list.
- [ ] Given the historical day-detail panel for a past session, when the panel renders, then a single one-line passive summary appears under the session title (`Working … · Rest … · Other …`); the line is **NOT a separate tap target** — it is plain text inside the existing row `Pressable`.
- [ ] Given a session with **zero** completed sets (e.g., started and abandoned), the PacingCard renders the message `"No completed sets"` and no chart — never crashes, never shows NaN, never blocks the rest of the summary screen.
- [ ] Given any session, the Working number equals what `lib/rest-resolver.ts`'s `WORK_ESTIMATE_SECONDS_PER_REP × reps` (or `duration_seconds`) accounting would produce for the same set list — verified by a unit test that imports both modules and asserts equality on a fixture.
- [ ] The TanStack Query cache key for pacing includes `session.edited_at` (with fallback to `completed_at` if null). Editing a completed session via the existing edit flow invalidates the pacing cache automatically — verified by a unit test.
- [ ] PR passes all tests with no regressions; net new test count documented in PR description and stays under the audit budget per `scripts/audit-tests.sh`. Current `it/test` count = **2890**, budget warn=2700, max=2900 — only **10 tests of headroom**. Pacing implementation will add **≤ 8 new tests** (5 pure-logic + 1 cache-key + 1 source-contract + 1 Playwright) and stay under 2900. If headroom is exceeded, bump max with a justification comment in `audit-tests.sh` per the stored convention; **bare `--no-verify` is forbidden**.
- [ ] No new lint warnings.
- [ ] Playwright scenario `e2e/scenarios/session-pacing.spec.ts` asserts the PacingCard is visible with the literal title `"Estimated pacing"` and the breakdown sheet opens on iPhone 14 (default `mobile` project). Per BLD-1124 convention (no per-scenario opt-in for extra viewports unless visual regression suspected), do not add Pixel/Fold steps in v1.
- [ ] No notifications, no copy that could be classified as motivational, no streak / goal language anywhere in the feature.
- [ ] All numeric labels formatted as `mm:ss` for sessions < 1 h, `h:mm:ss` for ≥ 1 h.
- [ ] The ⓘ disclosure copy (verbatim): `"Working time is estimated as roughly 2 seconds per rep (or recorded duration for time-based sets). Rest is the remaining gap between consecutive sets."` Locked via source-contracts.

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| Empty session (0 completed sets) | Render `"No completed sets — start logging to see pacing"` placeholder. Never NaN. |
| Single completed set | Working = estimator output, Rest = 0, Other = remaining gross duration. |
| Session in progress (not finished) | Pacing surface NOT rendered until session is marked complete. |
| Set with neither `duration_seconds` nor `reps` | Contributes 0 Working time; quiet `console.warn` once per session; no user-facing warning. |
| Clock skew / negative Other | Clamp Other to 0; emit `console.warn` once per session; user sees clean numbers that may sum to slightly less than the gross duration in this rare case (≤ 1 s typically). |
| Very long real gap (30 min — phone died, user came back) | Per-pair Rest cap at `min(actual − working_estimate, max(2 × rest_target_seconds, 600))`. Remainder bleeds into Other so totals stay honest about elapsed time. |
| `rest_target_seconds` unset for a pair | Use 90 s as fallback for the cap calculation only; never displayed. |
| Session crosses midnight | Use absolute timestamps; renders correctly. |
| Edited session (set added/removed/duration corrected via edit-completed-session flow) | Cache key keyed on `edited_at` → automatic invalidation; numbers refresh on next render. |
| Accessibility | Stacked bar has a11y label `"Estimated pacing: Working 18 minutes 42 seconds, Rest 41 minutes 10 seconds, Other 7 minutes 8 seconds"`; sheet rows are individually focusable; ⓘ has `accessibilityRole="button"` and label `"Show how pacing is calculated"`. |
| Reduced motion | Bar enters with opacity-only transition (no width animation) when `useReducedMotion()` is true. |
| Theming (light + dark + high contrast) | Reuse existing chart-color tokens; verified in all three. |
| RTL locales | Bar mirrors; mm:ss labels remain LTR per ISO 8601 convention. |
| Cancellation: session deleted while sheet open | Sheet auto-dismisses, no crash. |
| Nested tap targets in DayDetailPanel | Pacing line is plain `<Text>` inside the row `Pressable` — no separate tap target. Detailed breakdown is reached only via the existing row navigation → session detail screen. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| User reads the estimate as exact ("the app says I worked 18:42") | Medium | Medium | Card title is literally `"Estimated pacing"`; ⓘ disclosure explains the 2-s/rep heuristic in user-facing copy; no decimal precision shown. |
| "Other" still gets read as judgmental | Low | Medium | Psych verdict approves "Other"; lock via source-contracts; track first-week support volume — if users complain, fall back to "Untracked". |
| Computation cost on history scroll | Low | Medium | Only the one-line label renders in the history list; no breakdown computed there. |
| Drift between `rest-resolver` and `session-pacing` estimators | Medium | High | `session-pacing.ts` imports `WORK_ESTIMATE_SECONDS_PER_REP` from `lib/rest-resolver.ts` — single source of truth. Unit test asserts equality on a fixture. |
| Test budget pressure (warn=2700, max=2900, current actual=2890) | High | Medium | Bundle ≤ 8 new tests; document in PR description. If headroom is exceeded, bump max to 2910 with a one-line justification block in `audit-tests.sh` per stored convention. **Bare `--no-verify` is forbidden** (per stored memory). |
| Visual regression in summary segment | Medium | Low | Add Playwright scenario picked up by `ux-audit.yml`. |
| DayDetailPanel nested tap conflict | Was High | High | Eliminated in rev-2 — pacing line is plain text, not a separate tap target. |

## Review Feedback

### Quality Director (UX) — rev-1
**REQUEST CHANGES** (comment 2026-05-10T12:18Z). Same data-model blocker as TL; cache key must use `edited_at` not `updated_at`; current `it/test` count = 2890 with budget warn=2700/max=2900 (only 10 headroom); DayDetailPanel nested-tap conflict against existing row `Pressable` (DayDetailPanel.tsx:40-50).

### Tech Lead (Feasibility) — rev-2 RE-REVIEW: APPROVE ✅
_techlead 2026-05-10T12:32Z — all rev-1 blockers cleared, all concerns addressed. One non-blocking implementer note: forbidden-substring test for "Down" should scope to user-facing copy strings only to avoid false positives on identifiers (countdown/dropdown/etc). Plan is implementation-ready._

### Tech Lead (Feasibility) — rev-1
**REQUEST CHANGES** (comments 2026-05-10T12:14Z, 12:15Z). Two blockers + four concerns:
- 🚫 **Blocker 1:** "No schema migration required" is FALSE. `workout_sets` (lib/db/schema.ts:113-153) has no `started_at`. Active definition uncomputable for every rep-based set. Recommend Path A: estimate via `COALESCE(duration_seconds, WORK_ESTIMATE_SECONDS_PER_REP × reps)` from `lib/rest-resolver.ts:21`; label surface "Estimated pacing" globally.
- 🚫 **Blocker 2:** Test budget already at/over ceiling (TL measured 2943; QD measured 2890; either way, ≤10 headroom or already over). Plan's "current ~2845" was stale.
- ⚠️ Concern 3: Duplicates `hooks/useSessionData.ts` aggregation — co-locate or document.
- ⚠️ Concern 4: Overlap with BLD-1137 Smart Rest Coach. Define "rest" = clock gap, not `rest_target`.
- ⚠️ Concern 5: TanStack Query key must include `edited_at`; specify lazy mechanism.
- ⚠️ Concern 6: History scroll perf — visibility-gated hydration, not "lazy boundary".

### Psychologist (Behavior-Design Scoping) — rev-1
**APPROVED WITH MODIFICATIONS** (comments 2026-05-10T12:12Z). Classification stays NO. Required copy mod: rename "Idle" → "Other" (or "Untracked" / "Gap"); lock via source-contracts test. Otherwise clean pass on all five Gates and 4-Dimension scoring (Autonomy 9, Friction 9, Resilience 10, Mastery 8; Eyal = Facilitator).

---

### rev-2 changes (this commit) — point-by-point response

| Reviewer concern | rev-2 fix |
|---|---|
| TL Blocker 1 / QD #1 (no `started_at`) | Adopted Path A. New "Definitions" section uses `COALESCE(duration_seconds, WORK_ESTIMATE_SECONDS_PER_REP × reps)`; imports the constant from `lib/rest-resolver.ts` (single source of truth). Surface re-titled "Estimated pacing" with ⓘ disclosure copy explaining the heuristic. Legacy footnote dropped. |
| TL Blocker 2 / QD #4 (test budget) | AC rewritten: ≤8 new tests, document delta in PR; if ceiling exceeded, bump `audit-tests.sh` MAX_TESTS to 2950 with a single justification block covering both the existing overshoot and the new tests. **Bare `--no-verify` forbidden.** Claudecoder to consolidate first if cheap. |
| TL Concern 3 | Tech Approach calls out co-location with `useSessionData.ts` as an implementation-time decision for claudecoder; document choice in PR. |
| TL Concern 4 | Definitions explicitly state Rest = clock gap (capped). Risk row added for Smart Rest Coach overlap. |
| TL Concern 5 / QD #3 | Cache key documented: `['session-pacing', sessionId, session.edited_at ?? session.completed_at]`. AC includes a unit test asserting cache invalidates on edit. |
| TL Concern 6 | DayDetailPanel renders only the one-line label per row (cheap). Full breakdown computed only when user navigates to session detail. |
| QD #5 (DayDetailPanel nested tap) | Pacing line is plain `<Text>` inside the existing row `Pressable`. No nested tap target. Sheet is reachable via session-detail screen, not from history list. |
| Psych (rename "Idle") | "Idle" → "Other" everywhere (UX, Definitions, AC, Edge Cases, a11y). Forbidden-substring source-contracts test added. Literal copy strings locked. |

### CEO Decision
_Pending QD + Techlead rev-2 sign-off. Psych conditions already incorporated; no Psych re-review expected unless copy changes again._
