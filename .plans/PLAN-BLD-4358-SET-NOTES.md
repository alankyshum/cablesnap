# Feature Plan: Per-Set Notes

**Issue**: BLD-4358  **Author**: CEO  **Date**: 2026-07-27
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

## Research Source
- **Origin:** Reddit r/Hevy, r/naturalbodybuilding, r/workout (multiple threads 2026)
- **Pain point observed:** "I wish I could add a note to individual sets — like noting that form broke down on set 3, or that I used a different grip" — recurring across Hevy and FitNotes communities
- **Frequency:** Recurring theme — appears in Hevy feature request megathread + r/naturalbodybuilding frustrations thread.

## Problem Statement

CableSnap has **no way to attach a note to an individual set**. A lifter who wants to record "form broke down here," "last rep was a grind," "dropped to safety pins," or "switched to a false grip" on set 3 of an exercise has nowhere to put that observation at the granularity it belongs.

**What already exists today (verified against repo):**
- `workout_sessions.notes` column exists and is fully surfaced via `RatingNotesCard` (session-level "Session notes"). **Per-workout notes are DONE — out of scope for this plan.**
- `workout_sets.notes` column **exists** (`lib/db/schema.ts:133`) with `default("")`.
- BUT the only UI that writes it is the "Note for this session" affordance in `GroupCardHeader.tsx`, which writes to **the first set of the exercise group only** (`hooks/useSessionActions.ts:1232` → `updateGroupSet(firstSetId, { notes })`). It is an *exercise-group-level* note bolted onto set[0].notes, not a true per-set note.
- Pinned per-exercise notes are a separate, already-shipped feature (BLD-1028, `exercises.notes`).

**The gap:** the `workout_sets.notes` column is present but there is no affordance to view/edit a note on **each individual set row**. The data model is ready; this is primarily a UI/UX + wiring feature.

## Behavior-Design Classification (MANDATORY)
Does this shape user behavior? (see §3.2 trigger list)
- [x] **NO** — purely informational/functional. A free-text note field on a set. No streaks, badges, reminders, notifications, motivational copy, progress gamification, or re-engagement mechanics. Psychologist review **not required**.
- [ ] YES

> Guardrail: implementation MUST NOT add celebrations, haptics-on-save, toasts, or any nudge. This mirrors the SetRow hard-exclusions header (`components/session/SetRow.tsx:1-21`). If any such element is proposed, flip Classification to YES and require fresh psychologist review.

## User Stories
- As a lifter mid-session, I want to jot a short note on **one specific set** (e.g. "form broke down", "grind", "dropped pin to hole 5") so I remember exactly what happened on that set later.
- As a lifter reviewing a past session, I want to **see** which sets had notes and read them, so my log tells the full story.
- As a user, I want per-set notes to survive edit/re-open of a session and to be included in export/import, so my data is durable and portable.

## Proposed Solution

### Overview
Add a per-set note affordance to the live-session set row and the session-detail read view, writing to the existing `workout_sets.notes` column for **that specific set** (not set[0]). Reuse existing per-set chip / sheet patterns already established for tempo, pulley-pin, grip, and attachment.

### UX Design

**Live session (SetRow):**
- Add a small **note icon affordance** to the set row's action cluster, consistent with the existing per-set chips (attachment/tempo/pin/grip). Icon: `note-text-outline` when empty, `note-text` (filled) when the set has a note — same icon vocabulary already used in `GroupCardHeader.tsx:263`.
- Tapping opens a lightweight bottom sheet (`SetNoteSheet`) with a single multiline `Input type="textarea"`, `maxLength={280}`, placeholder "Note for this set (e.g. form broke down, grip change)…", saving on blur / sheet-dismiss. Reuse the `Input` + sheet pattern from `RpeSheet.tsx` / `RatingNotesCard.tsx`.
- When a set has a note, show a **one-line truncated preview** beneath the set row (ellipsized, tap to edit), mirroring the `pinnedNotePreview` placement precedent noted in `GroupCardHeader.tsx`.
- No note icon rendered until the row is rendered (no empty-state clutter beyond the outline icon, which is consistent with other unset chips).

**Session detail (read/review):**
- In `ExerciseGroupRow.tsx` / session-detail set rendering, display any per-set note as a subtle secondary text line under the set's weight×reps, prefixed with the note icon. Read-only in the summary/detail unless the session is in edit mode (respect existing `edited_at` edit-mode gating).

**Disambiguation from existing "Note for this session" (group note):**
- The current `GroupCardHeader` "Note for this session" affordance writes to set[0].notes. To avoid two competing writers of set[0].notes, **relabel and rescope**: the group-header affordance is migrated to a dedicated exercise-group note. **Decision for reviewers:** two options —
  - **Option A (preferred):** Keep the group-header note but move its storage off `set[0].notes` onto a clean per-group-per-session store, freeing `workout_sets.notes` to mean *only* true per-set notes. Cleanest data model.
  - **Option B (smaller):** Leave the group-header writing to set[0].notes as-is; per-set notes UI simply edits each set's own note. Risk: set[0] shows both the "group note" and its own "set note" in the same column — collision/confusion on set 1.
  - Techlead + QD to rule on A vs B. Plan defaults to **Option A** for correctness; if A is deemed too large, split A into a follow-up and ship B-safe (see Risks).

**Accessibility:**
- Note icon has a11y label: `"Set N note. {empty|has note}. Double-tap to edit."`
- Sheet textarea is focus-managed and VoiceOver-navigable, matching `RpeSheet` focus handling.
- Preview line is exposed to screen readers as `"Set N note: {text}"`.

**Empty / error states:**
- Empty note: outline icon, no preview line.
- Whitespace-only note is normalized to `""` on save (treated as no note).
- Save is local SQLite write; no network → no network error path.

### Technical Approach

**Data model:** No migration needed. `workout_sets.notes TEXT DEFAULT ""` already exists (`schema.ts:133`). (Option A adds one new small store for group notes — see below.)

**Write path:**
- New callback `updateSetNote(setId, text)` in `useSessionActions.ts` calling the existing `updateGroupSet(setId, { notes })` (or the direct set-update helper), keyed on the **actual set id**, not the first set.
- Normalize whitespace-only → `""`.

**Read path:**
- `SetWithMeta` (`components/session/types.ts`) already carries `notes` (it's selected from `workout_sets`). Confirm it is threaded to `SetRow` props; if not, thread it.
- Session detail already reads set rows; add note rendering in `ExerciseGroupRow.tsx`.

**New components:**
- `components/session/SetNoteSheet.tsx` — bottom sheet with textarea (pattern-match `RpeSheet.tsx`).
- Note icon + preview additions inside `SetRow.tsx` (respecting its lint exclusions header; no new behavior-design elements).

**Option A storage (if approved):** add `session_exercise_notes` (or a `notes` column on a per-session-exercise pivot) so the group-header note no longer squats on `set[0].notes`. Migration via `migrations.ts` ALTER/CREATE following the BLD-1028 column-pair precedent. **If Option A is descoped, this is a separate follow-up issue and this plan ships Option B.**

**Export/Import:** `workout_sets.notes` should already flow through export/import since it's an existing column — **AC requires a test proving per-set note round-trips.** Verify in `lib/import-export`.

**Performance:** Per-set note is a single indexed-by-id SQLite update on blur; negligible. Preview line is a single truncated Text — no measurable render cost across typical 3–5 sets/exercise.

## Scope

**In:**
- Per-set note affordance (icon + sheet) on live-session set rows, writing to that set's `workout_sets.notes`.
- Truncated per-set note preview under the set row.
- Read-only per-set note display in session detail/summary.
- Whitespace normalization.
- Export/import round-trip verification test.
- Disambiguation of the existing group-header "Note for this session" affordance (Option A preferred; Option B fallback).

**Out:**
- Per-workout / session notes (already shipped via `RatingNotesCard`).
- Pinned per-exercise notes (BLD-1028, already shipped).
- Rich text, attachments, images, or voice notes.
- Notifications, reminders, sharing, or any behavior-shaping mechanic.
- Search across notes (possible future issue).

## Acceptance Criteria
- [ ] Given a live session set row When the user taps the set's note icon and types "form broke down" Then that text is saved to **that specific set's** `workout_sets.notes` (verified by set id, not set[0]).
- [ ] Given a set with a saved note When the row renders Then a filled note icon and a one-line truncated preview are shown; Given no note Then an outline icon and no preview.
- [ ] Given a note of only whitespace When saved Then it is normalized to `""` and the row shows the empty state.
- [ ] Given two different sets of the same exercise When notes are added to each Then each set retains its own distinct note (no cross-contamination, no set[0] collision).
- [ ] Given a session with per-set notes When viewed in session detail/summary Then each set's note is displayed read-only under that set.
- [ ] Given a session with per-set notes When exported and re-imported Then every per-set note round-trips exactly (test required).
- [ ] Given a re-opened/edited session Then existing per-set notes persist and remain editable.
- [ ] A11y: note icon and preview expose correct screen-reader labels per UX section.
- [ ] No new behavior-design elements introduced (no toast/haptic/celebration on save). SetRow hard-exclusions header remains satisfied.
- [ ] PR passes all tests with no regressions; no new lint warnings.

### Headless Verification Path
This is a UI feature; all ACs are verifiable headlessly via unit/component tests + logic tests. No device-only AC.

| Would-be device AC | Risk it covers | Headless proxy |
|--------------------|----------------|----------------|
| "Tapping note icon on set 3 saves to set 3" | Wrong-set write (set[0] collision bug) | Component/hook test asserting `updateSetNote(set3Id, txt)` mutates only set 3's row in SQLite |
| "Notes visible on device in detail view" | Read path wiring | Render test on `ExerciseGroupRow` asserting note text renders under the correct set |
| "Notes survive export/import on device" | Data durability | Pure logic round-trip test through `lib/import-export` |
| "Screen reader announces note" | A11y | Assert `accessibilityLabel` strings on icon + preview in component test |

No device AC lacks a proxy; no waiver required.

## Edge Cases
| Scenario | Expected |
|----------|----------|
| Empty note | Outline icon, no preview line |
| Whitespace-only | Normalized to `""`, empty state |
| Very long note | Capped at `maxLength=280`; preview truncates with ellipsis |
| Two sets, different notes | Each independent; no set[0] collision |
| Existing group-header "Note for this session" present on set[0] | No double-render / collision (resolved by Option A/B decision) |
| Re-open / edit session | Notes persist and editable per edit-mode gating |
| Export → import | Every per-set note round-trips exactly |
| Deleted set | Its note is removed with the set (FK/cascade behavior unchanged) |
| A11y / VoiceOver | Icon + preview announce correct labels |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| set[0].notes collision between existing group note and new per-set note | High if Option B | Medium (user confusion, overwrite) | Prefer Option A (separate group-note store). If B, guard set[0] rendering to show only the set note in the per-set affordance and keep group note in header only |
| Option A migration scope creep | Medium | Medium (larger PR) | Split Option A into a follow-up; ship B-safe first if techlead flags A as too large |
| SetRow is already large + lint-exclusion-heavy | Medium | Low | Put note UI in a new `SetNoteSheet.tsx`; keep SetRow additions minimal; do not introduce excluded behavior-design elements |
| Export/import silently drops notes | Low | High (data loss) | Mandatory round-trip test as AC |
| Note preview clutters dense set rows | Medium | Low | One-line truncation; preview only when note non-empty |

## Review Feedback
### Quality Director (UX)
_Pending_
### Tech Lead (Feasibility)
_Pending_
### Psychologist (Behavior-Design)
N/A — Classification = NO (no behavior-shaping triggers).
### CEO Decision
_Pending_
