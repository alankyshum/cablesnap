# Feature Plan: Live In-Session RPE Capture

**Issue**: BLD-1110
**Author**: CEO
**Date**: 2026-05-09
**Status**: DRAFT → IN_REVIEW (rev 2 — addressing QD + Tech Lead blockers)

## Research Source
- **Origin**: Reddit/community gap analysis (r/fitness, r/weightlifting, r/naturalbodybuilding) + 2025-2026 third-party reviews of Hevy / Strong / Boostcamp (Dr. Muscle, RepReturn, StrengthLab360, GymGod).
- **Pain point observed**: "Hevy is *only a logbook* — it offers zero guidance, doesn't help with weight selection or program design." Multiple reviews call out the absence of an effort signal as the reason apps can't get smarter. r/naturalbodybuilding / r/weightroom culture treats RPE/RIR as the canonical effort signal.
- **Frequency**: Recurring theme across 4+ independent reviews; foundational lifting-app criticism (not a one-off rant).

## Problem Statement
CableSnap **already** has RPE wired through the data layer, the rest-timer adaptation (`lib/rest.ts:122`), the progression suggestion (`lib/rm.ts:97`), the avg-RPE history chart, and the post-session edit screen. But **the live session screen — the most-used surface in the app — has no way to capture RPE**. The only way to log it is to finish the workout, navigate into Session Detail, tap Edit, and type a number per row.

Result:
1. Adoption of RPE is near-zero, so all the downstream RPE-aware features (smart rest timer, deload suggestions) silently fall back to defaults for the vast majority of sets.
2. We give Reddit/Hevy refugees the exact reason they cite for switching ("only a logbook") even though we already have the underlying smarts — they just can't feed them.
3. The friction (open detail → edit → tap field → keyboard → number) is so high that even motivated users skip it.

This is the single highest-leverage UX gap we have: a tiny live-capture chip flips on a stack of features that already exist.

## Behavior-Design Classification (MANDATORY)
- [x] **NO** — purely informational/functional. The feature captures a self-reported effort signal that is consumed by existing algorithms (rest, progression). It does **not** add streaks, notifications, rewards, leaderboards, motivational copy, identity framing, gamification, or re-engagement loops. The avg-RPE chart that already exists is informational, not motivational.
- [ ] YES

(Psychologist review **N/A**. If any reviewer believes the chip introduces guilt-style framing or behaviour shaping during the spec critique, escalate.)

## User Stories
- **As a lifter**, after I tap "complete" on a set, I want a one-tap chip (Easy / Moderate / Hard / Max) so I can record how the set felt without breaking flow.
- **As an RPE/RIR-fluent lifter**, I want to long-press the chip row to enter a precise RPE (6.0–10.0 in 0.5 steps).
- **As a lifter who doesn't care about RPE**, I want to ignore the chips entirely and have my workout work exactly as today.
- **As a lifter using the smart rest timer**, I want my just-tapped chip to immediately adjust the rest countdown.
- **As a lifter checking the "Next" suggestion**, I want my recent RPE values to inform whether the suggestion is "increase weight," "hold," or "deload."

## Proposed Solution

### Overview
Introduce a single horizontal chip strip beneath **every completed set** in the live session screen (rev-2 resolution to QD #1 / Tech Lead B7 — uniform density, no most-recent-only conditional). Four chips (Easy / Moderate / Hard / Max) → RPE values **6 / 7.5 / 9 / 10**, each landing in a **distinct rest-multiplier bucket** (rev-2 fix to Tech Lead B2 — adds new `moderate` bucket [7, 8.5) to `lib/rest.ts`). Long-press any chip → opens a precise picker (6.0 → 10.0 in 0.5 steps). All optional. No nag. Disabled by default; opt-in via Settings.

**Most-recent-only behaviour applies to the rest-timer side-effect ONLY**: tapping a chip on any completed set always writes RPE to that set; only chips on the most-recent-completed set in the active exercise also trigger `recomputeActiveRest` (Tech Lead B1 + B7 resolution). Older-set chip taps are pure data edits with no timer side-effect.

### UX Design
**Visibility states**

| Trigger | Chip strip state |
|---------|------------------|
| Set marked completed (`completed=1`) AND RPE-capture preference = ON | Chip strip slides in below the set row (height ~32 dp) |
| Set already has RPE | Selected chip filled; row height unchanged after first selection (no extra reveal) |
| Set incomplete OR pref = OFF | Chip strip not rendered |

**Interaction**

| Action | Result |
|--------|--------|
| Tap chip (Easy / Moderate / Hard / Max) | `updateSetRPE(setId, value)` (existing helper, enhanced — see Tech) → row updates, `rpeBreadcrumb` logged. **If this is the most-recent-completed set in the active exercise AND a rest timer is running**, also `recomputeActiveRest(setId, value)` (see Tech B1). |
| Tap selected chip again | Clears RPE → `updateSetRPE(setId, null)`. Same recompute rules apply. |
| Long-press any chip | Opens `RpeSheet` (bottom sheet, modeled on `BodyweightModifierSheet` per Tech N4) with steppable 6.0 → 10.0 in 0.5 increments + Cancel + Clear |
| Tap chip during rest countdown | `recomputeActiveRest` adjusts `remaining = max(0, remaining + (newTotal − oldTotal))`. Elapsed time is preserved (no reset). If new `remaining ≤ 0`, fire the existing natural-expiry "Rest complete" path (no new auto-dismiss branch). |
| Swipe set row | Existing behaviours unchanged (delete, etc.) |
| Long-press chip | Opens RpeSheet only — does NOT cycle setType, trigger swipe-complete, clear variant, clear BW grip, or clear BW modifier (5 existing onLongPress handlers in SetRow.tsx; chips are inside child `Pressable`s so RN doesn't bubble — assert explicitly in tests per Tech N1). |
| Tap chip | Does NOT toggle set completion (regression test required). |

**Visual / a11y**
- Chip colours mirror the existing `lib/rpe.ts` `rpeColor` palette so the strip looks consistent with history badges.
- `accessibilityRole="radiogroup"` on the strip; each chip `accessibilityRole="radio"` with `accessibilityState={{ selected }}`.
- `accessibilityLabel` per chip: "RPE 6, easy" / "RPE 7.5, moderate" / "RPE 9, hard" / "RPE 10, max effort".
- `accessibilityHint`: "Long press to enter a precise value."
- Touch target ≥ 32 dp tall, 56 dp wide. **Strip height hard-capped at 32 dp.** Set-row total height MUST NOT exceed 88 dp on any supported device after rev-2 changes.
- **Manual a11y verification required in PR**: VoiceOver (iOS) AND TalkBack (Android) walk-throughs documented with screen recordings or transcripts. Don't ship on the React-Native radiogroup contract alone — verify per platform. (QD #5 resolution.)
- Honour `prefers-reduced-motion` via new `hooks/useReducedMotion.ts` (Tech N3 — check first if a hook already exists; reuse if so) — no slide animation when reduced motion is on; chips just appear.
- **Density verification (QD #1)**: PR MUST include screenshots on (a) iPhone SE (smallest supported phone), (b) Z Fold6 unfolded (per recent #533 regression), (c) iPhone 16 Pro Max. Each screenshot shows a session with at least 4 completed sets all with chip strips visible AND the next active set's complete tap-target unobstructed.

**Settings**
- New `Capture set RPE during workouts` toggle in `components/settings/PreferencesCard.tsx`. Default **OFF** (preserves current zero-friction default for users who don't want it).
- Helper copy: "Tap a chip after each set to log how it felt. Powers the smart rest timer and progression suggestions."

**Discoverability nudge** — **MOVED OUT of this plan to BLD-1111** (Tech Lead B8 / QD #6 resolution). The one-time prompt for users with prior RPE in history is its own ~3-file / ~150 LOC scope (history predicate, persistent one-shot flag, banner UI, dismissal tests) and would balloon this PR past the 2× scope rule. AC9 moves with it.

**Empty / error / edge states** — see "Edge Cases" below.

### Technical Approach

**Components**
1. New `components/session/RpeChipStrip.tsx`
   - Props: `value: number | null`, `onChange(v: number | null) => void`, `disabled?: boolean`, `setId: string`.
   - Pure controlled component; no DB calls.
   - Wrapped in `React.memo`. Parent **MUST** pass `onChange` via `useCallback((v) => updateSetRPE(set.id, v).then(() => maybeRecomputeActiveRest(set.id, v)), [set.id])` — keyed on `set.id` ONLY (Tech N2). Otherwise React.memo defeats itself when sibling rows re-render and FlatList scroll perf regresses.
2. New `components/session/RpeSheet.tsx`
   - Bottom sheet **patterned on `BodyweightModifierSheet`** (Tech N4 — closest analogue: discrete-value select with current-value highlight + Cancel + Clear). NOT MarkerPickerSheet.
   - Background-tap dismisses (matches BodyweightModifierSheet behaviour — consistency over novelty).
   - 9 steps (6.0, 6.5 … 10.0); active step highlighted.
3. Wire into `components/session/SetRow.tsx` — append `<RpeChipStrip />` under the row when `set.completed && prefs.captureRpe`. Uniform render under every completed set (Tech B7 resolution; rest-timer side-effect is gated separately inside `useRestTimer`, not inside SetRow).

**Service / data**
1. **Enhance the EXISTING `updateSetRPE`** at `lib/db/session-sets.ts:545` (Tech B3 resolution — uppercase RPE, do NOT introduce parallel `updateSetRpe`). Existing 11+ test mocks reference `updateSetRPE` and must continue to work.
   ```ts
   export async function updateSetRPE(id: string, rpe: number | null): Promise<void>
   ```
   - Validation (new): `rpe == null` OR `rpe >= 0 && rpe <= 10 && rpe === Math.round(rpe * 2) / 2`. On invalid input, **clamp to [0, 10] then round to nearest 0.5** (defensive — never throw; matches existing helper philosophy).
   - **Plain `db.update(...)`** — NO `withTransaction` (Tech B4 resolution; matches sibling helpers updateSetNotes/Tempo/Warmup/Type and avoids the expo-sqlite "cannot rollback" footgun documented in memory).
   - Emits `rpeBreadcrumb` (new helper alongside `restResolverBreadcrumb`, Tech N5) — category `rpe-capture`, payload `{ setId, oldRpe, newRpe, source: "chip" | "sheet" }` (UUID + numerics + literal source string only — no PII).

2. **NEW `recomputeActiveRest(setId, newRpe)` on `useRestTimer`** (Tech B1 — biggest hidden complexity, fully specced):
   - Exported alongside `startRest` from the existing hook.
   - **No-op** if there is no active timer.
   - **No-op** if active timer's `restExerciseId` !== this set's exercise.
   - **No-op** if `setId` is not the most-recent-completed set in that exercise (older-set chip taps are pure data edits).
   - **No-op** if `source.kind ∈ {"history", "pinned"}` — those bypass `resolveRestSeconds` per existing AC2b comment at `useRestTimer.ts:258-265` and re-multiplying would double-count.
   - Otherwise: re-call `getRestContext + resolveRestSeconds({ rpe: newRpe, ... })`, compute `delta = newTotal − oldTotal`, set `remaining = max(0, remaining + delta)`. **Do NOT reset elapsed.**
   - **Debounce**: only the final chip tap within a 250 ms window triggers recompute (covers double-tap-clear → re-tap and avoids countdown flicker).
   - When `newTotal − elapsed ≤ 0`, fire the EXISTING natural-expiry "Rest complete" code path (do not duplicate as a new auto-dismiss branch).
   - Emits `restResolverBreadcrumb` showing `rpeBucket` change (this is what AC5's verification hook reads).
   - Wired from `RpeChipStrip.onChange` via the parent's `maybeRecomputeActiveRest` callback in SetRow.

**Buckets / multipliers**
- **Add a new `moderate` bucket to `lib/rest.ts`** (Tech B2 resolution — option (a)):
  - Bucket boundaries (rev): low `rpe ≤ 6`, **moderate `7 ≤ rpe < 8.5` (NEW)**, midOrNull `6 < rpe < 7 OR rpe == null` (collapsed to handle "user hasn't tapped" + edge values 6.5), high `8.5 ≤ rpe < 9.5`, veryHigh `rpe ≥ 9.5`.
  - Add `REST_MULTIPLIERS.rpe.moderate` (initial value: 1.10 — between midOrNull 1.0 and high 1.20; tech-lead may tune in code review).
  - Update `pickReason / rpeLabelShort / rpeLabelAccessible` in lib/rest.ts to recognise the new bucket. Existing tests for low/mid/high/veryHigh continue to pass; new tests cover the moderate bucket explicitly.
  - **No backward-compat issue**: existing data with `rpe = 7` or `7.5` will simply use the new multiplier going forward — there is no historical rest-target stored in the DB.

**Preferences**
- **Use existing `app_settings` (key, value TEXT) table** via `getAppSetting` / `setAppSetting` (Tech B5 resolution — NOT a new prefs table).
- Key: `session.captureRpe` (matches existing dotted-namespace style like `feedback.setComplete.haptic` and `rest_adaptive_enabled`).
- Semantic: ON only when `value === "true"`; missing/null = OFF (default).
- **No migration required** — `app_settings` table already exists. Drop the migration risk row.

**Reduced motion**
- New `hooks/useReducedMotion.ts` (Tech N3) — wraps `AccessibilityInfo.isReduceMotionEnabled()` + `addEventListener('reduceMotionChanged')`. ~20 LOC. Check `hooks/` first; if a similar hook already exists, reuse it instead.

**Suggestion / rest pipeline (already-wired, just verify)**
- `lib/rm.ts:97-100` already uses RPE for the **maintain** branch (NOT deload — see AC6 fix). Re-run unit tests after wiring to confirm semantics unchanged.
- `lib/rest.ts:122` already buckets RPE. Re-run rest-timer tests including the new moderate bucket cases.

**Migration**
- None required. `workout_sets.rpe` column already exists; `app_settings` table already exists.

**Performance**
- One extra small memoised component per completed set row. Strip is virtualised by the parent FlatList. With Tech N2's stable callback contract, scroll performance is unchanged. Estimated cost: ~3 ms per visible row at scroll time.

**Storage**
- One nullable `REAL` per set (already in schema). One TEXT preference row in `app_settings`. No additional storage.

## Scope

**In:**
- New `RpeChipStrip` component + `RpeSheet` precise picker (modeled on `BodyweightModifierSheet`)
- `SetRow.tsx` integration — chip strip rendered under EVERY completed set when pref ON
- Enhanced `updateSetRPE` (existing helper) with validation/clamp/round + new `rpeBreadcrumb`
- New `moderate` rest-timer bucket [7, 8.5) in `lib/rest.ts` with multiplier + label updates
- New `recomputeActiveRest(setId, newRpe)` exported from `useRestTimer` (most-recent-completed gating, history/pinned no-op, 250 ms debounce, max(0, remaining + delta) semantic)
- New `hooks/useReducedMotion.ts` (or reuse if already present)
- New `session.captureRpe` key in `app_settings` + Settings toggle in `PreferencesCard`
- Tests:
  - `__tests__/lib/rest.bucket-moderate.test.ts` — new moderate bucket boundaries + multiplier
  - `__tests__/components/session/RpeChipStrip.test.tsx` — render, a11y radiogroup contract, value/onChange
  - `__tests__/components/session/RpeChipStrip.gestures.test.tsx` — long-press chip does NOT cycle setType / trigger swipe-complete / clear variant / clear BW grip / clear BW modifier; tap chip does NOT toggle set completion (Tech N1 regression contract)
  - `__tests__/hooks/useRestTimer-recompute.test.ts` — recompute math (delta + max(0)), no-op for history/pinned, no-op for non-most-recent set, debounce, breadcrumb emitted
  - `__tests__/lib/db/session-sets.updateSetRPE-validation.test.ts` — clamp + round behaviour
- Manual a11y verification: VoiceOver + TalkBack walkthroughs documented in PR
- Manual density verification: iPhone SE + Z Fold6 + iPhone 16 Pro Max screenshots in PR

**Out:**
- Mandatory RPE capture (always optional, never blocking)
- RPE-driven AI coaching beyond what `lib/rm.ts` already does (no new ML)
- Push notifications, streaks, badges, "you skipped RPE" reminders
- Voice / wearable RPE entry
- Auto-RPE inference from heart rate / Apple Health
- **Discoverability nudge** — split to BLD-1111 (one-time prompt for users with prior RPE history). AC9 moves with it.
- **Changing `lib/rm.ts` deload semantics** — current behaviour returns "maintain" at RPE ≥ 9.5; AC6 verifies the existing branch only. Any deload (load-decrease) change is a separate ticket.

## Acceptance Criteria

1. **AC1 — Toggle gating**: Given `app_settings['session.captureRpe']` is missing OR `!== "true"` (default), When user completes any set in a live session, Then no chip strip is rendered and set row height is unchanged.
2. **AC2 — Chip capture**: Given `session.captureRpe = "true"` And user has just completed set X, When user taps the "Hard" chip, Then `workout_sets.rpe` for set X is `9.0` And the chip is visually selected And an `rpe-capture` breadcrumb is emitted with `{ setId, oldRpe: null, newRpe: 9, source: "chip" }`.
3. **AC3 — Toggle off after on**: Given a chip is currently selected, When user taps the same chip again, Then `workout_sets.rpe` is set to `NULL` And no chip is selected.
4. **AC4 — Long-press precise picker**: Given the chip strip is visible, When user long-presses any chip, Then `RpeSheet` opens with 9 steps (6.0–10.0 by 0.5) And the current value is highlighted And selecting a step writes that value to the DB (via enhanced `updateSetRPE`) And closes the sheet. Tapping the background dismisses the sheet (matches `BodyweightModifierSheet`).
5. **AC5 — Rest timer responsiveness on most-recent set**: Given user completes set X (the most-recent-completed set in active exercise) and a rest timer is running with `source.kind ∉ {history, pinned}`, When user taps "Max" chip on set X, Then within ≤ 250 ms (debounce window) `recomputeActiveRest` fires AND a `restResolverBreadcrumb` is emitted with `rpeBucket: "veryHigh"` AND `remaining = max(0, prev_remaining + (newTotal − oldTotal))` (elapsed preserved). When `remaining ≤ 0` after recompute, the existing natural-expiry "Rest complete" path fires (no new auto-dismiss code path).
6. **AC5b — Rest-timer no-op cases**: When user taps a chip on a set that is NOT the most-recent-completed in the active exercise, OR there is no active timer, OR active timer's source is `history` or `pinned`, OR active timer's `restExerciseId` does not match — Then `workout_sets.rpe` is still updated AND NO `restResolverBreadcrumb` is emitted (recompute is a no-op). Verified by unit test.
7. **AC6 — Suggestion responsiveness (existing maintain branch, NOT deload)**: Given a user's last-session sets for a given exercise have `rpe ≥ 9.5`, When `lib/rm.ts` evaluates the next-session suggestion, Then it returns `{ type: "maintain", reason: contains "RPE ≥ 9.5" }` (verifies existing `rm.ts:98-100` behaviour — no new logic added; AC6 corrected per Tech B6).
8. **AC7 — Accessibility (radiogroup contract)**: VoiceOver (iOS) AND TalkBack (Android) walkthrough recordings/transcripts in PR show: each chip read with the labels in the spec, the strip exposed as a single radiogroup focus target, chips individually navigable, and the long-press hint announced.
9. **AC8 — Reduced motion**: With reduced motion ON (verified via `useReducedMotion`), no slide-in animation; chips appear immediately.
10. **AC9 — Gesture isolation (regression)**: Long-pressing a chip does NOT cycle setType, does NOT trigger swipe-complete, does NOT clear variant, does NOT clear BW grip, does NOT clear BW modifier. Tapping a chip does NOT toggle set completion. Verified via RNTL `userEvent.longPress` / `userEvent.press` on the chip with no calls to parent gesture handlers (Tech N1).
11. **AC10 — No regressions**: All existing tests pass; lint clean; typecheck clean. Existing 11+ test mocks of `updateSetRPE` continue to work without renaming.
12. **AC11 — Density verification**: PR includes screenshots on (a) iPhone SE, (b) Z Fold6 unfolded, (c) iPhone 16 Pro Max — each showing a session with at least 4 completed sets with chip strips visible AND the next active set's complete tap-target unobstructed AND total set-row height ≤ 88 dp on every device.
13. **AC12 — Validation**: `updateSetRPE(id, 11)` clamps to `10`. `updateSetRPE(id, -2)` clamps to `0`. `updateSetRPE(id, 7.3)` rounds to `7.5`. `updateSetRPE(id, NaN)` clamps to `null` (no throw). `updateSetRPE(id, null)` clears the field. Verified via unit test.

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Set un-completed (user toggles complete OFF) | Chip strip hides; existing RPE value remains in DB so toggling complete back ON restores selection. |
| Set deleted | RPE deleted with row (existing cascade). |
| Set marked complete then immediately user adds another set | Both rows render their own independent chip strip when `session.captureRpe = "true"`. The new (still-incomplete) set has no strip until completed. |
| User taps chip on most-recent-completed set mid-rest-timer | `recomputeActiveRest` adjusts `remaining = max(0, remaining + delta)`. Elapsed preserved. If `remaining ≤ 0`, existing natural-expiry "Rest complete" path fires. |
| User taps chip on an OLDER (not most-recent-completed) set mid-rest-timer | DB updated; `recomputeActiveRest` no-ops (Tech B1 spec). No timer change. |
| User taps chip when rest source is `history` or `pinned` | DB updated; `recomputeActiveRest` no-ops (would double-count multiplier). |
| Double-tap-clear → re-tap within 250 ms | Debounce coalesces — only the FINAL tap's value drives the recompute, and only one breadcrumb fires per debounced batch. |
| Session restored from import with RPE pre-filled | Chip strip shows correct selected chip on first render. Buckets including new `moderate` [7, 8.5) apply. |
| Preference toggled mid-session | Strip appears/disappears on the next render of completed rows; existing RPE values preserved in DB. |
| Day-Mode session (no template) | Same behaviour — `session.captureRpe` pref is the only gate. |
| Linked set (circuit / superset) | Each set in the link gets its own strip; current rest-timer linked-scope rules already handle the RPE source — `recomputeActiveRest` defers to existing `getRestContext` linked logic. |
| Bodyweight set (no weight) | Strip works identically. |
| Network-offline | Local SQLite write only — no network dependency. |
| RPE value out of range from precise picker (defensive) | `updateSetRPE` clamps to [0, 10] then rounds to nearest 0.5; never throws. |
| Large RPE in CSV import (e.g. 11) | Existing import pipeline already validates; out-of-scope for this PR. |
| Live capture during a Form Clip recording | RPE chip tap must not interrupt or reset the active clip recording (cross-feature smoke check; manual). |
| Sheet open + user backgrounds the app | Sheet dismisses on next render (matches `BodyweightModifierSheet` background behaviour — consistency over novelty). |
| Set un-completed AFTER chip already selected, then completed again on another set | Older set's RPE preserved in DB; chip strip restored on re-complete. New most-recent-completed set is now the trigger for `recomputeActiveRest`. |
| Reduced-motion toggled mid-session | `useReducedMotion` listener fires; subsequent chip-strip mounts use the new animation policy. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Chip strip increases set-row height enough to push the "complete" tap target off-screen on small devices | Medium | High (regresses goal #6 zero-friction logging) | Strip height hard-capped at 32 dp, hidden when complete=0, AC11 requires iPhone SE + Z Fold6 + iPhone 16 Pro Max screenshots in PR with explicit ≤ 88 dp row-height assertion |
| Users find the strip noisy / nagging | Medium | Medium | OFF by default; purely opt-in; no notifications; nudge split to BLD-1111 |
| RPE adoption stays low and we ship complexity for nothing | Medium | Low | BLD-1111 nudge will follow; smart features already wired so cost is one-time |
| Rest timer recomputes too aggressively → flicker | Low | Medium | 250 ms debounce in `recomputeActiveRest`; only most-recent-completed set triggers; history/pinned no-op |
| Long-press conflicts with existing 5 row gestures (swipe-complete, setType cycle, variant clear, BW grip clear, BW modifier clear) | Low | Medium | RN Pressable doesn't bubble; AC9 + dedicated test asserts none of the 5 parent handlers fire from chip interactions |
| `recomputeActiveRest` double-counts multipliers when source is history/pinned | Medium without guard | High (silent rest-time errors) | Explicit no-op for `source.kind ∈ {history, pinned}` per Tech B1 spec; covered by AC5b unit test |
| Adding `moderate` bucket changes existing rest-times for users with `rpe ∈ [7, 8.5)` | Certain | Low | No historical rest-target stored; new multiplier applies prospectively only. Tech-lead reviews multiplier value (initial 1.10) at code-review time. |
| Memo regression on FlatList scroll if `onChange` is recreated each render | Medium | Medium (perf) | Tech N2 contract enforced — `useCallback((v) => ..., [set.id])` keyed on `set.id` only; verified by code review |
| `app_settings` write race with concurrent toggle | Low | Low | Existing `setAppSetting` already handles single-key writes serially via SQLite |

## Review Feedback

### Quality Director (UX)

**Verdict: REQUEST CHANGES** (rev 1, 2026-05-09 by quality-director). 6 blockers / non-blocking guidance. Full review in BLD-1110 comment thread.

**Resolutions in rev 2:**
- **#1 Row density**: Resolved via uniform render under EVERY completed set (no most-recent-only conditional — Tech B7 alignment), 32 dp hard-cap on strip height, AC11 expanded to require iPhone SE + Z Fold6 + iPhone 16 Pro Max screenshots with explicit ≤ 88 dp row-height assertion.
- **#2 Moderate dead-zone**: Resolved via Tech B2(a) — adding new `moderate` bucket [7, 8.5) to `lib/rest.ts` with own multiplier. Each chip now lands in a distinct, non-no-op bucket.
- **#3 AC6 wrong**: Fixed — AC6 now asserts the `maintain` branch with reason containing "RPE ≥ 9.5" (matches `rm.ts:98-100`).
- **#4 Mid-rest recompute UX**: Fully specced in Tech B1 — `recomputeActiveRest`, `remaining = max(0, remaining + delta)`, elapsed preserved, history/pinned no-op (no double-count), 250 ms debounce, existing natural-expiry path on `remaining ≤ 0`. AC5 + AC5b explicit.
- **#5 A11y wording**: AC7 now requires VoiceOver AND TalkBack walkthrough recordings/transcripts in PR (no relying on RN contract alone). AC9 + dedicated gesture-isolation test asserts no collision with the 5 existing onLongPress handlers.
- **#6 Nudge split**: Resolved — moved to BLD-1111 follow-up. AC9 (old, nudge) removed; new AC9 covers gesture isolation.

Re-pinging QD for re-review on rev 2.

### Tech Lead (Feasibility)

**Verdict: REQUEST CHANGES** (rev 1, 2026-05-09 by techlead) — 8 BLOCKING / 5 NIT. Full review in BLD-1110 comment thread.

**Resolutions in rev 2 (all blockers + all nits adopted):**
- **B1 (recompute path)**: Adopted verbatim — see Tech "Service / data" §2 and AC5/AC5b. New `recomputeActiveRest(setId, newRpe)` exported from `useRestTimer` with all four no-op guards (no active timer / wrong exercise / not most-recent / history-or-pinned source), `remaining = max(0, remaining + delta)`, elapsed preserved, 250 ms debounce, natural-expiry path reused.
- **B2 (Moderate dead-zone)**: Picked option **(a)** — new `moderate` bucket [7, 8.5) with own multiplier (initial 1.10, tech-lead may tune in code review). Updates to `pickReason / rpeLabelShort / rpeLabelAccessible` included. New test file `__tests__/lib/rest.bucket-moderate.test.ts` added to "In Scope".
- **B3 (don't duplicate updateSetRPE)**: Adopted — enhancing existing `updateSetRPE` (uppercase) at `lib/db/session-sets.ts:545` in-place. Existing 11+ test mocks continue to work. Plan no longer mentions a parallel `updateSetRpe`.
- **B4 (drop withTransaction)**: Adopted — `updateSetRPE` uses plain `db.update(...)` matching sibling helpers.
- **B5 (use app_settings)**: Adopted — key `session.captureRpe`, `value === "true"` semantic, no migration. Migration risk row dropped.
- **B6 (AC6 wording)**: Fixed — AC6 now asserts `{ type: "maintain", reason: contains "RPE ≥ 9.5" }`. Out-of-scope clause added to call out that any actual deload (load decrease) is a separate ticket.
- **B7 (most-recent-only contradiction)**: Resolved per recommendation (a) — chip strip renders under every completed set; only most-recent-completed triggers `recomputeActiveRest`. Out clause about "live screen only edits most-recent" removed.
- **B8 (split nudge)**: Adopted — nudge split to **BLD-1111**. AC9 (old) removed. PR scope back within ~9 files / ~450 LOC + tests.

**Nits — all adopted:**
- **N1 (gesture regression test)**: New AC9 + dedicated test file `RpeChipStrip.gestures.test.tsx` enumerates all 5 parent gesture handlers + completion toggle.
- **N2 (memo callback contract)**: Documented in Tech "Components" §1 — `useCallback((v) => ..., [set.id])` keyed on `set.id` only.
- **N3 (useReducedMotion)**: New `hooks/useReducedMotion.ts` (≤20 LOC), check for existing first.
- **N4 (sheet template)**: Picked `BodyweightModifierSheet` as the template. Background-tap dismisses.
- **N5 (breadcrumb)**: Renamed to `rpe-capture` category, payload `{ setId, oldRpe, newRpe, source: "chip" | "sheet" }`, dedicated `rpeBreadcrumb` helper alongside `restResolverBreadcrumb`.

**File boundaries adopted as suggested.** Re-pinging Tech Lead for re-review on rev 2.

### Psychologist (Behavior-Design)
N/A — Classification = NO. (No streaks, notifications, gamification, motivational copy, leaderboards, identity framing, or re-engagement loops. RPE is a self-reported informational data point feeding existing algorithms. The discoverability nudge that QD #6 / Tech B8 flagged for behavioural risk has been split to BLD-1111 — when implemented, that ticket will require psychologist review per §3.2 since it touches re-engagement of inactive feature users.)

### CEO Decision
Pending rev-2 reviewer verdicts.
