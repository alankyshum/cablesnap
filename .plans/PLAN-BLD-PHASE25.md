# Feature Plan: Weekly Workout Schedule & Adherence Tracking

**Issue**: BLD-36
**Author**: CEO
**Date**: 2026-04-14
**Status**: DRAFT

## Problem Statement
Users have no way to plan when they train during the week. The "Next Workout" indicator only works for active programs (sequential day advancement), and standalone templates have no scheduling at all. Users who want to train Mon/Wed/Fri with specific templates must remember their plan mentally. There's also no way to see weekly adherence — did I actually train on the days I planned?

This is the #1 driver of habit formation: having a plan and seeing yourself stick to it.

## User Stories
- As a gym-goer, I want to assign templates to specific days of the week so I know what to train today
- As a program user, I want to map program days to weekdays so I know which day of the program to do on Monday vs Wednesday
- As a user tracking consistency, I want to see how many of my planned workouts I actually completed this week

## Proposed Solution

### Overview
Add a weekly schedule system that lets users assign templates (or program days) to specific weekdays. The home screen shows "Today's Workout" from the schedule (superseding the current program-only "Next" card). A weekly adherence ring/bar shows planned vs completed.

### UX Design

#### Schedule Setup (Settings or dedicated screen)
- New "Weekly Schedule" option accessible from the home screen or Settings
- 7-day grid (Mon-Sun) where each day can have 0 or 1 assigned template
- Tap a day -> pick a template from existing templates (reuse `pick-template` pattern)
- Show template name + exercise count on each scheduled day
- "Rest day" is implicit (no template assigned)
- For active program users: offer "Auto-fill from Program" which maps program days to weekdays sequentially (Day 1 -> Mon, Day 2 -> Wed, etc. skipping rest days)

#### Home Screen Changes
- Replace the current "Next: [program day]" card with a "Today's Workout" card that sources from the schedule
- If today has a scheduled template: show template name, exercise count, "Start" button
- If today is a rest day: show "Rest Day - No workout scheduled" with a "Train anyway" option
- If no schedule exists: show current behavior (program next workout or template list)

#### Adherence Indicator
- Small weekly bar on the home screen showing 7 dots/circles for Mon-Sun
- Filled = completed a workout on that day (regardless of whether it matched the schedule)
- Highlighted border = scheduled day
- Shows "3/4 this week" or "5/5 - Perfect week!" summary text
- Uses semantic colors: completed+scheduled = success, completed+unscheduled = neutral, missed = subtle warning

#### Accessibility
- Day picker uses `accessibilityRole="radiogroup"` pattern
- Adherence dots announce day name, scheduled/rest status, and completion status
- All touch targets >= 48dp
- Color is never the sole indicator -- use icons (checkmark for completed, circle for scheduled)

### Technical Approach

#### Data Model
New `weekly_schedule` table:
```sql
CREATE TABLE weekly_schedule (
  id TEXT PRIMARY KEY,
  day_of_week INTEGER NOT NULL, -- 0=Mon, 1=Tue, ... 6=Sun
  template_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (template_id) REFERENCES workout_templates(id),
  UNIQUE(day_of_week) -- one template per day
);
```

#### New DB Functions
- `getSchedule(): Promise<ScheduleEntry[]>` -- all 7 days
- `setScheduleDay(day: number, templateId: string | null): Promise<void>` -- upsert/delete
- `clearSchedule(): Promise<void>` -- remove all entries
- `getTodaySchedule(): Promise<ScheduleEntry | null>` -- today's entry
- `getWeekAdherence(): Promise<{ day: number; scheduled: boolean; completed: boolean }[]>` -- this week's adherence

#### Adherence Calculation
Query `workout_sessions` for this week (Mon-Sun) with `completed_at IS NOT NULL`. Cross-reference with `weekly_schedule` entries. A day counts as "completed" if any session was completed on that date, regardless of which template was used.

#### Migration
- Add `weekly_schedule` table in the migration chain
- No migration needed for existing data -- schedule starts empty

#### Home Screen Integration
- `getTodaySchedule()` resolves to today's template (if any)
- If schedule exists and has today: show schedule card (replaces program next card)
- If schedule exists but today is rest: show rest day card
- If no schedule: fall back to current behavior (program next workout)
- Priority: active session > today's schedule > program next > template list

#### New Files
- `app/schedule/index.tsx` -- Weekly schedule setup screen
- Possibly extract `components/AdherenceBar.tsx` -- reusable weekly adherence component

#### Modified Files
- `lib/db.ts` -- Add schedule table migration, new query functions
- `app/(tabs)/index.tsx` -- Add today's schedule card + adherence bar
- `app/_layout.tsx` -- Add Stack.Screen for schedule route

### Scope
**In Scope:**
- Weekly schedule setup (assign template to day)
- Today's Workout card on home screen
- Weekly adherence indicator (7-dot bar)
- Auto-fill from active program
- Clear schedule
- Persist across app restarts

**Out of Scope:**
- Push notification reminders (requires expo-notifications setup -- future phase)
- Multiple workouts per day scheduling
- Calendar month view integration (history.tsx already handles this)
- Drag-and-drop schedule editing
- Schedule templates/presets
- Time-of-day scheduling
- Adherence history beyond current week

### Acceptance Criteria
- [ ] Given no schedule exists When user opens home screen Then current behavior is unchanged
- [ ] Given user taps "Set Schedule" When on schedule screen Then 7-day grid shows Mon-Sun
- [ ] Given user taps a day When template picker appears Then user can assign a template
- [ ] Given a day has a template When user taps it again Then they can change or remove it
- [ ] Given today has a scheduled template When user opens home screen Then "Today's Workout" card shows with template name and Start button
- [ ] Given today is a rest day (no schedule entry) When user opens home screen Then "Rest Day" indicator shows
- [ ] Given user taps Start on today's workout Then session starts with that template
- [ ] Given user has completed 3 of 4 scheduled workouts this week Then adherence bar shows 3 filled, 1 pending
- [ ] Given user has an active program When they tap "Auto-fill" Then program days map to weekdays
- [ ] Given user deletes a template that is in the schedule When viewing schedule Then that day shows as empty (cascade or handle gracefully)
- [ ] All screens work in light and dark mode
- [ ] No hardcoded hex colors
- [ ] Touch targets >= 48dp
- [ ] Adherence dots have proper accessibility announcements
- [ ] `npx tsc --noEmit` passes
- [ ] All existing tests pass
- [ ] New tests cover schedule CRUD and adherence calculation

### Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| Template deleted while scheduled | Schedule entry removed (FK cascade or check) |
| No schedule set | Home screen shows current behavior unchanged |
| Multiple sessions on one day | Day counts as completed once |
| Week boundary (Mon rollover) | Adherence resets at start of new week (Monday) |
| Schedule set mid-week | Only remaining days of current week count for adherence |
| All 7 days scheduled | Adherence shows 7 dots all highlighted |
| Locale with Sunday-start weeks | Use Monday-start consistently (matches streak logic) |
| Program auto-fill with 6+ days | Map sequentially, overflow wraps or stops at 7 |

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Template deletion breaks schedule | Medium | Low | FK ON DELETE SET NULL + handle null in UI |
| Adherence query performance | Low | Low | Bounded to 7 days, lightweight query |
| Conflict with program "Next" card | Medium | Medium | Clear priority: active session > schedule > program |
| Over-engineering the schedule UI | Medium | Medium | Keep it simple -- 7-day grid, tap to assign |

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
