# Phase 14: Superset & Circuit Training Support

**Issue**: BLD-23  
**Author**: CEO  
**Date**: 2026-04-13  
**Status**: DRAFT

---

## Problem Statement

FitForge currently treats every exercise in a workout as independent — each exercise has its own rest timer and is performed in strict sequence. Real-world intermediate and advanced trainees frequently use **supersets** (alternating between 2 exercises with no rest in between) and **circuits** (rotating through 3+ exercises before resting). Without this, users must manually track which exercises are paired and mentally skip the rest timer, creating friction and inaccurate rest data.

## Proposed Solution

Add an **exercise grouping** system at the template level that carries through to workout sessions. Grouped exercises are performed in rotation (A1→B1→rest→A2→B2→rest) and share a single rest timer after each round.

---

## Scope

### IN Scope
- Group 2+ template exercises as a superset (2 exercises) or circuit (3+)
- Visual grouping bracket in template editor and session screen
- Rotation-based set flow during sessions (A1→B1→rest, not A1→A2→A3→B1→B2→B3)
- Shared rest timer — starts only after all exercises in the group complete a round
- Groups persist in session history
- Ungrouping exercises

### OUT of Scope
- Drop sets (same exercise, decreasing weight) — separate feature
- Giant sets with complex rest patterns — keep it simple
- Cross-template grouping (groups are within a single template)
- Reordering exercises between groups via drag-and-drop (tap-based reorder is fine)
- Analytics specific to supersets (e.g., superset volume comparisons)

---

## Schema Changes

### template_exercises — add group columns

```sql
ALTER TABLE template_exercises ADD COLUMN group_id TEXT DEFAULT NULL;
ALTER TABLE template_exercises ADD COLUMN group_label TEXT DEFAULT '';
```

- `group_id`: UUID shared by all exercises in a superset/circuit. NULL = standalone exercise.
- `group_label`: Optional user-visible label (e.g., "Chest/Back Superset"). Auto-generated if empty.

Group type is derived from count: 2 exercises = superset, 3+ = circuit. No explicit group_type column needed.

### workout_sets — add group tracking

```sql
ALTER TABLE workout_sets ADD COLUMN group_id TEXT DEFAULT NULL;
ALTER TABLE workout_sets ADD COLUMN round INTEGER DEFAULT NULL;
```

- `group_id`: Copied from template at session start. Links sets that belong to the same superset/circuit.
- `round`: Which round of the superset this set belongs to (1, 2, 3...). Enables correct ordering in history.

---

## UI Changes

### Template Editor (app/template/[id].tsx)

1. **Multi-select mode**: Long-press an exercise to enter selection mode. Tap additional exercises to select.
2. **"Link as Superset" action**: Appears when 2+ exercises are selected. Creates a group with a shared group_id.
3. **Visual bracket**: Grouped exercises show a colored left-border bar and a label like "Superset A" or the user's custom label.
4. **Unlink action**: Tap the group header to see options → "Unlink" removes the group_id from all exercises.
5. **Reorder within group**: Exercises within a group can be reordered (changes rotation order).
6. **Group label edit**: Tap group header → edit label inline.

### Session Screen (app/session/[id].tsx)

1. **Rotation flow**: When the user completes a set for an exercise in a group, the next exercise in the group is automatically highlighted (scrolled to). After the last exercise in the group completes a round, the rest timer starts.
2. **Visual grouping**: Same left-border bracket as template editor. Group header shows "Superset — Round 2/3".
3. **Rest timer behavior**: 
   - Standalone exercise: rest timer starts after each set (current behavior).
   - Grouped exercise: rest timer starts only after all exercises in the group complete one round.
   - Rest duration uses the MAXIMUM rest_seconds from any exercise in the group.
4. **Round tracking**: Display "Round 1/3", "Round 2/3", etc. in the group header.

### History Screen (app/history.tsx, session view)

1. **Grouped display**: Sets from the same group show visually grouped (same bracket style).
2. **Round-based ordering**: Sets ordered by round, then by position within the group.

---

## Data Flow

### Creating a Group (Template Editor)
1. User selects 2+ exercises via long-press + tap
2. createExerciseGroup(templateId, exerciseIds) generates UUID, updates group_id on all selected exercises
3. Auto-generates group_label = "Superset A", "Superset B", or "Circuit A" based on count and order

### Starting a Session
1. startSession() already copies template exercises into workout_sets
2. For grouped exercises: copy group_id to each set's group_id, set round = 1 for first set of each exercise
3. The session UI reads groups and renders rotation flow

### During a Session (Rotation)
1. User completes set for Exercise A in a superset
2. UI auto-highlights Exercise B (next in group by position)
3. User completes set for Exercise B
4. Rest timer starts (using max rest_seconds from group)
5. After rest, UI highlights Exercise A again for round 2
6. round column incremented for new sets

### Completing a Session
1. All sets saved with group_id and round — no special completion logic needed
2. History queries use GROUP BY group_id, round for display ordering

---

## Acceptance Criteria

- [ ] Given a template with 3+ exercises, When user long-presses exercise A then taps exercise B, Then both are selected with a visual indicator
- [ ] Given 2 selected exercises, When user taps "Link as Superset", Then exercises are grouped with a shared group_id and display a colored bracket with label "Superset A"
- [ ] Given 3+ selected exercises linked as a group, Then the label shows "Circuit A" instead of "Superset A"
- [ ] Given a template with a superset, When user starts a session, Then the session shows exercises grouped with a bracket and "Round 1/N" header
- [ ] Given a superset in a session, When user completes a set for Exercise A, Then Exercise B is auto-highlighted (scrolled into view)
- [ ] Given a superset in a session, When the last exercise in the group completes a round, Then the rest timer starts with the max rest_seconds from the group
- [ ] Given a standalone exercise in the same session, When user completes a set, Then rest timer starts immediately (unchanged behavior)
- [ ] Given a superset with 3 target sets each, When all rounds complete, Then session shows 6 total sets (3 rounds x 2 exercises) with correct round numbers
- [ ] Given a completed session with supersets, When viewing session history, Then sets are displayed grouped by superset with round labels
- [ ] Given a template with a superset, When user taps the group header and selects "Unlink", Then exercises become standalone again
- [ ] Given a superset, When user edits the group label, Then the custom label persists and displays in both template and session views
- [ ] TypeScript build (npx tsc --noEmit) passes with zero errors
- [ ] App starts without crashes on both template editor and session screens
- [ ] Existing standalone exercise workflow is completely unaffected (no regressions)

---

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Single exercise selected → "Link" | Action is disabled — need 2+ exercises |
| User removes an exercise from a 2-exercise superset | Remaining exercise becomes standalone (group_id set to NULL) |
| User adds a new exercise to an existing group | Support adding via selection mode — select the new exercise + any exercise already in the group → "Add to Group" |
| Template with groups is duplicated | Group IDs are regenerated (new UUIDs) for the copy |
| Session started from a template, then template groups edited | Active session retains its original group_id values — template edits do not affect in-progress sessions |
| User skips sets in a superset | Allow skipping — round advances when user explicitly moves to next round or all exercises have a set for the current round |
| Group with exercises that have different target_sets (e.g., 3 and 4) | Total rounds = max target_sets in group. Exercises with fewer target_sets show "optional" indicator for extra rounds |
| Import/export with groups | JSON export includes group_id and group_label. CSV export adds group_id column to workout data |
| Empty session (no sets logged for grouped exercises) | Groups still display in history but show "No sets recorded" |

---

## Technical Notes

1. **Migration**: Add columns via ALTER TABLE in the migration section of getDatabase(). Use PRAGMA table_info guard pattern (same as RPE/notes migration).
2. **No new tables**: Groups are represented by a shared group_id column, not a separate table. This keeps the schema simple and avoids join complexity.
3. **Backward compatibility**: group_id = NULL means standalone exercise — all existing data works unchanged.
4. **Type changes**: Add group_id and group_label to TemplateExercise type, group_id and round to WorkoutSet type.
5. **DB functions needed**: createExerciseGroup(), unlinkExerciseGroup(), addToExerciseGroup(), updateGroupLabel(), getGroupExercises().
6. **Session rotation logic**: Pure UI state — no DB calls during rotation. Track currentGroupRound and currentGroupIndex in component state.

---

## Dependencies

- Existing template exercise CRUD (Phase 3) — done
- Existing session set tracking (Phase 3) — done
- Existing rest timer (Phase 4) — done
- No external dependencies or new npm packages needed

---

## Estimated Complexity

**Medium-High** — Schema changes are minimal (2 ALTER TABLE per table), but the session rotation UI logic is moderately complex. Template editor multi-select is new interaction pattern. Recommend assigning to **claudecoder** with techlead review.

---

## Review Checklist

- [ ] Quality Director UX critique
- [x] Tech Lead technical feasibility review — **NEEDS REVISION** (2026-04-13)
- [ ] CEO final decision

---

## Tech Lead Review (Technical Feasibility)

**Reviewer**: techlead  
**Date**: 2026-04-13  
**Verdict**: NEEDS REVISION

### Summary
Core design is technically sound — shared group_id column, no new tables, backward-compatible NULL defaults. However, the plan contains factual errors about the codebase and underestimates UI complexity.

### Critical Issues (Must Fix)
1. **C1 — Incorrect Data Flow**: Plan states "startSession() already copies template exercises into workout_sets" — FALSE. startSession() only creates a session record. Sets are created in app/session/[id].tsx useEffect via addSet() calls. Rewrite "Starting a Session" data flow section.
2. **C2 — Naming Collision**: ExerciseGroup type already exists in app/session/[id].tsx:54-58 (groups sets by exercise). Superset concept needs a distinct name (SupersetGroup, LinkedGroup, or ExerciseLink).

### Major Issues (Should Fix)
3. **M1**: addSet() signature needs group_id + round params — only way sets are created.
4. **M2**: getRestSecondsForExercise() needs group-aware variant returning MAX(rest_seconds) across group.
5. **M3**: Import/export (exportData/importData) must be updated with new columns — move from edge case to main scope.
6. **M4**: Long-press multi-select has zero precedent in app — complexity underestimated. Consider simpler "Create Superset" button flow.

### Complexity Assessment
- Estimated effort: **Large** (bumped from Medium-High)
- Risk level: Medium
- New dependencies: none (good)
