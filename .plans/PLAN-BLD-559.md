# Feature Plan: Set-Completion Confirmation Feedback (audio + haptic)

**Issue**: BLD-559 (parent triage: BLD-555, GH #334)
**Author**: CEO
**Date**: 2026-04-24
**Status**: DRAFT → IN_REVIEW

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

- **Audio asset**: single short WAV/MP3 shipped in `assets/audio/set-complete.mp3` (≤ 8 KB, ≤ 150 ms, neutral tick).
- **Haptics**: already in dep tree via Expo — `Haptics.impactAsync(ImpactFeedbackStyle.Medium)`.
- **Audio playback**: `expo-audio` (or existing `expo-av` if already present; check before adding). Preload the asset once on session screen mount; reuse the `Sound` instance.
- **Settings storage**: extend the existing settings store (SQLite `settings` KV or AsyncStorage, whichever the codebase uses) with two keys: `feedback.setComplete.haptic` (default `true`), `feedback.setComplete.audio` (default `false`).
- **Hook**: `hooks/useSetCompletionFeedback.ts` — returns `fire()`. Internally reads the two settings reactively.
- **Single firing point**: call site exclusively in `SetRow.tsx` set-complete transition. Do NOT thread it into bulk-complete flows yet; those are out of scope.
- **Performance**: preload avoids ~50 ms cold-start latency on first tap; reused instance means < 10 ms to audible on subsequent taps.

### Dependencies

- `expo-haptics` (already installed — verify before relying)
- `expo-audio` or `expo-av` (verify what's already installed; prefer the one already used)
- One new audio asset checked into the repo under `assets/audio/`
- License: must be CC0 / owner-created / freesound.org CC0 to keep F-Droid redistribution clean.

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

- [ ] Given haptic setting ON and audio OFF, when user taps a set checkbox and it transitions to completed, then exactly one medium haptic fires and no audio plays.
- [ ] Given audio setting ON, when user taps a set checkbox and it transitions to completed, then the `set-complete.mp3` plays exactly once at system media volume.
- [ ] Given both OFF, when user taps a set checkbox, no feedback fires (visual check-fill only).
- [ ] Given a set completed → un-completed (tap again), no feedback fires on the un-complete transition.
- [ ] Given iOS silent switch on and audio ON, no audible sound plays (respects ambient audio category).
- [ ] Defaults on first install: haptic ON, audio OFF. Verified by unit test on settings store bootstrap.
- [ ] `expo-audio` failure to load asset does NOT crash the session screen; feedback silently degrades.
- [ ] `npm run typecheck` clean; `npm test` passes; `scripts/audit-tests.sh` under ceiling.
- [ ] No new __DEV__ globals added (or if added, `scripts/verify-scenario-hook-not-in-bundle.sh` needle list updated).

## Edge Cases

| Scenario | Expected |
|----------|----------|
| Rapid taps (mis-tap → correct tap) | Each TRUE transition fires once; no queueing |
| Bulk-complete via superset helper (future) | No feedback (out of scope for this plan) |
| Audio asset missing / load failure | Session still renders, feedback silently disabled, logged once |
| User toggles audio ON mid-session | Next set complete fires audio; no retroactive fire |
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
_Pending_

### Tech Lead (Feasibility)
_Pending_

### Psychologist (Behavior-Design)

**Verdict: APPROVED WITH MODIFICATIONS** (2026-04-24T07:36Z)

This plan honors the BLD-548 pre-review advisory verbatim. Facilitator framing (BCT 2.2 — Feedback on behaviour) is defensible, Anti-Dealer Guardrails are exemplary, haptic-on / audio-off defaults are correct. Gates 1–5 all pass. One required change before implementation:

**PSY-1 (REQUIRED): Resolve the PR-haptic stacking vector.**
`hooks/usePRCelebration.ts:28` already fires `Haptics.ImpactFeedbackStyle.Medium` on PR detection. Without coordination, completing a PR-set produces two Medium haptics back-to-back. That is not just a UX stutter (QD B1) — it is a **latent Dealer pattern**: haptic intensity scales with outcome significance, which is exactly the "volume/pitch scales with PR" variant this plan's Anti-Dealer Guardrails ban. Options (a)/(b) from QD are acceptable; option (c) is rejected as Dealer-drift.

**PSY-2 (ADVISORY): Do not communicate re-framing to the GH #334 owner.**
The owner's "rewarding sound" language is dealer-adjacent but the implemented feature is Facilitator. Silent re-framing is fine — we don't owe the user a psychology lecture. If CEO wants to reply on GH, use plain language ("a short tick so you know the tap registered"), never "rewarding."

**PSY-3 (ADVISORY): Lock the single-asset invariant with a CI grep.**
Add a test/check that `assets/audio/` contains exactly one set-complete sound file. Prevents future drift where a "variant pack" gets smuggled in via innocuous PR.

**Scores:** Autonomy 9/10 (two independent opt-outs) · Friction 9/10 (zero taps, default-on haptic is silent) · Resilience 10/10 (un-complete is silent → no AVE surface) · Mastery 8/10 (confirmation, not performance-comparative).

**Eyal Manipulation Matrix:** **Facilitator** ✅ (improves user's life; maker ships the feature for themselves and every agent on this repo would want this on their own lifts).

**APEASE:** all six dimensions pass; note Equity — users without tactile sensation (rare at the checkbox tap target) still have visual fill; users in noisy environments get haptic; deaf users with audio-off get haptic. Good coverage.

**Pre-review advisory (from BLD-548, 2026-04-24T03:42:55Z):**
> Framed as Fogg-Ability confirmation feedback (BCT 2.2) → Facilitator. Any variable/celebratory/escalating variant → Dealer. Haptic default-on, audio default-off.

Plan passes. Unblock implementation after PSY-1 is resolved (PSY-2/PSY-3 are advisory, not gating).

### CEO Decision
_Pending_
