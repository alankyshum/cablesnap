# Feature Plan: Rewarding audio feedback on set completion

**Issue**: BLD-580  **Author**: CEO  **Date**: 2026-04-24
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED
**Source**: GitHub #334 (alankyshum, Z Fold 6, Android, v0.26.7)
**Parent triage**: BLD-576 (closed, split on behavior-design boundary)
**Sibling FIX (ergonomic, already shipped)**: BLD-579 / PR #359 merged 2026-04-24

## Problem Statement

The existing `set_complete` audio cue (`assets/sounds/set-complete.wav`, wired via `hooks/useSetCompletionFeedback.ts`) is **opt-in** (default OFF by PLAN-BLD-559 R2 anti-Dealer guardrail) and, per the owner's GH #334 comment, the asset itself feels "not rewarding enough." Most users never discover the toggle (Settings → Preferences → "Sound on set complete") because onboarding never surfaces it and the default keeps it silent.

This plan evaluates three behavior-shaping questions **independently**, so the psychologist can approve or veto each on its own merits:

1. **Asset quality** — can we swap/tune the waveform so a user who *opts in* gets a meaningfully satisfying cue without slot-machine escalation?
2. **Discoverability** — can a one-shot, non-modal affordance (e.g., a quiet hint in the session screen empty-state, or a Preferences highlight on first settings open) let users find the toggle without nagging?
3. **Default value** — should the default flip from OFF to ON? (Null hypothesis: NO; changing requires the psychologist to re-run the 4-Dimension rubric.)

## Behavior-Design Classification (MANDATORY)

- [x] **YES** — triggers: **rewards (audio reinforcement on task completion)**, **onboarding/discoverability**, **motivational feedback**. Psychologist review MANDATORY.
- [ ] NO

This feature sits squarely inside the PLAN-BLD-559 single-site invariant (`hooks/useSetCompletionFeedback.ts`). Any new reward cue MUST stay inside that hook; no parallel surfaces permitted.

## User Stories

- As a gloved gym user, I want a **satisfying-but-subtle** audible confirmation when I complete a set, so I know the tap registered without staring at the screen.
- As a user who values focus, I want the default to remain quiet, so I can opt in on my own terms.
- As a new user, I want to **know the toggle exists** without being interrupted by a modal.

## Proposed Solution

### Overview

Three small, independently-approvable changes, all inside the existing single-site invariant:

1. **Asset upgrade (IN)**: replace `set-complete.wav` with a short (≤ 250 ms), single-note, natural-timbre cue (e.g., soft marimba/wood-block). Bundle size budget: ≤ 30 KB. No variable-pitch randomization (Dealer vector).
2. **Discoverability (IN)**: add a one-time, dismissible inline hint row in **Settings → Preferences** (NOT session screen, NOT modal) that calls out the "Sound on set complete" toggle. Row is a non-dismissable-until-interacted Text row beneath the existing toggle, shown only while `getAppSetting('feedback.setComplete.audio')` is `null` (i.e., user has never interacted with the toggle). After first toggle change (either direction), row disappears permanently.
3. **Default value (OUT of scope for this plan — stays OFF)**. Explicit null-hypothesis: PLAN-BLD-559 anti-Dealer guardrail stands; flipping default requires a separate plan with psychologist 4-Dimension re-run. This plan RECORDS the decision, does not change the default.

### UX Design

**Flow:**
- User opens Settings → Preferences. Sees "Sound on set complete" toggle (existing) + faint helper row below: "Plays a short confirmation cue when you complete a set. You'll only see this hint once." Row disappears after first toggle interaction.
- User taps toggle ON → helper row disappears; next completed set plays the new asset (if audio session available).
- User taps toggle ON, then OFF → helper row still disappears (interacted).
- Empty-state: if asset fails to load (shouldn't happen — bundled), `fire()` silently no-ops the audio path; haptic still fires.

**A11y:**
- Helper row is `accessibilityRole="text"`, NOT announced as a button. Voice-Over/TalkBack reads the existing toggle first, then the helper.
- Asset change is transparent to screen readers.

**Error/empty states:**
- Asset file missing or decode fails → `lib/audio.play('set_complete')` catches and returns silently; existing behavior preserved.
- User muted at OS level → OS gates; app does not attempt to override.

### Technical Approach

**Architecture:**
- All runtime behavior stays inside `hooks/useSetCompletionFeedback.ts` and `lib/audio.ts`. NO new modules.
- Asset swap: replace `assets/sounds/set-complete.wav` in-place; `lib/audio.ts:22` keeps the same key.
- Helper row: add a local `hasInteracted` check in `components/settings/PreferencesCard.tsx` (read `feedback.setComplete.audio` once on mount; render hint iff value is `null`). Setting helper-dismiss is a side-effect of existing `setSetCompletionAudio(val)` — no new SQLite key required.

**Data model:** none new. Reuses `feedback.setComplete.audio` tri-state (null = never interacted, "true", "false").

**Dependencies:** none new. Bundle remains within current budget.

**Perf:** asset preload already happens in `lib/audio.ts` initialization. Swap is zero-cost at runtime.

**Storage:** zero new keys.

**Telemetry:** NONE. Explicitly out of scope — this is a privacy-first product.

## Scope

**IN:**
- Swap `assets/sounds/set-complete.wav` to a new ≤ 250 ms, ≤ 30 KB, single-note, natural-timbre asset.
- Add one-time dismissible hint row in Preferences card beneath existing toggle.
- Asset-quality regression test (file size + duration assert) in `__tests__/lib/audio-asset-budget.test.ts`.

**OUT:**
- Changing the default from OFF to ON (deferred; requires separate plan + psychologist re-run).
- Haptic pattern changes (BLD-559 decided Medium; no revisit).
- PR-celebration audio stacking (BLD-559 anti-Dealer guardrail).
- Variable pitch / randomized reward cues (Dealer-drift vector; prohibited).
- Session-screen inline promotion of the toggle (too intrusive).
- Push notifications / re-engagement nudges (out of product philosophy).
- Telemetry on toggle adoption (privacy-first).

## Acceptance Criteria

- [ ] **GIVEN** user has never touched the "Sound on set complete" toggle **WHEN** they open Settings → Preferences **THEN** a helper row is visible beneath the toggle explaining what it does + stating it will disappear after first interaction.
- [ ] **GIVEN** the helper row is visible **WHEN** the user toggles the setting either direction **THEN** the helper row disappears permanently (re-renders on next mount as absent because `getAppSetting` is no longer `null`).
- [ ] **GIVEN** the user has previously toggled the setting (either state) **WHEN** they re-open Preferences **THEN** the helper row does NOT appear.
- [ ] **GIVEN** audio is enabled **WHEN** a set is completed (false→true) **THEN** the new asset plays exactly once from the single `fire()` call site in `useSetCompletionFeedback.ts` (regression-lock: grep for `play('set_complete')` returns exactly one production call site).
- [ ] **GIVEN** audio is disabled **WHEN** a set is completed **THEN** no audio plays and the haptic-only path is unchanged (BLD-559 invariant preserved).
- [ ] **GIVEN** the new asset file **WHEN** tests run **THEN** file size ≤ 30 KB AND duration ≤ 250 ms (regression-lock in `__tests__/lib/audio-asset-budget.test.ts`).
- [ ] Default for `feedback.setComplete.audio` remains OFF. Any attempt to flip the default is a plan violation and blocks merge.
- [ ] PR passes typecheck, existing test suite, no new lint warnings.
- [ ] No changes to `hooks/usePRCelebration.ts` (BLD-559 guardrail).

## Edge Cases

| Scenario | Expected |
|----------|----------|
| User has `null` pref, toggles ON once, app killed, reopens | Helper row absent (`"true"` is non-null). New cue plays on completed set. |
| User on OS-mute | App never overrides; haptic path still fires if haptic enabled. |
| Asset fails to decode on device | `lib/audio.play()` catches; silent no-op; haptic unaffected. |
| Accessibility TalkBack enabled | Toggle + helper row read in logical order; helper announced as static text, not actionable. |
| User toggles rapidly | Each transition writes to SQLite; cache updates synchronously via `setSetCompletionAudio`; no race. |
| Bundle gate | Asset swap must not push APK over current F-Droid size budget (CI Bundle Gate already enforces). |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| New asset feels cheap / still not rewarding | M | M | Psychologist reviews asset choice in plan; owner A/B before merge. |
| Helper row feels naggy | L | M | One-time, non-modal, non-interactive-dismissable — naturally disappears on first toggle. |
| Sidewise Dealer drift (user asks for "more rewarding" → variable pitch → slot machine) | M | H | Plan explicitly prohibits randomization; regression-lock test asserts single asset key. |
| Asset swap inflates bundle | L | L | Hard 30 KB budget + size assert in CI. |
| Default-flip creep | L | H | Plan records null-hypothesis; separate plan required. |

## Review Feedback

### Quality Director (UX)
_Pending_

### Tech Lead (Feasibility)
_Pending_

### Psychologist (Behavior-Design)
_Pending_ — MANDATORY. Apply Five Sequential Gates, 4-Dimension Rubric (min 3/5 each on Autonomy/Friction/Resilience/Mastery), Eyal Manipulation Matrix. The plan must pass on Autonomy (default stays OFF) and Resilience (no streaks, no loss-framing).

### CEO Decision
_Pending_
