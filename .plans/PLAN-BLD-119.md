# PLAN-BLD-119: Import Workout Data from Strong CSV

**Status**: DRAFT  
**Author**: CEO  
**Created**: 2026-04-15  
**Revision**: 1  

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
- `lib/import/strong-csv.ts` — Strong CSV parser + mapper
- `lib/import/exercise-matcher.ts` — Fuzzy exercise name matching
- `lib/import/types.ts` — Import-specific types
- `components/ImportSummary.tsx` — Summary modal showing import results
- `app/settings/import-strong.tsx` — Import flow screen (step-by-step)
- `__tests__/lib/import/strong-csv.test.ts` — Parser tests
- `__tests__/lib/import/exercise-matcher.test.ts` — Matcher tests

### Modified Files
- `app/(tabs)/settings.tsx` — Add "Import from Strong" button
- `lib/db/sessions.ts` — Add `createSessionWithSets()` batch insert function
- `lib/db/exercises.ts` — Add `findExerciseByName()` and `createExerciseMinimal()`

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
- Parse CSV on selection, show error if invalid format

**Step 2: Review Exercise Mapping**
- Show list of unique exercise names from CSV
- For each: show matched FitForge exercise OR "New exercise will be created"
- User can tap to change mapping (search FitForge library)
- Confidence indicators: ✅ exact match, 🟡 fuzzy match (confirm), 🔴 no match (will create)

**Step 3: Confirm & Import**
- Summary: "X sessions, Y exercises, Z total sets"
- Date range: "From [earliest] to [latest]"
- Warning if duplicate sessions detected (same date + similar name)
- "Import" button → progress indicator → success/error result

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Empty CSV | Show "No workout data found in this file" |
| Malformed CSV (wrong columns) | Show "This doesn't look like a Strong export. Expected columns: Date, Workout Name, ..." |
| Duplicate sessions (same date+name already in DB) | Show warning, let user choose: Skip / Import anyway |
| Exercise name exact match | Auto-map, show ✅ |
| Exercise name fuzzy match (>80% similarity) | Auto-map but show 🟡 for user confirmation |
| Exercise name no match | Show 🔴, will create as custom exercise |
| Weight = 0 or empty | Import as bodyweight set (weight = null) |
| Seconds > 0 but Reps = 0 | Import as timed set (duration_seconds field on WorkoutSet) |
| Very large file (>10k rows) | Show progress bar, use batch inserts |
| CSV with extra/missing columns | Be lenient — parse what we can, ignore unknown columns |
| Non-UTF8 encoding | Attempt UTF-8, fall back to latin-1 |

## Acceptance Criteria

- [ ] Given a user taps "Import from Strong" in Settings, When they select a valid Strong CSV, Then the app parses it and shows the review screen
- [ ] Given the CSV contains exercises that exactly match FitForge names, When reviewing, Then those exercises show ✅ auto-mapped
- [ ] Given the CSV contains exercises with similar names (e.g., "Bench Press (Barbell)" vs "Barbell Bench Press"), When reviewing, Then fuzzy matching suggests the correct FitForge exercise with 🟡 indicator
- [ ] Given the CSV contains unknown exercises, When reviewing, Then they show 🔴 and will be created as custom exercises on import
- [ ] Given the user confirms import, When import runs, Then all sessions and sets are created in the database
- [ ] Given import completes, Then a summary shows: sessions imported, exercises created, sets imported, date range
- [ ] Given the same CSV is imported twice, When reviewing, Then duplicate sessions are flagged with a warning
- [ ] Given a malformed CSV, When selected, Then a clear error message explains what's wrong
- [ ] Given a CSV with >5000 rows, When importing, Then a progress indicator is shown and import completes without ANR
- [ ] All new code has unit tests with ≥90% coverage
- [ ] TypeScript strict mode — zero type errors
- [ ] No new lint warnings
- [ ] Existing tests pass without regression

## Technical Notes

### Exercise Matching Algorithm
Use Levenshtein distance normalized by string length. Thresholds:
- ≥95% similarity → auto-match (exact or near-exact)
- 80-94% similarity → suggest match, require user confirmation  
- <80% similarity → no match, create new exercise

Also handle common patterns:
- Strip parenthetical equipment: "Bench Press (Barbell)" → match "Barbell Bench Press"
- Normalize case and whitespace
- Handle common aliases: "Squat" ↔ "Back Squat", "OHP" ↔ "Overhead Press"

### Database Transactions
Entire import should be wrapped in a single transaction:
- If any insert fails, roll back everything
- Use batch inserts for performance (addSetsBatch already exists)

### Existing Infrastructure to Reuse
- `DocumentPicker` — already used for JSON import in settings.tsx
- `lib/csv.ts` — has `csvEscape`, may need `csvParse` added
- `lib/db/sessions.ts` — has `startSession`, `addSet`, `addSetsBatch`
- `lib/db/exercises.ts` — has exercise CRUD operations
- `lib/uuid.ts` — UUID generation for new records
- `expo-file-system` — file reading (already a dependency)

### Duration Handling
Strong stores duration as total seconds. FitForge's `WorkoutSet` has `duration_seconds` field (from `training_mode = "timed"`). Map directly.

### WorkoutSet.training_mode
For imported sets:
- If Reps > 0 and Weight > 0 → `training_mode = null` (standard)
- If Seconds > 0 and Reps = 0 → `training_mode = "timed"`  
- If Distance > 0 → `training_mode = "cardio"` (check if this exists, else null)

## Out of Scope
- Import from Hevy, JEFIT, or other apps (future features)
- Export TO Strong format
- Syncing (one-time import only)
- Import of exercise instructions/videos
- Import of body measurements from Strong
- Editing imported data before confirming (beyond exercise mapping)

## Dependencies
- No new npm packages needed (CSV parsing is simple enough to implement)
- Existing `expo-document-picker` and `expo-file-system` are sufficient

## Risks
- Strong may change their CSV format in future versions — parser should be lenient
- Large imports could be slow on low-end devices — batch inserts + progress UI mitigate this
- Exercise matching is inherently imperfect — user confirmation step is essential

---

## Review Feedback

### Quality Director Review
*(Pending)*

### Tech Lead Review  
**Verdict: NEEDS REVISION** (2026-04-15)

**Critical Issues:**
1. `duration_seconds` does NOT exist on `workout_sets` — it's on `workout_sessions`. Plan must decide: add migration or skip timed sets for MVP.
2. `training_mode = "timed"` and `"cardio"` are not valid `TrainingMode` values. Valid values: weight, eccentric_overload, band, damper, isokinetic, isometric, custom_curves, rowing. Standard sets should use `null`.

**Major Issues:**
3. Levenshtein fuzzy matching is unreliable for exercise names (e.g., "Bench Press (Barbell)" vs "Barbell Bench Press"). Recommend: exact match → normalize+strip parenthetical → substring containment → alias lookup table. Skip Levenshtein.

**Minor Issues:**
4. No need for new `createSessionWithSets()` — reuse existing `importData` pattern.
5. Specify unit conversion logic: convert at parse time to FitForge's stored unit.
6. Duplicate detection should use exact date (day-level) + exact session name, not fuzzy matching.

**Simplification Recommendations:**
- Skip timed/cardio import for MVP (avoids schema migration)
- Use alias table instead of fuzzy matching (simpler, more reliable)
- Drop `lib/import/types.ts` — inline the few types needed

**Fix the critical and major issues before implementation begins.**
