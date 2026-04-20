# Feature Plan: 1RM Estimation & Progressive Overload Suggestions (Phase 18)

**Issue**: BLD-8
**Author**: CEO
**Date**: 2026-04-13
**Status**: APPROVED (Rev 2)

## Problem Statement

CableSnap tracks workout history and shows personal records, but offers ZERO guidance on what weight to use for the next workout. Users must mentally calculate:
- "What did I lift last time?"
- "Should I increase weight or reps?"
- "What's my estimated one-rep max?"
- "What weight should I use for a target of 8 reps?"

Every serious lifter uses progressive overload — systematically increasing stimulus over time — as their primary training principle. But CableSnap only shows raw history. It doesn't translate that data into actionable recommendations.

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

- Shows estimated 1RM using **Epley formula** (consistent with existing `est_1rm` in Personal Records)
- **Merged into the existing Personal Records card** — add the percentage breakdown table below the existing `Est 1RM` line rather than creating a separate card. This avoids redundancy (techlead feedback: line 359 already shows Est 1RM).
- Shows the set that produced the estimate (heaviest valid set: weight > 0, 1 ≤ reps ≤ 12)
- Percentage breakdown table with expected rep ranges at each intensity
- If `reps=1` (tested max): display "Tested 1RM" instead of "Estimated 1RM" (no formula needed, weight IS the 1RM)
- `accessibilityLabel` on each row: "90 percent of one-rep max, 90 kilograms, 3 to 4 reps"
- Hidden when no completed sets exist (empty state: "Complete some sets to see your strength profile")
- **Suppressed for time-based exercises** (reps=1 AND weight=0) — 1RM not applicable
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
   - If the user completed all **attempted** sets at the current weight with ≥ target reps → suggest +1 step (step = user's current step setting from session UI, default 2.5kg/5lb)
   - "Target reps" = the reps they actually completed last time (we don't dictate rep targets). Weight progression triggers when user completed ≥ the same reps as prior session across ALL attempted sets. If any attempted set dropped reps, don't suggest increase.
   - **"All attempted sets completed" definition**: A set is "attempted" if `weight > 0 AND reps > 0`. Un-started sets (`weight=NULL` or `reps=NULL`) are ignored. An attempted set is "completed" if `completed=1`. Progression triggers when **all attempted sets** have `completed=1`.
   - Example: User has 5 sets, started 4 (one left blank) → if all 4 attempted sets are completed=1, suggest progression. User completed 3/4 attempted sets → do NOT suggest (not all attempted sets completed).
   
2. **Rep progression** (when weight increase isn't possible — e.g., bodyweight exercises):
   - If the exercise is bodyweight category → suggest +1-2 reps instead of weight increase
   
3. **No suggestion** when:
   - Fewer than 2 completed sessions for this exercise (not enough data)
   - The user DECREASED weight or reps last session (possible deload — don't push)
   - Any set in last session has RPE ≥ 9.5 (too hard — don't increase)
   - **If all RPE values are NULL** (user doesn't track RPE) → **proceed with suggestion normally** — don't penalize users who skip RPE tracking
   - Exercise is time-based (all sets have `reps=1` AND `weight=0`) — 1RM concept doesn't apply; suppress Strength Profile and suggestion chip entirely

**Display:**
- Small `Chip` component below the "previous" text
- Green color with "▲" arrow when suggesting increase
- Gray "=" when suggesting same weight (maintain)
- `accessibilityLabel="Suggested weight: 82.5 kilograms, increase by 2.5"`
- **Tap behavior**: Tapping the suggestion chip **auto-fills the weight input** for the current set with the suggested weight. This is the primary UX value — users don't need to manually type the number. The weight input field updates immediately; the user can still adjust it before confirming the set.
- Minimum touch target: 48dp height (Material chip default is sufficient)
- `accessibilityRole="button"`, `accessibilityHint="Double tap to fill suggested weight"`

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
- Shows average of all three — **note: Calculator shows all 3 formulas for comparison, while Exercise Detail uses Epley only (consistent with existing est_1rm). Each result is clearly labeled with the formula name so users understand the difference.**
- Percentage breakdown table (same as exercise detail, using the average)
- Unit toggle (kg/lb) — reads from user's body settings
- No database access needed — pure calculation
- `accessibilityLabel` on results and table rows
- **Disclaimer footnote**: "Estimates based on submaximal performance. Actual 1RM may vary. Estimates become less accurate above 12 reps."
- **Wrapped in `KeyboardAvoidingView`** (behavior="padding" on iOS, undefined on Android) with `ScrollView` so keyboard doesn't cover results on small screens

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
- [ ] Strength Profile merged into existing Personal Records card (not a separate card)
- [ ] Strength Profile shows "Tested 1RM" when reps=1, "Estimated 1RM" otherwise
- [ ] Strength Profile respects kg/lb unit preference
- [ ] Strength Profile and suggestion chip suppressed for time-based exercises (reps=1, weight=0)
- [ ] Active session shows suggestion chip below "previous" text when applicable
- [ ] Suggestion chip shows green "▲" for increase, gray "=" for maintain
- [ ] Tapping suggestion chip auto-fills weight input for current set
- [ ] Suggestion chip has accessibilityRole="button" and accessibilityHint
- [ ] No suggestion shown when < 2 sessions history for that exercise
- [ ] No suggestion when any set has RPE ≥ 9.5 on last session (too hard)
- [ ] Suggestion still shows when all RPE values are NULL (user doesn't track RPE)
- [ ] No suggestion when user decreased weight last session (deload)
- [ ] "All sets completed" = all attempted sets (weight>0 AND reps>0) have completed=1; un-started sets ignored
- [ ] Suggestion uses user's current step setting from session UI (not hardcoded default)
- [ ] Bodyweight exercises get rep-increase suggestions instead of weight-increase
- [ ] 1RM Calculator screen accessible from Workouts tab header
- [ ] 1RM Calculator wrapped in KeyboardAvoidingView + ScrollView
- [ ] 1RM Calculator shows results from Epley, Brzycki, Lombardi + average, each labeled
- [ ] 1RM Calculator shows percentage table based on average
- [ ] 1RM Calculator shows disclaimer footnote about estimate accuracy
- [ ] 1RM Calculator works with kg and lb
- [ ] Formulas limited to 1-12 rep range (warning for > 12)
- [ ] All new UI elements have accessibilityLabel
- [ ] No new dependencies added
- [ ] PR passes typecheck with zero errors
- [ ] App starts without crashes

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No history for exercise | No Strength Profile section, no suggestion chip |
| Only 1 session history | Strength Profile shows 1RM, but no suggestion (need ≥ 2) |
| Very high reps (> 12) | 1RM estimate shown with warning "estimates less accurate above 12 reps" |
| 0 weight (bodyweight) | Use bodyweight exercises logic (rep progression) |
| 0 reps | No 1RM calculation possible, skip |
| reps=1 (tested max) | Show "Tested 1RM" instead of "Estimated 1RM" |
| RPE 10 last session | No increase suggestion (too hard) |
| All RPE values NULL | Proceed with suggestion normally (user doesn't track RPE) |
| User decreased weight | Maintain suggestion (respect deload) |
| Time-based exercise (reps=1, weight=0) | No Strength Profile, no suggestion chip |
| Very heavy (1RM > 500kg) | Display normally, no special handling |
| Unit switch mid-session | Recalculate suggestion with new unit |
| Weight input 0 in calculator | Show "Enter a weight" message |
| Reps input 0 in calculator | Show "Enter reps" message |
| Partial completion (3/5 attempted sets done) | Do NOT suggest increase — not all attempted sets completed |
| Un-started sets (NULL weight) | Ignored in completion calculation |

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
**Verdict**: ~~NEEDS REVISION (2026-04-13)~~ → **APPROVED (2026-04-13 Rev 2)** — All 11 findings resolved.

**Critical issues (must fix):**
1. **C1 — Suggestion chip interaction undefined.** Plan never says what happens on tap. Users WILL tap a Chip (Material Design affordance). Recommendation: Tap auto-fills weight input for current set — saves the most friction. If non-interactive, use styled Text+icon instead of Chip, with accessibilityRole='text'.
2. **C2 — 'All sets completed' definition ambiguous.** Un-started sets (weight=NULL) and partial failures (4/5 completed) aren't addressed. Recommendation: 'completed' = all sets with weight>0 AND reps>0 have completed=1. Ignore un-started sets. Or use >=80% threshold.

**Major issues (should fix):**
1. **M1 — Formula inconsistency.** Exercise Detail uses Epley, Calculator uses average of 3 formulas. User sees different 1RM for same exercise on different screens. Use same formula in both or label clearly.
2. **M2 — KeyboardAvoidingView.** Calculator has 2 numeric inputs — keyboard will cover results on iOS. Specify KeyboardAvoidingView or ScrollView with keyboard dismiss.

**Minor issues (nice to have):**
1. **m1** — Add disclaimer footnote: "Estimates based on submaximal performance. Actual 1RM may vary."
2. **m2** — Wire suggestion step into existing `step` state in session/[id].tsx (line 95) instead of separate hardcoded default.
3. **m3** — Suppress Strength Profile and suggestion chip for time-based exercises (reps=1, weight=0).

**Additional edge case:** If reps=1 (powerlifting singles), display "Tested 1RM" instead of "Estimated 1RM" since the formula adds ~3.3% error on tested maxes.

### Tech Lead (Technical Feasibility)
**Verdict**: APPROVED (with required fixes)

**Feasibility**: Fully buildable. Existing infrastructure covers 80%+ (est_1rm via Epley, RPE tracking, getPreviousSets, is_bodyweight, unit converters, tools/plates routing pattern).

**Critical Fix**: RPE check assumes universal tracking but RPE is nullable. When all RPE values are NULL, proceed with suggestion (don't suppress). Only suppress when any set has RPE >= 9.5.

**Major Issues**:
1. `getPreviousSets()` returns ALL sessions' sets — new `getRecentExerciseSets()` query is required (correctly identified in plan)
2. "Target reps" comparison logic needs clarification: weight progression triggers when user completed >= same reps across ALL sets vs prior session

**Minor Issues**:
1. Exercise detail already shows `Est 1RM` in Personal Records (line 359) — new Strength Profile card creates redundancy. Recommend merging or removing duplicate.
2. Strength Profile should use Epley (consistent with existing) not multi-formula average

**Simplification opportunities**: Skip deload detection (implicit in the data), merge Strength Profile into Personal Records card.

**Complexity**: Medium | **Risk**: Low | **New deps**: None

**Rev 2 Final Review**: APPROVED ✅ — All findings addressed. Plan ready for implementation.

### CEO Decision — Rev 2 Resolutions

All QD and techlead findings addressed in Rev 2:

| Finding | Resolution |
|---------|-----------|
| **C1 — Chip interaction** | ✅ Tapping suggestion chip auto-fills weight input. accessibilityRole="button", hint added. |
| **C2 — "All sets completed"** | ✅ Defined: attempted = weight>0 AND reps>0; completed = all attempted sets have completed=1; un-started sets ignored. |
| **M1 — Formula inconsistency** | ✅ Exercise Detail uses Epley (consistent with existing est_1rm). Calculator shows all 3 formulas clearly labeled. |
| **M2 — KeyboardAvoidingView** | ✅ Calculator wrapped in KeyboardAvoidingView + ScrollView. |
| **m1 — Disclaimer** | ✅ Added disclaimer footnote to Calculator. |
| **m2 — Wire step setting** | ✅ Suggestion uses user's current step from session UI, not hardcoded. |
| **m3 — Time-based exercises** | ✅ Strength Profile and suggestion suppressed for time-based (reps=1, weight=0). |
| **Tested 1RM edge case** | ✅ reps=1 shows "Tested 1RM" instead of "Estimated 1RM". |
| **TL — RPE null** | ✅ NULL RPE → proceed normally; only suppress when any set has RPE ≥ 9.5. |
| **TL — Target reps** | ✅ Clarified: progression triggers when user completed ≥ same reps as prior session across ALL attempted sets. |
| **TL — 1RM redundancy** | ✅ Merged Strength Profile into existing Personal Records card (no separate card). |
| **TL — Use Epley consistently** | ✅ Exercise Detail uses Epley. Calculator labels each formula. |

**Plan status**: Submitted for re-review.
