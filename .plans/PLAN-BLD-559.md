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

- **Existing audio module reuse**: `lib/audio.ts` already wraps `expo-audio` with preloaded players, `setAudioModeAsync({ playsInSilentMode: false })`, and an `enabled` gate used by rest-timer cues. We extend the `TimerCue` union (rename to `AudioCue` if clean) with a new `set_complete` cue and require only this cue to consult an **independent per-cue enabled state** (see Haptic/Audio Coordination below).
- **Audio asset**: single short WAV shipped in `assets/sounds/set-complete.wav` (≤ 8 KB, ≤ 150 ms, neutral tick). WAV chosen to match existing `beep_high.wav`/`tick.wav`/`complete.wav` already in the tree; keeps bundle format uniform (QD-S5).
- **Haptics**: `Haptics.impactAsync(ImpactFeedbackStyle.Medium)` via `expo-haptics` (already in dep tree).
- **Settings storage**: SQLite KV via existing `getAppSetting` / `setAppSetting` (QD-S4). Two keys, both stored as `"true"` / `"false"` strings:
  - `feedback.setComplete.haptic` (default `"true"`)
  - `feedback.setComplete.audio` (default `"false"`)
  - Missing key → default. No schema migration needed (KV table already exists).
- **Hook**: `hooks/useSetCompletionFeedback.ts` — exposes `fire({ isPR }: { isPR: boolean })`. Internally reads the two settings via React Query (cache invalidated by the Settings screen mutator). Returns a stable callback (useCallback over memoized settings snapshot).
- **Single firing point (consolidated — PSY-1 / QD-B1 resolution):** call site exclusively in `SetRow.tsx` set-complete transition. Hook computes `isPR` up-front by consulting the same PR detection logic `usePRCelebration` uses (extract shared selector if needed). **PR-haptic coordination rule:**
  - If `isPR === true`: `fire()` plays audio only (when enabled) and **skips** the confirmation haptic. `usePRCelebration.triggerPR()` continues to own the PR haptic (single `Medium` pulse). Net result on PR sets: **exactly one Medium haptic**, not two.
  - If `isPR === false`: `fire()` plays audio (when enabled) AND fires the confirmation haptic (when enabled). `triggerPR` is not invoked.
  - This is option (b) from QD's B1 — consolidation, not intensity-scaling. No Dealer vector because haptic intensity is a constant `Medium` in both branches; the only difference is which site owns the fire. Documented in a comment on both `useSetCompletionFeedback.ts` and `usePRCelebration.ts:28` so future refactors don't re-introduce stacking.
- **Un-complete (`true → false`)**: no feedback, no PR path. Enforced inside the hook via the transition argument (see Acceptance Criteria #4 & #10).
- **Performance**: preload via existing `lib/audio.ts` `load()` mechanism; reused player instance means < 10 ms to audible on subsequent taps.
- **Silent-switch compliance (QD-B3):** verified by unit test asserting `setAudioModeAsync` is called with `{ playsInSilentMode: false }` on hook mount (the existing `lib/audio.ts:30` config already satisfies this; test guards against regression).

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

- [ ] Given haptic setting ON and audio OFF and `isPR=false`, when the set transitions `completed: false → true`, exactly one `Haptics.ImpactFeedbackStyle.Medium` fires and no audio plays.
- [ ] Given audio setting ON and `isPR=false`, when the set transitions to completed, `lib/audio.play('set_complete')` is called exactly once at system media volume.
- [ ] Given both OFF, when the set transitions to completed, neither the haptic API nor `lib/audio.play` is invoked.
- [ ] Given a set transitions `true → false` (un-complete), the hook does not fire under any settings combination.
- [ ] Given `isPR=true` and haptic setting ON, **`useSetCompletionFeedback.fire()` skips the haptic** and `usePRCelebration.triggerPR` owns the single `Medium` pulse. Asserted by spying on `Haptics.impactAsync` and verifying exactly one call per PR set.
- [ ] Given `isPR=true` and audio setting ON, `lib/audio.play('set_complete')` still fires (audio is a confirmation-feedback cue, not a PR-only event).
- [ ] Given the app cold-starts with no settings persisted, `feedback.setComplete.haptic === true` and `feedback.setComplete.audio === false`. Verified by unit test against a fresh SQLite KV.
- [ ] Given `setAudioModeAsync` throws on hook init, the session screen still renders and subsequent set completions do not crash; one `__DEV__` warning is logged, user-facing state is unchanged.
- [ ] Given iOS silent switch ON and audio setting ON, no audible sound plays. Verified indirectly by asserting `setAudioModeAsync` is called with `{ playsInSilentMode: false }` on hook mount (QD-B3).
- [ ] Given `assets/sounds/` is scanned at test time, exactly one file matches `set-complete.*`. Fails the suite if ≥ 2 files present (PSY-3 CI enforcement).
- [ ] `npm run typecheck` clean; `npm test` passes; `scripts/audit-tests.sh` under 1800 test-line ceiling.
- [ ] No new `__DEV__` globals added (or if added, `scripts/verify-scenario-hook-not-in-bundle.sh` needle list updated in the same PR — ref memory: bundle gate semantics).

## Edge Cases

| Scenario | Expected |
|----------|----------|
| Rapid taps (mis-tap → correct tap) | Each TRUE transition fires once; no queueing |
| Bulk-complete via superset helper (future) | No feedback (out of scope for this plan) |
| Audio asset missing / load failure | Session still renders, feedback silently disabled, logged once |
| User toggles audio ON mid-session | Next set complete fires audio; no retroactive fire |
| PR set completion (`isPR=true`) | Exactly one Medium haptic (owned by `triggerPR`); no double-haptic (PSY-1 / QD-B1) |
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

**R0 verdict (2026-04-24T07:35Z): APPROVE WITH CHANGES** (comment 51581317).

Blockers raised:
- **B1 — Double-haptic collision with `usePRCelebration.ts:28`**: addressed in R1 Technical Approach "PR-haptic coordination rule" (option **b** — consolidation via `useSetCompletionFeedback.fire({ isPR })`). On PR sets: confirmation haptic is skipped; `triggerPR` owns the single `Medium` pulse. Intensity is constant `Medium` in both branches (no Dealer-drift).
- **B2 — audit-test ceiling risk**: addressed in R1 Acceptance Criteria header; all new tests required as `it.each` tables.
- **B3 — silent-switch behavior needs a test**: addressed in R1 Acceptance Criteria (assertion on `setAudioModeAsync({ playsInSilentMode: false })` on hook mount).

Advisory absorbed:
- **S1** `lib/audio/feedback.ts` extraction: existing `lib/audio.ts` already is the central dispatcher; R1 reuses it by adding a `set_complete` cue rather than creating a new module.
- **S3** SPDX identifier: captured in Dependencies — `assets/sounds/LICENSES.md` requires source URL + `CC0-1.0`.
- **S4** Settings storage: R1 fixes the store choice — SQLite KV via `getAppSetting` / `setAppSetting`.
- **S5** Asset format: R1 switches to WAV (matches existing `beep_high.wav`/`tick.wav`/`complete.wav`).

### Tech Lead (Feasibility)
_Pending — requested 2026-04-24T07:28Z, awaiting response_

### Psychologist (Behavior-Design)

**R0 verdict (2026-04-24T07:40Z): APPROVED WITH MODIFICATIONS** (comment 76decf79).

All 5 gates pass; Eyal Classification = Facilitator; Scores Autonomy 9/10 · Friction 9/10 · Resilience 10/10 · Mastery 8/10 (all above the 3/5 floor).

Gating change:
- **PSY-1 — resolve PR-haptic stacking**: addressed in R1 (same resolution as QD-B1; option **b**, consolidation, not intensity-scaling).

Advisory absorbed:
- **PSY-2** — no re-framing lecture to owner. If/when we reply on GH #334, we use plain language ("a short tick so you know the tap registered"), never "rewarding."
- **PSY-3** — CI single-asset invariant: added to Anti-Dealer Guardrails and Acceptance Criteria (Jest test asserts exactly one `set-complete.*` file under `assets/sounds/`).

**Pre-review advisory (from BLD-548, 2026-04-24T03:42:55Z):**
> Framed as Fogg-Ability confirmation feedback (BCT 2.2) → Facilitator. Any variable/celebratory/escalating variant → Dealer. Haptic default-on, audio default-off.

R1 adheres to that advisory verbatim and now resolves the single latent Dealer-drift vector (PR-haptic stacking) identified by both QD and psych.

**R1 verdict (2026-04-24T07:55Z): APPROVED** (comment 7b43b2f8).

Adversarial test confirmed: `fire({ isPR })` is plumbing-level deduplication, not outcome-coupling. User-facing observables (haptic count, intensity, timing, audio cue) are identical across PR and non-PR sets — constant Medium haptic, constant `set_complete` audio cue. The user's body cannot distinguish a PR set from a non-PR set via this feature's outputs. Not Dealer-drift.

Scores updated: Mastery 8/10 → **9/10** (PR-haptic consolidation removes the one surface where outcome-scaling could have crept in). Autonomy 9 · Friction 9 · Resilience 10. Eyal: **Facilitator** ✅.

Advisory (non-gating, future-facing): any future plan that modifies `usePRCelebration.triggerPR` (e.g., changes intensity, adds sound, adds a second haptic) must re-trigger psych review — the current coordination contract depends on `triggerPR` keeping its single-Medium-pulse shape.

**Unblock implementation.** No further psych review required unless the Anti-Dealer Guardrails or PR-coordination rule are modified.

### CEO Decision

**R1 response (2026-04-24T07:47Z):** Plan updated to address all gating items:
- QD-B1 / PSY-1 (PR-haptic stacking) → option (b) consolidation in `useSetCompletionFeedback.fire({ isPR })`
- QD-B2 → `it.each` tests mandated
- QD-B3 → silent-switch test via `setAudioModeAsync` assertion
- QD-S3/S4/S5 → absorbed (SPDX, SQLite KV, WAV format)
- PSY-2 → no re-framing lecture to owner
- PSY-3 → CI single-asset invariant test

Awaiting: (a) techlead review, (b) re-review by QD and psychologist on R1.
