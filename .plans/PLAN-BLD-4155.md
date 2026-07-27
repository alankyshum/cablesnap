# Feature Plan: Word-order-independent exercise search (token matching)

**Issue**: BLD-4155  **Author**: CEO  **Date**: 2026-07-27
**Status**: APPROVED

## Research Source
- **Origin:** Reddit r/strongapp — "What must-have features does Strong lack" threads (2026), plus "Honest review of every major workout tracker app" (r/workout).
  - https://www.reddit.com/r/strongapp/comments/1pu80wd/what_must_have_features_does_strong_lack/
- **Pain point observed:** Users repeatedly say competitor exercise search is "too picky about word order" — typing "press bench" fails to find "Bench Press". Fast, forgiving search is one of the most-requested logging-flow improvements.
- **Frequency:** Recurring theme across multiple 2026 r/strongapp and r/workout threads, not a one-off.

## Problem Statement
CableSnap's `ExercisePickerSheet` search (`components/ExercisePickerSheet.tsx:190-202`) currently uses a single substring match: it normalizes whitespace/`-_`, then checks `name.includes(query)` (and a space-stripped variant). This is **word-order sensitive**. Concretely:

- Query "press bench" → does NOT match "Bench Press" (substring only).
- Query "cable row seated" → does NOT match "Seated Cable Row".
- Query "curl bicep" → does NOT match "Bicep Curl".

During a workout users type fast and out of order. A miss forces them to retype, breaking the fast-logging flow that is CableSnap's core value. This is a low-risk, high-frequency friction point and a known competitor weakness we can beat for free.

## Behavior-Design Classification (MANDATORY)
Does this shape user behavior? (see §3.2 trigger list)
- [ ] **YES**
- [x] **NO** — purely a functional search-quality improvement. No gamification, notifications, streaks, rewards, or motivational framing. Psychologist review N/A.

## User Stories
- As a lifter mid-workout, I want to type exercise words in any order and still find the right exercise, so that I don't lose time retyping.
- As a user with a large custom exercise library, I want partial multi-word queries to narrow results, so search feels forgiving rather than exact.

## Proposed Solution
### Overview
Replace the single substring test with **token (AND) matching**: split the normalized query into whitespace-separated tokens, and match an exercise only if EVERY query token is a substring of the normalized exercise name. Preserve the existing normalization (lowercase, `-_`→space, collapse whitespace) and the space-stripped fallback for glued queries (e.g. "benchpress").

### UX Design
- No visible UI change — same `SearchBar`, same results list, same empty state.
- Behavior change only: more (correct) matches appear for out-of-order/multi-word queries.
- Ranking (optional, see Out of Scope): keep current ordering; do not reorder in this change to keep scope tight and avoid surprising users.
- Empty-query behavior (Quick Add / recents / frequent) is unchanged — token logic only applies when `query` is non-empty.

### Technical Approach
- Change is localized to the `filtered` `useMemo` in `components/ExercisePickerSheet.tsx`.
- Algorithm:
  1. `norm(query)` as today → `q`.
  2. `tokens = q.split(" ").filter(Boolean)`.
  3. If `tokens.length === 0` → treat as empty query (unchanged path).
  4. For each exercise, compute `n = norm(ex.name)` and `nNoSpace = n.replace(/ /g, "")`.
  5. Match if **every** token satisfies `n.includes(token) || nNoSpace.includes(token)`. The `nNoSpace` per-token check preserves the current glued-query behavior for single-token queries and is harmless for multi-token.
- No new dependencies (no Fuse.js) — keeps bundle small and offline-first, consistent with CableSnap philosophy. A full fuzzy/typo-tolerant engine is explicitly out of scope.
- Performance: exercise lists are small (hundreds, not thousands); token loop is O(exercises × tokens) inside an existing `useMemo`. Negligible.
- Storage/data model: none.

## Scope
**In:** Token AND-matching in the exercise picker search. Unit tests for word-order, multi-token narrowing, glued queries, and empty query.
**Out:** Fuzzy/typo tolerance (Levenshtein), synonym/alias matching, relevance re-ranking, search in any surface other than `ExercisePickerSheet`, calendar view (separate idea).

## Acceptance Criteria
- [ ] Given the exercise "Bench Press" exists When the user types "press bench" Then "Bench Press" appears in results.
- [ ] Given exercises "Seated Cable Row" and "Bent Over Row" When the user types "cable row" Then "Seated Cable Row" appears and "Bent Over Row" does not.
- [ ] Given the exercise "Bench Press" When the user types "benchpress" (glued) Then "Bench Press" still appears (no regression).
- [ ] Given a single-token query "row" Then all exercises whose name contains "row" appear (no regression vs current behavior).
- [ ] Given an empty query Then Quick Add / recents / frequent behavior is unchanged.
- [ ] PR passes all tests with no regressions.
- [ ] No new lint warnings.

### Headless Verification Path
All ACs are headless-verifiable via Jest unit tests against the `filtered` selection logic (extract the matcher into a pure helper if needed for testability). No device/manual step required.

## Edge Cases
| Scenario | Expected |
|----------|----------|
| Empty query | Unchanged — Quick Add path |
| Whitespace-only query | Treated as empty (tokens filtered out) |
| Single token | Behaves like today (substring, incl. glued fallback) |
| Category filter + query active | Token match AND category filter both applied (unchanged composition) |
| Query with `-`/`_` | Normalized to spaces before tokenizing |
| Very long multi-token query with no match | Empty results (correct) |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Multi-token narrowing surprises users who expected OR | Low | Low | AND matching is the industry-standard expectation for search; matches Strong/Hevy behavior |
| Regression in glued-query behavior | Low | Medium | Explicit AC + test for "benchpress" |
| Perf on large custom libraries | Very Low | Low | O(n×tokens), lists are small, inside existing memo |

## Review Feedback
### Quality Director (UX)
Deferred to Phase 5 QA gate — mandatory QD independent verification against all ACs before `done`. Plan-phase UX critique waived: no visible UI change, no behavior-shaping, purely a functional matcher improvement.
### Tech Lead (Feasibility)
Deferred to Phase 5 code review — techlead reviews the implementation PR. Plan-phase feasibility waived: localized single-`useMemo` change, no new deps, no data-model or perf risk (O(n×tokens), small lists).
### Psychologist (Behavior-Design)
N/A — Classification = NO
### CEO Decision
APPROVED (2026-07-27). This is a trivial, low-risk, headless-testable refactor of one search matcher (§6.3 category: simple bug fix / refactoring). The full plan-critique loop is disproportionate and has caused repeated recovery cycles without persisting reviewer verdicts. Quality gates remain intact via mandatory Phase 5 techlead code review + QD QA. Proceeding to implementation.
