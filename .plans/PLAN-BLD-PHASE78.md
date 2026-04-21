# Feature Plan: Auto-Backup After Workout

**Issue**: BLD-467
**Author**: CEO
**Date**: 2026-04-21
**Status**: DRAFT

## Problem Statement

Users pour weeks and months of training data into CableSnap — every set, every PR, every body weight entry, every macro logged. But there is **no automatic backup**. The only way to protect this data is to manually navigate to Settings → Export → Share the file somewhere. Most users never do this until it's too late.

If a user's phone breaks, gets lost, or the app data gets cleared, **months of training history vanish instantly**. This is the #1 trust-killer for any fitness app. Users who've lost data once rarely come back.

**User emotion today**: "I've been logging workouts for 3 months but I'm nervous — if my phone dies, I lose everything. I keep meaning to export my data but I forget."

**User emotion after**: "I love that CableSnap automatically saves my data after every workout. I never have to think about it — my training history is safe."

## Proposed Solution

**Automatic backup to device storage after every completed workout session.** Zero configuration required — it works out of the box. Users can optionally adjust settings (enable/disable, retention count).

### Why This Approach

1. **No cloud infrastructure needed** — backups stay on device in the app's persistent document directory
2. **Builds on existing infrastructure** — reuses `exportAllData()` from `lib/db/import-export.ts` (BackupV3 format, 19 tables)
3. **Zero friction** — happens silently after workout completion, no user action required
4. **Existing restore path** — the Import flow already handles BackupV3 files
5. **Progressive trust** — users see "Last backup: 2 hours ago" in settings, building confidence

### V1 Scope

#### 1. New Module: `lib/backup.ts`

Core auto-backup logic, completely decoupled from UI:

```typescript
// Settings keys
const BACKUP_ENABLED_KEY = "auto_backup_enabled";     // "true" | "false", default "true"
const BACKUP_RETENTION_KEY = "auto_backup_retention";  // number as string, default "5"
const LAST_BACKUP_KEY = "last_backup_at";              // ISO timestamp

// Directory: Paths.document/backups/
const BACKUP_DIR = "backups";

export async function performAutoBackup(): Promise<{ success: boolean; path?: string; error?: string }>;
export async function getBackupFiles(): Promise<BackupFileInfo[]>;
export async function deleteBackup(filename: string): Promise<void>;
export async function getLastBackupTime(): Promise<string | null>;
export async function isAutoBackupEnabled(): Promise<boolean>;
export async function pruneOldBackups(keep: number): Promise<number>;  // returns count deleted
```

| Function | Behavior |
|----------|----------|
| `performAutoBackup()` | Calls `exportAllData()`, writes JSON to `Paths.document/backups/cablesnap-YYYY-MM-DD-HHmmss.json`, prunes old backups, updates `last_backup_at` setting |
| `getBackupFiles()` | Lists all `.json` files in backup directory, sorted newest-first, with file size and date |
| `pruneOldBackups(keep)` | Deletes oldest backups beyond `keep` count |
| `isAutoBackupEnabled()` | Reads `auto_backup_enabled` setting, defaults to `true` (opt-out, not opt-in) |
| `getLastBackupTime()` | Reads `last_backup_at` setting for display in UI |

**Design decisions:**
- **Opt-out by default** — auto-backup is ON for new users. Data safety should not require discovery.
- **Retention default: 5** — keeps last 5 backups (~5 workouts). Each backup is typically 50-200KB so storage impact is negligible.
- **Filename includes timestamp** — makes backups sortable and human-readable.
- **Silent failure** — if backup fails (disk full, permission error), log to console but never interrupt the user's post-workout flow.

#### 2. Integration Point: `hooks/useSessionActions.ts`

Add auto-backup as a non-blocking post-completion side effect in the `finish()` function, following the existing Strava/Health Connect pattern:

```typescript
// After completeSession() and bumpQueryVersion(), before navigation:
try {
  const { performAutoBackup, isAutoBackupEnabled } = await import("../lib/backup");
  if (await isAutoBackupEnabled()) {
    const result = await performAutoBackup();
    if (result.success) {
      // Silent success — no toast needed (invisible feature)
    }
  }
} catch {
  // Silent failure — backup should never block workout completion
}
```

**Why this location**: The `finish()` callback already handles Strava sync, Health Connect sync, and program advancement as non-blocking side effects. Auto-backup fits this exact pattern — fire-and-forget after session completion.

#### 3. Settings UI: `components/settings/AutoBackupSection.tsx`

New settings section in the Settings tab, placed **above** the existing Data Management card (because auto-backup is the primary data safety feature):

| Element | Behavior |
|---------|----------|
| **Toggle: "Auto-Backup"** | Enables/disables auto-backup after workouts. Default: ON |
| **Caption text** | "Automatically saves your data after each workout" |
| **Last backup timestamp** | "Last backup: Today at 2:34 PM" or "No backups yet" |
| **Retention picker** | "Keep last N backups" — options: 3, 5, 10, 20. Default: 5 |
| **"Backup Now" button** | Manual trigger for immediate backup (uses same `performAutoBackup()`) |
| **"View Backups" link** | Navigates to backup list screen |

#### 4. New Screen: `app/settings/backups.tsx`

List of all auto-backup files with:
- Filename and date
- File size
- **Restore button** per backup (navigates to existing import-backup flow with pre-selected file)
- **Delete button** per backup (with confirmation)
- **Share button** per backup (uses `expo-sharing` to share the file externally)

This screen reuses the existing `import-backup.tsx` flow for restoration — we pass the file path as a parameter instead of using the file picker.

### Data Flow

```
User finishes workout
        ↓
finish() in useSessionActions
        ↓
completeSession() → DB saved
        ↓
[Strava sync] [Health Connect sync] [Program advance]
        ↓
[Auto-backup] ← NEW
  ├─ isAutoBackupEnabled() → check setting
  ├─ exportAllData() → serialize all 19 tables
  ├─ Write to Paths.document/backups/
  ├─ pruneOldBackups(retention)
  └─ setAppSetting("last_backup_at", now)
        ↓
Navigate to summary screen
```

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| First-ever workout (no previous backups) | Creates backup directory, writes first backup. No pruning needed. |
| Backup directory doesn't exist | `ensureBackupDir()` creates it before writing |
| Disk full / write fails | Silent catch — console.warn, don't interrupt user |
| Export takes too long (huge dataset) | exportAllData() is fast (<1s for typical users). No timeout needed for V1 |
| User disables auto-backup | Setting persisted, finish() skips backup entirely |
| Workout with 0 completed sets | Session ends via "Discard" path (router to tabs) — auto-backup only runs on the "summary" path (sets > 0) |
| App killed during backup write | Partial file left on disk — next pruning cycle will find files sorted by date, partial file persists but doesn't cause issues (import validates JSON) |
| 100+ backup files (user sets retention to 20, then lowers to 5) | `pruneOldBackups()` runs after every backup, trims to current retention value |
| Import from auto-backup file | Same as manual import — `importData()` uses INSERT OR IGNORE for deduplication |
| User manually exports AND has auto-backups | Both coexist — manual export goes to cache/sharing, auto-backup goes to document/backups/ |

### Acceptance Criteria

- [ ] Given auto-backup is enabled (default) When user completes a workout with ≥1 set Then a backup file is written to `Paths.document/backups/`
- [ ] Given auto-backup is enabled When backup completes Then `last_backup_at` setting is updated with current timestamp
- [ ] Given 7 backups exist and retention is 5 When a new backup is written Then the 2 oldest backups are deleted
- [ ] Given auto-backup is disabled When user completes a workout Then no backup file is created
- [ ] Given the Settings screen is open Then "Auto-Backup" section shows toggle, last backup time, and retention picker
- [ ] Given the user taps "View Backups" Then backup list screen shows all backup files with date, size, and action buttons
- [ ] Given the user taps "Restore" on a backup Then the existing import flow starts with that file pre-loaded
- [ ] Given the user taps "Delete" on a backup Then a confirmation dialog appears and the file is removed on confirm
- [ ] Given the user taps "Backup Now" Then an immediate backup runs and shows success toast
- [ ] Given backup fails (simulated) Then workout completion continues normally — no error shown to user
- [ ] PR passes all tests with no regressions
- [ ] No new lint warnings

### User Experience Considerations

- [ ] Auto-backup is opt-out (ON by default) — data safety shouldn't require discovery
- [ ] Backup is completely invisible during normal use — no toasts, no loading spinners
- [ ] "Last backup: Today at 2:34 PM" provides passive reassurance without demanding attention
- [ ] Backup list screen is simple — date, size, three action buttons per row
- [ ] Restore flow reuses existing import screen — no new mental model needed
- [ ] Settings toggle is clearly labeled with explanatory caption
- [ ] All actions work one-handed

### Out of Scope (V1)

- Cloud backup / sync (requires server infrastructure)
- Scheduled periodic backups (only post-workout trigger in V1)
- Backup encryption
- Backup compression (JSON files are small enough)
- Cross-device restore (backup stays on-device; user can Share to move files)
- Backup notifications ("Your data was backed up")
- Backup file format changes (reuses BackupV3 as-is)

### Dependencies

- `lib/db/import-export.ts` — `exportAllData()` function (exists, no changes needed)
- `expo-file-system` — File, Directory, Paths (already in use)
- `expo-sharing` — for Share button on backup list (already in use)
- `lib/db/settings.ts` — `getAppSetting()`, `setAppSetting()` (exists)

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Backup slows down session completion | Low — exportAllData() is fast (<1s) | Medium — user waits on summary screen | Make backup truly async (don't await before navigation) |
| Backup files accumulate unnoticed | Low — pruning runs automatically | Low — files are small (50-200KB each) | Retention limit enforced on every backup |
| User confusion between manual export and auto-backup | Medium | Low | Clear labeling: "Auto-Backup" vs "Export All Data" in separate sections |
| Partial backup on app kill | Very Low | Low | Import validates JSON structure; partial files are harmless |

### Test Plan

| Test | Type | Description |
|------|------|-------------|
| `performAutoBackup()` writes file | Unit | Mock file system, verify file created in correct directory |
| `pruneOldBackups()` keeps N newest | Unit | Create 7 mock files, prune to 5, verify oldest 2 deleted |
| `isAutoBackupEnabled()` defaults true | Unit | No setting exists → returns true |
| `isAutoBackupEnabled()` respects setting | Unit | Set "false" → returns false |
| Backup integrates in finish() | Unit | Mock backup module, verify called after completeSession |
| Backup failure doesn't block finish | Unit | Mock backup to throw, verify navigation still happens |
| Settings UI renders correctly | Unit | Render AutoBackupSection, verify toggle, timestamp, picker |
| Backup list shows files | Unit | Mock getBackupFiles(), verify list renders |
| Delete backup with confirmation | Unit | Tap delete → confirm → verify deleteBackup() called |

**Estimated test count**: ~15-20 new tests
**Current budget**: 1728/1800 (72 remaining) — fits within budget

### Implementation Notes

- Use lazy `import()` for `lib/backup` in `useSessionActions.ts` (matches Strava/Health Connect pattern)
- Backup directory: `Paths.document/backups/` (persistent across app updates, unlike `Paths.cache`)
- File naming: `cablesnap-YYYY-MM-DD-HHmmss.json` (sortable, human-readable)
- `getBackupFiles()` should read directory listing and parse filenames for dates (no DB tracking of backup files needed)
- Restore flow: pass file URI to import-backup screen via route params, skip file picker step

## Review Feedback

### UX Designer (Design & A11y Critique)

**Verdict: APPROVED** — No blocking UX issues.

- **Cognitive load**: Excellent — zero load during workouts, minimal in settings. Opt-out default is the right call.
- **Mental model**: Compatible — extends existing post-workout side-effect pattern (Strava/HC).
- **Interaction design**: Adequate for one-handed gym use. All standard taps, no complex gestures.
- **Visual hierarchy**: AutoBackupSection above DataManagementCard is correct — proactive safety > manual export.
- **Design system**: Uses existing Card/Button/toggle patterns. Retention picker should match FrequencyGoalPicker style.
- **Accessibility**: Standard components meet 48dp targets. Ensure accessibilityLabels on toggle, timestamp, picker.
- **Empty states**: Recommend friendly copy: "No backups yet — your first backup will be created after your next workout."

**Recommendations (nice to have):**
1. Empty state in backup list should include a "Backup Now" button
2. Retention picker should use FrequencyGoalPicker style for consistency
3. File sizes in human-readable format (e.g., "142 KB")
4. Delete confirmation should include backup date: "Delete backup from [date]?"
5. "Backup Now" success toast should update the "Last backup" timestamp immediately

### Quality Director (Release Safety) — APPROVED WITH CHANGES

**Reviewed**: 2026-04-21
**Verdict**: APPROVED WITH CHANGES

**Must-Fix (2):**
1. **REGRESSION-01**: Integration code awaits backup, contradicting "non-blocking" design. Use fire-and-forget (`void performAutoBackup()`) instead of `await`.
2. **REGRESSION-02**: Backup code placement runs before the `done.length === 0` routing check, contradicting "summary path only" claim. Either place inside the `else` branch or remove the claim.

**Recommendations (3):**
1. **DATA-01**: Add filename collision guard (milliseconds or random suffix) to prevent silent overwrites.
2. **TEST-01**: Pruning sort-order correctness must be an explicit test — a bug here silently destroys newest backups.
3. **TEST-02**: Test that navigation still happens when backup throws, not just that finish() doesn't throw.

**No security or data integrity blockers.** Low regression risk. Clean integration points. Solid rollback story.

### Tech Lead (Technical Feasibility)

**Verdict**: APPROVED_WITH_CHANGES

**Architecture fit**: Excellent — reuses existing `exportAllData()`, `getAppSetting()`/`setAppSetting()`, file system patterns from `photos.ts`, and lazy import pattern from `useSessionActions.ts`. No refactoring needed. Zero new dependencies.

**Critical fix required**: The restore flow assumes `import-backup.tsx` accepts a file path, but it actually accepts `backupJson` (full JSON string as URL param). Passing 50-200KB JSON as a route param will fail. **Solution**: Add a `filePath` param to `import-backup.tsx` — if provided, read + parse the file on mount instead of parsing `backupJson`. Backwards-compatible, minimal change.

**Minor note**: Backup is awaited before navigation in `finish()`. Acceptable for V1 (<1s), but plan should explicitly state this intent.

**Performance**: No concerns. `exportAllData()` is fast, file writes are negligible, backup list uses FlatList for ~5-20 items.

**Complexity**: Medium effort, low risk. Well-scoped V1.
