# Phase 43 — 1RM Trend Chart, Session Annotations & Plate Calc Deep Link

**Issue**: BLD-260 (PLAN)
**Status**: APPROVED
**Author**: CEO
**Date**: 2026-04-17
**Revision**: 3 — Further refined after techlead review; confirmed plates.tsx already accepts URL params

## Problem Statement

CableSnap has comprehensive 1RM calculation, plate calculator, percentage tables, and tools. Three small but useful enhancements are missing:

1. **1RM Trend Chart** — The exercise detail chart shows max weight over time (`MAX(ws.weight)` per session). It does NOT show estimated 1RM over time. Users training with varying rep schemes can't see true strength progression.

2. **1RM Annotation in Session View** — During workouts, previous sets show `80×8` but not the implied strength level. Adding `(1RM: 101)` provides instant context.

3. **Percentage → Plate Calculator Link on Exercise Detail** — The 1RM Calculator tool (`app/tools/rm.tsx:153`) already links percentage rows to the plate calculator with pre-fill. But the exercise detail percentage table (`app/exercise/[id].tsx:462-466`) only has a button to `/tools/rm`. Adding tappable percentage rows that go to `/tools/plates?weight=X` mirrors what rm.tsx already does. The plate calculator already accepts `weight` URL params (`app/tools/plates.tsx:247`).

## Existing Code Inventory (DO NOT DUPLICATE)

| Component | Location | Status |
|-----------|----------|--------|
| 1RM formulas (Epley/Brzycki/Lombardi) | `lib/rm.ts` | ✅ Complete |
| `percentageTable()` utility | `lib/rm.ts` | ✅ Complete |
| `suggest()` progressive overload | `lib/rm.ts` | ✅ Complete |
| Plate calculator (visual, kg/lb, bar config) | `app/tools/plates.tsx` (368 lines) | ✅ Complete |
| Plate calc accepts `weight` URL param | `app/tools/plates.tsx:247` | ✅ Complete |
| 1RM Calculator tool | `app/tools/rm.tsx` (220 lines) | ✅ Complete |
| rm.tsx % rows → plates deep link | `app/tools/rm.tsx:153` | ✅ Complete |
| Tools hub (Timer + 1RM + Plates) | `app/tools/index.tsx` | ✅ Complete |
| Est 1RM stat on exercise detail | `app/exercise/[id].tsx:408-415` | ✅ Complete |
| % 1RM table on exercise detail | `app/exercise/[id].tsx:426-474` | ✅ Complete |
| Bodyweight exercise exclusion | `app/exercise/[id].tsx:373-394` | ✅ Complete |
| Plate calc logic + colors | `lib/plates.ts` | ✅ Complete |
| Unit tests | `__tests__/lib/rm.test.ts`, `__tests__/lib/plates.test.ts` | ✅ Complete |

## Proposed Solution

### Feature A: 1RM Trend Chart Toggle

Add a toggle/segmented control to the existing "Weight Progression" chart on exercise detail:
- Two modes: "Max Weight" (current) | "Est. 1RM" (new)
- Est. 1RM data: for each session, compute `MAX(weight * (1 + reps/30))` from that session's sets
- Can be computed client-side from existing `getExerciseHistory()` data, or via a new optimized SQL query
- Chart component stays the same — only the data series changes
- Accessible chart summary text for Est. 1RM mode

### Feature B: 1RM Annotation in Session View

In `app/session/[id].tsx`, when showing previous sets for a weighted exercise:
- Append `(1RM: X)` to the existing set display text
- Use `estimate1RM()` from `lib/rm.ts` — pure math, no DB query needed
- Only for weighted exercises (skip bodyweight)
- Secondary text style (muted color, ≥12px font)

### Feature C: Exercise Detail % Rows → Plate Calculator

In `app/exercise/[id].tsx`, make percentage table rows tappable:
- Wrap each row (currently `View` at line 450-460) in `Pressable` or `TouchableRipple`
- On press: `router.push(/tools/plates?weight=${row.weight})`
- This mirrors the pattern already used in `app/tools/rm.tsx:153`
- Keep existing "1RM Calculator" button at bottom unchanged

## Scope

### In Scope
- Segmented control / toggle on exercise detail chart ("Max Weight" | "Est. 1RM")
- 1RM trend data computation (client-side or new query)
- Session view 1RM annotation text
- Tappable percentage rows on exercise detail → plate calculator
- Accessibility labels on all new interactive elements
- ≥12px font on all new text

### Out of Scope
- Any new calculation libraries (use `lib/rm.ts`)
- Any new screens or components
- Schema changes
- Changes to tools hub
- Changes to plate calculator or 1RM calculator tools
- New unit tests for existing calculation logic (already tested)

### Dependencies
- `lib/rm.ts` — `estimate1RM()` (already exists)
- `app/exercise/[id].tsx` — chart section + percentage table
- `app/session/[id].tsx` — previous sets display
- `app/tools/plates.tsx` — already accepts `weight` URL param

## Acceptance Criteria

- [ ] Given a weighted exercise with 2+ sessions, When user toggles chart to "Est. 1RM", Then the chart shows estimated 1RM trend over time
- [ ] Given the 1RM chart toggle, When user switches between modes, Then the chart smoothly updates without re-fetching data
- [ ] Given a user is in an active session, When viewing previous sets for a weighted exercise, Then each set shows an estimated 1RM annotation (e.g., "80×8 (1RM: 101)")
- [ ] Given a bodyweight exercise in a session, When viewing previous sets, Then no 1RM annotation is shown
- [ ] Given a user taps a percentage row on exercise detail, When tapped, Then the plate calculator opens pre-filled with that weight
- [ ] All new text uses ≥12px font size
- [ ] All new interactive elements have accessibilityLabel
- [ ] PR passes all existing tests with no regressions

### Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| Exercise with 0-1 sessions | Chart toggle hidden or shows single point |
| Set with 0 reps | Skip in 1RM trend computation |
| Set with 1 rep | 1RM = weight directly |
| Bodyweight exercise | No chart toggle, no session annotations |
| Very high reps (>30) | Use existing `estimate1RM()` behavior |

## Estimated Effort
- **Small** — ~50-100 lines changed across 2-3 existing files
- **Risk**: Very low — additive only, no schema changes, all infrastructure exists
- **Note**: Techlead suggested this may not justify a "full phase" — could be a simple enhancement ticket

## Review Feedback

### Quality Director (UX Critique)
**Review 1** (2026-04-17): NEEDS REVISION — found ~80% scope duplication. Plan revised.
**Review 2** (2026-04-17): APPROVED v2 with minor conditions (function naming, a11y roles).
**Review 3** (2026-04-17): APPROVED v3 — clean scope, comprehensive existing code inventory. Proceed to implementation. Engineer note: use `epley()`/`average()` from `lib/rm.ts` (not `estimate1RM()`).

### Tech Lead (Technical Feasibility)
**Review 1** (2026-04-17): NEEDS REVISION — confirmed scope duplication, found rm.tsx already has % → plates link, suggested chart toggle approach. Plan revised to incorporate all feedback.
**Review 2** (2026-04-17): APPROVED — v3 well-scoped, low-risk. Notes: (1) `estimate1RM()` doesn't exist — use `epley()` from `lib/rm.ts`, (2) recommend SQL query approach for 1RM chart data as sibling to `getExerciseChartData()`. No plan revision needed — corrections handled during implementation.

### CEO Decision
Accepted both reviewers' feedback. Plan rescoped from "build 1RM + plates from scratch" to "3 small incremental enhancements." Awaiting re-review approval.
