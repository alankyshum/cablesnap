# Feature Plan: Session Rating & Save-as-Template

**Issue**: BLD-234
**Author**: CEO
**Date**: 2026-04-16
**Status**: APPROVED

## Problem Statement

CableSnap tracks workout data well (sets, reps, weight, RPE, per-set notes) but lacks two features gym-goers use daily:

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
- **Persistence**: Rating saves immediately on tap via `updateSession(id, { rating })` — no debounce (local SQLite writes are sub-ms, debounce adds complexity and risks data loss on navigation per BLD-183 learning)
- **Accessibility**: `accessibilityRole="adjustable"`, `accessibilityValue={{ min: 0, max: 5, now: rating }}`, swipe left/right to adjust
- **Label**: "How was your workout?" above the stars, current value shown as text below (e.g., "Good" for 4, "Amazing" for 5)
- **Touch targets**: Each star must be ≥48x48dp (WCAG / SKILL requirement). Use `Pressable` with `hitSlop` or explicit `minWidth: 48, minHeight: 48` styling.
- **Clear interaction**: Long-press any star to clear the rating (alternative to re-tapping same star). Both gestures supported.

Rating labels (pure satisfaction scale — no difficulty semantics):
| Value | Label | Color |
|-------|-------|-------|
| 1 | Terrible | `theme.colors.error` |
| 2 | Poor | `theme.colors.tertiary` |
| 3 | Okay | `theme.colors.secondary` |
| 4 | Good | `theme.colors.primary` |
| 5 | Amazing | `theme.colors.primary` |
| null | Not rated | `theme.colors.onSurfaceDisabled` |

#### Session Notes (Summary Screen)

Below the rating widget, a collapsible text input for session notes:

- **Display**: Icon button `note-edit-outline` with label "Session notes" — expands to a `TextInput` on tap
- **Default**: Collapsed if notes are empty, expanded if notes exist
- **Max length**: 500 characters (counter shown when expanded)
- **Persistence**: Save on blur via `updateSession(id, { notes })` — uses existing `workout_sessions.notes` column
- **Input type**: `multiline` TextInput (not single-line) to support longer session reflections
- **Accessibility**: `accessibilityLabel="Session notes"`, `accessibilityHint="Double tap to add notes about this workout"`

#### Save as Template (Summary & Detail Screens)

A button at the bottom of the summary screen and in the header actions of session detail:

- **Summary screen**: `Button` with icon `content-save-outline`, label "Save as Template"
- **Detail screen**: `IconButton` in the header with `content-save-outline`
- **Flow**:
  1. Tap "Save as Template"
  2. **Cross-platform modal** (NOT `Alert.prompt` — iOS-only) with `TextInput` for template name, pre-filled with session name. Use a simple `Modal` or `@gorhom/bottom-sheet` (already in the project).
  3. On confirm: `createTemplateFromSession(sessionId, name)` creates the template
  4. Success snackbar: "Template saved! [View]" — tapping "View" navigates to `/template/[newId]`
  5. Error snackbar if creation fails

- **What gets saved**: Exercise order, set count per exercise, target reps from completed sets, training mode, link_id groupings (supersets). Does NOT copy: timestamps, RPE values, incomplete sets, notes, weight (template_exercises has no weight column — users set weight when they start the workout).
- **Disabled state**: When session has no completed sets, button shows disabled with `accessibilityState={{ disabled: true }}` and tooltip "No exercises to save"

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
// Single update function for session metadata (rating + notes)
async function updateSession(id: string, fields: { rating?: number | null; notes?: string }): Promise<void>
async function createTemplateFromSession(sessionId: string, name: string): Promise<string>
```

**Row mapping audit** — per learnings (BLD-82), all functions querying `workout_sessions` with manual `rows.map()` must include `rating` in the mapped result. Functions to update:
- `getSessionById`
- `getRecentSessions`
- `getSessionsByMonth`
- `getSessionsByDateRange`

`createTemplateFromSession` should:
1. Query the session's sets grouped by exercise_id, ordered by set_number
2. Wrap entire operation in `withTransactionAsync` for atomicity
3. Create a new template via `createTemplate(name)`
4. For each exercise group, use **raw SQL INSERT** (like `duplicateTemplate()` in templates.ts) — NOT `addExerciseToTemplate()` which hardcodes `link_id: null`
5. Preserve link_id groupings (supersets) by mapping old link_ids to new UUIDs (same pattern as `duplicateTemplate`)
6. Preserve training_mode per set
7. Return the new template ID

**Note**: `template_exercises` has no `target_weight` column — weight is NOT saved. Only exercise order, set count, target_reps, rest_seconds, link_id, and link_label are preserved.

#### Component Changes

1. **`app/session/summary/[id].tsx`**: Add `RatingWidget` and `SessionNotesInput` components, plus "Save as Template" button
2. **`app/session/detail/[id].tsx`**: Add editable rating and notes at top, plus save-as-template icon in header
3. **`app/history.tsx`**: Show read-only mini rating stars on session cards
4. **`components/RatingWidget.tsx`**: Reusable 5-star rating component with accessibility support

#### Export/Import

Update `lib/db/import-export.ts` version to **v4** (current format is v3 — see import-export.ts:289):
- Export: Include `rating` field in `workout_sessions` rows, bump version to `4`
- Import: Handle v3 (no rating) and v4 (with rating) formats — v3 imports set `rating = null`
- Update `future_version` check from `>= 4` to `>= 5` (import-export.ts:172)
- Import INSERT for `workout_sessions` (line ~439) must add `rating` column with `row.rating ?? null` (per BLD-174 learning)
- Also ensure `program_day_id` is included in import INSERT if missing (QD finding)

### Scope

**In Scope:**
- Session rating (1–5 stars) on summary and detail screens
- Session notes input on summary screen
- Editable rating and notes on session detail screen (for past sessions)
- Read-only mini rating on history session cards
- Save session as template from summary and detail screens
- DB migration for `rating` column
- Export/import v4 format support (bump from v3)
- Unit tests for `createTemplateFromSession`, `updateSession`
- Accessibility for rating widget

**Out of Scope:**
- Rating trends chart in progress tab (future phase)
- Rating-based workout recommendations (future phase)
- Bulk rating of past sessions
- Rating/notes for in-progress sessions (only on summary/detail of completed sessions)
- Template editing from save-as-template flow (use existing template editor)

### Acceptance Criteria

- [ ] Given a completed workout, When I view the summary, Then I see a 5-star rating widget with "How was your workout?" label
- [ ] Given the rating widget, When I tap star 4, Then stars 1-4 fill and "Good" label appears, and the rating persists after navigating away and returning
- [ ] Given a rated session, When I tap the same star again, Then the rating clears to null
- [ ] Given the summary screen, When I tap the notes icon, Then a text input expands with 500-char limit
- [ ] Given session notes, When I type and blur the input, Then notes persist to the database
- [ ] Given a completed session, When I tap "Save as Template", Then an alert asks for template name pre-filled with session name
- [ ] Given I confirm save-as-template, Then a new template is created with the session's exercises, set counts, and reps (no weight — template_exercises has no weight column)
- [ ] Given supersets in the session, When I save as template, Then superset groupings are preserved in the new template
- [ ] Given the history screen, When I view a rated session card, Then I see small filled stars showing the rating
- [ ] Given session detail for a completed session, When I view it, Then I can edit the rating and notes
- [ ] Given I export data, When I import on another device, Then session ratings are preserved
- [ ] Given I import a v3 export (no ratings), When import completes, Then all sessions have `rating = null` (no crash)
- [ ] Given the rating widget, When I use VoiceOver/TalkBack, Then I can adjust the rating with swipe gestures and hear the current value
- [ ] Given a star in the rating widget, When rendered, Then its touch target is at least 48x48dp
- [ ] PR passes all existing tests with no regressions
- [ ] No new lint warnings
- [ ] At least 10 new unit tests covering rating CRUD, save-as-template, and export/import v4

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Session with no completed sets | Save-as-template button disabled with tooltip "No exercises to save" |
| Session with only bodyweight exercises (weight=null) | Template saves normally — no weight column in template_exercises |
| Very long session name (>100 chars) | Truncate to 100 chars in template name pre-fill, allow user to edit |
| Duplicate template name | Allow it — templates don't enforce unique names |
| Session from deleted template | Save-as-template still works (uses session's exercise data, not template) |
| Cancelled session (no completed_at) | Rating widget and save-as-template not shown |
| Export with rating=null | Export includes `"rating": null` — don't omit the field |
| Import v4 into older app (v3-only) | Older app shows "future version" error — clean failure, no data corruption |
| Rapid star taps | No debounce — immediate SQLite write on each tap (sub-ms). No data loss risk. |
| Accessibility: screen reader on stars | Announce "Rating: 4 out of 5, Good. Adjustable." |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| DB migration fails on existing data | Low | High | PRAGMA check + null default = safe ALTER TABLE |
| Save-as-template loses superset groupings | Medium | Medium | Map old link_ids to new UUIDs; test with superset session |
| Export v4 breaks v3 import | Low | High | Version check in import code; handle missing `rating` field; bump future_version to >=5 |
| Rating widget not accessible | Low | Medium | Use `accessibilityRole="adjustable"` with increment/decrement actions |

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)
**Round 1 Verdict: NEEDS REVISION** (7 blocking issues) — 2026-04-16
**Round 2 Verdict: APPROVED** — 2026-04-16T16:09:30Z

All 7 blocking issues resolved in v2 revision. Rating labels fixed (pure satisfaction scale), Alert.prompt replaced with cross-platform modal, export bumped to v4, superset preservation via raw SQL, weight mapping clarified, touch targets ≥48dp specified, debounce eliminated (immediate writes). All QD recommendations adopted. SKILL-compliant. Ready for implementation.

### Tech Lead (Technical Feasibility)
**Round 1 Verdict: NEEDS REVISION** (2 issues must fix) — 2026-04-16T15:55Z
**Round 2 Verdict: APPROVED** — 2026-04-16T16:09Z

All 5 issues addressed in v2 revision:
1. ✅ Export/import version corrected to v4 (was incorrectly v3)
2. ✅ Weight removed from `createTemplateFromSession` — templates have no weight column
3. ✅ Row mapping audit explicitly listed (getSessionById, getRecentSessions, getSessionsByMonth, getSessionsByDateRange)
4. ✅ Import INSERT updated to include `rating` with `row.rating ?? null`
5. ✅ Debounce removed — immediate SQLite writes

All recommendations adopted: single `updateSession()` function, `duplicateTemplate()` as pattern for link_id remapping, `withTransactionAsync` for atomicity.

**Feasibility**: Yes — additive changes, no refactoring needed. **Effort**: Medium | **Risk**: Low | **New deps**: None. Ready for implementation.

### CEO Decision
**All reviewer feedback addressed in this revision (v2).** Summary of changes:

1. ✅ Rating labels: "Hard" → "Poor" (pure satisfaction scale) — QD #1
2. ✅ Alert.prompt → cross-platform modal/bottom sheet — QD #2
3. ✅ Export version: v3 → v4 (current is v3) — QD #3, TL #1
4. ✅ Superset: use raw SQL INSERT like `duplicateTemplate()`, not `addExerciseToTemplate()` — QD #4
5. ✅ Removed "target weight" language (template_exercises has no weight column) — QD #5, TL #2
6. ✅ Star touch targets ≥48x48dp specified — QD #6
7. ✅ Removed debounce, immediate writes — QD #7, TL #5
8. ✅ Row mapping audit listed explicitly — TL #3
9. ✅ Import INSERT must add `rating` column — TL #4
10. ✅ Single `updateSession(id, { rating?, notes? })` instead of two functions — TL recommendation
11. ✅ `withTransactionAsync` for `createTemplateFromSession` — QD recommendation
12. ✅ `multiline` TextInput for notes — QD recommendation
13. ✅ Long-press to clear rating — QD recommendation
14. ✅ Disabled state accessibility for save-as-template button — QD finding

**Requesting re-review from QD and TL.**
