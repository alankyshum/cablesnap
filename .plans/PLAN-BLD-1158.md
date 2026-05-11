# Feature Plan: Tempo Coach

**Issue**: BLD-1158  **Author**: CEO  **Date**: 2026-05-11
**Status**: DRAFT → IN_REVIEW

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

**Tempo notation**: standard 4-digit `ECC-PAUSE_BOTTOM-CON-PAUSE_TOP` (e.g., `3-1-2-0` = 3s eccentric, 1s pause at stretch, 2s concentric, 0s pause at peak). Accept also `3010`, `3-1-2-X` (X = explosive), and free-text fallback. Validate to canonical form on save.

**Input flow**: tap tempo chip → bottom sheet with four steppers (0-10s each) + "X (explosive)" toggle for concentric → preview string → Save. ≤4 taps to set or change.

**Coach flow**: pre-set, the SetRow shows a small ♩ icon if a tempo is set. If Tempo Coach setting is ON, "Start Set" becomes "Start Set ♩" and pulses haptics through phases. User can tap "Stop Coach" anytime — set completion is unaffected.

**Empty state**: if no exercise has a tempo, the feature is completely invisible. No empty-state nag.

**A11y**:
- Tempo chip exposes `accessibilityLabel="Tempo: 3 seconds eccentric, 1 second pause, 2 seconds concentric, 0 second pause. Double tap to edit."`
- Haptic intensity respects OS reduce-motion / haptics-off settings (no haptics if user has disabled them system-wide).
- Visual ring (optional, opt-in) shows phase progress for users who can't feel haptics.

### Technical Approach

**Data model** (additive, zero breaking changes):
- `workout_sets.tempo` already exists — re-use as canonical per-set storage. Validate format on write.
- New column `exercises.default_tempo TEXT NULL` — added via `addColumnIfMissing` in `lib/db/migrations.ts` (follows the BLD-773 pattern documented in our migrations).
- New setting key `settings.tempo_coach_enabled BOOLEAN DEFAULT 0`.

**Session set creation** (`lib/db/session-sets.ts`): when a set is added (manual, prefill, or batch), if no explicit tempo is provided, copy `exercises.default_tempo` into `workout_sets.tempo`.

**In-set coach** (new module `lib/workout/tempo-coach.ts`):
- Pure TS state machine: `parseTempo(string) → {ecc, pauseBottom, con, pauseTop}` (returns null on invalid).
- `startCoach(tempo, onPhase)` returns a cancel handle; uses `setTimeout` chains (not setInterval — drift-resistant). Triggers `Haptics.selectionAsync()` on phase, `Haptics.notificationAsync(Success)` on rep boundary.
- Auto-stops after `tempo_total * estimated_reps` or on explicit cancel.
- Drift cap: if a phase tick is >100ms late (background app, GC pause), skip rather than catch up.

**UI components** (new):
- `components/session/SetTempoChip.tsx` (mirrors `SetMountPositionChip` patterns — already established).
- `components/session/TempoEditorSheet.tsx`.
- `components/exercise/ExerciseDefaultTempoField.tsx` (in Exercise edit screen).

**Settings**: extend Settings → Workout section with "Tempo Coach (haptic)" toggle. Default OFF (opt-in, per anti-clutter principle).

**Plateau analytics extension** (small): `lib/plateau.ts` already detects stalls. Add `currentDefaultTempo` to the surfaced context so a stalled exercise with no tempo shows hint "Try prescribing a tempo (e.g. 3-1-2-0)" — still gated behind plateau detection's existing logic, no new pop-ups.

**Performance**: setTimeout-based coach uses ≤6 timers per set, all cancelled on unmount. Zero render impact when feature OFF.

**Storage**: ~10 bytes per set (already counted), ~10 bytes per exercise (new). Negligible.

**Dependencies**: re-use existing `expo-haptics`. **No new packages.**

## Scope

**In:**
- Per-set tempo input chip + editor sheet (opt-in via exercise default OR explicit set).
- Exercise-level `default_tempo` field + edit UI.
- Settings toggle "Tempo Coach (haptic)".
- In-set haptic metronome state machine.
- Migration for `exercises.default_tempo`.
- Validation + canonicalization of tempo strings.
- Unit tests: parser, state machine, drift cap, settings inheritance.
- Acceptance test: opt-in flow + invisible-by-default for non-users.
- Plateau analytics hint extension (small).

**Out:**
- Audio metronome (haptic-only for v1; revisit if requested).
- Tempo trends chart in Progress (defer to a follow-up if usage warrants).
- Per-template default tempo override (use exercise-level for v1; templates already inherit).
- Auto-detection of actual performed tempo via accelerometer / camera (out of scope for offline-first v1).
- Pre-built tempo library / "popular tempos" picker (defer; common tempos can be discovered from history later).
- Wear OS surface for tempo (defer — cancelled BLD-1107).

## Acceptance Criteria
- [ ] **AC1** Given an exercise with `default_tempo = "3-1-2-0"`, When the user adds a new set in a session, Then `workout_sets.tempo` for that set equals `"3-1-2-0"` and the chip shows "♩ 3-1-2-0".
- [ ] **AC2** Given a set with tempo set, When the user taps the tempo chip and changes it via the editor sheet, Then the new value is persisted and rendered without reloading the session.
- [ ] **AC3** Given Tempo Coach setting is OFF, When the user starts a set with a tempo, Then **no haptics fire** and the existing Start Set behavior is unchanged.
- [ ] **AC4** Given Tempo Coach setting is ON and the active set has tempo `"3-1-2-0"`, When the user taps Start Set ♩, Then haptics fire at t=0, 3s, 4s, 6s (phase boundaries), with a distinctive double-tick at rep boundary (t=6s, repeating).
- [ ] **AC5** Given the OS has haptics disabled, When the coach runs, Then no haptic API calls are attempted (gracefully no-op) and a single visual ring is shown if "Show coach ring" is enabled.
- [ ] **AC6** Given an invalid tempo string (e.g., `"abc"`), When write is attempted, Then the value is rejected with inline validation message and no write occurs.
- [ ] **AC7** Given the app is backgrounded mid-set, When it returns to foreground, Then the coach is stopped (not silently catching up) and the set state is intact.
- [ ] **AC8** Given an exercise has **no** default tempo and the user has never set one, When the user views the SetRow, Then **no tempo chip is visible** (zero clutter for non-users).
- [ ] **AC9** Existing migration upgrade path tests (`__tests__/lib/db/migration-upgrade-paths.test.ts`) still pass; new test covers `default_tempo` add-on-fresh-install + add-on-upgrade.
- [ ] **AC10** PR passes typecheck, lint, jest, and existing acceptance suites with no regressions; F-Droid releaseFdroid build still produces a clean APK (no new GMS/Firebase/MLKit string leaks per our DEX grep — `expo-haptics` is FOSS-clean).

## Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| User enters `3010` | Auto-canonicalized to `3-1-2-0` on save and display. |
| User enters `3-1-X-0` | Stored as-is; coach uses 0s for X (explosive) phase but still ticks at boundary. |
| User enters all zeros `0-0-0-0` | Rejected — tempo with all zeros is meaningless. |
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
_Pending_

### Tech Lead (Feasibility)
_Pending_

### Psychologist (Behavior-Design)
_Pending — scoping verdict requested. CEO classification: NO._

### CEO Decision
_Pending_
