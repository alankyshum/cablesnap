# Feature Plan: Starter Workout Templates & Program

**Issue**: BLD-31 (TBD)
**Author**: CEO
**Date**: 2026-04-14
**Status**: APPROVED

## Problem Statement

After the Phase 22 Voltra pivot, CableSnap has 54 cable-machine exercises but **zero starter templates**. New users land on an empty Workouts tab with no guidance. They must manually browse 54 exercises, understand which ones pair well, and build templates from scratch — a high-friction onboarding that will cause drop-off.

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
- User-created templates appear FIRST in a "My Templates" section (users see their own content first)
- Starter templates appear BELOW in a "Starter Workouts" section with a section header
- "Full Body" starter has a "Recommended" chip/tag — the best starting point for beginners
- Each starter card shows:
  - `STARTER` chip (react-native-paper Chip, mode="flat", compact) in theme's tertiary color
  - Difficulty tag: "Beginner" or "Intermediate" (small text below name)
  - Estimated duration and exercise count: "~35 min · 6 exercises"
- Tap a starter → starts a workout (same as user templates)
- Overflow icon (three-dot menu) on each starter card → "Duplicate" action (NO long-press — avoids gesture inconsistency with user templates where long-press = delete)
- Starters are read-only — no edit/delete actions shown

**Workouts Tab — Programs Segment:**
- Starter program appears with the same `★ STARTER` badge
- Same interaction: tap to view, duplicate to customize
- Starter programs are read-only

**Empty State:**
- If no user-created templates exist, show starters only (no "My Templates" section header)
- If no starters and no user templates, show "Create your first template" CTA

**Navigation:**
- No new screens needed — starters use existing template/program detail views
- Detail views detect `is_starter` and hide edit/delete buttons

**Accessibility:**
- `STARTER` chip has accessibilityLabel="Starter template"
- Starter cards have accessibilityHint="Double-tap to start workout"
- When a starter has an active session, card has accessibilityState={{ busy: true }}
- Section headers have accessibilityRole="header"
- Duplicate action has accessibilityLabel="Duplicate template for editing"
- Starter detail view header has accessibilityLabel="Starter template, read-only. Duplicate to edit."
- All touch targets on starter cards >= 48dp

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

**Template 1: Full Body** (beginner, ~35 min)
- Goblet Squat (legs_glutes)
- Standing Chest Press (Handle) (chest)
- Seated Cable Row (back)
- Lateral Raises Two Arms (shoulders)
- Biceps Curls (arms)
- Abdominal Crunches (abs_core)
- 3 sets × 10-12 reps each, 60s rest

**Template 2: Upper Push** (intermediate, ~30 min)
- Incline Chest Press (chest)
- Standing Chest Press (Bar) (chest)
- Crossover Fly (chest)
- Front Raise (Handle) (shoulders)
- Lateral Raises One-arm (shoulders)
- Triceps Push-down (arms)
- 3 sets × 8-12 reps, 90s rest

**Template 3: Upper Pull** (intermediate, ~30 min)
- Wide Grip Lat Pull-down (back)
- Seated Cable Row (back)
- Face Pulls with External Rotation (shoulders)
- Straight Arm Lat Pull-down (back)
- Biceps Curls (Low Pulley) (arms)
- Hammer Curl (arms)
- 3 sets × 8-12 reps, 90s rest

**Template 4: Lower & Core** (intermediate, ~35 min)
- Goblet Squat (legs_glutes)
- Deadlift (legs_glutes)
- Reverse Lunges with Cable Pull (legs_glutes)
- Hip Extension (legs_glutes)
- Half Kneeling Chop (abs_core)
- Trunk Horizontal Rotations (abs_core)
- 3 sets × 10-12 reps, 60s rest

**Template 5: Arms & Shoulders** (beginner, ~25 min)
- Biceps Curls (arms)
- Triceps Push-down (arms)
- Hammer Curl (arms)
- High Pulley Overhead Triceps Extension (arms)
- Lateral Raises Two Arms (shoulders)
- Upright Rows (Bar) (shoulders)
- 3 sets × 10-15 reps, 60s rest

**Template 6: Core Strength** (intermediate, ~20 min)
- Abdominal Crunches (abs_core)
- Half Kneeling Chop (abs_core)
- Anti-rotational Supine Bicycle (abs_core)
- Trunk Horizontal Rotations (abs_core)
- Squat with Rotational Force (abs_core)
- High Row (abs_core)
- 3 sets × 12-15 reps, 45s rest

#### 3. Starter Program Data

**Program: Push/Pull/Legs** (intermediate, 3-day cycle)
- Day 1 "Push": uses Template 2 (Upper Push)
- Day 2 "Pull": uses Template 3 (Upper Pull)
- Day 3 "Legs & Core": uses Template 4 (Lower & Core)

#### 4. Seeding Logic (lib/db.ts)

In `initDatabase()`, after exercise seeding:
1. Check `starter_version` in a settings/meta table (or app_settings key-value): `SELECT value FROM app_settings WHERE key = 'starter_version'`
2. If no entry or version < current (e.g., `1`), seed/update starter templates
3. Use a deterministic ID scheme: `starter-tpl-{N}` for templates, `starter-prog-1` for the program
4. Wrap seeding in `withTransactionAsync()`
5. Template exercise IDs: `starter-te-{templateN}-{exerciseSlug}` (content-based, not position-based)
6. After seeding, `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('starter_version', '1')`
7. Use fixed historical timestamp for `created_at`/`updated_at` (e.g., `0` epoch) so starters don't mix with user templates in date-based views
8. Note: `app_settings` table may need creation: `CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)`

#### 5. Query Changes

- `getTemplates()`: Add `ORDER BY is_starter ASC, created_at DESC` — user templates first, starters last
- `getPrograms()`: Same ordering
- Both queries return `is_starter` field

#### 6. UI Changes

**app/(tabs)/index.tsx:**
- Group templates into user-created vs starters using `is_starter`
- Add section header "My Templates" (first) and "Starter Workouts" (second) when both exist
- "Full Body" starter gets an additional "Recommended" chip
- Starter cards show `STARTER` Chip (react-native-paper Chip component, mode="flat", compact)
- Starter cards show difficulty tag ("Beginner" / "Intermediate") and duration ("~35 min · 6 exercises")
- Starter cards: hide delete button, hide edit navigation
- Starter cards: show overflow icon (three-dot IconButton) with "Duplicate" action (NO long-press)

**app/template/[id].tsx (detail/edit):**
- If `is_starter`: hide edit controls (reorder, add/remove exercise), show "Duplicate to Edit" button
- Duplicate: call `duplicateTemplate(id)` → creates copy with `is_starter = 0`, name without "Voltra" prefix, navigates to the copy's edit view with name field focused for immediate rename

**app/program/[id].tsx:**
- If `is_starter`: hide edit controls, show "Duplicate to Edit" button

#### 7. New DB Functions

```typescript
// Duplicate a template (including all exercises, generating new link_ids for groups)
async function duplicateTemplate(id: string): Promise<string>

// Duplicate a program — also duplicates all referenced starter templates
// Each day's template reference is replaced with a new editable copy
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
- `app_settings` table for starter version tracking
- Visual distinction in list view (STARTER chip + difficulty tag + duration)
- "Recommended" highlight on Full Body template
- Read-only mode for starters
- Duplicate action via overflow menu (creates editable copy)
- Duplicate focuses name field for immediate rename
- Program duplicate also duplicates referenced starter templates
- Seeding during database init (version-based, idempotent)
- Defense-in-depth: `is_starter` guard on delete functions

**Out of Scope:**
- Template categories/tags (future phase)
- Community/shared templates
- Template preview (exercise list preview without navigating)
- Hide/unhide starters (defer — low priority)
- Voltra training mode selection per exercise in templates (future phase)
- Excluding starters from export (nice-to-have, defer)

### Acceptance Criteria

- [ ] Fresh install shows 6 starter templates in Workouts → Templates
- [ ] Fresh install shows 1 starter program in Workouts → Programs
- [ ] Starter templates display `STARTER` chip (react-native-paper Chip, not ★ text)
- [ ] Starter cards show difficulty level ("Beginner" / "Intermediate")
- [ ] Starter cards show estimated duration ("~35 min · 6 exercises")
- [ ] "Full Body" starter has a "Recommended" indicator
- [ ] Starter program displays `STARTER` chip
- [ ] Tapping a starter template starts a workout (existing flow works)
- [ ] Starter template detail view shows exercises but hides edit controls
- [ ] "Duplicate" via overflow menu creates an editable copy with is_starter=0
- [ ] After duplicate, navigates to edit view with name field focused
- [ ] Duplicating a program also duplicates its referenced starter templates
- [ ] User-created templates appear ABOVE starters in the list
- [ ] Starters cannot be deleted or edited (UI + DB guard)
- [ ] Existing user data (templates, programs) is preserved during migration
- [ ] Re-opening app does not re-seed starters (version-based idempotent check)
- [ ] Starter PPL program links to the correct starter templates
- [ ] Starter cards have accessibilityHint="Double-tap to start workout"
- [ ] npx tsc --noEmit passes with zero errors
- [ ] All existing tests pass
- [ ] Screen reader announces "Starter template" for chip

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| User duplicates a starter template | New template created with `is_starter=0`, clean name (no prefix), edit view opens with name focused |
| User duplicates a starter program | Program duplicated AND all referenced starter templates duplicated as editable copies |
| User deletes a duplicated template | Normal delete — does not affect the original starter |
| Attempt to delete a starter directly | DB guard (`WHERE is_starter = 0`) prevents deletion; UI hides delete button |
| Starter exercise was soft-deleted | Shows (removed) suffix like any other template exercise |
| Migration on existing install with templates | Existing templates get `is_starter=0` (DEFAULT), starters seeded fresh |
| Database reset / fresh install | All 6 starters + 1 program seeded, starter_version set to 1 |
| Starter program day references | Days reference starter template IDs (deterministic) |
| Future v2 adds Template 7 | Increment starter_version → seeding runs again, INSERT OR IGNORE preserves existing starters |
| Starters appear in export | Included (acceptable — deterministic IDs + INSERT OR IGNORE handles re-import) |

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
**Verdict: APPROVED** (Rev 2, 2026-04-14)

Rev 1: NEEDS REVISION — 5 Critical items, 8 Major recommendations.
Rev 2: APPROVED — All 5 Critical and 8 Major items addressed and verified.

Remaining minor note: [m-UX-10] High Row in Core Strength is primarily a back exercise — not blocking.

### Tech Lead (Technical Feasibility)
**Verdict: APPROVED** — Technically sound, well-scoped, follows established patterns.

Architecture fit: Fully compatible. `is_starter` column follows `is_custom`/`is_voltra`/`deleted_at` precedent. Deterministic IDs prevent collision. Separate `starter-templates.ts` file is clean.

Complexity: Medium (~8 files, ~400 lines). Risk: Low. No new dependencies.

Recommendations for implementer:
1. Use explicit `voltra-NNN` IDs in starter-templates.ts — do not rely on name-based lookups
2. Add `is_starter` guard to `deleteTemplate()` / `softDeleteProgram()` as defense-in-depth
3. Consider excluding starters from `exportAllData()` output
4. Handle `link_id`/`link_label` generically in `duplicateTemplate()`

### CEO Decision
**APPROVED** (2026-04-14) — Both reviewers approved. Proceeding to implementation.
