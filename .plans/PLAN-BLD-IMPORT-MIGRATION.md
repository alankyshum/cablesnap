# Feature Plan: Import from Strong / Hevy / FitNotes (CSV migration UI)

**Issue**: BLD-2437 (PLAN)  **Author**: CEO  **Date**: 2026-07-01
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

## Research Source
- **Origin:** Reddit product-evolution research (2026-07-01). Threads: r/strongapp "Data export"/"Import export programs"/"Exporting data from Strong to Hevy", r/fitness / r/WorkoutRoutines "free workout apps".
- **Pain point observed (user words):** *"users want to import CSV files from a PC to avoid manually clicking everything in the app"*; *"some have decided to switch to Hevy … for import/export features for Strong data"*; multiple third-party web tools exist just to read exported workout CSVs.
- **Frequency:** Recurring theme across many r/strongapp threads and general "which app should I switch to" posts — not a one-off. Migration friction is a top reason users hesitate to switch trackers.

## Problem Statement
New users evaluating CableSnap almost always have workout history locked in a competitor app (Strong, Hevy, or FitNotes). Today there is **no way to bring that history in** — the exercise/session history starts empty. This is a major adoption barrier: the #1 reason people don't switch trackers is losing their logged history.

CableSnap already ships a mature **export** system (JSON full-backup, auto-backup, per-domain CSV, template share) and — critically — a **fully-built, unit-tested CSV *import* engine** that auto-detects Strong / Hevy / FitNotes / CableSnap CSV formats. **That engine has zero UI wiring** (`lib/csv-import.ts`, `lib/db/csv-import.ts` are referenced only from `__tests__/**`). We are one UI feature away from "migrate your entire history from Strong/Hevy/FitNotes in a few taps" — a strong, privacy-first, offline-first acquisition differentiator a cloud app cannot easily match.

**Why now:** the engine is done and tested (sunk cost already paid); the pipeline has capacity; and it directly serves validated user demand. Highest ROI available.

## Behavior-Design Classification (MANDATORY)
Does this shape user behavior? (see §3.2 trigger list: gamification, streaks, notifications, onboarding, rewards, motivational progress, social, habit loops, goal-setting, motivational copy, identity framing, re-engagement)
- [x] **NO** — purely functional data-portability. It imports historical rows into SQLite. No streaks, notifications, rewards, motivational copy, onboarding funnel, or re-engagement mechanics. No psychologist review required.
  - *Guard:* the preview/summary screens must stay neutral and factual ("Imported 412 sets across 37 workouts"). They must NOT add motivational/identity framing ("You're on fire! 🔥", "Look how far you've come"). If a reviewer feels the summary crosses into motivational territory, escalate to @psychologist. Copy is specified as neutral below.

## User Stories
- As a **Strong user switching to CableSnap**, I want to import my exported Strong CSV so my full training history appears in CableSnap, so that I don't lose years of logs.
- As a **Hevy or FitNotes user**, I want the same one-flow import without picking the format manually, so migration feels effortless.
- As a **returning CableSnap user** re-importing a CSV I exported earlier, I want CableSnap to **warn me if it looks like I already imported this history** (overlapping dates) before it adds anything, so I don't silently create duplicates.
- As **any importer**, I want to review how my exercise names were matched (and how many were auto-created) before I commit, so I trust the result.

## Proposed Solution

### Overview
Wire the existing import engine to a new Settings entry point that runs: **pick file → parse & detect format → preview (counts + exercise-match review + unit confirmation if ambiguous) → confirm → import (transaction, progress) → neutral summary**. Reuse the proven `import-backup.tsx` preview-screen pattern and the existing `DocumentPicker` + `expo-file-system` (SDK 55 class-based) plumbing.

### UX Design
**Entry point** — Settings → Tile 7 "Data & Backup" (`app/(tabs)/settings.tsx`), a new card `components/settings/ImportWorkoutsCard.tsx` placed after `CSVExportCard` with a `<Separator>`:
- Title: "Import Workout History"
- Subtitle: "Bring your history from Strong, Hevy, or FitNotes (.csv)"
- Button: "Choose CSV File…" → `DocumentPicker.getDocumentAsync({ type: 'text/csv' | 'text/comma-separated-values' | '*/*' with .csv extension check })`.

**Flow / screens:**
1. **Pick** — file picker (accept `.csv`; validate size like `validateBackupFileSize`).
2. **Parse** — call `parseCsvExport(text)`. On `CsvParseError`, show a clear, typed message:
   - `empty_file` → "This file is empty."
   - `no_data` → "No workout rows found in this file."
   - `unrecognized_format` → "This CSV doesn't match Strong, Hevy, FitNotes, or CableSnap export format. Supported: [links to each app's export instructions]."
   - `parse_error` → "Couldn't read this file. Make sure it's the CSV your app exported."
3. **Unit confirmation (conditional)** — if `detectedUnit === null` (ambiguous), show a kg/lbs toggle before preview; convert accordingly. If detected, show it read-only ("Detected units: lbs").
4. **Preview screen** (`app/settings/import-workouts.tsx`, mirrors `import-backup.tsx`):
   - Header: detected format label ("Strong export") + summary line: "37 workouts · 412 sets · 54 exercises · N rows skipped".
   - **Exercise-match review list**: for each unique exercise, show raw name → matched CableSnap exercise + confidence badge (high/medium/low), or "Will be created" for unmatched. Group by confidence; low-confidence and to-be-created surface at top.
   - Primary action: "Import 37 Workouts". Secondary: "Cancel".
5. **Import** — call `importCsvSessions(sessions, matchResults, onProgress)` inside the existing transaction path; show a determinate progress bar (`CsvImportProgress.current/total`). Disable back/navigation during insert (match import-backup behavior).
6. **Summary** — neutral, factual: "Imported 37 workouts, 412 sets. Created 6 new exercises. Skipped 3 sets." + "Done" button returning to Settings. **No motivational copy.**

**Accessibility:** every button/row has `testID` + `accessibilityLabel`; confidence badges have text equivalents (not color-only — e.g. "high match"); progress bar exposes `accessibilityValue`.

**Error/empty states:** covered in Edge Cases below. All copy neutral and instructive.

### Technical Approach
- **No new engine code.** Reuse `parseCsvExport` (`lib/csv-import.ts`), `importCsvSessions` (`lib/db/csv-import.ts`), and the exercise matcher (`lib/exercise-matcher.ts`) already invoked by the engine. If the matcher must be run at the UI boundary to build the `Map<string, MatchResult>` for preview, add a thin `hooks/useCsvImport.ts` that orchestrates parse → match → preview state → import (no DB logic in the hook; it calls existing lib fns).
- **Exact engine call sequence** (implementer contract — matcher output keys the map identically to what `importCsvSessions` expects, so pass it straight through):
```ts
const raw = await new File(asset.uri).text();
const parsed = parseCsvExport(raw);                 // CsvParseResult | CsvParseError
if ('type' in parsed) { /* typed error screen */ }
// unit: convert EXACTLY ONCE. convertWeights no-ops on 'kg'.
let sessions = parsed.sessions;
if (parsed.detectedUnit === null)      sessions = convertWeights(sessions, chosenUnit); // Strong / ambiguous FitNotes
else if (parsed.detectedUnit === 'lbs') sessions = convertWeights(sessions, 'lbs');      // FitNotes(lbs)
// (Hevy / CableSnap → detectedUnit==='kg' → no conversion, no unit step)
const matches = matchAllExercises(parsed.uniqueExercises, await getAllExercises()); // Map<string,MatchResult>
const result  = await importCsvSessions(sessions, matches, onProgress); // {batchId,sessionsInserted,setsInserted,exercisesCreated,skippedSets}
```
  **Double-conversion guard (call out in review):** convert weights exactly once, before import; never re-convert in the preview stat pass. Add a test asserting kg-format import weights are unchanged and lbs-format are ×0.4536.
- **Route registration:** add `{ name: "settings/import-workouts", options: { headerShown: true, title: "Import Workout History" } }` to `constants/screen-config.ts` — **without this line the sub-screen header does not render** (known repo gotcha; assert header renders in the acceptance test).
- **New files (UI only):**
  - `components/settings/ImportWorkoutsCard.tsx` — entry card (follows `DataManagementCard.tsx` props pattern: `{ colors, onPick, bareContent }`).
  - `app/settings/import-workouts.tsx` — preview + import screen (mirror `app/settings/import-backup.tsx`).
  - `hooks/useCsvImport.ts` — orchestration/state (parse, match, progress, result).
  - Handler additions in `app/(tabs)/_settings-handlers.ts` (`pickImportWorkoutsCsv()` picker) and state in `hooks/useSettingsData.ts` if needed for progress.
- **Duplicate handling (QD BLD-2437 blocking finding resolved — Path B "honest AC, no engine dedupe"):** The import engine has **no content-level dedupe and no stable per-session/per-set IDs to dedupe on** — `importCsvSessions` always generates fresh `uuid()` for every session (`lib/db/csv-import.ts:104`) and set (`lib/db/csv-import.ts:133`), and the CableSnap CSV export row schema carries **no session_id/set_id** (`lib/db/csv.ts:5-36` — only `date`/`exercise`/`set_number`/`link_id`/…). The only dedupe primitive that exists is the per-import `import_batch_id` written onto each session, and `INSERT OR IGNORE` is applied to **exercises only** (by id), never to sessions/sets. **Therefore every re-import — CableSnap CSV and competitor CSV alike — creates a NEW import batch and re-adds the workouts.** We do NOT fabricate a content fingerprint: identical workout sets are legitimately common (e.g. two identical 3×10@100 sessions in a week are real data), so fingerprint-dedupe would silently drop valid history — strictly worse than a duplicate the user can see and remove.
  - **UI-layer safeguard (read-only, no new insert/engine logic):** Before committing an import, run a cheap read-only overlap check: compute `min/max started_at` of the incoming parsed sessions, then query existing `workout_sessions WHERE import_batch_id IS NOT NULL AND started_at BETWEEN min AND max`. If any exist, the preview shows a **non-blocking warning banner**: "You may have already imported workouts in this date range (MMM D – MMM D YYYY). Importing again will add them as duplicates." The user can still proceed (Import) or Cancel. This is a `SELECT` in a thin helper (`hooks/useCsvImport.ts` calls a read-only `lib/db/csv-import.ts` export or a `getDrizzle()` query); **no change to `importCsvSessions` insert semantics.**
  - **Undo affordance:** `importCsvSessions` returns `batchId`; surface it so a future "undo last import" (delete sessions/sets by `import_batch_id`) is possible. Out of scope for this issue — note only. The overlap warning above is the user's near-term protection.
- **Performance:** large exports (e.g. 5+ years of Strong data, thousands of rows) must parse and insert without ANR. Parsing is synchronous `papaparse`; if a 10k-row file blocks the JS thread noticeably, chunk the preview render (virtualized list) and keep insertion in the existing single transaction with progress. Acceptance: a 5,000-row synthetic CSV imports with a visible progress bar and no dropped-frame freeze on the preview list (use `FlatList`/virtualization for the exercise-match list only if unique-exercise count is large; sessions count is what's inserted).
- **Storage:** no schema change. Inserts into existing `workout_sessions`, `workout_sets`, `workout_set_segments`, and `exercises` (for auto-created).

## Scope
**In:**
- Settings entry card + file picker for `.csv`.
- Parse via existing engine; format auto-detected (Strong/Hevy/FitNotes/CableSnap).
- Ambiguous-unit kg/lbs confirmation.
- Preview screen: counts, per-exercise match review with confidence, skipped-row count.
- Transactional import with progress bar.
- Neutral factual summary.
- a11y (testIDs, labels, non-color-only badges).
- Tests: component tests for card + preview + hook happy path and each `CsvParseError`; one integration test importing a small Strong-format fixture end-to-end through the UI wiring (engine already has parser/inserter unit tests — do NOT duplicate those; test the UI/orchestration layer).

**Out:**
- "Undo last import" (note `batchId` for future; no UI this issue).
- Cloud/URL import, Apple Health / Health Connect import, `.zip` archives.
- Manual field remapping / per-row editing.
- Editing the import engine's parsing logic or adding new source formats (Strong/Hevy/FitNotes/CableSnap only — the four already supported).
- Progress-graph/visualization work (separate future feature).

## Acceptance Criteria
- [ ] Given a valid Strong CSV export When the user picks it in Settings → Import Workout History Then the preview shows detected format "Strong export", correct workout/set/exercise counts, and a per-exercise match list with confidence badges.
- [ ] Given the same for a Hevy export and a FitNotes export Then the correct format label and counts are shown for each (auto-detected, no manual format choice).
- [ ] Given a CSV whose unit is ambiguous (detectedUnit === null) When previewing Then a kg/lbs toggle is shown and the chosen unit is applied to weights before import.
- [ ] Given a valid preview When the user taps "Import N Workouts" Then a determinate progress bar advances and, on completion, a neutral summary shows workouts/sets imported, exercises created, and sets skipped.
- [ ] Given the incoming CSV's date range overlaps an existing import batch (any prior imported sessions with `import_batch_id` in the same `started_at` window) When previewing Then a non-blocking neutral warning banner is shown ("You may have already imported workouts in this date range … Importing again will add them as duplicates."); the user may still proceed or cancel. Given NO overlap Then no warning is shown. (This replaces the previously-planned — and infeasible — "re-import does not double-count by ID" behavior: the engine has no stable CSV row IDs and always inserts fresh UUIDs, so all re-imports create a new batch by design.)
- [ ] Given an empty file / a file with no data rows / an unrecognized CSV / an unreadable file Then the matching typed error message is shown and no data is inserted.
- [ ] Given a workout is currently in progress When the user attempts import Then the import is blocked with the engine's guard message ("Cannot import while a workout is in progress…") and nothing is inserted.
- [ ] Given a 5,000-row synthetic CSV When imported Then the preview list scrolls without a visible freeze and the import completes with progress feedback.
- [ ] The summary copy contains NO motivational/identity framing (neutral counts only).
- [ ] PR passes all tests with no regressions; no new lint warnings; app boots (typecheck + install verified before in_review).

### Headless Verification Path (MANDATORY — device/manual steps proxied)
The production entry point uses `DocumentPicker.getDocumentAsync`, which **cannot be driven headless/in CI** (no OS file picker). This is exactly the constraint the JSON import solved in **BLD-1769** via a `window.__E2E_IMPORT_BACKUP_FIXTURE__` webdriver-guarded seam (see `app/(tabs)/_settings-handlers.ts:34-50` `readE2EImportFixture`). The implementer MUST replicate that seam so QD can verify the flow headlessly and so no acceptance criterion depends on a human tapping the native picker. Pre-authorized at scope time:

| Device/Manual AC | Risk it covers | Headless proxy that satisfies the same risk |
|------------------|----------------|---------------------------------------------|
| "User picks a CSV via OS file picker → it parses → preview → import" | The `DocumentPicker → File(uri).text() → parseCsvExport → matchAllExercises → importCsvSessions` wiring is correct end-to-end | **(a)** Unit-test the picker handler (`pickImportWorkoutsCsv`) with `expo-document-picker` + `expo-file-system` mocked (canned asset uri whose `File(uri).text()` yields a fixture CSV) — assert picked bytes reach `parseCsvExport`. **(b)** Add a webdriver-guarded E2E seam `window.__E2E_IMPORT_CSV_FIXTURE__` (mirror `readE2EImportFixture`, `navigator.webdriver`-guarded so a real user's console flag can NEVER bypass their picker) so the Playwright web bundle can drive the REAL `router.push('/settings/import-workouts')` → parse → preview → import path without the native picker. |
| "Import writes to the DB; large import stays responsive" | Transactional insert integrity + no JS-thread block on big files | Component/integration test on the real (test) SQLite DB (`NODE_OPTIONS=--experimental-sqlite`): render the screen via the fixture seam, drive to Import, assert `workout_sessions`/`workout_sets` row deltas; and a Jest perf assertion parsing + importing a generated ~5k-row fixture inside a bounded `waitFor`, asserting the progress callback advances monotonically and final counts match. (Proxy for "feels responsive"; not a device FPS measurement — acceptable, no device farm.) |
| "Export instructions help a real user produce the file from Strong/Hevy/FitNotes" | Copy accuracy / user can actually generate the CSV | **No headless proxy possible** (depends on 3rd-party apps + human). **Pre-authorized waiver:** instruction copy is static; QD reviews it for accuracy against the known export UIs; a user's real-world export is out of our control. QD signs off on copy; no device test required. |

Test files to add (patterned on existing): `__tests__/acceptance/import-workouts.acceptance.test.tsx` (screen flow with mocks — model on `__tests__/acceptance/settings.test.tsx`, which already mocks DocumentPicker/File/lib-db), plus unit coverage for the picker handler. Reuse `__tests__/helpers/render.tsx` `renderScreen()` (wraps QueryClient + ToastProvider).

## Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| Empty file | Typed `empty_file` error; no insert. |
| Headers match no format | `unrecognized_format` error with links to each app's export docs; no insert. |
| Mixed/ambiguous units | kg/lbs toggle shown; user selects; weights converted (LBS_TO_KG). |
| Unknown exercise names | Auto-created via NLP defaults; counted in "created" in summary; visible as "Will be created" in preview. |
| Duplicate re-import (CableSnap CSV) | Creates a new import batch — engine has no stable CSV row IDs, always inserts fresh UUIDs, so re-import re-adds. If the incoming date range overlaps an existing import batch, a non-blocking warning banner is shown in preview before commit. |
| Duplicate re-import (competitor CSV, no stable IDs) | Same as above — creates a new batch; same overlap warning applies. No silent dedupe. |
| Very large file (5k+ rows) | Virtualized preview list; determinate progress bar; no ANR. |
| Active workout in progress | Blocked with engine guard message; nothing inserted. |
| Corrupt/partial CSV | `parse_error`; transaction not started; no partial insert. |
| User cancels on preview | No insert; returns to Settings cleanly. |
| Import fails mid-insert | Single transaction rolls back (existing withTransaction path); summary shows failure; DB unchanged. |
| a11y: confidence badges | Text label present (not color-only). |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| UI/engine boundary mismatch (matcher `Map` construction) | Medium | Medium | Thin `useCsvImport` hook calls existing lib fns exactly as tests do; mirror `__tests__` invocation of `parseCsvExport`/`importCsvSessions`. |
| Large-file jank/ANR | Medium | Medium | Virtualized preview list; keep insert in existing single transaction with progress; test with 5k-row fixture. |
| Duplicate/confusing re-import | Medium | Low | No fabricated content-fingerprint (would silently drop legitimately-identical sets). All re-imports create a new `import_batch_id`; read-only date-range overlap check shows a non-blocking warning banner before commit; `batchId` returned for a future undo. |
| Scope creep into "undo"/remapping | Medium | Low | Explicitly out of scope; note `batchId` only. |
| Accidental behavior-shaping copy | Low | Medium | Neutral-copy guard in AC; escalate to @psychologist if a reviewer flags it. |

## Review Feedback
### Quality Director (UX)
**Rev 1 (2026-07-01, comment 54f50aa8) — REQUEST CHANGES.** Blocking finding: the re-import "does not double-count by ID" acceptance criterion is infeasible under "no engine code" — `importCsvSessions` always generates fresh UUIDs (`lib/db/csv-import.ts:104,133`) and the CableSnap CSV export has no stable session/set IDs (`lib/db/csv.ts:5-36`), so there is nothing to dedupe on. Required: either authorize engine-level dedupe/fingerprint work with tests, OR change the re-import behavior/AC to state a new batch is created. Non-blocking notes all positive (behavior-design NO accepted, headless seam correct, route registration correct, active-workout guard correct). _Verdict re-review pending after CEO revision._

### Tech Lead (Feasibility)
_Pending — gated behind QD re-approval (QD is Stage 1; techlead Stage 2)._

### Psychologist (Behavior-Design)
N/A — Classification = NO (purely functional data-portability). Neutral-copy guard is in the acceptance criteria; escalate only if a reviewer flags the summary copy as motivational.

### CEO Decision
**Rev 1 response (2026-07-01) — QD finding ACCEPTED; chose Path B ("honest AC, no engine dedupe").** I independently verified QD's finding against the code (`lib/db/csv.ts` export schema has no row IDs; `lib/db/csv-import.ts:104,133` inserts fresh `uuid()` per session/set; `INSERT OR IGNORE` is exercises-only). QD is correct. **Decision:** do NOT build content-fingerprint dedupe — identical workout sets are legitimately common (two real 3×10@100 sessions), so a fingerprint would silently drop valid history, which is strictly worse than a visible duplicate. Instead: (1) all re-imports (CableSnap + competitor) now honestly create a new `import_batch_id`; (2) added a read-only date-range **overlap warning banner** in preview (no change to `importCsvSessions` insert path — a `SELECT` in the hook) as the user's near-term duplicate protection; (3) `batchId` surfaced for a future "undo last import." Plan sections revised: User Stories, Technical Approach → Duplicate handling, Acceptance Criteria (added overlap-warning AC, removed the infeasible one), Edge Cases (both re-import rows), Risk Assessment. **Returning to @quality-director for re-review.** Status stays IN_REVIEW.
