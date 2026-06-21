# Feature Plan: Workout Resume — Lossless In-Progress Session Recovery

**Issue**: BLD-1600
**Author**: CEO
**Date**: 2026-06-21
**Status**: DRAFT (rev 2 — addresses QD CHANGES REQUESTED 2026-06-21T02:16Z)
**Revision history**:
- rev 1 (2026-06-21T02:13Z) — initial plan posted for review.
- rev 2 (2026-06-21T04:30Z) — addresses all five QD blockers + six clarifications. Diff summary at the bottom of "Review Feedback".

## Research Source

- **Origin:** Own analysis of CableSnap's GitHub issue ledger and changelog cluster between v0.26.20 and v0.26.36. (Reddit research tools are offline in this run — `/skills/scripts/search-web.py` failed in the container; deferring community-sourced ideation to the next heartbeat.)
- **Pain point observed:** Owner-reported session-screen reliability defects have accumulated as the dominant fix-cluster in the last shipping window — BLD-1257 (DB open failure mid-session, v0.26.36), BLD-1235 (input fields reset while timer is running, v0.26.35), BLD-1239 ("Finish Workout" button unresponsive during rest, v0.26.35), BLD-1207 ("Complete Workout" silent no-op; the existing copy literally promises "Your in-progress workout remains intact and resumable on failure", v0.26.34). All four touch the same flow: a user is in the middle of a workout and either loses entered data or can't make forward progress.
- **Frequency:** Four consecutive shipping-window fixes in 0.26.x all touching session-screen reliability. No single one is fatal, but together they signal a structural gap: **CableSnap has no first-class mechanism to recover a workout-in-progress if the app crashes, is force-killed, or the device runs out of battery mid-session.** The closest existing precedent — the v0.26.31 Smart Rest Coach fix ("Live countdown and scheduled rest notifications now correctly resume after the app is force-quit and reopened mid-rest on Android") — solves the *notification* slice of the problem but leaves entered set data unrecovered.
- **Adjacent precedent:** PLAN-BLD-PHASE78 (Auto-Backup After Workout, BLD-466) added durability for *completed* workouts. This plan extends the same trust theme to *in-progress* workouts. The v0.26.31 Smart Rest Coach resume fix is a smaller, narrower precedent in the same direction.

### Self-audit note
An earlier draft of this section cited BLD-1260 (drag handle contrast) as part of the fix cluster — that issue is a visual/a11y fix, not a state-loss fix, and was a misclassification. Replaced with BLD-1207 above, which directly speaks to "in-progress workout remains intact and resumable". All four cited fixes verified against `/projects/cablesnap/CHANGELOG.md` lines 30, 38–39, 48.

## Goal Alignment (transparency note)

The active company goal is `e4fa9312-74f8-4b33-b94c-9c05f531945a` — *Internal development productivity and engineering infrastructure*. The prior CableSnap product goals (*Fluent UX*, *Gamify fitness*) are cancelled; *Frictionless workout tracking* is marked achieved. This proposal is framed deliberately as a **reliability/data-integrity investment**, not a behavior or growth feature:

- It removes a class of user-visible bug (state loss mid-workout) that has been driving recent fix work.
- It introduces a typed schema migration and a small, isolated subsystem that increases code confidence in the session flow — directly aligned with the active goal's framing.
- It does **not** add gamification, streaks, notifications, or onboarding — so no psychologist gate is required (see Behavior-Design Classification below).

If the board would prefer to defer this until a new user-product goal is set, the plan can be parked as `backlog` after review without wasted implementation effort.

## Behavior-Design Classification (MANDATORY)

- [ ] **YES** — triggers: [none].
- [x] **NO** — purely functional. The feature is a data-integrity / failure-recovery mechanism. There are no streaks, no rewards, no notifications, no loss-framing copy, no re-engagement of lapsed users, no onboarding hooks, no motivational visualizations. The "Resume" banner is a neutral utility prompt, not a behavioral nudge.

Psychologist review: **N/A** (Classification = NO). When in doubt, the CEO will still request a scoping verdict per §3.2 — see Review Feedback section.

## Problem Statement

Today, if a user has logged five sets of an exercise and the CableSnap app is killed (OOM, force-stop, device reboot, battery death, OS update), **all five sets are lost** on next launch. The session screen reads state only from in-memory React state until the user explicitly taps "Finish Workout"; nothing is persisted to SQLite mid-session.

This is a hidden tax on every long workout. A typical CableSnap user logs 4-7 exercises × 3-5 sets per workout — 30 to 60 minutes of in-app time. Phone OS reclaims memory aggressively when the screen is off (which is most of the rest-period time), so this scenario is real, not theoretical.

**User emotion today:** "I lost my whole back workout because I locked my phone for too long and the app got killed. I had to redo every set from memory. This is the kind of thing that makes me go back to Hevy."

**User emotion after:** "I locked my phone, came back ten minutes later, and the app just picked up exactly where I left off. I didn't even notice it had restarted."

This is the *invisible feature* — the one users only notice when it fails.

## User Stories

- As a lifter, I want my in-progress workout to survive an app restart so that I never lose entered sets.
- As a lifter, I want a clear "Resume Workout" prompt on relaunch so that I can either continue or discard intentionally.
- As a lifter, I want the resumed workout to restore every set's weight, reps, RPE, notes, and the current set's position so that I do not have to remember context.
- As a privacy-conscious user, I want drafts to live only on-device with a sane time-to-live so that abandoned workouts do not accumulate forever.

## Proposed Solution

### Overview

Persist every set edit, RPE change, note edit, and current-set transition to a new `session_drafts` SQLite table (debounced) so that mid-session state survives app death. On cold start, scan for drafts younger than 24h; if any exist, show a single non-intrusive **Resume Workout** banner above the home screen. Tapping Resume restores the session screen to the exact in-progress state. Tapping Discard deletes the draft. Drafts older than 24h are auto-cleaned on app boot. Completing a workout normally clears its draft.

### UX Design

#### Resume Workout Banner (home screen)

- Renders above the home screen's primary content (`app/(tabs)/index.tsx`) when an unfinished session draft from <24h ago exists.
- **Phone layout (default, narrow widths < 600dp):** `Card` with two stacked rows: top row shows draft timestamp + template name + set count snapshot ("Push Day · Started 38 min ago · 5 sets"). Bottom row shows two full-width `Pressable` buttons — **Resume** primary (left/leading), **Discard** secondary destructive (right/trailing). Both buttons are ≥48dp tall. **No horizontal-only layout on phones.**
- **Tablet layout (≥ 600dp):** Single horizontal row, `maxWidth: 640`, same content order; buttons remain ≥48dp.
- **RTL:** Both layouts mirror correctly via React Native's RTL flow — Resume stays the leading action, Discard the trailing. No hard-coded `flexDirection: 'row'`; use the default to inherit `I18nManager.isRTL`.
- Uses existing `Card` component with subtle accent border (no flashing, no animation, no exclamation marks). Tone: helpful utility, not alarm.
- Discard requires a one-tap confirmation modal ("Discard 5 sets? This cannot be undone.") to avoid accidental data loss. Modal has `accessibilityViewIsModal=true` and announces the set+exercise count.
- Banner hides automatically after Resume (user lands on session screen) or Discard.
- If multiple drafts exist (≥2), banner shows the most recent inline AND renders a `"See all (N)"` Pressable footer link that opens the **Multi-Draft Bottom Sheet** (below).
- a11y: large touch targets (≥48dp), `accessibilityLabel` includes draft age and set count. After Resume tap, focus moves programmatically to the session screen's title (`accessibilityRole="header"`).

#### Multi-Draft Bottom Sheet (resolves QD blocker #4)

Triggered by "See all (N)" on the banner when ≥2 active drafts exist.

- **Container:** native bottom sheet (`@gorhom/bottom-sheet` if already in deps; otherwise `Modal` with bottom-anchored animation — confirm in implementation issue). Snap points: 50% then 90%.
- **Header:** "Unfinished workouts (N)" + close affordance (X icon, 48×48dp target).
- **Sort order:** `last_edited_at DESC` (most recent first). Stable secondary sort by `started_at DESC` on ties.
- **Row composition:** each draft is a 72dp-tall row containing:
  - Left: template name (line 1, bold) and "Started 38 min ago · 5 sets" subtitle (line 2, muted).
  - Right: two side-by-side icon-labelled buttons — **Resume** (filled primary) and **Discard** (outlined destructive), each 48×48dp minimum tap area, with `accessibilityLabel="Resume Push Day"` etc.
- **Per-row Discard confirmation:** reuses the single-draft `DiscardDraftModal` component (same copy template). No per-row inline confirm — always modal.
- **Tablet layout:** Same bottom sheet, content `maxWidth: 720` centered, rows render in a single column.
- **RTL:** Row mirrors — Resume becomes trailing action.
- **Empty state:** if the user discards every draft from inside the sheet, the sheet auto-dismisses to the home screen with no banner.
- **Test coverage:** AC11 asserts sort order, row count, and that tapping any row's Resume lands on the corresponding session screen.

#### Resumed Session Screen

- Lands the user on `app/session/[id].tsx` exactly as if they had never left.
- Restores: current exercise, all entered sets (weight, reps, completed-flag, set type, RPE, notes), the rest timer (paused state, remaining seconds at time of last edit + elapsed time since), current set index, and any UI accessories (StackMarkerPill, RpeChipStrip selections, photos attached so far).
- A small neutral toast: "Resumed — your last edit was 38 min ago." Auto-dismisses in 3s.
- No celebration, no streak interaction, no comparison to last session beyond the normal `LastNextRow`.

#### Discard Flow

- Confirmation modal listing what will be lost: "Discard Push Day (5 sets, 3 exercises)? This cannot be undone."
- On confirm: delete the draft row, hide banner, no further state.
- No "undo" toast — discard is intentional and immediate.

### Technical Approach

#### New DB Table: `session_drafts`

**Identity convention (resolves QD blocker #2):** `id` IS the session UUID. There is no separate `session_uuid` column. The app generates a session UUID when the user starts a workout; the same value is used as `session_drafts.id`, as the URL param in `app/session/[id].tsx`, and as `workout_sessions.id` when the workout finishes. UPSERT on `session_drafts.id` is therefore equivalent to "one row per active session." This is enforced by the PRIMARY KEY constraint — no additional UNIQUE index needed.

Single row per active session (UPSERT keyed on `id`). Schema in `lib/db/schema.ts`:

```typescript
export const sessionDrafts = sqliteTable('session_drafts', {
  // id IS the session UUID (same value flows to workout_sessions.id on finish)
  id: text('id').primaryKey(),
  workout_template_id: text('workout_template_id').references(() => workoutTemplates.id),
  template_name_snapshot: text('template_name_snapshot').notNull(),  // denormalized; survives template delete
  started_at: integer('started_at').notNull(),    // unix epoch ms
  last_edited_at: integer('last_edited_at').notNull(),  // for TTL + banner timestamp
  payload_json: text('payload_json').notNull(),   // serialized session state (see schema below)
  schema_version: integer('schema_version').notNull().default(1),  // for safe schema evolution
});
// Index for banner cold-start scan: SELECT * FROM session_drafts WHERE last_edited_at > ? ORDER BY last_edited_at DESC LIMIT 5
// Added in migration as: CREATE INDEX idx_session_drafts_last_edited ON session_drafts(last_edited_at DESC);
```

#### Payload JSON Schema (v1)

```typescript
type SessionDraftPayload = {
  v: 1;
  current_exercise_id: string;
  current_set_index: number;
  exercises: Array<{
    exercise_id: string;
    name_snapshot: string;          // survives exercise delete
    sets: Array<{
      weight: number | null;
      reps: number | null;
      completed: boolean;
      set_type: 'warmup' | 'working' | 'drop' | 'rest_pause' | 'cluster';
      rpe: number | null;
      notes: string | null;
      photo_attachment_id: string | null;
    }>;
  }>;
  rest_timer: {
    target_seconds: number | null;
    paused: boolean;
    elapsed_seconds_at_pause: number | null;
    timer_started_at: number | null;
  };
};
```

Serializing the full state as a single JSON blob avoids N table writes per set edit, and the payload is small (typical workout: <4KB).

#### New Files

1. `lib/db/session-drafts.ts` — Drizzle CRUD: `getActiveDrafts(limit)`, `upsertDraft(draft)`, `deleteDraft(id)`, `cleanupExpiredDrafts(maxAgeMs)`.
2. `hooks/useSessionDraftWriter.ts` — debounced write hook used by the session screen. Wraps a 300ms-debounced UPSERT call.
3. `hooks/useSessionDraft.ts` — reader hook for the home banner. Returns active drafts.
4. `components/home/WorkoutResumeBanner.tsx` — the banner UI.
5. `components/home/DiscardDraftModal.tsx` — confirm-discard modal.
6. `lib/db/migrations/00XX_session_drafts.sql` — table creation migration.

#### Existing Files Modified

1. `lib/db/schema.ts` — add `sessionDrafts` table.
2. `lib/db/tables.ts` — runtime DDL for the new table.
3. `app/session/[id].tsx` (or its current location) — wire `useSessionDraftWriter` on every state mutation; on mount, hydrate from draft if `?resume_from_draft_id=...` is passed; on `finishWorkout()` success, call `deleteDraft(draftId)`.
4. `app/(tabs)/index.tsx` — render `WorkoutResumeBanner` above existing content.
5. `lib/db/migrations.ts` — register the new migration.
6. `app/_layout.tsx` (or app boot) — call `cleanupExpiredDrafts(24 * 60 * 60 * 1000)` once on launch.

#### Deleted-exercise / deleted-template Finish path (resolves QD blocker #5)

The current `workout_sets.exercise_id` is non-null with a FK to `exercises.id`. On Resume of a draft whose `exercise_id` no longer exists in the `exercises` table:

1. **Finish behavior:** the implementation MUST detect the missing FK at finish-time and substitute a stable **sentinel exercise row** named `__deleted_exercise_<original_id>` (re-creating it with `is_archived=true, name=name_snapshot` if not present). This guarantees a valid FK without resurrecting a user-deletable exercise in the picker.
2. **Alternative considered + rejected:** dropping the FK constraint or making `exercise_id` nullable would break every history/analytics reader. Substitution is the smallest blast-radius fix.
3. **Acceptance:** AC8 explicitly asserts no FK-violation error is thrown and history readers (`pr-dashboard.ts`, `exercise-history.ts`, `monthly-report.ts`) load the resulting session row without throwing.
4. **Template-deleted analog:** `workout_sessions.template_id` (verified at `lib/db/schema.ts:85`) is **already nullable** and has no FK constraint. On finish, the resumed session is written with `template_id=null` if the template was deleted; the in-row `name` field on `workout_sessions` (line 86, NOT NULL) takes the value from `template_name_snapshot`. No schema change needed.

#### Backup / Export / Import Contract (resolves QD blocker #3 — BLD-335 alignment)

`session_drafts` is **intentionally ephemeral** and **MUST NOT** be added to the backup or import/export pipeline. The intent is:

1. Drafts represent a *crash recovery cache*, not user data.
2. Exporting drafts would mix half-edited transient state with the user's durable workout history — confusing on import.
3. Importing a draft from another device's snapshot would conflict with the current device's `workout_sessions.id` space.

**Specific changes that MUST NOT happen in this PR:**
- Do NOT add `"session_drafts"` to `BackupTableName` in `lib/db/import-export.ts:21`.
- Do NOT add `"session_drafts"` to `BACKUP_TABLE_LABELS`, `IMPORT_TABLE_ORDER`, or any `BACKUP_CATEGORY_TABLES` mapping.
- Do NOT include drafts in any `exportAll`, `importAll`, or category-export flow.

**Contract test (new):** `__tests__/lib/db/session-drafts-backup-exclusion.test.ts` — imports `BackupTableName`, `IMPORT_TABLE_ORDER`, and asserts neither contains the string `"session_drafts"`. This is a regression guard so a future contributor who naïvely "adds the new table to backup" gets a red test.

**Documentation contract:** A 4-line comment at the top of `lib/db/session-drafts.ts` will state: *"session_drafts is excluded from backup/export/import by design. Drafts are device-local crash-recovery state. See PLAN-BLD-PHASE81.md → Backup / Export / Import Contract."*

### Additional New Files (rev 2)

- `__tests__/lib/db/session-drafts-backup-exclusion.test.ts` — backup-registry exclusion contract test (AC10).
- `__tests__/acceptance/workout-resume.test.tsx` — covers AC1, AC2, AC3, AC4, AC5, AC8, AC9, AC11.
- `__tests__/lib/db/session-drafts.test.ts` — covers AC6, AC7, plus 3 helper-level tests.

#### Performance Considerations

- Debounce window: 300ms. Most set edits are bursty (typing reps + weight + tapping completed) so a single write batches them. Background `requestIdleCallback`-equivalent is unnecessary — Drizzle write of 4KB to SQLite is sub-millisecond on-device.
- Banner read query is a single `SELECT * FROM session_drafts WHERE last_edited_at > ? LIMIT 5` — fully indexed on `last_edited_at`. Sub-ms.
- Payload growth bounded by workout size; even a 12-exercise × 8-set workout serializes to <8KB.
- No new dependencies. Reuses existing Drizzle ORM, React Query / `useFocusEffect`, and `expo-sqlite`.

#### Schema Evolution Safety

The `schema_version` integer on the row + the `v: 1` discriminator in the payload allow future evolution without breaking old drafts:

- On read, if `schema_version > 1` is unknown, draft is treated as "incompatible — recommend discard" (banner shows a neutral message; Resume button disabled).
- On read, if `schema_version === 1`, parse with Zod schema; if parse fails, treat as corrupted (silent delete + log).

#### Cleanup Policy

- App boot: delete drafts with `last_edited_at < now() - 24h`. Idempotent, fast (single DELETE with WHERE).
- After workout finished successfully: delete the draft with matching `id`.
- After manual Discard: delete the draft with matching `id`.
- No background tasks, no scheduled jobs, no notifications — purely on-app-boot and on-event cleanup.

### Scope

**In Scope:**
- `session_drafts` table + migrations + Drizzle CRUD.
- Debounced draft writes on every session-screen state mutation.
- Home-screen Resume banner with Resume / Discard actions.
- Confirm-discard modal.
- Hydration of session screen from a draft on Resume.
- 24h TTL cleanup on app boot.
- Clear draft on workout completion.
- Zod schema validation for payload parsing.
- One unit-style test per Drizzle function (CRUD + cleanup).
- One acceptance test per AC bullet (per `.claude/CLAUDE.md` BLD-1123 convention).

**Out of Scope:**
- Cross-device draft sync (offline-first, single-device by design).
- Cloud backup of drafts (drafts are intentionally ephemeral).
- Visual diff of "what changed since last edit" (not useful for the use case).
- Multiple-active-draft UI beyond a basic list (rare edge case).
- Resume of completed-but-not-saved workouts (those already have Auto-Backup from BLD-466).
- Draft history / undo of discard (intentional one-way action).
- Resume of programs / multi-session sequences (out of scope; CableSnap deprecated structured programs per the cancelled Fluent UX goal).

### Acceptance Criteria

- [ ] **AC1** Given a user has entered 3 sets on the session screen, When the app is force-killed and restarted, Then the home screen shows a Resume banner referencing the active draft. [test: __tests__/acceptance/workout-resume.test.tsx::"AC1 banner appears after app kill"]
- [ ] **AC2** Given a Resume banner is visible, When the user taps Resume, Then the session screen loads with all 3 sets pre-filled exactly as entered (weight, reps, completed-flag, RPE, notes). [test: __tests__/acceptance/workout-resume.test.tsx::"AC2 resume restores set state"]
- [ ] **AC3** Given a Resume banner is visible, When the user taps Discard and confirms, Then the draft is deleted and the banner disappears with no further prompts. [test: __tests__/acceptance/workout-resume.test.tsx::"AC3 discard removes draft"]
- [ ] **AC4** Given a user completes a workout normally via Finish, Then no Resume banner appears on the next app launch. [test: __tests__/acceptance/workout-resume.test.tsx::"AC4 finish clears draft"]
- [ ] **AC5** Given a draft exists with `last_edited_at` older than 24h, When the app is launched, Then the draft is silently deleted and no banner shows. [test: __tests__/acceptance/workout-resume.test.tsx::"AC5 24h expiry"]
- [ ] **AC6** Given the user edits a set's weight or reps, When 300ms pass with no further edits, Then exactly one row exists in `session_drafts` for that session with the new value persisted. [test: __tests__/lib/db/session-drafts.test.ts::"AC6 debounced upsert"]
- [ ] **AC7** Given the payload JSON has `schema_version` > 1 (forward-compat scenario), When the banner reads it, Then the banner renders a neutral "Incompatible draft" state with Discard-only action (no crash). [test: __tests__/lib/db/session-drafts.test.ts::"AC7 forward compat"]
- [ ] **AC8** Given a session draft references an exercise that has since been deleted, When the user Resumes, Then the exercise is shown with the snapshot name and a small "(deleted)" badge, the user can finish sets against the snapshot **without inserting any `workout_sets` row whose `exercise_id` references the deleted exercise**, and history/analytics readers do not crash on the resulting session. [test: __tests__/acceptance/workout-resume.test.tsx::"AC8 deleted exercise survives without FK violation"]
- [ ] **AC9 (NEW — resolves QD blocker #1)** Given a user has typed a new weight into a set field, When the app transitions to `AppState=background` before the 300ms debounce expires, Then the in-flight value is force-flushed to `session_drafts` synchronously before the app suspends, AND a subsequent cold start Resume restores that exact value. [test: __tests__/acceptance/workout-resume.test.tsx::"AC9 AppState=background force-flushes pending debounce"] — implemented with `act()` + fake timers + `AppState.emit('change', 'background')`, asserting (a) `upsertDraft` was called before the AppState handler resolved and (b) the persisted payload contains the latest typed value.
- [ ] **AC10 (NEW — resolves QD blocker #3)** Given the `session_drafts` table exists, When the backup-table registry is inspected at runtime, Then `BackupTableName` union, `IMPORT_TABLE_ORDER`, and `BACKUP_TABLE_LABELS` do NOT contain `"session_drafts"`. [test: __tests__/lib/db/session-drafts-backup-exclusion.test.ts::"AC10 session_drafts excluded from backup registry"]
- [ ] **AC11 (NEW — resolves QD blocker #4)** Given 2+ active drafts exist (<24h), When the user opens the home screen, Then the banner shows the most recent draft inline and renders a "See all (N)" affordance that opens a **bottom sheet** listing all drafts ordered by `last_edited_at DESC`, with per-row Resume/Discard 48×48dp targets, RTL-mirrored layout, and per-row destructive confirmation reused from the single-draft modal. [test: __tests__/acceptance/workout-resume.test.tsx::"AC11 multi-draft bottom sheet renders sorted drafts"]
- [ ] PR passes all existing tests with no regressions.
- [ ] No new lint warnings.
- [ ] Typecheck passes with zero errors.

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| App killed mid-keystroke (between debounce ticks) | Last *committed* edit (older than 300ms) is preserved. The in-flight edit is lost unless the AppState=background flush (AC9) runs first; see below. |
| App killed mid-DB-write (very rare, <1ms window) | SQLite transaction guarantees atomicity. Either the new row is fully written or the previous row is intact. |
| Device clock jumps backward (NTP correction) | `last_edited_at` may briefly appear stale; banner timestamp formats use absolute time as a fallback. Cleanup uses a max age, so backward jumps don't break TTL. |
| User starts a NEW workout while a draft exists | Home screen: banner is still visible. New session creates a NEW draft row (different `id`); old draft persists until expiry or manual discard. Banner shows most recent. |
| Multiple drafts (≥2 active) | Banner shows most recent inline; "See all (N)" footer opens Multi-Draft Bottom Sheet (see UX section). |
| Payload JSON corrupted (manual DB edit, disk corruption) | Zod parse fails → row silently deleted. Local diagnostic log emits {draft id, schema_version, payload byte size, parse error class}, **NEVER payload contents** (privacy + may contain user-entered notes). No crash, no banner for that draft. |
| Exercise deleted from library after draft creation | Resume uses `name_snapshot`; shows "(deleted)" badge; on Finish, sentinel exercise row substitution prevents FK violation (see "Deleted-exercise Finish path" in Technical Approach). Existing history readers continue to work. |
| Workout template deleted | `template_name_snapshot` carries the name; finished session is written with `template_id=NULL` and `workout_sessions.name = template_name_snapshot`. No FK constraint to violate. |
| Photo attachment deleted | Payload stores `photo_attachment_id` only. On resume, if attachment is missing, photo slot shows the empty-state placeholder, AND the **next debounced write clears `photo_attachment_id` to null** so the draft does not repeatedly reference dead media. |
| 24h TTL crossed *during* an active session | Active = `last_edited_at >= now − 24h`. Every successful debounced write bumps `last_edited_at` to now, so an in-use session is always active. **Cleanup MUST run only at app boot and MUST NOT execute while an in-memory `useSessionDraftWriter` flush is pending** — implementation gates `cleanupExpiredDrafts` behind a single boot-time `Promise.resolve()` on `app/_layout.tsx`, before any session screen mounts. |
| Two devices share the same SQLite DB (impossible in current architecture but defensive) | Out of scope. CableSnap is single-device. |
| Resume tapped while session screen is already open for a different session | Show modal: "Discard current session and resume Push Day?" — explicit. |
| App transitions to `AppState=background` during the 300ms debounce window | **AC9 covers this.** The session-screen mounts a single `AppState.addEventListener('change', handler)`; on transition to `background` or `inactive`, the handler calls `flushPendingDraft()` synchronously (awaits the in-flight debounce's pending write before returning). If no pending edit, the call is a no-op. This is the only way to make the feature truly lossless. |

### User Experience Considerations

- [ ] Works one-handed in a gym setting — phone-layout banner uses **stacked vertical buttons** with Resume primary; no horizontal-only row required.
- [ ] Minimal taps — 1 tap to Resume, 2 taps (Discard + Confirm) to discard.
- [ ] No data loss feels surprising — Resume is the default visual emphasis.
- [ ] Dark mode supported via existing theme tokens.
- [ ] a11y labels include set count and draft age.
- [ ] **a11y focus management:** After tapping Resume, programmatic focus moves to the session screen's title (`accessibilityRole="header"`). The Discard confirmation modal sets `accessibilityViewIsModal={true}` and its announcement includes set + exercise count ("Discard Push Day with 5 sets across 3 exercises").
- [ ] Responsive layout for tablet (banner uses `maxWidth: 640` on wide screens; multi-draft bottom sheet uses `maxWidth: 720`).
- [ ] RTL-correct via inherited flow (no hard-coded directional flex).
- [ ] No motion / animation beyond the existing card mount.

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Debounced writes interact badly with React Query cache | Low | Medium | Write directly to SQLite via Drizzle, do NOT round-trip through React Query. RQ is read-only for drafts. |
| Payload schema drift between versions | Medium | Medium | `schema_version` + Zod parse + forward-compat AC7. |
| Performance regression on slower Android devices (Z Fold6 is fast; older Pixel 4a might not be) | Low | Low | 300ms debounce + sub-ms SQLite writes. Add a perf budget assertion in tests if QD requests. |
| Storage growth from abandoned drafts | Very Low | Low | 24h TTL + on-app-boot cleanup. Worst case: ~10 drafts × 8KB = 80KB per user. |
| User confusion about Resume vs. Start Fresh | Low | Medium | Banner copy is explicit; Discard has explicit confirmation. UX Designer to review wording. |
| Hidden FK constraint violations on deleted exercises/templates | Medium | Medium | Snapshot fields (`name_snapshot`, `template_name_snapshot`) on the draft itself. Tested in AC8. |
| Migrating production DBs over a corrupt SQLite file | Low | High | Migration is additive (CREATE TABLE IF NOT EXISTS). No existing-data mutation. |

### Test Plan

Budget-conscious — 11 acceptance/contract tests aligned 1:1 with ACs above. All test names embedded in the AC bullets for traceability (`.claude/CLAUDE.md` BLD-1123 convention).

`__tests__/acceptance/workout-resume.test.tsx`:
1. `"AC1 banner appears after app kill"` — seed fixture draft <24h; mount home; assert banner renders.
2. `"AC2 resume restores set state"` — tap Resume; assert session screen rehydrated with weight/reps/RPE/notes.
3. `"AC3 discard removes draft"` — tap Discard → Confirm; assert row deleted, banner gone.
4. `"AC4 finish clears draft"` — start, edit, finish via existing Finish flow; assert no banner on next render.
5. `"AC5 24h expiry"` — seed draft with `last_edited_at = now − 25h`; mount; assert row deleted, no banner.
6. `"AC8 deleted exercise survives without FK violation"` — seed draft referencing an exercise; delete the exercise; resume + finish; assert no FK error and sentinel row created.
7. `"AC9 AppState=background force-flushes pending debounce"` — type a value; emit `AppState=background` before 300ms; assert latest value persisted before suspension. Uses fake timers + `act()` + `AppState.emit('change', 'background')`.
8. `"AC11 multi-draft bottom sheet renders sorted drafts"` — seed 3 drafts at staggered `last_edited_at`; tap "See all (3)"; assert bottom sheet opens with rows in DESC order; tap row 2's Resume; assert correct session loads.

`__tests__/lib/db/session-drafts.test.ts`:
9. `"AC6 debounced upsert"` — call writer 5× in 100ms; advance fake timers by 300ms; assert exactly 1 row exists.
10. `"AC7 forward compat"` — seed draft with `schema_version=999`; mount banner; assert neutral incompatible state, Resume button disabled, Discard enabled.

`__tests__/lib/db/session-drafts-backup-exclusion.test.ts` (NEW file, dedicated):
11. `"AC10 session_drafts excluded from backup registry"` — import `BackupTableName`, `IMPORT_TABLE_ORDER`, `BACKUP_TABLE_LABELS` from `lib/db/import-export.ts`; assert `"session_drafts"` is not present in any.

Additional helper-level tests (not AC-bound but bundled with the CRUD module):
- `session-drafts.test.ts::"cleanup deletes expired and only expired"` — mixed-age drafts; call `cleanupExpiredDrafts(24h)`; assert correct rows deleted.
- `session-drafts.test.ts::"upsert is idempotent on id"` — write same `id` twice with different payloads; assert single row, latest payload.
- `session-drafts.test.ts::"corrupted payload silent-delete"` — manually insert row with invalid JSON; trigger reader; assert row removed, log entry contains {draft id, schema_version, payload byte size, parse error class}, log entry does NOT contain payload contents.

Total: **11 AC-bound + 3 helper = 14 tests.** All deterministic; uses repo's Jest/React 19 `act()` + fake timers pattern (per `.claude/CLAUDE.md`).

## Review Feedback
<!-- This section is filled in by reviewers. CEO will release the issue checkout before requesting reviews (BLD-824 workaround). -->

### Quality Director (UX, A11y, Edge Cases)
**rev 1 Verdict: CHANGES REQUESTED** (2026-06-21T02:16Z)

Blockers raised (now resolved in rev 2):

- ~~**AC must include AppState background flush.**~~ → **Resolved in rev 2** by AC9 + edge-case row + `flushPendingDraft()` implementation note. Deterministic fake-timer/AppState test specified.
- ~~**Draft identity is inconsistent (`session_uuid` vs `id`).**~~ → **Resolved in rev 2** by collapsing the two: `session_drafts.id` IS the session UUID, documented in the schema block. UPSERT keys on `id` (PRIMARY KEY).
- ~~**New table lifecycle is incomplete (BLD-335 backup/restore).**~~ → **Resolved in rev 2** by dedicated "Backup / Export / Import Contract" section + new AC10 + new contract test file `session-drafts-backup-exclusion.test.ts`.
- ~~**Multiple-draft UX is underspecified.**~~ → **Resolved in rev 2** by new "Multi-Draft Bottom Sheet" section specifying container (bottom sheet, 50%/90% snap), header, sort order, row composition (72dp), per-row 48×48dp targets, tablet `maxWidth`, RTL behavior, empty state. Acceptance via AC11.
- ~~**Deleted exercise/template finish path is not proven.**~~ → **Resolved in rev 2** by new "Deleted-exercise / deleted-template Finish path" section: sentinel-exercise-row substitution prevents FK violation; template path verified against existing nullable `workout_sessions.template_id` (`schema.ts:85`). AC8 strengthened to assert no FK error AND history readers (`pr-dashboard.ts`, `exercise-history.ts`, `monthly-report.ts`) load resulting session.

Clarifications raised (now resolved in rev 2):

- ~~A11y focus behavior + modal `accessibilityViewIsModal`.~~ → Specified in UX section.
- ~~Banner layout should not be horizontal-only on phones.~~ → Replaced with stacked vertical buttons on phones; horizontal reserved for tablets only.
- ~~Zod parse failure must log diagnostics without payload contents.~~ → Edge-case row now explicitly lists the four allowed log fields and forbids payload contents. Helper test asserts.
- ~~TTL active-session semantics.~~ → Edge-case row defines active = `last_edited_at >= now − 24h`; cleanup gated to single boot-time call before session screens mount.
- ~~Photo attachment staleness.~~ → Edge-case row: next debounced write clears dead `photo_attachment_id`.
- ~~AC count math inconsistency (10 ACs but only 8 numbered).~~ → Now 11 numbered ACs (AC1–AC11), test plan matches 1:1.

**Verdict needed:** rev 2 review. CEO requests re-review on this revision.

### Tech Lead (Feasibility, Architecture, Performance)
**rev 1 status:** No verdict posted (techlead was working BLD-1599 at the same time).
**rev 2 status:** Pending — fresh review requested on the revised plan.

### Psychologist (Behavior-Design Scoping)
**rev 1 status:** No verdict posted (psychologist agent idle in this run; classification = NO so non-blocking).
**rev 2 status:** Deferred to a follow-up cycle if scope changes. CEO judgment: Classification remains NO. "Resume Workout" copy is a neutral utility prompt; there are no streaks, rewards, notifications, onboarding hooks, comparisons to last session beyond the existing `LastNextRow`, or loss-framing. **The plan is APPROVED to proceed to techlead review without psychologist scoping** — but if techlead surfaces any concern that "Resume Workout" framing touches re-engagement (e.g. surfacing it after 6+ hours feels like a nag), CEO will reopen with a psych ping.

### CEO Decision
**rev 2:** Plan revisions address all five QD blockers and all six clarifications with concrete schema/UX/test changes. Awaiting QD re-review verdict + techlead first-pass on rev 2. **No implementation will start until both verdicts are APPROVED.**

### Rev 2 Diff Summary

Files touched in this revision:
1. **Schema block** — collapsed `id`/`session_uuid` to a single identity; added explicit comment; added `last_edited_at DESC` index for cold-start scan.
2. **NEW section: "Backup / Export / Import Contract"** — explicit do-not-add list for `BackupTableName`, `IMPORT_TABLE_ORDER`, `BACKUP_TABLE_LABELS`; contract test file declared.
3. **NEW section: "Deleted-exercise / deleted-template Finish path"** — sentinel-row substitution strategy; verified against actual schema.
4. **Resume banner UX** — added phone (stacked) vs tablet (horizontal) layouts, RTL handling, a11y focus management, modal `accessibilityViewIsModal`.
5. **NEW section: "Multi-Draft Bottom Sheet"** — container, header, sort, rows, targets, RTL.
6. **Acceptance Criteria** — added AC9 (AppState flush), AC10 (backup exclusion), AC11 (multi-draft bottom sheet); strengthened AC8 to assert no FK violation + history-reader integrity.
7. **Edge Cases table** — six rows revised: multi-draft, payload-corruption diagnostic constraints, exercise deletion, template deletion, photo cleanup, TTL active-session rule, AppState flush guarantee.
8. **UX Considerations** — phone stack vs tablet horizontal, RTL inheritance, programmatic focus on Resume, modal a11y.
9. **Test Plan** — 11 AC-bound tests + 3 helpers (was 8 acceptance + 2 unit, total 10).

No behavior-shaping additions. Classification remains NO.
