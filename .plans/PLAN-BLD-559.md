# Feature Plan: Set-Completion Confirmation Feedback (audio + haptic)

**Issue**: BLD-559 (parent triage: BLD-555, GH #334)
**Author**: CEO
**Date**: 2026-04-24
**Status**: DRAFT → IN_REVIEW (R1 — addresses QD B1/B2/B3 + PSY-1/2/3)

## Problem Statement

Owner (GH #334, SM-F956U1 Z Fold6, Android 36) reports that tapping the "complete set" circle checkbox during a workout gives no salient confirmation. In a noisy gym with gloved hands, the only current signal is a small visual fill-in of the circle, which is easy to miss mid-rep. The owner's literal request: *"hear if I pressed the button, some rewarding sound so I know I finished something incredible to stimulate reward feedback."*

The user need is **legible confirmation feedback** — the system acknowledging the input — which is a well-understood ability/Fogg problem. The owner's own framing ("rewarding sound") is dealer-adjacent language, so this plan explicitly draws the line between confirmation-feedback (Facilitator) and reward/gamification (Dealer) and commits to the former.

## Behavior-Design Classification (MANDATORY)

- [x] **YES** — triggers present:
  - Rewards / reinforcement audio
  - Motivational feedback framing
  - Potential habit-loop reinforcement on repeated set completions

Psychologist review **MANDATORY** (see Review Feedback section). A pre-review advisory from the psychologist on the sibling BLD-548 already established the doctrine this plan follows.

## User Stories

- As a lifter in gloves, I want **one unambiguous confirmation cue** when my set-completion tap registers, so I don't second-guess mid-workout.
- As a user who trains in public or with headphones, I want **audio off by default** so the app never draws attention to me unsolicited.
- As a user who disagrees with the app's choice, I want to **toggle both audio and haptics independently** in Settings.

## Proposed Solution

### Overview (Facilitator, not Dealer)

We add a **confirmation-feedback layer** that fires exactly once per successful toggle-to-complete transition on a set checkbox:

1. **Haptic** — short `Haptics.ImpactFeedbackStyle.Medium` pulse. **Default: ON.**
2. **Audio** — a single, short (≤ 150 ms), neutral "tick" sound (equivalent to a mechanical switch click). **Default: OFF.** Same sound every time. No variation, no crescendo, no celebration on milestones.

Both fire from a single `fireSetCompletionFeedback()` hook. Both respect:
- the user setting (two independent toggles: Settings → Workout → Confirmation feedback)
- the device silent-switch / DND (audio uses the ambient playback category, so iOS silent switch mutes it; Android respects media volume)
- un-check events → **no** feedback (avoids negative reinforcement loop)

### Anti-Dealer Guardrails (explicit)

The following are **OUT OF SCOPE** and banned in this feature:
- Variable / randomized / escalating / celebratory sounds
- "Nice work!" / "Beast mode!" / streak-themed audio
- Volume or pitch that scales with set count, RPE, PR, etc.
- Separate PR-celebration sounds (belongs in a separate plan if ever proposed — would require fresh psych review)
- Coin/cash-register/video-game sounds
- Any feedback tied to daily/weekly streaks or goals
- **Outcome-scaled haptic intensity** (e.g., stacking set-complete + PR haptics on PR sets) — banned as Dealer-drift (see PR-coordination rule in Technical Approach below; PSY-1 / QD-B1)

**CI enforcement (PSY-3):** a test asserts that `assets/sounds/set-complete.*` resolves to exactly one file, preventing future "variant pack" drift via innocuous PRs. (Implemented as a Jest test that reads the directory; fails the suite on >1 match.)

These would convert the feature from Fogg-Ability confirmation (BCT 2.2 — Feedback on behaviour) into a variable-reward Dealer pattern. The psychologist's pre-review advisory on BLD-548 explicitly flagged these as rejection triggers.

### UX Design

- **Trigger**: in `components/session/SetRow.tsx`, inside the `onCheck(set)` handler path, after state flips from `completed=false` → `completed=true`, call `fireSetCompletionFeedback()`.
- **Un-complete** (`true → false`): no feedback.
- **Settings surface**: Settings screen → "Workout feedback" section with two switches:
  - "Haptic on set complete" (default ON)
  - "Sound on set complete" (default OFF)
- **Volume**: system media volume. No in-app volume slider.
- **Accessibility**: both toggles labelled. Screen-reader users get the existing accessibility announcement ("set N complete") — audio/haptic are additive, not replacements.
- **Empty / offline / error states**: feedback is a fire-and-forget local call; no network. If `expo-haptics` / `expo-audio` throws (e.g., permissions denied on the audio side), we swallow and log once per session — no user-facing error.

### Technical Approach

**Sync-first ownership inversion (TL-T1 / QD-C1 resolution):** Confirmation feedback fires **synchronously** at tap-time inside `SetRow.tsx` *before* any async PR-detection logic. `usePRCelebration.triggerPR` relinquishes its haptic call entirely. Net result: exactly one `Medium` haptic per set completion, fired at the perceptual event of the tap (sub-100 ms), PR or not. Audio, when enabled, fires from the same synchronous path and only from that path.

- **Existing audio module reuse (with category scoping — TL-T2 resolution)**: `lib/audio.ts` currently has a single module-level `enabled` flag (`lib/audio.ts:22`) mutated by both `app/session/[id].tsx:53` and `hooks/useSettingsData.ts:54`, representing the **rest-timer** audio toggle. Without scoping, our new `set_complete` cue would cross-contaminate with the rest-timer toggle. Fix: category-scoped enablement.
  ```ts
  // lib/audio.ts (after edit)
  type AudioCategory = "timer" | "feedback"
  const CUE_CATEGORY: Record<AudioCue, AudioCategory> = {
    work_start: "timer", rest_start: "timer", tick: "timer",
    minute: "timer", warning: "timer", complete: "timer",
    set_complete: "feedback",
  }
  const enabledByCategory: Record<AudioCategory, boolean> = { timer: true, feedback: false }
  export function setEnabled(category: AudioCategory, val: boolean): void { enabledByCategory[category] = val }
  // play(cue) checks enabledByCategory[CUE_CATEGORY[cue]]
  ```
  Existing callers migrate: `setAudioEnabled(val)` call-sites in `app/session/[id].tsx:53` and `hooks/useSettingsData.ts:54` become `setEnabled("timer", val)`. Backwards-compatible shim optional; simpler to update the two call sites.
- **Audio asset**: single short WAV in `assets/sounds/set-complete.wav` (≤ 8 KB, ≤ 150 ms, neutral tick). WAV matches existing `beep_high.wav`/`tick.wav`/`complete.wav` uniformity (QD-S5).
- **Haptics**: `Haptics.impactAsync(ImpactFeedbackStyle.Medium)` via `expo-haptics` (already in dep tree).
- **Settings storage (QD-S4)**: SQLite KV via existing `getAppSetting` / `setAppSetting`. Two keys, both stored as `"true"` / `"false"` strings:
  - `feedback.setComplete.haptic` (default `"true"`)
  - `feedback.setComplete.audio` (default `"false"`)
  - Missing key → default. No schema migration needed.
- **Hook**: `hooks/useSetCompletionFeedback.ts` — exposes `fire()` (no args). Internally reads the two settings via React Query (cache invalidated by the Settings screen mutator). Returns a stable callback.
- **Call-site**: exclusive in `components/session/SetRow.tsx`, inside `onCheck` branch when the set transitions `completed=false → true`. Synchronous — does not await anything. Fires before the outer `useSessionActions.completeSet(...)` + `checkSetPR(...)` pipeline starts.
- **`usePRCelebration.ts` edits (TL-T1 / psych residual #1):**
  - Remove the `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)` call at `hooks/usePRCelebration.ts:28`.
  - Remove the `expo-haptics` import if no longer used.
  - Add an inline comment above the removal site: *"PR haptic removed per BLD-559 — confirmation feedback hook owns the sole haptic for set-complete. Adding haptic/audio here requires psychologist re-review."*
  - `triggerPR` retains: `AccessibilityInfo.announceForAccessibility(...)`, the confetti visual celebration, and the `setCelebration({ visible: true, ... })` state update. No haptic, no audio.
- **Un-complete (`true → false`)**: no feedback. Enforced by the transition gate inside `SetRow.tsx` (`fire()` is called only in the false→true branch).
- **Performance**: preload via existing `lib/audio.ts` `load()` mechanism; reused player instance. Synchronous `fire()` returns immediately (the audio/haptic API calls are fire-and-forget promises we don't await).
- **Silent-switch compliance (QD-B3):** existing `lib/audio.ts:30` `setAudioModeAsync({ playsInSilentMode: false })` satisfies this; unit test asserts the call on module init as a regression guard.
- **Inline code-comment mandate (psych residual #1):** both `useSetCompletionFeedback.ts` and `usePRCelebration.ts` gain a comment block reiterating the single-site haptic invariant and pointing to PLAN-BLD-559. Discourages future well-meaning refactors from re-introducing stacking.

### Dependencies

- `expo-haptics` (already installed — verified in `package.json`)
- `expo-audio ~55.0.13` (already installed — verified in `package.json`; used by `lib/audio.ts`)
- One new audio asset checked into the repo under `assets/sounds/set-complete.wav`
- License: **CC0-1.0** required (CC0 / freesound.org CC0 / owner-created). F-Droid hygiene: `assets/sounds/LICENSES.md` must include **source URL + SPDX `CC0-1.0` identifier** per asset (QD-S3), not just "CC0".

## Scope

**In:**
- Haptic + audio confirmation feedback on set-complete transition (false→true) only
- Two independent Settings toggles
- Default haptic ON, audio OFF
- Preload audio on session mount

**Out:**
- Any variable / rewarding / celebratory audio
- Separate PR / streak / milestone sounds
- Audio on un-complete, delete, or any other action
- Volume slider
- Per-exercise or per-user custom sounds
- Any audio tied to goals, streaks, or gamification signals (explicit anti-pattern)

## Acceptance Criteria

Tests implemented as `it.each(...)` table-driven suites wherever ≥ 2 scenarios share structure (QD-B2: repo-wide test-line ceiling is 1800; main currently ~1793, so non-table tests are cost-prohibitive).

- [ ] Given haptic setting ON and audio OFF and a non-PR set, when the set transitions `completed: false → true`, exactly one `Haptics.ImpactFeedbackStyle.Medium` fires synchronously and no audio plays.
- [ ] Given audio setting ON and a non-PR set, when the set transitions to completed, `lib/audio.play('set_complete')` is called exactly once at system media volume.
- [ ] Given both OFF, when the set transitions to completed, neither the haptic API nor `lib/audio.play` is invoked.
- [ ] Given a set transitions `true → false` (un-complete), the hook does not fire under any settings combination.
- [ ] Given a PR set and haptic setting ON, exactly one `Haptics.ImpactFeedbackStyle.Medium` fires — **from `useSetCompletionFeedback.fire()`, synchronously at tap time**. `usePRCelebration.triggerPR` fires zero haptics. Asserted by spying on `Haptics.impactAsync` at both call sites and verifying: (a) total call count = 1 per PR set, (b) `triggerPR` never calls it.
- [ ] Given a PR set and audio setting ON, `lib/audio.play('set_complete')` is called exactly once — **from `fire()`, not from `triggerPR`**. `triggerPR` is asserted to never import or call `lib/audio`.
- [ ] Given the app cold-starts with no settings persisted, `feedback.setComplete.haptic === true` and `feedback.setComplete.audio === false`. Verified by unit test against a fresh SQLite KV.
- [ ] Given `setAudioModeAsync` throws on module init, the session screen still renders and subsequent set completions do not crash; one `__DEV__` warning is logged; user-facing state is unchanged.
- [ ] Given iOS silent switch ON and audio setting ON, no audible sound plays. Verified indirectly by asserting `setAudioModeAsync` is called with `{ playsInSilentMode: false }` on `lib/audio.ts` load (QD-B3).
- [ ] Given `lib/audio.setEnabled("timer", false)` is called (rest-timer toggle OFF), `lib/audio.play('set_complete')` still fires when `feedback` category is ON — **category scoping holds** (TL-T2). And vice versa: `setEnabled("feedback", false)` does not suppress timer cues.
- [ ] Given `assets/sounds/` is scanned at test time, exactly one file matches `set-complete.*` (non-recursive) AND `assets/sounds/` contains **no subdirectories** (QD-C2). Fails the suite on violation (PSY-3).
- [ ] Given a static-source grep over `hooks/usePRCelebration.ts`, it contains zero matches for `Haptics.impact`, `Haptics.notification`, `from.*lib/audio`, or `require.*lib/audio` (TL-T1 + psych residual #1). Fails the suite on violation.
- [ ] `npm run typecheck` clean; `npm test` passes; `scripts/audit-tests.sh` under 1800 test-line ceiling.
- [ ] No new `__DEV__` globals added (or if added, `scripts/verify-scenario-hook-not-in-bundle.sh` needle list updated in the same PR — ref memory: bundle gate semantics).

## Edge Cases

| Scenario | Expected |
|----------|----------|
| Rapid taps (mis-tap → correct tap) | Each TRUE transition fires once; no queueing |
| Bulk-complete via superset helper (future) | No feedback (out of scope for this plan) |
| Audio asset missing / load failure | Session still renders, feedback silently disabled, logged once |
| User toggles audio ON mid-session | Next set complete fires audio; no retroactive fire |
| PR set completion | Exactly one Medium haptic — fired **synchronously by `fire()` at tap time** (not by `triggerPR`). Visual confetti + a11y announcement unchanged (owned by `triggerPR`). Audio fires once from `fire()` if enabled, not from `triggerPR`. (TL-T1 / QD-C1 / PSY-1) |
| Haptic setting OFF + PR set | No haptic anywhere (PR haptic was removed from `triggerPR`; confirmation haptic is user-disabled). Visual celebration + a11y still fire. |
| Background / lock-screen | Not applicable — session screen is foreground-only |
| Screen reader active | Haptic and audio still fire; don't replace a11y announcement |
| A11y reduced-motion | Not applicable (no motion). Haptic stays on (explicit user setting is source of truth) |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Scope creep into "rewarding" sound variants | Medium | High (psych veto) | Anti-Dealer Guardrails section is plan-locked; any deviation requires fresh psych review |
| Audio asset licensing contaminates F-Droid | Low | High | Require CC0; document source in repo under `assets/audio/LICENSES.md` |
| Users enable audio, get annoyed, blame the app | Low | Medium | Audio defaults OFF; only opt-in |
| Perf regression on low-end devices | Low | Low | Preload + reuse single Sound instance |
| Multiple fire sites drift (e.g., future bulk-complete path) | Medium | Medium | Single `fireSetCompletionFeedback()` hook; lint/grep check in follow-up |

## Review Feedback

### Quality Director (UX)

**R0 verdict (2026-04-24T07:35Z): APPROVE WITH CHANGES** (comment 51581317) — B1/B2/B3 + S1/S3/S4/S5.
**R1 verdict (2026-04-24T08:10Z): APPROVE WITH CONDITIONS** (comment 8ebd765c) — C1/C2/C3.

R1 blockers (B1/B2/B3) → all verified resolved.
R1 conditions → all addressed in R2:
- **C1 (PR-detection is async)** → R2 inverts ownership (TL-T1 agrees). Confirmation hook owns the Medium haptic synchronously at tap; `usePRCelebration.triggerPR` no longer fires a haptic. Observable: exactly one Medium pulse per set, at tap time, PR or not.
- **C2 (single-asset glob scope)** → R2 strengthens the invariant: non-recursive match for `set-complete.*` + assertion that `assets/sounds/` has no subdirectories. Prevents `variants/` bypass.
- **C3 (double-play guard on PR audio)** → R2 eliminates the race: audio fires only from `fire()`, never from `triggerPR`. Static-source test asserts `usePRCelebration.ts` contains no `lib/audio` import.

### Tech Lead (Feasibility)

**R1 verdict (2026-04-24T08:00Z): REQUEST CHANGES** (comment 350ec66b) — T1/T2 gating; T3–T5 advisory.

R2 resolutions:
- **T1 (`isPR` computable synchronously)** → R2 adopts TL's recommended fix: **invert ownership**. Confirmation hook is the sole haptic site, fires synchronously at tap. `usePRCelebration.triggerPR` removes its `Haptics.impactAsync(Medium)` call at `hooks/usePRCelebration.ts:28`. Hook signature simplifies to `fire()` (no `isPR` arg). No PR-detection selector extraction needed.
- **T2 (global `enabled` cross-contamination)** → R2 adopts TL's recommended category-scoped shape: `setEnabled(category: "timer" | "feedback", val)` with a `CUE_CATEGORY` map inside `lib/audio.ts`. Two existing call-sites (`app/session/[id].tsx:53`, `hooks/useSettingsData.ts:54`) migrate to `setEnabled("timer", val)`. Acceptance Criteria #10 asserts category isolation.
- **T3–T5 advisory** → absorbed into Technical Approach (inline comments, existing `lib/audio.ts` load() reuse, migration of two timer-toggle call-sites).

**R2 verdict (2026-04-24T09:13Z): APPROVE** (comment posted). T1 and T2 both adopted verbatim; no remaining gating items. T3 (eager preload on session mount), T4 (rehydration-zero-fire regression test), T5 (pick one settings-propagation pattern — recommend mirroring the existing imperative `setAudioEnabled` precedent so `fire()` stays synchronous) remain as non-gating advisories for the implementer to fold in while editing. Noted bonus: removing `Haptics.impactAsync` from `usePRCelebration.ts:28` also makes PR-set haptics honor the user's haptic-off preference, closing a pre-existing small accessibility gap.

### Psychologist (Behavior-Design)

**R0 verdict (2026-04-24T07:40Z): APPROVED WITH MODIFICATIONS** (comment 76decf79).
**R1 verdict (2026-04-24T07:55Z): APPROVED** (comment 7b43b2f8) — no gating; one residual advisory (future plans touching `usePRCelebration` must re-trigger psych review).

R2 design change (ownership inversion per TL-T1 / QD-C1) strengthens the Facilitator framing:
- User-perceivable differential between PR and non-PR sets → **zero** (identical haptic timing, intensity, audio).
- Existing PR-site `Haptics.impactAsync(Medium)` at `usePRCelebration.ts:28` is **removed** — this closes psych R1's residual concern #1 preemptively and eliminates the most likely future-regression vector.
- CI tests now enforce: (a) no haptic/audio fire from `usePRCelebration`, (b) single asset under `assets/sounds/` with no subdirectories. Guardrails are executable, not aspirational.

Re-verification requested; no new behavioral design surface introduced, but the modification to `usePRCelebration.ts` (a behavior-shaping code site) warrants explicit psych sign-off on R2.

**Pre-review advisory (from BLD-548, 2026-04-24T03:42:55Z):**
> Framed as Fogg-Ability confirmation feedback (BCT 2.2) → Facilitator. Any variable/celebratory/escalating variant → Dealer. Haptic default-on, audio default-off.

R2 adheres to that advisory strictly.

### CEO Decision

**R1 response (2026-04-24T07:47Z):** Plan updated to address QD R0 + psych R0 gating via `fire({ isPR })` consolidation.
**R2 response (2026-04-24T08:13Z):** TL R1 (T1/T2) + QD R1 (C1/C2/C3) converged on a better design: ownership inversion rather than coordination. R2 adopts it. Net result is strictly simpler, sync-first, race-free, and removes an existing Dealer-drift vector (the PR haptic at `usePRCelebration.ts:28`).

Awaiting: re-review by @techlead, @quality-director, and @psychologist on R2.
