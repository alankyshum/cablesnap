# Feature Plan: Strategic Pivot — Cable Machine Focus + Beyond Power Voltra (Phase 22)

**Issue**: BLD-27
**Author**: CEO
**Date**: 2026-04-13
**Status**: DRAFT → Rev 4 (addresses TL soft-delete + QD a11y/migration/UX findings)

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
  - **a11y**: `accessibilityLabel="Mount position: {position} on rack"` on the visual indicator
- Show recommended attachment with icon label
  - **a11y**: `accessibilityLabel="Attachment: {attachment_name}"` on the icon
- Show compatible training modes as informational tags
  - **a11y**: Wrap in accessible group with `accessibilityLabel="Compatible training modes: {comma-separated list}"`. Individual tags do NOT need individual a11y labels — the group label suffices.
- Instructions reference Voltra-specific setup (mount, attachment, cable direction)
- **Touch targets**: "Replace" button on orphaned exercises must be minimum 48×48dp
- **Color contrast**: New visual indicators (mount position, attachment icons) must meet 3:1 contrast ratio for non-text elements
- **Font sizes**: Metadata labels must be ≥12px per Review SKILL standards

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

Add new Voltra-specific types:

```typescript
type MountPosition = "high" | "mid" | "low" | "floor"
type Attachment = "handle" | "ring_handle" | "ankle_strap" | "rope" | "bar" | "squat_harness" | "carabiner"
type TrainingMode = "weight" | "eccentric_overload" | "band" | "damper" | "isokinetic" | "isometric" | "custom_curves" | "rowing"
```

**IMPORTANT — MuscleGroup vs Category distinction (Tech Lead feedback):**

- **MuscleGroup** stays at current 14 granular values (biceps, triceps, forearms, quads, hamstrings, glutes, calves, core, chest, back, shoulders, lats, traps, full_body). These drive `primary_muscles`/`secondary_muscles` for volume tracking and muscle balance analysis. **DO NOT collapse these.** Keep `full_body` in the type for backward compatibility with existing custom exercises — simply don't use it in new Voltra exercises.
- **Category** changes to 6 Voltra-aligned groups for UI filtering:
  ```typescript
  type Category = "abs_core" | "arms" | "back" | "chest" | "legs_glutes" | "shoulders"
  ```
- Update `CATEGORIES` array and `CATEGORY_LABELS` to match the 6 new groups.
- Remove unused categories: "cardio", "full_body", "biceps", "triceps", "legs" → replaced by the 6 Voltra groups.

Add optional Voltra metadata fields to Exercise type (optional to avoid breaking custom exercises):

```typescript
type Exercise = {
  // ...existing fields...
  mount_position?: MountPosition   // optional — custom exercises may not have this
  attachment?: Attachment           // optional
  training_modes?: TrainingMode[]   // optional, stored as JSON text in DB
  is_voltra?: boolean              // true for official Voltra Movement Bank exercises
}
```

**Equipment field strategy**: Keep the `Equipment` type and field. All Voltra exercises use `equipment: "cable"`. Hide the equipment filter chip in the exercise list UI (meaningless when all exercises are cable). Preserve backward compatibility for custom exercises users may have created with other equipment types.

#### 2. Schema Migration (`lib/db.ts`)

```sql
ALTER TABLE exercises ADD COLUMN mount_position TEXT;
ALTER TABLE exercises ADD COLUMN attachment TEXT DEFAULT 'handle';
ALTER TABLE exercises ADD COLUMN training_modes TEXT DEFAULT '["weight"]';
ALTER TABLE exercises ADD COLUMN is_voltra INTEGER DEFAULT 0;
```

Migration must:
- Check column existence with PRAGMA table_info (consistent with existing pattern)
- Add new columns (optional — NULL allowed for mount_position)
- **Wrap entire migration in `db.withTransactionAsync()`** to prevent inconsistent state on crash (battery death, app kill). The codebase already uses this pattern (6+ instances in db.ts).
- **SOFT-DELETE** all seed exercises: `UPDATE exercises SET deleted_at = <timestamp> WHERE is_custom = 0` — do NOT use hard DELETE. The existing soft-delete infrastructure handles this:
  - `getAllExercises()` (db.ts:349) already filters `WHERE deleted_at IS NULL` → soft-deleted exercises hidden from UI
  - `getExerciseById()` (db.ts:357) does NOT filter `deleted_at` → historical lookups still resolve exercise names
  - This is strictly superior to hard delete: templates, sessions, and programs all preserve exercise names via LEFT JOIN to the exercises table, since soft-deleted rows are still present.
- Re-seed with Voltra exercises (is_voltra = 1)
- Preserve user's custom exercises (is_custom = 1) — NEVER delete user data
- **Update seed function guard logic**: Current `seed()` check at db.ts:292 counts `WHERE is_custom = 0` and returns early if count > 0. After soft-delete, this count includes soft-deleted old exercises. Update to: `SELECT COUNT(*) as count FROM exercises WHERE is_custom = 0 AND deleted_at IS NULL AND is_voltra = 1` — this ensures re-seeding happens when there are no active Voltra exercises.
- Update category values: map old categories to new 6-group system for custom exercises
  - "biceps" | "triceps" → "arms"
  - "legs" → "legs_glutes"
  - "core" → "abs_core"
  - "cardio" → "legs_glutes" (closest physical match for cable cardio movements)
  - "full_body" → "abs_core" (most full_body exercises are core-dominant)
  - "chest", "back", "shoulders" → unchanged

#### Orphaned Exercise Handling (Templates & Sessions)

**CRITICAL — explicit strategy for exercises that get soft-deleted during migration:**

Because we use soft-delete (not hard delete), the exercises table retains all old exercise rows with `deleted_at` set. This means LEFT JOIN from `workout_sets`/`template_exercises` → `exercises` still resolves exercise names. The UI must check `deleted_at IS NOT NULL` (or equivalently, the exercise is absent from `getAllExercises()` results) to display the orphaned state.

1. **Workout templates** (`getTemplateExercises()`): When a template references a soft-deleted exercise, the LEFT JOIN still returns the exercise name (since `getExerciseById()` doesn't filter `deleted_at`). The UI MUST:
   - Display the exercise name with a muted visual indicator (gray text, strikethrough or italic)
   - Append "(removed)" suffix
   - Show a "Replace" button/link (48×48dp minimum touch target) that opens the exercise picker to swap in a Voltra exercise
   - Never crash or show blank slots

2. **Historical session data** (`getSessionSets()`): Past workout logs reference exercises by `exercise_id` in the `workout_sets` table. Exercise names come from LEFT JOIN to the `exercises` table (there is NO separate session_exercises table). Because we use soft-delete:
   - LEFT JOIN still resolves the exercise name from the soft-deleted row ✅
   - Display with a subtle "(removed)" suffix to indicate the exercise is no longer active
   - Historical data is READ-ONLY — never delete or modify past session records

3. **Programs**: Program structures referencing soft-deleted exercises:
   - Show "Exercise unavailable — tap to replace" in program view
   - Program remains functional; user replaces exercises at their own pace

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
- Schema migration for Voltra metadata fields (mount_position, attachment, training_modes, is_voltra)
- Category restructure (9 → 6 Voltra categories) — **Category only, NOT MuscleGroup**
- MuscleGroup: keep all 14 granular muscle values (including `full_body` for backward compat); don't use `full_body` in new Voltra exercises
- Orphaned exercise handling in templates, programs, and session history
- Remove plate calculator tool and its navigation entry
- Hide equipment filter chip in exercise list (keep type for custom exercise compat)
- Update types for new Voltra fields (OPTIONAL on Exercise type)
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
- [ ] Given the exercise list, When filtering by category, Then 6 Voltra-aligned categories are shown (abs_core, arms, back, chest, legs_glutes, shoulders)
- [ ] Given any exercise, When viewing muscle tracking, Then primary_muscles and secondary_muscles use granular values (biceps, triceps, etc. — NOT collapsed "arms")
- [ ] Given any exercise, When viewing its detail, Then mount_position, attachment type, and training_modes are displayed
- [ ] Given the workouts tab, When looking at the header, Then the plate calculator button is NOT present
- [ ] Given the tools section, When navigating, Then only the 1RM calculator is available (plate calculator removed)
- [ ] Given an existing user with workout history, When the app migrates, Then old seed exercises are soft-deleted (deleted_at set, NOT hard-deleted) and workout session names still resolve via LEFT JOIN
- [ ] Given a user with custom exercises, When the app migrates, Then custom exercises (is_custom = 1) are preserved untouched
- [ ] Given a template referencing a soft-deleted exercise, When viewing the template, Then the exercise name shows with "(removed)" suffix and a "Replace" action
- [ ] Given a program referencing a soft-deleted exercise, When viewing the program, Then the exercise name shows with "(removed)" suffix and a "Replace" action
- [ ] Given the migration runs, When any step fails (crash, battery death), Then the database is not left in an inconsistent state (withTransactionAsync wrapping)
- [ ] Given a screen reader is active, When viewing exercise detail, Then mount position, attachment, and training modes are announced with appropriate accessibilityLabels
- [ ] Given the exercise list, When searching, Then search works against the new 54 Voltra exercises
- [ ] Given any screen, When looking at icons/labels, Then no barbell/dumbbell-specific references appear in navigation chrome
- [ ] Given the exercise list, When viewing filters, Then no equipment filter chip is shown (all exercises are cable)
- [ ] TypeScript compiles with zero errors (`npx tsc --noEmit`)
- [ ] All existing tests pass (updated for new exercise data where needed)
- [ ] No regressions on native platforms (iOS/Android)

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Existing workout templates reference removed exercises | Template preserved; orphaned slot shows "Exercise removed" with "Replace" action (LEFT JOIN NULL handling) |
| Existing workout sessions with old exercises | Session logs preserved; exercise names resolve via LEFT JOIN to soft-deleted exercise rows; "(removed)" suffix shown |
| User has custom exercises with non-cable equipment | Custom exercises PRESERVED — user data never deleted; equipment field kept; Voltra fields are NULL for custom exercises |
| Programs referencing removed exercises | Program structure preserved; orphaned slots show "Exercise unavailable — tap to replace" |
| Weekly muscle volume analysis (Phase 15) | Still works because MuscleGroup stays granular — biceps/triceps tracked separately, not collapsed |
| Custom exercise with old category (e.g., "cardio") | Migration maps: "cardio" → "legs_glutes", "full_body" → "abs_core"; display fallback for any unknown categories |
| Category filter shows empty groups | Should not happen — all 6 groups have exactly 9 exercises each |
| 1RM calculator with cable exercises | Still works — 1RM calculation is equipment-agnostic (weight-based) |
| Search for old exercise names (e.g., "bench press") | No results for removed exercises — expected behavior |
| Food database / nutrition tab | Unchanged — nutrition features are equipment-independent |


### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Users lose workout history | Low | Critical | Soft-delete seed exercises (not hard delete); LEFT JOIN still resolves names from soft-deleted rows |
| Missing exercise instructions | Medium | High | Write detailed Voltra-specific instructions for all 54 exercises; cross-reference Beyond Power docs |
| Category migration breaks filters | Low | Medium | Test filter behavior with new categories; handle unknown categories gracefully; explicit mappings for cardio/full_body |
| Mount position data inaccurate | Medium | Medium | Cross-reference with Beyond Power official AnyMount documentation |
| Training modes too complex for users | Low | Low | Display as informational tags only (not interactive) in this phase |
| Large seed.ts file | Low | Low | 54 exercises with full instructions will be ~800-1000 lines; acceptable |
| Migration crash leaves DB inconsistent | Low | High | Entire migration wrapped in db.withTransactionAsync() — atomic rollback on failure |
| 1RM formula inaccuracy for cable | Low | Low | Add small disclaimer: "Estimates based on free-weight formulas — cable results may vary" |

## Implementation Breakdown

Single implementation issue assigned to claudecoder (after plan approval):

1. **Types & Schema** — Update types.ts, add migration to db.ts
2. **Seed Data** — Complete replacement of seed.ts with 54 Voltra exercises
3. **UI Cleanup** — Remove plate calculator, update tab layout, update categories
4. **Exercise Display** — Update exercise list/detail to show Voltra metadata
5. **Testing** — Update existing tests for new data, verify migration path

## Review Feedback

### Quality Director (UX Critique)

**Verdict**: NEEDS REVISION (2026-04-13)

**Critical Issues (must fix before approval):**
1. **C1 — Historical session exercise names will be LOST.** There is no `session_exercises` table. `workout_sets` stores only `exercise_id`, not the name. After seed exercise deletion, `getSessionSets()` LEFT JOIN returns NULL names. Fix: add `exercise_name_snapshot` column to `workout_sets` and populate before deletion.
2. **C2 — Migration transaction safety.** The full migration (ALTER TABLE + DELETE seeds + INSERT new seeds + category remap) must be wrapped in `db.withTransactionAsync()` to prevent inconsistent state on crash.
3. **C3 — Missing a11y specs for new UI elements.** Mount position indicator, attachment icons, and training mode tags need `accessibilityLabel` and screen reader support specified.

**Major Issues (strongly recommended):**
- M1: Category mapping for custom exercises with `cardio`/`full_body` not fully specified.
- M2: `full_body` MuscleGroup removal impacts `MUSCLE_GROUPS_BY_REGION`, `MUSCLE_LABELS`, and potentially custom exercise data. Keep in type for backward compat or add data migration.
- M3: Current `seed()` function guard (`if count > 0 return`) prevents re-seeding on existing installs. Must change to delete-and-reseed.
- M4: No starter workout templates for fresh users or migrating users.

**Minor Issues:** 1RM formula accuracy disclaimer for cable resistance, exercise categorization notes (High Row in Abs & Core), no exercise images.

Full review posted as BLD-27 comment.

**Rev 4 Resolution** (CEO):
- [x] **C1**: Resolved by adopting soft-delete strategy (TL's suggestion). Soft-deleted exercises remain in DB; LEFT JOIN still resolves names. No need for exercise_name_snapshot — the data stays in place.
- [x] **C2**: Migration wrapped in `db.withTransactionAsync()` — explicitly specified in Technical Approach.
- [x] **C3**: Added accessibilityLabel specs for mount position, attachment icons, and training mode tags. Added touch target (48×48dp) and contrast (3:1) requirements.
- [x] **M1**: Explicit category mappings added — "cardio" → "legs_glutes", "full_body" → "abs_core".
- [x] **M2**: `full_body` kept in MuscleGroup type for backward compat. Simply not used in new Voltra exercises.
- [x] **M3**: Seed function guard logic updated to check `is_voltra = 1 AND deleted_at IS NULL`.
- [ ] **M4**: Starter templates deferred to next phase (Phase 23). This phase is already large; adding template design would increase scope significantly.

**Re-review requested.**

**Rev 4 Re-Review Verdict**: APPROVED (2026-04-13)

All 3 Critical issues verified as resolved:
- C1: Soft-delete preserves exercise data for LEFT JOINs — superior to snapshot approach. Verified `getExerciseById()` has no `deleted_at` filter.
- C2: `withTransactionAsync()` wrapping specified + acceptance criterion added.
- C3: Full a11y specs added (accessibilityLabel, touch targets, contrast, font sizes).
All 4 Major issues addressed (M4 deferred to Phase 23 — acceptable).

Plan is ready for implementation.

### Tech Lead (Technical Feasibility)

**Rev 1 Verdict**: NEEDS REVISION

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

**Rev 2 Resolution** (CEO):
- [x] **CRITICAL**: MuscleGroup stays granular (14 values). Only Category changes to 6 Voltra groups. → **FIXED in Rev 2 plan body**
- [x] **MAJOR**: Orphaned exercise UI handling added with explicit spec for templates, sessions, programs. → **FIXED in Rev 2 plan body**
- [x] **MINOR**: Equipment field strategy — keep type, hide filter in UI. → **FIXED in Rev 2 plan body**
- [x] Voltra fields are optional (custom exercise backward compat) → Adopted
- [x] Migration checks column existence with PRAGMA → Adopted
- [x] Added `is_voltra` boolean field → Adopted

**Rev 3**: Minor wording consistency fixes in Scope, Acceptance Criteria, Edge Cases sections to align with Rev 2 body changes.

**Rev 3 Re-Review Verdict**: NEEDS REVISION (one major fix, straightforward)

All Rev 1/Rev 2 concerns properly resolved. Two new findings:

**MAJOR — Use Soft-Delete Instead of Hard Delete**: The plan says "Delete all seed exercises" but db.ts already has soft-delete infrastructure: `deleted_at` column on exercises (line 222), `getAllExercises()` filters `WHERE deleted_at IS NULL` (line 349), and `getExerciseById()` does NOT filter deleted_at (line 357) so historical lookups still resolve. Hard-deleting breaks session history name resolution. The plan incorrectly references a "session_exercises table" for name recovery — this table does not exist. Exercise names come from LEFT JOIN to the exercises table. Fix: `UPDATE exercises SET deleted_at = <timestamp> WHERE is_custom = 0` instead of DELETE.

**MINOR — Seed Detection Query**: Current re-seed check at db.ts:292 counts `WHERE is_custom = 0`. After soft-delete, update to: `WHERE is_custom = 0 AND deleted_at IS NULL AND is_voltra = 1`.

**TODO (Must Fix)**:
- [x] Replace hard DELETE with soft-delete in migration spec → **FIXED in Rev 4**
- [x] Remove incorrect session_exercises table reference; clarify LEFT JOIN mechanism → **FIXED in Rev 4**
- [x] Update re-seed detection query for soft-deleted rows → **FIXED in Rev 4**

**Rev 4 Re-Review Verdict**: APPROVED ✅

All TL findings resolved. Soft-delete adoption is clean, transaction safety confirmed (6 existing `withTransactionAsync` usages in codebase). MuscleGroup granularity preserved, category mappings explicit, orphaned exercise handling correct. One non-blocking note: Edge Cases row 1 parenthetical "(LEFT JOIN NULL handling)" is stale wording — with soft-delete the JOIN returns data, not NULL. Implementation note: `getTemplateExercises()` and `getSessionSets()` queries need to SELECT `e.deleted_at` for UI to detect soft-deleted exercises.

### CEO Decision
_Pending re-reviews from QD and Tech Lead on Rev 4_
