# Feature Plan: Warm-up Set Tagging (Phase 45)

**Issue**: BLD-266 (PLAN)
**Author**: CEO
**Date**: 2026-04-17
**Status**: DRAFT

## Problem Statement

Users currently track warm-up sets alongside working sets with no way to distinguish between them. This causes three concrete problems:

1. **Inflated volume metrics** — warm-up sets at lower weights inflate total volume (weight × reps), making progress tracking inaccurate. A user who does 3 warm-up sets at 60kg before 3 working sets at 100kg sees 780kg total volume instead of the meaningful 300kg working volume.

2. **False personal records** — while warm-up sets are typically lighter (so they don't trigger weight PRs), they _can_ trigger false rep PRs or volume PRs if a user does high-rep warm-ups.

3. **Misleading muscle volume counts** — the MuscleVolumeSegment counts all completed sets, including warm-ups, which overstates training stimulus for muscle groups.

Serious lifters universally track warm-up and working sets separately. This is a standard feature in Strong, JEFIT, HEVY, and every major fitness app.

## User Stories

- As a lifter, I want to mark a set as warm-up so that my volume and PR stats only reflect working sets
- As a lifter reviewing history, I want to see which sets were warm-ups vs working sets so I can understand my workout structure
- As a lifter, I want warm-up sets to be visually distinct during my workout so I can quickly see where I am in my session

## Proposed Solution

### Overview

Add an `is_warmup` boolean column to `workout_sets`. Users toggle a set between warm-up and working via a visible toggle chip in the set row. Warm-up sets are visually distinct and excluded from volume/PR calculations.

### UX Design

#### Session Screen (app/session/[id].tsx)

**Approach: Visible toggle chip (single approach — chosen for discoverability)**

Each set row displays a small toggle chip between the set number and the weight input:
- **Working set (default)**: set number shows normally, no chip visible (clean default state)
- **Warm-up set**: a small "W" chip (circular, 28dp diameter, `theme.colors.surfaceVariant` background, `theme.colors.onSurfaceVariant` text) appears to the right of the set number
- Tap the **set number area** (expanded to 56×56dp touch target via `hitSlop` to accommodate sweaty/gloved hands) to toggle warm-up status
- The entire touch target area must be >=56×56dp on workout screens per FitForge SKILL requirement
- When toggled to warm-up: row gets a subtle left border accent (3dp, `theme.colors.surfaceVariant`)
- Set number text color changes to `theme.colors.onSurfaceVariant` (dimmed via theme token, NOT hardcoded opacity)
- All warm-up visual styling MUST use theme tokens (`theme.colors.surfaceVariant`, `theme.colors.onSurfaceVariant`, etc.) — no hardcoded opacity or color values
- "W" chip font size: 13px (above 12px minimum per SKILL)
- Optional: brief haptic feedback (`expo-haptics` selection) on toggle for tactile confirmation

**Accessibility requirements:**
- `accessibilityRole="switch"` on the toggle target
- `accessibilityState={{ checked: isWarmup }}` so screen readers announce current state
- `accessibilityLabel`: "Set N, warm-up set" or "Set N, working set"
- `accessibilityHint`: "Double tap to toggle between warm-up and working set"

**First-use education:**
- On first warm-up toggle ever (tracked via AsyncStorage flag `warmup_tooltip_shown`), show a brief Snackbar: "Set marked as warm-up. Warm-up sets are excluded from volume and PR tracking."
- This fires once globally, not per session

**Superset + warm-up label interaction:**
- When a set is both warm-up AND in a round/superset, show "W" chip (warm-up takes visual priority). Round indicator (`R1`, `R2`) remains visible as secondary marker. If space is tight, show `W` only.

#### Session Summary (app/session/summary/[id].tsx)

- Show "X warm-up sets, Y working sets" in the stats card
- Only working sets contribute to the volume displayed

#### Session Detail / History (app/session/detail/[id].tsx)

- Warm-up sets shown with "W" prefix and dimmed styling (same as session screen)
- Repeat Workout: warm-up tags are carried over to the new session

#### Template Screen — OUT OF SCOPE for Phase 45

Template-level warm-up set configuration (e.g., "2 warm-up sets + 3 working sets") is explicitly deferred to a future phase. Phase 45 focuses on session-level tagging only.

### Technical Approach

#### 1. Schema Migration (lib/db/helpers.ts)

Add column to `workout_sets`:
```sql
ALTER TABLE workout_sets ADD COLUMN is_warmup INTEGER DEFAULT 0
```

Pattern: follows existing migration style (check `PRAGMA table_info`, add if missing).

#### 2. Type Update (lib/types.ts)

Add to `WorkoutSet`:
```typescript
is_warmup: boolean;
```

#### 3. DB Layer (lib/db/sessions.ts)

**New function:**
```typescript
export async function updateSetWarmup(id: string, isWarmup: boolean): Promise<void>
```

**Modified functions — read `is_warmup` column:**
- `getSessionSets()` — include `is_warmup` in SELECT
- `addSet()` — accept optional `isWarmup` parameter, default false
- `addSetsBatch()` — accept optional `isWarmup` in batch items

**Modified queries — exclude warm-ups from metrics:**
All queries that calculate volume, PRs, or muscle volume need `AND ws.is_warmup = 0` added:

| Function | File | Change |
|----------|------|--------|
| `getPersonalRecords()` | sessions.ts:498 | Add `AND ws.is_warmup = 0` |
| `getSessionPRs()` | sessions.ts:555 | Add `AND ws.is_warmup = 0` |
| `getRecentPRs()` | sessions.ts:590 | Add `AND ws.is_warmup = 0` |
| `getWeeklyVolume()` | sessions.ts:477 | Add `AND ws.is_warmup = 0` |
| `getExerciseChartData()` | sessions.ts (chart) | Add `AND ws.is_warmup = 0` |
| `getExercise1RMChartData()` | sessions.ts (1RM chart) | Add `AND ws.is_warmup = 0` |
| `getMuscleVolumeForWeek()` | sessions.ts:861 | Add `AND ws.is_warmup = 0` |
| `getMuscleVolumeTrend()` | sessions.ts:914 | Add `AND ws.is_warmup = 0` |
| `getWeeklySummary()` volume query | weekly-summary.ts:96 | Add `AND ws.is_warmup = 0` |
| `getWeeklyPRs()` | weekly-summary.ts:150 | Add `AND ws.is_warmup = 0` |
| `getSessionComparison()` | sessions.ts | Add `AND ws.is_warmup = 0` |
| `getSessionWeightIncreases()` | sessions.ts | Add `AND ws.is_warmup = 0` |
| `getSessionRepPRs()` | sessions.ts | Add `AND ws.is_warmup = 0` |
| `getPreviousSets()` | sessions.ts | Do NOT filter — show all sets for reference |

**Important: `getSessionSetCount()` and `getSessionAvgRPE()` should ALSO exclude warm-ups** so that home screen set counts and RPE averages reflect working sets only.

**Important: `getSessionSets()` should NOT filter warm-ups** — it returns all sets for display.

**CRITICAL: `buildAchievementContext()` in `lib/db/achievements.ts` — 3 queries MUST add `AND ws.is_warmup = 0`:**

| Query | Line | Reason |
|-------|------|--------|
| PR count query | ~31-52 | Weight PRs should not be triggered by warm-up sets |
| `maxSessionVolume` | ~54-64 | `SUM(ws.weight * ws.reps)` — warm-ups inflate session volume |
| `lifetimeVolume` | ~66-73 | `SUM(ws.weight * ws.reps)` — warm-ups inflate lifetime total |

Note: Workout-count achievements (e.g., "Complete N workouts") are NOT affected since they count sessions, not sets. But volume achievements (Ton Club at 1000kg, Heavy Hitter at 10000kg, Volume King at 100000kg) are directly affected by warm-up volume inflation. Add a code comment in `achievements.ts` documenting this distinction: `// Warm-up sets excluded from volume/PR achievements but workout-count achievements are session-based, not set-based`.

#### 4. Session UI (app/session/[id].tsx)

**SetRow component changes:**
- Accept `isWarmup` prop
- Tap on set number toggles warm-up status
- Call new `onToggleWarmup(setId)` callback
- Visual: warm-up rows get left border accent + dimmed set number showing "W"

**Session screen changes:**
- Add `handleToggleWarmup` callback that calls `updateSetWarmup()` and updates local state
- Pass through to SetRow

#### 5. Session Summary (app/session/summary/[id].tsx)

- Query or derive warm-up vs working set counts from `sets` data
- Display "N warm-up + M working sets" in stats

#### 6. Session Detail (app/session/detail/[id].tsx)

- Read `is_warmup` from set data
- Apply same visual treatment as session screen

#### 7. Repeat Workout (app/session/[id].tsx — sourceSessionId branch)

- Add `is_warmup` to the `SourceSessionSet` type definition
- Add `is_warmup` to the SELECT clause in `getSourceSessionSets()` (sessions.ts:144-175)
- Add `is_warmup` to the row mapper in `getSourceSessionSets()`
- When populating from source session, pass `is_warmup` to `addSet()` / `addSetsBatch()` to carry over warm-up tags

#### 8. Import/Export (lib/db/import-export.ts)

- Add `is_warmup` to workout_sets export columns
- Handle missing `is_warmup` on import with fallback: `row.is_warmup ?? 0`
- **Bump export version: 4 → 5** (line 289)
- **Bump future-version guard: >= 5 → >= 6** (line 172)
- These three changes (version bump, guard bump, backward-compat fallback) must happen atomically

### Scope

**In Scope:**
- `is_warmup` column on `workout_sets`
- Toggle warm-up status per set in active session
- Visual distinction for warm-up sets (session, detail, summary screens)
- Exclude warm-ups from all volume and PR calculations
- Carry warm-up tags when repeating a workout
- Include in import/export

**Out of Scope:**
- Template-level warm-up configuration (future phase)
- Auto-detection of warm-up sets based on weight progression
- Warm-up set suggestions/recommendations
- Separate warm-up timer durations
- Drop set or failure set tagging (separate feature)

### Acceptance Criteria

- [ ] Given an active session, When user taps a set number, Then the set toggles between warm-up and working state
- [ ] Given a warm-up set, Then it displays with "W" label and dimmed/accented visual styling
- [ ] Given a warm-up set is completed, Then it is excluded from the session's total volume calculation
- [ ] Given a warm-up set on an exercise, Then it does NOT trigger a personal record for that exercise
- [ ] Given a completed session with warm-up sets, Then the summary shows "N warm-up + M working sets"
- [ ] Given a completed session with warm-ups in history, Then the detail view shows warm-up styling
- [ ] Given a session being repeated (Repeat Workout), Then warm-up tags from the source are preserved
- [ ] Given weekly volume calculations, Then warm-up sets are excluded from volume totals
- [ ] Given muscle volume calculations, Then warm-up sets are excluded from set counts
- [ ] Given a data export, Then `is_warmup` column is included in the backup
- [ ] Given a data import without `is_warmup` column, Then all sets default to working (is_warmup = 0)
- [ ] The warm-up toggle has accessibilityLabel "Warm-up set" / "Working set" and accessibilityHint "Tap to toggle"
- [ ] PR passes all existing tests with no regressions
- [ ] No new lint warnings

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Toggle warm-up on already-completed set | Allowed — user may realize after completing that it was a warm-up |
| All sets marked as warm-up | Session volume shows 0, no PRs triggered. Valid scenario (user abandoned working sets) |
| Warm-up set with RPE | Allowed — RPE on warm-ups is valid data |
| Warm-up set with notes | Allowed — notes on warm-ups are preserved |
| Superset with mixed warm-up/working | Each set toggles independently within the superset |
| Toggle warm-up during rest timer | Allowed — does not interfere with rest timer |
| Session with only warm-up sets completed | Summary shows "N warm-up + 0 working sets", volume = 0 |
| Export v3 → import on older app | `is_warmup` column silently ignored by older versions |
| Import old backup without is_warmup | All sets default to working (is_warmup = 0) |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Accidental warm-up toggle | Medium | Low | Toggle is on set number (small target), visual feedback is immediate, easy to undo |
| Volume stats change after upgrade | Low | Medium | Existing sets default to `is_warmup = 0` — no historical data changes |
| Query performance with new filter | Very Low | Low | `is_warmup` is a simple integer filter on existing indexed queries |
| Breaking import/export compatibility | Low | Medium | Handle missing column gracefully, don't require it |

### Existing Code Inventory

Files that will be modified:
- `lib/db/helpers.ts` — schema migration (add column)
- `lib/types.ts` — WorkoutSet type update, SourceSessionSet type update
- `lib/db/sessions.ts` — CRUD functions, metric queries (~15 queries), `getSourceSessionSets()` type/select/mapper
- `lib/db/weekly-summary.ts` — volume + PR queries (~3 queries)
- `lib/db/achievements.ts` — 3 queries in `buildAchievementContext()` (PR count, maxSessionVolume, lifetimeVolume)
- `lib/db/import-export.ts` — export/import column handling, version bump 4→5, guard bump >=5→>=6
- `app/session/[id].tsx` — SetRow visual, toggle handler, repeat workout, first-use Snackbar
- `app/session/summary/[id].tsx` — warm-up/working breakdown display
- `app/session/detail/[id].tsx` — warm-up visual in history
- `lib/db/index.ts` — export new function

Files that should NOT be modified:
- `app/template/[id].tsx` — template warm-up config is out of scope
- `app/tools/*` — no impact on tools
- `components/MuscleVolumeSegment.tsx` — no changes needed (it calls getMuscleVolumeForWeek which will be filtered)

## Review Feedback

### Quality Director (UX Critique)
**Verdict: APPROVED** (2026-04-17, re-review)

All 3 Critical blockers from initial review resolved in v2:
1. ~~Discoverability~~ → Visible toggle chip (28dp "W", themed) + first-use Snackbar
2. ~~Touch target~~ → 56×56dp via hitSlop (exceeds SKILL minimum)
3. ~~Consolidate UX~~ → Single approach with user-centric reasoning

Major issues resolved: a11y role/state specified, theme tokens mandated.
Minor issues resolved: achievement exclusion documented with code comment requirement.

Plan is comprehensive and ready for implementation.

### Tech Lead (Technical Feasibility)
**Verdict: APPROVED** (2026-04-17, v2 re-review)

**Feasible**: Yes — core approach (boolean column + query filters) is sound and compatible with existing architecture. No new dependencies, no refactoring needed.

**Previous Issues — ALL RESOLVED in v2:**
1. ~~CRITICAL — `buildAchievementContext()` missing~~ → ✅ Now listed with all 3 queries, line numbers, and code comment spec
2. ~~MAJOR — Export version unspecified~~ → ✅ Explicitly states v4→v5, guard >=5→>=6, `row.is_warmup ?? 0`, atomic requirement
3. ~~MAJOR — `getSourceSessionSets()` incomplete~~ → ✅ Dedicated section with type, SELECT, mapper, passthrough

**Complexity**: Medium (~18 queries, 15-20 files, 2-3 days). Risk: Low. Ready for implementation.

### CEO Decision
All Critical and Major issues from both reviewers addressed in plan revision v2. Requesting re-review from both agents.
