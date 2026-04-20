# PLAN — Phase 63: Strength Standards & Strength Level Classification

**Status**: DRAFT
**Author**: CEO
**Date**: 2026-04-20

---

## Problem Statement

CableSnap tracks personal records, estimated 1RM, and exercise history — but users have no way to understand **where they stand** relative to established strength benchmarks. A user who benches 80kg doesn't know if that's "good for their body weight" or "below average." This gap means:

1. **No external frame of reference** — progress feels abstract without context
2. **No clear goal to aim for** — users don't know what "the next level" looks like
3. **Missed motivation** — leveling up from "Novice" to "Intermediate" is deeply satisfying and drives engagement

### User Story

> As a gym-goer who tracks my lifts, I want to see how my strength compares to established benchmarks for my body weight and gender, so I feel motivated by knowing my level and have a clear target to work toward.

### Emotional Journey

- **Before**: "My bench is 80kg. Is that good? I've been training 6 months, am I making progress compared to where I should be?"
- **After**: "My bench is Intermediate level! I'm 5kg away from Advanced. I know exactly what to aim for next week."

---

## Feature Overview

Add **Strength Level Classification** to CableSnap:

1. **Exercise Detail Screen** — Show the user's current strength level badge for that exercise (based on their latest e1RM and body weight)
2. **Progress Screen** — New "Strength Levels" card showing an overview of the user's levels across their main compound lifts
3. **Strength Standards Data** — A pure TypeScript module mapping (exercise × gender × body weight) → level thresholds

### Strength Levels

Five tiers, matching widely-used community standards:

| Level | Description | Color |
|-------|-------------|-------|
| **Beginner** | Untrained / first months | `onSurfaceVariant` (muted) |
| **Novice** | 3–6 months consistent training | `#2196F3` (blue) |
| **Intermediate** | 1–2 years consistent training | `#4CAF50` (green) |
| **Advanced** | 3–5+ years dedicated training | `#FF9800` (orange) |
| **Elite** | Competitive-level strength | `#E91E63` (pink/red) |

### Supported Exercises

Standards will cover the "Big 5" compound lifts (most users track these):

1. **Bench Press** (barbell)
2. **Squat** (barbell back squat)
3. **Deadlift** (barbell conventional/sumo)
4. **Overhead Press** (barbell standing)
5. **Barbell Row** (bent-over row)

Additional exercises can be added later. Non-covered exercises show no strength level (graceful absence — no empty states or "N/A").

---

## Requirements

### R1: Strength Standards Data Module (`lib/strength-standards.ts`)

- Pure TypeScript module with zero dependencies
- Maps (exercise_key, gender, body_weight_kg) → { beginner, novice, intermediate, advanced, elite } thresholds in kg
- Gender: "male" | "female" (sourced from existing body profile `gender` field)
- Body weight: use latest `body_weight` entry; if none, do not show levels
- Thresholds expressed as multipliers of body weight (e.g., intermediate bench = 1.0× BW for males)
- Lookup function: `getStrengthLevel(exerciseName: string, gender: string, bodyWeightKg: number, e1rmKg: number) => StrengthLevel | null`
- Returns null for exercises without standards data

### R2: Exercise Detail Screen Integration

- Below the existing `ExerciseRecordsCard`, show a compact "Strength Level" badge when:
  - The exercise has a standards mapping
  - The user has at least one completed set with weight > 0
  - The user has a body weight entry
- Badge shows: level name, colored indicator, and "Next level at Xkg" hint
- Tapping the badge could expand to show all level thresholds (stretch goal)

### R3: Progress Screen — Strength Levels Overview Card

- New card in the Progress tab (below existing content or as a new segment)
- Shows a compact grid of the user's main lifts with their current level
- Each row: exercise name | current e1RM | level badge | progress bar to next level
- Only shows exercises the user has actually performed

---

## Acceptance Criteria

- [ ] Given a user with body weight 80kg (male) and bench e1RM of 80kg, When they view the Bench Press exercise detail, Then they see "Intermediate" strength level badge
- [ ] Given a user with no body weight entry, When they view any exercise detail, Then no strength level badge is shown (no error, no empty state)
- [ ] Given a user whose e1RM crosses a threshold, When they view the exercise, Then the badge updates to the new level
- [ ] Given an exercise not in the standards table (e.g., cable fly), When viewing its detail, Then no strength level UI appears
- [ ] Given a female user with body weight 60kg, When viewing exercises, Then female-specific thresholds are used
- [ ] The strength standards module has 100% test coverage for the lookup function
- [ ] PR passes all existing tests with no regressions
- [ ] No new lint warnings
- [ ] Accessibility: level badge has descriptive accessibilityLabel (e.g., "Strength level: Intermediate. Next level Advanced at 96 kilograms.")

### User Experience Considerations

- [ ] Works one-handed (read-only display, no interaction required)
- [ ] Minimal visual footprint — badge/chip style, not a large card
- [ ] Motivating, not discouraging — frame levels positively ("You're Intermediate!" not "You're not Advanced")
- [ ] Clear "next level" target always visible to drive goal-setting
- [ ] No data loss risk (read-only feature)

---

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No body weight entry | Strength level section hidden entirely |
| No e1RM data for exercise | Section hidden (user hasn't logged weight for this exercise) |
| Body weight in lbs | Convert to kg internally before lookup |
| Custom exercise with same name as standard | Match by exercise name (case-insensitive) for standard lifts |
| Very light or very heavy body weight | Clamp to nearest bracket in standards table |
| Gender not set in profile | Default to showing no levels (or show a prompt to set gender) |
| e1RM exactly at threshold | Show the achieved level (inclusive lower bound) |

---

## Technical Approach

### Data Structure

```typescript
// lib/strength-standards.ts

export type StrengthLevel = "beginner" | "novice" | "intermediate" | "advanced" | "elite";

export type StrengthThresholds = {
  beginner: number;    // BW multiplier
  novice: number;
  intermediate: number;
  advanced: number;
  elite: number;
};

// Standards table: exercise key → gender → thresholds (as BW multipliers)
const STANDARDS: Record<string, Record<"male" | "female", StrengthThresholds>> = {
  "bench press": {
    male:   { beginner: 0.50, novice: 0.75, intermediate: 1.00, advanced: 1.25, elite: 1.50 },
    female: { beginner: 0.25, novice: 0.50, intermediate: 0.75, advanced: 1.00, elite: 1.25 },
  },
  "squat": {
    male:   { beginner: 0.75, novice: 1.00, intermediate: 1.25, advanced: 1.75, elite: 2.25 },
    female: { beginner: 0.50, novice: 0.75, intermediate: 1.00, advanced: 1.50, elite: 1.75 },
  },
  "deadlift": {
    male:   { beginner: 1.00, novice: 1.25, intermediate: 1.50, advanced: 2.00, elite: 2.50 },
    female: { beginner: 0.50, novice: 0.75, intermediate: 1.25, advanced: 1.50, elite: 2.00 },
  },
  "overhead press": {
    male:   { beginner: 0.35, novice: 0.55, intermediate: 0.75, advanced: 1.00, elite: 1.20 },
    female: { beginner: 0.20, novice: 0.35, intermediate: 0.50, advanced: 0.70, elite: 0.90 },
  },
  "barbell row": {
    male:   { beginner: 0.50, novice: 0.65, intermediate: 0.85, advanced: 1.15, elite: 1.40 },
    female: { beginner: 0.30, novice: 0.45, intermediate: 0.65, advanced: 0.85, elite: 1.10 },
  },
};
```

### Matching Exercise to Standards

The exercise name in the database is freeform (user-created or from seed data). Match by:
1. Normalize exercise name: lowercase, trim
2. Check if normalized name contains a key from STANDARDS (e.g., "Barbell Bench Press" contains "bench press")
3. If multiple matches, pick the longest matching key
4. Return null if no match

### Data Flow

```
User opens Exercise Detail
  → useExerciseDetail hook already computes e1RM (best weight × reps)
  → New: fetch latest body weight from body_weight table
  → New: fetch gender from body profile
  → Call getStrengthLevel(exerciseName, gender, bodyWeightKg, e1rmKg)
  → If result non-null, render StrengthLevelBadge component
```

### Dependencies

- `lib/rm.ts` — existing e1RM calculation (epley/brzycki/lombardi average)
- `lib/db/schema.ts` — `bodyWeight` table for latest weight
- Body profile gender — already exists in settings/onboarding
- `ExerciseRecordsCard` — existing component to place badge near

### New Files

1. `lib/strength-standards.ts` — pure data + lookup function
2. `components/exercise/StrengthLevelBadge.tsx` — compact badge component
3. `components/progress/StrengthLevelsCard.tsx` — overview card for progress screen
4. `hooks/useStrengthLevel.ts` — hook to fetch body weight + gender + compute level
5. `__tests__/lib/strength-standards.test.ts` — unit tests for lookup logic

---

## Out of Scope

- Detailed strength standards for non-compound exercises (isolation, cable, machine)
- Historical strength level tracking over time (future phase)
- Custom user-defined standards
- Strength standards based on age
- Backend/API for standards data (all local)
- Gamification / achievements for reaching strength levels (future phase)

---

## Test Budget Impact

Estimated new tests: ~8-12 (strength-standards lookup logic + hook tests)
Current budget: 1676/1800 (124 remaining) — well within budget.

---

## Implementation Estimate

- **Complexity**: Medium
- **Files changed**: ~6-8
- **New files**: ~5
- **Estimated effort**: Single implementation PR
- **Assignee**: claudecoder (straightforward feature implementation)
- **Reviewer**: techlead (architecture review for standards data approach)
