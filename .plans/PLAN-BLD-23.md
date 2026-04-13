# PLAN: Body Weight & Measurements Tracking (Phase 7)

**BLD-23** | Priority: High | Project: FitForge

## Problem Statement

FitForge tracks workouts and nutrition but has no way to track body metrics — weight, body fat %, and body measurements (waist, chest, arms, etc.). This is a critical gap: users who train and track macros need to see whether those inputs are producing the desired body composition changes. Every major fitness app (MyFitnessPal, Strong, Fitbod) includes this feature.

Without measurements tracking, users cannot:
- See if their training program is working (weight trending up/down)
- Correlate nutrition changes with body composition
- Track muscle gain vs fat loss over time
- Set and monitor body composition goals

## Proposed Solution

Add a **Body** tab (or integrate into Progress tab) with:
1. Quick-log body weight (primary metric, daily)
2. Optional body measurements (waist, chest, hips, arms, thighs, calves, neck)
3. Optional body fat % entry
4. History list with trend indicators
5. Integration with the existing Progress charts tab

## Data Model

### New Tables

```sql
CREATE TABLE IF NOT EXISTS body_weight (
  id TEXT PRIMARY KEY,
  weight REAL NOT NULL,          -- stored in user's preferred unit
  unit TEXT NOT NULL DEFAULT 'kg', -- 'kg' or 'lb'
  date TEXT NOT NULL,             -- ISO date (YYYY-MM-DD)
  notes TEXT DEFAULT '',
  logged_at INTEGER NOT NULL      -- epoch ms
);

CREATE TABLE IF NOT EXISTS body_measurements (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,              -- ISO date
  waist REAL,                      -- cm or in
  chest REAL,
  hips REAL,
  left_arm REAL,
  right_arm REAL,
  left_thigh REAL,
  right_thigh REAL,
  left_calf REAL,
  right_calf REAL,
  neck REAL,
  body_fat REAL,                   -- percentage
  unit TEXT NOT NULL DEFAULT 'cm', -- 'cm' or 'in'
  notes TEXT DEFAULT '',
  logged_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS body_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  weight_unit TEXT NOT NULL DEFAULT 'kg',    -- 'kg' or 'lb'
  measurement_unit TEXT NOT NULL DEFAULT 'cm', -- 'cm' or 'in'
  weight_goal REAL,
  body_fat_goal REAL,
  updated_at INTEGER NOT NULL
);
```

## UI Design

### Option A: New "Body" Tab (Recommended)
Add a 6th tab with body icon (MaterialCommunityIcons: `human`).

**Pros**: Clear separation, dedicated space, doesn't clutter Progress tab.
**Cons**: 6 tabs may feel crowded on small phones.

### Option B: Sub-section in Progress Tab
Add a "Body" card/section at the top of the Progress tab.

**Pros**: Fewer tabs, body data alongside workout charts.
**Cons**: Progress tab gets busy, harder to navigate.

### Recommendation: Option A (New Tab)
The tab bar already has 5 tabs (Workouts, Exercises, Nutrition, Progress, Settings). Adding a 6th is fine — Material Design 3 supports up to 5-7 tabs. The "Body" tab sits naturally between Nutrition and Progress.

### Screens

#### Body Tab (Main)
- **Weight card**: Current weight, change from last entry, mini sparkline (last 7 entries)
- **Quick log FAB**: Floating action button to quickly log today's weight
- **Recent entries list**: Last 10 weight entries with date and trend arrow
- **Measurements card**: Last measurement date, quick link to log new measurements
- **Goals card** (if set): Progress toward weight/body fat goals

#### Weight Log Modal
- Numeric input for weight (large, easy to type)
- Unit toggle (kg/lb) — persisted in settings
- Date picker (defaults to today)
- Optional notes field
- Save button

#### Measurements Log Screen
- Form with all measurement fields (all optional except at least one)
- Unit toggle (cm/in) — persisted in settings
- Date picker
- Notes field
- Save button

#### Body Progress Charts (integrated into Progress tab)
- Weight over time line chart (reuses existing chart component)
- Body fat % over time (if entries exist)
- Measurement comparisons (bar chart: left vs right, over time)
- Date range selector (reuses existing RANGES component)

## Acceptance Criteria

- [ ] Given the app loads, When user taps the Body tab, Then they see the Body main screen with weight card and measurements card
- [ ] Given no weight entries exist, When user opens Body tab, Then they see an empty state with "Log your first weigh-in" prompt
- [ ] Given user taps the FAB, When they enter weight and save, Then the entry appears in the recent list and the weight card updates
- [ ] Given user has 2+ weight entries, When they view the weight card, Then they see the change (delta) from the previous entry with up/down arrow
- [ ] Given user navigates to measurements, When they fill in at least one field and save, Then the measurement is stored and the measurements card shows the last date
- [ ] Given user has weight data, When they view the Progress tab, Then a weight chart appears alongside workout charts
- [ ] Given user toggles unit (kg↔lb), When they view existing entries, Then all values are displayed in the selected unit
- [ ] Given user logs weight on a date that already has an entry, When they save, Then the existing entry is updated (not duplicated)
- [ ] All new screens have proper accessibility labels (a11y requirement from BLD-21)
- [ ] Tablet layout: measurement form uses 2-column grid on wide screens
- [ ] CSV export includes body weight and measurements data (extends existing export)

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No entries | Show empty state with illustration and CTA |
| Only 1 weight entry | Show weight but no delta/trend |
| Very large weight values (>500 kg) | Allow but don't break layout |
| Unit switch with existing data | Convert display values, store remains in original unit |
| Same-day duplicate entry | Upsert — update existing entry for that date |
| Measurements with only some fields | Allow partial — any subset of measurements is valid |
| Date in the future | Allow (some users pre-log) |
| Offline usage | Works fully offline (SQLite) |
| Delete an entry | Swipe-to-delete with confirmation |

## Out of Scope

- Photo progress tracking (camera integration — future phase)
- Automatic weight sync from smart scales (Bluetooth — future phase)
- BMI calculation (controversial metric, defer to future)
- Body composition scanning (hardware dependent)

## Dependencies

- Existing chart component from Progress tab (reuse for weight/bf charts)
- Existing RANGES selector component (reuse for date filtering)
- Existing CSV export infrastructure (extend for body data)
- Existing theme tokens and accessibility patterns (from BLD-21)
- Existing tablet layout utilities from Phase 6

## Implementation Notes

- Reuse `useLayout()` hook from Phase 6 for tablet responsiveness
- Reuse `csvEscape()` utility for CSV export extension
- Weight unit conversion: 1 kg = 2.20462 lb, 1 cm = 0.393701 in
- Store raw values in user's preferred unit; convert on display only
- Follow existing patterns: `useFocusEffect` for data refresh, `uuid()` from expo-crypto for IDs

## Estimated Effort

- 1 implementation issue (claudecoder)
- ~400-500 lines of new code
- 3 new files: body tab, weight modal, measurements screen
- 1 modified file: progress charts (add weight chart)
- 1 modified file: settings CSV export (add body data)
- 1 modified file: db.ts (new tables + queries)
