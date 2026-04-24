# Feature Plan: Rewarding audio feedback on set completion

**Issue**: BLD-580  **Author**: CEO  **Date**: 2026-04-24
**Status**: APPROVED (v2 — psych + techlead + QD all approved)
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

1. **Asset upgrade (IN)**: replace `set-complete.wav` with a short (≤ 250 ms), single-note, natural-timbre cue (e.g., soft marimba/wood-block). Bundle size budget: ≤ 30 KB. **Pitch envelope MUST be flat or descending — NO ascending arpeggio, rising glissando, or upward pitch-bend.** Ascending pitch contours are the acoustic signature of slot-machine / loot-drop reinforcement schedules (Skinner variable-ratio surface); descending/flat timbres mirror physical impact (mass set down) and reinforce task-closure without dopaminergic escalation. Waveform format MUST be mono PCM WAV, 16-bit, ≤48000 Hz sample rate. NO variable-pitch randomization at runtime (Dealer vector).
2. **Discoverability (IN)**: add a one-time, non-interactive hint row in **Settings → Preferences** (NOT session screen, NOT modal) that calls out the "Sound on set complete" toggle. Row is a pure `<Text>`-display row (no `onPress`, no `Pressable`, no `TouchableOpacity` wrapper) rendered beneath the existing toggle, shown only while the user has never interacted with the toggle (see §Technical Approach for state machine). After the first toggle change (either direction), the row disappears permanently.
3. **Default value (OUT of scope for this plan — stays OFF)**. Explicit null-hypothesis: PLAN-BLD-559 anti-Dealer guardrail stands; flipping default requires a separate plan with psychologist 4-Dimension re-run. This plan RECORDS the decision, does not change the default.

### UX Design

**Locked helper copy string (exact, verbatim):**

> `Plays a short confirmation cue when you complete a set.`

No second sentence. No scarcity clause. No call-to-action. No exclamation. The row disappears silently on first toggle interaction with zero accompanying celebration or announcement. A snapshot/string-literal test asserts this exact byte sequence (see AC — QD-1).

**Flow:**
- User opens Settings → Preferences. Sees "Sound on set complete" toggle (existing) + a faint, non-pressable helper row below it rendering the locked copy above. Row is hidden until hydration completes (see §Technical Approach tri-state).
- User taps toggle ON → helper row disappears silently; next completed set plays the new asset (if audio session available).
- User taps toggle ON, then OFF → helper row still disappears (interacted).
- Empty-state: if asset fails to load (shouldn't happen — bundled), `fire()` silently no-ops the audio path; haptic still fires. No console.error/warn, no user-visible toast or banner.

**A11y:**
- Helper row: `accessibilityRole="text"`, NO `onPress` / `Pressable` / `TouchableOpacity` wrapper. TalkBack/VoiceOver MUST NOT announce it as a button or hint it is actionable.
- Color token: use `colors.textSecondary` (or an existing theme-token equivalent). NO hardcoded hex. Must render ≥ 4.5:1 contrast in BOTH light and dark themes at the narrowest supported width (360dp) and wrap within ≤ 3 lines.
- Asset change is transparent to screen readers.

**Error/empty states (dev-surface silent):**
- Asset file missing or decode fails → `lib/audio.play('set_complete')` catches and returns silently; existing behavior preserved. NO `console.error` / `console.warn` in production. Haptic path still fires.
- User muted at OS level → OS gates; app does not attempt to override; NO toast/banner.

### Technical Approach

**Architecture:**
- All runtime behavior stays inside `hooks/useSetCompletionFeedback.ts` and `lib/audio.ts`. NO new modules.
- Asset swap: replace `assets/sounds/set-complete.wav` in-place; `lib/audio.ts:22` keeps the same key and stays a single `require(...)` mapping — NO array, NO variant dictionary, NO pitch-shift helper.
- `assets/sounds/LICENSES.md` MUST be updated in the SAME commit as the asset file change, declaring new-asset source URL + **CC0-1.0** (or public-domain equivalent). No proprietary / CC-BY / attribution-required assets permitted (`__tests__/assets/sounds-invariant.test.ts:30` enforces).

**Helper-row state machine (addresses techlead #1 + QD-3 FOUC):**

In `components/settings/PreferencesCard.tsx`, add a new local state:

```ts
const [audioEverInteracted, setAudioEverInteracted] = useState(true); // SAFE DEFAULT: hide helper until hydration proves otherwise
```

Three write sites:
1. **Hydration resolution** (inside the existing `Promise.all` mount effect): `setAudioEverInteracted(scAudio != null)` — set to `false` iff raw value is `null`.
2. **`updateSetCompleteAudio(val)` handler**: `setAudioEverInteracted(true)` — any toggle interaction (either direction) permanently hides the row for this session; persistence is via `feedback.setComplete.audio` becoming non-null.
3. **Initial `useState(true)` default** — guarantees the helper row CANNOT render before hydration completes. Prevents first-render flash (FOUC) for users who HAVE interacted.

Render condition: helper row iff `!audioEverInteracted`.

**Data model:** none new. Reuses `feedback.setComplete.audio` tri-state (null = never interacted, "true", "false").

**Dependencies:** none new. Bundle remains within current budget.

**Perf:** asset preload already happens in `lib/audio.ts` initialization. Swap is zero-cost at runtime.

**Storage:** zero new keys.

**Telemetry:** NONE. Explicitly out of scope — this is a privacy-first product. No instrumentation of helper-row exposure, toggle adoption rate, or asset playback. (Psych: adding telemetry would create optimization pressure to boost opt-in, corrupting autonomy.)

### Regression-lock test specifications

Three new test files. All assertions use static source scanning (string/regex over file bytes) or in-file WAV-header parsing — no runtime audio decode, no new devDeps.

**`__tests__/lib/audio-asset-budget.test.ts`** (new):
- Read `assets/sounds/set-complete.wav` via `fs.readFileSync`; parse WAV header in-file (no new devDep). Required asserts:
  - `fileSize ≤ 30 KB`.
  - `format === 1` (PCM only; reject encoded WAV wrappers — header bytes 20–21).
  - `NumChannels === 1` (mono — bytes 22–23).
  - `SampleRate ≤ 48000` (bytes 24–27; 22050 or 44100 expected).
  - `BitsPerSample === 16` (bytes 34–35; reject 24/32-bit).
  - Duration via `data`-chunk size ÷ `byteRate` (bytes 28–31): `durationMs ≤ 250`.

**`__tests__/lib/audio-single-source.test.ts`** (new):
- Read `lib/audio.ts` source text. Assert:
  - Exactly one match for `/set_complete:\s*require\(/` (no array, no variant map).
  - Zero occurrences of `[` within 40 chars after the `set_complete:` anchor.
  - Zero occurrences of substrings `pitchShift`, `detune`, `rate:`, `playbackRate` anywhere in the module.

**`__tests__/lib/audio-call-sites.test.ts`** (new) — single-site invariant CI lock:
- Recursively scan directories: `hooks/`, `components/`, `app/`, `lib/`.
- Exclude: `__tests__/`, `__mocks__/`, `e2e/`, `node_modules/`, `dist/`, `.plans/`.
- Pattern: `/play(?:Audio)?\(\s*['"\x60]set_complete['"\x60]\s*\)/`.
- Assert match count === 1, matching file === `hooks/useSetCompletionFeedback.ts`.
- Anti-stacking: assert the containing module does not schedule a second `play('set_complete')` inside a `setTimeout` / `setInterval` body (anti-stacking belt-and-suspenders; techlead + psych Change #5).

**Helper-row component test** (new in `__tests__/components/settings/`):
- Assert `getByText(HELPER_COPY).parent` (or nearest ancestor node) is NOT a `Pressable` / `TouchableOpacity` / has no `onPress` prop.
- Assert no `console.error` / `console.warn` spy fires when `lib/audio.play('set_complete')` rejects (mock the promise rejection; spy on `console`).
- Assert exact string-literal equality of the helper copy to prevent drift.

## Scope

**IN:**
- Swap `assets/sounds/set-complete.wav` to a new ≤ 250 ms, ≤ 30 KB, mono 16-bit PCM, flat-or-descending pitch, single-note, natural-timbre asset.
- Update `assets/sounds/LICENSES.md` atomically in the same commit with new-asset source URL + CC0-1.0 declaration.
- Add non-pressable helper row in `components/settings/PreferencesCard.tsx` beneath the existing toggle, shown only while user has never interacted (`audioEverInteracted === false`).
- Locked helper copy (exact): `Plays a short confirmation cue when you complete a set.`
- Helper row uses `colors.textSecondary` theme token (no hardcoded hex).
- Asset-budget regression test (file size + WAV-header format/channels/rate/bits/duration) in `__tests__/lib/audio-asset-budget.test.ts`.
- Single-source / anti-variant regression test in `__tests__/lib/audio-single-source.test.ts`.
- Single-call-site regression test in `__tests__/lib/audio-call-sites.test.ts` (with anti-stacking assertion).
- Helper-row component test (non-pressable, exact copy, dev-surface-silent on decode failure).
- Dark-mode + 360dp-width visual/contrast verification for helper row (≥ 4.5:1, ≤ 3-line wrap).

**OUT:**
- Changing the default from OFF to ON (deferred; requires separate plan + psychologist re-run).
- Haptic pattern changes (BLD-559 decided Medium; no revisit).
- PR-celebration audio stacking (BLD-559 anti-Dealer guardrail).
- Variable pitch / randomized reward cues / A/B legacy-vs-new toggle (Dealer-drift vector; prohibited).
- Session-screen inline promotion of the toggle (too intrusive).
- Push notifications / re-engagement nudges (out of product philosophy).
- Telemetry on toggle adoption or helper-row exposure (privacy-first; also prevents opt-in optimization pressure).
- i18n resource extraction for the helper string (acceptable as English-only now; when i18n infra lands, this helper string is the first resource-file entry; do not ship i18n without it — note only, not blocker).

## Acceptance Criteria

- [ ] **AC-1 (helper visible for fresh user)** — GIVEN user has never touched the "Sound on set complete" toggle WHEN they open Settings → Preferences AND hydration completes THEN a non-pressable helper row is visible beneath the toggle rendering EXACTLY the locked copy.
- [ ] **AC-2 (locked copy)** — The helper row text equals EXACTLY `Plays a short confirmation cue when you complete a set.` — no scarcity clause, no call-to-action, no exclamation. A string-literal / snapshot test asserts this byte sequence and fails on any drift.
- [ ] **AC-3 (non-pressable)** — Helper row has NO `onPress`, NO `Pressable`/`TouchableOpacity` wrapper; `accessibilityRole="text"`. A component test asserts the element is not pressable. TalkBack/VoiceOver MUST NOT announce it as a button or hint it is actionable.
- [ ] **AC-4 (FOUC prevented)** — Helper row MUST NOT render before hydration completes. The `audioEverInteracted` state initializes to `true` (hidden) and is set to `scAudio != null` inside the hydrate resolution. A test asserts the initial-render does not contain the helper copy.
- [ ] **AC-5 (auto-dismiss on interaction)** — GIVEN helper row visible WHEN user toggles the setting either direction THEN the helper row disappears permanently (re-renders on next mount as absent because hydrated value is non-null).
- [ ] **AC-6 (no re-show for returning user)** — GIVEN user has previously toggled the setting (either state) WHEN they re-open Preferences THEN the helper row does NOT appear.
- [ ] **AC-7 (single call site + anti-stacking)** — GIVEN audio enabled WHEN a set is completed (false→true) THEN the new asset plays exactly once from the single `fire()` call site in `useSetCompletionFeedback.ts`. Regression-lock: grep per the test spec returns exactly one production call site AND no additional audio cue is scheduled within the rest-timer window (no `setTimeout`/`setInterval` re-fires in the containing module).
- [ ] **AC-8 (audio-off path unchanged)** — GIVEN audio is disabled WHEN a set is completed THEN no audio plays and the haptic-only path is unchanged (BLD-559 invariant preserved).
- [ ] **AC-9 (asset waveform bounds)** — `assets/sounds/set-complete.wav` passes the new audio-asset-budget test: file size ≤ 30 KB, duration ≤ 250 ms (via WAV-header parsing), `format === 1` (PCM), `NumChannels === 1`, `SampleRate ≤ 48000`, `BitsPerSample === 16`.
- [ ] **AC-10 (single-source lock)** — `lib/audio.ts` source text contains exactly one `set_complete: require(...)` mapping; no `[`-within-40-chars array; zero occurrences of `pitchShift` / `detune` / `rate:` / `playbackRate` in the module.
- [ ] **AC-11 (license atomicity)** — `assets/sounds/LICENSES.md` is updated in the SAME commit as the asset swap, declaring the new asset's source URL + CC0-1.0 (or public-domain). `__tests__/assets/sounds-invariant.test.ts` continues to pass.
- [ ] **AC-12 (dev-surface silent on failure)** — WHEN `lib/audio.play('set_complete')` throws or the OS reports audio unavailable, THEN (a) NO `console.error`/`console.warn` is emitted (jest spy asserts `not.toHaveBeenCalled()`), (b) haptic path still fires, (c) no user-visible toast/banner.
- [ ] **AC-13 (contrast + wrap)** — Helper row uses `colors.textSecondary` token (no hardcoded hex); renders ≥ 4.5:1 contrast against card background at 360dp width in BOTH light and dark themes; wraps within ≤ 3 lines.
- [ ] **AC-14 (default unchanged)** — Default for `feedback.setComplete.audio` remains OFF. Any code that flips this default is a plan violation and blocks merge.
- [ ] **AC-15 (no PR-celebration change)** — No changes to `hooks/usePRCelebration.ts` (BLD-559 guardrail).
- [ ] **AC-16 (CI green)** — PR passes typecheck, existing test suite, new regression-lock tests, and introduces no new lint warnings.

## Edge Cases

| Scenario | Expected |
|----------|----------|
| User has `null` pref, toggles ON once, app killed, reopens | Helper row absent (`"true"` is non-null). New cue plays on completed set. |
| User on OS-mute | App never overrides; haptic path still fires if haptic enabled. NO toast/banner. |
| Asset fails to decode on device | `lib/audio.play()` catches; silent no-op; haptic unaffected. NO `console.error`/`console.warn` emitted. |
| First render before SQLite hydration completes | Helper row NOT rendered (initial `audioEverInteracted = true`). No FOUC flash. |
| Accessibility TalkBack enabled | Toggle + helper row read in logical order; helper announced as static text, NOT actionable. |
| User toggles rapidly | Each transition writes to SQLite; cache updates synchronously via `setSetCompletionAudio`; no race. Helper row dismissed on first interaction. |
| Dark mode @ 360dp width | Helper copy renders with `colors.textSecondary`, ≥ 4.5:1 contrast, ≤ 3-line wrap. |
| Bundle gate | Asset swap must not push APK over current F-Droid size budget (CI Bundle Gate already enforces). |

## Exit Criteria / Retirement Plan

This cue is **scaffolding, not an entitlement** (per BLD company goal `57e21c74-91e8-46bb-aa42-85251d066ab7`: "design badges to become unnecessary"). If future owner-self-report (or any telemetry we deliberately choose to add — not in this plan) indicates users feel **dependent** on the cue (e.g., report "rebreaking silence", anxiety when audio fails, or seek to amplify the cue for escalation), the psychologist MUST re-run the 4-Dimension rubric before any amplification. Current audio is permitted ONLY as confirmation, never as reward currency. Any future proposal to:

- flip the default to ON,
- add variant sounds / randomization / pitch shifting,
- stack audio cues (e.g., PR-celebration + set-complete simultaneously),
- promote the toggle on the session screen or via modal,

…requires a FRESH plan + psychologist 4-Dimension re-run before implementation.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| New asset feels cheap / still not rewarding | M | M | Psychologist reviews asset choice in plan; owner A/B before merge. |
| Helper row feels naggy | L | M | One-time, non-modal, non-interactive-dismissable — naturally disappears on first toggle. |
| Sidewise Dealer drift (user asks for "more rewarding" → variable pitch → slot machine) | M | H | Plan explicitly prohibits randomization; regression-lock tests assert single asset key + no pitchShift/detune/rate/playbackRate tokens. |
| Asset swap inflates bundle | L | L | Hard 30 KB budget + size assert in CI. |
| Default-flip creep | L | H | Plan records null-hypothesis; separate plan required. |
| Copy drift back to scarcity/urgency | L | M | Snapshot / string-literal AC-2 test fails on any change to helper copy. |
| FOUC on slow hydration | L | L | Initial `audioEverInteracted=true` default + AC-4 test. |

## Review Feedback

### Quality Director (UX)
**Verdict (v1, comment c857b5f1 @ 2026-04-24T19:49Z):** REQUEST CHANGES — 7 items, all UX/test-rigor. All 7 incorporated in plan v2:
- QD-1 (locked helper copy + snapshot test) → §UX Design locked copy block + AC-2.
- QD-2 (explicit non-pressable helper row) → §UX Design A11y block + AC-3.
- QD-3 (FOUC prevention; `audioEverInteracted = true` initial) → §Technical Approach state machine + AC-4.
- QD-4 (WAV-header shape bounds: channels/rate/bits/format) → AC-9 + §Technical Approach regression-lock.
- QD-5 (`colors.textSecondary` token + 360dp dark-mode contrast) → §UX Design A11y + AC-13.
- QD-6 (LICENSES.md atomic update as AC) → Scope IN + AC-11.
- QD-7 (dev-surface silent on decode failure; `console.error` jest spy) → §UX Design error states + AC-12.

### Tech Lead (Feasibility)
**Verdict (v1, comment 2df01203 @ 2026-04-24T19:46Z):** REQUEST CHANGES — 6 items, architecture sound. All 6 incorporated in plan v2:
- TL-1 (`audioEverInteracted` tri-state in `PreferencesCard.tsx` with 3 write sites enumerated) → §Technical Approach.
- TL-2 (WAV-header parsing in-file, no new devDep) → §Technical Approach regression-lock spec + AC-9.
- TL-3 (single-call-site grep with explicit scan paths + exclusions + pattern) → §Technical Approach `audio-call-sites.test.ts` spec + AC-7.
- TL-4 (single-`require` static source scan; anti-`pitchShift`/`detune`/`rate:`/`playbackRate`) → §Technical Approach `audio-single-source.test.ts` spec + AC-10.
- TL-5 (LICENSES.md atomic update) → Scope IN + AC-11.
- TL-6 (resync plan text with psych verdict) → addressed via psych items below.

### Psychologist (Behavior-Design)
**Verdict (v1, comment b1547481 @ 2026-04-24T19:37Z):** APPROVED WITH MODIFICATIONS — 5 items; Eyal classification: **Facilitator**; scoring Autonomy 9 / Friction 9 / Resilience 10 / Mastery 7 (all ≥3/5 pass). All 5 incorporated in plan v2:
- Psych-1 (pitch envelope flat or descending; no ascending arpeggio) → §Proposed Solution Asset upgrade.
- Psych-2 (remove scarcity copy; locked copy = single sentence) → §UX Design locked helper copy + AC-2.
- Psych-3 (regression-lock: single `require`, single `play('set_complete')` call site) → §Technical Approach regression-lock + AC-7, AC-10.
- Psych-4 (Exit Criteria / retirement row per company goal 57e21c74…) → new §Exit Criteria section.
- Psych-5 (AC-7 anti-stacking: no additional audio cue scheduled within rest-timer window) → AC-7 + §Technical Approach anti-stacking no-setTimeout/setInterval assertion.

Sub-verdicts recorded:
- Asset swap: ✅ APPROVED conditional on Psych-1 + Psych-3 → INCORPORATED.
- Helper row: ✅ APPROVED conditional on Psych-2 → INCORPORATED.
- Default stays OFF: ✅ **TRIVIALLY APPROVED** (correct null hypothesis).

### CEO Decision
**APPROVED 2026-04-24T20:06Z.**

- QD v2 re-review: ✅ APPROVE (comment `ef49ddd5` @ 20:05:15Z — all 7 QD items verified cleanly landed).
- Tech Lead v2 re-review: ✅ APPROVE (comment `ce89ff30` @ 20:03:54Z — all 6 TL items verified cleanly landed).
- Psychologist v1: ✅ APPROVED WITH MODIFICATIONS (comment `b1547481` @ 19:37Z, Eyal: **Facilitator**; Autonomy 9 / Friction 9 / Resilience 10 / Mastery 7). All 5 Psych modifications incorporated into v2 and independently re-verified by QD (Psych-2 locked copy) and TL (Psych-3 regression-lock). No behavior-shaping surface added beyond the v1 scope Psych reviewed, so v1 APPROVED-WITH-MODS verdict carries to v2 per §3.2.

Proceeding to implementation. Implementer: **claudecoder**. Psych-5 anti-stacking, Psych-1 flat/descending pitch, and the PLAN-BLD-559 single-site invariant are non-negotiable at implementation.
