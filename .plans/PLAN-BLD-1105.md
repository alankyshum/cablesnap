# Feature Plan: Inline form-clip recording + Settings manage UX

**Issue**: BLD-1105  **Author**: CEO  **Date**: 2026-05-09
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED
**Source**: GitHub #534 (alankyshum, product owner)

## Research Source
- **Origin:** https://github.com/alankyshum/cablesnap/issues/534
- **Pain point observed:** Two related UX gaps reported in the same ticket:
  1. Exercise Details → Form clips tab is read-only; users can browse but not record/upload directly from this surface. The only documented record path is "Tap the video icon on a completed set" inside an in-progress session.
  2. Settings → Form clips card is a passive info row (icon + size string). No tappable affordance to manage / delete clips. User says: "at least like the user [should have a] price button to open the modal and delete videos as needed".
- **Frequency:** Reported by product owner; reflects a genuine cognitive gap discovered while exercising real navigation flows captured in the diagnostic interaction log.

## Problem Statement
The Form Clips feature has matured (record, library, compare, delete-from-set, storage stats) but the **management surface area** does not match user expectations:

- The Library tab on each exercise reads as a viewer-only experience because the only "+"-style affordance lives on a completed set inside a live session. Users browsing exercise details outside a session have no way to add a clip.
- The Settings card looks like a label/value statistic, not a tappable manage entry point. Users coming from iOS/Android settings paradigms expect a chevron + sheet to inspect and delete content that consumes device storage.

Both gaps shrink usable functionality and increase support load on the maintainer.

## Behavior-Design Classification (MANDATORY)
Does this shape user behavior? (see CEO §3.2 trigger list)
- [ ] **YES** — triggers: …
- [x] **NO** — purely functional UX. No streaks, notifications, gamification, social, motivational copy, identity framing, or re-engagement of lapsed users. Adding a record button + manage sheet are functional affordances exposing capabilities that already exist (record, delete, list).

Psychologist review: **N/A** unless reviewers flag a missed trigger.

## User Stories
- As a lifter reviewing an exercise outside an active session, I want a clear "Record clip" button on the Form clips tab so I can capture form check footage tied to that exercise without having to start a workout first.
- As a privacy-conscious user managing on-device storage, I want a Settings entry that opens a manageable list of all my clips so I can delete individual or batches of clips without navigating to every exercise's library.
- As a user with limited device storage, I want to see total bytes used and have a one-tap "Delete all" with confirmation so I can reclaim space quickly.

## Proposed Solution

### Overview
1. **`FormLibraryTab`**: Add a primary "Record clip" CTA in the header (or a centered CTA in the empty state replacing the current passive instruction). Tapping it opens the existing `FormVideoSheet` flow.
2. **`FormClipsStorageRow` → `FormClipsManageCard`**: Convert the row into a `Pressable` Material card with chevron that opens a new `FormClipsManageSheet`. Sheet lists all clips grouped by exercise, supports per-row delete and a footer "Delete all clips" destructive action with confirmation Alert.

### UX Design

#### Exercise Details — Form clips tab
- Header right gains a second button: `[Record]` (primary) next to existing `[Select]`.
- Empty state body: replace "Tap the video icon on a completed set to record one" with primary CTA `[ Record a clip ]` (full-width filled button) and a secondary helper line: "Or tap the video icon on a completed set during a workout."
- Recorded clip lands in the grid via existing `loadClips()` after `onClipSaved` callback.

#### Settings — Form clips card
- Card layout (single-line collapsed): `[icon] Form clips    12.4 MB · 8 clips    [chevron]`
- Tap → opens `FormClipsManageSheet` (bottom sheet on Android, modal on iOS), which shows:
  - Header: "Form clips" + close `X`.
  - Subheader stat strip: total MB, total count, exercises covered.
  - List grouped by exercise name, each row: thumbnail, date, duration, size, `[trash]` icon.
  - Footer destructive button: "Delete all clips" (Alert confirm, copy: "Delete N clips? This cannot be undone.").
- Empty state inside sheet: "No clips recorded yet. Record one from any exercise's Form clips tab."

#### Accessibility
- All new buttons have `accessibilityRole="button"` and concrete `accessibilityLabel` (e.g., "Record new form clip", "Manage form clips", "Delete clip recorded on May 8 2026", "Delete all 8 form clips").
- Destructive actions use `accessibilityHint` describing irreversibility.
- Manage sheet swipe-down to dismiss; close button has 44pt touch target.

#### Error / empty / offline
- FormVideoSheet already handles permission denied + recording failure (see existing code).
- Manage sheet delete failures: show Alert "Couldn't delete clip" + retain row.
- Web platform: both new affordances are hidden (`Platform.OS === "web"` guards reuse existing pattern in FormClipsStorageRow:36).

### Technical Approach

#### Data-model decision (key)
Form clips are stored in `set_media` with NOT NULL `set_id` and UNIQUE constraint per set (see `lib/db/form-clips.ts:30-50` and `lib/db/schema.ts` `setMedia` table).

Three options were considered for "record from exercise details outside a live set":

| Option | Schema change | UX clarity | Risk |
|---|---|---|---|
| (a) Allow nullable `set_id`, introduce "library clip" concept | YES — migration + new query paths + cascade rules | Cleanest model | High — touches FK cascade, BLD-1094 invariants, sync, backup-exclusion |
| (b) Auto-create placeholder set on record | NO — but creates phantom workout_set/session rows | Confusing in history/PR/e1RM aggregates | High — pollutes analytics; potential psych trigger (phantom data) |
| (c) Restrict inline record to exercises that have ≥1 historic completed set, attach to most recent | NO | Acceptable — most users have history per exercise they care about | Low — additive, no schema/cascade churn |
| (d) **Recommended**: hybrid — use (c) when history exists, otherwise show CTA disabled with helper "Record one from inside a workout to start your library" | NO | Honest about constraint; matches today's mental model | Lowest — purely UX-layer |

**Recommendation: option (d).** Zero schema churn, no behavior-shaping side effects, no analytics pollution. Aligns with the existing invariant from BLD-1088/1089 that workouts in count surfaces remain semantically meaningful (`kind='workout'` filter etc.).

The new clip attaches to the user's most recent completed set for that exercise (`workout_sets` ORDER BY `completed_at` DESC LIMIT 1, with `kind='workout'` filter). Existing UNIQUE per-set constraint means we must guard: if that set already has a clip, prompt user "Replace existing clip from <date>?" before delete-then-insert (or simply show the existing clip and let them delete it via the existing flow).

#### New / changed files
- `components/session/FormLibraryTab.tsx` — add Record CTA + wire into existing `FormVideoSheet`. Resolve target `setId` via new helper `getMostRecentCompletedSetForExercise(exerciseId)` in `lib/db/session-sets.ts`. Show disabled state + helper if no history.
- `lib/db/session-sets.ts` — add `getMostRecentCompletedSetForExercise(exerciseId): Promise<{id, completed_at}|null>` filtered by `kind='workout'` and `completed_at IS NOT NULL`. Test in `__tests__/lib/db.sessions-sets.test.ts`.
- `components/settings/FormClipsStorageRow.tsx` — rename to `FormClipsManageCard.tsx` (keep old export as alias for one release to avoid churn elsewhere), make Pressable, add chevron, open new sheet.
- `components/settings/FormClipsManageSheet.tsx` — NEW. Lists clips via new helper `listAllClipsGroupedByExercise()`. Bulk + per-row delete uses existing `softDeleteClip` from `lib/media/form-clips.ts`.
- `lib/media/form-clips.ts` — add `listAllClipsGroupedByExercise()` and `deleteAllClips()` (loops `softDeleteClip` for safety; do not bypass file-cleanup pipeline).
- `app/(tabs)/settings.tsx` — swap import to `FormClipsManageCard`.
- Tests:
  - `__tests__/components/settings/FormClipsManageCard.test.tsx` (renders, opens sheet)
  - `__tests__/components/settings/FormClipsManageSheet.test.tsx` (lists + deletes)
  - `__tests__/components/session/FormLibraryTab-record.test.tsx` (CTA appears, disabled when no history, opens sheet otherwise)
  - `__tests__/lib/db/session-sets-most-recent.test.ts` (kind='workout' filter, completed only)
  - `__tests__/lib/media/form-clips-bulk.test.ts` (deleteAllClips loops + clears files)

#### Performance / storage
- `listAllClipsGroupedByExercise` is bounded by clip count (capped by device storage, typically <100). Acceptable single SELECT + JS group.
- Delete-all is sequential awaited loop (existing pattern preserves cascade + file cleanup ordering). For 100+ clips, show progress: "Deleting 23/100…" via local state.

#### Dependencies
- No new npm packages.
- Reuses: `FormVideoSheet`, `recordClip`, `softDeleteClip`, `getStorageStats`, `MaterialCommunityIcons`.

## Scope
**In:**
- Inline Record CTA in FormLibraryTab (header + empty state).
- Disabled-with-helper state when exercise has no historic completed set.
- Convert FormClipsStorageRow into a tappable manage card.
- New FormClipsManageSheet with grouped list, per-row + bulk delete.
- New helper queries + tests.

**Out:**
- Schema change to allow nullable `set_id` (option a) — defer; revisit if user feedback shows option (d) is insufficient.
- Auto-creating placeholder sessions/sets (option b) — explicitly rejected; pollutes analytics + behavior-shaping concern.
- Cloud upload / cross-device sync of clips — existing privacy posture (on-device only) unchanged.
- Replacing the in-session SetRow video icon flow.
- Compare-clip workflow changes.
- iOS-specific PhotoKit picker for importing from camera roll (separate ticket if requested).

## Acceptance Criteria
- [ ] **AC1** Given an exercise with at least one completed `kind='workout'` set, When the user opens Exercise Details → Form clips, Then a primary "Record clip" button is visible in the header and tapping it opens FormVideoSheet bound to the most recent completed set.
- [ ] **AC2** Given an exercise with zero completed sets, When the user opens the Form clips tab, Then the Record CTA is rendered in disabled state with helper copy "Record one from inside a workout to start your library."
- [ ] **AC3** Given the most recent set already has a clip, When the user taps Record, Then an Alert prompts "Replace existing clip from <date>?" with Cancel / Replace; Replace deletes the prior clip via `softDeleteClip` then opens the recorder.
- [ ] **AC4** Given a saved new clip, When recording completes, Then the FormLibraryTab grid refreshes and the new clip appears at top.
- [ ] **AC5** Given any non-zero number of clips, When the user opens Settings, Then the Form clips card is tappable, has a chevron, and tapping it opens FormClipsManageSheet.
- [ ] **AC6** Given the manage sheet open, When the user taps the trash icon on a row, Then an Alert confirms and on Confirm the clip is soft-deleted and removed from the list without dismissing the sheet.
- [ ] **AC7** Given multiple clips, When the user taps "Delete all clips" and confirms, Then every clip is soft-deleted, the sheet shows the empty state, and Settings card returns to "0 MB across 0 clips".
- [ ] **AC8** Given web platform, When Settings or FormLibraryTab render, Then no new affordances appear (existing Platform.OS guards extended).
- [ ] **AC9** All new components meet a11y: each interactive element has role + label + 44pt touch target; destructive actions include accessibilityHint.
- [ ] **AC10** PR passes `npm run typecheck`, `npm run lint`, `npm test`, and `npm run test:e2e` (existing form-clip e2e suite if any) with no regressions.
- [ ] **AC11** No new lint warnings; no new Sentry breadcrumb categories beyond existing `form-clips`.
- [ ] **AC12** No schema migrations introduced; `lib/db/schema.ts` byte-identical to main.

## Edge Cases
| Scenario | Expected behavior |
|---|---|
| Exercise has zero history | Record CTA disabled with helper copy (AC2). |
| Most recent set already has clip | Replace-flow Alert (AC3). |
| User cancels Replace prompt | No deletion, no recorder; FormVideoSheet not opened. |
| Recording fails after Replace confirmation deleted prior clip | Existing clip is gone (intentional — user opted to replace); show toast "Recording failed — previous clip removed." |
| 0 clips total | Settings card still tappable (AC5); sheet shows empty state with deep-link copy. |
| Storage stats stale after delete | Settings card stat refreshes via `loadStats()` on sheet dismiss. |
| Web | All new UI hidden (AC8). |
| Very large clip count (>200) | List virtualizes via FlatList; bulk delete shows progress text. |
| Backup-exclusion failure during record | Existing FormVideoSheet behavior preserved (no regression). |
| User backgrounds app mid-bulk-delete | Loop continues until completion or app suspension; resumes on next open via existing soft-delete pending-cleanup pipeline. |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| "Most recent set" attachment surprises users (clip lands on a set from days ago) | Medium | Low | Helper copy below CTA: "Saves to your most recent set: <date>"; show date in Replace prompt. |
| Bulk delete race with foreground sync | Low | Medium | Reuse existing `softDeleteClip` pipeline (already battle-tested in cascade flows BLD-1094); no new direct file IO. |
| Renamed export breaking imports elsewhere | Low | Low | Keep `FormClipsStorageRow` alias export for one release; codemod-grep before merge. |
| FormVideoSheet contract change | Low | Medium | No contract changes — pass existing `setId`/`exerciseId` props; verify with existing FormVideoSheet tests. |
| User assumes inline record uploads to cloud | Low | Medium (privacy expectation) | Reuse existing privacy strip "Saved on this device only — never uploaded" verbatim from FormVideoSheet:235. |

## Review Feedback

### Quality Director (UX)
_Pending_

### Tech Lead (Feasibility)
_Pending_

### Psychologist (Behavior-Design)
N/A — Classification = NO. Re-trigger only if reviewers flag a missed behavior trigger.

### CEO Decision
_Pending_
