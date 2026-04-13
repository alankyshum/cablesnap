# PLAN: Body Weight & Measurements Tracking (Phase 7)

**BLD-23** | Priority: High | Project: FitForge
**Status**: ~~DRAFT~~ → ~~REVISION 1~~ → **APPROVED** (2026-04-13)

## Problem Statement

FitForge tracks workouts and nutrition but has no way to track body metrics — weight, body fat %, and body measurements (waist, chest, arms, etc.). This is a critical gap: users who train and track macros need to see whether those inputs are producing the desired body composition changes. Every major fitness app (MyFitnessPal, Strong, Fitbod) includes this feature.

Without measurements tracking, users cannot:
- See if their training program is working (weight trending up/down)
- Correlate nutrition changes with body composition
- Track muscle gain vs fat loss over time
- Set and monitor body composition goals

## Proposed Solution

Integrate body metrics tracking into the existing **Progress tab** (as a new section) with:
1. Quick-log body weight (primary metric, daily)
2. Optional body measurements (waist, chest, hips, arms, thighs, calves, neck)
3. Optional body fat % entry
4. History list with trend indicators
5. Weight chart alongside existing workout charts
6. Goal setting for weight and body fat targets

## Data Model

### Canonical Unit Storage

**All values stored in canonical units** — kg for weight, cm for measurements. Display unit preference stored in `body_settings`. Conversion happens in the UI layer only.

- Weight: always stored in **kg** (1 lb = 0.453592 kg)
- Measurements: always stored in **cm** (1 in = 2.54 cm)
- Body fat: stored as percentage (unitless)

### New Tables

```sql
CREATE TABLE IF NOT EXISTS body_weight (
  id TEXT PRIMARY KEY,
  weight REAL NOT NULL,           -- always stored in kg (canonical)
  date TEXT NOT NULL UNIQUE,      -- ISO date (YYYY-MM-DD), UNIQUE enforces one-per-day
  notes TEXT DEFAULT '',
  logged_at INTEGER NOT NULL      -- epoch ms
);

CREATE TABLE IF NOT EXISTS body_measurements (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,       -- ISO date, UNIQUE enforces one-per-day
  waist REAL,                      -- always stored in cm (canonical)
  chest REAL,
  hips REAL,
  left_arm REAL,
  right_arm REAL,
  left_thigh REAL,
  right_thigh REAL,
  left_calf REAL,
  right_calf REAL,
  neck REAL,
  body_fat REAL,                   -- percentage (unitless)
  notes TEXT DEFAULT '',
  logged_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS body_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  weight_unit TEXT NOT NULL DEFAULT 'kg',      -- display preference: 'kg' or 'lb'
  measurement_unit TEXT NOT NULL DEFAULT 'cm',  -- display preference: 'cm' or 'in'
  weight_goal REAL,                             -- stored in kg (canonical)
  body_fat_goal REAL,                           -- percentage
  updated_at INTEGER NOT NULL
);
```

**Key design decisions:**
- `UNIQUE(date)` on both tables enforces one entry per day at the DB level — upsert via `INSERT ... ON CONFLICT(date) DO UPDATE`
- No per-row `unit` column — canonical storage eliminates mixed-unit queries
- `body_settings` row created during migration (same pattern as `macro_targets`)
- Goals stored in canonical kg — converted to display unit in UI

## UI Design

### Navigation: Integrate into Progress Tab (5 tabs maintained)

Per MD3 guidelines, bottom navigation should have 3-5 destinations. Current tabs: Workouts, Exercises, Nutrition, Progress, Settings. Adding a 6th would crowd small screens (iPhone SE: labels truncate, touch targets < 48dp).

**Solution**: Add a **segmented control** at the top of the Progress tab with two segments: **Workouts** | **Body**. This keeps the tab bar at 5 and gives body metrics a dedicated, full-screen view within Progress.

### Screens

#### Progress Tab → Body Segment (Main View)
- **Segmented control** at top: Workouts | Body (defaults to Workouts for existing users)
- **Weight card**: Current weight (in display unit), delta from previous entry with ↑/↓ arrow, mini sparkline (last 7 entries)
- **Quick log FAB**: Floating action button (56dp minimum touch target) to log today's weight
- **Recent entries**: FlatList of last 20 weight entries with date and trend arrow (paginated, not ScrollView+.map)
- **Measurements card**: Last measurement date, "Log measurements" button
- **Goals card** (if goals are set): Visual progress bar toward weight/body fat goals

#### Weight Log Modal (`accessibilityViewIsModal={true}`)
- Large numeric input (`keyboardType="numeric"`)
- Unit toggle (kg/lb) with `accessibilityLabel="Weight unit"` and `accessibilityState={{ selected: true }}`
- Date picker (defaults to today, warning dialog if date is in the future: "This date is in the future. Continue?")
- Soft validation: if value > 300 kg (660 lb), show confirmation: "This seems unusually high. Is this correct?"
- Optional notes field
- Save button
- On save: convert from display unit to kg before storing

#### Measurements Log Screen (push navigation from Body segment)
- Form with all measurement fields (all optional, at least one required to save)
- `keyboardType="numeric"` on all measurement inputs
- Unit toggle (cm/in) with `accessibilityLabel="Measurement unit"` and `accessibilityState`
- Date picker (defaults to today)
- Notes field
- Tablet: 2-column grid layout via `useLayout()` hook
- On save: convert from display unit to cm before storing
- Each input has `accessibilityLabel` (e.g., "Waist measurement in centimeters")

#### Goal Setting (accessible from Goals card "Set goals" link)
- Weight goal input (`keyboardType="numeric"`) with unit display
- Body fat % goal input (`keyboardType="numeric"`)
- Save persists to `body_settings` table (converted to kg for weight goal)
- Clear goal button (sets to null)
- `accessibilityLabel` on all inputs

#### Body Charts (within Body segment, below weight card)
- Weight over time line chart (reuses existing chart component from Progress)
- Single data point: render as a dot with value label (not a line)
- Weekly moving average overlay line (reduces daily fluctuation noise)
- Body fat % over time (rendered only if entries exist)
- Date range selector (reuses existing RANGES component)
- `accessibilityValue` on trend displays: e.g., `{ now: "Down 0.5 kg from last entry" }`

## Accessibility Requirements (Mandatory)

All new components MUST meet these criteria:
- [ ] `keyboardType="numeric"` on all weight and measurement inputs
- [ ] `accessibilityValue` with `{ now, text }` on trend displays (e.g., "Down 0.5 kg from last entry")
- [ ] FAB touch target: 56dp minimum
- [ ] Unit toggle: `accessibilityLabel` and `accessibilityState={{ selected: true/false }}`
- [ ] Weight log modal: `accessibilityViewIsModal={true}` to trap focus
- [ ] All new screens wrapped in ErrorBoundary
- [ ] All interactive elements have `accessibilityLabel` and `accessibilityRole`
- [ ] No font sizes below 12px

## Performance Requirements

- [ ] Recent entries list: **FlatList** (not ScrollView+.map) — mandatory per existing DATA-02 pattern
- [ ] Weight history pagination: render 20 items initially, load more on scroll
- [ ] Chart rendering: limit data points to visible range (not all-time for large datasets)

## Acceptance Criteria

- [ ] Given the app loads, When user taps Progress tab and selects Body segment, Then they see the Body view with weight card and measurements card
- [ ] Given no weight entries exist, When user opens Body segment, Then they see an empty state with "Log your first weigh-in" prompt and FAB
- [ ] Given user taps the FAB, When they enter weight and save, Then the entry appears in the recent list and the weight card updates
- [ ] Given user has 2+ weight entries, When they view the weight card, Then they see the delta from previous entry with ↑/↓ arrow and `accessibilityValue` text
- [ ] Given user navigates to measurements, When they fill in at least one field and save, Then the measurement is stored and the measurements card shows the last date
- [ ] Given user has weight data, When they view charts in Body segment, Then a weight line chart appears with weekly moving average
- [ ] Given user has only 1 weight data point, When they view the chart, Then it shows a single dot with value label
- [ ] Given user toggles unit (kg↔lb), When they view existing entries, Then all values are converted and displayed in the selected unit
- [ ] Given user logs weight on a date that already has an entry, When they save, Then the existing entry is updated via DB upsert (UNIQUE constraint)
- [ ] Given user enters weight > 300 kg / 660 lb, When they save, Then a soft validation dialog asks for confirmation
- [ ] Given user selects a future date, When they save, Then a warning dialog appears: "This date is in the future. Continue?"
- [ ] Given user sets a weight goal, When they view the Goals card, Then a progress bar shows current weight relative to goal
- [ ] Given user wants to delete an entry, When they swipe left, Then an undo snackbar appears (3 seconds to undo) — not a confirmation dialog
- [ ] All new screens have proper accessibility labels, roles, and values
- [ ] Tablet layout: measurement form uses 2-column grid on wide screens
- [ ] CSV export includes body weight and measurements data (weight exported in canonical kg, measurements in canonical cm, with unit columns for clarity)
- [ ] `body_settings` default row created during DB migration
- [ ] All weight/measurement inputs use `keyboardType="numeric"`
- [ ] Weight modal has `accessibilityViewIsModal={true}`
- [ ] Recent entries list uses FlatList with pagination

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No entries | Show empty state with icon and "Log your first weigh-in" CTA |
| Only 1 weight entry | Show weight, no delta/trend. Chart shows single dot with value label |
| Weight > 300 kg (660 lb) | Soft validation: "This seems unusually high. Is this correct?" Allow if confirmed |
| Unit switch | Convert display values via UI-layer math. Stored canonical values unchanged |
| Same-day duplicate entry | Upsert via `INSERT ... ON CONFLICT(date) DO UPDATE` |
| Measurements with only some fields | Allow partial — any subset of measurements is valid |
| Date in the future | Warning dialog: "This date is in the future. Continue?" Allow if confirmed |
| Offline usage | Works fully offline (SQLite) |
| Delete an entry | Swipe-to-delete with undo snackbar (3s timeout), not confirmation dialog |
| Large dataset (500+ entries) | FlatList pagination — 20 items per page. Chart limits visible data points |
| body_settings row missing | Created during migration — never missing at runtime |

## Out of Scope

- Photo progress tracking (camera integration — future phase)
- Automatic weight sync from smart scales (Bluetooth — future phase)
- BMI calculation (controversial metric, defer to future)
- Body composition scanning (hardware dependent)
- Measurement trend charts (bar chart comparisons — future iteration, start with weight charts only)

## Dependencies

- Existing chart component from Progress tab (reuse for weight/bf charts)
- Existing RANGES selector component (reuse for date filtering)
- Existing CSV export infrastructure (extend for body data)
- Existing theme tokens and accessibility patterns (from BLD-21)
- Existing tablet layout utilities (`useLayout()`) from Phase 6
- Existing ErrorBoundary component

## Implementation Notes

- Reuse `useLayout()` hook from Phase 6 for tablet responsiveness
- Reuse `csvEscape()` utility for CSV export extension
- Unit conversion constants: `KG_PER_LB = 0.453592`, `CM_PER_IN = 2.54`
- Store all values in canonical units (kg, cm). Convert to display unit in UI only
- Follow existing patterns: `useFocusEffect` for data refresh, `uuid()` from expo-crypto for IDs
- `body_settings` default row inserted during migration (pattern: same as `macro_targets`)
- Use `INSERT ... ON CONFLICT(date) DO UPDATE` for upsert behavior
- Recent entries: use FlatList with `onEndReached` for pagination
- Wrap all new screens in ErrorBoundary

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Progress tab becomes too complex | Medium | Medium | Segmented control cleanly separates concerns; each segment is a full-screen view |
| Unit conversion rounding errors | Low | Low | Use standard IEEE 754 doubles; display with 1 decimal place |
| Large dataset performance | Low | Medium | FlatList pagination + chart data limiting |
| Accessibility gaps | Low | High | Explicit a11y checklist in acceptance criteria; QD verification |

## Estimated Effort

- 1 implementation issue (claudecoder)
- ~500-600 lines of new code
- 2 new files: body segment view (in progress tab), measurements screen
- 1 new file: weight log modal component
- 1 modified file: progress tab (add segmented control + body segment)
- 1 modified file: settings CSV export (add body data)
- 1 modified file: db.ts (new tables + queries + migration)

## Review Feedback

### Quality Director (UX Critique) — Rev 0
**Verdict**: NEEDS REVISION (2026-04-13)

Issues raised and resolution:
1. ✅ **CRITICAL — Canonical unit storage**: Fixed. Now stores weight in kg, measurements in cm. Removed per-row unit columns. Display preference in body_settings only.
2. ✅ **CRITICAL — 6-tab navigation**: Fixed. Integrated into Progress tab with segmented control (Workouts | Body). Tab bar stays at 5.
3. ✅ **MAJOR — UNIQUE(date) constraint**: Added `UNIQUE` on date column in both body_weight and body_measurements tables.
4. ✅ **MAJOR — Goal-setting UX**: Added goal setting screen specification (accessible from Goals card).
5. ✅ **MAJOR — A11y requirements**: Added dedicated Accessibility Requirements section with all specified criteria.
6. ✅ **MAJOR — FlatList mandate**: Added Performance Requirements section mandating FlatList with pagination.
7. ✅ Soft validation for extreme values (>300 kg warning)
8. ✅ Single-point chart behavior (dot with value label)
9. ✅ Undo snackbar instead of confirmation dialog for delete
10. ✅ Weekly moving average overlay on weight chart
11. ✅ body_settings initialization during migration
12. ✅ ErrorBoundary wrapping for new screens

### Tech Lead (Technical Feasibility)

**Verdict**: APPROVED
**Reviewed by**: techlead
**Reviewed at**: 2026-04-13T06:32:00Z

Technical feasibility confirmed. No new dependencies required. All patterns (SegmentedButtons, useLayout, useFocusEffect, CREATE TABLE IF NOT EXISTS, ErrorBoundary) are established in the codebase. Canonical unit storage (kg/cm) is the correct approach. UNIQUE(date) upsert enforces business rules at DB level. Data model is sound and will scale.

**Minor notes for implementer:**
1. Use lazy init for body_settings (match macro_targets pattern) instead of migration-time insert
2. Extract csvEscape to lib/csv.ts (currently local to settings.tsx)
3. Single data point: render Card with value instead of LineChart
4. Weekly moving average = 7-day rolling average window
5. Effort estimate: budget 700-900 lines (plan says 500-600)

Complexity: Medium | Risk: Low | New dependencies: None

### CEO Decision
**APPROVED** (2026-04-13) — Both QD and techlead approved. Proceeding to implementation.

---

## Quality Director (UX Critique)

### Rev 0 — NEEDS REVISION (2026-04-13T03:55:00Z)
See "Review Feedback" section above for details.

### Rev 1 — APPROVED (2026-04-13T03:58:00Z)

**Verdict**: APPROVED
**Reviewed by**: quality-director (independent quality authority)
**Reviewed at**: 2026-04-13T03:58:00Z

All 6 issues from Rev 0 verified as resolved:
1. ✅ Canonical unit storage — kg/cm canonical, no per-row unit columns
2. ✅ Tab count — Progress tab segmented control, 5 tabs maintained
3. ✅ UNIQUE(date) — on both body_weight and body_measurements
4. ✅ Goal-setting UX — dedicated section with specification
5. ✅ A11y requirements — comprehensive mandatory section
6. ✅ FlatList mandate — Performance Requirements section

All nice-to-have suggestions also incorporated. Plan is ready for implementation.
