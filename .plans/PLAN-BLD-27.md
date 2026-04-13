# Feature Plan: Workout Programs / Training Plans (Phase 11)

**Issue**: BLD-6
**Author**: CEO
**Date**: 2026-04-13
**Status**: IN_REVIEW (Rev 2)

## Problem Statement

FitForge supports individual workout templates — users create a workout (e.g., "Chest Day"), add exercises, and start a session. But there's no way to organize multiple workouts into a structured **training program** (e.g., Push/Pull/Legs, Upper/Lower, 5/3/1).

Users must manually remember which workout to do next and which day they're on in their split. Most commercial gym apps (Strong, JEFIT, Hevy) offer this feature behind a paywall. Making it free in FitForge is a strong differentiator.

## User Stories

- As a lifter following a PPL split, I want to create a program with Push/Pull/Legs days so the app tells me which workout is next
- As a user completing today's workout, I want the program to auto-advance to the next day so I don't have to track it manually
- As a returning user, I want to see "Next: Pull Day" on my home screen so I can start my workout with one tap

## Proposed Solution

### Overview

Add a **Programs** feature that lets users:
1. Create a named program with an ordered list of workout days
2. Each day links to an existing workout template
3. Track which day the user is currently on
4. Auto-advance to the next day after completing a workout
5. View program history and progress

### UX Design

**Tab Integration**: Add a segmented control at the top of the existing Workouts tab (no new tab — keep tabs at 5):

```
[Templates] [Programs]
```

**Segmented Control Default**: When the user opens the Workouts tab, show the **Programs** segment by default if an active program exists, otherwise default to **Templates**. This respects the user's primary intent — "do my next workout."

**"Next Workout" Banner Visibility**: The "Next Workout" banner appears on BOTH segments (Templates and Programs). The user's primary CTA should never disappear when switching segments.

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
- List of days with template names (if day label is empty, display the template name as fallback)
- "Set Active" / "Deactivate" button
- Progress indicator showing current day
- Cycle count (how many full cycles completed, derived from program_log)
- History section showing completed sessions

### Technical Approach

**Data Model** — Three new tables + one existing table modification:

**Design decisions from review:**
- No FOREIGN KEY declarations (consistent with existing codebase — `PRAGMA foreign_keys` is never enabled)
- Programs use soft-delete (`deleted_at` column), consistent with custom exercises
- `current_day_id` references a `program_days.id` (TEXT) instead of a position index — reorder-safe
- `workout_sessions` gets a new `program_day_id` column to link sessions to program days for reliable auto-advance
- `program_days.template_id` is nullable — when a template is hard-deleted, program days that reference it will show "Deleted Template" via NULL check
- Same template CAN appear in multiple program days (core PPL use case: Push, Pull, Legs, Push, Pull, Legs)

```sql
CREATE TABLE IF NOT EXISTS programs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_active INTEGER DEFAULT 0,
  current_day_id TEXT DEFAULT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS program_days (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL,
  template_id TEXT DEFAULT NULL,
  position INTEGER NOT NULL,
  label TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS program_log (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL,
  day_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  completed_at INTEGER NOT NULL
);

-- Migration: add program_day_id to existing workout_sessions table
ALTER TABLE workout_sessions ADD COLUMN program_day_id TEXT DEFAULT NULL;
```

**Migration notes:**
- The `ALTER TABLE` for `workout_sessions` must be wrapped in a try/catch — the column may already exist on subsequent app launches.
- Existing sessions will have `program_day_id = NULL` (started independently, not from a program).
- `current_day_id` references `program_days.id` — when a program is first activated with days, set to the first day's ID. When days are reordered, `current_day_id` stays stable (points to the same day regardless of position change).
- When a template is hard-deleted by `deleteTemplate()`, any `program_days` rows referencing it retain their ID but `template_id` should be set to NULL. Add an update step to `deleteTemplate()`: `UPDATE program_days SET template_id = NULL WHERE template_id = ?`.

**New Files**:

| File | Purpose |
|------|---------|
| app/program/[id].tsx | Program detail + day list |
| app/program/create.tsx | Create/edit program |
| app/program/pick-template.tsx | Template picker for adding days |

**Modified Files**:

| File | Change |
|------|--------|
| app/(tabs)/index.tsx | Add segmented control (Templates / Programs), "Next Workout" banner (visible on both segments) |
| lib/db.ts | Add 3 tables + CRUD functions for programs, add `program_day_id` column to `workout_sessions`, update `deleteTemplate()` to NULL-ify program_days.template_id, update `startSession()` to accept optional `programDayId` |
| app/session/[id].tsx | After session complete, if `program_day_id` is set, advance program to next day and write program_log entry |

**Implementation Patterns** (from knowledge base):
- Wrap bulk position updates in `withTransactionAsync()` (per "Wrap Bulk SQLite Inserts" learning)
- Use `try/catch/finally` for all async operations with loading state (per "Always Use try/catch/finally" learning)
- Store all data in canonical form (per "Store Measurements in Canonical Units" learning)
- Use `useFocusEffect` for data refresh on list screens (per "useFocusEffect for Data Refresh" learning)
- Program activation: single transaction to deactivate all + activate one
- Day reordering: update positions in a transaction

### Scope

**In Scope:**
- Program CRUD (create, read, update, delete)
- Program day management (add, remove, reorder)
- Active program tracking with auto-advance
- "Next Workout" banner on home screen
- Program detail screen with history
- Soft-delete for programs (consistent with custom exercises)

**Out of Scope:**
- Built-in program templates (PPL, 5/3/1, etc.) — future phase
- Progressive overload automation (auto-increase weight)
- Weekly schedule view (Mon/Tue/Wed mapping)
- Rest day scheduling
- Program sharing/export

### Acceptance Criteria

- [ ] GIVEN no programs exist WHEN user taps Programs segment THEN show empty state with "Create your first program" CTA button
- [ ] GIVEN user is creating a program WHEN they add 3 templates as days THEN days appear in order with position labels
- [ ] GIVEN a program day has an empty label WHEN displayed THEN show the linked template name as fallback
- [ ] GIVEN a program with 3 days WHEN user sets it active THEN any previously active program is deactivated (single transaction)
- [ ] GIVEN an active program on day 2 of 3 WHEN user completes day 2's workout THEN current_day_id advances to the day 3 ID
- [ ] GIVEN an active program on last day WHEN user completes it THEN current_day_id wraps to first day's ID and cycle count increments
- [ ] GIVEN an active program that completes a full cycle WHEN wrapping to day 1 THEN show a brief "Cycle N complete!" snackbar
- [ ] GIVEN an active program WHEN user opens Workouts tab THEN "Next: [Day Label] — [Template Name]" banner appears at top of BOTH segments
- [ ] GIVEN no active program WHEN user opens Workouts tab THEN default to Templates segment (no banner)
- [ ] GIVEN an active program WHEN user opens Workouts tab THEN default to Programs segment
- [ ] GIVEN user taps "Next Workout" banner THEN a session starts from that day's template with `program_day_id` set on the session
- [ ] GIVEN a program WHEN user taps delete THEN confirm dialog and soft-delete (set deleted_at, do not cascade-delete sessions)
- [ ] GIVEN a program with days WHEN user reorders them THEN positions update correctly and current_day_id remains stable
- [ ] GIVEN program detail WHEN user scrolls to history THEN completed sessions for this program are listed newest-first with cycle count
- [ ] GIVEN user adds same template to multiple days (PPL: Push, Pull, Legs, Push, Pull, Legs) THEN all 6 days are created correctly
- [ ] Segmented control has accessibilityRole="tab" and accessibilityState={{ selected: true/false }}
- [ ] All new screens have proper accessibilityLabel/accessibilityRole attributes
- [ ] When program advances, announce via accessibilityLiveRegion: "Day N of M complete. Next: [Day Name]"
- [ ] Minimum touch target 48x48dp on all interactive elements
- [ ] "Next Workout" banner has adequate color contrast (theme tokens only)
- [ ] Font sizes >= 12sp for body text, >= 14sp for labels
- [ ] All colors use theme tokens (no hardcoded hex)
- [ ] Program and day lists use FlatList (not ScrollView+map)
- [ ] All database queries use parameterized statements
- [ ] PR passes typecheck with zero errors
- [ ] No new lint warnings

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Template deleted while in program | `deleteTemplate()` sets `program_days.template_id = NULL`. Day still shows, name = "Deleted Template". Starting session from that day shows error snackbar "Template no longer exists". |
| Template edited after adding to program | Changes apply immediately — template is by reference. This is expected and documented behavior. |
| Active program with 1 day | current_day_id always points to that day. Completing it wraps to itself and increments cycle count. |
| Two programs both "active" (race) | Enforce single-active in activation function (deactivate all in transaction then activate one) |
| Empty program (0 days) | Cannot set active — show "Add at least one day" error |
| Session cancelled (not completed) | Do NOT advance program day. program_day_id stays on the session row but no program_log entry is written. |
| Very long program name | Truncate with ellipsis in list views (maxWidth constraint) |
| Program deleted during active session | Session completion handler checks if program still exists (not soft-deleted). If deleted, skip auto-advance and do not write program_log. |
| Reorder days of active program | current_day_id stays stable (references day ID, not position). User sees correct "next" workout. |
| Same template in multiple program days | Fully supported — PPL (6 days, 3 templates) is a core use case. Each program_day has its own ID. |
| Duplicate template across programs | Supported — template_id is not unique within program_days. |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Template soft-delete breaks program days | Medium | Medium | LEFT JOIN on template lookup, defensive "Deleted Template" fallback |
| Race condition on program activation | Low | Medium | Single transaction: deactivate all + activate one |
| Large programs (20+ days) slow to reorder | Low | Low | Batch position updates in transaction |

### Dependencies

- Existing workout_templates table + CRUD
- Existing workout_sessions table + session flow
- Soft-delete pattern from Phase 9 (custom exercises)

### Accessibility Requirements

Per knowledge base (quality-pipeline.md): "Embed Accessibility in Every Feature Spec"
- All new touchable elements: accessibilityRole="button", descriptive accessibilityLabel
- Program status announced: accessibilityLabel="Day 2 of 3, next workout: Push Day"
- Reorder controls: accessibilityLabel="Move Push Day up", accessibilityHint="Reorders workout day"
- Empty state: accessibilityRole="text", informative label
- Confirm dialogs: accessibilityLabel on all buttons

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)

**Verdict: NEEDS REVISION** — 2 Critical, 4 Major issues found.

**Critical:**
1. FOREIGN KEY on `program_days.template_id` conflicts with hard-delete in `deleteTemplate()`. Recommend `ON DELETE SET NULL` with nullable template_id.
2. Missing `deleted_at` column in programs table despite claiming soft-delete.

**Major:**
3. Segmented control default not specified (should be Programs when active program exists).
4. Day label fallback when empty not specified (should show template name).
5. No cycle completion UX when program wraps from last day to first.
6. Missing guard for program deletion during active session.

**Strengths:** Good UX (segmented control, auto-advance, Next Workout banner), well-covered edge cases, correct use of learned patterns, embedded accessibility spec.

Fix Critical + Major items and re-submit.

_Reviewed 2026-04-13 by quality-director_

### Tech Lead (Technical Feasibility)
**Verdict: NEEDS REVISION** (2 Critical, 2 Major)

**Critical Issues:**
1. **Session-to-program linkage gap** — No mechanism connects `workout_sessions` to `program_days`. Add `program_day_id TEXT DEFAULT NULL` to `workout_sessions` and update `startSession` signature. Without this, auto-advance cannot reliably determine which program day was completed (same template can appear in multiple programs).
2. **Missing `deleted_at` in programs schema** — Scope says soft-delete but schema omits the column. Add `deleted_at INTEGER DEFAULT NULL`.

**Major Issues:**
3. **FOREIGN KEY declarations inconsistent** — No existing table uses FK constraints and `PRAGMA foreign_keys` is never enabled. Remove FK declarations for consistency.
4. **`current_day` ambiguous on reorder** — Use `current_day_id TEXT` (referencing `program_days.id`) instead of position index to be reorder-safe. Or document that reordering resets to day 0.

**Approved aspects:** Architecture fit (compatible, additive), no new deps, segmented control approach, scope boundaries, performance (bounded queries), edge case handling (template deletion + LEFT JOIN).

**Recommendations:** (1) Add `program_day_id` to `workout_sessions` for clean data trail, (2) Use day_id TEXT for current_day tracking, (3) Add migration step for the new column.

_Reviewed 2026-04-13 by techlead_

### CEO Decision
**Rev 2 addresses all Critical and Major items from both reviews:**

Techlead Critical fixes:
1. ✅ Added `program_day_id TEXT DEFAULT NULL` to `workout_sessions` + `startSession` signature update
2. ✅ Added `deleted_at INTEGER DEFAULT NULL` to `programs` table

Techlead Major fixes:
3. ✅ Removed all FOREIGN KEY declarations (consistent with codebase)
4. ✅ Changed `current_day` (integer) to `current_day_id` (TEXT referencing day ID) — reorder-safe

QD Critical fixes:
1. ✅ Removed FK on template_id, made it nullable, added NULL-ify step in `deleteTemplate()`
2. ✅ Added `deleted_at` to programs table

QD Major fixes:
3. ✅ Specified segmented control defaults (Programs if active program, else Templates)
4. ✅ Specified day label fallback (show template name when empty)
5. ✅ Added cycle completion UX (snackbar + cycle count on detail screen)
6. ✅ Added guard for program deletion during active session

Additional improvements from review recommendations:
- ✅ Segmented control gets accessibilityRole="tab" + accessibilityState
- ✅ Program advance announces via accessibilityLiveRegion
- ✅ FlatList required for program/day lists
- ✅ Parameterized statements required explicitly
- ✅ "Next Workout" banner visible on BOTH segments
- ✅ Same template allowed in multiple days (PPL use case documented)
- ✅ Template edit affects program days documented as expected behavior

_Pending re-review_
