# Feature Plan: Full Data Export & Import (Data Portability)

**Issue**: BLD-162
**Author**: CEO
**Date**: 2026-04-15
**Status**: DRAFT

## Problem Statement

FitForge's README promises "Data Portable — Full import/export (coming soon)" but the only import available is Strong CSV (workout history from another app). Users cannot:
- Back up their FitForge data
- Restore data on a new device
- Transfer data between devices without a cloud account

For an open-source, privacy-first fitness app, data ownership is a **core value proposition**. Users who invest time logging workouts, nutrition, and body measurements need confidence their data isn't trapped. This is table-stakes for user trust.

## User Stories

- As a user, I want to export ALL my FitForge data to a file so I have a backup
- As a user, I want to import a FitForge backup file on a new device so I don't lose my history
- As a user, I want to see what data will be imported before confirming so I don't accidentally overwrite my current data
- As a user, I want the export to include everything — workouts, nutrition, body stats, programs, templates, settings
- As a user, I want to share the export file via any method (email, cloud drive, AirDrop) so I'm not locked to one transfer method

## Proposed Solution

### Overview

Add a full JSON-based export/import system accessible from Settings. Export serializes all user data tables into a single timestamped JSON file shared via `expo-sharing`. Import reads the file, shows a preview summary, and inserts data with a merge strategy (skip duplicates by ID).

### UX Design

#### Settings Integration

Add a new "Data Management" section in Settings (below "Feedback & Reports"):
- **"Export All Data"** button (primary) — generates JSON, shares via system share sheet
- **"Import FitForge Backup"** button (outlined) — opens document picker for `.json` files
- **"Import from Strong"** link (existing, relocated into this section)

#### Export Flow
1. User taps "Export All Data"
2. Brief loading indicator (snackbar: "Preparing export...")
3. System share sheet opens with file: `fitforge-backup-2026-04-15.json`
4. User chooses destination (Files, AirDrop, email, cloud drive)
5. Success snackbar: "Data exported successfully"

#### Import Flow
1. User taps "Import FitForge Backup"
2. Document picker opens (filtered to `.json` files)
3. **Preview screen** (`app/settings/import-backup.tsx`) shows:
   - Export date and app version from the backup
   - Summary table: "Workouts: 45, Exercises: 120, Food entries: 300, ..."
   - Conflict strategy selector: "Skip existing" (default) / "Replace existing"
   - Warning: "Replace existing will overwrite any records with matching IDs"
4. User taps "Import" → progress indicator → completion summary
5. Success: "Imported 45 workouts, 120 exercises, 300 food entries. 12 skipped (already existed)."
6. Navigate back to Settings

#### Error States
- Corrupt/invalid JSON → Alert: "This file doesn't appear to be a valid FitForge backup."
- Wrong file format → Alert: "Please select a FitForge backup file (.json)"
- Version mismatch (future backup loaded on old app) → Alert: "This backup was created with a newer version of FitForge. Please update the app first."
- Empty backup → Alert: "This backup file contains no data."

### Technical Approach

#### Export Format

```json
{
  "version": 1,
  "app_version": "1.0.0",
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
    "progress_photos": [...],
    "achievements_earned": [...]
  },
  "counts": {
    "exercises": 120,
    "workout_sessions": 45,
    ...
  }
}
```

**Excluded tables** (not user data):
- `error_log` — diagnostic data, not valuable for backup
- `interaction_log` — ephemeral diagnostic data

#### Architecture

**New files:**
- `lib/backup/export.ts` — Reads all tables, builds JSON, writes temp file
- `lib/backup/import.ts` — Validates JSON, parses, inserts with conflict handling
- `lib/backup/types.ts` — Backup format types, version validation
- `app/settings/import-backup.tsx` — Import preview & confirmation screen

**Modified files:**
- `app/(tabs)/settings.tsx` — Add "Data Management" section, move Strong import link
- `app/_layout.tsx` — Add Stack.Screen for import-backup route

#### Conflict Resolution Strategy

**"Skip existing" (default):**
- `INSERT OR IGNORE` — if a record with the same primary key exists, skip it
- Safe for incremental backups — won't overwrite newer data

**"Replace existing":**
- `INSERT OR REPLACE` — overwrites existing records with backup data
- Warning displayed: this will overwrite local changes
- Wrapped in a transaction — all-or-nothing

#### Progress Photos Handling

Progress photos are stored as base64 in the `progress_photos` table. These can be large.
- **Export**: Include photo data in JSON (base64 encoded). Warn user if file will be large.
- **Import**: Restore photos from backup data.
- **Size estimation**: Before export, calculate approximate file size. If > 50MB, show warning: "Your backup includes photos and will be approximately X MB."

#### Performance Considerations

- Export runs on background thread (not blocking UI)
- Import wraps each table in a transaction for atomicity
- Large datasets (1000+ sessions): chunked inserts (100 rows per transaction batch)
- Progress callback for import UI (update progress bar per table)

### Scope

**In Scope:**
- Full JSON export of all user data tables
- Full JSON import with preview and conflict resolution
- Export via system share sheet (expo-sharing)
- Import via document picker (expo-document-picker)
- Version field for future-proofing
- Progress photos included in backup
- Progress indicator during import
- Import preview showing record counts before confirmation
- Relocate Strong import into "Data Management" section

**Out of Scope:**
- Cloud backup / auto-sync
- Incremental/differential backups
- CSV export (JSON only for v1)
- Cross-app format (e.g., exporting to Apple Health format)
- Scheduled/automatic backups
- Backup encryption
- Selective export (all-or-nothing for v1)
- Photo compression/optimization during export

### Acceptance Criteria

- [ ] Settings shows "Data Management" section with "Export All Data" and "Import FitForge Backup" buttons
- [ ] Export produces valid JSON file with all user data tables
- [ ] Export file opens in system share sheet via expo-sharing
- [ ] Export filename includes date: `fitforge-backup-YYYY-MM-DD.json`
- [ ] Import opens document picker filtered to .json files
- [ ] Import preview shows record counts per table before confirmation
- [ ] Import with "Skip existing" does not overwrite existing records
- [ ] Import with "Replace existing" overwrites existing records (with warning)
- [ ] Import is wrapped in transactions — failure rolls back completely
- [ ] Invalid/corrupt JSON shows clear error message
- [ ] Version mismatch shows update prompt
- [ ] Empty backup shows informative message
- [ ] Progress indicator shown during import
- [ ] Completion summary shows counts of imported and skipped records
- [ ] Progress photos are included in export and restored on import
- [ ] Strong CSV import link relocated to "Data Management" section
- [ ] `npx tsc --noEmit` passes
- [ ] All existing tests pass
- [ ] New tests cover: export format validation, import parsing, conflict resolution, version checking

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Empty database (no data) | Export produces valid JSON with empty arrays. Shows "No data to export" info. |
| Very large database (1000+ sessions) | Chunked processing, progress indicator, no UI freeze |
| Large photos in backup | Size warning before export. Import handles large base64 strings. |
| Backup from newer app version | Clear error: "Update app first" |
| Backup from older format version | Migration logic (for future — v1 only has version 1) |
| Duplicate IDs on import (skip mode) | Silently skip, count in summary |
| Duplicate IDs on import (replace mode) | Overwrite, count in summary |
| Import interrupted (app killed) | Transaction rollback — no partial data |
| Corrupt JSON file | Alert with clear error message |
| Non-FitForge JSON file | Validation rejects — missing version/data fields |
| File with some valid and some invalid tables | Import valid tables, report errors for invalid ones |
| No exercises in backup but sets reference them | Skip orphaned sets, report in summary |
| Export with 0 progress photos | No size warning, normal export |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Large file size from photos | Medium | Low | Size estimation + user warning before export |
| Memory pressure from large JSON | Low | Medium | Stream processing for very large files (future) |
| Schema drift between versions | Low | High | Version field in export format + validation |
| Transaction timeout on large import | Low | Medium | Chunked inserts (100 rows per batch) |

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
