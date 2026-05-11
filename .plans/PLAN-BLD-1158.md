# Feature Plan: Tempo Coach

**Issue**: BLD-1158  **Author**: CEO  **Date**: 2026-05-11
**Status**: DRAFT → IN_REVIEW (rev-2 — addresses TL 4 blockers + QD 7 blockers; 11 items merged)
**Revision history**:
- rev-1 (11:26Z): initial submission.
- rev-2 (11:42Z): 3-PR split; explicit Coach Launcher surface (no SetRow hot-path mutation); AC5 rewritten to implementable contract; locked v1 grammar with isometric form; expo-keep-awake + AppState/unmount cancellation tests; CSV/import-export round-trip; enumerated default-tempo propagation; code-level psychologist guardrails encoded as test assertions; plateau-hint deferred to BLD-1158c with separate psych re-scope.

## Research Source
- **Origin:** Internal codebase audit + competitor gap analysis (Strong, Hevy, JEFIT, FitNotes); aligns with CableSnap goal #5 ("leverage eccentric training, training modes, and mount positions as differentiators").
- **Pain point observed:** "Why can't I log which tempo I used? Tempo/eccentric prescription is critical for hypertrophy and rehab progression but no major tracker app supports it cleanly — notes are cumbersome." (recurring theme on r/naturalbodybuilding, r/bodyweightfitness, r/weightlifting).
- **Frequency:** Recurring — not a one-off rant.
- **Foundation status:** `workout_sets.tempo` column already exists (`lib/db/schema.ts:126`, migration `lib/db/migrations.ts:141`); rendered in `components/session/detail/ExerciseGroupRow.tsx:88` and `components/session/summary/SetsCard.tsx:44`. **Input UI, exercise-level default, and in-set coaching are missing** — this PLAN closes the loop on a half-built differentiator.

## Problem Statement
CableSnap users training cable + bodyweight — disciplines where time-under-tension and eccentric overload matter more than absolute load — have no first-class way to prescribe, log, or be coached on tempo. Today they either skip it (losing a key training variable) or stuff it in free-text notes (uncurated, unsearchable, not surfaced in plateau analytics). Meanwhile the schema already stores tempo, so the gap is purely UX/coaching.

## Behavior-Design Classification (MANDATORY)
- [x] **NO** — purely functional/informational. Tempo input is a per-set numeric/string field; the optional in-set haptic metronome is a real-time training aid scoped to the active set (no notifications outside the set, no streaks, no rewards, no engagement loop, no social/leaderboard, no re-engagement copy).
- [ ] **YES** — none of the §3.2 triggers apply.

CEO requesting **scoping verdict** from `@psychologist` to confirm — if any concern is raised, the classification flips and a full review follows.

## User Stories
- As a hypertrophy-focused user, I want to **prescribe a tempo (e.g., 3-1-2-0)** at the exercise level so every set defaults to it without re-typing.
- As a user mid-set, I want an **optional haptic metronome** that ticks on each phase boundary so I can keep cadence without staring at a clock.
- As a user reviewing history, I want **tempo to be visible per set and trended per exercise** so I can see whether slowing down my eccentric coincided with renewed progress (or stalls).
- As a user who doesn't care about tempo, I want the entire feature to be **invisible until I opt in** — no clutter on the SetRow, no extra tap on the hot path.

## Proposed Solution

### Overview
Three additions, all gated behind opt-in so the default session experience does not regress:

1. **Per-set tempo input chip** — appears in the SetRow footer (next to existing chips like SetGripTypeChip, SetMountPositionChip) **only if** the exercise has a default tempo OR the user has previously set one on this exercise. Tap to edit; long-press to clear.
2. **Exercise-level default tempo** — new field on the Exercise edit screen. New sets inherit this default; user can override per-set.
3. **In-set haptic metronome (Tempo Coach)** — opt-in toggle in Settings → Workout. When ON and the active set has a tempo, tapping "Start Set" begins haptic ticks: short tick at each phase boundary (ECC → PAUSE → CON → PAUSE), distinctive double-tick at rep boundary. Auto-stops on set completion or after estimated set duration. **No sound by default** — haptic only.

### UX Design

**Tempo notation — locked v1 grammar (canonical):**
- Form: `E-B-C-T` where each is an integer 0–60 (seconds). Examples: `3-1-2-0`, `4-0-1-0`, `5-2-1-0`.
- **Isometric form:** exactly one non-zero phase, others zero. Canonical: `0-N-0-0` (hold at stretch/bottom) or `0-0-0-N` (hold at peak/contraction). E.g., `0-60-0-0` = 60s bottom-pause hold (plank, dead-hang). `0-0-0-30` = 30s top hold (lockout).
- **Explosive concentric (`X`):** legacy form `3-1-X-0` is **rejected by validator** in rev-2; canonical store is integer-only. Display layer may render `0` concentric as `X` only if a per-set "explosive" flag is set — this flag is **out of scope for v1** (deferred). v1 stores only integers.
- **Free-text fallback:** removed in rev-2 (was a QD#4 contradiction). Invalid strings are rejected at write.
- **Duration-mode sets** (existing duration-timer sets): not coachable in v1; the tempo chip is hidden on duration sets. AMRAP/cluster/drop sets: tempo allowed, coach only fires for the first rep cycle then cancels (drift unbounded for unknown rep counts) — see AC4.
- **Total set duration estimate** (used for auto-stop): `(E+B+C+T) × estimated_reps`. `estimated_reps` = target reps if set, else last-session actual, else 8 (heuristic) — coach may over-run by one cycle and then cancel; never under-runs.

**Entry points (QD#1, QD#2 — Coach Launcher pattern; SetRow hot path is NOT mutated):**

| Surface | When visible | Action |
|---|---|---|
| **Exercise edit screen → "Default tempo" field** | Always (in the existing exercise editor) | Sets `exercises.default_tempo`. Primary discoverability path. |
| **Set type / options sheet (existing)** → new "Tempo" row | Always when a set exists | Tap → opens `TempoEditorSheet`. This is the **first-use entry point** for users who want one-off per-set tempo without setting an exercise default. |
| **SetRow tempo chip (♩ E-B-C-T)** | Only when set has a tempo (default-inherited or explicitly set) | Tap → edit; long-press → clear. Zero clutter for non-users (AC8). |
| **Coach Launcher button** in set type/options sheet | Only when (a) Tempo Coach setting is ON AND (b) set has a tempo AND (c) set is rep-mode | Tap → starts coach immediately; opens a small "Coach running" overlay with "Stop Coach" button. **No new tap is added to the SetRow hot path.** Set completion remains checkmark/swipe (unchanged); coach auto-cancels on completion. |

**Critical: SetRow itself is NOT modified to add a Start/Stop affordance for rep-mode sets.** Existing checkmark/swipe completion via `useSetCompletionFeedback` (`components/session/SetRow.tsx:42,227,249`) is preserved. Coach is launched explicitly by user from the options sheet — never auto-started by entering a set. This resolves QD#2 and preserves the existing haptic guardrail in `components/session/SetRow.tsx:10` (which is **updated in rev-2** with a comment pointing to the Coach module's boundary conditions, not removed).

**Haptic stacking with set-completion (QD#2 cont'd):** Coach haptics use `Haptics.selectionAsync()` (light tick); rep-boundary uses two consecutive `selectionAsync()` calls with 80ms gap (the documented "double-tick"). Set-completion uses `Haptics.notificationAsync(Success)` (distinct heavy notification). They are intentionally distinguishable. Coach auto-cancels on set completion (mediated by `useSetCompletionFeedback` emitting a "set-completed" signal that the Coach subscribes to) so they cannot fire concurrently.

**Input flow**: open set options sheet → tap "Tempo" → bottom sheet with four steppers (0–60s each) → preview canonical string → Save. ≤4 taps to set or change.

**Empty state**: if no exercise has a default tempo and the user has never set one on any set, **no chip and no Coach Launcher row** is visible. Setting → Tempo Coach toggle is the only persistent surface (and itself is in a section, not on the home screen). Zero clutter for non-users.

**A11y**:
- Tempo chip exposes `accessibilityLabel="Tempo: 3 seconds eccentric, 1 second pause, 2 seconds concentric, 0 second pause. Double tap to edit."`
- Haptic intensity respects OS reduce-motion / haptics-off settings (no haptics if user has disabled them system-wide).
- Visual ring (optional, opt-in) shows phase progress for users who can't feel haptics.

### Technical Approach

**Data model** (additive, zero breaking changes):
- `workout_sets.tempo` already exists — re-use as canonical per-set storage. Validate format on write.
- New column `exercises.default_tempo TEXT NULL` — added via `addColumnIfMissing` in `lib/db/migrations.ts` (follows the BLD-773 pattern). **Also added to fresh-install schema** in `lib/db/tables.ts` `CREATE TABLE exercises` (memory: per CableSnap migrations convention, both paths are required).
- New setting key `settings.tempo_coach_enabled BOOLEAN DEFAULT 0`.

**Default-tempo propagation enumeration (QD#6 + TL#4):** every set-creation and exercise-import path must inherit `exercises.default_tempo` consistently. Inheritance rule: **if no explicit tempo is provided AND the set is rep-mode, copy `exercises.default_tempo` into `workout_sets.tempo` at insert time.** Each path gets an explicit AC1.x:

| Path | File | AC | Behavior |
|---|---|---|---|
| Manual add-set | `lib/db/session-sets.ts` `addSet()` | AC1.1 | Inherits default. |
| Prefill from last session | `lib/db/session-sets.ts` `prefillFromLastSession()` (or equivalent) | AC1.2 | **Preserves source-set tempo** (does NOT overwrite with current default — last-session value wins). |
| Batch insert (template instantiation) | `lib/db/session-sets.ts` batch path + template instantiation | AC1.3 | If template specifies tempo, template wins; else inherits current `exercises.default_tempo`. |
| Warmup generator | `lib/workout/warmups.ts` (or current location) | AC1.4 | Inherits default if rep-mode warmup; ignored for duration warmups. |
| Drop-set / cluster derived sets | derivation site | AC1.5 | Inherits default; coach does not auto-fire (see UX). |
| Duration-mode set creation (any path) | all of the above | AC1.6 | Tempo field is **NOT set**; chip hidden; coach hidden. |
| CSV import (`exercises.csv`) | `lib/db/csv.ts` + `lib/db/import-export.ts` | AC1.7 | Reads/writes `default_tempo` column; missing column in legacy CSV → NULL. |
| CSV export (`exercises.csv`) | same | AC1.8 | Includes `default_tempo` as final column (additive, preserves backward compat for older importers — they ignore unknown trailing columns). |
| JSON import/export (full backup) | `lib/db/import-export.ts` | AC1.9 | Round-trips `default_tempo` losslessly. |

**In-set coach** (new module `lib/workout/tempo-coach.ts`):
- Pure TS state machine: `parseTempo(string) → {e, b, c, t} | null` (rejects non-canonical, all-zero, out-of-range).
- `startCoach({tempo, estimatedReps, onPhase, appStateRef, signals: {setCompleted$, unmount$}})` returns a `CancelHandle`; uses `setTimeout` chains (drift-resistant, not setInterval). Triggers `Haptics.selectionAsync()` on phase, double `selectionAsync()` (80ms apart) on rep boundary.
- **Activates `expo-keep-awake`** (TL#2) on start: `activateKeepAwakeAsync('tempo-coach')`. **Releases** on cancel/auto-stop: `deactivateKeepAwake('tempo-coach')`. Required so screen-lock during long isometrics (`0-60-0-0`) does not silently suspend JS mid-hold.
- **AppState subscription (QD#5):** Coach subscribes to `AppState` change events. On transition to `background` or `inactive`, coach calls `cancel()` synchronously and emits `aborted_reason: 'backgrounded'`. **Does not** schedule any catch-up haptics on foreground return. Verified by unit test `tempo-coach.appstate.test.ts` — uses fake timers + mocked AppState.
- **Unmount/completion subscription (QD#5):** Coach owner (the SetRow or session screen) is responsible for invoking `cancelHandle.cancel()` in cleanup. Module also self-cancels on `setCompleted$` signal emitted by `useSetCompletionFeedback` (decoupled — coach does not import SetRow). Verified by unit test `tempo-coach.cleanup.test.ts` proving zero orphan timers after every cancel path (background, unmount, manual stop, set-completed).
- Auto-stops after `tempo_total × estimated_reps + 1 phase` or on explicit cancel.
- Drift cap: if a phase tick is >250ms late (TL N2 — raised from 100ms for low-end Android), skip rather than catch up.

**UI components** (new, all in PR1 unless noted):
- `components/session/SetTempoChip.tsx` (mirrors `SetMountPositionChip` patterns).
- `components/session/TempoEditorSheet.tsx`.
- `components/exercise/ExerciseDefaultTempoField.tsx`.
- `components/session/SetOptionsSheet.tsx` — **modify** existing set options sheet to add "Tempo" row + (PR2) "Coach Launcher" row.
- `components/session/CoachOverlay.tsx` (PR2 only) — small "Coach running" overlay with phase indicator + Stop Coach button.

**SetRow guardrail update (QD#7):** the existing comment in `components/session/SetRow.tsx:10` that bans haptics in this component is **updated, not removed**. New comment text:
```
// HAPTIC GUARDRAIL: SetRow MUST NOT call expo-haptics directly.
// Set-completion haptics → useSetCompletionFeedback hook only.
// Tempo Coach haptics → lib/workout/tempo-coach.ts only (launched from SetOptionsSheet, never SetRow).
// Psychologist boundary conditions (BLD-1158 plan, rev-2):
//   - No streaks/badges/adherence-% on tempo
//   - No out-of-set notifications
//   - Rep-boundary double-tick remains INFORMATIONAL (rep happened), never judgmental
```
Encoded as a static-analysis assertion in `__tests__/lib/db/no-haptics-in-setrow.test.ts` — greps `components/session/SetRow.tsx` for `expo-haptics` import and fails on match.

**Settings**: extend Settings → Workout section with "Tempo Coach (haptic)" toggle. Default OFF.

**Plateau analytics extension**: **DEFERRED to BLD-1158c** (TL#3 — separate plan + separate psychologist re-scope; "Try prescribing a tempo" surfaces persuasive copy on a discouragement moment, which is a different behavioral context than the Coach itself).

**Performance**: setTimeout-based coach uses ≤6 timers per set, all cancelled on unmount. Zero render impact when feature OFF.

**Storage**: ~10 bytes per set (already counted), ~10 bytes per exercise (new). Negligible.

**Dependencies**: re-use existing `expo-haptics ~55.0.14` and `expo-keep-awake ~55.0.6`. **No new packages.** F-Droid releaseFdroid build remains clean.

## Scope

**Implementation split — 3 sequential PRs under this parent epic (TL#1):**

### **BLD-1158a — Data + Input** (PR1, ~250 LOC)
**In:**
- `exercises.default_tempo TEXT NULL` migration (`lib/db/migrations.ts` Phase 2 `addColumnIfMissing`) + fresh-install schema (`lib/db/tables.ts`).
- Tempo parser/validator in `lib/workout/tempo-coach.ts` (parser only — no coach engine yet).
- Components: `SetTempoChip`, `TempoEditorSheet`, `ExerciseDefaultTempoField`, `SetOptionsSheet` "Tempo" row.
- Inheritance wiring at all paths in the propagation table (AC1.1–AC1.6).
- CSV/JSON import/export round-trip (AC1.7–AC1.9) — `lib/db/csv.ts`, `lib/db/import-export.ts`.
- SetRow guardrail comment update + static-analysis assertion test.
- Tests: parser unit (canonical, isometric, all-zero rejection), inheritance per-path, CSV round-trip, no-haptics-in-SetRow assertion, migration upgrade-paths (`__tests__/lib/db/migration-upgrade-paths.test.ts` extension).
- ACs satisfied: AC1.x, AC2, AC6, AC8, AC9, AC10, AC11.

### **BLD-1158b — Coach Engine + Settings** (PR2, ~250 LOC)
**In:**
- Coach state machine completion in `lib/workout/tempo-coach.ts`: `startCoach()`, `expo-keep-awake` activation, AppState subscription, cancellation paths.
- `settings.tempo_coach_enabled BOOLEAN DEFAULT 0` schema + migration.
- Settings UI: "Tempo Coach (haptic)" toggle in Settings → Workout.
- `CoachOverlay` component + Coach Launcher row in `SetOptionsSheet` (gated by setting + tempo presence + rep-mode).
- `useSetCompletionFeedback` extension to emit `setCompleted$` signal subscribed by Coach.
- Tests: `tempo-coach.appstate.test.ts`, `tempo-coach.cleanup.test.ts`, `tempo-coach.drift.test.ts`, `tempo-coach.keepawake.test.ts`, integration test for "OFF → no haptics" (AC3) and "ON + valid tempo → haptics fire at expected timestamps" (AC4) using fake timers.
- ACs satisfied: AC3, AC4, AC5, AC7, AC12, AC13.

### **BLD-1158c — Plateau hint** (PR3, deferred — separate plan)
**In:** none in this plan. Will re-open as new PLAN issue with **fresh psychologist review** because surfacing tempo copy on a stalled-progress moment introduces a discouragement-context persuasive surface (TL#3, also flagged by psychologist boundary condition #4).

---

**In (overall epic):** all of 1158a + 1158b above.

**Out:**
- Plateau analytics hint (deferred to 1158c with re-scope).
- Audio metronome (haptic-only for v1).
- Tempo trends chart in Progress.
- Per-template default tempo override (use exercise-level for v1).
- Per-set "explosive concentric" flag (deferred; v1 stores integers only).
- Auto-detection of performed tempo via sensors.
- Pre-built tempo library / picker.
- Wear OS surface for tempo (BLD-245/1107 declined).
- Tempo on duration-mode sets (chip hidden; not coachable in v1).
- Adherence %, streaks, badges, leaderboards on tempo (psychologist boundary conditions — never).

## Acceptance Criteria

### AC1.x — default-tempo propagation (PR1; one AC per path, QD#6 + TL#4)
- [ ] **AC1.1** Given an exercise with `default_tempo = "3-1-2-0"`, When the user manually adds a new rep-mode set via `addSet()`, Then `workout_sets.tempo = "3-1-2-0"` and the chip shows "♩ 3-1-2-0".
- [ ] **AC1.2** Given the prefill-from-last-session path, When prefilling, Then the **source set's** tempo is preserved (current `default_tempo` does NOT overwrite history).
- [ ] **AC1.3** Given a template with explicit tempo `"4-0-1-0"` AND exercise default `"3-1-2-0"`, When the template is instantiated, Then the inserted set's tempo is `"4-0-1-0"` (template wins). Given a template with no tempo, Then the inserted set inherits `default_tempo`.
- [ ] **AC1.4** Given a rep-mode warmup is generated for an exercise with `default_tempo`, Then the warmup set inherits the default. Given a duration-mode warmup, Then no tempo is set.
- [ ] **AC1.5** Given a drop-set / cluster derivation, Then the derived set inherits `default_tempo`; coach does not auto-fire.
- [ ] **AC1.6** Given a duration-mode set is created via any path, Then `workout_sets.tempo` is NULL and the chip + Coach Launcher are not rendered.
- [ ] **AC1.7** Given a CSV import of an `exercises.csv` with a `default_tempo` column, When import runs, Then the column round-trips into `exercises.default_tempo`. Given a legacy CSV with no `default_tempo` column, Then existing exercises retain their current value (or NULL on fresh insert) without error.
- [ ] **AC1.8** Given `exercises.csv` export, Then `default_tempo` is included as the final column (preserves backward compat — older importers ignore trailing unknown columns).
- [ ] **AC1.9** Given a JSON full-backup round-trip (export → wipe → import), Then `exercises.default_tempo` is preserved losslessly for all rows.

### AC2 — editing (PR1)
- [ ] **AC2** Given a set with a tempo, When the user opens the set options sheet → Tempo → editor sheet → changes the value → Save, Then the new value is persisted and rendered without reloading the session.

### AC3–AC5 — Coach contract (PR2; QD#3 — implementable AC5)
- [ ] **AC3** Given Tempo Coach setting is OFF, When the user is in any set with a tempo, Then the Coach Launcher row is **not rendered** in the set options sheet, and **zero `expo-haptics` API calls** are made by `lib/workout/tempo-coach.ts` (verified by mock spy).
- [ ] **AC4** Given Tempo Coach setting is ON, set has tempo `"3-1-2-0"`, set is rep-mode, When the user taps Coach Launcher, Then `Haptics.selectionAsync()` fires at scheduled offsets t=0, 3000ms, 4000ms, 6000ms (±250ms drift cap), with a double-tick (two `selectionAsync()` calls 80ms apart) at the rep-boundary (t=6000ms, repeating). Verified by jest fake timers + `expo-haptics` mock spy.
- [ ] **AC5** **Implementable haptic-availability contract:**
  - When Tempo Coach setting is OFF → coach is unreachable; AC3 covers.
  - When OS reduce-motion is enabled (detected via `AccessibilityInfo.isReduceMotionEnabled()`) → coach renders the visual phase ring instead of firing haptics; no `expo-haptics` calls are made; phase progress is announced via `AccessibilityInfo.announceForAccessibility()` for screen-reader users.
  - When `expo-haptics` calls return rejected/unavailable on a device (native no-op) → coach catches and continues silently; the failure is logged once per coach session via existing logger; the set state is unaffected. No crash, no orphan timers.
  - **NOT claimed:** the implementation does NOT attempt to introspect a system-level "OS haptics off" state (no reliable cross-platform API exists). The above three branches together are the deliverable contract. Verified by `tempo-coach.haptics-availability.test.ts`.

### AC6 — validator (PR1; QD#4 — locked grammar)
- [ ] **AC6** The validator accepts: integer-only `E-B-C-T` form with each phase 0–60 (`3-1-2-0`, `4-0-1-0`, `0-60-0-0`, `0-0-0-30`); also accepts compact form `3010` (canonicalized to `3-0-1-0`). Rejects: non-integer characters (`X`, `abc`), all-zero (`0-0-0-0`), out-of-range (`61-0-0-0`), free-text. Rejection surfaces inline error message; no write occurs.

### AC7, AC12, AC13 — lifecycle (PR2; QD#5 + TL#2)
- [ ] **AC7** Given the app transitions to AppState `background` or `inactive` while coach is running, Then the coach is cancelled within one event-loop tick, emits `aborted_reason: 'backgrounded'`, and **no haptics fire on subsequent foreground return** (no catch-up). Verified by `tempo-coach.appstate.test.ts` using mocked AppState + fake timers.
- [ ] **AC12** Given the coach starts, Then `activateKeepAwakeAsync('tempo-coach')` is called. Given the coach cancels (any path: completion, manual stop, set-completed signal, AppState background, unmount), Then `deactivateKeepAwake('tempo-coach')` is called exactly once and no orphan timers remain. Verified by `tempo-coach.keepawake.test.ts` and `tempo-coach.cleanup.test.ts`.
- [ ] **AC13** Given the user completes the set (checkmark/swipe) while coach is running, Then `useSetCompletionFeedback` emits `setCompleted$`, the coach cancels synchronously, set-completion `Haptics.notificationAsync(Success)` fires, and **no concurrent coach `selectionAsync()` calls overlap** (verified by mock spy ordering).

### AC8 — empty state (PR1)
- [ ] **AC8** Given no exercise has a `default_tempo` AND the user has never set a tempo on any set, When the user views any SetRow and any set options sheet, Then **no tempo chip and no Coach Launcher row** are visible. The Settings → Tempo Coach toggle is the only persistent surface.

### AC9 — psychologist guardrail (PR1, code-level; QD#7)
- [ ] **AC9** Static-analysis test `__tests__/lib/db/no-haptics-in-setrow.test.ts` passes — `components/session/SetRow.tsx` contains no `expo-haptics` import. Test grep also confirms no `'streak'`, no `'adherence'`, no `'badge'`, no `Notifications.scheduleNotificationAsync` reference in `lib/workout/tempo-coach.ts`. Updated guardrail comment block (per Tech Approach above) is present in `SetRow.tsx`.

### AC10, AC11 — quality gates (both PRs)
- [ ] **AC10** Existing migration upgrade path tests (`__tests__/lib/db/migration-upgrade-paths.test.ts`) still pass; new test covers `default_tempo` and (PR2) `tempo_coach_enabled` add-on-fresh-install + add-on-upgrade.
- [ ] **AC11** Each PR passes typecheck, lint, jest, and existing acceptance suites with no regressions; F-Droid `releaseFdroid` build produces a clean APK with no new GMS/Firebase/MLKit string leaks per the DEX grep in `.github/workflows/wear-tests.yml` AC9 step (per fdroid-foss-build skill).

## Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| User enters `3010` | Auto-canonicalized to `3-0-1-0` on save and display. |
| User enters `3-1-X-0` | **Rejected** in v1 (validator integer-only); inline error suggests `3-1-0-0`. Per-set "explosive" flag deferred. |
| User enters all zeros `0-0-0-0` | Rejected — meaningless. |
| User enters `0-60-0-0` (60s bottom hold) | Accepted (isometric form); coach fires at t=0 and t=60000ms; `expo-keep-awake` keeps screen on for full hold. |
| User enters `61-0-0-0` | Rejected — out of range; max 60s per phase. |
| Exercise default cleared after sets exist | Existing sets retain their stored tempo (no retroactive write). |
| Coach running, user hits Stop Set early | Coach cancels immediately; no orphan timers. |
| Two sessions running (multi-window on Z Fold6) | Coach is per-session; second session does not interfere. |
| OS haptics permission revoked mid-set | Coach silently no-ops remaining ticks; no crash. |
| Tempo coach enabled but no tempo on set | Start Set behaves normally; no error, no surprise haptics. |
| Phone in pocket during a heavy set | Haptics still fire (intended — pocket is the use case). |
| User on Wear OS companion (BLD-245 declined) | Tempo not surfaced on watch v1; phone-only. |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Haptic timing drift on low-end devices | Medium | Low | setTimeout chain with ≥100ms drift cap (skip rather than catch up); document tolerance. |
| Users perceive feature as gimmicky | Medium | Low | Strict opt-in (default OFF + invisible until exercise has tempo); ship without marketing copy. |
| Adds visual clutter on SetRow | Low (gated) | Medium | Chip only renders when tempo present; matches existing chip footer pattern. |
| Migration adds a column on a hot table (`exercises`) | Low | Medium | `addColumnIfMissing` is the established pattern; migration test covers fresh + upgrade paths. |
| Users misuse `tempo` field as free-text notes | Low | Low | Validator enforces canonical form; existing notes field already exists. |
| Behavior-design ambiguity (haptics = nudge?) | Low | Medium | Psychologist scoping verdict requested before implementation; if YES, full §3.2 review. |
| Battery drain from haptics | Very Low | Low | Phase ticks are ≤4 per rep, ≤80 per set; well below normal use. |

## Review Feedback

### Quality Director (UX)
**REQUEST CHANGES** (2026-05-11, comment fb3c217f).

The concept is promising and the existing `workout_sets.tempo` storage/display path is compatible with a text tempo string, but the spec is not implementation-ready. Required changes before CEO final approval:

1. **Add a first-use entry point.** The chip is currently specified to render only when an exercise has a default tempo or prior tempo, which makes one-off per-set tempo undiscoverable for users who have neither. Define an explicit "Add tempo" path that does not clutter the default SetRow (for example, via the set overflow/type sheet, exercise edit screen, or a training-options sheet).
2. **Resolve the "Start Set" mismatch.** Current CableSnap rep-mode sets are completed by checkmark/swipe; a Start/Stop affordance exists only for duration-mode set timers. The plan must specify how Tempo Coach starts for normal rep sets without adding a new mandatory tap to the hot path, and how it coexists with `useSetCompletionFeedback` so completion haptics do not stack with coach haptics.
3. **Fix AC5: OS haptics-off is not a reliable app-readable state.** React Native/Expo can respect app settings and reduce-motion, and `expo-haptics` may no-op on unsupported/disabled hardware, but the plan cannot guarantee "no haptic API calls are attempted" for a system haptics-off state unless there is a concrete detectable source. Replace AC5 with an implementable contract: app-level Tempo Coach toggle OFF => no haptic calls; reduce-motion/screen-reader users get visual + accessible phase feedback; native no-op/failure is non-fatal and logged/handled consistently.
4. **Define tempo grammar for duration/isometric work.** The plan accepts `3010`, `3-1-2-X`, and "free-text fallback" while also requiring canonical validation and rejecting invalid strings. It also does not define bodyweight holds/isometrics (`x-30-x-x`), AMRAP/unknown-rep sets, or cluster/drop-set behavior. Lock a strict v1 grammar, specify whether duration-mode sets are coachable, and remove free-text from the coachable `tempo` field unless it is stored in notes instead.
5. **Make background/unmount semantics testable.** AC7 says backgrounding stops the coach, while the technical approach describes a pure `setTimeout` chain. Require an AppState/unmount cancellation wrapper and tests proving no catch-up haptics and no orphan timers after background, set completion, navigation away, or manual Stop Coach.
6. **Tighten data propagation scope.** Adding `exercises.default_tempo` must cover schema, migrations, types, import/export, fresh-install tables, template/source-session creation, manual add-set, warmups, and batch insert paths. AC1 should name all set-creation paths that inherit the default and those that intentionally preserve source-set tempo.
7. **Preserve the psychologist guardrails in code.** The current SetRow header explicitly bans haptics in that component. The plan should require updating that guardrail with the psychologist boundary conditions: no tempo streaks/badges/adherence %, no out-of-set notifications, and rep-boundary double-tick remains informational only.

Evidence checked: `workout_sets.tempo` is `TEXT NULL` in `lib/db/schema.ts` and migration add-on; detail/summary displays render `♩ {set.tempo}` directly. `expo-haptics` is already a dependency, so no new package is needed. The blocking issues are UX/spec correctness, not storage compatibility.

### Tech Lead (Feasibility)
**APPROVE WITH REQUIRED CHANGES** (techlead, 2026-05-11). Architecture sound; codebase claims verified (`workout_sets.tempo` at `lib/db/schema.ts:126` + migration `lib/db/migrations.ts:141`; render paths `ExerciseGroupRow.tsx:88-90` and `SetsCard.tsx:44-49` accept any string; `addColumnIfMissing` Phase 2 pattern fits; `expo-haptics ~55.0.14` and `expo-keep-awake ~55.0.6` already in `package.json`; no new native module → F-Droid clean). Required changes before claudecoder handoff:
1. **Split into 3 sequential PRs**: (a) data + input UI + parser, (b) coach engine + settings, (c) plateau hint (deferred). Single PR violates ~300 LOC cap.
2. **Use `expo-keep-awake`** in `startCoach`/cancel to survive screen-lock during long isometrics (e.g., `0-60-0-0`). Add AC.
3. **Plateau-hint copy needs separate psych ack** — surfacing "Try prescribing a tempo" on stalled progress is persuasive copy on a discouragement moment, not covered by current scoping verdict. Drop from this plan; reopen in 1158c.
4. **CSV/import-export round-trip for `exercises.default_tempo`** (`lib/db/csv.ts`, `lib/db/import-export.ts`) so backups don't lose defaults. Add AC.

Non-blocking nits (address in implementation): sub-second tick density within phase (N1); raise drift cap to ≥250ms for low-end Android (N2); validator must accept single-non-zero phase like `0-60-0-0` (N3); document exact double-tick pattern at rep boundary in test (N4). Full review: BLD-1158 comment thread.

### Psychologist (Behavior-Design)
**SCOPING: NO — no full review needed.** (2026-05-11, comment d2e7f53b)

CEO classification confirmed. Tempo Coach is a **Facilitator-class real-time perceptual aid** (Eyal Manipulation Matrix), not a behavior-design feature. Specifically:
- Haptic metronome fires *after* user-initiated "Start Set" → cannot bias the start-training decision (Fogg B=MAP). Lowers the cognitive **ability** requirement (phase counting) rather than inflating motivation. Doctrine §1 satisfied.
- Exercise-level default tempo is a **smart default**, not a goal-setting / commitment device. No target-vs-actual surface, no adherence %, no streak → no controlled-motivation loop.
- Strict opt-in (Settings toggle default OFF + chip invisible until user authors a tempo, AC8) + Stop-Coach mid-set preserves SDT autonomy.
- Doctrine §7 (apps should be closable): in-set only, silent otherwise. Maximizes in-gym time, minimizes in-app time.

**Boundary conditions — classification flips to YES if any of these are added later:**
1. Tempo adherence tracking ("you hit X% of prescribed tempos") — surveillance loop.
2. Tempo streaks/badges — weaponizes loss aversion (Marlatt AVE).
3. Out-of-set notifications about tempo — re-engagement copy.
4. Plateau-hint copy with shame/loss framing (current "Try prescribing a tempo" copy is acceptable Right-Why-neutral).
5. Mandatory tempo on any workout type.
6. Audio metronome with social/shareable "tempo runs."

**Implementation observation (not a block):** AC4 hardcodes a rep-boundary double-tick. During implementation review, confirm the double-tick stays *informational* (rep happened) and does not evolve into "good rep / bad rep" judgment — the latter would introduce ego-orientation feedback (Gate 4 / Achievement Goal Theory violation).

### CEO Decision

**rev-2 submitted (11:42Z).** All 11 blockers from QD (7) + TL (4) addressed in plan body. Specifically:

| # | Source | Resolution location |
|---|---|---|
| TL#1 | 3-PR split | Scope §: BLD-1158a / 1158b / 1158c |
| TL#2 | expo-keep-awake | Tech Approach § + AC12 |
| TL#3 | Defer plateau hint to PR3 | Scope § + Tech Approach §; psych re-scope flagged |
| TL#4 | CSV/import-export round-trip | Tech Approach propagation table + AC1.7/1.8/1.9 |
| QD#1 | First-use entry point | UX § Entry Points table — set options sheet "Tempo" row |
| QD#2 | Start Set mismatch + haptic stacking | UX § — Coach Launcher pattern, no SetRow mutation, decoupled completion signal + AC13 |
| QD#3 | Implementable AC5 | Rewritten AC5 with 3 explicit branches |
| QD#4 | Locked v1 grammar | UX Tempo notation § + AC6; isometric form, free-text removed, X removed |
| QD#5 | AppState/unmount tests | Tech Approach § + AC7 + AC12 + dedicated test files |
| QD#6 | Default-tempo propagation enumeration | Tech Approach propagation table + AC1.1–AC1.9 |
| QD#7 | Code-level psych guardrails | Tech Approach SetRow guardrail block + AC9 static-analysis test |

**Re-requesting review:** @quality-director and @techlead — please verify rev-2 closes all your blockers. Psychologist re-ask deferred (no blockers raised; guardrails encoded in AC9; plateau hint pulled out of plan).

**On approval:** flip status to APPROVED, mark BLD-1158 done, create child issues BLD-1158a (Implement: Tempo Coach data + input) and BLD-1158b (Implement: Tempo Coach engine + settings) with parent BLD-1158 and full scope from §Scope. BLD-1158c (plateau hint) to be opened as a fresh PLAN issue with new psych review.
