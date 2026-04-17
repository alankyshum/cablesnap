# Feature Plan: Dropset & Set Type Annotation (Phase 46)

**Issue**: BLD-TBD (PLAN)
**Author**: CEO
**Date**: 2026-04-17
**Status**: DRAFT

## Problem Statement

Users currently have only two set classifications: warm-up and working. This lacks the vocabulary to describe common advanced training techniques. Specifically:

1. **Dropsets** — a lifter finishes a set, immediately reduces weight, and does another set with no rest. These are tracked as separate sets but the second/third sets at lower weight appear as "regression" in history, creating false negatives in progress tracking.

2. **Failure sets** — a lifter intentionally trains to muscular failure. Marking these explicitly helps distinguish "I chose to fail" from "I couldn't complete my target reps." This matters for fatigue management and deload decisions.

3. **Analytics confusion** — without set type context, comparing sessions is misleading. A session with 3 working sets + 2 dropsets looks like a session with 5 working sets at inconsistent weights.

**Competitive context:** Strong, HEVY, and JEFIT all support dropset tagging. This is table stakes for apps targeting intermediate/advanced lifters.

## User Stories

- As a lifter, I want to mark a set as a dropset so my history shows the intentional weight reduction
- As a lifter, I want to mark a set as taken to failure so I can track fatigue and recovery needs
- As a lifter reviewing history, I want to see which sets were dropsets/failure sets to understand workout intensity
- As a lifter, I want dropsets to count toward volume but not trigger false "weight decreased" warnings

## Proposed Solution

### Overview

Extend the existing `is_warmup` boolean with a `set_type` column on `workout_sets`. Valid types: `normal` (default), `warmup`, `dropset`, `failure`. The `is_warmup` column is preserved for backward compatibility but `set_type` becomes the source of truth. UI shows a cycle-through chip on the set number area (same touch target as warm-up toggle).

### UX Design

#### Session Screen (app/session/[id].tsx)

**Approach: Cycle-through toggle on set number area (extending Phase 45 pattern)**

The existing warm-up toggle (tap set number area) is extended to cycle through set types:

- **Normal (default)**: Set number shows normally, no badge. This is the starting state.
- **Warm-up**: "W" chip (existing Phase 45 styling — `surfaceVariant` background, circular 28dp)
- **Dropset**: "D" chip (same shape/size as "W" chip, `tertiaryContainer` background, `onTertiaryContainer` text)
- **Failure**: "F" chip (same shape/size, `errorContainer` background, `onErrorContainer` text)

Tap cycle order: normal → warmup → dropset → failure → normal

The left border accent (3dp) color changes per type:
- Normal: no border
- Warm-up: `surfaceVariant` (existing)
- Dropset: `tertiaryContainer`
- Failure: `errorContainer`

All styling uses MD3 theme tokens only — no hardcoded colors.

**Accessibility:**
- `accessibilityRole="button"` (changed from `switch` since it's no longer binary)
- `accessibilityLabel`: "Set N, [type] set" (e.g., "Set 3, dropset")
- `accessibilityHint`: "Double tap to cycle set type: normal, warm-up, dropset, failure"
- `accessibilityActions` with named actions for each type, supporting direct type selection

**First-use education:**
- Reuse the existing `warmup_tooltip_shown` pattern. Add `set_type_tooltip_shown` flag.
- On first non-warmup type selection, show Snackbar: "Dropsets count toward volume. Failure sets help track intensity."
- One-time only.

**Haptic feedback:** Selection haptic on each cycle step (existing pattern from warm-up toggle if present).

#### Session Summary (app/session/summary/[id].tsx)

Update stats to show set breakdown:
- "X working · Y warm-up · Z dropset · W failure" (only show types with count > 0)
- Volume calculation: working + dropset + failure sets contribute. Warm-up excluded (existing).

#### Session Detail (app/session/detail/[id].tsx)

- Show type badge ("W"/"D"/"F") matching session screen styling
- Repeat Workout: set types are carried over to the new session

#### Exercise History (app/exercise/[id].tsx)

- Show set type badges in the per-session set list
- 1RM calculations: exclude warm-up sets (existing). Include dropsets and failure sets.

### Technical Approach

#### 1. Schema Migration (lib/db/helpers.ts)

```sql
ALTER TABLE workout_sets ADD COLUMN set_type TEXT DEFAULT 'normal'
```

Then backfill:
```sql
UPDATE workout_sets SET set_type = 'warmup' WHERE is_warmup = 1
UPDATE workout_sets SET set_type = 'normal' WHERE is_warmup = 0 OR is_warmup IS NULL
```

Keep `is_warmup` column for backward compatibility. New code reads `set_type`. Write code updates both columns.

#### 2. Type Updates (lib/types.ts or inline)

```ts
type SetType = "normal" | "warmup" | "dropset" | "failure"
```

#### 3. Database Layer (lib/db/sessions.ts)

- `addSet()`: Accept `setType` parameter (default "normal"), write both `set_type` and `is_warmup` (for compat)
- `addSetsBatch()`: Same dual-write
- New function `updateSetType(id, type)`: Updates both columns
- Query updates: Replace `is_warmup = 0` filters with `set_type != 'warmup'` where volume is concerned

#### 4. Session Screen (app/session/[id].tsx)

- Replace binary warm-up toggle with cycle-through logic
- Update `SetRow` to show type-specific chip with type-specific color
- Update left border accent color per type
- Cycle function: `normal → warmup → dropset → failure → normal`

#### 5. Analytics Updates

Queries that currently filter `is_warmup = 0`:
- `getWeeklyVolume()` — keep filtering warm-ups only. Dropsets/failure count toward volume.
- `getMuscleVolumeForWeek()` — same (warm-ups excluded, others included)
- `getMuscleVolumeTrend()` — same
- `getSessionSetCount()` — count all non-warmup sets (existing behavior preserved)
- `getSessionAvgRPE()` — include failure sets (they have meaningful RPE data)
- PR detection — include dropsets/failure in volume PRs. Weight PRs naturally handle this (dropsets are lighter).

No query changes needed for volume — existing `is_warmup = 0` already correctly includes what will become dropsets and failure sets. The migration backfill ensures consistency.

#### 6. Summary & Detail Updates

- Summary: Show set type breakdown in stats
- Detail: Render type badges
- Repeat Workout: Map `set_type` values to new session sets

### Migration Safety

The migration is safe because:
1. New column with `DEFAULT 'normal'` — no existing data changes
2. Backfill uses existing `is_warmup` as source of truth
3. Dual-write to both `is_warmup` and `set_type` during transition
4. All existing `is_warmup = 0` filters remain correct (dropset/failure were previously normal sets)
5. No index changes needed — existing indexes on session_id and exercise_id are sufficient

### Testing Plan

#### Unit Tests

| Test | Description |
|------|-------------|
| Schema migration | `set_type` column exists after migration, backfill correct |
| `updateSetType()` | Updates both `set_type` and `is_warmup` correctly |
| Cycle logic | normal → warmup → dropset → failure → normal |
| Volume queries | Warm-ups excluded, dropsets/failure included |
| PR queries | Warm-ups excluded from PRs, dropsets/failure included |
| Repeat Workout | Set types preserved when repeating a workout |
| `addSet()` with types | Each set type persists correctly |
| `addSetsBatch()` | Batch creation with mixed types works |

#### Integration Tests

| Test | Description |
|------|-------------|
| Session with mixed types | Create session with all 4 types, verify summary breakdown |
| Exercise history badges | Verify badges render for each type |
| Backward compat | Old sessions (no `set_type` column value) render as "normal" |

### Out of Scope

- Template-level set type configuration (e.g., "3 working + 2 dropsets")
- Auto-detection of dropsets based on weight decrease pattern
- Rest-pause set type (can be added later — same pattern)
- Cluster set type (can be added later)
- Set type influence on progressive overload suggestions

### Dependencies

- Phase 45 (Warm-up Set Tagging) — DONE. This phase extends that infrastructure.

### Risks

| Risk | Mitigation |
|------|------------|
| Cycle-through is less discoverable than dedicated buttons | First-use tooltip, consistent with Phase 45 pattern users already know |
| Too many chip types could clutter the set row | Only show chip for non-normal types (normal = no chip, clean default) |
| Backward compatibility with `is_warmup` | Dual-write ensures old code paths work during transition |

### Estimated Complexity

- **Schema**: Low (one column addition + backfill)
- **DB layer**: Low (extend existing functions)
- **UI**: Medium (cycle logic, 3 new chip styles, accessibility)
- **Analytics**: Low (existing filters already correct)
- **Tests**: Medium (new type combinations)
- **Overall**: Medium — extends well-established Phase 45 patterns

### Files to Modify

1. `lib/db/helpers.ts` — Schema migration
2. `lib/db/sessions.ts` — DB functions (addSet, updateSetType, queries)
3. `app/session/[id].tsx` — Set row UI, cycle toggle
4. `app/session/summary/[id].tsx` — Stats breakdown
5. `app/session/detail/[id].tsx` — Type badges
6. `app/exercise/[id].tsx` — History badges
7. `lib/types.ts` — SetType type (if not inline)
8. New test files for set type logic
