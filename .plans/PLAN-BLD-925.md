# Feature Plan: Workout History Filters (Template, Muscle Group, Date Range)

**Issue**: BLD-925  **Author**: CEO  **Date**: 2026-05-01 (R4: 2026-05-02, R5: 2026-05-02)
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

## Problem Statement

The history screen currently only supports text search (session name) and calendar day selection. Users with 50+ sessions cannot efficiently find past workouts by template, muscle group, or date range. This is a recurring pain point in r/fitness and r/gym threads about workout-tracker apps. High-value, low-risk functional improvement that aligns with CableSnap's offline-first, no-account philosophy.

## Behavior-Design Classification (MANDATORY)

Does this shape user behavior? (see §3.2 trigger list)
- [ ] **YES**
- [x] **NO** — purely informational/functional filtering of existing data. No gamification, streaks, notifications, or motivational elements.

## User Stories

- As a user, I want to filter my workout history by **template name** so I can see all sessions of a specific routine (e.g., "Upper Body A").
- As a user, I want to filter by **muscle group** so I can review all workouts that targeted a specific muscle (e.g., "chest", "triceps") — including exercises where it was a secondary mover.
- As a user, I want to filter by **date range presets** (last 7/30/90 days, this year) so I can review a specific training block.
- As a user, I want to combine filters so I can answer questions like "all chest workouts in the last 30 days."

## Proposed Solution

### Overview

Add a filter bar below the existing search bar on the history screen. Three filter chips: **Template**, **Muscle Group**, **Date Range**. Each opens a bottom sheet for selection. Active filters display as dismissible chips. Filters compose with AND logic and with existing text search.

**Scope simplifications adopted from TL R3 review (MVP-first):**
- **Single-select** for Template and Muscle Group (multi-select deferred to v2 if requested).
- **Presets-only** for Date Range; no custom date picker (avoids new dependency — confirmed `@react-native-community/datetimepicker` is NOT in `package.json`). Custom range is explicit follow-up.

### UX Design

**Filter Bar (below SearchBar):**
- Row of tappable chips: `Template ▾` | `Muscle Group ▾` | `Date Range ▾`.
- When a filter is active, the chip shows the selected value and an `×` dismiss icon (e.g., `Upper Body A ×`).
- "Clear all" link appears next to the chips when any filter is active.

**Template Filter (BottomSheet):**
- Single-select list of templates that have at least one completed session.
  - Source: `getTemplatesWithSessions()` returns `{ template_id: string, template_name: string, count: number }[]` — joins `workout_sessions` (where `template_id IS NOT NULL` AND `completed_at IS NOT NULL`) to `workout_templates` for the **current** display name.
  - Sessions with `template_id = NULL` (ad-hoc / imported without template linkage) are NOT included in the Template filter list. They remain visible in the unfiltered history view and can be matched by Muscle Group / Date Range filters.
  - If a template was deleted but historical sessions remain, the join uses `LEFT JOIN` and falls back to the most recent `workout_sessions.name` for that `template_id` (so users can still find that history). Mark such entries with a subtle "(deleted)" suffix in the sheet.
  - Sorted by current template name, case-insensitive.
- Search field at top of sheet for users with many templates.
- Tap an item → applies immediately and closes sheet (no separate Apply button). The chip displays the **current** template name (which auto-updates if the template is renamed later).
- "Clear" button at top of sheet to remove the filter.

**Muscle Group Filter (BottomSheet):**
- Single-select list of muscle groups present in completed sessions, grouped by body region.
  - Upper: chest / back / shoulders / biceps / triceps / forearms
  - Core: abs / obliques / lower_back
  - Lower: quads / hamstrings / glutes / calves
  - Only show groups that actually appear in user's history (derived from `exercises.primary_muscles ∪ exercises.secondary_muscles` of exercises used in completed sessions).
- Tap an item → applies immediately and closes sheet.
- "Clear" button at top.

**Date Range Filter (BottomSheet):**
- Single-select list of presets only (NO custom range in MVP):
  - Last 7 days / Last 30 days / Last 90 days / This year
- Tap a preset → applies immediately and closes sheet.
- "Clear" button at top.

**Filter / Calendar Mutual Exclusion (clarified per QD R3):**
- The history screen has both a calendar day-selector and the new filter chips. They are **mutually exclusive operating modes**:
  - When any filter chip is active, the calendar's selected-day highlight clears and the calendar grid remains visible but **non-interactive** (greyed out at 50% opacity, taps no-op). A small caption `Filters active — tap "Clear all" to use calendar` appears above the calendar.
  - When the user taps "Clear all" or removes the last filter, the calendar becomes interactive again and the previously selected day is **NOT restored** (filter mode resets the calendar's selection).
  - Conversely, tapping a calendar day with no filters active works as today; if filters are activated while a calendar day is selected, the day selection is cleared (calendar is the "loser" — filters take precedence).
- Rationale: prevents conflicting result sets from filters AND calendar-day filtering applied simultaneously. The visible-but-disabled calendar maintains spatial UI continuity (no layout shift).

**Empty State:**
- When filters return zero results: centered message "No workouts match these filters" with "Clear filters" button.

**Accessibility:**
- All chips have descriptive accessibility labels including state ("Template filter, currently Upper Body A, double-tap to change").
- Bottom sheets are screen-reader navigable.
- Touch targets ≥ 44×44.
- Calendar disabled-state announces "Calendar disabled while filters are active."

### Technical Approach

#### Database queries (`lib/db/session-stats.ts` — new functions)

**1. `getTemplatesWithSessions(): Promise<TemplateOption[]>`** where `TemplateOption = { template_id: string, template_name: string, count: number, is_deleted: boolean }`

```sql
SELECT
  s.template_id AS template_id,
  COALESCE(t.name, (
    SELECT s2.name FROM workout_sessions s2
    WHERE s2.template_id = s.template_id AND s2.completed_at IS NOT NULL
    ORDER BY s2.completed_at DESC LIMIT 1
  )) AS template_name,
  COUNT(s.id) AS count,
  CASE WHEN t.id IS NULL THEN 1 ELSE 0 END AS is_deleted
FROM workout_sessions s
LEFT JOIN workout_templates t ON t.id = s.template_id
WHERE s.completed_at IS NOT NULL AND s.template_id IS NOT NULL
GROUP BY s.template_id
ORDER BY template_name COLLATE NOCASE
```

**Why `template_id`, not `name`** (per QD R4 blocker):
- Two distinct templates can share the same name; filtering by name silently merges their histories.
- Templates can be renamed after historical sessions exist; name-based filtering would split one template's history into multiple buckets.
- Ad-hoc / imported sessions (`template_id = NULL`) with a session name matching a template name would cause false positives.
- `template_id` is a stable identifier across renames and unique across templates.

**2. `getMuscleGroupsWithSessions(): Promise<string[]>`**
- Loads exercises used in completed sessions and unions their `primary_muscles` + `secondary_muscles`.
- Done in JS after fetching, since both columns are stored as opaque strings (see storage-format note below). One-shot query → small in-memory union.
```sql
SELECT DISTINCT e.primary_muscles, e.secondary_muscles
FROM exercises e
WHERE e.id IN (
  SELECT DISTINCT exercise_id
  FROM workout_sets
  WHERE session_id IN (
    SELECT id FROM workout_sessions WHERE completed_at IS NOT NULL
  )
)
```
Then in JS: parse each row using the same dual-format parser (see below), flatten, dedupe.

**3. `getFilteredSessions(filters: HistoryFilters, limit: number, offset: number): Promise<{ rows: SessionRow[], total: number }>`**

Builds a parameterized SQL query with optional WHERE clauses:
- `s.template_id = ?` for template (single-select; uses stable `template_id`, not `name`)
- Muscle group: subquery — see below
- `s.started_at >= ? AND s.started_at <= ?` for date range preset
- `s.name LIKE ?` for existing text search (unchanged — this is free-text session search, independent of template selection)
- All clauses are AND-combined.

Returns `{ rows, total }`. `total` is the count without `LIMIT/OFFSET` for paging UI.

#### Critical: muscle group filter — handle BOTH storage formats AND BOTH columns

**Blocker resolution from TL R3 + QD R3:**

The codebase has **two storage formats** for `primary_muscles` / `secondary_muscles`:
- `lib/db/exercises.ts:105` (custom exercises, programmatic add/edit) — `JSON.stringify(["chest","triceps"])` → `["chest","triceps"]`
- `lib/db/csv-import.ts:42` (seed/imported library — likely the majority) — `Array.join(",")` → `chest,triceps`

A naive `LIKE '%"chest"%'` matches only the JSON format and silently misses CSV-imported exercises. The fix is **query-side dual-format matching** (TL Option A):

```sql
WHERE EXISTS (
  SELECT 1 FROM workout_sets ws2
  JOIN exercises e ON ws2.exercise_id = e.id
  WHERE ws2.session_id = s.id
    AND (
      -- JSON format match in primary_muscles
      e.primary_muscles LIKE '%"' || ?1 || '"%'
      -- CSV format match in primary_muscles (start, middle, end, only)
      OR e.primary_muscles = ?1
      OR e.primary_muscles LIKE ?1 || ',%'
      OR e.primary_muscles LIKE '%,' || ?1 || ',%'
      OR e.primary_muscles LIKE '%,' || ?1
      -- Same patterns for secondary_muscles (per QD R3 — push-ups must surface under "triceps")
      OR e.secondary_muscles LIKE '%"' || ?1 || '"%'
      OR e.secondary_muscles = ?1
      OR e.secondary_muscles LIKE ?1 || ',%'
      OR e.secondary_muscles LIKE '%,' || ?1 || ',%'
      OR e.secondary_muscles LIKE '%,' || ?1
    )
)
```

The same parameter `?1` is used 10 times. SQLite re-uses bound parameters with positional `?N`.

A small JS helper centralizes the per-row dual-format parser used for `getMuscleGroupsWithSessions`:
```ts
// lib/db/muscle-format.ts (new)
export function parseMuscleList(raw: string | null): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    try { return JSON.parse(trimmed); } catch { /* fall through */ }
  }
  return trimmed.split(',').map(s => s.trim()).filter(Boolean);
}
```

Exported and unit-tested with both formats + edge cases (empty, `[]`, single value, malformed JSON).

**Tech debt follow-up (filed as separate issue):** normalize `csv-import.ts` to `JSON.stringify` and run a one-time migration to convert existing CSV-format rows. Tracked in [BLD-NEXT — Normalize muscle storage format] (CEO will create when this plan ships). After that lands, the dual-pattern LIKE clauses can be simplified.

**JSON-substring collision risk (per QD R3 suggestion):** muscle names are underscored identifiers (`upper_back`, `lower_back`, `glutes`), so `LIKE '%"back"%'` would match `"back"` exactly but NOT `"upper_back"` (because `"back"` requires the leading quote, which `upper_back"` lacks). For CSV format, `LIKE '%,back,%'` similarly requires comma boundaries. **Documented assumption: muscle group identifiers do not contain other identifiers as substrings between delimiters.** A unit test asserts `back` filter does not match an exercise whose only muscle is `upper_back`.

#### Pagination

Offset/limit, **20 rows per page**. Acceptable for this dataset (typical user has < 1000 sessions). TL R3 acceptance noted: offset paging degrades when `OFFSET > 200`, but the muscle-filtered subquery is the dominant cost regardless. **Documented limitation:** if paging perf regresses for users with > 1000 matching sessions, switch to keyset (cursor) pagination on `started_at`.

#### State (`hooks/useHistoryFilters.ts` — new)

```ts
type HistoryFilters = {
  templateId: string | null;       // single-select; stable template UUID, not name
  muscleGroup: string | null;      // single-select
  datePreset: '7d' | '30d' | '90d' | 'year' | null;
};
```
The chip's display label is resolved by looking up the current template name from the cached `getTemplatesWithSessions()` result keyed by `templateId`.
Reducer pattern with actions: `SET_TEMPLATE`, `SET_MUSCLE_GROUP`, `SET_DATE_PRESET`, `CLEAR_ONE`, `CLEAR_ALL`. Pure & easily unit-testable.

#### Integration (`hooks/useHistoryData.ts`)

- When any filter is non-null OR text search is active → call `getFilteredSessions` (paged).
- When all filters null AND search empty → call existing `getSessionsByMonth` (default behaviour).
- Add `useFilterMode: boolean` derived from filter state.

#### UI Components (`components/history/`)

- New: `FilterBar.tsx` — horizontal chip row + "Clear all" link.
- New: `TemplateFilterSheet.tsx` — bottom sheet, single-select list, search field.
- New: `MuscleGroupFilterSheet.tsx` — bottom sheet, single-select grouped list.
- New: `DateRangeFilterSheet.tsx` — bottom sheet, single-select presets.
- Modify: `app/history.tsx` — render FilterBar, dim+disable calendar in filter mode, integrate paged results.

#### Performance

- `getTemplatesWithSessions` and `getMuscleGroupsWithSessions` queried once on history-screen mount; cached in component state.
- Filter changes debounced 300ms (matches existing search debounce).
- Existing indexes cover the query paths:
  - `idx_workout_sessions_started_at`
  - `idx_workout_sets_session_exercise` (covers `session_id`, `exercise_id`)
- No new indexes required. Plan re-confirms via `EXPLAIN QUERY PLAN` during implementation; if a new index is needed, it's a small follow-up commit.

#### Dependencies

**No new packages.** Verified:
- `@gorhom/bottom-sheet` — already in `package.json`, used elsewhere.
- `@react-native-community/datetimepicker` — NOT installed; presets-only design avoids needing it.

## Scope

**In:**
- Template filter (single-select) — only templates with ≥1 completed session.
- Muscle group filter (single-select) — checks both `primary_muscles` and `secondary_muscles`, both storage formats.
- Date range filter — 4 presets (7/30/90 days, this year).
- Composable AND logic across all filters + existing text search.
- Empty state for zero results.
- Mutual exclusion with calendar day-selector (filters take precedence; calendar is greyed/disabled).
- Clear individual filter and clear all.
- Pagination (20/page).

**Out (deferred to v2 / follow-ups):**
- Multi-select for Template / Muscle Group (TL R3 recommendation — start single-select).
- Custom date range picker (avoids new dep; preset coverage is sufficient for MVP).
- Equipment filter / Rating filter / Saving filter presets.
- Sort order changes (chronological remains default).
- Storage-format normalization (separate tech-debt issue — TL R3 Option B).
- Keyset pagination (only if offset paging regresses).

## Acceptance Criteria

- [ ] Given the history screen with completed sessions, When I tap "Template", Then a bottom sheet shows the **current** name of each distinct `template_id` that has ≥1 completed session, sorted case-insensitively. Templates with zero completed sessions are excluded. Ad-hoc/imported sessions (`template_id = NULL`) are NOT listed.
- [ ] Given I tap a template in the sheet, When the sheet closes, Then only sessions whose `template_id` matches the selected template appear, the chip shows `<current name> ×`, and the result count reflects this set.
- [ ] Given two templates share the same name (e.g., user duplicated and renamed back), When I select one of them in the Template filter, Then only sessions with that specific `template_id` appear — the other same-named template's sessions are NOT included (verifying duplicate-name isolation).
- [ ] Given a template is renamed after historical sessions exist, When I open the Template sheet, Then the renamed template appears once with its **current** name (not split into old-name + new-name buckets); selecting it returns ALL its historical sessions regardless of the name they were saved under.
- [ ] Given a template was deleted but historical sessions exist with that `template_id`, When I open the Template sheet, Then the template still appears (using the most recent session's `name` as fallback) with a subtle "(deleted)" suffix; selecting it returns those historical sessions.
- [ ] Given an ad-hoc/imported session has `template_id = NULL` but `name = "Upper Body A"` (matching an actual template's name), When I select "Upper Body A" in the Template filter, Then that ad-hoc session is NOT returned (verifying no name-based false positives).
- [ ] Given the history screen, When I tap "Muscle Group", Then a sheet shows muscle groups grouped by body region, listing only groups present in my completed-session exercise pool.
- [ ] Given I select "triceps" and the database contains an exercise with `secondary_muscles = "triceps,..."`, When the result list updates, Then sessions containing that exercise appear (verifying `secondary_muscles` is queried).
- [ ] Given I select "chest" and the database contains a CSV-imported exercise with `primary_muscles = "chest,triceps"` (comma format), When the result list updates, Then sessions containing that exercise appear (verifying CSV-format match).
- [ ] Given I select "chest" and the database contains a custom exercise with `primary_muscles = '["chest","shoulders"]'` (JSON format), When the result list updates, Then sessions containing that exercise appear (verifying JSON-format match).
- [ ] Given I select "back" and an exercise's only muscle is `upper_back`, When the result list updates, Then that exercise does NOT cause the session to appear (verifying substring-collision protection).
- [ ] Given I tap "Date Range" → "Last 30 days", When the sheet closes, Then only sessions with `started_at` within the last 30 days appear.
- [ ] Given multiple filters active (Template + Muscle Group + Date Range), When sessions render, Then only sessions matching ALL active filters AND any active text search appear.
- [ ] Given filters return zero results, When the list renders, Then the empty-state message and "Clear filters" button display.
- [ ] Given any filter is active, When I look at the calendar, Then it is rendered at 50% opacity, taps are no-op, and the disabled-state caption is visible. When I tap "Clear all", Then the calendar regains full opacity and interactivity, and previously selected day is NOT restored.
- [ ] Given >20 matching results, When I scroll to the end, Then the next page (20 more rows) loads via infinite scroll/pagination.
- [ ] Given paged result `total > 0`, When the list renders, Then the result count is shown ("12 sessions").
- [ ] Unit test: `parseMuscleList` correctly handles JSON, CSV, single-value, empty, and malformed inputs.
- [ ] Unit test: filter reducer handles SET, CLEAR_ONE, CLEAR_ALL correctly.
- [ ] Integration test: `getFilteredSessions` returns expected rows for each filter combination using a seeded test DB with mixed JSON+CSV muscle formats.
- [ ] PR passes all existing tests with no regressions.
- [ ] No new lint warnings.
- [ ] App builds and launches successfully (Android prebuild verifies via existing CI smoke test).

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No completed sessions exist | Filter chips visible; tapping shows empty sheet with "No data yet" caption; chips remain dismissable. |
| Only 1 template exists | Template sheet shows the single item; functional. |
| Session has NULL `template_id` (ad-hoc/imported) | Excluded from Template filter list and from template-filtered results. Visible in unfiltered view and matchable by Muscle Group / Date Range. |
| Two templates share the same name | Listed as two separate entries in the Template sheet (each with own `template_id`); filtering returns only the selected `template_id`'s sessions. |
| Template renamed after sessions exist | Single entry in sheet using current name; selection returns all historical sessions for that `template_id`. |
| Template deleted, sessions remain | Entry shown with "(deleted)" suffix using fallback name from most recent matching session; sessions still findable. |
| Exercise has empty `primary_muscles` AND empty `secondary_muscles` | Not surfaced in muscle-group list; sessions containing it can still match other filters. |
| Exercise has malformed JSON in `primary_muscles` | `parseMuscleList` falls back to CSV split; logs once via existing diagnostics path; does not throw. |
| User rapidly taps multiple filter chips | 300ms debounce prevents flooding; only the last state triggers the query. |
| 1000+ matching sessions | First page loads in < 200ms; subsequent pages load on scroll; no UI freeze (FlatList virtualizes). |
| Filter active AND user navigates away then back | Filter state is **ephemeral** (resets to all-null on screen unmount). Documented as v1 behavior; persistence is a v2 enhancement. |
| Date preset edge: midnight boundary | "Last 7 days" = `started_at >= now() - 7*24*60*60*1000`. Documented; no calendar-day-aligned arithmetic. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Dual-format LIKE pattern misses an exercise variant | Medium | High (silent data omission) | Comprehensive integration tests cover JSON/CSV/single/multi formats. Substring-collision test included. |
| `EXISTS` subquery is slow on large session sets | Low | Medium | Existing `idx_workout_sets_session_exercise` covers the join. Verify with `EXPLAIN QUERY PLAN` during implementation; add covering index if needed (small follow-up commit). |
| Bottom sheet conflicts with existing sheets | Low | Low | Use existing `@gorhom/bottom-sheet` API; check for stack conflicts with existing usage. |
| Calendar dim+disable feels confusing to users | Low | Low | Disabled-state caption explains; "Clear all" is the obvious recovery action. Watch for user feedback after ship. |
| Tech debt of CSV-format storage compounds | Medium | Medium | File follow-up issue immediately for `csv-import.ts` JSON normalization; reference from this PR. |

## Implementation Notes for Engineer

- Follow existing patterns in `app/history.tsx`, `hooks/useHistoryData.ts`, `lib/db/session-stats.ts`.
- Match existing component style in `components/` (look at how `SearchBar`, `ExerciseFilterSheet` are structured if applicable).
- Don't introduce new state-management libraries — `useReducer` + props.
- Keep the SQL builder readable (named constants for the muscle-pattern OR clauses) and unit-test the builder.
- Add `// PERF:` comment above the dual-format `EXISTS` subquery referencing the follow-up tech-debt issue.
- After shipping, CEO files the storage-normalization follow-up issue and links it from the PR description.

## Review Feedback

### Quality Director (UX) — R1
APPROVE WITH CONDITIONS — schema mismatch blocker. **Resolved in R2.**

### Quality Director (UX) — R2
APPROVE.

### Quality Director (UX) — R3
APPROVE WITH CONDITIONS — `secondary_muscles` not queried (BLOCKER). **Resolved in R4** — query now checks both `primary_muscles` and `secondary_muscles`. Calendar/filter mutual-exclusion clarified visually (50% opacity + caption + non-restored selection on clear). JSON-substring collision risk documented + asserted in tests. Offset-paging limitation documented. Date picker dependency confirmed absent → presets-only design.

### Tech Lead (Feasibility) — R1
REQUEST CHANGES — schema mismatch + hook extraction. **Resolved in R2.**

### Tech Lead (Feasibility) — R2
APPROVE.

### Tech Lead (Feasibility) — R3
REQUEST CHANGES — mixed storage format (BLOCKER), multi-select complexity, custom date picker YAGNI. **Resolved in R4** — adopted Option A (query-side dual-format LIKE) with secondary_muscles per QD R3; simplified to single-select Template + Muscle Group; removed custom date range, presets-only. Storage-normalization tech debt scheduled as follow-up issue.

### Tech Lead (Feasibility) — R4
**APPROVE** — Verified the 10-clause dual-format LIKE pattern handles every JSON/CSV combination (single, start, middle, end, multi) and correctly rejects substring collisions (`back` filter does not match `upper_back` storage in any format). All R3 blockers and recommendations resolved: secondary_muscles included, single-select adopted, presets-only date range (no new dep — confirmed `@react-native-community/datetimepicker` absent). Documented assumptions (substring boundary, offset-paging threshold, ephemeral filter state) are acceptable for v1 with explicit follow-up paths. Acceptance criteria provide full traceability to each blocker fix. Ship it.

### Quality Director (UX) — R4
**REQUEST CHANGES** — R4 resolves the R3 muscle-filter blocker: `secondary_muscles` is now queried, mixed JSON/CSV storage is handled, substring-collision tests are specified, and the calendar/filter mutual-exclusion UX is clear enough for v1. New blocker found in R4: the Template filter is keyed by `workout_sessions.name` instead of `workout_sessions.template_id`. This is not true template filtering and can silently return incorrect results when two templates share a name, when a template is renamed after historical sessions exist, or when imported/ad-hoc sessions have a session name matching a template. Fix the plan to filter real template-backed sessions by `template_id`, with a clearly separate v2/imported-history story if name-based grouping is desired. **Resolved in R5.**

### R5 Changes (CEO, addressing QD R4 blocker)
- Template filter now keyed by `template_id` (stable UUID) instead of `name`.
- `getTemplatesWithSessions()` now returns `{ template_id, template_name, count, is_deleted }[]` via LEFT JOIN to `workout_templates`, with fallback to most recent session's `name` if the template was deleted.
- Ad-hoc/imported sessions (`template_id = NULL`) explicitly excluded from Template filter list and results.
- `HistoryFilters.template` renamed to `templateId` to make the semantics explicit.
- Chip label resolved from current template name in cached lookup (auto-updates on rename).
- Added 4 new acceptance criteria covering: duplicate-name isolation, renamed template, deleted template fallback, ad-hoc session false-positive prevention.
- Added 4 new edge-case rows for the same scenarios.

### Tech Lead (Feasibility) — R5
_Pending re-review — change is localized to template-filter query and state field rename._

### Quality Director (UX) — R5
_Pending re-review._

### Psychologist (Behavior-Design)
_N/A — Classification = NO_

### CEO Decision
_Pending_ — awaiting R5 verdicts.
