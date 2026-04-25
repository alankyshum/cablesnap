# Feature Plan: Persist Training Mode per Exercise in Workout Templates

**Issue**: BLD-621
**Author**: CEO
**Date**: 2026-04-25
**Status**: APPROVED (rev 2 — QD APPROVE 2026-04-25T05:18Z, TL APPROVE 2026-04-25T04:50Z; psychologist N/A — Behavior-Design = NO)

## Problem Statement

CableSnap supports multiple training modes per exercise (`weight`, `eccentric_overload`, `band`, `damper`, `isokinetic`, `isometric`, `custom_curves`, `rowing`). During an active session the user can pick a mode per exercise via `TrainingModeSelector` (rendered in `components/session/GroupCardHeader.tsx`), and the chosen value is stored on each `workout_set` row (`workout_sets.training_mode`).

However, when authoring/saving a workout **template**, there is no way to specify which training mode an exercise should use. Today every template-loaded session starts at the exercise's first compatible mode (`group.training_modes[0]`), forcing the user to re-pick the mode at the start of every session — a frustrating, silent UX gap especially for users training the same modality (e.g. `eccentric_overload` for an eccentric block, `isometric` for a rehab template).

The schema already has the column (`template_exercises.training_mode TEXT DEFAULT NULL`) added in `lib/db/migrations.ts:43` — but it is never read, written, or surfaced. This plan closes the loop end-to-end.

## Behavior-Design Classification (MANDATORY)

- [ ] YES
- [x] **NO** — purely functional persistence of an authoring choice. No streaks, no notifications, no rewards, no motivational copy, no progression mechanics, no re-engagement triggers, no comparative/social/identity framing. The selector is the same neutral UI already in active sessions.

**Hard exclusions** (flip Classification to YES if any of these are added during implementation):
- No celebratory animation when a user picks/saves a mode.
- No badge, unread indicator, or "new!" affordance on the mode selector.
- No streak/progress meter tied to mode choices.
- No nudges or notifications recommending mode changes.
- No comparative/social copy ("most users pick X", "your friends use Y").
- No identity copy ("eccentric athlete unlocked").

## User Stories

- As a lifter authoring a hypertrophy template, I want to pin `weight` mode on every exercise so my templates don't accidentally start in `eccentric_overload` after I tested it once.
- As a Voltra user with an eccentric block, I want to save `eccentric_overload` on the relevant compound lifts in my template so each session starts in the right mode without re-tapping.
- As a rehab user, I want to set `isometric` on specific exercises in a recovery template and have it persist across sessions.

## Proposed Solution

### Overview

Plumb `training_mode` end-to-end through the **template** layer so it is:
1. Surfaced and editable in the template editor (`hooks/useTemplateEditor.ts` + UI in `app/template/create.tsx`).
2. Persisted via `templateExercises` CRUD (`lib/db/templates.ts`).
3. Applied automatically when a session starts from a template (the session's first set inherits the template-level `training_mode`, so the existing `TrainingModeSelector` in `GroupCardHeader` renders the correct selection from the start).
4. Carried across `duplicateTemplate`, CSV/JSON import-export, and starter-template seeding (when defined).

### UX Design

**Template Editor (`app/template/create.tsx`)**
- Each exercise row in the template editor gains a compact `TrainingModeSelector` control directly below the existing sets/reps/rest fields.
- Visibility rule: only render the selector for exercises where `exercise.training_modes && exercise.training_modes.length > 1` AND `exercise.is_voltra === true` (matches the existing `GroupCardHeader.tsx:141` gate). For non-Voltra or single-mode exercises, the selector is hidden — the field stays `null` in the DB, which the session correctly interprets as "use the exercise's default mode" (existing behavior preserved).
- Default state on add: `training_mode` is `null` (= "no preference, use exercise default"), matching the current implicit behavior. Picking a mode persists immediately (consistent with how other template fields behave — debounced save via the existing template-edit flow).
- Compact layout: re-uses existing `TrainingModeSelector` with `compact` prop. Same chips, same a11y labels, same theming.
- Empty state: if `exercise.training_modes` is `null`/empty, no selector — no visual change.

**Session Start (`app/session/[id].tsx` & related)**
- When a session is created from a template, each `workout_sets` row created from a template_exercise inherits `training_mode` from `template_exercises.training_mode` (when non-null). Today sets are seeded with `training_mode: null`. We change that to `training_mode: te.training_mode ?? null`.
- The existing `GroupCardHeader` `currentMode` derivation (`group?.sets[0]?.training_mode` at `app/session/[id].tsx:205`) already prefers the first set's mode and falls back to the first compatible mode; with this change, the template-assigned mode is what shows up.
- Mid-session mode changes via `TrainingModeSelector` continue to update set rows only (no template write-back). Template edits remain explicit user actions in the template editor — no implicit promotion.

**A11y**
- Re-uses existing `TrainingModeSelector` accessibility (already audited in BLD test suite). Selector announces "Training mode for {exercise}, current: {mode}". Adding it to the template editor is purely additive.

**Error / empty states**
- Saving with `training_mode = null` is the current default — no migration needed for existing templates.
- If a user selects a mode then later the underlying `exercise.training_modes` no longer contains it (data drift, e.g. via BLD-622's eccentric removal), session creation falls back to `null` → existing default behavior.

### Technical Approach

**Data model** — schema unchanged. Column already exists:
- `lib/db/schema.ts:53` — `template_exercises.training_mode TEXT`
- `lib/db/tables.ts:86` — DDL has the column
- `lib/db/migrations.ts:43` — `addColumnIfMissing` for `training_mode TEXT DEFAULT NULL` already in place

**Type changes (`lib/types.ts`)**
- Extend `TemplateExercise` with `training_mode: TrainingMode | null;` (matches `WorkoutSet.training_mode`).

**DB layer (`lib/db/templates.ts`)** — additive changes only:
1. `getTemplateById` (lines 47–56): add `training_mode: templateExercises.training_mode` to the SELECT projection map and to the row→TemplateExercise mapper. **Do NOT** silently fix the pre-existing `target_duration_seconds` drop in this projection — out of scope (see Out-of-Scope section).
2. `addExerciseToTemplate(... trainingMode: TrainingMode | null = null)`: accept and persist; default `null` preserves current callers.
3. `updateTemplateExercise(... trainingMode: TrainingMode | null)`: accept and update.
4. `duplicateTemplate` (lines 155–172): add `training_mode: ex.training_mode` to the values block. **Do NOT** silently fix the pre-existing `target_duration_seconds` drop here either — out of scope.

`seed.ts` already handles `training_mode` for starter templates (`lib/db/seed.ts:124,128`); no change needed there.

**Session bootstrap** (location pinned by TL/QD reviews)
- The template→sets seeding loop lives in `hooks/useSessionData.ts:244–258` (the `useEffect` that calls `addSetsBatch(setsToInsert)`). `lib/db/sessions.ts:128 startSession()` only inserts the `workout_sessions` row and does NOT materialize sets.
- **Exact one-line fix**: in the `setsToInsert.push({…})` block at `hooks/useSessionData.ts:248–256`, add `trainingMode: te.training_mode ?? null,`. No DB-layer signature changes needed — `addSetsBatch` (`lib/db/session-sets.ts:196`) already accepts `s.trainingMode ?? null`.
- Behavioral spec: first set per template_exercise inherits the template's `training_mode`; subsequent sets follow existing rules (inherit from previous set in the same exercise).
- **Test ergonomics (suggested by both reviewers, non-blocking but recommended)**: extract the `tpl.exercises → setsToInsert` loop into a pure helper `buildInitialSetsFromTemplate(tpl, sessionId): SetsToInsert[]` (in `lib/db/templates.ts` or a new `lib/session-init.ts`). Table-driven unit tests cover null / `weight` / `eccentric_overload` / data-drift cases. The hook becomes a thin wiring layer. Matches the codebase's existing helper-extraction pattern (cf. `lib/format.ts`).

**Hook (`hooks/useTemplateEditor.ts`)**
- Surface `training_mode` in the editor state for each exercise.
- Add `setExerciseTrainingMode(exerciseRowId, mode)` action that updates local state and triggers the existing persistence flow.

**UI (`app/template/create.tsx`)**
- Render `<TrainingModeSelector compact />` per exercise row when the gate condition holds (Voltra + multi-mode). Wire `onSelect` to the new hook action.

**CSV / JSON import-export**
- Export side (`lib/db/import-export.ts:286`) uses `SELECT *` for `template_exercises`, so the new column round-trips automatically — no edit needed.
- Import side: extend the `template_exercises` INSERT statement at `lib/db/import-export.ts:436` to include `training_mode` (and the corresponding values bind). Treat a missing field on legacy backups as `null`.
- CSV deals with `workout_sets`, not templates — no change.

**Performance**
- One additional column read per template_exercise row — negligible (already in same row).
- No new queries, no new joins.

**Storage**
- Net storage delta: `O(template_exercise rows)` × ~6 bytes (mode string or `NULL`). Trivial.

**Backward compatibility**
- All existing templates have `training_mode = NULL` → session-creation behavior unchanged for them. Pure additive feature.

## Scope

**In:**
- Type extension for `TemplateExercise`.
- DB CRUD plumbing in `lib/db/templates.ts` for read/write/duplicate.
- Hook + UI change in template editor to set/clear the mode.
- Session bootstrap inheritance from template_exercise to first set.
- JSON import-export round-trip.
- Unit tests for templates DB layer + session-start inheritance.
- Acceptance test: author template → set mode → start session → verify mode is selected on session screen.
- Changelog entry under Added.

**Out:**
- Removing/changing the existing `eccentric_overload` mode (tracked separately as BLD-622).
- Mid-session "save mode back to template" affordance (out — explicit edits only, per UX spec).
- Per-set training mode in templates (today only first-set mode; per-set is post-MVP).
- Recommendations / suggestions for mode picks.
- Migration of existing templates to populate `training_mode` (leave NULL — no behavior change).
- **Pre-existing `target_duration_seconds` projection drop in `getTemplateById` (lib/db/templates.ts:47–56) and values-drop in `duplicateTemplate` (lines 155–172) — these are real data-loss bugs but separate from BLD-621. File a follow-up ticket if desired; do NOT bundle them into this PR.**

## Acceptance Criteria

- [ ] **Schema**: existing `template_exercises.training_mode` column is read/written by template CRUD (no migration needed).
- [ ] **Type**: `TemplateExercise.training_mode: TrainingMode | null` exists; build passes.
- [ ] **Read**: `getTemplateById(id)` returns each `TemplateExercise` with the persisted `training_mode` value.
- [ ] **Write — add**: `addExerciseToTemplate(..., trainingMode)` accepts and persists; default `null`.
- [ ] **Write — update**: `updateTemplateExercise(..., trainingMode)` updates the column.
- [ ] **Duplicate**: `duplicateTemplate(id)` copies `training_mode` per row to the new template.
- [ ] **Editor UI**: in `app/template/create.tsx`, exercises with `is_voltra && training_modes.length > 1` show a `TrainingModeSelector`; selection persists across editor reloads.
- [ ] **Session inheritance**: Given a template_exercise with `training_mode = "eccentric_overload"`, When a session is started from the template, Then the first `workout_set` for that exercise has `training_mode = "eccentric_overload"` and the session screen's `TrainingModeSelector` is pre-selected to it.
- [ ] **Default behavior preserved**: Given a template_exercise with `training_mode = null` (existing data), When a session starts, Then behavior is identical to today (no regression in existing acceptance tests).
- [ ] **JSON export/import**: round-trip preserves `training_mode` on template_exercises. Export auto-includes via `SELECT *` at `lib/db/import-export.ts:286`; import extends INSERT at `lib/db/import-export.ts:436`.
- [ ] **Data-drift test**: explicit unit test asserting that when a saved `training_mode` is not present in the current `exercise.training_modes` (BLD-622 interaction), session start falls back to `null` gracefully (no crash, no UI artifact).
- [ ] **No new lint warnings, no TS errors, all existing tests pass.**
- [ ] **CHANGELOG.md** entry added under Unreleased > Added.

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Template_exercise with `training_mode = null` | Session start uses today's default (no change). |
| Template_exercise with mode no longer in `exercise.training_modes` (data drift / BLD-622 removal) | Session start falls back to `null` (default mode); no crash. Log a console.warn in dev only. |
| Non-Voltra exercise (`is_voltra=false`) with single mode | Selector hidden in editor; column stays `null`. |
| Duplicate template | Mode copied verbatim. |
| Reorder template exercises | `training_mode` is on each row — unaffected by position changes. |
| Delete then re-add same exercise | Mode resets to `null` (re-add is a new row). Acceptable. |
| Linked superset/circuit group | Each linked exercise keeps its own `training_mode` independently. |
| Empty/missing `exercise.training_modes` | Selector not rendered; column stays `null`. |
| JSON import of v0.x export with no `training_mode` field | Defaults to `null`. |
| A11y: VoiceOver | `TrainingModeSelector` already a11y-tested; reused as-is. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Session-bootstrap inheritance lands in the wrong code path and breaks existing sessions | Low | High | Implementer must locate exact code path (likely `lib/db/sessions.ts`) and add a unit test that asserts a non-null template `training_mode` flows to set 1 AND a null one preserves today's behavior. |
| BLD-622 (remove eccentric) lands first and saved templates point at a removed mode | Medium | Low | Fallback rule already specified — null out & log warn. Add explicit test. |
| Selector clutters dense template editor rows | Medium | Low | `compact` prop + visibility gate (Voltra + multi-mode) keeps it off rows that don't need it. QD review will validate. |
| Hidden field in editor causes user confusion ("why does my template start in eccentric?") | Low | Medium | Selector visible whenever a mode is set OR when multi-mode applies; default `null` = "auto" so no surprise. |
| Import/export schema drift breaks legacy backups | Low | Medium | Treat missing field as `null` on import; covered by edge case + test. |

## Review Feedback

### Quality Director (UX)
**Verdict (rev 1, 2026-04-25T03:57Z): APPROVE WITH CONDITIONS.** Conditions folded into rev 2:
1. ✅ Session bootstrap location pinned to `hooks/useSessionData.ts:244–258` (one-line `trainingMode: te.training_mode ?? null` fix at line 248).
2. ✅ `getTemplateById` projection: explicit `training_mode: templateExercises.training_mode` instruction added; `target_duration_seconds` drop kept out of scope.
3. ✅ `duplicateTemplate` values: explicit `training_mode: ex.training_mode` instruction added; `target_duration_seconds` drop kept out of scope.
4. ✅ JSON import INSERT pinned to `lib/db/import-export.ts:436`; export auto-includes via `SELECT *` line 286.
5. ✅ `seed.ts` removed from scoping list (already handles `training_mode` per `seed.ts:124,128`).
6. ✅ Test-shape suggestion: pure-helper extraction `buildInitialSetsFromTemplate` documented as recommended (non-blocking).
7. ✅ Data-drift fallback test added to acceptance criteria.

_Awaiting QD final APPROVE on rev 2._

### Tech Lead (Feasibility)
**Verdict (rev 1, 2026-04-25T04:10Z): APPROVE WITH CONDITIONS.** Conditions folded into rev 2:
1. ✅ Session-bootstrap location pinned with exact one-line fix at `hooks/useSessionData.ts:248`.
2. ✅ Import-export location pinned: INSERT at `lib/db/import-export.ts:436`; export auto-roundtrip via `SELECT *` at line 286.
3. ✅ Explicit out-of-scope guard added: do not fix `target_duration_seconds` projection bugs in this PR.
4. ✅ Suggested `buildInitialSetsFromTemplate` helper extraction documented (non-blocking).
5. ✅ BLD-622 data-drift fallback test made an explicit acceptance criterion.
6. ✅ Concurred: schema column already exists, 8 file touches, no new abstractions, no signature breaks, performance non-issue, Behavior-Design = NO.

_Awaiting Techlead final APPROVE on rev 2._

### Psychologist (Behavior-Design)
_N/A — Behavior-Design Classification = NO. No streaks/rewards/notifications/identity/social triggers per §3.2._

### CEO Decision
_Pending — rev 2 published 2026-04-25T~04:46Z; awaiting final APPROVE from QD + Techlead._
