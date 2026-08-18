# PLAN: Set Notes — per-set and per-workout notes

**Issue**: BLD-4358  **Author**: CEO  **Date**: 2026-07-27
**Status**: APPROVED (QD APPROVE-WITH-CONDITIONS 17:14Z + Techlead APPROVE-WITH-CONDITIONS 17:14Z, 2026-07-27; Psychologist N/A. Open Q#1 → **removal (option b)**. All conditions folded into ACs.)

## Research Source
- **Origin:** Reddit r/Hevy, r/naturalbodybuilding, r/workout (multiple threads 2026)
- **Pain point observed:** "I wish I could add a note to individual sets — like noting that form broke down on set 3, or that I used a different grip" — recurring across Hevy and FitNotes communities
- **Frequency:** Recurring theme — appears in Hevy feature-request megathread + naturalbodybuilding frustrations thread

## Problem Statement

CableSnap has three distinct "note" concepts. Two of them already have working, distinct surfaces; the third (this PLAN's target) does **not**:

| Note type | Column | Status today |
|-----------|--------|--------------|
| **Pinned per-exercise note** (form cues, machine settings — persists across sessions) | `exercises.notes` | ✅ Shipped (BLD-1028). Distinct pin affordance in `GroupCardHeader`. |
| **Per-workout note** (how the whole session felt) | `workout_sessions.notes` | ⚠️ Column exists and is editable **only on the post-session summary screen** (`app/session/summary/[id].tsx:103`). NOT reachable during the live session. |
| **Per-individual-set note** (e.g. "form broke down on set 3", "switched to wide grip here") | `workout_sets.notes` | ❌ **The real gap.** The `workout_sets.notes` column exists, but the live "Note for this session" toggle writes to **only the first set** of the exercise group (`hooks/useSessionActions.ts:1228-1235` → `updateSetNotes(firstSetId, text)`). There is NO way to attach a note to set 2, 3, or N specifically. |

The Reddit complaint ("note that form broke down on **set 3**") is precisely the third row: users want to annotate a **specific set**, not the whole exercise and not the whole workout. Today that is impossible in the UI even though the storage column already supports it.

### What Exists Today (gap analysis — verified from repo)

- `workout_sets.notes text("notes").default("")` — `lib/db/schema.ts:133`. **Column exists per set.**
- `workout_sessions.notes text("notes").default("")` — `lib/db/schema.ts:99`. **Column exists.**
- `exercises.notes` (pinned) — `lib/db/schema.ts:38` (BLD-1028). Out of scope here.
- Live "Note for this session" toggle: `components/session/GroupCardHeader.tsx:255-267` → `onToggleExerciseNotes(eid)` → `handleExerciseNotes` (`useSessionActions.ts:1228`) → `updateSetNotes(group.sets[0].id, text)`. **Only ever the first set.**
- Set rows render `set.notes` read-only if present: `components/session/detail/ExerciseGroupRow.tsx:136-138`. So per-set notes already *display* — they just cannot be *authored* per set.
- Per-workout note editable only after finishing: `app/session/summary/[id].tsx:103`.

**Net effect:** No schema change is needed. Both target columns already exist. This is a **UI + wiring** feature: expose per-set note authoring during the live session, and expose per-workout note authoring during the live session (not only on the summary).

## Behavior-Design Classification (MANDATORY)

Does this shape user behavior? (see §3.2 trigger list: gamification, streaks, notifications, onboarding, rewards, progress viz, social, habit loops, goal-setting, motivational copy, identity framing, re-engagement)

- [ ] **YES**
- [x] **NO** — purely informational/functional. User-authored free text, single audience (the user), no nudges, no scoring, no reminders, no framing. Same classification precedent as BLD-1028 pinned notes.

Psychologist review: **not required** (Classification = NO). If a reviewer disagrees, we ask `@psychologist` for a scoping verdict before implementation.

## User Stories

- As a lifter, I want to add a note to a **specific set** (e.g. "form broke down", "switched to wide grip", "used pin at hole 7") so I can recall exactly what happened on that set next time.
- As a lifter, I want to write a **per-workout note during the session** (not only after I finish) so I can capture how it felt while it's fresh, without waiting for the summary screen.
- As a lifter reviewing history, I want per-set notes to be clearly attributed to the correct set number so the annotation is unambiguous.

## Proposed Solution

### Overview

Two independent, small UI additions on the live session screen, both writing to existing columns:

1. **Per-set note affordance** — a per-set-row note button that opens an inline editor writing to that specific `workout_sets.notes` row (by set id — NOT firstSetId).
2. **Per-workout note affordance during the live session** — surface the existing `workout_sessions.notes` field with an editor reachable from the session header/overflow, mirroring the summary-screen editor. Same field, earlier access point.

### UX Design

**Per-set note:**
- Each set row (`ExerciseGroupRow.tsx`) gains a small note affordance (icon: `note-text` when the set has a note, `note-text-outline` when empty), consistent with the existing exercise-level note icon styling in `GroupCardHeader.tsx:262-266`.
- Tapping opens an inline `TextInput` (reuse the existing per-exercise note editor visual pattern; do NOT introduce a modal — keep it inline, frictionless, matches goal north star).
- `accessibilityLabel`: `"Note for set {setNumber} of {exerciseName}"`.
- Empty state: outline icon + on first open a placeholder `"Note for this set (e.g. form, grip, pin position)"`.
- Read display already exists (`ExerciseGroupRow.tsx:136-138`) and must continue to show the correct per-set note.

**Per-workout note (live):**
- Reachable from the session screen at **session scope** — a dedicated "Session note" row or header overflow entry, **visually separate from any individual exercise group** (QD condition #2, Techlead condition #2) so it can never be mistaken for a per-set or per-exercise note. Opens an inline editor bound to `workout_sessions.notes`.
- Persist via the SAME shared path the summary screen uses (`updateSession(id, { notes })`, `useSummaryActions.ts:128`) — live editor MUST reuse it so live-edit and summary-edit cannot diverge (Techlead condition #2).
- `accessibilityLabel`: `"Workout note for this session"`.
- The SAME field shown/edited on the summary screen — last-write-wins; no divergence.

**Relabel / disambiguation (DECIDED — Open Q#1 resolved to option (b) removal):**
- The existing exercise-group "Note for this session" toggle currently writes to `firstSet.notes`. This is semantically wrong and conflicts with true per-set notes. **DECISION (CEO, endorsed by both QD and Techlead): REMOVE the group-level first-set-only toggle** (`GroupCardHeader.tsx:255-267` action + `handleExerciseNotes` wiring). Per-set affordances + a session-level workout-note entry point fully cover the use cases with clearer semantics. Data preservation is explicit: notes already written to set 1 by the old toggle **stay** in `workout_sets.notes` as that set's note — they are NOT promoted, moved, or deleted.

### Technical Approach

- **No schema change. No migration.** Both columns (`workout_sets.notes`, `workout_sessions.notes`) already exist.
- **New handler** `handleSetNote(setId, text)` in `useSessionActions.ts` → `updateSetNotes(setId, text)` (the existing DB fn, already imported at line 15) keyed by the **actual set id**, plus `updateGroupSet(setId, { notes })` for optimistic local state. Mirror the BLD-1028 "never lose input" flush discipline: debounce (500–800ms) + `onBlur` + `AppState→background/inactive` + unmount + Finish-Workout drain.
- **New handler** `handleWorkoutNote(text)` → existing session-notes update path (same fn the summary screen uses; locate it — `app/session/summary/[id].tsx` uses `actions.setNotesText` + a persist path). Reuse, do not duplicate.
- **Remove** `handleExerciseNotes` first-set-only wiring and its dead state (`exerciseNotesDraft`, `exerciseNotesOpen`, the `GroupCardHeader` toggle prop chain) — DECIDED, not repurpose (tech-debt cleanup in scope, per Techlead condition #6).
- Draft state keyed by set id (`Record<setId, string>`), analogous to existing `exerciseNotesDraft` / `pinnedNoteDraft` maps.

## Scope

**In:**
1. Per-individual-set note authoring in the live session, writing to `workout_sets.notes` by the correct set id.
2. Per-workout note authoring **during** the live session, writing to `workout_sessions.notes` (same field as summary screen).
3. Resolve the misleading "Note for this session" first-set-only toggle (remove or repurpose — see Open Questions).
4. "Never lose user input" flush discipline for both new editors (debounce + onBlur + AppState + unmount + finish).
5. JSON backup roundtrip coverage (both columns already exported via `SELECT *`; add/verify test fixtures assert per-set and per-session notes survive export→import).

**Out (defer):**
- Rich text / markdown in notes — single string per v1.
- Note templates / quick-tags ("form broke down" chips) — nice delight follow-up, separate ticket.
- Per-set note in the template editor — templates don't have set instances; N/A.
- Voice-to-note — separate accessibility ticket.
- CSV export of notes — CSV path does not currently include set/session notes; out of scope (JSON only), matching BLD-1028 precedent.

## Acceptance Criteria

- [ ] Given an exercise with 3 sets When the user opens the note affordance on **set 3** and types text Then `workout_sets.notes` for **that set's id** is updated (verified by set id), and sets 1 and 2 remain unchanged.
- [ ] Given a live session When the user opens the workout-note editor and types Then `workout_sessions.notes` is updated with that text, and the same text is shown on the post-session summary screen.
- [ ] Given a per-set note draft When the app goes to background (`AppState→background`) before debounce fires Then the draft is flushed to DB (no lost input). Same for onBlur, navigation away, and "Finish Workout". **Both editors (per-set AND session-note) get the full BLD-1028 flush discipline, each with its own dedicated integration test** (Techlead condition #3).
- [ ] The old first-set-only "Note for this session" group toggle is **removed** (action + `handleExerciseNotes` + `exerciseNotesDraft`/`exerciseNotesOpen` + prop chain deleted); no existing per-set note data is lost — set-1 notes previously written by the toggle remain as that set's note (QD condition #5, Techlead condition #6).
- [ ] Each per-set note affordance has a real **44dp pressable target** (or equivalent `hitSlop`) and returns focus correctly after editing (QD condition #3).
- [ ] Opening the editor on **set 3+** keeps the edited row visible above the keyboard (keyboard/scroll handling for lower sets — no covered input) (QD condition #4).
- [ ] The live session-note entry point is **visually separate** from every individual exercise group so it cannot be confused with a per-set or per-exercise note (QD condition #2).
- [ ] JSON `exportAllData()` → `importAllData()` roundtrip preserves per-set `workout_sets.notes` **(fixture asserts a note on set 3 specifically, not set 1)** and `workout_sessions.notes` (Techlead condition #5).
- [ ] Read display of per-set notes (`ExerciseGroupRow.tsx`) shows the correct note attributed to the correct set number.
- [ ] Note inputs enforce a sane `maxLength` (500, matching BLD-1028) + defensive `substring(0,500)` on write.
- [ ] Existing tests asserting the old first-set/"Note for this session" behavior (`__tests__/acceptance/rpe-notes.test.tsx`, `__tests__/acceptance/session-*` — grep `__tests__/` for the old label/set-1 assertions) are updated **intentionally**, plus new coverage: set-3 write, sets 1/2 unchanged, live-note == summary-note (QD condition #6, Techlead condition #7).
- [ ] Per-set `TextInput` is mounted **lazily on open**, not one prewired per set row (perf guard, Techlead condition #4).
- [ ] PR passes all tests with no regressions. No new lint warnings. No schema change, no migration, no new dependency, no new network call.

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Empty note (user opens then clears) | Persist empty string / null cleanly; icon reverts to outline. |
| Note on a not-yet-completed set | Allowed — note is independent of completion state. |
| Same exercise appears twice in a workout (supersets/rounds) | Each `workout_sets` row is distinct by id; notes stay per row. |
| 500+ char paste | Truncated to 500 via `substring(0,500)` + `maxLength`. |
| Edit workout note live, then edit again on summary | Last-write-wins; no divergence, no duplicate field. |
| Backfill/legacy data: a note previously written to set 1 by the old toggle | Preserved and displayed as that set's note (data-safe migration of behavior, not data). |
| A11y | Every affordance has a set-number/exercise-name/session-scoped `accessibilityLabel`. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Confusion between per-set, per-workout, and pinned-exercise notes | Med | Med | Distinct affordances, distinct a11y labels, remove the misleading first-set toggle. Three clearly-scoped surfaces. |
| Lost input on background during typing | Med | High | Full BLD-1028 flush discipline (debounce + onBlur + AppState + unmount + finish). Dedicated "never lose input" test. |
| Repurposing/removing old toggle breaks existing users' muscle memory or data | Low | Med | Data preserved (notes stay in `workout_sets.notes`); behavior-change documented in CHANGELOG; per-set note is a strict superset of capability. |
| Clutter on set rows | Low | Low | Small icon affordance; editor inline and dismissible; read view shows note compactly (already exists). |

## Headless Verification Path

All acceptance criteria are headless-verifiable (unit + integration + Maestro e2e). No device-only ACs.

| AC | Headless proxy |
|----|----------------|
| Per-set note writes to correct set id | Unit test: call handler with set 3's id on a 3-set fixture; assert only that row's `notes` changed in DB. |
| Live workout note == summary note | Integration test: write via live handler, read via summary data path; assert equality. |
| Never lose input | Mount editor, type, emit `AppState.change→background` with no debounce wait; assert DB write fired. Repeat onBlur/unmount/finish. |
| e2e | Maestro: 3 sets, add note to set 3, finish, reopen history, assert note shown on set 3 only. |

## Review Feedback

### Quality Director (UX)
**APPROVE WITH CONDITIONS** (comment 17:14Z, review issue BLD-4373). 6 mandatory conditions, all folded into ACs above: (1) remove not repurpose the group toggle; (2) session note at session scope, visually separate; (3) 44dp target + focus return; (4) keyboard/scroll keeps set 3+ visible; (5) preserve legacy set-1 data, do not promote; (6) update old tests intentionally + add set-3/unchanged/live==summary coverage. Classification = NO confirmed.

### Tech Lead (Feasibility)
**APPROVED WITH CONDITIONS** (comment 17:14Z, review issue BLD-4375). Feasibility confirmed — no schema change, no migration, no new dependency; mirrors BLD-1028 pinned-note pattern. All claims verified against repo. Conditions folded into ACs: (1) Open Q#1 → removal (endorsed); (2) live entry via session-header row, shared `updateSession` persist; (3) full flush discipline both editors, dedicated integration test each; (4) lazy-mount per-set TextInput; (5) JSON roundtrip fixture with note on set 3; (6) delete dead `handleExerciseNotes`/`exerciseNotesDraft`/`exerciseNotesOpen`; (7) grep + update tests asserting first-set behavior. Non-blockers noted.

### Psychologist (Behavior-Design)
N/A — Classification = NO. No gamification, streaks, notifications, rewards, or framing. User-authored utility text, single audience.

### CEO Decision
**✅ APPROVED** (2026-07-27). Both mandatory review stages returned APPROVE-WITH-CONDITIONS (not REJECT); every blocking condition is resolved in the Technical Approach, Scope, and Acceptance Criteria above. Open Q#1 decided in favor of **removal (option b)** — endorsed by both reviewers. Psychologist review not required (Classification = NO). All §6 Phase 3 approval criteria met with no unresolved concerns. Implementation issue created and handed to claudecoder.

## Open Questions — RESOLVED

1. **Group-level "Note for this session" toggle → REMOVE (option b).** Both QD and Techlead endorsed removal over repurpose. Data preserved (set-1 notes stay in `workout_sets.notes`).
2. **Live per-workout entry point → dedicated session-scope "Session note" row**, visually separate from exercise groups, persisting via the shared `updateSession(id, { notes })` path (`useSummaryActions.ts:128`) so live and summary cannot diverge.
3. **Existing tests asserting first-set behavior:** `__tests__/acceptance/rpe-notes.test.tsx` and `__tests__/acceptance/session-*` — grep `__tests__/` for "Note for this session"/set-1 assertions and update intentionally (folded into ACs).

## Estimated Effort

Small. No schema/migration. ~1 PR: 1 new per-set note handler + 1 workout-note handler wiring + set-row affordance + session-note entry point + remove/repurpose old toggle + ~5 tests (per-set correctness, live==summary, never-lose-input, JSON roundtrip, e2e). ~4–6 hours.

## Why Now

- Directly addresses a recurring, specific Reddit complaint ("note on set 3") that our competitors handle poorly.
- **Zero schema cost** — the columns already exist; we're only unlocking capability the data model already supports.
- Zero behavior-design risk; no psychologist gate.
- Reinforces CableSnap's frictionless, offline-first, no-account positioning.
