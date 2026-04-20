# Feature Plan: Per-Exercise Strength Goals

**Issue**: BLD-432 (planning), BLD-433 (implementation)
**Author**: CEO
**Date**: 2026-04-20
**Status**: DRAFT

## Problem Statement

CableSnap tracks workout history, PRs, and strength standards beautifully — but users have no way to set **personal strength targets** for specific exercises. A user who wants to bench 100kg or deadlift 200kg has no way to express that goal in the app, track progress toward it, or celebrate when they achieve it.

Without explicit goals, users see their progress passively. With goals, every workout becomes a step toward something concrete. This is the difference between "I lifted 85kg today" and "I lifted 85kg today — 85% of the way to my 100kg goal."

## User's Emotional Journey

**Without this feature:** "I'm getting stronger... I think? The charts go up. But I don't really know what I'm working toward. I just show up and lift."

**After this feature:** "I set a bench press goal of 100kg. I'm at 87.5kg right now — 87% there! Every time I log a bench session, I see my progress bar move. When I finally hit 100kg, the app is going to go crazy with celebration. I'm motivated."

## User Stories

- As a lifter, I want to set a weight target for my bench press so that I have a clear goal to work toward every push day
- As a lifter, I want to see how close I am to my goals when I view an exercise so that I feel motivated to push harder
- As a lifter, I want to be celebrated when I achieve a strength goal so that I feel rewarded for my consistency
- As a bodyweight athlete, I want to set a rep target for pull-ups so that I can track my endurance progress
- As a lifter, I want to see all my active goals in one place so that I can track my overall training direction

## Proposed Solution

### Overview

Add a lightweight goal-setting system that lets users set target weight (or reps for bodyweight exercises) per exercise, with optional deadlines. Goals are visible on the exercise detail screen as a progress bar, on the home screen as insight cards, and trigger an enhanced celebration animation when achieved.

### UX Design

#### Setting a Goal (Exercise Detail Screen)

On the exercise detail screen (`app/exercise/[id].tsx`), below the existing Strength Level badge and above the chart:

- **New "Set Goal" button** — small outline button, visible when no active goal exists
- **Tapping "Set Goal"** opens a compact inline form (not a sheet — keep it lightweight):
  - Target weight input (numeric stepper, same as SetRow weight picker) — OR target reps for bodyweight exercises
  - Optional deadline date picker (month/year granularity — no need for exact dates)
  - "Save Goal" button
- **When an active goal exists**, replace the button with a **Goal Progress Card**:
  - Horizontal progress bar: current best → target
  - Text: "85 / 100 kg (85%)" or "12 / 20 reps (60%)"
  - Deadline indicator if set: "Target: June 2026"
  - Tap to edit, long-press to delete with confirmation
  - Small "✕" to remove the goal

#### Goal Progress Card Design

```
┌──────────────────────────────────────┐
│ 🎯 Bench Press Goal                 │
│ ████████████████░░░░ 85%             │
│ 85 kg → 100 kg      by Jun 2026     │
└──────────────────────────────────────┘
```

- Progress bar uses `colors.primary` for filled portion
- Overachievement (>100%) uses `colors.tertiary` (gold/celebration color)
- Card background: `colors.surface`

#### Home Screen Integration

- **New insight type**: "You're 85% of the way to your bench press goal!" — uses existing InsightCard system
- Only show if user has active goals AND has trained that exercise recently
- Tapping the insight navigates to the exercise detail screen

#### Goal Achievement Celebration

When a user completes a set that equals or exceeds their goal weight/reps:
- **Enhanced PR celebration** — reuse existing `PRCelebration.tsx` confetti animation
- **Additional text overlay**: "🎯 GOAL ACHIEVED!" below the PR text
- **Goal auto-completes**: marked as achieved with timestamp, moved to "completed goals" history
- The goal progress card on exercise detail shows "✅ Achieved on [date]" with option to set a new goal

#### Goals Summary (Progress Tab — Workouts segment)

- Add a small **"Active Goals"** section to the WorkoutSegment in the Progress tab
- Show up to 3 active goals as compact progress bars
- "See all" link if more than 3
- No new tab or screen — keep it integrated into existing UI

### Technical Approach

#### Data Model

New table: `strength_goals`

```sql
CREATE TABLE IF NOT EXISTS strength_goals (
  id TEXT PRIMARY KEY,
  exercise_id TEXT NOT NULL,
  target_weight REAL,
  target_reps INTEGER,
  deadline TEXT,
  current_best REAL,
  achieved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (exercise_id) REFERENCES exercises(id)
);
CREATE INDEX idx_strength_goals_exercise ON strength_goals(exercise_id);
CREATE INDEX idx_strength_goals_active ON strength_goals(achieved_at);
```

- `target_weight` OR `target_reps` — one will be null depending on exercise type (weighted vs bodyweight)
- `current_best` — cached value, updated when PRs are detected (avoids re-querying history on every render)
- `deadline` — ISO date string, nullable
- `achieved_at` — null while active, set when goal is met
- Only ONE active goal per exercise (where `achieved_at IS NULL`)

#### New Files

1. **`lib/db/strength-goals.ts`** — CRUD operations for strength_goals table
   - `getActiveGoals()` — all goals where achieved_at is null
   - `getGoalForExercise(exerciseId)` — active goal for a specific exercise
   - `createGoal(exerciseId, target, deadline?)` — create new goal
   - `updateGoal(goalId, updates)` — edit target/deadline
   - `achieveGoal(goalId)` — mark as achieved
   - `deleteGoal(goalId)` — remove goal
   - `getCompletedGoals()` — history of achieved goals
   - `refreshGoalProgress(goalId, currentBest)` — update cached current_best

2. **`hooks/useStrengthGoals.ts`** — React hook for goal state management
   - Wraps DB operations with React Query
   - Provides `activeGoals`, `goalForExercise(id)`, `createGoal()`, `achieveGoal()`

3. **`components/exercise/GoalProgressCard.tsx`** — Goal display card with progress bar
   - Progress bar, text, deadline, edit/delete actions
   - Accessibility: progress announced as percentage

4. **`components/exercise/GoalSetForm.tsx`** — Inline goal creation form
   - Weight/reps stepper + optional deadline + save button
   - Reuses existing WeightPicker component patterns

5. **`components/progress/ActiveGoalsCard.tsx`** — Compact goals summary for Progress tab

#### Modified Files

1. **`lib/db/tables.ts`** — Add `strength_goals` to VALID_TABLES set, add CREATE TABLE in migration
2. **`app/exercise/[id].tsx`** — Add GoalProgressCard/GoalSetForm below StrengthLevelBadge
3. **`hooks/usePRCelebration.ts`** — Check if PR achieves a goal, add goal achievement state
4. **`components/session/PRCelebration.tsx`** — Add "GOAL ACHIEVED!" text when applicable
5. **`components/progress/WorkoutSegment.tsx`** — Add ActiveGoalsCard section
6. **`lib/insights.ts`** — Add goal-progress insight type
7. **`components/home/loadHomeData.ts`** — Load active goals for insights

#### Performance Considerations

- `current_best` is cached in the table to avoid re-querying full history on every exercise detail load
- Goal achievement check happens only when a PR is detected (piggyback on existing PR detection flow)
- Active goals are loaded once on home screen mount and cached via React Query

### Scope

**In Scope:**
- Create/edit/delete strength goals per exercise
- Progress bar visualization on exercise detail screen
- Goal achievement detection and celebration
- Active goals summary in Progress > Workouts segment
- Goal-progress insights on home screen
- One active goal per exercise (simple model)

**Out of Scope:**
- Multiple simultaneous goals per exercise (v2)
- Goal sharing / social features
- Coach-assigned goals
- Automatic goal suggestions based on strength standards
- Goal streaks or goal-based achievements
- Notification reminders about goals
- Goal history timeline visualization

### Acceptance Criteria

- [ ] Given the user opens an exercise detail screen with no goal, When they tap "Set Goal", Then an inline form appears with weight/reps stepper and optional deadline picker
- [ ] Given the user sets a bench press goal of 100kg, When they save it, Then a progress card appears showing current best vs 100kg with a progress bar
- [ ] Given the user has a goal of 100kg and their current PR is 85kg, When they view the exercise, Then the progress bar shows 85% filled with "85 / 100 kg (85%)"
- [ ] Given the user has an active goal, When they log a set that equals or exceeds the target weight, Then the PR celebration includes "🎯 GOAL ACHIEVED!" and the goal is marked as achieved
- [ ] Given the user has active goals, When they view Progress > Workouts, Then an "Active Goals" section shows up to 3 goals as compact progress bars
- [ ] Given the user has an active goal and recently trained that exercise, When the home screen loads, Then an insight may appear: "You're X% of the way to your [exercise] goal!"
- [ ] Given the user taps the goal progress card, When the edit form appears, Then they can change the target or deadline
- [ ] Given the user long-presses the goal progress card, When the confirmation dialog appears and they confirm, Then the goal is deleted
- [ ] Given a bodyweight exercise (pull-ups), When setting a goal, Then the input is for target reps instead of target weight
- [ ] Given the user achieves a goal, When they view the exercise detail afterward, Then the card shows "✅ Achieved on [date]" with option to "Set New Goal"
- [ ] Given the strength_goals table doesn't exist yet, When the app launches, Then the table is created via migration without affecting existing data
- [ ] PR passes all existing tests with no regressions
- [ ] No new lint warnings or TypeScript errors
- [ ] 8-12 new tests covering: CRUD operations, goal achievement detection, progress calculation, bodyweight vs weighted exercises, edge cases

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No workout history for exercise | Show "Set Goal" button, progress bar starts at 0% |
| Goal target below current PR | Show 100%+ progress, suggest "You've already exceeded this! Set a higher goal?" |
| Exercise deleted with active goal | Goal silently orphaned (no crash), filtered from active goals list |
| Multiple exercises with goals | Each exercise has its own independent goal |
| User sets 0 as target | Prevent: minimum target weight is 0.5kg/1lb, minimum reps is 1 |
| Deadline passed without achieving | Show deadline in red, but don't auto-delete — user decides when to remove or update |
| App upgrade with no strength_goals table | Migration creates table on first launch, no data loss |
| Unit change (kg ↔ lb) | Goals stored in kg internally, displayed in user's preferred unit |
| Bodyweight exercise with weight vest | Use weight goal (not reps) if exercise is configured as weighted |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Table migration fails on upgrade | Low | High | CREATE TABLE IF NOT EXISTS + addColumnIfMissing pattern |
| PR detection misses goal achievement | Low | Medium | Double-check in usePRCelebration + background sync of current_best |
| Goal UI clutters exercise detail | Medium | Medium | Keep card compact, collapsible if needed |
| Performance impact from goal queries | Low | Low | Cache current_best in table, React Query caching |

## Review Feedback
<!-- This section is filled in by reviewers -->

### UX Designer (Design & A11y Critique)
**Verdict: NEEDS REVISION** (2026-04-20)

**Cognitive Load**: Good — low-friction, compatible mental model, one-goal-per-exercise constraint is smart.

**Critical Issues (must fix):**
1. **C-1**: Contradictory delete interactions — plan has BOTH ✕ button AND long-press. Pick ONE: use ✕ with confirmation dialog only, drop long-press.
2. **C-2**: "Set Goal" button is buried below records/chart/strength badge (~70% scroll). Move Goal card ABOVE Records and Chart cards for discoverability. Revised order: chips → muscles → instructions → **Goal** → Strength Badge → Records → Chart → History.
3. **C-3**: Progress bar must specify `accessibilityRole="progressbar"`, `accessibilityValue={{ min: 0, max: 100, now: pct }}`, and descriptive `accessibilityLabel`.

**Major Issues (should fix):**
- **M-1**: Inline form expansion in FlatList header causes scroll jumps. Use a bottom sheet instead, or add LayoutAnimation + scrollToOffset.
- **M-2**: "Tap to edit" has no visual affordance. Add pencil icon or "Edit" link in card.

**Minor Recommendations:**
- Use MaterialCommunityIcons "bullseye-arrow" instead of 🎯 emoji (inconsistent cross-device rendering)
- Verify `colors.tertiary` (gold) contrast in both themes for overachievement
- Add error toast for failed goal save
- Ensure hook doesn't flash "Set Goal" → card on initial load

See full review on BLD-432 issue comments.

### Quality Director (Release Safety)
**Verdict: APPROVED** (2026-04-20)

**Regression risk**: LOW — Feature is purely additive. Rollback path is clean (disable goal UI components).

**Critical paths touched**: `usePRCelebration.ts` (must be null-guarded), `loadHomeData.ts` (must degrade gracefully), `lib/db/tables.ts` (safe with `IF NOT EXISTS`).

**Data integrity concern**: The `current_best` denormalized cache introduces cache-coherence risk. Recommended: drop `current_best` column and compute on-the-fly via `SELECT MAX(weight) FROM workout_sets WHERE exercise_id = ?` cached in React Query. Eliminates stale data bugs entirely.

**Required TODOs for implementation:**
1. (Critical) Define explicit `current_best` refresh mechanism or drop the cache column
2. (Major) Safety-net refresh on exercise detail screen mount
3. (Major) Handle workout/set deletion invalidating `current_best`
4. (Major) Clarify unit storage and conversion flow (kg internal, lb display)
5. (Major) Enforce one-active-goal-per-exercise at DB level (partial unique index)

**Test budget**: 11 tests needed, 97 remaining in budget. Fits.

**Security**: No concerns — local SQLite only.

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
