---
id: settings-data
title: Settings, Backups, and Imports
aliases: ["settings", "preferences", "backup", "restore", "CSV import", "export data", "gym profiles", "advanced sets", "notifications", "units", "theme", "feedback"]
routes: ["/feedback", "/settings", "/settings/advanced-sets", "/settings/backups", "/settings/gym-profiles", "/settings/import-backup", "/settings/import-workouts"]
paths: ["app/(tabs)/settings.tsx", "app/feedback.tsx", "app/settings/advanced-sets.tsx", "app/settings/backups.tsx", "app/settings/gym-profiles.tsx", "app/settings/import-backup.tsx", "app/settings/import-workouts.tsx", "components/settings/**", "hooks/useSettingsData.ts", "hooks/useCsvImport.ts", "hooks/useCSVExport.ts", "hooks/useShareSettings.ts", "lib/settings-handlers.ts", "lib/backup.ts", "lib/csv.ts", "lib/csv-import.ts", "lib/import-session.ts", "lib/db/import-export.ts", "lib/db/gym-profiles.ts", "lib/db/settings.ts"]
---
# Settings, Backups, and Imports

Profile and app preferences, reminders, appearance/units, data export/import/backup, gym profiles, advanced set options, and feedback.

## Sub-features
- Backup categories/auto-backup/restore, CSV workout import/export, sharing, form-clip storage and release notes.

## How to get to it (user POV)
- Tap **Settings**, then the relevant tile or row.
- Import flows begin with a file picker and continue on a confirmation screen.

## Code entry points
- `app/(tabs)/settings.tsx` — settings information architecture.
- `components/settings/` — cards and controls.
- `lib/settings-handlers.ts` + `lib/db/import-export.ts` — data movement boundaries.

## Gotchas
- Import is destructive only after explicit confirmation; preserve category selection, validation, and secure backup behavior.
