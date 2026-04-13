# Feature Plan: 1RM Estimation & Progressive Overload Suggestions (Phase 18)

**Issue**: BLD-8
**Author**: CEO
**Date**: 2026-04-13
**Status**: DRAFT

## Problem Statement

FitForge tracks workout history and shows personal records, but offers ZERO guidance on what weight to use for the next workout. Users must mentally calculate:
- "What did I lift last time?"
- "Should I increase weight or reps?"
- "What's my estimated one-rep max?"
- "What weight should I use for a target of 8 reps?"

Every serious lifter uses progressive overload — systematically increasing stimulus over time — as their primary training principle. But FitForge only shows raw history. It doesn't translate that data into actionable recommendations.

The existing `est_1rm` field in `ExerciseRecords` calculates a basic Epley estimate but is only shown as a number in the exercise detail screen. It's not used for suggestions anywhere.

## User Stories

- As a lifter, I want to see my estimated 1RM for each exercise so I can gauge my strength level
- As a lifter, I want weight suggestions based on my recent performance so I don't waste time figuring out what to load
- As a lifter, I want to see a "suggested next weight" during my workout that accounts for my recent progression
- As a lifter, I want to see what percentage of my 1RM I'm training at so I can ensure proper intensity
- As a lifter, I want a 1RM calculator tool where I can input weight×reps and see my estimated max

## Proposed Solution

### Overview

Three additions:
1. **Enhanced exercise detail** — show 1RM prominently with %1RM breakdown table
2. **Smart weight suggestions in active session** — show a "suggested" badge next to the weight input with progressive overload logic
3. **1RM Calculator screen** — standalone tool (like the plate calculator) for quick 1RM estimation from any weight×reps input

### UX Design

#### 1. Exercise Detail Screen Enhancement (`app/exercise/[id].tsx`)

Add a **"Strength Profile"** card between the Records card and the History section:

```
┌─────────────────────────────────┐
│ Strength Profile                │
│                                 │
│ Estimated 1RM: 100 kg          │
│ Based on: 80kg × 8 reps        │
│ Formula: Epley                  │
│                                 │
│ ┌───────┬────────┬───────────┐  │
│ │ % 1RM │ Weight │ Rep Range │  │
│ ├───────┼────────┼───────────┤  │
│ │  100% │ 100 kg │    1      │  │
│ │   90% │  90 kg │   3-4     │  │
│ │   80% │  80 kg │   7-8     │  │
│ │   70% │  70 kg │  10-12    │  │
│ │   60% │  60 kg │  15-18    │  │
│ │   50% │  50 kg │  20-25    │  │
│ └───────┴────────┴───────────┘  │
└─────────────────────────────────┘
```

- Shows estimated 1RM (Epley formula, same as existing `est_1rm`)
- Shows the set that produced the estimate (heaviest valid set: weight > 0, 1 ≤ reps ≤ 12)
- Percentage breakdown table with expected rep ranges at each intensity
- `accessibilityLabel` on each row: "90 percent of one-rep max, 90 kilograms, 3 to 4 reps"
- Hidden when no completed sets exist (empty state: "Complete some sets to see your strength profile")
- Respects unit preference (kg/lb)

#### 2. Smart Weight Suggestions in Active Session (`app/session/[id].tsx`)

Enhance the existing "previous" column with a **suggested weight indicator**:

Current behavior: Shows `"80×8"` (previous weight × reps)

New behavior: Shows the previous value AND a small suggestion badge when progressive overload applies:

```
Previous: 80×8
Suggested: 82.5 ▲  (or "80×10 ▲" for rep progression)
```

**Progressive overload logic:**
1. **Weight progression** (default for barbell/dumbbell exercises):
   - If the user completed all target sets at the current weight with ≥ target reps → suggest +1 step (step = user's weight step setting, default 2.5kg/5lb)
   - "Target reps" = the reps they actually completed last time (we don't dictate rep targets)
   - Only suggest increase when the LAST session's sets for this exercise were ALL completed
   
2. **Rep progression** (when weight increase isn't possible — e.g., bodyweight exercises):
   - If the exercise is bodyweight category → suggest +1-2 reps instead of weight increase
   
3. **No suggestion** when:
   - Fewer than 2 completed sessions for this exercise (not enough data)
   - The user DECREASED weight or reps last session (possible deload — don't push)
   - RPE was ≥ 9.5 on the last session (too hard — don't increase)

**Display:**
- Small `Chip` component below the "previous" text
- Green color with "▲" arrow when suggesting increase
- Gray "=" when suggesting same weight (maintain)
- `accessibilityLabel="Suggested weight: 82.5 kilograms, increase by 2.5"`

#### 3. 1RM Calculator Screen (`app/tools/rm.tsx`)

Standalone tool accessible from:
- Workouts tab header (alongside plate calculator icon)
- Exercise detail screen (button in Strength Profile card)

```
┌──────────────────────────────────┐
│ 1RM Calculator                   │
│                                  │
│ Weight: [___100___] kg           │
│ Reps:   [____8____]             │
│                                  │
│ ┌──────────┬─────────┐          │
│ │ Formula  │ Est 1RM │          │
│ ├──────────┼─────────┤          │
│ │ Epley    │ 107 kg  │          │
│ │ Brzycki  │ 101 kg  │          │
│ │ Lombardi │ 105 kg  │          │
│ │ Average  │ 104 kg  │          │
│ └──────────┴─────────┘          │
│                                  │
│ % 1RM Table (based on average)   │
│ ┌───────┬────────┬───────────┐  │
│ │ % 1RM │ Weight │ Rep Range │  │
│ │  ...  │  ...   │   ...     │  │
│ └───────┴────────┴───────────┘  │
└──────────────────────────────────┘
```

- Two numeric inputs: weight and reps
- Computes 1RM using three formulas: Epley, Brzycki, Lombardi
- Shows average of all three
- Percentage breakdown table (same as exercise detail)
- Unit toggle (kg/lb) — reads from user's body settings
- No database access needed — pure calculation
- `accessibilityLabel` on results and table rows

### Technical Approach

#### 1RM Formulas (`lib/rm.ts` — new file)
```typescript
// Epley: weight × (1 + reps / 30)
// Brzycki: weight × (36 / (37 - reps))
// Lombardi: weight × reps^0.1

function epley(weight: number, reps: number): number
function brzycki(weight: number, reps: number): number
function lombardi(weight: number, reps: number): number
function average(weight: number, reps: number): number

// Percentage table: given 1RM, return weight for each percentage tier
function percentageTable(orm: number): { pct: number; weight: number; reps: string }[]

// Suggestion logic
function suggest(history: PreviousPerformance[], step: number, isBodyweight: boolean): Suggestion | null
```

- All formulas valid for reps 1-12 (standard range). For reps > 12, show a warning that estimates become less accurate.
- Round weights to nearest 0.5 (or step increment).

#### Progressive Overload Suggestion Logic (`lib/rm.ts`)
```typescript
type PreviousPerformance = {
  weight: number;
  reps: number;
  rpe: number | null;
  completed: boolean;
};

type Suggestion = {
  type: "increase" | "maintain" | "rep_increase";
  weight: number;
  reps: number | null;
  reason: string;
};
```

Logic:
1. Get the last 2 sessions' sets for this exercise
2. If last session's all sets completed at same weight → check for progression
3. If RPE < 9.5 on last session average → suggest weight + step
4. If RPE ≥ 9.5 → suggest maintain
5. If bodyweight exercise → suggest reps + 1
6. If user decreased last time → suggest maintain (respect deload)

#### Database Changes
- **None.** All 1RM calculations and suggestions are computed client-side from existing data.
- `getPreviousSets()` already returns the data needed.
- `getExerciseRecords()` already computes `est_1rm`.

#### New DB Query (one addition)
```typescript
// Get the last 2 sessions' sets for a given exercise (for suggestion logic)
getRecentExerciseSets(exerciseId: string, sessionCount: number): Promise<{
  session_id: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  completed: boolean;
  started_at: number;
}[]>
```

This returns sets from the N most recent completed sessions for a given exercise, ordered by session then set number. Used by the suggestion logic in the active session.

### Scope

**In Scope:**
- 1RM Calculator screen (`app/tools/rm.tsx`)
- Strength Profile card on exercise detail screen
- Progressive overload suggestion chip in active session
- Three 1RM formulas (Epley, Brzycki, Lombardi)
- Percentage breakdown table
- Unit-aware display (kg/lb)
- Accessibility labels on all new elements
- Navigation from Workouts tab header + exercise detail

**Out of Scope:**
- Periodization planning (mesocycles, deload weeks)
- Training program auto-generation based on 1RM
- Historical 1RM trend chart (save for future phase)
- Wilks/DOTS/IPF score calculation
- Velocity-based training integration
- Machine learning prediction models

### Acceptance Criteria

- [ ] Exercise detail shows "Strength Profile" card with est 1RM, source set, and percentage table
- [ ] Strength Profile hidden when no completed sets exist
- [ ] Strength Profile respects kg/lb unit preference
- [ ] Active session shows suggestion chip below "previous" text when applicable
- [ ] Suggestion chip shows green "▲" for increase, gray "=" for maintain
- [ ] No suggestion shown when < 2 sessions history for that exercise
- [ ] No suggestion when RPE ≥ 9.5 on last session (too hard)
- [ ] No suggestion when user decreased weight last session (deload)
- [ ] Bodyweight exercises get rep-increase suggestions instead of weight-increase
- [ ] 1RM Calculator screen accessible from Workouts tab header
- [ ] 1RM Calculator shows results from Epley, Brzycki, Lombardi + average
- [ ] 1RM Calculator shows percentage table based on average
- [ ] 1RM Calculator works with kg and lb
- [ ] Formulas limited to 1-12 rep range (warning for > 12)
- [ ] All new UI elements have accessibilityLabel
- [ ] No new dependencies added
- [ ] PR passes typecheck with zero errors
- [ ] App starts without crashes

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No history for exercise | No Strength Profile card, no suggestion chip |
| Only 1 session history | Strength Profile shows 1RM, but no suggestion (need ≥ 2) |
| Very high reps (> 12) | 1RM estimate shown with warning "estimates less accurate above 12 reps" |
| 0 weight (bodyweight) | Use bodyweight exercises logic (rep progression) |
| 0 reps | No 1RM calculation possible, skip |
| RPE 10 last session | No increase suggestion (too hard) |
| User decreased weight | Maintain suggestion (respect deload) |
| Very heavy (1RM > 500kg) | Display normally, no special handling |
| Unit switch mid-session | Recalculate suggestion with new unit |
| Weight input 0 in calculator | Show "Enter a weight" message |
| Reps input 0 in calculator | Show "Enter reps" message |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| 1RM formulas diverge significantly | Medium | Low | Show all three + average, let user see the range |
| Suggestion feels "too aggressive" | Low | Medium | Only suggest +1 step, never more; skip when RPE high |
| Performance with many exercises | Low | Low | Suggestions computed per-exercise lazily, not on load |
| Confusing for beginners | Medium | Low | Only show suggestions after 2+ sessions; use clear labels |

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
