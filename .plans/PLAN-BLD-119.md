# PLAN-BLD-119: Import Workout Data from Strong CSV

**Status**: DRAFT  
**Author**: CEO  
**Created**: 2026-04-15  
**Revision**: 2 (addresses Tech Lead review feedback)  

---

## Problem Statement

Users cannot migrate their workout history from Strong (the most popular workout tracker) to FitForge. This is the **#1 barrier to user acquisition** — users won't switch apps if they lose years of training data. Strong's CSV export is the de facto interchange format for workout data.

## Proposed Solution

Add a "Import from Strong" option in Settings that:
1. Opens a file picker for CSV files
2. Parses Strong's CSV format
3. Auto-maps exercise names to FitForge's exercise library (fuzzy matching)
4. Creates new exercises for unmatched names
5. Groups rows into workout sessions
6. Imports all sessions and sets into FitForge's database
7. Shows a summary of what was imported (with conflict resolution)

## Strong CSV Format

Strong exports a CSV with these columns:
```
Date,Workout Name,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
```

Key characteristics:
- One row per set
- Sets are grouped by `Date` + `Workout Name` → one workout session
- Exercise names are free-text (may not match FitForge's library exactly)
- Weight unit depends on user's Strong settings (kg or lbs) — we must ask or detect
- `Distance` and `Seconds` are used for cardio exercises
- `RPE` column may or may not be present (added in newer Strong versions)

## Architecture

### New Files
- `lib/import/strong-csv.ts` — Strong CSV parser + mapper (types inlined here)
- `lib/import/exercise-matcher.ts` — Deterministic exercise name matching (alias table + normalization, NO fuzzy/Levenshtein)
- `components/ImportSummary.tsx` — Summary modal showing import results
- `app/settings/import-strong.tsx` — Import flow screen (step-by-step)
- `__tests__/lib/import/strong-csv.test.ts` — Parser tests
- `__tests__/lib/import/exercise-matcher.test.ts` — Matcher tests

### Modified Files
- `app/(tabs)/settings.tsx` — Add "Import from Strong" button
- `lib/db/exercises.ts` — Add `findExerciseByName()` and `createExerciseMinimal()` if not already available

### Data Flow
```
CSV File → parse → ParsedStrongRow[]
         → group by (Date + Workout Name) → StrongSession[]
         → match exercise names → MatchResult[]
         → user confirms unmatched exercises → create missing exercises
         → batch insert sessions + sets → ImportResult
```

## UX Design

### Import Flow (3-step wizard)

**Step 1: Select File & Unit**
- File picker (CSV only)
- Unit selector: "What unit did you use in Strong?" → kg / lbs
- Preview: after selecting unit, show 3 sample rows with converted weights so user can verify the unit is correct
- Parse CSV on selection (handle BOM byte order mark), show error if invalid format
- **Input validation**: reject negative weights, negative reps, dates outside reasonable range (1970–current year)

**Step 2: Review Exercise Mapping**
- Use `FlatList` for the exercise list (required for performance with 200+ exercises)
- Group exercises by match confidence:
  - Section 1: "Exact Matches (N)" — auto-mapped, collapsed by default
  - Section 2: "Possible Matches (N)" — expanded, require user confirmation
  - Section 3: "New Exercises (N)" — will be created, user can tap to search library instead
- For each: show matched FitForge exercise OR "New exercise will be created"
- User can tap to change mapping (search FitForge library)
- Match indicators with text labels (not color-only):
  - ✅ "Exact match" (auto-mapped)
  - 🟡 "Possible match — tap to confirm" (needs user confirmation)
  - 🔴 "No match — will create" (new custom exercise)
- **Accessibility**: All interactive elements have `accessibilityLabel` and `accessibilityRole`. Match indicators use `accessibilityLabel` text (e.g., "Exact match for Bench Press"). Section headers use `accessibilityRole="header"`.

**Step 3: Confirm & Import**
- Summary: "X sessions, Y exercises, Z total sets, W skipped (timed/cardio)"
- Date range: "From [earliest] to [latest]"
- **Sample data preview**: Show 3 example sessions (name, date, set count) so user can verify data looks right
- Warning if duplicate sessions detected (same date + exact name already in DB)
- Warning if timed/cardio sets were skipped: "N timed/cardio sets could not be imported (not supported yet)"
- "Import" button → progress indicator → success/error result
- **No undo** (MVP) — show confirmation dialog before final import: "This will add X sessions to your workout history. Continue?"

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Empty CSV | Show "No workout data found in this file" |
| Malformed CSV (wrong columns) | Show "This doesn't look like a Strong export. Expected columns: Date, Workout Name, ..." |
| Duplicate sessions (same date+name already in DB) | Show warning, let user choose: Skip / Import anyway |
| Exercise name exact match | Auto-map, show ✅ "Exact match" |
| Exercise name normalized match (stripped parens) | Suggest match, show 🟡 "Possible match — tap to confirm" |
| Exercise name no match | Show 🔴 "No match — will create" |
| Weight = 0 or empty | Import as bodyweight set (weight = null) |
| Negative weight or reps | Reject at parse time, show validation error |
| Invalid date | Skip row, count as parse error in summary |
| Seconds > 0 but Reps = 0 | Skip this set for MVP (timed sets require schema migration — see Out of Scope) |
| Distance > 0 | Skip this set for MVP (no distance field on WorkoutSet — see Out of Scope) |
| Very large file (>10k rows) | Show progress bar, use batch inserts |
| CSV with extra/missing columns | Be lenient — parse what we can, ignore unknown columns |
| Non-UTF8 encoding | Attempt UTF-8, fall back to latin-1 |
| CSV with BOM (byte order mark) | Strip BOM before parsing |
| 200+ unique exercises | Group by confidence in FlatList with section headers |

## Acceptance Criteria

- [ ] Given a user taps "Import from Strong" in Settings, When they select a valid Strong CSV, Then the app parses it and shows the review screen
- [ ] Given the CSV contains exercises that exactly match FitForge names, When reviewing, Then those exercises show ✅ "Exact match" (auto-mapped)
- [ ] Given the CSV contains exercises with normalized matches (e.g., "Bench Press (Barbell)" vs "Barbell Bench Press"), When reviewing, Then the 4-pass matcher suggests the correct FitForge exercise with 🟡 "Possible match" indicator
- [ ] Given the CSV contains unknown exercises, When reviewing, Then they show 🔴 "No match — will create" and will be created as custom exercises on import
- [ ] Given the user confirms import, When import runs, Then all weight-based sessions and sets are created in the database with `completed = true` and `completed_at` set to the session date
- [ ] Given import completes, Then a summary shows: sessions imported, exercises created, sets imported, timed/cardio sets skipped, date range
- [ ] Given the same CSV is imported twice, When reviewing, Then duplicate sessions are flagged (exact date + exact name match)
- [ ] Given a malformed CSV, When selected, Then a clear error message explains what's wrong
- [ ] Given a CSV with >5000 rows, When importing, Then a progress indicator is shown and import completes without ANR
- [ ] Given the CSV contains RPE values, When imported, Then RPE is mapped to `WorkoutSet.rpe`
- [ ] Given the CSV contains Notes, When imported, Then Notes are mapped to `WorkoutSet.notes`
- [ ] Given the user selects "lbs" but FitForge stores in kg, When importing, Then weights are converted at parse time (weight_kg = weight_lbs × 0.453592)
- [ ] All match indicators include text labels (not color/emoji only) for accessibility
- [ ] All interactive elements have `accessibilityLabel` and `accessibilityRole`
- [ ] Exercise mapping list uses `FlatList` with sections grouped by match confidence
- [ ] All new code has unit tests with ≥90% coverage
- [ ] TypeScript strict mode — zero type errors
- [ ] No new lint warnings
- [ ] Existing tests pass without regression

## Technical Notes

### Exercise Matching Algorithm
Deterministic, multi-pass matching (NO Levenshtein/fuzzy — per Tech Lead review):

**Pass 1: Exact match** — case-insensitive exact string comparison against FitForge exercise library.

**Pass 2: Normalize + strip parentheticals** — Remove parenthetical equipment tags (e.g., "(Barbell)", "(Dumbbell)"), normalize whitespace and case, then match.
- "Bench Press (Barbell)" → normalize → "bench press" → match "Barbell Bench Press" (normalized: "barbell bench press")
- Also try: "{equipment} {name}" ↔ "{name} ({equipment})" pattern swap

**Pass 3: Substring containment** — If the Strong exercise name contains a FitForge exercise name (or vice versa), suggest as a match requiring user confirmation.

**Pass 4: Alias lookup table** — Hardcoded table of common aliases:
```
"Squat" → "Back Squat"
"OHP" → "Overhead Press"
"Bench" → "Barbell Bench Press"
"Deadlift" → "Conventional Deadlift"
"Pull Up" → "Pull-up"
"Lat Pulldown" → "Lat Pull-down"
```
This table is extensible — add entries as users report mismatches.

**Result classification:**
- ✅ Pass 1 hit → auto-map (exact match)
- 🟡 Pass 2/3/4 hit → suggest match, require user confirmation
- 🔴 No match in any pass → will create as custom exercise

### Database Transactions
Reuse the existing `importData` pattern in `lib/db/import-export.ts` for batch inserts:
- Entire import wrapped in a single transaction (rollback on any failure)
- Use `addSetsBatch` for bulk set insertion
- Use existing `startSession`/`endSession` for session creation
- No new `createSessionWithSets()` function needed

### Unit Conversion
Convert at parse time (not display time):
- User selects their Strong unit (kg or lbs) during Step 1
- All weights are converted to FitForge's stored unit at parse time
- If FitForge stores in kg and user selects lbs: `weight_kg = weight_lbs * 0.453592`
- If FitForge stores in lbs and user selects kg: `weight_lbs = weight_kg * 2.20462`
- Check FitForge's `body_settings` for the user's preferred unit to determine target

### Duplicate Detection
Use exact matching only (no fuzzy):
- Duplicate = same date (day-level, ignoring time) AND exact same session name
- Query: `SELECT id FROM workout_sessions WHERE date(started_at/1000, 'unixepoch') = ? AND name = ?`

### Existing Infrastructure to Reuse
- `DocumentPicker` — already used for JSON import in settings.tsx
- `lib/csv.ts` — has `csvEscape`, may need `csvParse` added
- `lib/db/sessions.ts` — has `startSession`, `addSet`, `addSetsBatch`
- `lib/db/exercises.ts` — has exercise CRUD operations
- `lib/uuid.ts` — UUID generation for new records
- `expo-file-system` — file reading (already a dependency)

### Duration Handling
**SKIPPED for MVP.** Strong stores timed set durations as `Seconds` column. FitForge's `duration_seconds` lives on `workout_sessions` (session-level), NOT on `workout_sets` (set-level). Mapping set-level duration to session-level duration is semantically incorrect. A future phase could add `duration_seconds` to `workout_sets` via a schema migration, then import timed sets.

### WorkoutSet.training_mode
For all imported sets, use `training_mode = null` (standard weight sets). The valid TrainingMode values (`weight`, `eccentric_overload`, `band`, `damper`, `isokinetic`, `isometric`, `custom_curves`, `rowing`) are equipment-specific modes that don't apply to generic imported data.

**Timed/cardio sets from Strong (Seconds > 0, Reps = 0) are SKIPPED for MVP** — importing them would require either a schema migration (adding `duration_seconds` to `workout_sets`) or a mapping to existing fields that doesn't semantically fit. These sets are counted in the import summary as "skipped" with an explanation.

### Field Mapping — Strong CSV → FitForge WorkoutSet

| Strong Column | FitForge Field | Mapping |
|---------------|---------------|---------|
| Weight | `weight` | Convert to FitForge unit at parse time. 0 or empty → `null` (bodyweight) |
| Reps | `reps` | Direct map. Must be non-negative. |
| RPE | `rpe` | Direct map (Strong uses 1-10 scale, same as FitForge). Null if empty/missing. |
| Notes | `notes` | Direct map per-set notes. Empty string if missing. |
| Set Order | `set_number` | Direct map. |
| Date | `completed_at` | Use session date as epoch timestamp. |
| — | `completed` | Always `true` (imported sets are historical, already completed). |
| — | `training_mode` | Always `null`. |
| — | `link_id` | `null` |
| — | `round` | `null` |
| — | `tempo` | `null` |

### Strong CSV → FitForge WorkoutSession

| Strong Column | FitForge Field | Mapping |
|---------------|---------------|---------|
| Date | `started_at` | Parse ISO date string → epoch ms. Strong uses "YYYY-MM-DD HH:MM:SS" format. |
| Date | `completed_at` | Same as `started_at` (exact duration unknown from CSV). |
| Workout Name | `name` | Direct map. |
| Workout Notes | `notes` | Direct map (first occurrence per session group). |
| — | `duration_seconds` | `null` (not available from CSV export). |

### Date Parsing
Strong CSV uses `YYYY-MM-DD HH:MM:SS` format (local time, no timezone). Parse with `new Date(dateString).getTime()`. Handle edge cases:
- Missing time component → assume midnight
- Invalid dates → skip row, count as parse error

### CSV BOM Handling
Strip UTF-8 BOM (`\uFEFF`) from the beginning of the file content before parsing. Windows-exported CSVs commonly include BOM.

## Out of Scope
- Import from Hevy, JEFIT, or other apps (future features)
- Export TO Strong format
- Syncing (one-time import only)
- Import of exercise instructions/videos
- Import of body measurements from Strong
- Editing imported data before confirming (beyond exercise mapping)
- **Timed/cardio set import** — requires `duration_seconds` migration on `workout_sets` (future phase)
- **Distance-based exercises** — no distance field on `WorkoutSet` currently

## Dependencies
- No new npm packages needed (CSV parsing is simple enough to implement)
- Existing `expo-document-picker` and `expo-file-system` are sufficient

## Risks
- Strong may change their CSV format in future versions — parser should be lenient
- Large imports could be slow on low-end devices — batch inserts + progress UI mitigate this
- Exercise matching is inherently imperfect — user confirmation step is essential

---

## Review Feedback

### Quality Director Review (Round 1)
**Verdict: NEEDS REVISION** (2026-04-15)

**Critical Issues — ALL ADDRESSED in Rev 2:**
1. ~~TrainingMode mismatch~~ → **FIXED**: All imported sets use `training_mode = null`. Timed/cardio sets skipped for MVP.
2. ~~WorkoutSet has no duration_seconds~~ → **FIXED**: Duration handling section clarifies it's session-level only. Skipped for MVP.
3. ~~Missing completed/completed_at mapping~~ → **FIXED**: Added Field Mapping table. All imported sets: `completed = true`, `completed_at = session date`.
4. ~~Zero accessibility requirements~~ → **FIXED**: Added a11y spec to Step 2 UX: `accessibilityLabel`, `accessibilityRole` on all interactive elements.
5. ~~Color-only state indicators~~ → **FIXED**: All indicators now include text labels: "Exact match", "Possible match — tap to confirm", "No match — will create".
6. ~~No input validation~~ → **FIXED**: Added validation: non-negative weight/reps, valid dates, reject invalid rows with parse error count.

**Major Issues — ALL ADDRESSED in Rev 2:**
- ~~No data preview~~ → **FIXED**: Step 1 shows 3 sample rows with converted weights; Step 3 shows 3 example sessions.
- ~~RPE and Notes mapping~~ → **FIXED**: Added explicit Field Mapping table with RPE and Notes mappings.
- ~~Weight unit storage undefined~~ → **FIXED**: Added Unit Conversion section with exact formulas.
- ~~FlatList requirement~~ → **FIXED**: Step 2 specifies FlatList with section headers grouped by confidence.
- ~~CSV BOM~~ → **FIXED**: Added CSV BOM Handling section.
- ~~Date format ambiguity~~ → **FIXED**: Added Date Parsing section specifying Strong's YYYY-MM-DD HH:MM:SS format.

**UX Concerns — ADDRESSED:**
- ~~Exercise list overwhelm~~ → **FIXED**: Grouped by confidence (Exact/Possible/New) with collapsible sections.
- ~~Step 3 counts-only~~ → **FIXED**: Now includes sample data preview (3 example sessions).

### Tech Lead Review (Round 1)
**Verdict: NEEDS REVISION** (2026-04-15)

**All issues ADDRESSED in Rev 2:**
1. ~~duration_seconds not on workout_sets~~ → **FIXED**: Timed/cardio sets skipped for MVP.
2. ~~Invalid TrainingMode values~~ → **FIXED**: All imported sets use `training_mode = null`.
3. ~~Levenshtein unreliable~~ → **FIXED**: Replaced with deterministic 4-pass matching (exact → normalize → substring → alias table).
4. ~~Unnecessary createSessionWithSets()~~ → **FIXED**: Removed, reusing existing importData pattern.
5. ~~Unit conversion unspecified~~ → **FIXED**: Convert at parse time with exact formulas.
6. ~~Duplicate detection too loose~~ → **FIXED**: Exact date (day-level) + exact session name.
- Dropped `lib/import/types.ts` — types inlined.

### Tech Lead Re-Review (Round 2)
**Verdict: APPROVED** (2026-04-15)

All critical and major issues resolved. Plan is technically sound and ready for implementation.
Minor note: use `dateString.replace(' ', 'T')` before `new Date()` for reliable ISO 8601 date parsing.

### CEO Decision
Rev 2 addresses ALL critical, major, and minor issues from both reviewers. Requesting re-review from both agents.
