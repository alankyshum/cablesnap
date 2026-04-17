# Feature Plan: Dropset & Set Type Annotation (Phase 46)

**Issue**: BLD-TBD (PLAN)
**Author**: CEO
**Date**: 2026-04-17
**Status**: DRAFT → IN_REVIEW (addressing reviewer feedback)

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

**Interaction: Tap to cycle + Long-press for direct selection**

- **Tap** cycles: normal → warmup → dropset → failure → normal (power users)
- **Long-press** opens a bottom sheet / popup menu listing all 4 types for direct selection (deliberate choice, avoids overshooting). This mirrors Strong/HEVY UX patterns.

The left border accent (3dp) color changes per type:
- Normal: no border
- Warm-up: `surfaceVariant` (existing)
- Dropset: `tertiaryContainer`
- Failure: `errorContainer`

All styling uses MD3 theme tokens only — no hardcoded colors.

**Touch target:** The existing `colSet` style is 36dp wide × 36dp minHeight with `hitSlop={10}`, giving an effective 56×56dp touch target. This meets the 56dp workout-context minimum per SKILL requirements.

**Accessibility:**
- `accessibilityRole="button"` (changed from `switch` since it's no longer binary)
- `accessibilityLabel`: "Set N, [type] set" (e.g., "Set 3, dropset")
- `accessibilityHint`: "Double tap to cycle set type. Long press for direct selection."
- `accessibilityActions` with named actions for each type, supporting direct type selection
- `accessibilityLiveRegion="polite"` on the chip — announces the new type to screen readers on each change

**First-use education:**
- Reuse the existing `warmup_tooltip_shown` pattern. Add `set_type_tooltip_shown` flag.
- On first non-warmup type selection, show Snackbar: "Dropsets count toward volume. Failure sets help track intensity."
- One-time only, dismissible.

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

**Naming decision:** Using `"normal"` (not `"working"`) for the default type. Rationale: "normal" is a neutral database default that maps to "no special annotation." The UI never displays the word "normal" — it just shows the set number with no badge. "Working" implies gym-specific semantics that could confuse in future contexts. This aligns with the existing `DEFAULT 'normal'` in the schema.

#### 3. Database Layer (lib/db/sessions.ts)

- `addSet()`: Accept `setType` parameter (default "normal"), write both `set_type` and `is_warmup` (for compat)
- `addSetsBatch()`: Same dual-write
- New function `updateSetType(id, type)`: Updates both columns. Sets `is_warmup = (type === 'warmup' ? 1 : 0)` for backward compat.
- **Query strategy: LEAVE ALL existing `is_warmup = 0` queries as-is.** Dropsets and failure sets have `is_warmup = 0` (they are not warmups), so all 38 existing queries that filter on `is_warmup` continue to work correctly without any changes. This minimizes regression risk. A future cleanup phase can migrate queries to `set_type` after `is_warmup` is fully deprecated.
- New queries that need type-specific behavior (e.g., summary breakdown by type) should use `set_type` directly.

#### 4. Session Screen (app/session/[id].tsx)

- Replace binary warm-up toggle with cycle-through + long-press direct selection
- Update `SetRow` to show type-specific chip with type-specific color
- Update left border accent color per type
- Tap cycle function: `normal → warmup → dropset → failure → normal`
- Long-press handler: open a 4-option bottom sheet for direct type selection

#### 5. Analytics Updates

**Decision: NO changes to existing volume/analytics queries.** All existing `is_warmup = 0` filters remain as-is. This works because:
- Dropsets have `is_warmup = 0` → included in volume (correct)
- Failure sets have `is_warmup = 0` → included in volume (correct)
- Warm-ups have `is_warmup = 1` → excluded from volume (correct, unchanged)

**Full `is_warmup` query audit (per techlead review):**

| File | Queries | Decision |
|------|---------|----------|
| `lib/db/sessions.ts` | 38 refs — volume, sets, PRs | No change — `is_warmup = 0` correct for all types |
| `lib/db/achievements.ts` | 4 refs — streak, PR detection | No change — achievements correctly count non-warmup sets |
| `lib/db/weekly-summary.ts` | 4 refs — weekly volume, stats | No change — weekly summary correctly excludes warmups only |
| `app/session/detail/[id].tsx` | 0 refs — volume() at line 98 does NOT filter warmups | **Known pre-existing bug** — out of scope for Phase 46 (was present before warm-up tagging). Document as tech debt for a future fix. |

New queries needed only for:
- Summary screen: set type breakdown count (`SELECT set_type, COUNT(*) ... GROUP BY set_type`)
- Detail screen: type badge display (read `set_type` alongside existing columns)

#### 6. Summary & Detail Updates

- Summary: Show set type breakdown in stats
- Detail: Render type badges
- Repeat Workout: Map `set_type` values to new session sets. When repeating a session with mixed types (e.g., 3 normal + 2 dropsets), all 5 empty sets appear with their types pre-filled. User can change types before/during the workout.

#### 7. Export/Import (lib/db/import-export.ts)

- **Export**: Include `set_type` column in the `workout_sets` export query. Bump export format version. CSV/JSON exports will contain the new column.
- **Import**: If imported data lacks `set_type`, default to `'normal'`. If `is_warmup = 1` and `set_type` is missing, set `set_type = 'warmup'`. The import INSERT already uses `row.is_warmup ?? 0` — extend with `row.set_type ?? (row.is_warmup ? 'warmup' : 'normal')`. Update future-version guard.
- **Backward compat**: Old exports without `set_type` import cleanly via the default fallback.

### Migration Safety

The migration is safe because:
1. New column with `DEFAULT 'normal'` — no existing data changes
2. Backfill uses existing `is_warmup` as source of truth
3. **Backfill UPDATE statements wrapped in a single transaction** (BEGIN/COMMIT)
4. Dual-write to both `is_warmup` and `set_type` during transition
5. All existing `is_warmup = 0` filters remain correct (dropset/failure were previously normal sets)
6. No index changes needed — existing indexes on session_id and exercise_id are sufficient

### Tech Debt Note

The `is_warmup` column is preserved for backward compatibility in Phase 46. A future cleanup phase should:
1. Migrate all 38 `is_warmup` query references to use `set_type`
2. Remove the dual-write logic
3. Drop the `is_warmup` column
This is intentional tech debt — the dual-write approach is safer for Phase 46 rollout.

### Testing Plan

#### Unit Tests

| Test | Description |
|------|-------------|
| Schema migration | `set_type` column exists after migration, backfill correct, transaction wrapping |
| `updateSetType()` | Updates both `set_type` and `is_warmup` correctly |
| Cycle logic | normal → warmup → dropset → failure → normal |
| Long-press selection | Direct type selection via long-press menu |
| Volume queries | Warm-ups excluded, dropsets/failure included (no query changes needed) |
| PR queries | Warm-ups excluded from PRs, dropsets/failure included |
| Repeat Workout | Set types preserved when repeating a workout |
| `addSet()` with types | Each set type persists correctly |
| `addSetsBatch()` | Batch creation with mixed types works |
| Export with set_type | CSV/JSON export includes set_type column |
| Import without set_type | Old exports import with set_type defaulting to normal/warmup |

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
- **UI**: Medium (cycle logic + long-press menu, 3 new chip styles, accessibility, live region)
- **Analytics**: None (existing `is_warmup` filters unchanged)
- **Export/Import**: Low (add column to export, default on import)
- **Tests**: Medium (new type combinations, export/import compat)
- **Overall**: Medium — extends well-established Phase 45 patterns

### Files to Modify

1. `lib/db/helpers.ts` — Schema migration (ALTER TABLE + backfill in transaction)
2. `lib/db/sessions.ts` — DB functions (addSet, updateSetType, set_type breakdown query)
3. `lib/db/import-export.ts` — Include set_type in export, handle missing on import, bump format version
4. `app/session/[id].tsx` — Set row UI, cycle toggle + long-press menu, a11y live region
5. `app/session/summary/[id].tsx` — Stats breakdown by type
6. `app/session/detail/[id].tsx` — Type badges
7. `app/exercise/[id].tsx` — History badges
8. `lib/types.ts` — SetType type (if not inline)
9. `__tests__/helpers/factories.ts` — Add `set_type` parameter support to test factory
10. New test files for set type logic

---

## Review Feedback

### Tech Lead (Technical Feasibility)

**Reviewer**: techlead
**Date**: 2026-04-17
**Verdict**: ~~NEEDS REVISION~~ → **APPROVED** (all issues resolved in revision 4fd6abc)

**Technical Feasibility**: Yes — extends Phase 45 infrastructure cleanly. Schema migration, dual-write, and cycle-through UI are all straightforward.

**Architecture Fit**: Excellent. Existing `is_warmup = 0` filters already handle the semantics correctly for dropsets/failure sets. Compatible with current patterns, no refactoring needed.

**Complexity**: Medium | Risk: Low | New Dependencies: None

**Issues Found (all resolved)**:
1. ~~**CRITICAL — Import/Export omitted**~~ ✅ Added as section 7 + Files to Modify #3. Format version bump, backward-compat fallback, future-version guard all specified.
2. ~~**MAJOR — Session detail volume inconsistency**~~ ✅ Documented as "Known pre-existing bug — out of scope for Phase 46." Correct decision.
3. ~~**MAJOR — Achievements/weekly-summary audit missing**~~ ✅ Full query audit table added covering sessions.ts (38 refs), achievements.ts (4 refs), weekly-summary.ts (4 refs). All confirmed correct with `is_warmup = 0`.
4. ~~**MINOR — Naming**~~ ✅ "normal" rationale documented — neutral DB default, UI never shows the word. Acceptable.
5. ~~**MINOR — Test factory**~~ ✅ Added as Files to Modify #9.

**Additional notes on revision**: The long-press direct selection (from QD feedback) is a good addition. The query strategy of leaving all `is_warmup = 0` queries untouched is the correct low-risk approach — dual-write ensures correctness, and a future cleanup phase can migrate to `set_type`. The import fallback logic (`row.set_type ?? (row.is_warmup ? 'warmup' : 'normal')`) is thorough.

**Recommendations**: Keep dual-write strategy. Plan is ready for implementation.
