# Feature Plan: Starter Workout Templates & Program

**Issue**: BLD-31 (TBD)
**Author**: CEO
**Date**: 2026-04-14
**Status**: DRAFT

## Problem Statement

After the Phase 22 Voltra pivot, FitForge has 54 cable-machine exercises but **zero starter templates**. New users land on an empty Workouts tab with no guidance. They must manually browse 54 exercises, understand which ones pair well, and build templates from scratch — a high-friction onboarding that will cause drop-off.

Starter templates solve this by giving users curated, ready-to-use workouts from day one. A starter program (multi-day split) further reduces friction by letting users just tap "Start Next Workout" without any setup.

## User Stories

- As a new Voltra user, I want pre-built workout templates so I can start training immediately without building my own.
- As a new user, I want a structured multi-day program so I can follow a training split without planning one myself.
- As an experienced user, I want to duplicate a starter template so I can customize it to my preferences while keeping a good foundation.

## Proposed Solution

### Overview

Seed 6 starter workout templates and 1 starter program into the database during initialization. Show them in the existing Workouts tab UI with a visual distinction (badge/label) from user-created templates. Users can start workouts from starters directly, or duplicate them to create editable copies.

### UX Design

**Workouts Tab — Templates Segment:**
- Starter templates appear first, in a "Starter" section with a section header
- Each starter card shows a `★ STARTER` chip/badge in the theme's tertiary color
- Tap a starter → starts a workout (same as user templates)
- Long-press or overflow menu → "Duplicate" (creates editable copy) and "Hide" (removes from view)
- Starters are read-only — no edit/delete actions shown
- User-created templates appear below in a "My Templates" section

**Workouts Tab — Programs Segment:**
- Starter program appears with the same `★ STARTER` badge
- Same interaction: tap to view, duplicate to customize
- Starter programs are read-only

**Empty State:**
- If no user-created templates exist, show only starters (no "My Templates" section header)
- If starters are hidden and no user templates exist, show "Create your first template" CTA

**Navigation:**
- No new screens needed — starters use existing template/program detail views
- Detail views detect `is_starter` and hide edit/delete buttons

**Accessibility:**
- `★ STARTER` badge has accessibilityLabel="Starter template"
- Section headers have accessibilityRole="header"
- Duplicate action has accessibilityLabel="Duplicate template for editing"

### Technical Approach

#### 1. Schema Changes (lib/db.ts)

Add `is_starter` column to `workout_templates` and `programs` tables:

```sql
ALTER TABLE workout_templates ADD COLUMN is_starter INTEGER DEFAULT 0;
ALTER TABLE programs ADD COLUMN is_starter INTEGER DEFAULT 0;
```

Migration pattern: PRAGMA table_info check (existing pattern), then ALTER TABLE.

#### 2. Starter Template Data (lib/starter-templates.ts)

Create a new file `lib/starter-templates.ts` with 6 curated templates:

**Template 1: Voltra Full Body** (beginner, ~35 min)
- Goblet Squat (legs_glutes)
- Standing Chest Press (Handle) (chest)
- Seated Cable Row (back)
- Lateral Raises Two Arms (shoulders)
- Biceps Curls (arms)
- Abdominal Crunches (abs_core)
- 3 sets × 10-12 reps each, 60s rest

**Template 2: Voltra Upper Push** (intermediate, ~30 min)
- Incline Chest Press (chest)
- Standing Chest Press (Bar) (chest)
- Crossover Fly (chest)
- Front Raise (Handle) (shoulders)
- Lateral Raises One-arm (shoulders)
- Triceps Push-down (arms)
- 3 sets × 8-12 reps, 90s rest

**Template 3: Voltra Upper Pull** (intermediate, ~30 min)
- Wide Grip Lat Pull-down (back)
- Seated Cable Row (back)
- Face Pulls with External Rotation (shoulders)
- Straight Arm Lat Pull-down (back)
- Biceps Curls (Low Pulley) (arms)
- Hammer Curl (arms)
- 3 sets × 8-12 reps, 90s rest

**Template 4: Voltra Lower & Core** (intermediate, ~35 min)
- Goblet Squat (legs_glutes)
- Deadlift (legs_glutes)
- Reverse Lunges with Cable Pull (legs_glutes)
- Hip Extension (legs_glutes)
- Half Kneeling Chop (abs_core)
- Trunk Horizontal Rotations (abs_core)
- 3 sets × 10-12 reps, 60s rest

**Template 5: Voltra Arms & Shoulders** (beginner, ~25 min)
- Biceps Curls (arms)
- Triceps Push-down (arms)
- Hammer Curl (arms)
- High Pulley Overhead Triceps Extension (arms)
- Lateral Raises Two Arms (shoulders)
- Upright Rows (Bar) (shoulders)
- 3 sets × 10-15 reps, 60s rest

**Template 6: Voltra Core Strength** (intermediate, ~20 min)
- Abdominal Crunches (abs_core)
- Half Kneeling Chop (abs_core)
- Anti-rotational Supine Bicycle (abs_core)
- Trunk Horizontal Rotations (abs_core)
- Squat with Rotational Force (abs_core)
- High Row (abs_core)
- 3 sets × 12-15 reps, 45s rest

#### 3. Starter Program Data

**Program: Voltra Push/Pull/Legs** (intermediate, 3-day cycle)
- Day 1 "Push": uses Template 2 (Upper Push)
- Day 2 "Pull": uses Template 3 (Upper Pull)
- Day 3 "Legs & Core": uses Template 4 (Lower & Core)

#### 4. Seeding Logic (lib/db.ts)

In `initDatabase()`, after exercise seeding:
1. Check if starter templates exist: `SELECT COUNT(*) FROM workout_templates WHERE is_starter = 1`
2. If count is 0, seed all 6 starter templates + 1 program
3. Use a deterministic ID scheme: `starter-tpl-{N}` for templates, `starter-prog-1` for the program
4. Wrap seeding in `withTransactionAsync()`
5. Template exercise IDs: `starter-te-{templateN}-{exercisePosition}`

#### 5. Query Changes

- `getTemplates()`: Add `ORDER BY is_starter DESC, created_at DESC` — starters sort first
- `getPrograms()`: Same ordering
- Both queries return `is_starter` field

#### 6. UI Changes

**app/(tabs)/index.tsx:**
- Group templates into starters vs user-created using `is_starter`
- Add section header "Starter Workouts" and "My Templates" when both exist
- Starter cards show `★ STARTER` Chip (react-native-paper Chip component, mode="flat", compact)
- Starter cards: hide delete button, hide edit navigation
- Add "Duplicate" action to starter card overflow menu

**app/template/[id].tsx (detail/edit):**
- If `is_starter`: hide edit controls (reorder, add/remove exercise), show "Duplicate to Edit" button
- Duplicate: call `duplicateTemplate(id)` → creates copy with `is_starter = 0`, navigates to the copy

**app/program/[id].tsx:**
- If `is_starter`: hide edit controls, show "Duplicate to Edit" button

#### 7. New DB Functions

```typescript
// Duplicate a template (including all exercises)
async function duplicateTemplate(id: string): Promise<string>

// Duplicate a program (including days and template references)
async function duplicateProgram(id: string): Promise<string>
```

#### 8. Type Updates (lib/types.ts)

Add to `WorkoutTemplate`:
```typescript
is_starter?: boolean;
```

Add to `Program`:
```typescript
is_starter?: boolean;
```

### Scope

**In Scope:**
- 6 starter workout templates with exercise assignments
- 1 starter program (PPL 3-day)
- `is_starter` column on templates and programs
- Visual distinction in list view (badge)
- Read-only mode for starters
- Duplicate action (creates editable copy)
- Seeding during database init

**Out of Scope:**
- Template categories/tags (future phase)
- Community/shared templates
- Template difficulty ratings in list view
- Workout duration estimates
- Template preview (exercise list preview without navigating)
- Hide/unhide starters (defer — low priority)
- Voltra training mode selection per exercise in templates (future phase)

### Acceptance Criteria

- [ ] Fresh install shows 6 starter templates in Workouts → Templates
- [ ] Fresh install shows 1 starter program in Workouts → Programs
- [ ] Starter templates display `★ STARTER` badge
- [ ] Starter program displays `★ STARTER` badge
- [ ] Tapping a starter template starts a workout (existing flow works)
- [ ] Starter template detail view shows exercises but hides edit controls
- [ ] "Duplicate" creates an editable copy with is_starter=0
- [ ] User-created templates appear below starters in the list
- [ ] Starters cannot be deleted or edited
- [ ] Existing user data (templates, programs) is preserved during migration
- [ ] Re-opening app does not re-seed starters (idempotent check)
- [ ] Starter PPL program links to the correct starter templates
- [ ] npx tsc --noEmit passes with zero errors
- [ ] All existing tests pass
- [ ] Screen reader announces "Starter template" for badge

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| User duplicates a starter | New template created with `is_starter=0`, name suffixed " (copy)" |
| User deletes a duplicated starter | Normal delete — does not affect the original starter |
| Starter exercise was soft-deleted | Shows (removed) suffix like any other template exercise |
| Migration on existing install with templates | Existing templates get `is_starter=0` (DEFAULT), starters seeded fresh |
| Database reset / fresh install | All 6 starters + 1 program seeded |
| Starter program day references | Days reference starter template IDs (deterministic) |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Starter template IDs collide with user data | Low | High | Use `starter-` prefix for all IDs |
| Exercise IDs change in future migration | Low | Med | Reference exercises by ID (deterministic from seed) |
| Too many starters clutter the list | Low | Low | Only 6 templates — reasonable. Can add hide later |
| Starters feel generic/unhelpful | Med | Med | Curated with proper exercise pairing, balanced muscle groups |

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
