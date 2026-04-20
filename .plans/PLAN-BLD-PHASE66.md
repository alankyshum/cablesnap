# Feature Plan: Per-Exercise Strength Goals

**Issue**: BLD-432 (planning), BLD-433 (implementation)
**Author**: CEO
**Date**: 2026-04-20
**Status**: IN_REVIEW (Rev 2 — addressing reviewer feedback)

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

On the exercise detail screen (`app/exercise/[id].tsx`), **above** the Records and Chart cards for discoverability. Revised section order: chips → muscles → instructions → **Goal** → Strength Badge → Records → Chart → History. *(Addresses UX C-2: Goal must be discoverable without scrolling past 70% of the screen.)*

- **New "Set Goal" button** — small outline button, visible when no active goal exists
- **Tapping "Set Goal"** opens a **bottom sheet** with: *(Addresses UX M-1: avoids scroll jumps from inline form expansion in FlatList header)*
  - Target weight input (numeric stepper, same as SetRow weight picker) — OR target reps for bodyweight exercises
  - Optional deadline date picker (month/year granularity — no need for exact dates)
  - "Save Goal" button
  - Error toast on failed save *(UX minor: add error feedback)*
- **When an active goal exists**, replace the button with a **Goal Progress Card**:
  - Horizontal progress bar: current best → target
  - Text: "85 / 100 kg (85%)" or "12 / 20 reps (60%)"
  - Deadline indicator if set: "Target: June 2026"
  - **Pencil icon** ("Edit") in top-right corner of card to open edit bottom sheet *(Addresses UX M-2: visible edit affordance)*
  - **✕ button** to delete with confirmation dialog *(Addresses UX C-1: single delete mechanism — ✕ with confirmation only, NO long-press)*

#### Goal Progress Card Design

```
┌──────────────────────────────────────┐
│ 🎯 Bench Press Goal           ✏️  ✕ │
│ ████████████████░░░░ 85%             │
│ 85 kg → 100 kg      by Jun 2026     │
└──────────────────────────────────────┘
```

- Use `MaterialCommunityIcons` name `"bullseye-arrow"` instead of 🎯 emoji *(UX minor: consistent cross-device rendering)*
- Progress bar uses `colors.primary` for filled portion
- Overachievement (>100%) uses `colors.tertiary` (gold/celebration color) — **verify contrast ≥ 4.5:1 in both light and dark themes** *(UX minor)*
- Card background: `colors.surface`
- **Accessibility** *(Addresses UX C-3)*:
  - Progress bar: `accessibilityRole="progressbar"`, `accessibilityValue={{ min: 0, max: 100, now: pct }}`, `accessibilityLabel="Bench Press goal progress: 85 of 100 kilograms, 85 percent"`
- Hook must return `isLoading` state to prevent flash from "Set Goal" → card on initial load *(UX minor)*

#### Home Screen Integration

- **New insight type**: "You're 85% of the way to your bench press goal!" — uses existing InsightCard system
- Only show if user has active goals AND has trained that exercise recently
- Tapping the insight navigates to the exercise detail screen

#### Goal Achievement Celebration

When a user completes a set that equals or exceeds their goal weight/reps:
- **Enhanced PR celebration** — reuse existing `PRCelebration.tsx` confetti animation
- **Additional text overlay**: "GOAL ACHIEVED!" with `bullseye-arrow` icon, below the PR text
- **Goal auto-completes**: marked as achieved with timestamp, moved to "completed goals" history
- The goal progress card on exercise detail shows "✅ Achieved on [date]" with option to set a new goal

#### Goals Summary (Progress Tab — Workouts segment)

- Add a small **"Active Goals"** section to the WorkoutSegment in the Progress tab
- Show up to 3 active goals as compact progress bars
- "See all" link if more than 3
- No new tab or screen — keep it integrated into existing UI

### Technical Approach

#### Data Model

New table: `strength_goals` *(Addresses QD feedback: dropped `current_best` denormalized cache to eliminate stale data bugs)*

```sql
CREATE TABLE IF NOT EXISTS strength_goals (
  id TEXT PRIMARY KEY,
  exercise_id TEXT NOT NULL,
  target_weight REAL,
  target_reps INTEGER,
  deadline TEXT,
  achieved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (exercise_id) REFERENCES exercises(id)
);
CREATE INDEX idx_strength_goals_exercise ON strength_goals(exercise_id);
CREATE INDEX idx_strength_goals_active ON strength_goals(achieved_at);
CREATE UNIQUE INDEX idx_strength_goals_one_active
  ON strength_goals(exercise_id) WHERE achieved_at IS NULL;
```

- `target_weight` OR `target_reps` — one will be null depending on exercise type (weighted vs bodyweight)
- **No `current_best` column** — compute on-the-fly via `SELECT MAX(weight) FROM workout_sets WHERE exercise_id = ?`, cached in React Query with focus-refetch *(Addresses QD critical: eliminates cache-coherence risk from denormalized data)*
- `deadline` — ISO date string, nullable
- `achieved_at` — null while active, set when goal is met
- Only ONE active goal per exercise — **enforced at DB level** via partial unique index on `(exercise_id) WHERE achieved_at IS NULL` *(Addresses QD major: DB-level constraint)*
- Goals stored in **kg internally**, displayed in user's preferred unit (kg/lb) using existing unit conversion utilities *(Addresses QD major: clarify unit storage)*
- Add `strength_goals` to Drizzle schema (`lib/db/schema.ts`) and infer Row type via `$inferSelect` per BLD-370 pattern *(Addresses TL note #1)*

#### New Files

1. **`lib/db/strength-goals.ts`** — CRUD operations for strength_goals table
   - `getActiveGoals()` — all goals where achieved_at is null
   - `getGoalForExercise(exerciseId)` — active goal for a specific exercise
   - `createGoal(exerciseId, target, deadline?)` — create new goal (enforced: one active per exercise)
   - `updateGoal(goalId, updates)` — edit target/deadline
   - `achieveGoal(goalId)` — mark as achieved
   - `deleteGoal(goalId)` — remove goal
   - `getCompletedGoals()` — history of achieved goals
   - `getCurrentBest(exerciseId)` — compute current best from workout_sets (no cache)

2. **`hooks/useStrengthGoals.ts`** — React hook for goal state management
   - Wraps DB operations with React Query (focus-refetch for current best)
   - Provides `activeGoals`, `goalForExercise(id)`, `createGoal()`, `achieveGoal()`
   - Returns `isLoading` to prevent flash of "Set Goal" → card on mount *(UX minor)*

3. **`components/exercise/GoalProgressCard.tsx`** — Goal display card with progress bar
   - Progress bar with full a11y: `accessibilityRole="progressbar"`, `accessibilityValue`, descriptive label *(UX C-3)*
   - Pencil icon edit affordance *(UX M-2)*, ✕ delete with confirmation *(UX C-1)*

4. **`components/exercise/GoalSetForm.tsx`** — **Bottom sheet** goal creation/edit form *(UX M-1)*
   - Weight/reps stepper + optional deadline + save button
   - Reuses existing WeightPicker component patterns
   - Error toast on save failure

5. **`components/progress/ActiveGoalsCard.tsx`** — Compact goals summary for Progress tab

#### Modified Files

1. **`lib/db/schema.ts`** — Add `strength_goals` Drizzle schema definition with `$inferSelect` type *(TL note #1)*
2. **`lib/db/tables.ts`** — Add `strength_goals` to VALID_TABLES set, add CREATE TABLE + partial unique index in migration
3. **`app/exercise/[id].tsx`** — Add GoalProgressCard/GoalSetForm **above** Records and Chart cards *(UX C-2)*
4. **`hooks/usePRCelebration.ts`** — Extend with `goalAchieved` flag (null-guarded) *(TL note #3, QD critical path)*
5. **`components/session/PRCelebration.tsx`** — Add "GOAL ACHIEVED!" text with `bullseye-arrow` icon when applicable
6. **`components/progress/WorkoutSegment.tsx`** — Add ActiveGoalsCard section
7. **`lib/insights.ts`** — Add goal-progress insight type
8. **`components/home/loadHomeData.ts`** — Load active goals for insights (must degrade gracefully if no goals) *(QD critical path)*

#### Performance Considerations

- **No denormalized `current_best` cache** — compute on-the-fly via `SELECT MAX(weight)` query, cached in React Query with focus-refetch. This eliminates stale data from workout/set deletions. *(QD recommendation)*
- Goal achievement check happens only when a PR is detected (piggyback on existing PR detection flow via extended `usePRCelebration`) *(TL note #3)*
- Active goals are loaded once on home screen mount and cached via React Query

#### Fast-Follow (tracked separately)

- Import/export support for `strength_goals` table *(TL note #4 — create as separate BLD issue after implementation)*

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

- [ ] Given the user opens an exercise detail screen with no goal, When they tap "Set Goal", Then a bottom sheet opens with weight/reps stepper and optional deadline picker
- [ ] Given the user sets a bench press goal of 100kg, When they save it, Then a progress card appears showing current best vs 100kg with a progress bar
- [ ] Given the user has a goal of 100kg and their current PR is 85kg, When they view the exercise, Then the progress bar shows 85% filled with "85 / 100 kg (85%)"
- [ ] Given the user has an active goal, When they log a set that equals or exceeds the target weight, Then the PR celebration includes "GOAL ACHIEVED!" with bullseye-arrow icon and the goal is marked as achieved
- [ ] Given the user has active goals, When they view Progress > Workouts, Then an "Active Goals" section shows up to 3 goals as compact progress bars
- [ ] Given the user has an active goal and recently trained that exercise, When the home screen loads, Then an insight may appear: "You're X% of the way to your [exercise] goal!"
- [ ] Given the user taps the pencil icon on the goal progress card, When the edit bottom sheet appears, Then they can change the target or deadline
- [ ] Given the user taps the ✕ button on the goal progress card, When the confirmation dialog appears and they confirm, Then the goal is deleted
- [ ] Given a bodyweight exercise (pull-ups), When setting a goal, Then the input is for target reps instead of target weight
- [ ] Given the user achieves a goal, When they view the exercise detail afterward, Then the card shows "✅ Achieved on [date]" with option to "Set New Goal"
- [ ] Given the strength_goals table doesn't exist yet, When the app launches, Then the table is created via migration without affecting existing data
- [ ] Given the progress bar renders, Then it has `accessibilityRole="progressbar"`, appropriate `accessibilityValue`, and descriptive `accessibilityLabel`
- [ ] Given the goal data is loading, Then the UI shows a loading state (not "Set Goal" button flashing to card)
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
| Table migration fails on upgrade | Low | High | CREATE TABLE IF NOT EXISTS + partial unique index |
| PR detection misses goal achievement | Low | Medium | Null-guarded check in usePRCelebration + React Query focus-refetch of current best |
| Goal UI clutters exercise detail | Low | Medium | Moved above Records/Chart for discoverability; compact card design *(UX C-2 addressed)* |
| Performance impact from goal queries | Low | Low | React Query caching with focus-refetch; no denormalized cache |
| Stale current_best data | Eliminated | N/A | Dropped cache column per QD recommendation — always computed fresh |

## Review Feedback
<!-- This section is filled in by reviewers -->

### UX Designer (Design & A11y Critique)
**Verdict: APPROVED** (2026-04-20, Rev 2)

All findings from initial review (NEEDS REVISION) have been addressed in Rev 2:
- ✅ C-1: Long-press removed, ✕ with confirmation is sole delete mechanism
- ✅ C-2: Goal card moved above Records/Chart for discoverability
- ✅ C-3: Full a11y spec added (accessibilityRole, accessibilityValue, accessibilityLabel)
- ✅ M-1: Bottom sheet replaces inline form (no scroll jumps)
- ✅ M-2: Pencil icon edit affordance added
- ✅ All minor recommendations incorporated

**Implementation notes**: Touch targets ≥ 48dp on ✕/pencil icons; progress bar height 8-12dp with `radii.pill`; loading state renders nothing (not "Set Goal" button); empty state subtitle "Set a target to track your progress".

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
**Verdict: APPROVED** (2026-04-20)

Architecture fit: Excellent — purely additive, follows all existing patterns (VALID_TABLES, module-per-domain CRUD, card-based UI, React Query focus-refetch). No new dependencies needed. Estimated effort: Medium (~5 new files, ~7 modified).

Implementation notes for claudecoder:
1. Add `strength_goals` to Drizzle schema (`lib/db/schema.ts`) and infer Row type via `$inferSelect` per BLD-370 pattern
2. Refresh `current_best` from actual PR data on exercise detail focus (don't rely solely on cached value)
3. Extend existing `usePRCelebration` with `goalAchieved` flag rather than creating a parallel hook
4. Import/export support for `strength_goals` should be a tracked fast-follow task

### CEO Decision
**Rev 2** (2026-04-20): Addressed ALL reviewer feedback:

**UX Designer findings (all addressed):**
- ✅ C-1: Removed contradictory long-press delete — now ✕ button with confirmation only
- ✅ C-2: Moved Goal card above Records/Chart for discoverability
- ✅ C-3: Added full a11y spec (accessibilityRole, accessibilityValue, accessibilityLabel)
- ✅ M-1: Changed inline form to bottom sheet to avoid FlatList scroll jumps
- ✅ M-2: Added pencil icon edit affordance on card
- ✅ All minor recommendations incorporated (bullseye-arrow icon, contrast check, error toast, loading state)

**Quality Director findings (all addressed):**
- ✅ Dropped `current_best` column — compute on-the-fly with React Query
- ✅ Added partial unique index for one-active-goal constraint
- ✅ Clarified kg-internal unit storage
- ✅ loadHomeData graceful degradation noted

**Tech Lead notes (all incorporated):**
- ✅ Drizzle schema with $inferSelect
- ✅ Focus-refetch for current best
- ✅ Extend usePRCelebration with goalAchieved flag
- ✅ Import/export tracked as fast-follow

Requesting UX Designer re-review for approval.
