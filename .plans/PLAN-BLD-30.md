# Phase 14: Superset & Circuit Training Support

**Issue**: BLD-23  
**Author**: CEO  
**Date**: 2026-04-13  
**Status**: APPROVED — Rev 2 (QD + techlead approved 2026-04-13)

---

## Problem Statement

CableSnap currently treats every exercise in a workout as independent — each exercise has its own rest timer and is performed in strict sequence. Real-world intermediate and advanced trainees frequently use **supersets** (alternating between 2 exercises with no rest in between) and **circuits** (rotating through 3+ exercises before resting). Without this, users must manually track which exercises are paired and mentally skip the rest timer, creating friction and inaccurate rest data.

## Proposed Solution

Add an **exercise linking** system at the template level that carries through to workout sessions. Linked exercises are performed in rotation (A1->B1->rest->A2->B2->rest) and share a single rest timer after each round.

---

## Scope

### IN Scope
- Link 2+ template exercises as a superset (2 exercises) or circuit (3+)
- Visual grouping bracket in template editor and session screen
- Rotation-based set flow during sessions (A1->B1->rest, not A1->A2->A3->B1->B2->B3)
- Shared rest timer — starts only after all exercises in the link group complete a round
- Visual feedback during rotation ("Next: Exercise B", "Rest after round" indicator)
- Links persist in session history
- Unlinking exercises (with undo)
- Import/export support for link metadata
- Full accessibility for all new interactions

### OUT of Scope
- Drop sets (same exercise, decreasing weight) — separate feature
- Giant sets with complex rest patterns — keep it simple
- Cross-template linking (links are within a single template)
- Reordering exercises between link groups via drag-and-drop (tap-based reorder is fine)
- Analytics specific to supersets (e.g., superset volume comparisons)
- Configurable rest-between-exercises within a round (intentional: rest only after full round)

---

## Schema Changes

### template_exercises — add link columns

```sql
ALTER TABLE template_exercises ADD COLUMN link_id TEXT DEFAULT NULL;
ALTER TABLE template_exercises ADD COLUMN link_label TEXT DEFAULT '';
```

- `link_id`: UUID shared by all exercises in a superset/circuit. NULL = standalone exercise.
- `link_label`: User-customized label (e.g., "Chest/Back Superset"). Empty = auto-generated at render time.

Link type is derived from count: 2 exercises = superset, 3+ = circuit. No explicit type column needed.

Display labels are computed dynamically at render time based on position ("Superset A", "Circuit B") unless the user sets a custom `link_label`. This avoids stale labels when groups are reordered.

### workout_sets — add link tracking

```sql
ALTER TABLE workout_sets ADD COLUMN link_id TEXT DEFAULT NULL;
ALTER TABLE workout_sets ADD COLUMN round INTEGER DEFAULT NULL;
```

- `link_id`: Copied from template at set creation time. Links sets that belong to the same superset/circuit.
- `round`: Which round of the superset this set belongs to (1, 2, 3...). Enables correct ordering in history.

**Naming note (techlead C2):** The existing `ExerciseGroup` type in `app/session/[id].tsx:54-58` groups sets **by exercise** (all sets for one exercise). The superset concept links **multiple exercises** together — fundamentally different semantics. We use `LinkedGroup` / `link_id` terminology throughout to avoid collision.

---

## UI Changes

### Template Editor (app/template/[id].tsx)

1. **"Create Superset" toolbar button**: An explicit button in the template editor toolbar enters **selection mode**. In selection mode:
   - Checkboxes appear next to each exercise
   - Tapping an exercise toggles its selection (not the existing edit flow)
   - A floating action bar shows the count selected and a "Link" button (enabled when 2+ selected)
   - A "Cancel" button exits selection mode
   - Long-press on any exercise is an **alternative shortcut** to enter selection mode with that exercise pre-selected (for experienced users)
   - `accessibilityLabel="Create superset"` on the toolbar button, `accessibilityRole="button"`

2. **"Link" action**: Appears when 2+ exercises are selected. Creates a linked group with a shared `link_id`. Shows a 3-second undo snackbar: "Exercises linked as superset — Undo".

3. **Visual bracket**: Linked exercises show a colored left-border bar (4dp wide) using theme tokens:
   - First link group: `theme.colors.tertiary`
   - Second link group: `theme.colors.secondary`
   - Additional groups cycle through a predefined palette with >=3:1 contrast ratio in both light and dark mode
   - Label shows "Superset A" / "Circuit B" (auto-generated from position) or custom label
   - `accessibilityLabel="Superset A: Bench Press and Dumbbell Fly, 2 exercises linked"` on the bracket

4. **Unlink action**: Tap the link group header -> "Unlink" option. Shows 3-second undo snackbar: "Exercises unlinked — Undo". `accessibilityLabel="Unlink superset"`, `accessibilityRole="button"`.

5. **Reorder within group**: Exercises within a link group can be reordered (changes rotation order).

6. **Group label edit**: Tap link group header -> "Edit label" -> inline text input. `accessibilityLabel="Edit superset label"`.

7. **Add to existing group**: Tap link group header -> "Add exercise" -> enters selection mode with existing group members pre-selected and locked. User taps additional exercises to add, then confirms. Simpler than requiring users to manually identify group members.

### Session Screen (app/session/[id].tsx)

1. **Rotation flow** (detailed):
   - When user completes a set for Exercise A in a linked group, the UI **scrolls to Exercise B** (next in group by `sort_order`) with a smooth scroll animation.
   - Exercise B receives a **highlighted background** (`theme.colors.elevation.level2`) and a pulsing border to draw attention.
   - A brief banner appears: **"Next: Dumbbell Fly"** (1.5s auto-dismiss) with `accessibilityLiveRegion="polite"` to announce the transition to screen readers.
   - **Rotation is suggested, not enforced.** Users can tap any exercise in the group (or any other exercise) to override the suggested order. The rotation indicator updates accordingly.
   - A rotation breadcrumb shows progress within the round: **"A done -> B -> rest"** in the link group header.

2. **Visual grouping**: Same left-border bracket as template editor. Link group header shows dual labels:
   - Group level: **"Superset A — Round 1/3"** (which pass through the rotation)
   - Exercise level: each exercise shows its own **"Set 1/3"** (which set of this specific exercise)
   - `accessibilityValue={{ now: "Round 1 of 3" }}` on the group header

3. **Rest timer behavior**:
   - Standalone exercise: rest timer starts after each set (current behavior — unchanged).
   - Linked exercise: rest timer starts only after all exercises in the group complete one round.
   - **"Rest after round" badge**: Linked exercises display a small badge next to the rest timer icon indicating rest will start after the full round, not after each set. This prevents user confusion about why the timer didn't start.
   - On set completion within a group (not last in round): show **"Next: [Exercise Name]"** feedback instead of rest timer.
   - Rest duration uses `MAX(rest_seconds)` from any exercise in the linked group.
   - `accessibilityLabel="Rest timer: starts after completing all exercises in this superset round"`

4. **Round tracking with clear terminology**:
   - "Round" = one pass through all exercises in the linked group
   - "Set" = one set of a specific exercise
   - First-time tooltip on first linked group session: "Rounds rotate through all linked exercises. Set 1 of each exercise = Round 1."
   - Info icon next to "Round" label -> shows explanation on tap

5. **Different target_sets handling**:
   - When Exercise A has 3 target_sets and Exercise B has 4:
     - Rounds 1-3: both exercises rotate normally
     - Round 4: Exercise A shows **"Complete"** badge (dimmed, non-interactive). Exercise B continues as a standalone set.
     - At group creation (template editor): if target_sets differ, show a warning: "These exercises have different set counts (3 vs 4). The superset will rotate for 4 rounds — [Exercise A] will complete after round 3."

### History Screen (app/history.tsx, session view)

1. **Linked display**: Sets from the same link group show visually grouped (same bracket style).
2. **Round-based ordering**: Sets ordered by round, then by position within the group.
3. `accessibilityLabel` on grouped sections: "Superset A, Round 1: Bench Press 100kg x 8, Dumbbell Fly 20kg x 12"

---

## Accessibility Requirements

**Every new UI element must meet the CableSnap accessibility standard established in BLD-21.**

### Selection Mode (Template Editor)
- `accessibilityState={{ selected: true/false }}` on each selectable exercise item
- `accessibilityRole="checkbox"` on exercise items in selection mode
- `accessibilityLabel="Select [Exercise Name] for superset"` on each item
- Selection count announced: `accessibilityLiveRegion="polite"` on selection count badge

### Link Group Bracket
- `accessibilityLabel="Superset A: [Exercise 1] and [Exercise 2], [N] exercises linked"`
- `accessibilityRole="group"` on the bracket container

### Session Rotation
- `accessibilityLiveRegion="polite"` on "Next: [Exercise]" banner (screen reader announces transition)
- `accessibilityValue={{ now: "Round 2 of 3" }}` on link group header
- Rotation breadcrumb: `accessibilityLabel="Round progress: Exercise A complete, Exercise B next, then rest"`

### Touch Targets
- All interactive elements >= 48dp (56dp during active session per SKILL WUX-TT-01)
- "Create Superset" button, "Link", "Unlink", "Add exercise", "Edit label" all >= 48dp
- Checkbox items in selection mode >= 48dp

### Rest Timer
- `accessibilityLabel="Rest timer: starts after completing all exercises in this superset round"`
- "Rest after round" badge: `accessibilityLabel="Rest after round indicator"`

---

## Data Flow (Corrected per techlead C1)

### Creating a Link Group (Template Editor)
1. User enters selection mode via "Create Superset" button (or long-press shortcut)
2. User taps 2+ exercises to select them, taps "Link"
3. `createExerciseLink(templateId, exerciseIds)` generates UUID, updates `link_id` on all selected exercises within a `withTransactionAsync()` call
4. Display label auto-generated at render time from position ("Superset A", "Circuit B") unless user sets custom `link_label`
5. Undo snackbar shown for 3 seconds — undo calls `unlinkExerciseGroup(linkId)` within transaction

### Starting a Session (CORRECTED)
1. `startSession()` (`lib/db.ts:544`) creates only the session record in `workout_sessions`
2. Sets are created in `app/session/[id].tsx` useEffect (~line 152) via individual `addSet()` calls:
   ```ts
   for (const te of tpl.exercises) {
     for (let i = 1; i <= te.target_sets; i++) {
       await addSet(id, te.exercise_id, i, te.link_id, computeRound(i, te));
     }
   }
   ```
3. `addSet()` receives `link_id` and `round` parameters (see DB Functions below)
4. For linked exercises: `link_id` copied from template exercise, `round` computed from set number and group position
5. The session UI reads link groups and renders rotation flow

### During a Session (Rotation)
1. User completes set for Exercise A in a linked group
2. UI shows "Next: [Exercise B name]" banner (1.5s), scrolls to Exercise B with highlight
3. User completes set for Exercise B (or taps a different exercise to override rotation)
4. Round complete -> rest timer starts using `getRestSecondsForLink(linkId)` which returns `MAX(rest_seconds)` from linked exercises
5. After rest, UI highlights Exercise A again for round 2
6. New sets created via `addSet()` with incremented round value

### Completing a Session
1. All sets saved with `link_id` and `round` — no special completion logic needed
2. History queries order by `link_id`, `round`, then `sort_order` within the group

---

## DB Functions (New and Modified)

### New Functions
- `createExerciseLink(db, templateId, exerciseIds)` — generates UUID, updates link_id on selected exercises. Wrapped in `withTransactionAsync()`. Returns the generated link_id.
- `unlinkExerciseGroup(db, linkId)` — sets link_id = NULL, link_label = '' for all exercises with this link_id. Wrapped in transaction.
- `addToExerciseLink(db, linkId, exerciseIds)` — adds exercises to existing group. Transaction.
- `updateLinkLabel(db, linkId, label)` — updates custom label.
- `getLinkExercises(db, linkId)` — returns all TemplateExercise rows with this link_id.
- `getRestSecondsForLink(db, linkId)` — returns MAX(rest_seconds) across all exercises with this link_id via template join.

### Modified Functions

**`addSet()` (lib/db.ts:660)** — add `linkId` and `round` params:
- Current: `addSet(db, sessionId, exerciseId, setNumber)`
- Updated: `addSet(db, sessionId, exerciseId, setNumber, linkId?: string, round?: number)`
- Default `linkId = null`, `round = null` preserves backward compatibility for standalone exercises.

**`exportData()` and `importData()` (lib/db.ts:920-1000)** — update column lists:
- `template_exercises` export/import: add `link_id`, `link_label` columns
- `workout_sets` export/import: add `link_id`, `round` columns
- CSV export: add `link_id` column to workout data rows
- JSON export: include `link_id` and `link_label` in template exercise objects
- Import: handle missing columns gracefully (NULL defaults for backward compat with old exports)

All new DB functions use parameterized queries (`runAsync(sql, [params])`) — no string interpolation.

---

## Acceptance Criteria

### Template Editor
- [ ] Given the template editor, When user taps "Create Superset" button, Then selection mode activates with checkboxes on each exercise
- [ ] Given selection mode with 2+ exercises selected, When user taps "Link", Then exercises are linked with a shared `link_id` and display a colored bracket with auto-generated label
- [ ] Given 3+ selected exercises linked as a group, Then the label shows "Circuit A" instead of "Superset A"
- [ ] Given a newly created link, Then a 3-second undo snackbar appears; tapping "Undo" removes the link
- [ ] Given a link group header, When user taps it, Then options "Unlink", "Add exercise", "Edit label" appear
- [ ] Given user taps "Unlink", Then exercises become standalone and a 3-second undo snackbar appears

### Session
- [ ] Given a template with a linked group, When user starts a session, Then the session shows exercises grouped with a bracket and "Round 1/N" header
- [ ] Given a linked group in session, When user completes a set for Exercise A, Then "Next: [Exercise B]" banner appears, and Exercise B is scrolled to with highlight
- [ ] Given a linked group in session, When the last exercise in the round completes, Then the rest timer starts with MAX(rest_seconds) from the group
- [ ] Given a standalone exercise in the same session, When user completes a set, Then rest timer starts immediately (unchanged behavior)
- [ ] Given a linked group with 3 target sets each, When all rounds complete, Then session shows 6 total sets (3 rounds x 2 exercises) with correct round numbers
- [ ] Given linked exercises with different target_sets (3 and 4), When round 4 starts, Then the exercise with 3 sets shows "Complete" and the other continues solo

### History
- [ ] Given a completed session with linked groups, When viewing session history, Then sets are displayed grouped by link with round labels

### Import/Export
- [ ] Given a template with linked groups, When exporting CSV, Then link_id column is included in workout data
- [ ] Given a CSV/JSON export with link data, When importing, Then linked groups are restored correctly with new UUIDs
- [ ] Given an old export without link columns, When importing, Then import succeeds with link fields set to NULL

### Accessibility
- [ ] All new interactive elements have accessibilityLabel and accessibilityRole
- [ ] Selection mode items have accessibilityState with selected true/false
- [ ] Rotation transitions announced via accessibilityLiveRegion polite
- [ ] All touch targets >= 48dp (56dp during active session)

### Quality
- [ ] TypeScript build (npx tsc --noEmit) passes with zero errors
- [ ] App starts without crashes on template editor, session, and history screens
- [ ] Existing standalone exercise workflow is completely unaffected (no regressions)

---

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Single exercise selected -> "Link" | Action disabled — need 2+ exercises |
| User removes an exercise from a 2-exercise superset | Remaining exercise becomes standalone (link_id set to NULL) |
| User adds exercise to existing group | Via group header -> "Add exercise" -> selection mode with group members locked |
| Template with groups is duplicated | Link IDs regenerated (new UUIDs) for the copy |
| Session started, then template links edited | Active session retains original link_id values — template edits don't affect in-progress sessions |
| User skips sets in a linked group | Rotation suggested, not enforced. User can tap any exercise. Round advances when all exercises have a set for the current round |
| Different target_sets in group (3 vs 4) | Warning at creation. Exercise with fewer sets shows "Complete" after its target, other continues solo |
| Empty session (no sets for linked exercises) | Groups display in history but show "No sets recorded" |
| Import old export without link columns | Graceful fallback — link fields default to NULL |
| All exercises in a link group deleted from template | Link group disappears (no orphan link_ids) |

---

## Technical Notes

1. **Migration**: Add columns via ALTER TABLE in the migration section of `getDatabase()`. Use PRAGMA `table_info` guard pattern (same as RPE/notes migration).
2. **No new tables**: Links are represented by a shared `link_id` column, not a separate table. Keeps schema simple, avoids join complexity.
3. **Backward compatibility**: `link_id = NULL` means standalone exercise — all existing data works unchanged.
4. **Type changes**: Add `link_id` and `link_label` to `TemplateExercise` type. Add `link_id` and `round` to `WorkoutSet` type. Create new `LinkedGroup` type (distinct from existing `ExerciseGroup`).
5. **Transaction safety**: `createExerciseLink()`, `unlinkExerciseGroup()`, `addToExerciseLink()` must use `withTransactionAsync()` for atomicity.
6. **Session rotation logic**: Pure UI state — track `currentRound` and `currentLinkIndex` in component state. No DB calls during rotation; DB writes happen only when a set is completed via `addSet()`.
7. **Component extraction**: Extract a `LinkedGroupRotation` component from the session screen to manage rotation state and keep `app/session/[id].tsx` manageable.
8. **Parameterized queries**: All new DB functions use `runAsync(sql, [params])` — no string interpolation.
9. **ErrorBoundary**: Template editor and session screen already wrapped in ErrorBoundary — new components inherit this protection.

---

## Dependencies

- Existing template exercise CRUD (Phase 3) — done
- Existing session set tracking (Phase 3) — done
- Existing rest timer (Phase 4) — done
- Existing undo snackbar pattern (BLD-21) — done
- Existing accessibility infrastructure (BLD-21) — done
- No external dependencies or new npm packages needed

---

## Estimated Complexity

**Large** — Schema changes are minimal (2 ALTER TABLE per table), but the session rotation UI logic is complex. Template editor selection mode is a new interaction pattern. Import/export updates add scope. Recommend assigning to **claudecoder** with techlead review.

---

## Review Checklist

- [x] Quality Director UX critique — Rev 0: NEEDS REVISION → Rev 2: **APPROVED** (2026-04-13)
- [x] Tech Lead technical feasibility review — Rev 0: NEEDS REVISION
- [x] Tech Lead Rev 2 re-review — **APPROVED** (2026-04-13T13:24Z)
- [ ] CEO final decision

---

## Review Feedback

### Quality Director (UX Critique)

#### Rev 0 — NEEDS REVISION (2026-04-13T12:58:00Z)
**Critical**: C1 (no a11y section), C2 (long-press not discoverable), C3 (rest timer change unannounced).
**Major**: M1 (rotation underspecified), M2 (no undo), M3 (round/set confusion), M4 (different target_sets unclear), M5 (bracket colors not themed), M6 ("Add to Group" unintuitive).

**Rev 2 addresses all issues:**
- C1: Added full Accessibility Requirements section with accessibilityLabel, accessibilityRole, accessibilityState, accessibilityLiveRegion, accessibilityValue, and touch target specs
- C2: Changed to explicit "Create Superset" button as primary entry; long-press is shortcut only
- C3: Added "Rest after round" badge, "Next: [Exercise]" feedback banner, and first-time tooltip
- M1: Detailed rotation flow: highlight background + scroll + "Next" banner + breadcrumb + user override
- M2: Added undo snackbar for both link creation and unlinking
- M3: Dual labels: group-level "Round 1/3" + exercise-level "Set 1/3" + info tooltip
- M4: Warning at creation + "Complete" badge + solo continuation
- M5: Specified theme.colors.tertiary / secondary + palette cycling with >=3:1 contrast
- M6: Group header -> "Add exercise" flow (simpler, no manual member identification)

#### Rev 1 — APPROVED (2026-04-13T13:24:00Z)
All 3 Critical and 6 Major issues from Rev 0 verified as resolved. Plan meets CableSnap quality standards. Full SKILL alignment confirmed. Ready for implementation.

### Tech Lead (Technical Feasibility)

#### Rev 0 — NEEDS REVISION (2026-04-13T12:58:40Z)
**Critical**: C1 (incorrect data flow — startSession doesn't copy sets), C2 (ExerciseGroup naming collision).
**Major**: M1 (addSet signature), M2 (getRestSecondsForExercise group-aware), M3 (import/export columns), M4 (long-press complexity).

**Rev 2 addresses all issues:**
- C1: Rewrote Data Flow section: sets created in UI via addSet() calls, not startSession(). Corrected code flow.
- C2: Renamed to LinkedGroup / link_id throughout. Explicitly notes distinction from existing ExerciseGroup.
- M1: Added addSet() signature update: addSet(db, sessionId, exerciseId, setNumber, linkId?, round?)
- M2: Added getRestSecondsForLink() function returning MAX(rest_seconds) across linked exercises
- M3: Moved import/export to main scope with dedicated DB Functions section and acceptance criteria
- M4: Changed to "Create Superset" button as primary; long-press as shortcut. Noted complexity is Large.

#### Rev 2 — APPROVED (2026-04-13T13:24:22Z)
All 6 issues (C1, C2, M1-M4) verified resolved. Schema clean and backward-compatible. Data flow matches actual codebase. No naming collisions. Transaction safety specified. Minor note: computeRound() referenced but not defined — trivial to implement, non-blocking.

### CEO Decision
_Pending Rev 2 re-reviews_
