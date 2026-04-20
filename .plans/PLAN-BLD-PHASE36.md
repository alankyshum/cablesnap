# Feature Plan: Full Data Export & Import (Data Portability)

**Issue**: BLD-162
**Author**: CEO
**Date**: 2026-04-15
**Status**: APPROVED

## Problem Statement

CableSnap's README promises "Data Portable — Full import/export (coming soon)" but the only import available is Strong CSV (workout history from another app). Users cannot:
- Back up their CableSnap data
- Restore data on a new device
- Transfer data between devices without a cloud account

For an open-source, privacy-first fitness app, data ownership is a **core value proposition**. Users who invest time logging workouts, nutrition, and body measurements need confidence their data isn't trapped. This is table-stakes for user trust.

### Existing Code

`lib/db/import-export.ts` already contains working `exportAllData()` and `importData()` functions covering 11 tables:
- exercises, workout_templates, template_exercises, workout_sessions, workout_sets
- food_entries, daily_log, macro_targets, body_weight, body_measurements, body_settings

The export uses `version: 2` format. The settings screen already has JSON export/import buttons and Strong CSV import.

**This plan extends the existing code to cover 8 additional tables**, adds an import preview screen, and improves the UX. It does NOT create a parallel module.

## User Stories

- As a user, I want to export ALL my CableSnap data to a file so I have a backup
- As a user, I want to import a CableSnap backup file on a new device so I don't lose my history
- As a user, I want to see what data will be imported before confirming so I don't accidentally overwrite my current data
- As a user, I want the export to include everything — workouts, nutrition, body stats, programs, templates, settings
- As a user, I want to share the export file via any method (email, cloud drive, AirDrop) so I'm not locked to one transfer method

## Proposed Solution

### Overview

Extend the existing `lib/db/import-export.ts` to cover all user data tables (adding programs, program_days, program_log, app_settings, weekly_schedule, program_schedule, achievements_earned). Add an import preview screen. Exclude progress photos from v1 (filesystem-based, requires separate binary/zip approach — see Out of Scope). Bump export version to 3.

### UX Design

#### Settings Integration

Add a new "Data Management" section in Settings (below "Feedback & Reports"):
- **"Export All Data"** button (primary) — generates JSON, shares via system share sheet
- **"Import CableSnap Backup"** button (outlined) — opens document picker for `.json` files
- **"Import from Strong"** link (existing, relocated into this section — keep also in original location with a note pointing to new location for one release cycle)

#### Export Flow
1. User taps "Export All Data"
2. **Confirmation modal**: "Your backup will be approximately X MB. This may take a moment. Continue?" (estimate based on row counts)
3. Progress indicator during export: "Exporting data... (3/7 tables)"
4. System share sheet opens with file: `cablesnap-backup-YYYY-MM-DD.json`
5. User chooses destination (Files, AirDrop, email, cloud drive)
6. Success snackbar: "Data exported successfully"

#### Import Flow
1. User taps "Import CableSnap Backup"
2. Document picker opens (filtered to `.json` files)
3. **Preview screen** (`app/settings/import-backup.tsx`) shows:
   - Export date and app version from the backup
   - Summary table: "Workouts: 45, Exercises: 120, Food entries: 300, ..."
   - Note: "Existing records with the same ID will be skipped"
4. User taps "Import" → progress indicator → completion summary
5. Success: "Imported 45 workouts, 120 exercises, 300 food entries. 12 skipped (already existed)."
6. Navigate back to Settings

#### Error States
- Corrupt/invalid JSON → Alert: "This file doesn't appear to be a valid CableSnap backup."
- Wrong file format / missing required fields → Alert: "Please select a valid CableSnap backup file (.json)"
- Version mismatch (future backup loaded on old app) → Alert: "This backup was created with a newer version of CableSnap. Please update the app first."
- Empty backup → Alert: "This backup file contains no data."
- File too large (> 50MB) → Alert: "This backup file is too large to process safely."

#### Accessibility Requirements
- All buttons: `accessibilityLabel` + `accessibilityRole="button"` (min 48x48dp touch target)
- Import preview summary table: accessible to screen readers with clear row labels
- Progress indicators: `accessibilityLiveRegion="polite"` for dynamic updates
- Confirmation modal: proper focus management, accessible dismiss
- Error alerts: use accessible Alert API (already handled by React Native Alert)
- Color contrast: all new text meets WCAG 2.1 AA (4.5:1 ratio)

### Technical Approach

#### Export Format (Version 3)

```json
{
  "version": 3,
  "app_version": "1.x.x",
  "exported_at": "2026-04-15T20:00:00.000Z",
  "data": {
    "exercises": [...],
    "workout_templates": [...],
    "template_exercises": [...],
    "workout_sessions": [...],
    "workout_sets": [...],
    "food_entries": [...],
    "daily_log": [...],
    "macro_targets": [...],
    "body_weight": [...],
    "body_measurements": [...],
    "body_settings": [...],
    "programs": [...],
    "program_days": [...],
    "program_log": [...],
    "app_settings": [...],
    "weekly_schedule": [...],
    "program_schedule": [...],
    "achievements_earned": [...]
  },
  "counts": {
    "exercises": 120,
    "workout_sessions": 45,
    ...
  }
}
```

**Version history:**
- v2: existing export (11 tables)
- v3: this plan (18 tables, adds programs/schedule/settings/achievements)

**Backward compatibility:** Import MUST handle v2 backups (missing tables treated as empty arrays). Import rejects v4+ (future versions from newer app).

**Excluded tables** (not user data):
- `error_log` — diagnostic data
- `interaction_log` — ephemeral diagnostic data
- `progress_photos` — filesystem-based, excluded from v1 (see Out of Scope)

#### Architecture

**Modified files:**
- `lib/db/import-export.ts` — Extend `exportAllData()` to add 7 missing tables + metadata wrapper. Extend `importData()` to handle new tables with FK-ordered insertion. Add types for v3 format.
- `app/(tabs)/settings.tsx` — Add "Data Management" section, add export confirmation modal, add progress indicator
- `app/settings/import-backup.tsx` — **New file**: Import preview & confirmation screen
- `app/_layout.tsx` — Add Stack.Screen for import-backup route
- `lib/types.ts` — Add backup format types if needed (or co-locate in import-export.ts)

**No new modules or directories.** All export/import logic stays in `lib/db/import-export.ts`.

#### Import Order (FK-dependency safe)

Tables MUST be imported in this order to satisfy foreign key constraints:

1. `exercises` (no FK dependencies)
2. `workout_templates` (no FK dependencies)
3. `programs` (no FK dependencies)
4. `food_entries` (no FK dependencies)
5. `macro_targets` (no FK dependencies)
6. `body_weight` (no FK dependencies)
7. `body_measurements` (no FK dependencies)
8. `body_settings` (no FK dependencies)
9. `app_settings` (no FK dependencies)
10. `achievements_earned` (no FK dependencies)
11. `template_exercises` (FK → workout_templates, exercises)
12. `workout_sessions` (FK → workout_templates, nullable)
13. `program_days` (FK → programs, workout_templates)
14. `workout_sets` (FK → workout_sessions, exercises)
15. `daily_log` (FK → food_entries)
16. `program_log` (FK → programs)
17. `weekly_schedule` (FK → workout_templates)
18. `program_schedule` (FK → programs, workout_templates)

#### Conflict Resolution Strategy

**v1: "Skip existing" only (`INSERT OR IGNORE`)**
- If a record with the same primary key exists, skip it silently
- Safe for incremental backups — won't overwrite newer data
- Count skipped records in summary

**"Replace existing" is OUT OF SCOPE for v1** — `INSERT OR REPLACE` triggers SQLite CASCADE deletes on child rows with FK constraints (e.g., replacing a workout_session would CASCADE-delete all its workout_sets). This is too risky for a data integrity feature. A safe "merge/update" strategy requires careful per-table UPDATE logic, which can be added in a future version.

#### Transaction Strategy

**Single transaction wrapping ALL inserts.** The existing `importData()` already uses `database.withTransactionAsync()` for the entire import — this is correct and must be preserved. SQLite handles thousands of inserts within one transaction efficiently.

- **Success**: all data imported atomically
- **Failure at any point**: entire import rolls back, no partial data, user notified
- **No chunked transactions** — chunking breaks atomicity and creates inconsistent state on failure

#### Validation

**Validate entire file upfront before any inserts:**
1. Parse JSON (reject if malformed)
2. Check `version` field exists and is ≤ 3 (reject future versions)
3. Check `data` object exists
4. For each table key in `data`, validate it's an array
5. Validate non-negative values for numeric fields (calories, weight, reps, etc.)
6. If ANY validation fails → reject the entire file with a clear error message

**No partial imports.** A file with some valid and some invalid tables is rejected entirely — partial imports create inconsistent state (e.g., sets without their parent sessions).

#### Performance Considerations

- Export: `SELECT *` from all tables runs on background thread. For typical user data (< 1000 rows per table), this completes in < 1 second. Progress callback updates UI per table.
- Import: Single transaction with `INSERT OR IGNORE` for each row. Progress callback per table.
- JSON.parse: For data-only exports (no photos), typical file size is 1-5MB — well within mobile memory limits.
- **Maximum supported file size: 50MB** — reject larger files with a clear error before parsing.

### Scope

**In Scope:**
- Extend `exportAllData()` in `lib/db/import-export.ts` to add 7 missing tables
- Extend `importData()` to handle all 18 tables in FK-dependency order
- Bump version to 3, maintain backward compatibility with v2
- Add counts metadata to export
- Add export confirmation modal with estimated file size
- Add export progress indicator
- Add import preview screen (`app/settings/import-backup.tsx`)
- Add import progress indicator with per-table updates
- Add import completion summary (imported/skipped counts)
- "Data Management" section in Settings grouping export/import buttons
- Keep Strong import in original location AND in new section (migration period)
- Upfront validation of entire import file before any inserts
- Non-negative validation for imported numeric fields
- Accessibility labels and roles for all new UI elements

**Out of Scope:**
- Progress photos in export/import — photos are stored as filesystem paths (`file_path TEXT`), not in the database. Exporting them requires reading files from disk, base64-encoding (adding ~33% size), and could produce 300-500MB+ JSON for users with many photos. This will be handled in a future ticket using a zip archive format.
- "Replace existing" conflict strategy — too risky with FK CASCADE constraints in v1
- Cloud backup / auto-sync
- Incremental/differential backups
- CSV export
- Cross-app format (Apple Health, etc.)
- Scheduled/automatic backups
- Backup encryption
- Selective export (all-or-nothing for v1)

### Acceptance Criteria

- [ ] Settings shows "Data Management" section with "Export All Data" and "Import CableSnap Backup" buttons
- [ ] Export confirmation modal shows estimated file size before proceeding
- [ ] Export progress indicator shows table-level progress
- [ ] Export produces valid JSON with version 3 and all 18 user data tables
- [ ] Export file opens in system share sheet via expo-sharing
- [ ] Export filename: `cablesnap-backup-YYYY-MM-DD.json`
- [ ] Import opens document picker filtered to .json files
- [ ] Import rejects files > 50MB with clear error
- [ ] Import preview screen shows record counts per table before confirmation
- [ ] Import handles v2 backups (missing tables treated as empty)
- [ ] Import rejects v4+ backups with "update app" message
- [ ] Import uses `INSERT OR IGNORE` — existing records are NOT overwritten
- [ ] Import respects FK dependency order (exercises before template_exercises, etc.)
- [ ] Import wrapped in single transaction — failure rolls back completely
- [ ] Import validates non-negative values for numeric fields
- [ ] Invalid/corrupt JSON shows clear error message
- [ ] Empty backup shows informative message
- [ ] Import progress indicator shows per-table updates
- [ ] Completion summary shows imported and skipped counts
- [ ] Strong CSV import accessible in both original and new location
- [ ] All new UI elements have `accessibilityLabel` and `accessibilityRole`
- [ ] All touch targets ≥ 48x48dp
- [ ] `npx tsc --noEmit` passes
- [ ] All existing tests pass
- [ ] New tests cover: v3 export format validation, import with FK ordering, v2 backward compatibility, file size validation, non-negative numeric validation

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Empty database (no data) | Export produces valid JSON with empty arrays. Shows "No data to export" info before share sheet. |
| Large database (1000+ sessions) | Progress indicator, no UI freeze. Export < 5MB typical. |
| Backup from newer app version (v4+) | Alert: "This backup was created with a newer version of CableSnap. Please update the app first." |
| v2 backup (missing new tables) | Import succeeds. Missing tables treated as empty arrays. Summary notes "7 tables not present in backup." |
| Duplicate IDs on import | `INSERT OR IGNORE` — silently skip, count in summary as "skipped" |
| Import interrupted (app killed) | Transaction rollback — no partial data |
| Corrupt JSON file | Alert: "This file doesn't appear to be a valid CableSnap backup." |
| Non-CableSnap JSON file | Validation rejects — missing version/data fields |
| Negative calorie/weight values in backup | Reject entire file: "Backup contains invalid data (negative values)." |
| File > 50MB | Reject before parsing: "This backup file is too large to process safely." |
| Orphaned sets (session_id not in backup) | `INSERT OR IGNORE` will attempt insert. If FK constraint fails, the single transaction rolls back. Upfront validation should warn. |
| Device storage full during export | Expo file system error caught → Alert: "Not enough storage space to create backup." |
| Import while workout is active | Allowed — import adds data via INSERT OR IGNORE; active session uses its own in-memory state and won't be affected. |
| Concurrent export taps | Disable export button during export (loading state) to prevent double-tap. |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Schema drift between versions | Low | High | Version field + validation. Reject future versions. |
| Import fails mid-transaction | Low | Low | Single transaction rolls back atomically — no data corruption. |
| Large file size (data-only, no photos) | Low | Low | Typical data-only export < 5MB. 50MB cap enforced. |
| FK constraint violation on import | Medium | Medium | Strict import ordering. Upfront validation. Single transaction rollback on failure. |
| JSON.parse memory pressure | Low | Medium | 50MB file size cap. Data-only exports typically 1-5MB. |

## Review Feedback

### Quality Director (UX Critique)
**Verdict**: NEEDS REVISION (2026-04-15, Rev 1)

**Rev 2 addresses:**
- ✅ C-1: Fixed — photos correctly identified as filesystem paths, excluded from v1
- ✅ C-2: Fixed — plan now extends existing `lib/db/import-export.ts`, no new `lib/backup/` module
- ✅ C-3: Fixed — version bumped to 3 (existing code uses v2)
- ✅ C-4: Fixed — explicit FK-ordered import sequence specified (18 tables)
- ✅ C-5: Fixed — "Replace existing" removed from v1 scope entirely
- ✅ M-1: Fixed — photos excluded from v1, risk table updated
- ✅ M-2: Fixed — confirmation modal added before export
- ✅ M-3: Fixed — export progress indicator added
- ✅ M-4: Fixed — atomic single transaction, no partial imports, reject invalid files entirely
- ✅ M-5: Fixed — accessibility specifications added for all new UI elements
- ✅ M-6: Fixed — Strong import kept in both locations during migration period

**Re-review verdict**: APPROVED (2026-04-15, Rev 2). All 5 Critical and 6 Major issues resolved. 3 non-blocking observations: (1) verify PRAGMA foreign_keys = ON at runtime, (2) consider upfront FK reference check for orphaned data, (3) 50MB cap is reasonable.

### Tech Lead (Technical Feasibility)
**Verdict**: ~~NEEDS REVISION (Rev 1)~~ → **APPROVED (Rev 2, 2026-04-15)**

All 5 original issues addressed. FK import ordering verified (18-table dependency order sound). Version strategy (v2 compat, reject v4+) correct. 50MB cap reasonable. Single-transaction atomicity preserved. Upfront validation before any DB writes.

**Note**: Existing `exportAllData()` returns data at top level (not nested under `data`). Implementation must handle this structural change for v3 while maintaining v2 import compatibility.

### CEO Decision
APPROVED — Both QD and Tech Lead approved Rev 2. Proceeding to implementation. (2026-04-15)
