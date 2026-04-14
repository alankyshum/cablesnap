# Feature Plan: Weekly Workout Schedule & Adherence Tracking

**Issue**: BLD-36
**Author**: CEO
**Date**: 2026-04-14
**Status**: APPROVED

## Problem Statement
Users have no way to plan when they train during the week. The "Next Workout" indicator only works for active programs (sequential day advancement), and standalone templates have no scheduling at all. Users who want to train Mon/Wed/Fri with specific templates must remember their plan mentally. There's also no way to see weekly adherence — did I actually train on the days I planned?

This is the #1 driver of habit formation: having a plan and seeing yourself stick to it.

## User Stories
- As a gym-goer, I want to assign templates to specific days of the week so I know what to train today
- As a program user, I want to manually assign program day templates to weekdays so I know which day of the program to do on Monday vs Wednesday
- As a user tracking consistency, I want to see how many of my planned workouts I actually completed this week

## Proposed Solution

### Overview
Add a weekly schedule system that lets users assign templates to specific weekdays. The home screen shows "Today's Workout" from the schedule (superseding the current program-only "Next" card). A weekly adherence bar shows planned vs completed with positive framing.

### UX Design

#### Schedule Setup (Settings or dedicated screen)
- New "Weekly Schedule" option accessible from the home screen or Settings
- 7-day grid (Mon-Sun) where each day can have 0 or 1 assigned template
- Tap a day -> pick a template from existing templates (reuse `pick-template` pattern)
- Each day cell uses `accessibilityRole="button"` with `accessibilityLabel="Monday: Push Day"` or `"Monday: Rest day"` — NOT `radiogroup` (days are independent, not mutually exclusive)
- Show template name + exercise count on each scheduled day
- "Rest day" is implicit (no template assigned)
- Minimum font size: 14sp for day labels, 12sp for template names in the grid
- **Loading state**: Show skeleton placeholders while templates load
- **Empty state**: If user has zero templates, show "Create a template first to start scheduling" with a CTA button linking to template creation
- **Error state**: If template query fails, show "Couldn't load templates. Tap to retry." with retry button
- **Clear schedule**: Requires confirmation dialog — "Clear your entire weekly schedule? This cannot be undone." with Cancel/Clear buttons

#### Home Screen Changes
- Replace the current "Next: [program day]" card with a "Today's Workout" card that sources from the schedule
- **Pending state**: If today has a scheduled template and NOT yet completed: show template name, exercise count, "Start" button
- **Completed state**: If today has a scheduled template and user has completed a session today: show "✅ Completed: [template name]" with a secondary "Train again" button (not the prominent "Start" — prevents accidental re-start)
- **Rest day state**: If today is a rest day (no schedule entry): show "Rest Day — No workout scheduled" with a "Train anyway" option
- **No schedule state**: If no schedule exists: show current behavior (program next workout or template list)
- **Schedule overrides program**: When a schedule exists and today has an entry, the schedule card supersedes the program "Next" card. The program "Next" indicator should show "(Schedule active)" to explain why program advancement isn't visible
- Schedule card sits ABOVE the segment toggle (it's cross-cutting, not a template or program)

#### Adherence Indicator
- Small weekly bar on the home screen showing 7 dots/circles for Mon-Sun
- **Filled dot** = completed a workout on that day (regardless of whether it matched the schedule)
- **Ring/border dot** = scheduled day, not yet completed (neutral — no warning color)
- **Empty dot** = unscheduled day, no workout
- Summary text uses **positive framing**: "3 of 5 this week 🎯" or "5 of 5 — Perfect week! 🔥" — never "2 missed"
- Semantic colors: completed = success (green), scheduled-not-yet-done = neutral (grey ring), unscheduled = subtle (light grey fill). NO warning/red/yellow for missed days — research shows negative framing increases churn

#### Accessibility
- Each day cell uses `accessibilityRole="button"` (NOT `radiogroup` — days are independent assignments, not mutually exclusive selections)
- Each day cell: `accessibilityLabel="[DayName]: [TemplateName]"` or `"[DayName]: Rest day"`
- Adherence dots announce day name, scheduled/rest status, and completion status via `accessibilityLabel`
- All touch targets >= 48dp
- Color is never the sole indicator — use icons (checkmark ✓ for completed, circle ○ for scheduled, empty for rest)
- Minimum font sizes: 14sp for day labels, 12sp for template names in grid cells

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
Query `workout_sessions` for this week (Mon-Sun) with `completed_at IS NOT NULL`. Use **local dates** (not UTC timestamps) for day boundaries — consistent with existing `mondayOf()` which uses local date. Cross-reference with `weekly_schedule` entries. A day counts as "completed" if any session was completed on that local date, regardless of which template was used.

#### Migration
- Add `weekly_schedule` table in the migration chain
- No migration needed for existing data -- schedule starts empty

#### Home Screen Integration
- `getTodaySchedule()` resolves to today's template (if any)
- `isTodayCompleted()` checks if any session was completed today (local date)
- If schedule exists and has today AND not completed: show schedule card with "Start" (replaces program next card)
- If schedule exists and has today AND completed: show "✅ Completed" card with "Train again" secondary button
- If schedule exists but today is rest: show rest day card
- If no schedule: fall back to current behavior (program next workout)
- Priority: active session > today's schedule (completed or pending) > program next > template list
- Schedule card renders ABOVE the segment toggle, not inside it (per TL recommendation)

#### New Files
- `app/schedule/index.tsx` -- Weekly schedule setup screen
- Possibly extract `components/AdherenceBar.tsx` -- reusable weekly adherence component

#### Modified Files
- `lib/db.ts` — Add schedule table migration, new query functions, **add `DELETE FROM weekly_schedule WHERE template_id = ?` to `deleteTemplate()` BEFORE deleting the template** (same pattern as existing `program_days` cleanup — app-level cascade since `PRAGMA foreign_keys` is not enabled)
- `app/(tabs)/index.tsx` — Add today's schedule card + adherence bar (above segment toggle). Consider extracting `ScheduleCard` component to keep file manageable (currently 913 lines)
- `app/_layout.tsx` — Add Stack.Screen for schedule route

### Scope
**In Scope:**
- Weekly schedule setup (assign template to day)
- Today's Workout card on home screen (with completed state)
- Weekly adherence indicator (7-dot bar with positive framing)
- Clear schedule (with confirmation dialog)
- Loading, empty, and error states for schedule screen
- Application-level cascade: delete schedule entries when template is deleted
- Persist across app restarts

**Out of Scope:**
- Push notification reminders (requires expo-notifications setup — future phase)
- Multiple workouts per day scheduling
- Calendar month view integration (history.tsx already handles this)
- Drag-and-drop schedule editing
- Schedule templates/presets
- Time-of-day scheduling
- Adherence history beyond current week
- Auto-fill from active program (DEFERRED — per TL recommendation, program day advancement and schedule create confusing dual-state; users can manually assign program day templates to weekdays)
- Locale-aware week start (known limitation: Monday-start used consistently, matching existing streak logic)

### Acceptance Criteria
- [ ] Given no schedule exists When user opens home screen Then current behavior is unchanged
- [ ] Given user taps "Set Schedule" When on schedule screen Then 7-day grid shows Mon-Sun
- [ ] Given user has zero templates When on schedule screen Then empty state shows "Create a template first" with CTA
- [ ] Given template query fails When on schedule screen Then error state shows with retry button
- [ ] Given user taps a day When template picker appears Then user can assign a template
- [ ] Given a day has a template When user taps it again Then they can change or remove it
- [ ] Given today has a scheduled template and NOT completed When user opens home screen Then "Today's Workout" card shows with template name and Start button
- [ ] Given today has a scheduled template and user HAS completed a workout today When user opens home screen Then card shows "✅ Completed: [name]" with secondary "Train again" button
- [ ] Given today is a rest day (no schedule entry) When user opens home screen Then "Rest Day" indicator shows
- [ ] Given user taps Start on today's workout Then session starts with that template
- [ ] Given user has completed 3 of 5 scheduled workouts this week Then adherence bar shows "3 of 5 this week 🎯" with positive framing
- [ ] Given user deletes a template that is in the schedule When `deleteTemplate()` runs Then schedule entries for that template are deleted first (app-level cascade)
- [ ] Given user taps "Clear schedule" Then confirmation dialog appears before clearing
- [ ] Given a schedule exists and today has an entry When program also has a Next workout Then schedule card takes priority and program shows "(Schedule active)"
- [ ] All day cells use `accessibilityRole="button"` (NOT radiogroup)
- [ ] Adherence dots use NO warning/red colors for missed days — neutral grey only
- [ ] All screens work in light and dark mode
- [ ] No hardcoded hex colors
- [ ] Touch targets >= 48dp
- [ ] Adherence dots have proper accessibility announcements
- [ ] `npx tsc --noEmit` passes
- [ ] All existing tests pass
- [ ] New tests cover schedule CRUD, adherence calculation, and template deletion cascade

### Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| Template deleted while scheduled | `deleteTemplate()` deletes schedule entries first (app-level cascade) |
| No schedule set | Home screen shows current behavior unchanged |
| Multiple sessions on one day | Day counts as completed once |
| Week boundary (Mon rollover) | Adherence resets at start of new week (Monday). Known limitation: Monday-start for all locales |
| Schedule set mid-week | Only remaining days of current week count for adherence |
| All 7 days scheduled | Adherence shows 7 dots all highlighted |
| Today's workout already completed | Card shows "✅ Completed" with "Train again" secondary button (prevents accidental re-start) |
| Zero templates exist | Schedule screen shows empty state: "Create a template first" with CTA |
| Template query fails | Schedule screen shows error state with retry button |
| Clear schedule tapped | Confirmation dialog before clearing |
| Schedule + active program | Schedule card takes priority; program "Next" shows "(Schedule active)" |
| Midnight boundary (11:55 PM workout) | Uses local date for day assignment — consistent with existing `mondayOf()` |

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Template deletion breaks schedule | Medium | Low | App-level cascade in `deleteTemplate()` — delete schedule entries before template (same pattern as program_days) |
| Adherence query performance | Low | Low | Bounded to 7 days, lightweight query |
| Conflict with program "Next" card | Medium | Medium | Clear priority chain + "(Schedule active)" indicator on program card |
| Over-engineering the schedule UI | Medium | Medium | Keep it simple — 7-day grid, tap to assign. Auto-fill deferred. |
| Accidental duplicate session | Medium | High | Post-completion card state shows "Completed" with secondary "Train again" button |
| User guilt from missed-day highlighting | Medium | Medium | NO warning colors for missed days — neutral grey, positive framing only |

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)
**Rev 1 Verdict: NEEDS REVISION** (2026-04-14) — 2C, 4M issues found.
**Rev 2 Verdict: APPROVED** (2026-04-14) — All 6 issues addressed. Plan ready for implementation.

### Tech Lead (Technical Feasibility)
**Verdict: APPROVED** — Technically sound, data model is clean, fits existing patterns, no new dependencies.

Key findings:
- DB: `weekly_schedule` table follows existing migration pattern. `UNIQUE(day_of_week)` constraint is clean.
- FK cascade won't work (no `PRAGMA foreign_keys = ON` in codebase). Must add manual cleanup to `deleteTemplate()` — same pattern as `program_days` cleanup.
- `day_of_week` 0=Mon encoding is consistent with existing `mondayOf()` helper.
- Adherence query bounded to 7 days — no performance concern.
- Home screen priority chain (active session > schedule > program > templates) is correct.
- Schedule card should sit above the segment toggle, not inside it.
- Recommend deferring "Auto-fill from Program" to reduce scope — program day advancement and schedule create confusing dual-state.
- Consider extracting `ScheduleCard` component — `index.tsx` is already 913 lines.
- Effort: Medium. Risk: Low. New dependencies: None.

### CEO Decision
**Rev 2 addresses all QD findings:**
- [C] Template deletion cascade → App-level cascade in `deleteTemplate()`, no FK reliance ✅
- [C] Post-completion card state → "✅ Completed" with "Train again" secondary button ✅
- [M] A11y role → `button` per day cell, not `radiogroup` ✅
- [M] Auto-fill → DEFERRED per TL + QD (confusing dual-state, ambiguous weekday assignment) ✅
- [M] Missed styling → Neutral grey dots, positive framing, NO warning colors ✅
- [M] Loading/empty/error states → Full spec added for schedule screen ✅
- [minor] Clear schedule confirmation dialog → Added ✅
- [minor] Monday-start documented as known limitation ✅
- [minor] Schedule vs program interaction clarified ✅
- [minor] Font sizes specified ✅

Awaiting QD re-review.
