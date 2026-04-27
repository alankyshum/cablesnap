# Feature Plan: Edit Previous Workout Details

**Issue**: BLD-673  **Author**: CEO  **Date**: 2026-04-27
**Status**: DRAFT → IN_REVIEW (rev 2 — addressing techlead REQUEST CHANGES) → APPROVED / REJECTED

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

**Schema change** (additive, runtime migration via existing pattern in `lib/db/migrations.ts`):
```ts
// lib/db/schema.ts — add to workoutSessions table (after `rating`):
edited_at: integer("edited_at"),  // unix ms; null = never edited

// lib/db/migrations.ts — add next to existing workout_sessions addColumnIfMissing calls (~line 82-86):
await addColumnIfMissing(database, "workout_sessions", "edited_at", "INTEGER DEFAULT NULL");
```
- CableSnap does **NOT** use drizzle-kit migration files. All schema upgrades flow through runtime `addColumnIfMissing()` (idempotent on fresh + upgraded DBs). No new migrations directory; no drizzle-kit invocation.
- Migration is purely additive and backwards-compatible. No backfill needed (null = never edited).

**Data model — workout_sets** (existing schema, no change). Authoritative column list (per `lib/db/schema.ts:74-98`): `id, session_id, exercise_id, set_number, weight, reps, completed, completed_at, rpe, notes, link_id, round, training_mode, tempo, swapped_from_exercise_id, set_type, duration_seconds, exercise_position, bodyweight_modifier_kg`. **Weight column is `weight` (not `weight_kg`)** — values are stored in kg by convention but the column name is `weight`.
- Edits update existing rows by `id`.
- Inserts (new sets / new exercise) create rows with fresh `uuid()` and the existing `session_id`.
- Deletes remove rows by `id`.

**New API in `lib/db/sessions.ts`:**
```ts
// PATCH-style upserts: only the fields explicitly present in each entry are written.
// Approach (A) from techlead review — preserves untouched columns (rpe, notes, link_id, round,
// training_mode, tempo, swapped_from_exercise_id, set_type, duration_seconds,
// exercise_position, bodyweight_modifier_kg) on existing rows.
export interface SessionEditSetPatch {
  id?: string;             // present → update by id; absent → insert with fresh uuid
  exercise_id: string;     // required for inserts; included in updates for clarity
  // Any subset of the columns below; only present keys are written:
  set_number?: number;
  weight?: number | null;
  reps?: number | null;
  completed?: 0 | 1;
  completed_at?: number | null;  // see "completed_at semantics" below
  rpe?: number | null;
  notes?: string;
  link_id?: string | null;
  round?: number | null;
  training_mode?: string | null;
  tempo?: string | null;
  swapped_from_exercise_id?: string | null;
  set_type?: string;          // defaults to "normal" on insert
  duration_seconds?: number | null;
  exercise_position?: number; // defaults to 0 on insert
  bodyweight_modifier_kg?: number | null;
}

export interface SessionEditPayload {
  upserts: SessionEditSetPatch[];
  deletes: string[];          // workout_sets.id[]
}

export async function editCompletedSession(
  sessionId: string,
  payload: SessionEditPayload
): Promise<void>;
```

**Save semantics:**
- Wrap the entire mutation in `withTransaction(...)` from `lib/db/helpers.ts:112-138` — **NOT** Drizzle's native `db.transaction()`. The repo's `withTransaction` serializes through a `txQueue` that prevents the "database is locked" / cannot-rollback race already observed in production. Drizzle's native tx bypasses that queue and would reintroduce concurrent-tx bugs. Same primitive proven by `createTemplateFromSession` (`lib/db/sessions.ts:257`).
- For each `upsert` with `id` → Drizzle `db.update(workoutSets).set({ <only present fields> }).where(eq(id, ...))`. Untouched columns are preserved (no full-row REPLACE).
- For each `upsert` without `id` → Drizzle `db.insert(workoutSets).values({ id: uuid(), session_id, exercise_id, set_number, completed: 0, set_type: "normal", exercise_position: 0, ...payload })`.
- For each `deletes[i]` → `db.delete(workoutSets).where(and(eq(id, ...), eq(session_id, sessionId)))` (session-scoped guard against cross-session deletes).
- Renumber `set_number` per `(session_id, exercise_id)` to be contiguous (1..N) after deletes/inserts settle, **preserving** `link_id`, `round`, and all other columns verbatim. Renumbering only touches `set_number`.
- Validation (defense in depth on the API side, mirroring client validation):
  - `weight ≥ 0` (allow 0 for bodyweight tracking).
  - For `completed = 1`: `reps ≥ 1` (a 0-rep completed set is meaningless). If client sends `completed=1, reps=0`, API auto-flips to `completed=0` and returns the corrected payload.
  - At least one set must remain in the session post-payload, OR the caller must use the separate "delete entire session" path (out of `editCompletedSession` scope).
- Stamp `workout_sessions.edited_at = Date.now()` once at the end of the transaction.
- `duration_seconds` on the session is **not** recomputed by this API (out of scope — see "Out").

**`completed_at` per-set semantics:**
- Transition `completed: 0 → 1`: stamp `completed_at = Date.now()` automatically (unless caller explicitly provides one).
- Transition `completed: 1 → 1` with no other field changes: leave `completed_at` untouched.
- Transition `completed: 1 → 0`: null `completed_at`.

**Hook layer:**
- New `hooks/useSessionEdit.ts` owns Edit-mode state: a draft `Map<setId, SessionEditSetPatch>`, an `inserts[]` and `deletes[]` accumulator, dirty flag, validation, save/cancel/discard. **Draft state lives in the hook (keyed by set `id`)**, NOT in row component local state — necessary because editable rows inside a virtualized `FlatList` lose local state on recycle.
- **Add a `refresh()` callback to `hooks/useSessionDetail.ts`.** Today the load `useEffect` only runs on `[id]` change (`hooks/useSessionDetail.ts:61-77`); after save the screen would show stale data. Extract the loader into a `useCallback`, expose it as `refresh`, and `useSessionEdit` calls it after `editCompletedSession` resolves. ~10 LOC change.
- `useSessionEdit` owns Android hardware-back interception via `BackHandler` listener (mirror the existing pattern in `app/session/summary/[id].tsx:48-55`) — when dirty, intercept back, show the discard dialog, return `true` to swallow the event.

**Component layer:**
- New `components/session/detail/EditableExerciseGroupRow.tsx` (mirror of `ExerciseGroupRow`).
- New `components/session/detail/EditableSetRow.tsx` (uncontrolled `TextInput` numeric inputs writing to `useSessionEdit` draft on blur/submit).
- Header buttons added to `app/session/detail/[id].tsx` Stack.Screen options.
- Reuse `components/ExercisePickerSheet.tsx` (default export, props `{ visible, onDismiss, onPick(exercise) }`). Already cross-platform — no `Platform.OS` gates. Used by `app/session/[id].tsx:329`, `app/template/[id].tsx:118`, `app/template/create.tsx`. No new picker variant needed.
- `FlatList` config: `keyboardShouldPersistTaps="handled"` so taps on +Add/trash buttons don't dismiss the keyboard mid-edit. Keep all draft state outside row components to survive recycling.
- **Edited pill must appear on BOTH `app/session/detail/[id].tsx` AND `app/session/summary/[id].tsx`** (per Edge Cases table). Add the pill component to both screens' headers.

**Downstream invalidation:**
- `getSessionPRs`, `getSessionSets`, `getSessionSetCount` → live queries; refresh naturally on `useSessionDetail.refresh()` and on summary mount.
- `useMuscleVolume`, `useHistoryData`, weekly-summary aggregates → these screens already re-query on focus via `useFocusEffect`. Verify during implementation; if any survive a focus change with stale data, surface that as a follow-up issue rather than blocking this one.
- History list `app/(tabs)/history.tsx` re-queries on focus; the edited pill data is read from `edited_at`.

**Performance:**
- Worst realistic edit: ~30 sets across ~10 exercises → single transaction with ≤30 inserts/updates/deletes. JSON payload ~4–6 KB — well within the post-BLD-660 WorkerChannel patched length-prefix budget.
- PR/volume recomputation already happens on summary view mount; not in the save path.
- Smoke test on iOS sim AND on the SM-F9660 device class (owner's device) with a synthetic 30-set session before merge.

**Testing:**
- `__tests__/lib/db/edit-completed-session.test.ts`: covers update, insert, delete, set_number renumbering, edited_at stamping, validation rejections, transaction rollback on partial failure.
- **Column-preservation test**: edit weight on a set that has `bodyweight_modifier_kg=10` and `set_type='warmup'` → those values must be preserved post-save (PATCH-style sanity check).
- **Linked-superset preservation test**: edit a session with two exercises sharing `link_id=X`, `round=1..3` → after deleting one set, remaining sets still share `link_id=X` with correct `round` values; renumbering only touches `set_number`.
- **`completed_at` semantics test**: 0→1 stamps now; 1→1 untouched; 1→0 nulls.
- **Web-platform regression test** (mirror `__tests__/lib/expo-sqlite-worker-channel-length.test.ts`): exercise an `editCompletedSession` payload >256 bytes through the patched WorkerChannel to lock-in non-regression.
- `__tests__/hooks/useSessionEdit.test.ts`: dirty flag, cancel-with-discard preserves the in-memory draft until explicit Discard, save success/failure paths.
- Component test (RTL): edit toggle, save flow, validation error rendering, edited pill visibility on both detail and summary screens.
- E2E (Playwright, only if existing harness covers session detail — skip otherwise).

## Scope

**In:**
- Edit weight, reps, RPE, and completed flag on existing sets (RPE column already exists at `lib/db/schema.ts:83`; full scope, not deferred).
- Add new sets within an existing exercise group.
- Remove individual sets (with confirmation if previously completed).
- Add new exercises to a completed session via `components/ExercisePickerSheet.tsx`.
- Remove an exercise (by removing all its sets, or via an explicit per-exercise remove action).
- Atomic save with `withTransaction()` rollback on failure.
- PATCH-style upserts that preserve untouched columns (`bodyweight_modifier_kg`, `set_type`, `link_id`, `round`, `tempo`, etc.) on existing rows.
- `set_number` renumbering per `(session_id, exercise_id)` after deletes/inserts; `link_id` and `round` preserved verbatim.
- `completed_at` stamping/nulling on `completed` flag transitions (0→1 stamps now; 1→0 nulls).
- `edited_at` column + visible "Edited" indicator on **both** session detail header AND summary header AND history row.
- Cancel with dirty-check confirmation (Android hardware-back via `BackHandler` listener inside `useSessionEdit`).
- API-side validation defense in depth (mirror client rules).
- A11y labels on all new controls.
- `refresh()` callback added to `hooks/useSessionDetail.ts` and called after save.
- Unit + hook + web-platform regression + column-preservation + linked-superset preservation tests.

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
- [ ] Given Edit mode When the user changes a weight from 80 → 82.5 and taps Save Then the session detail re-renders with weight 82.5, the database row's `weight` column is 82.5 (kg by storage convention), and `workout_sessions.edited_at` is non-null.
- [ ] Given Edit mode When the user taps "+ Add set" on an exercise group Then a new editable row appears prefilled with the previous set's weight/reps; on Save a new row exists in `workout_sets` with the correct `session_id`, `exercise_id`, and contiguous `set_number`.
- [ ] Given Edit mode When the user taps the trash icon on a completed set Then a confirmation dialog appears; on Confirm + Save the row is removed AND remaining sets in that exercise are renumbered contiguously (1, 2, 3 — no gaps).
- [ ] Given Edit mode When the user taps "+ Add exercise" Then the exercise picker opens; selecting an exercise appends a new exercise group with one empty editable set.
- [ ] Given Edit mode When the user removes the last set of the only remaining exercise Then Save is replaced with "Delete workout" and confirms before deleting the session and all its sets.
- [ ] Given a previously edited session When the user views it Then a small "Edited" pill is visible in the header and an "(edited)" affordance appears on the history list row.
- [ ] Given Edit mode with unsaved changes When the user taps Cancel or hardware back Then a "Discard changes?" dialog appears; Discard returns to read-only without writes; Keep editing keeps the form intact.
- [ ] Given an in-progress (uncompleted) session When the user views its detail screen Then no edit pencil icon is shown (live-workout flow is the only edit path).
- [ ] Given a session with edits When the summary screen is reopened Then PRs, volume, and per-set displays reflect the new numbers.
- [ ] Given a transaction failure during save (e.g., DB constraint) When Save is tapped Then the form remains in Edit mode with all draft values intact, a toast surfaces the failure, and no partial writes are persisted.
- [ ] Given a user enters reps=0 on a previously-completed set When Save is tapped Then the API auto-flips that set to `completed=0` and the UI shows an inline non-judgmental notice ("Reps set to 0 — marked as not completed").
- [ ] Given an existing warmup set with `set_type='warmup'` and `bodyweight_modifier_kg=10` When the user edits only `weight` and Saves Then `set_type` AND `bodyweight_modifier_kg` are preserved unchanged on the row.
- [ ] Given a linked superset (two exercises sharing `link_id=X`, `round=1..3`) When the user deletes one set and Saves Then the remaining sets still share `link_id=X` with correct `round` values; only `set_number` is renumbered contiguously per exercise.
- [ ] Given the "Delete workout" confirmation appears Then its message includes the workout date and exercise/set counts (e.g., "Delete this workout from Apr 24 (5 exercises, 18 sets)? This cannot be undone.").
- [ ] Given the user removes the LAST set of an exercise When confirmed and Saved Then the exercise is removed from the session AND a confirmation dialog was shown even if the set was uncompleted (prevents misclick exercise loss).
- [ ] Given a save succeeds Then `AccessibilityInfo.announceForAccessibility("Workout updated")` is called in addition to the visual toast.
- [ ] Given the "Edited" pill renders Then the SAME shared component is used on the session detail header, the summary header, AND the history list row (covered by a snapshot test).
- [ ] Given an Android user is in Edit mode with unsaved changes When the hardware back button is pressed Then the BackHandler listener inside `useSessionEdit` intercepts the event and shows the "Discard changes?" dialog (covered by an explicit BackHandler test, separate from the Cancel button test).
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
**APPROVE WITH CONDITIONS** (2026-04-27)

Plan UX/quality shape is good; aligning with techlead's REQUEST CHANGES on data-integrity blockers below.

**Answers to QD-targeted Open Questions:**
- Q1 (Edited pill granularity): Approve simple pill + relative timestamp. Per-edit audit log is over-engineering for a single-user local app — defer until users ask.
- Q4 (reps=0 on completed set): Approve auto-uncomplete + inline non-judgmental warn (e.g., "Reps set to 0 — marked as not completed"). Add as explicit AC.

**UX/Quality Conditions (must address before implementation):**
1. Shared "Edited" pill component across detail header, summary header, and history list row — single component to prevent style drift; add snapshot test.
2. Destructive copy specificity — "Delete workout" confirmation must include workout date and exercise/set counts (e.g., "Delete this workout from Apr 24 (5 exercises, 18 sets)? This cannot be undone.").
3. Hardware back-handler test — explicitly exercise BackHandler.addEventListener path (separate from Cancel button).
4. A11y announcement on Save — call AccessibilityInfo.announceForAccessibility("Workout updated") in addition to visual toast.
5. Set-removal confirmation threshold — also confirm when removing the LAST set of an exercise (which removes the exercise itself), even if uncompleted, to prevent misclick exercise loss.

**Endorsed Techlead blockers (also QD-relevant for data safety):**
- Item #3 (PATCH-style upsert): Non-negotiable for data integrity. Omitting `bodyweight_modifier_kg`, `set_type`, `link_id`, `round`, `training_mode`, etc. would silently destroy superset/dropset/warmup metadata. Add AC: "Editing weight on a warmup set with `bodyweight_modifier_kg` set must preserve `set_type='warmup'` and `bodyweight_modifier_kg` unchanged."
- Item #4 (renumber preserves link_id/round): Add AC for superset preservation across renumber.

Cleared to advance once techlead's blocking items #1–#4 land in the plan AND the 5 UX conditions above fold into Acceptance Criteria.

### Tech Lead (Feasibility)

**Verdict: REQUEST CHANGES** (will flip to APPROVE once items 1–7 below are reflected in this plan)

**Open Questions — Direct Answers**

- **Q2 (`withTransaction` vs Drizzle native tx):** Use **`withTransaction`** — non-negotiable. `lib/db/helpers.ts:112-138` wraps `database.withTransactionAsync` with a serialized `txQueue` that prevents the "database is locked" / "cannot rollback" race already observed in production. Drizzle's `db.transaction()` bypasses that queue. Same primitive proven by `createTemplateFromSession` (`lib/db/sessions.ts:257`). On web post-BLD-660, the WorkerChannel patch handles ≥256-byte payloads correctly; a 30-set edit (~4–6 KB JSON) is within budget. **Add a regression test exercising a >256-byte transaction payload on web** (mirror `__tests__/lib/expo-sqlite-worker-channel-length.test.ts`).
- **Q3 (Exercise picker reusability):** Confirmed reusable. Path: `components/ExercisePickerSheet.tsx` (default export), props `{ visible, onDismiss, onPick(exercise) }`. Already cross-platform in `app/session/[id].tsx:329`, `app/template/[id].tsx:118`, `app/template/create.tsx`. No `Platform.OS` gates. **Drop the "if web-only, add native variant" hedge from the plan.**

**Required Changes (blocking)**

1. **Schema column is `weight`, NOT `weight_kg`.** `lib/db/schema.ts:79` defines `weight: real("weight")`. Rename `SessionEditPayload.upserts[].weight_kg` → `weight`.
2. **Migration approach is wrong.** No `lib/db/migrations/` directory exists. CableSnap uses runtime `addColumnIfMissing()` calls in `lib/db/migrations.ts`. Correct prescription: (a) add `edited_at: integer("edited_at")` to `workoutSessions` in `lib/db/schema.ts:58-72`; (b) add `await addColumnIfMissing(database, "workout_sessions", "edited_at", "INTEGER DEFAULT NULL");` next to existing `rating` / `clock_started_at` lines in `lib/db/migrations.ts:82-86`. No new files.
3. **`SessionEditPayload` underspecifies `workout_sets`.** Real schema includes `completed_at`, `rpe`, `notes`, `link_id`, `round`, `training_mode`, `tempo`, `swapped_from_exercise_id`, `set_type`, `duration_seconds`, `exercise_position`, `bodyweight_modifier_kg`. A naive REPLACE would null all omitted columns — silent data loss for warmup flags, dropsets, supersets, bodyweight modifiers, exercise ordering. Pick & document one approach: **(A) Diff/PATCH** — only update columns explicitly present (preferred); inserts must still seed defaults for `set_type`, `exercise_position`, `round`. **(B) Full-row** payload mirrors `WorkoutSetRow`. Add a test: edit weight on a set with `bodyweight_modifier_kg=10`, `set_type='warmup'` → those values must survive.
4. **Renumbering must preserve `link_id` + `round`.** Renumber `set_number` per `(session_id, exercise_id)` only. Plan must explicitly state `link_id`/`round` are untouched. Add a test: linked superset (two exercises sharing `link_id=X`, `round=1..3`) → after deleting one set, remaining sets still share `link_id=X` with correct `round`.
5. **`useSessionDetail` has no `refresh()` callback.** `hooks/useSessionDetail.ts:62-77` runs load `useEffect` only on `[id]`. After save, screen shows stale data. **Add `refresh: () => void` to the hook return** and call it after `editCompletedSession` resolves. ~10 lines of hook change.
6. **RPE column already exists** (`lib/db/schema.ts:83`). Remove the "if column exists; otherwise defer RPE" hedge — RPE is in scope, full stop.
7. **Android hardware back interception.** Specify implementation: use `BackHandler` listener inside `useSessionEdit`, OR `useFocusEffect` + `e.preventDefault()` on Stack `beforeRemove`. Add as explicit deliverable so it isn't dropped.

**Recommended (non-blocking quality bumps)**

8. **FlatList + text inputs.** Editable rows in virtualized lists lose state on recycle. Keep all draft state in `useSessionEdit` keyed by set `id`; pass `keyboardShouldPersistTaps="handled"`. Smoke test 30-set session on iOS sim before merge.
9. **Volume / muscle-volume cache.** Verify `useMuscleVolume`, `useHistoryData`, weekly-summary aggregates re-query on focus. If any cache survives, expose coarse invalidation.
10. **Per-set `completed_at` policy.** When `completed` flips 0→1 in Edit mode, stamp `Date.now()`; on 1→0 set null; on 1→1 leave existing. Document in API contract.
11. **Defense-in-depth validation.** API must reject `completed=1, reps=0` (not just the UI) so a buggy client can't persist invalid rows.
12. **Test coverage gaps.** Add focused web-platform test (item Q2) and a hook test asserting cancel-with-dirty preserves the in-memory draft.
13. **Edited pill on Summary.** Edge-case row promises pill on summary header too — add `app/session/summary/[id].tsx` (or equivalent) to the Component layer checklist.

**What's solid:** atomic save inside `withTransaction`, additive nullable migration, single new API surface, a11y labels, Behavior-Design = NO classification.

_Posted as comment c30aad3b on BLD-673 at 2026-04-27._


### Psychologist (Behavior-Design)
_N/A — Classification = NO. Feature is purely corrective/functional with no streaks, notifications, gamification, identity framing, or motivational copy. Re-trigger if scope expands._

### CEO Decision
**Rev 2 (2026-04-27):** All techlead blocking items 1–7 incorporated into the Technical Approach + Scope sections. All techlead quality items 8–13 also incorporated. All five QD UX conditions folded into Acceptance Criteria. QD answers Q1/Q4 reflected in scope. Open Questions Q2/Q3 resolved. Re-pinging both reviewers for final verdict flip.
