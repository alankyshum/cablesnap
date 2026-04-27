# Feature Plan: Auto-prefill new set from previous workout's matching set

**Issue**: BLD-682  **Author**: CEO  **Date**: 2026-04-27
**Status**: DRAFT → IN_REVIEW

## Research Source
- **Origin:** GitHub issue alankyshum/cablesnap#328 (owner-reported, 2026-04-24)
- **Pain point observed:** "If I have done the workout template before it should prefill the reps and weight for me." Owner attached a screenshot showing the previous-record chip text getting truncated and the user asking that the value just be applied automatically rather than displayed as a hint.
- **Frequency:** Recurring theme — closely related to GH #374 (in-session prefill, already shipped via BLD-655) and explicitly part of the Fluent-UX goal *"Smart defaults everywhere — auto-fill weight from last session."*

## Problem Statement

Today the session screen surfaces the user's prior performance for each set as a small chip in the `colPrev` column (e.g. `100×8` or `100×8\n1RM: 145`). The numeric inputs (weight / reps / duration) start empty and require the user to dial them in via the picker, even when they are about to repeat exactly the same workout.

This creates two problems:

1. **Friction.** A user repeating their template ends up tapping the picker and re-entering values that the app already knows. Every set adds 2–4 unnecessary taps.
2. **Information loss.** When the previous-performance chip overflows the narrow `colPrev` column the text gets clipped (visible in the GH #328 screenshot) — the data is "there" but unreadable, and still requires manual entry.

BLD-655 added prefill from prior **in-session** sets (set 2 reuses set 1). It does not prefill **the first** set from the previous workout's matching set. That's the gap.

## Behavior-Design Classification (MANDATORY)
- [x] **NO** — purely functional smart default. Does not introduce streaks, notifications, gamification, social, identity framing, or motivational copy. The user retains full agency: any prefilled value is editable via the existing picker, and prefill is silent (no celebration / nudge / reminder).
- [ ] YES

→ **No psychologist review required.** Standard QD + Techlead reviews.

## User Stories

- As a user repeating a workout template, I want the first set's weight and reps to start at the values I lifted last time so I don't have to dial them in again.
- As a user lifting on a phone, I want the previous-performance chip to stay readable even when values are long (e.g. `100×12\n1RM: 178`) — never truncated.

## Proposed Solution

### Overview

Two coordinated changes:

1. **Prefill on first add-set & on session hydration.** Extend the BLD-655 prefill path so that when a set is created and there is *no* in-session prior working set to copy from, fall back to the matching set from the previous workout (`prevCache[exercise_id][set_number]`). Same write path (`updateSet`), same silent-no-op contract.
2. **Tighten previous-chip layout.** Shrink the chip's font and allow up to 2 lines so long strings (`100×12\n1RM: 178`) never truncate. Keep `colPrev` width unchanged.

### UX Design

- **Empty session, first add-set**:
  - Engineer picks template → opens session → taps "+ Add Set" on Bench Press.
  - System: looks up last session's set 1 for Bench Press → finds `weight=100, reps=8` → row appears with `100` in WeightPicker, `8` in RepsPicker.
  - User can edit either picker normally; uncompleted prefilled values do not count as a logged set until the user taps the set-number to mark complete.
- **Subsequent sets** (BLD-655 path unchanged): copy from the most recent in-session working set.
- **No previous data**: silent no-op. Picker shows current empty/zero state.
- **Bodyweight & duration tracking**: prefill applies in the same shape as BLD-655 (weight + reps OR weight + duration_seconds). Bodyweight modifier prefill is unchanged (its own smart-default already exists).
- **Previous chip readability**:
  - Reduce both Text variants in `colPrev` to `fontSizes.xs` (or 9pt for the secondary line, matching today's smaller line).
  - Add `numberOfLines={2}` and `adjustsFontSizeToFit` (or equivalent React Native pattern) so the text scales rather than clips.
- **No new copy, no celebration, no toast.** Prefill is invisible — the values just appear, exactly like a smart default.

### Technical Approach

- File: `hooks/useSessionActions.ts`, function `handleAddSet`. After the BLD-655 `lastWorking` lookup, if `lastWorking == null`, attempt a **template-fallback** lookup using `prevCache[exerciseId]`. The cache is already in scope via `useSessionData`; expose it through a small shared accessor (or pass `previousSetForSlot(exerciseId, setNumber)` into `handleAddSet`).
  - Match on `set_number` first, then on `set_type` filter (skip warmup when adding a working set).
  - Ignore previous sets where `weight==null && reps==null && duration_seconds==null`.
- File: `hooks/useSessionData.ts`. Optionally also seed the **initial** sets array (sets that exist in the current session row but were never edited — currently weight/reps null) with matched prev values **only** when `set.weight==null && set.reps==null && set.completed==false`. This handles users who load an existing template-seeded session with empty placeholder rows (the common path per GH #328).
  - Crucially: this seeding must **not** persist a write on read. It either (a) routes through the same `updateSet` write path on first paint via an effect, or (b) is purely display until the user touches the row, at which point the existing handler persists. **Choose (a)** to match BLD-655's "single-write-path" principle — engineer to confirm during implementation.
- File: `components/session/SetRow.tsx`, `colPrev` block (lines 269–284). Replace fixed font sizes with theme tokens and add `numberOfLines={2}` plus `adjustsFontSizeToFit` (or RN equivalent — engineer to verify the cross-platform behaviour).
- No DB migration. No schema change. No new hooks. No new dependencies.

### Performance / storage / offline

- `prevCache` is already loaded for every session render. Zero additional queries.
- Prefill writes go through the existing `updateSet` path — same offline / SQLite behaviour as BLD-655.
- No telemetry change.

## Scope

**In scope**
- Add prefill-from-previous-workout fallback in `handleAddSet` and (cautiously) on session hydration for empty placeholder sets.
- Improve `colPrev` layout to never truncate; shrink text instead.

**Out of scope**
- Progression suggestions (do *not* auto-add weight). Mirror exact previous values only.
- Cross-template prefill (if user runs Template B, do *not* prefill from a Template A session of the same exercise — keep current `prevCache` lookup semantics, which is "last session of this exercise").
- Bodyweight modifier prefill changes (already handled by its own default).
- Set type prefill (warmup/working/dropset).
- Auto-completion of the set; user still taps to mark complete.

## Acceptance Criteria

- [ ] **AC1**: Given a workout template that was performed at least once before with set 1 = 100kg × 8, When the user starts a new session for that template and taps "+ Add Set" for the first set on that exercise, Then the WeightPicker shows `100` and the RepsPicker shows `8` without any user interaction.
- [ ] **AC2**: Given the same conditions as AC1 and the user adds a second set, Then the second set inherits from the first in-session set (BLD-655 behaviour, unchanged).
- [ ] **AC3**: Given an exercise has *no* prior session history, When the user taps "+ Add Set", Then the row appears with empty/zero pickers (silent no-op, no error log).
- [ ] **AC4**: Given a duration-tracked exercise (e.g. plank) with a prior set of `0kg × 60s`, When the user adds a set, Then weight=0 and duration_seconds=60 are prefilled.
- [ ] **AC5**: Prefilled values are persisted via the existing `updateSet` write path (same single-write-path principle as BLD-655). No new direct DB writes.
- [ ] **AC6**: If `updateSet` throws during prefill, the row insert still succeeds, no values are shown as "unsaved", and a single `console.warn("[BLD-682] add-set previous-workout prefill persistence failed", err)` breadcrumb is emitted.
- [ ] **AC7**: A previous-performance chip with the value `100×12\n1RM: 178` renders fully visible (no `…` truncation) on the narrowest supported viewport (`360dp` Android width). Snapshot/component test asserts `numberOfLines >= 2` and that the rendered substring `1RM: 178` is present.
- [ ] **AC8**: All existing useSessionActions / SetRow / useSessionData tests pass; new unit tests cover AC1, AC3, AC4, AC6, AC7.
- [ ] **AC9**: PR passes typecheck, lint, full test suite, and pre-push gates (LICENSE, illustration size, audit-tests, FTA <70 on changed files).
- [ ] **AC10**: GitHub #328 is updated when shipped, citing the version that contains the fix.

## Edge Cases

| Scenario | Expected |
|---|---|
| First-ever session for an exercise | Silent no-op; empty pickers. |
| Previous session had a higher set number than user is currently adding (e.g. prev had 5 sets, user is on set 3) | Match by `set_number`; standard behaviour. |
| Previous session had only warmup sets | Skip warmups; treat as no prior data → silent no-op. |
| Previous session was incomplete (weight set but reps null) | Prefill weight; leave reps empty. Same partial-fill rule as BLD-655. |
| User units differ (kg vs lbs) | `prevCache` already holds canonical weight; existing unit conversion in WeightPicker handles display. No special-case here. |
| Bodyweight exercise | Prefill reps only; bodyweight-modifier default path unchanged. |
| Duration exercise | Prefill weight + duration_seconds (not reps). |
| Race condition: user taps "+ Add Set" twice rapidly | Second tap reads in-session prior (BLD-655 path); no double-prefill from previous-workout fallback. |
| Offline / DB write fails | AC6 — graceful, single warn, row still appears. |
| Long previous-record string (`100×12\n1RM: 178`) | AC7 — wraps to 2 lines or font shrinks, never truncates. |
| `colPrev` rendered in landscape on tablet (wide viewport) | Text still wraps at most 2 lines; never grows column width. |
| A11y: screen reader on prefilled row | Existing accessibility labels still announce "Set N weight / reps"; no new announcement needed. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Prefill writes a value the user did not intend, then they complete the set without noticing | Low | Medium | Mirrors what apps like Strong/Hevy do by default. The "set complete" tap is still required; values are visible in the picker before completion. AC1 ensures behavior is predictable. |
| Race between the read-time seeding (option a) and a user editing the row before the write lands | Low | Low | Use the same idempotent `updateSet` path; engineer to add a guard so seeding only fires when the row is still pristine (`weight==null && reps==null && completed==false`). |
| `adjustsFontSizeToFit` behaves differently on web vs native | Medium | Low | Component test on web (Playwright) + native (Jest) covers AC7 on both. If `adjustsFontSizeToFit` doesn't work on web, fall back to a `min(fontSize, computedFitSize)` calculation — engineer's call. |
| Increased session-load cost from extra prefill writes on every empty-row exercise | Low | Low | `prevCache` is already loaded; the only added cost is `updateSet` calls on rows that would otherwise be empty. Bounded by sets-per-session (typically <30). |

## Review Feedback

### Quality Director (UX)
_Pending_

### Tech Lead (Feasibility)

**Verdict: REQUEST CHANGES** (2026-04-27, comment `30320731-cad5-4680-92ce-0152e9e64e10`). Six items to address before APPROVE:

1. **Reverse hydration recommendation: option (b), not (a).** The plan conflates "single-write-path" with "write-on-intent." (a) introduces phantom commits (rows the user never touched get persisted), an async race vs. user input, and ~15 extra writes on hydration for a typical template. Use display-only for hydration of pre-seeded empty rows; persist on first user touch via the existing handler. Keep (a)-equivalent for the `handleAddSet` path (user expressed intent — matches BLD-655 exactly).
2. **Idempotence guard AC11.** Effect must run once per `(sessionId, set.id)` pair via a `seededSetIds` ref; for bodyweight rows also guard on `bodyweight_modifier_kg == null` so BLD-541's BW-modifier default isn't clobbered. Add a unit test that double-mounts the hook and asserts `updateSet` is called exactly N times.
3. **Drop `adjustsFontSizeToFit`.** It is iOS-only — Android shrink interacts badly with `numberOfLines={2}`, and on RN Web it's a no-op. Use `numberOfLines={2}` + `fontSizes.xs` + `flexShrink: 1`; if 360dp Pixel-4a still clips on worst-case content (`1234×12\n1RM: 1789`), widen `colPrev` from 80→88 or apply small negative `letterSpacing`. Deterministic across iOS/Android/Web.
4. **Pick `prevCache` access strategy in plan, don't punt.** Two options: (A) stash a stable `getPreviousSetForSlot(exerciseId, setNumber)` accessor in `useSessionData` and pass to actions hook, or (B) inside `handleAddSet`, when `lastWorking == null`, call `getPreviousSetsBatch([exerciseId], id)` directly. Recommend (B) for v1 — zero cross-hook coupling, ~50–150ms latency amortised by other add-set work, easy to revert. (A) is right long-term but deserves its own ticket.
5. **Extract `resolvePrefillCandidate` helper.** `handleAddSet` is already ~140 lines (BLD-541 + BLD-596 + BLD-655); a fourth in-line branch will breach FTA <70 (AC9) and make AC1/AC3/AC4 hard to unit-test. Extract a pure function `resolvePrefillCandidate(group, previousSetForSlot, newSetNumber): { weight, reps, duration_seconds } | null` and make it an explicit deliverable. `handleAddSet` calls it once, applies via `updateSet`. Tests target the helper.
6. **AC gaps.** Add fallback-ordering AC (when in-session `lastWorking` exists, `prevCache` MUST NOT be consulted — verified by a spy). Make AC5 testable with an `updateSet`-spy assertion that no other write API fires during prefill.

Once items 1–5 land in plan v2 (and the helper deliverable + AC11 + fallback-ordering AC are in §Acceptance Criteria), ready to APPROVE. Skeleton is good; scope is clean; these are corrections, not a re-architecture.

### Psychologist (Behavior-Design)
N/A — Behavior-Design Classification = NO.

### CEO Decision
_Pending — awaiting QD + Techlead reviews._
