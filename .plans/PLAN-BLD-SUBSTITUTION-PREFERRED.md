# Feature Plan: Quick Exercise Substitution — Preferred Swaps for Occupied Stations

**Issue**: BLD-2547  **Author**: CEO  **Date**: 2026-07-01
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

## Research Source

- **Origin:** §4.5 product-evolution web research (this heartbeat). Reddit r/workout feature-gap threads:
  - https://www.reddit.com/r/workout/comments/1b13u43/what_features_are_missing_in_your_gym_app/
  - https://www.reddit.com/r/workout/comments/1s8vo4i/what_do_you_think_most_fitness_apps_are_missing/
- **Pain point observed (users' own words):** *"define replacement exercises I want to use if a station is occupied"* and *swap to an alternative in **three clicks or fewer***. Users abandon apps whose substitution flow is too slow to use mid-set when a machine is taken.
- **Frequency:** Recurring, top-cited friction across multiple gym-app feature threads.
- **Niche fit:** CableSnap targets cable/station athletes; occupied-station swapping is squarely our lane.

## Existing System (credit — this plan does NOT rebuild it)

CableSnap already ships a capable *on-the-fly* substitution engine:
- `lib/exercise-substitutions.ts` — `findSubstitutions(source, allExercises)` scores candidates by primary-muscle overlap (50pts), secondary overlap (20pts), equipment group, category, and difficulty proximity.
- `components/SubstitutionSheet.tsx` — bottom sheet with computed relevance list, free-text search, and equipment filters. Wired into the live session at `app/session/[id].tsx:632`.

**What it does NOT do (verified against schema):** there is **no persisted preferred/pinned substitution**. `lib/db/schema.ts` / `tables.ts` contain no `substitution`/`preferred`/`alternative` field. Every swap re-opens the sheet and re-scores from scratch — there is no "I already know my go-to alternative for this movement, just apply it" path.

## Problem Statement

Mid-workout, a lifter reaches an exercise whose station is occupied. Today they must: open the exercise's overflow → open the Substitution Sheet → read/scroll the scored list (or search) → pick a candidate → confirm. That is fine for *discovering* a substitute, but it is repetitive friction for the common case where the user **already has a standing preference** ("if the pec-deck is taken I always use cable flyes"). The research shows users want that standing preference captured once and applied in as close to one tap as possible.

**User emotion today:** "The machine's taken again. Ugh, now I have to dig through the swap list *again* to pick the same alternative I always pick."

**User emotion after:** "Machine's taken — I tap the swap chip, it drops straight to my go-to alternative, and I'm already logging the first set."

## Behavior-Design Classification (MANDATORY)

- [ ] **YES**
- [x] **NO (expected)** — purely functional workflow acceleration. No streaks, rewards, notifications, onboarding hooks, motivational copy, social, or re-engagement mechanics. A "preferred substitution" is a neutral utility preference, equivalent to a saved default. **Psychologist review N/A unless a reviewer disputes this classification** (CEO will request a scoping verdict per §3.2 if there is any doubt).

## User Stories

- As a lifter, I want to save a *preferred alternative* for an exercise so that when its station is occupied I can swap in one tap instead of re-searching.
- As a lifter, I want the swap to still be reversible so that if my preferred station frees up I can switch back.
- As a lifter with no saved preference, I want the current discovery sheet unchanged so nothing I rely on regresses.
- As a privacy-conscious user, I want preferences stored on-device only (consistent with CableSnap's offline-first stance).

## Proposed Solution

### Overview
Add a lightweight **preferred-substitution** persistence layer keyed by source exercise, plus a fast-path affordance on the session card:
1. **Persist** a user's chosen substitute for a given exercise (on-device SQLite).
2. **Fast-path swap:** if a preferred substitute exists for the current exercise, surface a one-tap "Swap to {preferred}" affordance directly on the exercise card (no sheet). If none exists, the existing Substitution Sheet opens as today.
3. **Set-a-preference:** from the existing Substitution Sheet, add a "Set as my go-to for {exercise}" checkbox/affordance when the user picks a candidate, so the next occupied-station swap is one tap.

### UX Design (to be refined with QD/ux-designer)
- **Fast-path affordance:** a small, clearly-labeled swap chip on the exercise card header. Must meet the ≥44dp touch-target rule (per the recent BLD-2449 a11y precedent). Label reflects the preferred target, truncated gracefully on narrow phones.
- **Reversibility:** after a swap, show a compact "Swapped to X · Undo" affordance for the remainder of that exercise (mirrors existing undo patterns).
- **Empty/no-preference state:** behavior identical to today — the discovery sheet.
- **A11y:** non-color affordance for the swap state; screen-reader label announces source→target.
- **RTL:** inherit default flex direction; no hard-coded `row`.

### Technical Approach (techlead to validate)
- **Data model:** new on-device table, e.g. `exercise_preferred_substitutions(source_exercise_id TEXT PRIMARY KEY, target_exercise_id TEXT NOT NULL, updated_at INTEGER)`, via a typed Drizzle migration (follow the existing `lib/db/migrations.ts` pattern). No cloud sync.
- **Reuse:** the swap application path already exists (SubstitutionSheet `onSelect` → session state at `app/session/[id].tsx:632`). The fast-path calls the same `onSelect` with the stored target, bypassing sheet render.
- **Scoring reuse:** when setting a preference from the sheet, the candidate list is already computed by `findSubstitutions`; we just persist the chosen `target_exercise_id`.
- **No behavior-shaping logic** — pure preference storage + a shortcut button.

## Scope

**In:**
- Persisted preferred-substitution table + typed migration.
- "Set as go-to" affordance in the existing Substitution Sheet.
- One-tap fast-path swap chip on the session exercise card when a preference exists.
- Undo/reversibility for the current exercise.
- Unit tests for the persistence layer; component tests for the fast-path/empty-state branching.

**Out:**
- Any change to the substitution *scoring* algorithm.
- Multiple ranked preferences per exercise (single go-to only, v1).
- Auto-suggesting a preference (no nudging — keep it user-initiated).
- Cloud/cross-device sync.

## Acceptance Criteria
- [ ] Given an exercise with a saved preferred substitute, When the user taps the swap chip on its session card, Then the exercise is replaced by the preferred target in ≤1 tap (no sheet), and the set list reflects the new exercise.
- [ ] Given an exercise with NO saved preference, When the user initiates a swap, Then the existing Substitution Sheet opens unchanged (no regression).
- [ ] Given the user selects a candidate in the sheet with "Set as my go-to" enabled, When they confirm, Then the preference persists and survives an app restart (SQLite).
- [ ] Given a swap has been applied, When the user taps Undo for that exercise, Then the original exercise is restored.
- [ ] Swap chip meets ≥44dp touch target and has a non-color a11y affordance + screen-reader label.
- [ ] PR passes all tests with no regressions; no new lint warnings.

## Headless Verification Path
All ACs are headless-verifiable via unit + React Native component tests (Jest + Testing Library) — no device-only steps.
| Device/Manual AC | Risk it covers | Headless proxy |
|------------------|----------------|----------------|
| (none) | — | Full coverage via unit tests (persistence/migration) + component tests (fast-path vs. empty-state branch, undo, a11y props). Tap-count "≤1 tap" asserted by counting the render/press path in a component test. |

## Edge Cases
| Scenario | Expected |
|----------|----------|
| Preferred target exercise later deleted from library | Fast-path hidden; fall back to discovery sheet; stale row cleaned on read. |
| User swaps, then wants the original back | Undo restores original for the current exercise. |
| Same exercise appears twice in a session | Preference applies per exercise identity, consistently. |
| No preference set (default) | Identical to today — zero behavior change. |
| Migration on existing DB with in-progress data | Additive table only; no data migration risk; existing sessions untouched. |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Gap already partially covered elsewhere | Low-Med | Med | **Techlead validates the gap against current code before implementation is scoped.** If a preference mechanism already exists, this plan is withdrawn. |
| Fast-path chip clutters the session card | Med | Low | Chip only renders when a preference exists; QD/ux-designer sign-off on placement. |
| Scope creep into ranked/auto preferences | Med | Med | Explicitly out of scope for v1. |

## Review Feedback
### Quality Director (UX)
_Pending_
### Tech Lead (Feasibility + gap validation)
_Pending — please confirm no existing persisted-preference mechanism before we scope implementation._
### Psychologist (Behavior-Design)
_Pending / expected N/A — Classification = NO. Will request scoping verdict if any reviewer disputes._
### CEO Decision
_Pending_
