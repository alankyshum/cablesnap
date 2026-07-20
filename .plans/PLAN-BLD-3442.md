# Feature Plan: One-Tap Repeat-Previous-Set (In-Session)

**Issue**: BLD-3442  **Author**: CEO  **Date**: 2026-07-20
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

## Problem Statement
Reddit's #1 recurring workout-tracker complaint in 2026 is "too many taps to log a set."
The fastest apps let a user confirm a set in 2–3 seconds by reusing prior numbers.

CableSnap already leads on this for the common case: positional prefill from the previous
session + a single-tap checkmark completes a prefilled row (`SetRow` checkmark →
`useSessionActions.ts:619-671`), plus a "Last" refill pill that fills empty rows from the
previous *session*.

**The genuine remaining gap (codebase-verified):** when a user **adds an extra set beyond
the previous session's set count** — e.g. a 4th set when last session had 3 — the newly added
row has **no positional prefill candidate**. The user must dial weight and reps from scratch
via the stepper pickers. There is no affordance to copy the set the user **just completed
seconds ago in the current session**. Adding "one more set" is an extremely common lifting
behavior (AMRAP finishers, feeling strong, drop sets), so this hits real users often.

## Behavior-Design Classification (MANDATORY)
Does this shape user behavior? (see §3.2 trigger list)
- [ ] **YES**
- [x] **NO** — purely a data-entry convenience. It reduces taps to record a set the user has
  already decided to perform. No streaks, notifications, gamification, rewards, onboarding
  hooks, progress nudges, or motivational framing. It does not encourage the user to do more
  sets; it only makes recording a set they chose to do faster.

## User Stories
- As a lifter who just did a 4th set that wasn't in last session's plan, I want to record it
  with the same weight/reps as the set I just finished, in one tap, instead of dialing both
  values from scratch.
- As a user doing straight sets (same weight × reps across all sets), I want each newly added
  set to default to my previous in-session set's values so I can just confirm.
- As a user whose next set differs, I want the copied values to remain fully editable before
  I confirm — the copy is a starting point, never a forced value.

## Proposed Solution
### Overview
Introduce an **in-session "previous set" prefill candidate** as a fallback source, ranked
below the existing positional cross-session prefill. When a row has **no cross-session prefill
candidate**, fall back to the **immediately-preceding completed set in the same exercise in
the current session** as the displayed (non-persisted) candidate. Confirming the row (the
existing single checkmark tap) persists those values exactly as the cross-session prefill path
does today.

This reuses the existing prefill display + one-tap-persist machinery rather than adding a new
write path.

### UX Design
- **No new required control for the primary flow.** An added/empty set with no cross-session
  candidate now shows the previous in-session set's weight/reps as a dimmed prefill candidate
  (identical visual treatment to today's cross-session prefill — the value shown in the picker
  but styled as "suggested / not yet logged").
- **Single tap (checkmark or swipe-right) confirms** and persists — same gesture users already
  know. No new gesture to learn for the core case.
- **Editable first:** touching either picker before confirming clears the candidate styling and
  lets the user dial a different value, exactly like the cross-session prefill today.
- **Explicit affordance (secondary, evaluate in review):** optionally add a small "repeat"
  glyph on empty rows that, when tapped, fills from the previous in-session set without marking
  complete — useful when the user wants to copy-then-edit. Decision deferred to reviewers:
  ship candidate-only (zero new controls) first, or include the glyph. Default recommendation:
  **candidate-only**, to keep the row visually minimal and avoid a11y clutter.
- **Empty state:** first set of the first exercise (no previous in-session set and no
  cross-session set) → no candidate, manual entry as today.
- **A11y:** the prefill candidate must be announced by screen readers as a suggestion, matching
  the existing cross-session prefill accessibility label pattern (reuse it — do not invent a new
  one).

### Technical Approach
- **Candidate resolution ranking** (in `useSessionData` prefill derivation, currently
  `hooks/useSessionData.ts:187-211`): for a pristine row, use existing positional
  cross-session `prefillCandidate` if present; **else** fall back to the last completed set of
  the same exercise earlier in the current in-memory session.
- The in-session fallback is derived **purely from already-loaded session state** — no new DB
  query. The current session's completed sets are already in memory.
- **Persistence path unchanged:** confirming still routes through the existing
  `useSessionActions.ts:619-671` persist-then-complete action. The candidate is just a
  different *source* for the displayed value; the write is identical.
- **Ranking must never override a real logged value or a cross-session candidate** — it is
  strictly a lowest-priority fallback for otherwise-empty rows.
- No schema change. No migration. No new table or column.

## Scope
**In:**
- In-session previous-set fallback as a display-only prefill candidate for empty rows lacking a
  cross-session candidate.
- Reuse of existing one-tap confirm/persist and a11y suggestion labeling.

**Out:**
- Swipe-to-repeat as a *distinct* gesture (existing swipe-right = complete stays as-is).
- Any auto-persist without user confirmation (candidate is always confirm-gated).
- Cross-exercise copying.
- The optional "repeat glyph" unless reviewers explicitly request it.
- Progression math changes (the "Next" suggestion pill is untouched).

## Acceptance Criteria
- [ ] Given the current session has a completed set for exercise X And a newly added empty set
      for X has no cross-session prefill candidate, When the row renders, Then its weight/reps
      pickers display the previous in-session completed set's values as a dimmed (not-logged)
      candidate.
- [ ] Given such a row shows an in-session candidate, When the user taps the checkmark once,
      Then the candidate weight/reps are persisted and the set is marked complete (single tap).
- [ ] Given such a row shows an in-session candidate, When the user adjusts either picker
      before confirming, Then the manual value is used and persisted (candidate is a starting
      point only).
- [ ] Given a row already has a cross-session positional prefill candidate, When it renders,
      Then the cross-session candidate takes precedence (in-session fallback does NOT override).
- [ ] Given a row already has a real logged value, Then no candidate (cross- or in-session)
      overrides it.
- [ ] The prefill candidate is announced to screen readers as a suggestion using the existing
      cross-session prefill a11y label pattern.
- [ ] PR passes all tests with no regressions; existing cross-session prefill tests still pass.
- [ ] No new lint warnings.

## Edge Cases
| Scenario | Expected |
|----------|----------|
| First set of first exercise, no history | No candidate; manual entry (unchanged). |
| Added set, previous session HAD a set at this set_number | Cross-session candidate wins (unchanged behavior). |
| Added set beyond previous session's count | In-session previous-set candidate shown. |
| Previous in-session set was deleted before confirming next | Fall back to the most recent *remaining* completed in-session set; if none, no candidate. |
| Unilateral (left/right) tracking rows | In-session fallback respects the same side; do not cross left/right (reuse existing side-aware copy semantics in `SetRow.tsx:261-283`). |
| Bodyweight-modifier sets | Candidate must include the same smart-defaulted modifier handling as `+ Add Set` today. |
| User edits candidate then undoes edit | Behaves like cross-session prefill today (no special-casing). |

## Headless Verification Path (device/manual ACs)
No AC requires on-device or physical verification. All ACs are covered headlessly by:
- Unit tests on the candidate-resolution ranking function (cross-session > in-session >
  none), including the precedence and "never override real value" cases.
- Component/render tests asserting the dimmed-candidate display, single-tap persist, and
  edit-before-confirm behavior.
- A11y test asserting the suggestion label is emitted for in-session candidates.
No device waiver needed.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| In-session fallback accidentally overrides a real value or cross-session candidate | Low | High (data integrity) | Strict lowest-priority ranking + explicit precedence tests. |
| Visual confusion between "suggested" and "logged" values | Med | Med | Reuse the exact existing dimmed prefill styling + a11y label; no new visual language. |
| Side (L/R) leakage in unilateral tracking | Low | Med | Reuse existing side-aware semantics; edge-case test. |
| Scope creep into swipe/glyph affordances | Med | Low | Explicitly out-of-scope unless reviewers request; ship candidate-only first. |

## Review Feedback
### Quality Director (UX)
_Pending_
### Tech Lead (Feasibility)
_Pending_
### Psychologist (Behavior-Design)
N/A — Classification = NO (pure data-entry convenience, no behavior-shaping triggers).
### CEO Decision
_Pending_
