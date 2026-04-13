# Feature Plan: Strategic Pivot — Cable Machine Focus + Beyond Power Voltra (Phase 22)

**Issue**: BLD-27
**Author**: CEO
**Date**: 2026-04-13
**Status**: DRAFT

## Problem Statement

FitForge currently has a generic exercise database (70 exercises) covering barbells, dumbbells, bodyweight, machines, kettlebells, and cables. The board has directed a fundamental product pivot: FitForge must become a **cable-machine-focused workout app**, specifically targeting the **Beyond Power Voltra** device.

Users have a power cage with a Voltra mounted. They don't need barbell, dumbbell, or other equipment support. The current exercise database is 89% irrelevant (only 8/70 exercises are cable-based).

**Why now?** Board directive — URGENT priority. The product vision is shifting from "generic workout tracker" to "ultimate Voltra companion app."

## User Stories

- As a Voltra owner, I want exercises specifically designed for my device so I can get the most out of my cable trainer
- As a Voltra owner, I want to know which attachment and mount position to use for each exercise so I can set up quickly
- As a Voltra owner, I want to see compatible training modes (eccentric overload, chains, isokinetic, etc.) for each exercise so I can vary my training stimulus
- As a workout planner, I want only cable-machine exercises in the database so I'm not distracted by irrelevant barbell/dumbbell movements

## Proposed Solution

### Overview

Complete overhaul of the exercise database and related UI:
1. **Replace** all 70 exercises with the 54 official Beyond Power Voltra Movement Bank exercises
2. **Add** Voltra-specific metadata fields to the exercise schema
3. **Remove** the barbell plate calculator (no longer relevant)
4. **Update** UI chrome (icons, labels) to reflect cable-machine identity
5. **Restructure** exercise categories to match Voltra's 6 muscle groups

### Exercise Database Audit — Current State

| Equipment | Count | Action |
|-----------|-------|--------|
| Barbell | 16 | REMOVE |
| Dumbbell | 15 | REMOVE |
| Bodyweight | 17 | REMOVE |
| Machine | 8 | REMOVE |
| Cable | 8 | REPLACE with Voltra equivalents |
| Kettlebell | 3 | REMOVE |
| Other | 3 | REMOVE |
| **Total** | **70** | **All replaced by 54 Voltra exercises** |

### New Exercise Database — Voltra Movement Bank (54 exercises)

**Abs & Core (9):**
Abdominal Crunches, Anti-rotational Supine Bicycle, Half Kneeling Chop, High Row, One-arm Chest Fly with Rotation, One-arm Chest Press with Rotational Lunge, Single Arm Chest Press with Spinal Rotation, Squat with Rotational Force, Trunk Horizontal Rotations

**Arms (9):**
Biceps Curls (Low Pulley), Biceps Curls, Hammer Curl, High Pulley Overhead Triceps Extension, Lying Triceps Extension, Seated One-arm Concentration Curl, Single-arm Biceps Curls, Triceps Push-down, Wrist Curl

**Back (9):**
Wide Grip Lat Pull-down, Close Grip Lat Pull-down, Seated Cable Row, Single-arm Lat Pull-down, Single-arm Row on Bench, Spinal Extension, Standing Shrugs, Straight Arm Lat Pull-down, Supinated Seated Cable Row

**Chest (9):**
Bench Fly, Crossover Fly, Decline Flys, Incline Chest Press, One-arm Upper Chest Fly, Single-arm Chest Press, Standing Chest Press (Bar), Standing Chest Press (Handle), Standing Decline Chest Fly

**Legs & Glutes (9):**
Crunch with Hip Flexion, Deadlift, Goblet Squat, Hip Extension, Leg Curl Bird Dog, Lying Hip Flexion, Reverse Lunges with Cable Pull, Seated Hip Internal Rotation, Side Kicks

**Shoulders (9):**
Face Pulls with External Rotation, Front Raise (Bar), Front Raise (Handle), Lateral Raises Two Arms, Lateral Raises One-arm, Shoulder External Rotation, Shoulder Internal Rotation, Upright Rows (Bar), Upright Shoulder External Rotation

### UX Design

#### Exercise List Screen
- Exercise cards show: name, muscle group, difficulty, attachment icon
- Filter by muscle group (6 groups: abs_core, arms, back, chest, legs_glutes, shoulders)
- No equipment filter needed (everything is cable/Voltra)
- Search remains unchanged

#### Exercise Detail Screen
- Show mount position with visual indicator (high/mid/low/floor)
- Show recommended attachment with icon label
- Show compatible training modes as informational tags
- Instructions reference Voltra-specific setup (mount, attachment, cable direction)

#### Workout Tab Header
- Remove plate calculator button
- Keep 1RM calculator (still relevant for cable resistance progressive overload)
- Tab icon: change from "dumbbell" to a neutral fitness icon (e.g., "arm-flex" or "run")

#### Tools Cleanup
- **REMOVE**: `app/tools/plates.tsx` (barbell plate calculator)
- **KEEP**: `app/tools/rm.tsx` (1RM calculator)
- Remove plate calculator route from navigation

### Technical Approach

#### 1. Type Updates (`lib/types.ts`)

Add new types and update Exercise interface:

```typescript
type MountPosition = "high" | "mid" | "low" | "floor"
type Attachment = "handle" | "ring_handle" | "ankle_strap" | "rope" | "bar" | "squat_harness" | "carabiner"
type TrainingMode = "weight" | "eccentric_overload" | "band" | "damper" | "isokinetic" | "isometric" | "custom_curves" | "rowing"

// Update MuscleGroup to new 6-group system:
type MuscleGroup = "abs_core" | "arms" | "back" | "chest" | "legs_glutes" | "shoulders"
```

Add `mount_position`, `attachment`, `training_modes` to Exercise type.

#### 2. Schema Migration (`lib/db.ts`)

```sql
ALTER TABLE exercises ADD COLUMN mount_position TEXT DEFAULT 'mid';
ALTER TABLE exercises ADD COLUMN attachment TEXT DEFAULT 'handle';
ALTER TABLE exercises ADD COLUMN training_modes TEXT DEFAULT '["weight"]';
```

Migration must:
- Add new columns
- Delete all seed exercises (is_custom = 0)
- Re-seed with Voltra exercises
- Preserve user's custom exercises (is_custom = 1)
- Update category values in related tables

#### 3. Seed Data Replacement (`lib/seed.ts`)

Complete replacement — remove all 70 current exercises, add 54 Voltra exercises with:
- Voltra-specific instructions (setup, mount position, technique)
- Mount position per exercise
- Recommended attachment per exercise
- Compatible training modes array
- Difficulty level
- Primary/secondary muscle groups

#### 4. UI Updates

- Delete `app/tools/plates.tsx`
- Update `app/(tabs)/_layout.tsx`: remove plate calculator button, update tab icon
- Update exercise list to show Voltra metadata (attachment, mount icons)
- Update exercise detail screen for new fields
- Update exercise filter to use 6-category system
- Update any category references throughout the app

### Scope

**In Scope:**
- Complete exercise database replacement (70 → 54 exercises)
- Schema migration for Voltra metadata fields (mount_position, attachment, training_modes)
- Category restructure (9 → 6 muscle groups)
- Remove plate calculator tool and its navigation entry
- Update types for new fields
- Update exercise list/detail UI to display new metadata
- Update seed data with full Voltra Movement Bank
- Tab layout updates (remove plate calc button, update icon)

**Out of Scope:**
- Beyond+ app data import/export (future phase)
- Bluetooth connectivity to Voltra device (future phase)
- Custom resistance curve programming UI (future phase)
- Voltra battery/status monitoring (future phase)
- Video demonstrations for exercises (future phase)
- Interactive training mode selection during workout logging (future phase — metadata only for now)

### Acceptance Criteria

- [ ] Given a fresh install, When the app opens, Then the exercise database contains exactly 54 Voltra exercises (no barbell/dumbbell/bodyweight/kettlebell)
- [ ] Given the exercise list, When filtering by muscle group, Then 6 Voltra-aligned groups are shown (abs_core, arms, back, chest, legs_glutes, shoulders)
- [ ] Given any exercise, When viewing its detail, Then mount_position, attachment type, and training_modes are displayed
- [ ] Given the workouts tab, When looking at the header, Then the plate calculator button is NOT present
- [ ] Given the tools section, When navigating, Then only the 1RM calculator is available (plate calculator removed)
- [ ] Given an existing user with workout history, When the app migrates, Then workout sessions and template logs are preserved (exercises update but historical data remains)
- [ ] Given a user with custom exercises, When the app migrates, Then custom exercises (is_custom = 1) are preserved untouched
- [ ] Given the exercise list, When searching, Then search works against the new 54 Voltra exercises
- [ ] Given any screen, When looking at icons/labels, Then no barbell/dumbbell-specific references appear in navigation chrome
- [ ] TypeScript compiles with zero errors (`npx tsc --noEmit`)
- [ ] All existing tests pass (updated for new exercise data where needed)
- [ ] No regressions on native platforms (iOS/Android)

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Existing workout templates reference removed exercises | Templates remain; removed exercise references show as "Exercise unavailable" with option to swap |
| Existing workout sessions with old exercises | Session logs are preserved as historical data; exercise name is stored as string in session data |
| User has custom exercises with non-cable equipment | Custom exercises are PRESERVED — user's custom data is never deleted regardless of equipment type |
| Category filter shows empty groups | Should not happen — all 6 groups have exactly 9 exercises each |
| 1RM calculator with cable exercises | Still works — 1RM calculation is equipment-agnostic (weight-based) |
| Search for old exercise names (e.g., "bench press") | No results for removed exercises — expected behavior |
| Food database / nutrition tab | Unchanged — nutrition features are equipment-independent |
| Programs referencing removed exercises | Program structure preserved; exercise slots marked as needing replacement |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Users lose workout history | Low | Critical | Only replace seed exercises (is_custom=0); preserve session logs, templates, and custom exercises |
| Missing exercise instructions | Medium | High | Write detailed Voltra-specific instructions for all 54 exercises; cross-reference Beyond Power docs |
| Category migration breaks filters | Low | Medium | Test filter behavior with new categories; handle unknown categories gracefully |
| Mount position data inaccurate | Medium | Medium | Cross-reference with Beyond Power official AnyMount documentation |
| Training modes too complex for users | Low | Low | Display as informational tags only (not interactive) in this phase |
| Large seed.ts file | Low | Low | 54 exercises with full instructions will be ~800-1000 lines; acceptable |

## Implementation Breakdown

Single implementation issue assigned to claudecoder (after plan approval):

1. **Types & Schema** — Update types.ts, add migration to db.ts
2. **Seed Data** — Complete replacement of seed.ts with 54 Voltra exercises
3. **UI Cleanup** — Remove plate calculator, update tab layout, update categories
4. **Exercise Display** — Update exercise list/detail to show Voltra metadata
5. **Testing** — Update existing tests for new data, verify migration path

## Review Feedback

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)

**Verdict**: NEEDS REVISION

**Technical Feasibility**: Can be built as described with one CRITICAL design fix. Migration approach (PRAGMA column detection + ALTER TABLE) follows established patterns. Seed replacement and UI cleanup are low-risk.

**Architecture Fit**: Compatible with existing patterns. Moderate refactoring for type changes across filters, labels, and display components.

**CRITICAL — MuscleGroup Must Stay Granular**: The plan conflates `MuscleGroup` and `Category`. These serve different purposes:
- `Category` = UI filter grouping → change to 6 Voltra groups ✅
- `MuscleGroup` = granular muscle tracking for `primary_muscles`/`secondary_muscles` → must NOT collapse to 6 values ❌

Collapsing MuscleGroup destroys tracking value. "Arms" conflates biceps/triceps/forearms — useless for volume-per-muscle analysis. Keep MuscleGroup at 14 values, only change Category to 6.

**MAJOR — Orphaned Template Exercises**: Need explicit UI handling instructions for when seed exercises are deleted but template_exercises/workout_sets still reference them. LEFT JOIN returns null — UI must show "Exercise removed" with replace action.

**MINOR — Equipment Field**: Keep the field as "cable" for all Voltra exercises. Hide equipment filter chip in UI since it's now meaningless. Preserves backward compatibility for user custom exercises.

**Recommendations**:
1. Add Voltra fields as optional (`mount_position?: MountPosition`) to avoid breaking custom exercises
2. Consider `is_voltra` boolean to distinguish official Voltra exercises from custom ones
3. Keep `MUSCLE_GROUPS_BY_REGION` — just update it for relevant Voltra muscles

**TODO (must fix before approval)**:
- [ ] Keep MuscleGroup granular (14 values). Only change Category to 6 Voltra groups.
- [ ] Add explicit orphaned-exercise UI handling instructions.
- [ ] Specify Equipment field strategy (keep type, hide filter in UI).

### CEO Decision
_Pending reviews_
