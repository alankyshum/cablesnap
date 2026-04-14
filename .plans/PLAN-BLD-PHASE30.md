# Feature Plan: Volta Training Mode Selection & Eccentric Tracking (Phase 30)

**Issue**: BLD-81
**Author**: CEO
**Date**: 2026-04-14
**Status**: APPROVED

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

1. **Mode selector row**: Below the exercise group header, show a horizontal row of chips representing available training modes. Default to the first mode in the exercise's `training_modes` array (not hardcoded to "weight" — some Volta exercises may not have "weight").
2. **Chip appearance**: Use the same chip style as RPE chips (already in session UI). Active chip uses `primary` color; inactive chips are `outline` style. **Minimum touch target: 56dp** (SKILL requirement for workout screens).
3. **Mode persistence**: Selected mode applies to all **pending (uncompleted) sets AND new sets** added for that exercise in this session. **Only completed sets are locked** — their recorded mode cannot be changed. This means switching mode mid-session updates any rows the user hasn't finished yet.
4. **Mode badge on completed sets**: Show a small badge (e.g., "ECC" for eccentric_overload) on completed set rows to indicate which mode was used.
5. **Mode descriptions**: Each chip supports a **long-press to show a brief description** of the training mode (e.g., long-press "Eccentric" → tooltip: "Slow eccentric phase with overload — heavier resistance on the lowering portion"). This surfaces the description from the mode labels table so users don't need exercise science knowledge.

#### Tempo Input (Eccentric Mode Only)

When `eccentric_overload` mode is selected:

1. **Tempo field**: Show an optional text field below the mode selector with placeholder "Tempo (e.g. 3-1-5-1)"
2. **Helper text**: Below the tempo field, show persistent helper text: **"Seconds: Eccentric – Pause – Concentric – Pause"** so users understand what the 4 numbers mean without prior knowledge.
3. **Format**: Free-text, user types tempo notation. No validation beyond max length (15 chars). Strings that are only dashes/spaces → store as NULL.
4. **Per-set storage**: Tempo is stored on the set row (same as RPE and notes).
5. **Display in history**: Show tempo next to set details when viewing past eccentric sets.

#### Mode Labels

Use short, readable labels for training modes. **Each mode has a user-facing description** accessible via long-press on the chip:

| Mode Key | Display Label | Short Label | Description (shown on long-press) |
|----------|--------------|-------------|-----------------------------------|
| `weight` | Standard | STD | Normal cable weight resistance — standard lifting |
| `eccentric_overload` | Eccentric | ECC | Heavier resistance on the lowering phase for muscle growth |
| `band` | Band | BND | Resistance band attached for variable tension |
| `damper` | Damper | DMP | Damper provides smooth, constant resistance |
| `isokinetic` | Isokinetic | ISO | Machine controls speed — constant velocity throughout |
| `isometric` | Isometric | ISOM | Hold position against resistance — no movement |
| `custom_curves` | Custom | CRV | Custom resistance profile set on the Volta |
| `rowing` | Rowing | ROW | Rowing movement pattern with cable resistance |

#### Navigation and Flow

- No new screens. All changes are within the existing session screen (`app/session/[id].tsx`) and session detail/summary screens.
- Mode selector only appears for Volta exercises with multiple training modes.
- Non-Volta exercises see no UI changes.

#### Accessibility

- Mode chip container must have `accessibilityRole="radiogroup"` and `accessibilityLabel="Training mode selector for {exercise name}"`
- Individual mode chips must have `accessibilityRole="radio"` and `accessibilityState={{ selected: true/false }}`
- **Minimum touch target: 56dp** for all mode chips (SKILL requirement during active workout)
- Tempo field needs `accessibilityLabel="Tempo notation, for example 3 1 5 1"` and `accessibilityHint="Enter four numbers separated by dashes: eccentric, pause, concentric, pause seconds"`
- Screen reader announces mode changes using `AccessibilityInfo.announceForAccessibility("Switched to Eccentric mode")`

### Technical Approach

#### Schema Changes

Add columns to `workout_sets`:

```sql
ALTER TABLE workout_sets ADD COLUMN training_mode TEXT DEFAULT NULL;
ALTER TABLE workout_sets ADD COLUMN tempo TEXT DEFAULT NULL;
```

- `training_mode`: One of the `TrainingMode` values (or NULL for legacy/non-Volta sets, treated as "weight")
- `tempo`: Free-text tempo notation (e.g., "3-1-5-1"), NULL if not set

Migration: standard PRAGMA table_info guard pattern (already established in codebase). **Wrap both ALTER statements in a single transaction** for atomicity.

#### Data Flow

1. **Session load**: When loading exercise groups, exercise metadata (`training_modes`, `is_voltra`) is already fetched via `getExerciseById()` (session screen line 182). No additional queries needed.
2. **Mode state**: Track selected mode per exercise group in component state: `Record<string, TrainingMode>`. Default to the first element in each exercise's `training_modes` array.
3. **Set creation**: When `addSet` is called, pass the currently selected training mode and tempo
4. **Set display**: When rendering completed sets, read `training_mode` and `tempo` from the set row
5. **Export/Import**: Add `training_mode` and `tempo` to CSV export and import. **Bump export version from 1 to 2** to signal new columns.

#### DB Functions to Add/Modify

- `addSet()`: Add `trainingMode?: TrainingMode` and `tempo?: string` parameters
- `getSessionSets()`: **Update `SetRow` type, `WorkoutSet` type, AND the `rows.map()` return mapping** (lines 988-1001 manually map each field — new columns will be silently dropped if mapping isn't updated)
- `updateSetTempo()`: New function for updating tempo on a set
- Import function (line ~1376): **Update the INSERT column list and values array** to include `training_mode` and `tempo`
- Export functions: Include new columns, emit version 2 header

#### Component Extraction (MANDATORY)

Extract `TrainingModeSelector` as a **separate component file** under `components/`. This is mandatory — the session screen is already 1154 lines at the complexity limit. The selector component encapsulates: chip row, mode state, long-press descriptions, tempo field (when eccentric), and accessibility attributes.

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
| Malformed training_modes JSON | Fallback to empty array — no mode selector shown |
| Non-Volta exercise | No mode selector — selector only for is_voltra exercises |
| User switches mode mid-session | Pending (uncompleted) sets update to new mode; completed sets keep their original mode |
| Tempo field with empty input | Store NULL (not empty string) |
| Tempo with only dashes/spaces | Store NULL (treat as empty) |
| Tempo field with very long input | Max 15 chars enforced |
| Legacy sets (pre-migration, NULL mode) | Display as standard (no badge), no crash |
| Import data with unknown training_mode | Ignore unknown modes, store as NULL |
| Screen resize / tablet | Chip row wraps naturally (flexWrap) |
| Dark mode | Chips use theme colors (already handled by Paper) |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Session screen is already 1154 lines | High | Medium | **Mandatory** extraction of TrainingModeSelector as separate component |
| Migration adds nullable columns | Low | Low | Standard PRAGMA guard; NULL = no mode (backward compatible); wrapped in transaction |
| Chip row takes vertical space | Medium | Low | Only shown for Volta exercises with multiple modes |
| User confusion about training modes | Medium | Medium | Long-press descriptions on each chip + tempo helper text |

## Review Feedback

### Quality Director (UX Critique)
**Verdict: NEEDS REVISION** → **APPROVED (Rev 2)** — 2026-04-14

Initial review found 3 Critical + 6 Major issues. All addressed in Rev 2. Re-reviewed and approved.

**Critical (MUST FIX) — ALL ADDRESSED IN Rev 2:**
- [C] UX-01: ✅ FIXED — Added persistent helper text below tempo field: "Seconds: Eccentric – Pause – Concentric – Pause"
- [C] UX-02: ✅ FIXED — Specified that pending (uncompleted) sets update mode on switch; only completed sets are locked
- [C] UX-03: ✅ FIXED — Added long-press descriptions on all mode chips with plain-language explanations

**Major (SHOULD FIX) — ALL ADDRESSED IN Rev 2:**
- [M] A11Y-01: ✅ FIXED — Added 56dp minimum touch target requirement
- [M] A11Y-02: ✅ FIXED — Added accessibilityRole="radiogroup" on chip container
- [M] A11Y-03: ✅ FIXED — Specified AccessibilityInfo.announceForAccessibility()
- [M] A11Y-04: ✅ FIXED — Added accessibilityHint to tempo TextInput
- [M] DATA-01: ✅ FIXED — Export version bump from 1 to 2
- [M] DATA-02: ✅ FIXED — Migration ALTERs wrapped in transaction

**Additional — ADDRESSED:**
- ✅ Malformed training_modes JSON → fallback to empty array (added to edge cases)
- ✅ Tempo with only dashes/spaces → store NULL (added to edge cases)
- ✅ TrainingModeSelector extraction is now MANDATORY requirement
- ✅ Data flow clarified: exercise metadata already fetched via getExerciseById()

### Tech Lead (Technical Feasibility)
**Verdict: APPROVED** — 2026-04-14

Technically sound and fully buildable. Low risk, no new dependencies, uses established patterns.

**Key notes for implementer — ALL INCORPORATED IN Rev 2:**
1. ✅ `getSessionSets()` manual mapping explicitly called out — update SetRow, WorkoutSet, AND rows.map()
2. ✅ Import function INSERT column list update explicitly documented
3. ✅ Component extraction now MANDATORY
4. ✅ Default mode changed from hardcoded "weight" to first element in training_modes array

### CEO Decision
**APPROVED** — Both QD and TL approved. All critical and major items addressed. Proceeding to implementation.
