# Feature Plan: Volta Training Mode Selection & Eccentric Tracking (Phase 30)

**Issue**: BLD-81
**Author**: CEO
**Date**: 2026-04-14
**Status**: DRAFT

## Problem Statement

Board goal #1 competitive edge: "Beyond Power Volta 1... eccentric muscle training is the killer feature. This workout app will fully leverage those unique features and build programs around it."

The data model already supports `training_modes` on exercises (e.g., `eccentric_overload`, `isokinetic`, `band`, `custom_curves`), and Phase 29 added Volta badges to the exercise library. However, **none of this reaches the workout session UI**. When a user starts a workout with Volta exercises, there is:

- No way to select which training mode they're using (weight, eccentric overload, band, etc.)
- No way to log tempo (critical for eccentric training — e.g., "3-1-5-1")
- No training mode stored in `workout_sets` — all sets are implicitly "weight" mode
- No training mode shown in session history or summaries

This is the gap between "Volta exercises exist" and "the app actually helps you train with eccentric overload." Closing it makes FitForge the **only** workout app with native Volta eccentric training support.

## User Stories

- As a Volta 1 owner, I want to select my training mode (e.g., "Eccentric Overload") when logging sets so my workout data reflects how I'm actually training
- As a user doing eccentric training, I want to record tempo (e.g., 3-1-5-1) per set so I can track my eccentric progression
- As a user reviewing past workouts, I want to see which training mode I used per set so I can compare performance across modes
- As a Volta 1 owner browsing my exercise library, I want to understand what each training mode means so I can choose the right one

## Proposed Solution

### Overview

Add training mode selection to the workout session screen for Volta exercises. When a user is logging sets for a Volta exercise, a mode selector appears showing the exercise's available training modes. The selected mode is stored per-set and displayed in history views.

### UX Design

#### In-Session Training Mode Selection

For exercises where `is_voltra === true` and `training_modes.length > 1`:

1. **Mode selector row**: Below the exercise group header, show a horizontal row of chips representing available training modes. Default to "weight" (standard mode).
2. **Chip appearance**: Use the same chip style as RPE chips (already in session UI). Active chip uses `primary` color; inactive chips are `outline` style.
3. **Mode persistence**: Selected mode applies to all NEW sets added for that exercise in this session. Existing completed sets retain their recorded mode.
4. **Mode badge on completed sets**: Show a small badge (e.g., "ECC" for eccentric_overload) on completed set rows to indicate which mode was used.

#### Tempo Input (Eccentric Mode Only)

When `eccentric_overload` mode is selected:

1. **Tempo field**: Show an optional text field below the mode selector with placeholder "Tempo (e.g. 3-1-5-1)"
2. **Format**: Free-text, user types tempo notation. No validation beyond max length (15 chars).
3. **Per-set storage**: Tempo is stored on the set row (same as RPE and notes).
4. **Display in history**: Show tempo next to set details when viewing past eccentric sets.

#### Mode Labels

Use short, readable labels for training modes:

| Mode Key | Display Label | Short Label | Description |
|----------|--------------|-------------|-------------|
| `weight` | Standard | STD | Normal cable weight resistance |
| `eccentric_overload` | Eccentric | ECC | Slow eccentric phase with overload |
| `band` | Band | BND | Resistance band mode |
| `damper` | Damper | DMP | Damper resistance mode |
| `isokinetic` | Isokinetic | ISO | Constant speed resistance |
| `isometric` | Isometric | ISOM | Static hold mode |
| `custom_curves` | Custom | CRV | Custom resistance curve |
| `rowing` | Rowing | ROW | Rowing movement mode |

#### Navigation and Flow

- No new screens. All changes are within the existing session screen (`app/session/[id].tsx`) and session detail/summary screens.
- Mode selector only appears for Volta exercises with multiple training modes.
- Non-Volta exercises see no UI changes.

#### Accessibility

- Mode chips must have `accessibilityRole="radio"` and `accessibilityState={{ selected: true/false }}`
- Mode selector row needs `accessibilityLabel="Training mode selector for {exercise name}"`
- Tempo field needs `accessibilityLabel="Tempo notation, for example 3 1 5 1"`
- Screen reader announces mode changes: "Switched to Eccentric mode"

### Technical Approach

#### Schema Changes

Add columns to `workout_sets`:

```sql
ALTER TABLE workout_sets ADD COLUMN training_mode TEXT DEFAULT NULL;
ALTER TABLE workout_sets ADD COLUMN tempo TEXT DEFAULT NULL;
```

- `training_mode`: One of the `TrainingMode` values (or NULL for legacy/non-Volta sets, treated as "weight")
- `tempo`: Free-text tempo notation (e.g., "3-1-5-1"), NULL if not set

Migration: standard PRAGMA table_info guard pattern (already established in codebase).

#### Data Flow

1. **Session load**: When loading exercise groups, also load each exercise's `training_modes` and `is_voltra` flag
2. **Mode state**: Track selected mode per exercise group in component state: `Record<string, TrainingMode>`
3. **Set creation**: When `addSet` is called, pass the currently selected training mode and tempo
4. **Set display**: When rendering completed sets, read `training_mode` and `tempo` from the set row
5. **Export/Import**: Add `training_mode` and `tempo` to CSV export and import (existing export infra)

#### DB Functions to Add/Modify

- `addSet()`: Add `trainingMode?: TrainingMode` and `tempo?: string` parameters
- `getSessionSets()`: Already returns all columns; just need to include new columns in the type
- `updateSetTempo()`: New function for updating tempo on a set
- Export/import functions: Include new columns

#### Type Changes

Add to `WorkoutSet` type:
```typescript
training_mode?: TrainingMode | null;
tempo?: string | null;
```

#### No New Dependencies

All changes use existing React Native Paper chips (same as RPE chips) and TextInput. No new libraries needed.

### Scope

**In Scope:**
- Training mode selector chips for Volta exercises in session UI
- Training mode stored per-set in `workout_sets`
- Tempo text field for eccentric overload mode
- Mode badge on completed set rows in session
- Mode display in session detail screen
- Mode display in session summary screen
- Schema migration (2 new columns)
- Export/import support for new columns
- Full accessibility for all new interactions

**Out of Scope:**
- Automated tempo timer/metronome (Phase 31+)
- Mode-specific workout programs (Phase 31+)
- Eccentric split weight tracking (concentric vs eccentric different weights)
- Training mode analytics/charts (Phase 31+)
- Training mode filters in history screen
- Mode-specific rest timer adjustments
- Visual tempo animation during set execution

### Acceptance Criteria

- [ ] Given a Volta exercise with multiple training modes, When the user is in an active session, Then a training mode selector row appears below the exercise group header
- [ ] Given the user selects "Eccentric" mode, When they add a new set, Then the set is stored with `training_mode = 'eccentric_overload'`
- [ ] Given the user is in "Eccentric" mode, When the mode selector is active, Then a tempo text field appears with placeholder "Tempo (e.g. 3-1-5-1)"
- [ ] Given the user enters tempo "3-1-5-1" and completes a set, When viewing the set in session detail, Then the tempo is displayed alongside weight/reps
- [ ] Given a non-Volta exercise, When the user is in an active session, Then no training mode selector appears
- [ ] Given a Volta exercise with only one training mode (["weight"]), When the user is in session, Then no training mode selector appears (nothing to choose)
- [ ] Given completed sets with different training modes, When viewing session summary, Then each set shows its mode badge (e.g., "ECC", "BND")
- [ ] Given a legacy session (before migration), When viewing its detail, Then sets show no mode badge (NULL treated as implicit "weight")
- [ ] Given the user exports data, When the export includes sets with training modes, Then the CSV includes training_mode and tempo columns
- [ ] All existing 294+ tests pass with no regressions
- [ ] No new lint warnings
- [ ] All new UI elements are accessible (screen reader compatible)

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Exercise has only ["weight"] mode | No mode selector shown — standard behavior |
| Exercise has no training_modes (null) | No mode selector shown — standard behavior |
| Non-Volta exercise | No mode selector — selector only for is_voltra exercises |
| User switches mode mid-session | Existing completed sets keep their original mode; new sets use new mode |
| Tempo field with empty input | Store NULL (not empty string) |
| Tempo field with very long input | Max 15 chars enforced |
| Legacy sets (pre-migration, NULL mode) | Display as standard (no badge), no crash |
| Import data with unknown training_mode | Ignore unknown modes, store as NULL |
| Screen resize / tablet | Chip row wraps naturally (flexWrap) |
| Dark mode | Chips use theme colors (already handled by Paper) |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Session screen is already 1154 lines | High | Medium | Extract mode selector as separate component |
| Migration adds nullable columns | Low | Low | Standard PRAGMA guard; NULL = no mode (backward compatible) |
| Chip row takes vertical space | Medium | Low | Only shown for Volta exercises with multiple modes |
| User confusion about training modes | Medium | Medium | Add brief description tooltip on mode chips |

## Review Feedback

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
