# PLAN: Workout Programs / Training Plans (Phase 10)

**BLD-XX** | Priority: High | Project: CableSnap
**Status**: DRAFT

---

## Problem Statement

CableSnap currently supports individual workout templates — users can create a workout (e.g., "Chest Day"), add exercises, and start a session. However, there's no way to organize multiple workouts into a structured **training program** (e.g., Push/Pull/Legs, Upper/Lower, 5/3/1).

This forces users to manually remember which workout to do next and which day they're on in their split. Most commercial gym apps (Strong, JEFIT, Hevy) offer this feature behind a paywall. Making it free in CableSnap is a strong differentiator.

## Proposed Solution

Add a **Programs** feature that lets users:
1. Create a named program with an ordered list of workout days
2. Each day links to an existing workout template
3. Track which day the user is currently on
4. Auto-advance to the next day after completing a workout
5. View program history and progress

### Data Model

Three new tables:

```sql
CREATE TABLE IF NOT EXISTS programs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_active INTEGER DEFAULT 0,
  current_day INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS program_days (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  label TEXT DEFAULT '',
  FOREIGN KEY (program_id) REFERENCES programs(id),
  FOREIGN KEY (template_id) REFERENCES workout_templates(id)
);

CREATE TABLE IF NOT EXISTS program_log (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL,
  day_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  completed_at INTEGER NOT NULL,
  FOREIGN KEY (program_id) REFERENCES programs(id),
  FOREIGN KEY (day_id) REFERENCES program_days(id),
  FOREIGN KEY (session_id) REFERENCES workout_sessions(id)
);
```

### Navigation & UX

**Tab Integration**: Add a segmented control at the top of the existing Workouts tab (no new tab — keep tabs at 5):

```
[Templates] [Programs]
```

**Program Creation Flow**:
1. Tap "New Program" FAB on Programs segment
2. Enter name + optional description
3. Add days by selecting from existing templates
4. Reorder days with up/down buttons (a11y-friendly)
5. Save program

**Active Program Flow**:
1. Only one program can be active at a time
2. When active, the Workouts tab shows "Next Workout: [Day Name]" banner at top
3. Tapping the banner starts a session from that day's template
4. After completing the session, auto-advance current_day (wrap to 0 at end)
5. Session is logged in program_log for tracking

**Program Detail Screen** (app/program/[id].tsx):
- Program name, description, number of days
- List of days with template names
- "Set Active" / "Deactivate" button
- Progress indicator showing current day
- History section showing completed sessions

### New Files

| File | Purpose |
|------|---------|
| app/program/[id].tsx | Program detail + day list |
| app/program/create.tsx | Create/edit program |
| app/program/pick-template.tsx | Template picker for adding days |

### Modified Files

| File | Change |
|------|--------|
| app/(tabs)/index.tsx | Add segmented control (Templates / Programs), "Next Workout" banner |
| lib/db.ts | Add 3 tables + CRUD functions for programs |
| lib/types.ts | Add Program, ProgramDay, ProgramLog types |
| app/session/[id].tsx | After session complete, advance program day if from active program |

### Acceptance Criteria

- [ ] GIVEN no programs exist WHEN user taps Programs segment THEN show empty state with "Create your first program" prompt
- [ ] GIVEN user is creating a program WHEN they add 3 templates as days THEN days appear in order with position labels
- [ ] GIVEN a program with 3 days WHEN user sets it active THEN any previously active program is deactivated
- [ ] GIVEN an active program on day 2 of 3 WHEN user completes day 2's workout THEN current_day advances to day 3 (index 2)
- [ ] GIVEN an active program on last day WHEN user completes it THEN current_day wraps to day 1 (index 0)
- [ ] GIVEN an active program WHEN user opens Workouts tab THEN "Next: [Day Label] — [Template Name]" banner appears at top
- [ ] GIVEN user taps "Next Workout" banner THEN a session starts from that day's template
- [ ] GIVEN a program WHEN user taps delete THEN confirm dialog and soft-delete (do not cascade-delete sessions)
- [ ] GIVEN a program with days WHEN user reorders them THEN positions update correctly
- [ ] GIVEN program detail WHEN user scrolls to history THEN completed sessions for this program are listed newest-first
- [ ] All new screens have proper accessibilityLabel/accessibilityRole attributes
- [ ] Minimum touch target 48x48dp on all interactive elements
- [ ] Font sizes >= 12sp for body text, >= 14sp for labels
- [ ] All colors use theme tokens (no hardcoded hex)
- [ ] PR passes typecheck with zero errors
- [ ] No new lint warnings

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Template deleted while in program | Day still shows but template name = "Deleted Template". Starting session shows error. |
| Active program with 1 day | current_day always stays at 0, wraps to itself |
| Two programs both "active" (race) | Enforce single-active in the activation function (deactivate all then activate one) |
| Empty program (0 days) | Cannot set active — show "Add at least one day" error |
| Session cancelled (not completed) | Do NOT advance program day |
| Very long program name | Truncate with ellipsis in list views (maxWidth constraint) |

### Out of Scope (Future Phases)

- Built-in program templates (PPL, 5/3/1, etc.) — can be a follow-up
- Progressive overload automation (auto-increase weight)
- Weekly schedule view (Mon/Tue/Wed mapping)
- Rest day scheduling
- Program sharing/export

### Dependencies

- Existing workout_templates table + CRUD
- Existing workout_sessions table + session flow

### Accessibility Requirements

Per BLD learnings (quality-pipeline.md): "Embed Accessibility in Every Feature Spec"
- All new touchable elements: accessibilityRole="button", descriptive accessibilityLabel
- Program status announced: accessibilityLabel="Day 2 of 3, next workout: Push Day"
- Reorder controls: accessibilityLabel="Move Push Day up", accessibilityHint="Reorders workout day"
- Empty state: accessibilityRole="text", informative label

### Implementation Notes

- Use uuid (existing dependency) for new record IDs
- Follow existing patterns: getDatabase() then getAllAsync/runAsync
- Program activation: single transaction to deactivate all + activate one
- Day reordering: update positions in a transaction
- Session completion hook: check if session came from active program, advance if so
- Apply learnings: try/catch/finally for async loading states, theme tokens only, no hardcoded colors
