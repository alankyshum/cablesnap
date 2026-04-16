# Feature Plan: Session Rating & Save-as-Template

**Issue**: BLD-TBD
**Author**: CEO
**Date**: 2026-04-16
**Status**: DRAFT

## Problem Statement

FitForge tracks workout data well (sets, reps, weight, RPE, per-set notes) but lacks two features gym-goers use daily:

1. **No session rating** — After completing a workout, users have no way to capture how it felt (energy, difficulty, satisfaction). This subjective signal is valuable for tracking overtraining, deload timing, and motivation trends. The session `notes` field exists in the DB but is only set on completion and not prominently surfaced in the UI.

2. **No save-as-template** — When users complete a good ad-hoc workout (or modify a templated one significantly), they cannot save it as a reusable template. They must manually recreate it from scratch. This friction discourages experimentation.

### Evidence

- `workout_sessions.notes` field exists but defaults to empty string and has no UI input
- No `rating` column exists in `workout_sessions`
- No `createTemplateFromSession()` function exists in `lib/db/`
- Session summary (`app/session/summary/[id].tsx`) shows PRs, comparisons, achievements — but no rating or save options
- Session detail (`app/session/detail/[id].tsx`) displays notes read-only but has no edit capability for completed sessions

## User Stories

- As a user, I want to rate my workout after completing it so I can track how sessions feel over time
- As a user, I want to add session-level notes (not just per-set) during or after a workout to record thoughts about the session
- As a user, I want to save a completed session as a reusable template so I don't have to manually recreate good workouts
- As a user, I want to see my rating trends over time so I can detect overtraining or periods of low energy

## Proposed Solution

### Overview

Add three features to the post-workout flow:

1. **Session rating** — A 1–5 star rating on the session summary screen, persisted to a new `rating` column on `workout_sessions`
2. **Session notes** — A text input for session-level notes on the summary screen (using the existing `notes` column)
3. **Save as template** — A button on session summary and session detail to create a new template from the session's exercises and set structure

### UX Design

#### Session Rating (Summary Screen)

After workout completion, the summary screen shows a 5-star rating widget between the session stats card and the PRs section:

- **Display**: 5 `MaterialCommunityIcons` stars (`star` filled, `star-outline` unfilled)
- **Default**: No rating selected (all stars outlined)
- **Interaction**: Tap a star to set rating (1–5). Tapping the same star again clears the rating.
- **Persistence**: Rating saves immediately on tap via `updateSessionRating(id, rating)`
- **Accessibility**: `accessibilityRole="adjustable"`, `accessibilityValue={{ min: 0, max: 5, now: rating }}`, swipe left/right to adjust
- **Label**: "How was your workout?" above the stars, current value shown as text below (e.g., "Great" for 4, "Tough" for 5)

Rating labels:
| Value | Label | Color |
|-------|-------|-------|
| 1 | Terrible | `theme.colors.error` |
| 2 | Hard | `theme.colors.tertiary` |
| 3 | Okay | `theme.colors.secondary` |
| 4 | Great | `theme.colors.primary` |
| 5 | Amazing | `theme.colors.primary` |
| null | Not rated | `theme.colors.onSurfaceDisabled` |

#### Session Notes (Summary Screen)

Below the rating widget, a collapsible text input for session notes:

- **Display**: Icon button `note-edit-outline` with label "Session notes" — expands to a `TextInput` on tap
- **Default**: Collapsed if notes are empty, expanded if notes exist
- **Max length**: 500 characters (counter shown when expanded)
- **Persistence**: Save on blur via `updateSessionNotes(id, notes)` — uses existing `completeSession` notes field
- **Accessibility**: `accessibilityLabel="Session notes"`, `accessibilityHint="Double tap to add notes about this workout"`

#### Save as Template (Summary & Detail Screens)

A button at the bottom of the summary screen and in the header actions of session detail:

- **Summary screen**: `Button` with icon `content-save-outline`, label "Save as Template"
- **Detail screen**: `IconButton` in the header with `content-save-outline`
- **Flow**:
  1. Tap "Save as Template"
  2. Alert dialog with text input for template name (pre-filled with session name)
  3. On confirm: `createTemplateFromSession(sessionId, name)` creates the template
  4. Success snackbar: "Template saved! [View]" — tapping "View" navigates to `/template/[newId]`
  5. Error snackbar if creation fails

- **What gets saved**: Exercise order, set count per exercise, target weight/reps from completed sets, training mode, link_id groupings (supersets). Does NOT copy: timestamps, RPE values, incomplete sets, notes.

#### Rating in History & Detail

- **History screen** (`app/history.tsx`): Show rating stars (small, read-only) on session cards next to the date
- **Session detail** (`app/session/detail/[id].tsx`): Show rating stars (editable) and session notes (editable) at the top of the detail view
- **Progress tab**: No rating chart in this phase (deferred to future phase to keep scope tight)

### Technical Approach

#### Database Changes

Add `rating` column to `workout_sessions`:

```sql
ALTER TABLE workout_sessions ADD COLUMN rating INTEGER DEFAULT NULL;
```

Migration via existing PRAGMA-based column check pattern (see `.learnings/patterns/react-native.md` — "PRAGMA table_info Guard for SQLite Column Migrations"):

```typescript
const cols = await query("PRAGMA table_info(workout_sessions)");
if (!cols.some(c => c.name === "rating")) {
  await execute("ALTER TABLE workout_sessions ADD COLUMN rating INTEGER DEFAULT NULL");
}
```

Rating values: `null` (not rated), `1`, `2`, `3`, `4`, `5`. No new table needed.

#### New DB Functions (in `lib/db/sessions.ts`)

```typescript
async function updateSessionRating(id: string, rating: number | null): Promise<void>
async function updateSessionNotes(id: string, notes: string): Promise<void>
async function createTemplateFromSession(sessionId: string, name: string): Promise<string>
```

`createTemplateFromSession` should:
1. Query the session's sets grouped by exercise_id, ordered by set_number
2. Create a new template via `createTemplate(name)`
3. For each exercise group, call `addExerciseToTemplate(templateId, exerciseId, order, sets)` — using the completed sets' weight/reps as targets
4. Preserve link_id groupings (supersets) by mapping old link_ids to new UUIDs
5. Preserve training_mode per set
6. Return the new template ID

#### Component Changes

1. **`app/session/summary/[id].tsx`**: Add `RatingWidget` and `SessionNotesInput` components, plus "Save as Template" button
2. **`app/session/detail/[id].tsx`**: Add editable rating and notes at top, plus save-as-template icon in header
3. **`app/history.tsx`**: Show read-only mini rating stars on session cards
4. **`components/RatingWidget.tsx`**: Reusable 5-star rating component with accessibility support

#### Export/Import

Update `lib/db/import-export.ts` version to `3`:
- Export: Include `rating` field in `workout_sessions` rows
- Import: Handle both v2 (no rating) and v3 (with rating) formats gracefully — v2 imports set `rating = null`

### Scope

**In Scope:**
- Session rating (1–5 stars) on summary and detail screens
- Session notes input on summary screen
- Editable rating and notes on session detail screen (for past sessions)
- Read-only mini rating on history session cards
- Save session as template from summary and detail screens
- DB migration for `rating` column
- Export/import v3 format support
- Unit tests for `createTemplateFromSession`, `updateSessionRating`
- Accessibility for rating widget

**Out of Scope:**
- Rating trends chart in progress tab (future phase)
- Rating-based workout recommendations (future phase)
- Bulk rating of past sessions
- Rating/notes for in-progress sessions (only on summary/detail of completed sessions)
- Template editing from save-as-template flow (use existing template editor)

### Acceptance Criteria

- [ ] Given a completed workout, When I view the summary, Then I see a 5-star rating widget with "How was your workout?" label
- [ ] Given the rating widget, When I tap star 4, Then stars 1-4 fill and "Great" label appears, and the rating persists after navigating away and returning
- [ ] Given a rated session, When I tap the same star again, Then the rating clears to null
- [ ] Given the summary screen, When I tap the notes icon, Then a text input expands with 500-char limit
- [ ] Given session notes, When I type and blur the input, Then notes persist to the database
- [ ] Given a completed session, When I tap "Save as Template", Then an alert asks for template name pre-filled with session name
- [ ] Given I confirm save-as-template, Then a new template is created with the session's exercises, set counts, weights, and reps
- [ ] Given supersets in the session, When I save as template, Then superset groupings are preserved in the new template
- [ ] Given the history screen, When I view a rated session card, Then I see small filled stars showing the rating
- [ ] Given session detail for a completed session, When I view it, Then I can edit the rating and notes
- [ ] Given I export data, When I import on another device, Then session ratings are preserved
- [ ] Given I import a v2 export (no ratings), When import completes, Then all sessions have `rating = null` (no crash)
- [ ] Given the rating widget, When I use VoiceOver/TalkBack, Then I can adjust the rating with swipe gestures and hear the current value
- [ ] PR passes all existing tests with no regressions
- [ ] No new lint warnings
- [ ] At least 10 new unit tests covering rating CRUD, save-as-template, and export/import v3

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Session with no completed sets | Save-as-template button disabled with tooltip "No exercises to save" |
| Session with only bodyweight exercises (weight=null) | Template saves with weight=null for those exercises |
| Very long session name (>100 chars) | Truncate to 100 chars in template name pre-fill, allow user to edit |
| Duplicate template name | Allow it — templates don't enforce unique names |
| Session from deleted template | Save-as-template still works (uses session's exercise data, not template) |
| Cancelled session (no completed_at) | Rating widget and save-as-template not shown |
| Export with rating=null | Export includes `"rating": null` — don't omit the field |
| Import v3 into older app | Graceful — extra `rating` field ignored by older import code |
| Rapid star taps | Debounce DB writes to 300ms — only persist final value |
| Accessibility: screen reader on stars | Announce "Rating: 4 out of 5, Great. Adjustable." |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| DB migration fails on existing data | Low | High | PRAGMA check + null default = safe ALTER TABLE |
| Save-as-template loses superset groupings | Medium | Medium | Map old link_ids to new UUIDs; test with superset session |
| Export v3 breaks v2 import | Low | High | Version check in import code; handle missing `rating` field |
| Rating widget not accessible | Low | Medium | Use `accessibilityRole="adjustable"` with increment/decrement actions |

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
