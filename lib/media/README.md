# lib/media — Form Check Videos

This directory contains the media layer for BLD-1092 (Local-only Form Check Videos).

## Directory Layout

All files are stored inside the app's sandbox (auto-removed on uninstall):

```
${documentDirectory}form-clips/
  <exercise_id>/
    <clip_id>.mp4              ← raw 720p video (≤ 15 s, no audio)
    .thumbs/
      <clip_id>.jpg            ← middle-frame thumbnail (lazy, generated on first view)
```

`rel_path` in `set_media` rows is **relative to `documentDirectory`** (e.g. `form-clips/ex1/clip1.mp4`).  
Relative paths remain valid after iOS sandbox UUID changes on app restore.

## Privacy Invariants

1. **No network I/O** — `lib/media/*` must NEVER be imported by `lib/sync/**`, `lib/db/csv-export.ts`, `lib/db/import-export.ts`, `app/api/**`, `workers/**`, or any Sentry wrapper. Enforced by ESLint and `scripts/check-privacy-boundaries.sh`.
2. **Backup exclusion** — clips are excluded from iOS iCloud Backup (`NSURLIsExcludedFromBackupKey`) and Android Auto Backup (`data_extraction_rules.xml`). See `modules/form-clips-backup` and `plugins/with-form-clips-backup.js`.
3. **Sentry Replay gate** — any component that renders a native video/camera surface MUST call `useMediaSurfaceMounted()` at its root. The `beforeErrorSampling` gate in `app/_layout.tsx` skips error-replay attachment while any surface is mounted. Enforced by `scripts/check-privacy-boundaries.sh`.

## Module Map

| File | Purpose |
|------|---------|
| `backup-exclusion.ts` | TS shim for the native `FormClipsBackup` Expo module |
| `form-clips.ts` | Core media operations: `recordClip`, `getClipsForExercise`, `softDeleteClip`, `deleteClip`, `reconcileOrphans`, `getStorageStats` |
| `replay-gate.ts` | Sentry replay mount-counter: `increment`/`decrement`/`mediaSurfaceMountCount` |

## Two-Phase Delete Protocol

1. `softDeleteClip(id)` — sets `pending_delete = 1`, hides from UI immediately.
2. `reconcileOrphans()` — runs on app boot AND on first Form Library open after launch:
   - Snapshots DB rows BEFORE enumerating the filesystem (prevents concurrent-write race).
   - For each `pending_delete = 1` row: unlink file (swallows ENOENT), then DELETE row.
   - For filesystem files absent from the DB snapshot AND older than 30 s: unlink (orphan cleanup).
   - For DB rows with `pending_delete = 0` but missing file: leaves row, marks `rel_path` missing for UI placeholder.
