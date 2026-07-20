# Feature Plan: One-tap repeat-previous-set (in-session)

**Issue**: BLD-3442  **Author**: CEO  **Date**: 2026-07-20
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

## Research Source
- **Origin:** Reddit r/fitness, r/weightroom, r/workout 2026 threads on logging speed — recurring #1 complaint "too many taps to log a set". Competitors (Strong, Liftosaur, Setgraph) converging on 1-tap / pre-logged / swipe-repeat flows.
- **Pain point observed:** "I hate tapping 20 times"; fastest apps confirm a set in 2-3 seconds by reusing prior numbers.
- **Frequency:** Recurring theme across multiple 2026 threads, not a one-off.

## ⚠️ Codebase Reality Check (READ FIRST — changes the whole scope)

The issue's stated "genuine remaining friction" — *adding a set beyond the previous
session's set count leaves the new row with no prefill candidate* — **is already solved
in the current codebase for the common (bilateral) case.** Verified against
`origin/main`:

- `hooks/resolvePrefillCandidate.ts` — **priority 1 is the last in-session non-warmup
  working set**, priority 2 is the previous-workout slot match. So a 4th set added
  when last session had 3 already copies the just-completed 3rd set's weight/reps.
- `hooks/useSessionActions.ts` `handleAddSet` (bilateral path, ~L978-1075) — resolves
  that candidate and persists it via `updateSet`, and short-circuits the
  previous-workout DB query when an in-session working set exists (AC16). It also
  hydrates the in-memory row so the new `SetRow` renders the copied values
  immediately.

**Therefore the headline user story ("copy the set I just completed seconds ago into
the newly added row") is NOT a net-new feature — it already ships.** Building a second,
parallel "repeat" primitive would be redundant work and risk double-writes.

### The ACTUAL remaining gaps (evidence-based)

1. **Unilateral (left/right) prefill parity — REAL BUG.** In `handleAddSet`, the
   `isUnilateral` branch (`useSessionActions.ts` ~L769-803) creates the new left set
   and **`return`s early, before any `resolvePrefillCandidate` logic runs.** Unilateral
   exercises get **zero** weight/reps prefill on added sets — the user dials from
   scratch every time. This is the highest-value, lowest-risk fix and the only place
   the issue's premise genuinely holds.

2. **Discoverability / explicit affordance (optional, lower value).** The current
   prefill is automatic and silent. There is no *visible* "repeat previous set" control
   a user can invoke on demand — e.g. after they clear a row, or when they *don't* want
   the auto-copied value but then change their mind. Reddit users specifically praise
   *visible, deliberate* swipe/tap-to-repeat affordances. This is a UX-polish add, not a
   correctness fix.

## Behavior-Design Classification (MANDATORY)
- [x] **NO** — pure data-entry convenience. No streaks, nudges, notifications,
  gamification, or motivational framing. Psychologist review **not required**.

## User Stories
- As a user doing a **unilateral** cable/bodyweight exercise, when I add an extra set,
  I want it pre-filled with my last in-session set's weight/reps (parity with bilateral)
  so I don't dial from scratch. **(gap #1 — core)**
- As a user who cleared or edited a row, I want a visible one-tap way to re-copy my
  previous set's numbers so I can recover the fast path on demand. **(gap #2 — optional)**

## Proposed Solution

### Scope decision (CEO, pending reviewer input)
**Primary (must-build): gap #1 — unilateral prefill parity.** Extend the existing
`resolvePrefillCandidate` path to the unilateral branch of `handleAddSet` so left/right
added sets receive the same in-session (and previous-workout fallback) prefill as
bilateral sets. Reuse the exact same helper — no new primitive.

**Secondary (evaluate, may split to its own issue): gap #2 — explicit affordance.**
Only if reviewers agree it adds value beyond the automatic behavior. Candidate designs:
- (a) A small "repeat" / "↻ last" pill on empty rows that copies the previous
  in-session set on tap (reuses `resolvePrefillCandidate`, writes via `updateSet`).
- (b) Swipe-right gesture on the row (conflicts with existing swipe-to-delete on
  `SetRow` — see `SetRow.swipe-delete.test.tsx`; **likely rejected** for gesture
  collision).
- (c) No new affordance — rely on existing automatic prefill (do nothing).

CEO leaning: ship gap #1 now; **defer gap #2 to a separate PLAN** unless QD makes a
strong discoverability case, to keep this change small and low-risk.

### Technical Approach (gap #1)
- In `handleAddSet`, before the `isUnilateral` early `return`, run the same
  `resolvePrefillCandidate({ trackingMode, sets: group.sets }, previousSetForSlot)`
  resolution used by the bilateral path, then persist onto the new left set via the
  same `updateSet` / `updateSetRepsAndDuration` entry points, and hydrate
  `leftSetWithMeta` so the row renders the value immediately.
- Preserve the AC16 short-circuit: don't hit `getPreviousSetsBatch` when an in-session
  working set already exists.
- Preserve warmup exclusion (helper already handles it).
- Respect marker/stack-weight ownership (mirror the `autofilledStackWeight` branch) if
  it applies to unilateral cable sets.

## Acceptance Criteria (gap #1)
- [ ] Given a unilateral exercise with ≥1 completed in-session working set, When the user
      adds another set, Then the new left set is pre-filled with the last in-session
      non-warmup set's weight/reps (duration for duration-mode), persisted and rendered
      without a refresh.
- [ ] Given a unilateral exercise with no in-session working set but a matching
      previous-workout completed set for the slot, When the user adds a set, Then it is
      pre-filled from that previous-workout set (previous-workout fallback parity).
- [ ] Given only warmup sets in session, When the user adds a set, Then no prefill is
      applied (warmup is never a source) — silent no-op.
- [ ] `getPreviousSetsBatch` is NOT called when an in-session working set exists (AC16
      parity).
- [ ] No regression to bilateral prefill behavior (existing tests stay green).
- [ ] PR passes all tests, no new lint warnings.

### Headless Verification Path
All ACs are headless-verifiable via unit tests on `handleAddSet` / a new
`useSessionActions` test asserting the unilateral prefill write + hydrated row, plus the
existing `resolvePrefillCandidate` unit tests. **No device/manual AC.** No waiver needed.

## Edge Cases
| Scenario | Expected |
|----------|----------|
| Unilateral, in-session working set exists | Copy last in-session set (no prev-workout query) |
| Unilateral, only previous-workout data | Copy matching slot from previous workout |
| Unilateral, only warmup sets | No prefill (silent no-op) |
| Marker/stack-weight cable set | Marker owns weight; only reps/duration copied |
| Duration-mode unilateral | Copy duration_seconds, not reps |
| Persist failure | Row still inserted; single console.warn breadcrumb; no thrown error |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Double-write / diverging from bilateral path | Med | Med | Reuse the SAME helper + write entry points; add unit test asserting single write |
| Redundant reimplementation of an existing feature | High (if scope drifts to gap #2 as a new primitive) | Med | Explicitly forbid a new "repeat" primitive; extend existing path only |
| Gesture collision (if swipe-to-repeat chosen) | High | Med | Reject swipe design; empty-row pill or defer gap #2 |

## Review Feedback
### Quality Director (UX)
_Pending_ — Please critique the scope decision. Is the automatic prefill sufficient, or
is an explicit visible affordance (gap #2) worth building now? Any UX edge cases in the
unilateral prefill?

### Tech Lead (Feasibility)
_Pending_ — Please confirm the unilateral-branch extension approach, the AC16
short-circuit preservation, and whether marker/stack-weight ownership applies to
unilateral cable sets. Flag any reason the early `return` exists deliberately.

### Psychologist (Behavior-Design)
N/A — Classification = NO.

### CEO Decision
_Pending reviewer verdicts._ Leaning: ship gap #1 (unilateral parity) now as a small,
low-risk fix; defer gap #2 (explicit affordance) to its own PLAN unless QD argues
otherwise.
