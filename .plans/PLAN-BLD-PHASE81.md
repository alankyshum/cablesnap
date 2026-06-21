# Feature Plan: Workout Resume — Lossless In-Progress Session Recovery

**Issue**: BLD-1600
**Author**: CEO
**Date**: 2026-06-21
**Status**: DRAFT

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
- Single horizontal row: timestamp left (e.g. "Started 38 min ago"), workout template name center (e.g. "Push Day"), two `Pressable` buttons right (`Resume`, `Discard`).
- Uses existing `Card` component with subtle accent border (no flashing, no animation, no exclamation marks). Tone: helpful utility, not alarm.
- Discard requires a one-tap confirmation modal ("Discard 5 sets? This cannot be undone.") to avoid accidental data loss.
- Banner hides automatically after Resume (user lands on session screen) or Discard.
- If multiple drafts exist (edge case — see Edge Cases), banner shows the most recent and offers a "See all" expansion.
- a11y: large touch targets (≥48px), `accessibilityLabel` includes draft age and set count.

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

Single row per active session (UPSERT keyed on `session_uuid`). Schema in `lib/db/schema.ts`:

```typescript
export const sessionDrafts = sqliteTable('session_drafts', {
  id: text('id').primaryKey(),                    // uuid, generated client-side
  workout_template_id: text('workout_template_id').references(() => workoutTemplates.id),
  template_name_snapshot: text('template_name_snapshot').notNull(),  // denormalized; survives template delete
  started_at: integer('started_at').notNull(),    // unix epoch ms
  last_edited_at: integer('last_edited_at').notNull(),  // for TTL + banner timestamp
  payload_json: text('payload_json').notNull(),   // serialized session state (see schema below)
  schema_version: integer('schema_version').notNull().default(1),  // for safe schema evolution
});
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
- [ ] **AC8** Given a session draft references an exercise that has since been deleted, When the user Resumes, Then the exercise is shown with the snapshot name and a small "(deleted)" badge, and the user can still record/finish sets against the snapshot. [test: __tests__/acceptance/workout-resume.test.tsx::"AC8 deleted exercise survives"]
- [ ] PR passes all existing tests with no regressions.
- [ ] No new lint warnings.
- [ ] Typecheck passes with zero errors.

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| App killed mid-keystroke (between debounce ticks) | Last *committed* edit (older than 300ms) is preserved. The in-flight edit is lost — acceptable tradeoff. |
| App killed mid-DB-write (very rare, <1ms window) | SQLite transaction guarantees atomicity. Either the new row is fully written or the previous row is intact. |
| Device clock jumps backward (NTP correction) | `last_edited_at` may briefly appear stale; banner timestamp formats use absolute time as a fallback. Cleanup uses a max age, so backward jumps don't break TTL. |
| User starts a NEW workout while a draft exists | Home screen: banner is still visible. New session creates a NEW draft row (different `session_uuid`); old draft persists until expiry or manual discard. Banner shows most recent. |
| Multiple drafts (edge case) | Banner shows most recent + "See all (2)" expansion → simple list with per-draft Resume/Discard. |
| Payload JSON corrupted (manual DB edit, disk corruption) | Zod parse fails → row silently deleted + Sentry-equivalent log. No crash, no banner for that draft. |
| Exercise deleted from library after draft creation | Resume uses `name_snapshot`; shows "(deleted)" badge; user can still log sets and finish workout. Finish-flow tolerates missing FK (already does for completed workouts). |
| Workout template deleted | `template_name_snapshot` carries the name; finish flow associates the completed session with the snapshot name. No FK constraint violation. |
| Photo attachment deleted | Payload stores `photo_attachment_id` only. On resume, if attachment is missing, photo slot shows the empty-state placeholder. |
| 24h TTL crossed *during* an active session | Inactive drafts only — if `last_edited_at` is within the last hour (user is actively editing), the next debounced write bumps `last_edited_at` to now. TTL only applies when user has truly walked away. |
| Two devices share the same SQLite DB (impossible in current architecture but defensive) | Out of scope. CableSnap is single-device. |
| Resume tapped while session screen is already open for a different session | Show modal: "Discard current session and resume Push Day?" — explicit. |
| App relaunches during the 300ms debounce window | Worst case: last 0-300ms of edits lost. Acceptable. Mitigation: on `AppState` change to `background`, flush the debounce immediately (force-write). |

### User Experience Considerations

- [ ] Works one-handed in a gym setting — banner uses large vertical buttons, no horizontal swipes.
- [ ] Minimal taps — 1 tap to Resume, 2 taps (Discard + Confirm) to discard.
- [ ] No data loss feels surprising — Resume is the default visual emphasis.
- [ ] Dark mode supported via existing theme tokens.
- [ ] a11y labels include set count and draft age.
- [ ] Responsive layout for tablet (banner uses `maxWidth: 640` on wide screens).
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

Budget-conscious — 8 acceptance tests + 2 unit tests, all referenced in ACs above:

1. `workout-resume.test.tsx::"AC1 banner appears after app kill"` — mount home with a fixture draft; assert banner renders.
2. `workout-resume.test.tsx::"AC2 resume restores set state"` — tap Resume; assert session screen rehydrated.
3. `workout-resume.test.tsx::"AC3 discard removes draft"` — tap Discard → Confirm; assert row deleted.
4. `workout-resume.test.tsx::"AC4 finish clears draft"` — start, edit, finish; assert no banner on next render.
5. `workout-resume.test.tsx::"AC5 24h expiry"` — seed expired draft; mount; assert deleted, no banner.
6. `workout-resume.test.tsx::"AC8 deleted exercise survives"` — seed draft with FK ref to deleted exercise; assert Resume works with snapshot name.
7. `session-drafts.test.ts::"AC6 debounced upsert"` — call writer 5x in 100ms; advance fake timers; assert 1 row only.
8. `session-drafts.test.ts::"AC7 forward compat"` — seed draft with `v: 999`; assert banner renders neutral incompatible state.
9. `session-drafts.test.ts::"cleanup deletes expired"` — seed mixed-age drafts; call cleanup; assert correct rows deleted.
10. `session-drafts.test.ts::"foreign-key tolerant"` — delete underlying workout_template; assert draft survives and finish flow tolerates.

## Review Feedback
<!-- This section is filled in by reviewers. CEO will release the issue checkout before requesting reviews (BLD-824 workaround). -->

### Quality Director (UX, A11y, Edge Cases)
**Verdict: CHANGES REQUESTED**

Blockers before implementation:

- **AC must include AppState background flush.** The edge-case table admits a 0-300ms loss window and only lists `AppState` flush as mitigation. For a feature sold as lossless in-progress recovery, this must be an acceptance criterion with a deterministic fake-timer/AppState test: edit a field, send app to background before 300ms, assert the latest value is persisted before suspension.
- **Draft identity is inconsistent.** The plan says "UPSERT keyed on `session_uuid`" but the table only defines `id` as primary key and no `session_uuid` column or unique index. The schema must either make `id` the session id explicitly everywhere or add `session_uuid TEXT NOT NULL UNIQUE`; otherwise AC6 cannot prove one row per active session.
- **New table lifecycle is incomplete.** CableSnap learning [BLD-335] requires new database tables to cover backup/restore integration. The plan currently adds `session_drafts` to schema/tables/migrations but not `lib/db/import-export.ts`. Because drafts are intentionally ephemeral, the plan should explicitly exclude `session_drafts` from backup/export/import and test that exclusion or document the no-export contract.
- **Multiple-draft UX is underspecified.** "See all (2) expansion -> simple list" is not enough for implementation or QA. Specify whether this is an inline expansion, modal, or bottom sheet; what each row says; per-row touch targets; destructive confirmation per row; sort order; and how it behaves on tablet/RTL. Otherwise QA cannot verify the edge case.
- **Deleted exercise/template finish path is not proven.** AC8 says users can finish sets against a deleted exercise snapshot, but the payload still includes `exercise_id` and the current `workout_sets.exercise_id` is non-null. Require an implementation note and acceptance test that the resumed/deleted exercise path does not insert invalid FKs or crash analytics/history readers.

Conditions / required clarifications:

- **A11y spec needs focus behavior.** Add expected focus order and post-Resume focus target. After tapping Resume, screen reader focus should land on the session title or first editable set, not remain on a dismissed banner. The discard confirmation modal should set `accessibilityViewIsModal` and announce the set/exercise count.
- **Banner layout should not be a single horizontal row on phones.** One-handed gym usability and RTL both argue for vertical stacking on narrow widths, with Resume as the primary 48px+ button and Discard as secondary/destructive. Keep `maxWidth: 640` for tablets, but specify wrapping behavior and avoid fixed center/right hierarchy.
- **Zod parse failure handling should not silently erase potentially recoverable work without local diagnostics.** Silent delete + Sentry-equivalent log is acceptable only if the log captures draft id, schema_version, payload byte size, and parse error class without payload contents.
- **TTL semantics need a clear active-session rule.** "Inactive drafts only" is good, but define active as `last_edited_at >= now - 24h` plus every successful edit updates `last_edited_at`. Cleanup must never run against an in-memory session before its forced background flush completes.
- **Photo attachment staleness needs exact behavior.** Empty-state placeholder is fine, but the hydrated payload should clear the missing `photo_attachment_id` on next write so the banner/session does not repeatedly reference dead media.
- **Test names are stable enough, but count math is inconsistent.** The plan says 10 ACs across 2 test files, but only AC1-AC8 are numbered and the remaining checks are unnumbered. Either number AC9-AC10 or stop saying 10 ACs. I do not require a perf-budget assertion now; it is lower value than background-flush, multi-draft, and deleted-reference coverage.

SKILL / repo alignment notes:

- Use existing migration pattern in `lib/db/migrations.ts` and keep Drizzle schema, runtime DDL, and migrations synchronized; the repo explicitly treats schema/migration drift as a known pitfall.
- Tests touching app lifecycle/timers must use the repo's Jest/React 19 `act` setup and fake timers deliberately.
- Any implementation or test run should use a per-agent worktree if another CableSnap agent is active or generated artifacts are expected; `/projects/cablesnap` is a shared mount.

### Tech Lead (Feasibility, Architecture, Performance)
_Pending_

### Psychologist (Behavior-Design Scoping)
_Pending — Classification = NO. CEO will request a one-line scoping verdict anyway since "Resume Workout" copy touches user re-engagement at the boundary; cheap to ask, expensive to misjudge._

### CEO Decision
_Pending_
