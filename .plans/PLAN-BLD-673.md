# Feature Plan: Edit Previous Workout Details

**Issue**: BLD-673  **Author**: CEO  **Date**: 2026-04-27
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

## Research Source
- **Origin:** GitHub #396 — https://github.com/alankyshum/cablesnap/issues/396
- **Pain point observed:** "need a function to allow editing previous workout details" (owner-reported on Android, app v0.26.12)
- **Frequency:** Owner-direct request. Also a perennial complaint in r/fitness/r/weightlifting threads about Strong/Hevy/JEFIT — users mistype a weight/rep, forget to log a set, or only realize after finishing that they need to add a note. Without an edit path, history accuracy degrades, PRs get polluted, and users hesitate to log at all.

## Problem Statement
Today, once a workout session is marked completed (`workout_sessions.completed_at IS NOT NULL`), only the **rating** and **notes** can be modified (`updateSession()` in `lib/db/sessions.ts:231`). The actual logged sets — weight, reps, RPE, completion flag, set count, exercise list — are immutable. The session-detail screen at `app/session/detail/[id].tsx` is read-only for sets.

This forces users into bad workarounds: deleting the entire session, manually fudging the next workout, or just living with wrong numbers in their history (which then corrupts PR detection, volume stats, weight-progression suggestions, and progress charts).

## Behavior-Design Classification (MANDATORY)
Does this shape user behavior? (see CEO playbook §3.2 trigger list)
- [ ] **YES**
- [x] **NO** — purely functional data-correction. No streaks, notifications, gamification, identity framing, or motivational copy. Editing is a passive corrective action initiated by the user; it does not nudge, reward, or reframe behavior. (Edge note: if we later add an "edited" indicator with social/comparative framing, that would re-trigger classification — out of scope here.)

## User Stories
- As a lifter, I want to fix the weight/reps on a set I mistyped during a past session so my history reflects what I actually did.
- As a lifter, I want to add a set I forgot to log so my volume and PR detection are correct.
- As a lifter, I want to delete a set I logged by accident (e.g., a misclick or a warmup I didn't mean to record).
- As a lifter, I want to add an exercise to a finished session if I forgot to log one (e.g., closing finisher).
- As a lifter, I want to remove an exercise that I added to the session but never actually performed.
- As a lifter, I want to know which sessions in my history have been edited so I can trust the data.
- As a lifter, I want PR badges, volume totals, and progression charts to reflect my edits the next time I open them.

## Proposed Solution

### Overview
Add an **Edit mode** to the session detail screen (`app/session/detail/[id].tsx`) for completed sessions. Tapping a new "Edit" header action toggles the page into an editable state where each set row becomes mutable (weight, reps, RPE, completed flag), with affordances to add/remove sets within an exercise group, add new exercises to the session, and remove empty exercises. A single "Save" commits all edits atomically; "Cancel" discards.

Edits are written via a new `editCompletedSession()` API in `lib/db/sessions.ts` that runs inside a single `withTransaction(...)` block, validates inputs, and re-runs PR-detection and volume-aggregation downstream selectors so the summary screen, history list, and progress views show fresh numbers on next read. Sessions that have been edited are flagged via a new `edited_at` column on `workout_sessions` and surfaced with a small "Edited" pill on the session detail header and in the history list row.

### UX Design

**Entry point:**
- Session detail screen header gets a pencil icon next to the existing "Save as template" icon, visible only when `session.completed_at != null`.
- Tap → enters Edit mode. Header changes to "Editing — [session name]" with `Cancel` and `Save` buttons replacing the back arrow / template icon.

**In Edit mode:**
- Each `ExerciseGroupRow` renders sets as editable rows: numeric inputs for weight + reps, optional RPE field, completed checkbox.
- Inline `+ Add set` button at the bottom of each exercise group; copies prior set's weight/reps as default (matches the live-workout UX).
- Per-set trash icon to remove that set; tapping shows confirmation only if the set was completed (avoid accidental loss). Removing an exercise's last set removes the exercise from the session.
- Bottom of list: `+ Add exercise` opens the existing exercise picker modal (`components/ExercisePicker` or equivalent); selecting an exercise appends a new exercise group with one empty set.
- Bottom-of-screen sticky `Save` / `Cancel` bar (also mirrored in the header for one-handed reach).

**Save behavior:**
- Disabled until at least one field has changed.
- On Save: validation pass (no negative numbers; weight ≥ 0; reps ≥ 0; at least one exercise must remain or the user is offered "Delete entire workout" instead). On invalid: inline error + scroll to first invalid field.
- On success: brief toast "Workout updated", page returns to read-only view with refreshed data, "Edited [time]" pill appears in the header.

**Cancel behavior:**
- If dirty: confirmation dialog "Discard changes?" with Discard / Keep editing options.
- If clean: returns to read-only immediately.

**Edited indicator:**
- Header pill: "Edited" (small chip, neutral color) with tooltip/long-press showing `Last edited: <relative time>`.
- History list row (`app/(tabs)/history.tsx` row): subtle italic "(edited)" suffix or a small icon next to the timestamp.

**Empty / edge states:**
- Empty session after edits (all sets removed): Save is replaced by a "Delete workout" affordance with confirmation.
- Active live session (no `completed_at`): edit icon is hidden; existing live-workout flow remains the only edit path during a session.

**Accessibility:**
- Edit/Save/Cancel buttons have `accessibilityLabel`s and `accessibilityHint`s mirroring the existing template icon's pattern (`app/session/detail/[id].tsx:46-49`).
- Numeric inputs use `keyboardType="numeric"`, `accessibilityLabel="Weight for set 2 of Bench Press"` etc.
- Set rows get `accessibilityRole="adjustable"` where appropriate; trash icons label "Remove set 3 of Bench Press".
- Edited pill exposes `accessibilityLabel="This workout was edited on <date>"`.

**Error states:**
- DB transaction failure → toast "Couldn't save changes — please try again", remain in Edit mode, no data lost in form.
- Set-level validation failures → inline red text under the bad input.

### Technical Approach

**Schema change** (Drizzle migration in `lib/db/schema.ts` + new migration file under `lib/db/migrations/`):
```ts
// workout_sessions: add nullable column
edited_at: integer("edited_at"),  // unix ms; null = never edited
```
- Migration is additive and backwards-compatible. No backfill needed (null = never edited).

**Data model — workout_sets** (existing schema, no change):
- Edits update existing rows by `id`.
- Inserts (new sets / new exercise) create rows with fresh `uuid()` and the existing `session_id`.
- Deletes remove rows by `id`.

**New API in `lib/db/sessions.ts`:**
```ts
export interface SessionEditPayload {
  upserts: Array<{
    id?: string;            // present → update; absent → insert
    exercise_id: string;
    set_number: number;
    reps: number | null;
    weight_kg: number | null;
    rpe?: number | null;
    completed: 0 | 1;
    link_id?: string | null;
    training_mode?: string | null;
  }>;
  deletes: string[];        // workout_sets.id[]
}

export async function editCompletedSession(
  sessionId: string,
  payload: SessionEditPayload
): Promise<void>;
```
- Wraps the entire mutation in `withTransaction(...)` (existing helper used by `createTemplateFromSession`).
- Validates each row (non-negative numbers, exercise_id exists in current session or is being added).
- Renumbers `set_number` per exercise to be contiguous after deletes (so summary/history don't show "Set 1, Set 3").
- Stamps `workout_sessions.edited_at = Date.now()`.
- Recomputes `workout_sessions.duration_seconds` only if user explicitly changes timing fields (not in scope for v1 — leave duration alone).

**Hook layer:**
- New `hooks/useSessionEdit.ts` that owns Edit-mode state (draft sets, dirty flag, validation, save/cancel/discard). Mirrors the structure of the existing `useSessionDetail` hook.
- `useSessionDetail` gets a `refresh()` callback to re-fetch after save (likely already exists via focus effect; verify during implementation).

**Component layer:**
- New `components/session/detail/EditableExerciseGroupRow.tsx` (mirror of `ExerciseGroupRow`).
- New `components/session/detail/EditableSetRow.tsx`.
- Header buttons added to `app/session/detail/[id].tsx` Stack.Screen options.
- Reuse the existing exercise-picker modal already used by live workouts (verify location during implementation; if web-only, add native variant — out of scope if existing one is cross-platform).

**Downstream invalidation:**
- PR detection (used in `useSummaryData` and PRsCard) reads from `workout_sets` directly — refreshes naturally on next mount.
- Volume / progression / charts likewise read live; no cache to bust.
- History list `app/(tabs)/history.tsx` re-queries on focus; the edited pill data is read from `edited_at`.

**Performance:**
- Worst realistic edit: ~30 sets across ~10 exercises → single transaction with ≤30 inserts/updates/deletes. Negligible.
- PR/volume recomputation already happens on summary view mount; not in the save path.

**Testing:**
- Unit: `__tests__/lib/db/edit-completed-session.test.ts` — covers update, insert, delete, set_number renumbering, edited_at stamping, validation rejections, transaction rollback on partial failure.
- Hook test: `__tests__/hooks/useSessionEdit.test.ts` — dirty flag, cancel-with-discard, save success/failure paths.
- Component test (RTL): edit toggle, save flow, validation error rendering, edited pill visibility.
- E2E (Playwright, only if existing harness covers session detail — skip otherwise): edit a set, save, verify history shows "(edited)".

## Scope

**In:**
- Edit weight, reps, RPE (if column exists; otherwise defer RPE), and completed flag on existing sets.
- Add new sets within an existing exercise group.
- Remove individual sets (with confirmation if previously completed).
- Add new exercises to a completed session.
- Remove an exercise (by removing all its sets, or via an explicit per-exercise remove action).
- Atomic save with transaction-scoped rollback on failure.
- `edited_at` column + visible "Edited" indicator on session detail header and history row.
- Cancel with dirty-check confirmation.
- Validation (non-negative numbers; at least one exercise; offer delete-workout when empty).
- A11y labels on all new controls.
- Unit + hook tests.

**Out:**
- Editing session start/end time, duration, or rating (rating already editable; duration is computed and rarely needs correction — defer).
- Editing exercise metadata (sub-feature; exercises live in a separate library).
- Edit history / undo log / per-edit audit trail beyond a single `edited_at` timestamp (could be a follow-up if users ask).
- Bulk edit across multiple sessions.
- Reordering exercises within a session (defer; current order matches add order).
- Edit during a live (uncompleted) session — already covered by the live workout UX; this plan is strictly post-completion.
- Behavior-shaping additions (e.g., "you've edited 5 workouts this week!") — out of scope and would re-trigger psych review.

## Acceptance Criteria

- [ ] Given a completed session detail screen When the user taps the edit (pencil) icon Then the screen enters Edit mode with all sets rendered as editable inputs and Save/Cancel actions visible.
- [ ] Given Edit mode When the user changes a weight from 80 → 82.5 and taps Save Then the session detail re-renders with weight 82.5, the database row's `weight_kg` is 82.5, and `workout_sessions.edited_at` is non-null.
- [ ] Given Edit mode When the user taps "+ Add set" on an exercise group Then a new editable row appears prefilled with the previous set's weight/reps; on Save a new row exists in `workout_sets` with the correct `session_id`, `exercise_id`, and contiguous `set_number`.
- [ ] Given Edit mode When the user taps the trash icon on a completed set Then a confirmation dialog appears; on Confirm + Save the row is removed AND remaining sets in that exercise are renumbered contiguously (1, 2, 3 — no gaps).
- [ ] Given Edit mode When the user taps "+ Add exercise" Then the exercise picker opens; selecting an exercise appends a new exercise group with one empty editable set.
- [ ] Given Edit mode When the user removes the last set of the only remaining exercise Then Save is replaced with "Delete workout" and confirms before deleting the session and all its sets.
- [ ] Given a previously edited session When the user views it Then a small "Edited" pill is visible in the header and an "(edited)" affordance appears on the history list row.
- [ ] Given Edit mode with unsaved changes When the user taps Cancel or hardware back Then a "Discard changes?" dialog appears; Discard returns to read-only without writes; Keep editing keeps the form intact.
- [ ] Given an in-progress (uncompleted) session When the user views its detail screen Then no edit pencil icon is shown (live-workout flow is the only edit path).
- [ ] Given a session with edits When the summary screen is reopened Then PRs, volume, and per-set displays reflect the new numbers.
- [ ] Given a transaction failure during save (e.g., DB constraint) When Save is tapped Then the form remains in Edit mode with all draft values intact, a toast surfaces the failure, and no partial writes are persisted.
- [ ] PR passes typecheck, lint, all existing + new unit/hook tests with no regressions.
- [ ] No new lint warnings.
- [ ] All new interactive controls have `accessibilityLabel` + `accessibilityHint`.

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Edit on session with 0 completed sets | Edit mode allowed; user can add sets/exercises; Save persists. |
| User adds set then deletes it before saving | No DB write; Save remains disabled (clean draft). |
| User removes ALL sets across ALL exercises | Save button morphs into "Delete workout" with confirmation. |
| User enters weight = 0 | Allowed (bodyweight tracking). Reps must still be ≥ 0. |
| User enters reps = 0 on a "completed" set | Validation: reps must be ≥ 1 if completed = 1, OR auto-uncomplete that set. Pick: auto-uncomplete + warn inline. |
| User edits a set that contributed to a prior PR badge | PR re-detection happens on summary view; if the edit invalidates the PR, the badge disappears and a different set may take it. No retroactive notification. |
| Two devices edit the same session (sync race) | Out of scope — CableSnap is local-first single-device today. Last-write-wins inherently. |
| Web platform (`expo-sqlite-web`) | Same code path; verify via existing Playwright session-detail scenario if present. The patched WorkerChannel (BLD-660) handles the larger transaction payload. |
| App killed mid-edit | Draft is in-memory only — no autosave. User loses unsaved edits. Acceptable for v1. |
| Hardware back during Edit mode (Android) | Trigger same "Discard changes?" path as Cancel. |
| Edited session viewed in summary (not detail) | The "Edited" pill is also visible in the summary header (parity with detail). |
| Session shared via ShareSheet after edit | Share content reflects post-edit numbers (uses live data). |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Drizzle migration breaks fresh installs | Low | High | Migration is purely additive (new nullable column). Test via test-seed and a fresh sim install before merge. |
| Save partial-write on transaction abort | Low | High | All mutations inside `withTransaction()` — same pattern proven by `createTemplateFromSession`. Add an explicit unit test that throws mid-transaction and verifies no rows changed. |
| Set renumbering corrupts joined data (e.g., link_id) | Medium | Medium | Renumber only `set_number` (display ordering); preserve `id` and `link_id`. Tests cover renumbering math. |
| PR badges flicker / become stale | Medium | Low | PR detection already runs on summary mount; no cache. Verify via test that edits are reflected. |
| Editable inputs perform poorly with 30+ sets on low-end Android | Low | Medium | Reuse `FlatList` virtualization already in the detail screen. Smoke test on the SM-F9660 (owner's device class). |
| Users edit history to inflate PRs (gaming) | N/A | None | Single-user local app. Not a concern. |
| Loss of unsaved drafts on app kill | Medium | Low | Out of scope for v1. Inline note in dialog + small "Save before leaving" pattern. Could add autosave-to-draft in v2 if requested. |
| Conflict with future cloud-sync feature | Low | Medium | `edited_at` column gives sync layer a reliable change marker. Aligns rather than conflicts. |
| Behavior-shaping creep (e.g., "X edits this week!") | Low | Medium | Explicitly out of scope here; any such addition triggers a fresh PLAN + psych review. |

## Open Questions for Reviewers
1. **QD:** Is the proposed "Edited" pill sufficient transparency, or should we surface a per-edit timestamp list? (Audit-trail UX vs. simplicity tradeoff.)
2. **Techlead:** Is `withTransaction` the right primitive here, or should we use Drizzle's native transaction API directly? Any concerns about transaction size on web (post-BLD-660 patch)?
3. **Techlead:** Confirm the exercise picker modal currently used by live workouts is reusable in this context (path + props).
4. **QD:** Should validation auto-uncomplete a set when reps become 0, or hard-block save? Plan currently proposes auto-uncomplete with inline warning.

## Review Feedback

### Quality Director (UX)
_Pending_

### Tech Lead (Feasibility)
_Pending_

### Psychologist (Behavior-Design)
_N/A — Classification = NO. Feature is purely corrective/functional with no streaks, notifications, gamification, identity framing, or motivational copy. Re-trigger if scope expands._

### CEO Decision
_Pending — awaiting QD + Techlead approval._
