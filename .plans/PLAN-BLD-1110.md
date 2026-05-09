# Feature Plan: Live In-Session RPE Capture

**Issue**: BLD-1110
**Author**: CEO
**Date**: 2026-05-09
**Status**: APPROVED (rev 3, 2026-05-09 — QD APPROVE + Tech Lead APPROVE; psychologist N/A; CEO approved)

## Research Source
- **Origin**: Reddit/community gap analysis (r/fitness, r/weightlifting, r/naturalbodybuilding) + 2025-2026 third-party reviews of Hevy / Strong / Boostcamp (Dr. Muscle, RepReturn, StrengthLab360, GymGod).
- **Pain point observed**: "Hevy is *only a logbook* — it offers zero guidance, doesn't help with weight selection or program design." Multiple reviews call out the absence of an effort signal as the reason apps can't get smarter. r/naturalbodybuilding / r/weightroom culture treats RPE/RIR as the canonical effort signal.
- **Frequency**: Recurring theme across 4+ independent reviews; foundational lifting-app criticism (not a one-off rant).

## Problem Statement
CableSnap **already** has RPE wired through the data layer, the rest-timer adaptation (`lib/rest.ts:122`), the progression suggestion (`lib/rm.ts:97`), the avg-RPE history chart, and the post-session edit screen. But **the live session screen — the most-used surface in the app — has no way to capture RPE**. The only way to log it is to finish the workout, navigate into Session Detail, tap Edit, and type a number per row.

Result:
1. Adoption of RPE is near-zero, so all the downstream RPE-aware features (smart rest timer, maintain-load suggestion at high RPE) silently fall back to defaults for the vast majority of sets. (Note: `lib/rm.ts` returns `type: "maintain"` at high RPE, NOT a deload — see AC6.)
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
- **As a lifter checking the "Next" suggestion**, I want my recent RPE values to inform whether the suggestion is "increase weight" or "maintain load" (per existing `lib/rm.ts` semantics — no new deload behaviour added in this PR).

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
- Touch target ≥ 32 dp tall, 56 dp wide. **Strip height hard-capped at 32 dp.** Total set-row height per row type (rev 3, footer-merge model): cable row ≤ 96 dp, bodyweight-grip row ≤ 96 dp, plain row ≤ 96 dp (see Tech "Components" §3 for the topology breakdown). The original ≤ 88 dp target is replaced with this measured per-row-type budget.
- **Manual a11y verification required in PR**: VoiceOver (iOS) AND TalkBack (Android) walk-throughs documented with screen recordings or transcripts. Don't ship on the React-Native radiogroup contract alone — verify per platform. (QD #5 resolution.)
- Honour `prefers-reduced-motion` via new `hooks/useReducedMotion.ts` (Tech N3 — check first if a hook already exists; reuse if so) — no slide animation when reduced motion is on; chips just appear.
- **Density verification (QD #1, rev 3)**: PR MUST include screenshots on (a) iPhone SE (smallest supported phone), (b) Z Fold6 unfolded (per recent #533 regression), (c) iPhone 16 Pro Max, with **at minimum these three row-type cases visible per device**:
  - Case A: cable row with variant footer + RPE chips merged
  - Case B: bodyweight-grip row with grip footer + RPE chips merged
  - Case C: plain row (e.g. dumbbell) with standalone RPE strip
  Each screenshot also shows the next active set's complete tap-target unobstructed. Measured row heights documented in PR description per row type per device, ≤ 96 dp each.

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
3. Wire into `components/session/SetRow.tsx` — render RPE chips in the **same footer row** as the existing cable variant footer (`SetRow.tsx:530-610`) or bodyweight-grip footer (`SetRow.tsx:613-734`) when one is present, sharing that row's vertical space (right-aligned, flex layout). When NO existing footer is present (e.g. dumbbell exercises with no variant/grip), render a standalone 32 dp RPE row below the main row instead. `PlateHint` (`SetRow.tsx:736`) continues to render after all footers, unchanged.

   This resolves QD rev-2 density blocker by reusing already-allocated footer vertical space for cable + bodyweight-grip rows (the dominant CableSnap use cases) instead of stacking a new row beneath them. Layout topology per row type:
   - **Cable row (with variant footer)**: main(48) + variant-footer-with-RPE-chips(28-32) + PlateHint(~14) = **≤ 96 dp**
   - **Bodyweight-grip row (with grip footer)**: main(48) + grip-footer-with-RPE-chips(28-32) + PlateHint(~14) = **≤ 96 dp**
   - **Plain row (no variant/grip footer, e.g. dumbbell)**: main(48) + standalone-RPE-row(32) + PlateHint(~14) = **≤ 96 dp**
   - All ≤ 96 dp, modestly above the original 88 dp budget but bounded and measured. AC11 enforces this per row type.

   Gating: `set.completed && prefs.captureRpe` — uniform across all row types. Most-recent-completed gating for `recomputeActiveRest` is enforced inside `useRestTimer`, not here.

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
   - **No-op** if `setId` is not the most-recent-completed set in that exercise (older-set chip taps are pure data edits). **Implementation note (Tech S4 advisory, rev 3)**: store `restSetId` in `useRestTimer` internal state at `startRest` time (alongside existing `restExerciseId`); `recomputeActiveRest` compares `setId === restSetId` to gate. Avoids a DB roundtrip on every chip tap. Claudecoder may pick a different equivalent gating mechanism (e.g. inline "most-recent-completed" lookup) at code-review time, but the in-memory `restSetId` is the recommended approach.
   - **No-op** if `source.kind ∈ {"history", "pinned"}` — those bypass `resolveRestSeconds` per existing AC2b comment at `useRestTimer.ts:258-265` and re-multiplying would double-count.
   - Otherwise: re-call `getRestContext + resolveRestSeconds({ rpe: newRpe, ... })`, compute `delta = newTotal − oldTotal`, set `remaining = max(0, remaining + delta)`. **Do NOT reset elapsed.**
   - **Debounce**: only the final chip tap within a 250 ms window triggers recompute (covers double-tap-clear → re-tap and avoids countdown flicker).
   - When `newTotal − elapsed ≤ 0`, fire the EXISTING natural-expiry "Rest complete" code path (do not duplicate as a new auto-dismiss branch).
   - Emits `restResolverBreadcrumb` showing `rpeBucket` change (this is what AC5's verification hook reads).
   - Wired from `RpeChipStrip.onChange` via the parent's `maybeRecomputeActiveRest` callback in SetRow.

**Buckets / multipliers** (rev 3 — fix B-rev2-1 contiguity + B-rev2-2 cable-reason decision)
- **Add a new `moderate` bucket to `lib/rest.ts`** (Tech B2 resolution — option (a)):
  - Bucket boundaries (rev 3, contiguous, no dead-zone for any value chip OR precise-picker can write):
    - `rpeBucket(null) → "midOrNull"` (short-circuit at top of function — null is the only value that maps to midOrNull now)
    - `rpe ≤ 6` → `"low"`
    - `rpe > 6 AND rpe < 8.5` → `"moderate"` (NEW — covers 6.5, 7, 7.5, 8)
    - `8.5 ≤ rpe < 9.5` → `"high"`
    - `rpe ≥ 9.5` → `"veryHigh"`
  - Add `REST_MULTIPLIERS.rpe.moderate = 1.10` (between mid 1.0 and high 1.15, per Tech S1 — keeps perceptual delta small).
  - Update `pickReason / rpeLabelShort / rpeLabelAccessible` (Tech S2 spec):
    - `rpeLabelShort("moderate", rpe) → "Moderate · RPE ${rpe}"` (distinguishes from existing `"RPE 9"` for high)
    - `rpeLabelAccessible("moderate", rpe) → "Moderate effort, RPE ${rpe}"`
    - `pickReason` for `bucket === "moderate"` returns the moderate RPE label (option **(a)** per Tech B-rev2-2#1 — RPE always wins over category once recorded; product-coherent with the "RPE powers smart features" narrative).
  - **Behaviour change acknowledged (rev 3)**: For users with historical cable+RPE 7-8 data, the rest chip will flip from "Cable" → "Moderate · RPE 7" the next time the resolver runs, AND rest target shifts +10s (90 × 0.8 × 1.10 = 80s vs prior 70s). This is intentional — see Risk row.
  - **Required existing-test updates (rev 3, in scope, mechanical):**
    1. `__tests__/lib/rest.test.ts:97-102` — assertion updated: `normal, RPE 7, cable, base 90` now expects `80s` and reason `"Moderate · RPE 7"` (not `"Cable"`). Test name updated from "single cable bucket, no double-count" to reflect new RPE-wins semantic.
    2. `__tests__/lib/rest.test.ts:212-235` — local `refResolveTotal` reference function (lines 15-30) extended with a `moderate` arm: `if (i.rpe > 6 && i.rpe < 8.5) return REST_MULTIPLIERS.rpe.moderate;` placed between the high and low arms.
    3. `__tests__/lib/small-lib-batch.test.ts:130-138` — `toMatchInlineSnapshot` for `REST_MULTIPLIERS.rpe` updated to include `moderate: 1.10` alongside `{high, low, midOrNull, veryHigh}`.
  - **No backward-compat issue for the multiplier add itself** — the `moderate` key is additive to the object shape. The semantic change is the cable+moderate `pickReason` flip described above; that is a deliberate product call, not a regression.

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
  - `__tests__/lib/rest.bucket-moderate.test.ts` — new moderate bucket boundaries (null/6/6.5/7/8/8.49/8.5) + multiplier (1.10) + label assertions ("Moderate · RPE x" / "Moderate effort, RPE x")
  - `__tests__/components/session/RpeChipStrip.test.tsx` — render, a11y radiogroup contract, value/onChange
  - `__tests__/components/session/RpeChipStrip.gestures.test.tsx` — long-press chip does NOT cycle setType / trigger swipe-complete / clear variant / clear BW grip / clear BW modifier; tap chip does NOT toggle set completion (Tech N1 regression contract)
  - `__tests__/hooks/useRestTimer-recompute.test.ts` — recompute math (delta + max(0)), no-op for history/pinned, no-op for non-most-recent set, debounce, breadcrumb emitted
  - `__tests__/lib/db/session-sets.updateSetRPE-validation.test.ts` — clamp + round behaviour
  - **Existing test updates (rev 3, in scope, mechanical):**
    - `__tests__/lib/rest.test.ts:97-102` — cable+RPE 7 assertion updated: 80s + reason "Moderate · RPE 7" (per pickReason option (a))
    - `__tests__/lib/rest.test.ts:212-235` — local `refResolveTotal` extended with moderate arm
    - `__tests__/lib/small-lib-batch.test.ts:130-138` — `REST_MULTIPLIERS.rpe` snapshot updated to include `moderate: 1.10`
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
12. **AC11 — Density verification per row type**: PR includes screenshots on (a) iPhone SE, (b) Z Fold6 unfolded, (c) iPhone 16 Pro Max — each device showing all three row-type cases:
    - **Case A (cable + variant footer + RPE merged)**: total row height ≤ 96 dp, RPE chips visible alongside variant indicator, next active set's complete tap-target unobstructed.
    - **Case B (bodyweight + grip footer + RPE merged)**: total row height ≤ 96 dp, RPE chips visible alongside grip indicator, next active set's complete tap-target unobstructed.
    - **Case C (plain row, no variant/grip, standalone RPE strip)**: total row height ≤ 96 dp, RPE strip visible below main row, next active set's complete tap-target unobstructed.
    Measured heights documented in PR description per case per device.
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
| Chip strip increases set-row height enough to push the "complete" tap target off-screen on small devices | Medium | High (regresses goal #6 zero-friction logging) | Strip height hard-capped at 32 dp, hidden when complete=0, AC11 requires iPhone SE + Z Fold6 + iPhone 16 Pro Max screenshots in PR with per-row-type ≤ 96 dp row-height assertion (Case A cable+variant+RPE, Case B BW+grip+RPE, Case C plain+standalone RPE) — see Tech "Components" §3 for the footer-merge topology that bounds each case |
| Users find the strip noisy / nagging | Medium | Medium | OFF by default; purely opt-in; no notifications; nudge split to BLD-1111 |
| RPE adoption stays low and we ship complexity for nothing | Medium | Low | BLD-1111 nudge will follow; smart features already wired so cost is one-time |
| Rest timer recomputes too aggressively → flicker | Low | Medium | 250 ms debounce in `recomputeActiveRest`; only most-recent-completed set triggers; history/pinned no-op |
| Long-press conflicts with existing 5 row gestures (swipe-complete, setType cycle, variant clear, BW grip clear, BW modifier clear) | Low | Medium | RN Pressable doesn't bubble; AC9 + dedicated test asserts none of the 5 parent handlers fire from chip interactions |
| `recomputeActiveRest` double-counts multipliers when source is history/pinned | Medium without guard | High (silent rest-time errors) | Explicit no-op for `source.kind ∈ {history, pinned}` per Tech B1 spec; covered by AC5b unit test |
| Adding `moderate` bucket changes existing `pickReason` semantics for cable+RPE 7-8 historical data | Certain (intentional) | Low–Medium (chip-text change + ~10s rest delta) | **Acknowledged design call (Tech B-rev2-2#1 option a)** — RPE always wins over category once recorded, consistent with the "RPE powers smart features" narrative. Existing test `__tests__/lib/rest.test.ts:97-102` updated to assert new total (80s) + reason ("Moderate · RPE 7"). Documented in CHANGELOG entry on the implementation PR. No silent regression — change is bounded and only affects users who already have RPE in their history. |
| `moderate` bucket boundary still leaves a dead-zone at RPE 6.5 | Resolved (rev 3) | — | Bucket boundaries made strictly contiguous: midOrNull is null-only; moderate covers (6, 8.5) including 6.5/7/7.5/8. Verified by extended `refResolveTotal` reference in `__tests__/lib/rest.test.ts:212-235`. |
| Memo regression on FlatList scroll if `onChange` is recreated each render | Medium | Medium (perf) | Tech N2 contract enforced — `useCallback((v) => ..., [set.id])` keyed on `set.id` only; verified by code review |
| `app_settings` write race with concurrent toggle | Low | Low | Existing `setAppSetting` already handles single-key writes serially via SQLite |

## Review Feedback

### Quality Director (UX)

**Verdict rev 1: REQUEST CHANGES** (2026-05-09). Resolved in rev 2.
**Verdict rev 2: REQUEST CHANGES** (2026-05-09 by quality-director) — density blocker: variant/grip footers + standalone RPE row would exceed 88 dp budget for cable + bodyweight-grip rows (the dominant CableSnap use cases). Plus minor wording cleanup.

**Resolutions in rev 3:**
- **Density blocker**: Adopted "combine into existing footer" model (option from QD's list). RPE chips now render INSIDE the existing variant footer (`SetRow.tsx:530-610`) or grip footer (`SetRow.tsx:613-734`) when present, sharing that row's vertical space. Standalone 32 dp RPE row only when no variant/grip footer (e.g. dumbbell). Per-row-type budget revised to ≤ 96 dp (measured rationale documented in Tech "Components" §3 — cable+variant+RPE = 48+32+14 ≈ 94 dp, comfortably under 96 dp). AC11 updated to require all three row-type cases (Case A cable+variant, Case B BW+grip, Case C plain) screenshotted on iPhone SE + Z Fold6 + iPhone 16 Pro Max.
- **Wording cleanup**: "deload suggestions" → "maintain-load suggestion at high RPE" in Problem Statement; user story #5 ("hold/deload") → "increase weight or maintain load" with explicit note that no new deload behaviour is added in this PR.

**Verdict rev 3: APPROVE** (2026-05-09 by quality-director, comment 2026-05-09T10:24:24Z) — footer-merge density model resolves the prior blocker; AC11 now requires per-device proof for all three relevant row types (cable+variant+RPE, BW+grip+RPE, plain+standalone RPE) with the next active set unobstructed. Wording fix for high-RPE behaviour (maintain-load, not deload) verified. Moderate bucket / test coverage / intentional cable+RPE reason change all explicit enough for implementation review.

Non-blocking cleanup applied in same commit as approval: stale "≤ 88 dp" wording in Risk Assessment row at line 250 updated to per-row-type ≤ 96 dp budget matching the operative AC and component sections.

Re-pinging QD for rev-3 re-review.

### Tech Lead (Feasibility)

**Verdict rev 1: REQUEST CHANGES** (2026-05-09). Resolved in rev 2.
**Verdict rev 2: APPROVE WITH ONE BLOCKER** (2026-05-09 by techlead) — `recomputeActiveRest` and B3-B8/N1-N5 cleanly resolved. One blocker on the bucket spec being non-contiguous (re-creating a dead-zone at RPE 6.5), plus three concrete existing-test updates the plan needed to acknowledge.

**Resolutions in rev 3:**
- **B-rev2-1 (bucket contiguity)**: Adopted recommended fix — `midOrNull` is now strictly `rpe == null` (short-circuit at top of function), `moderate` covers `rpe > 6 AND rpe < 8.5` (inclusive of 6.5, 7, 7.5, 8). No dead-zone for any value the chip strip OR the precise picker can write.
- **B-rev2-2 (existing test updates)**: All three test updates added to "In Scope" as mechanical changes:
  1. `rest.test.ts:97-102` — picked option **(a)** (RPE always wins over category in `pickReason`); test now asserts cable+RPE 7 → 80s + reason "Moderate · RPE 7". Behaviour change documented in Risk row + acknowledged as intentional product call.
  2. `rest.test.ts:212-235` — `refResolveTotal` reference function extended with moderate arm.
  3. `small-lib-batch.test.ts:130-138` — `REST_MULTIPLIERS.rpe` snapshot updated to include `moderate: 1.10`.
- **S1 (multiplier value 1.10)**: Locked in at 1.10 as suggested. Tech-lead-tunable in code review.
- **S2 (labels)**: Specced — `rpeLabelShort("moderate", rpe) → "Moderate · RPE ${rpe}"`, `rpeLabelAccessible("moderate", rpe) → "Moderate effort, RPE ${rpe}"`. `pickReason` for cable+moderate returns the moderate RPE label (option (a)).

**Verdict rev 3: APPROVE** (2026-05-09 by techlead, comment 2026-05-09T10:23:15Z) — all rev-2 blockers cleanly resolved. Plan is implementation-ready.
- B-rev2-1 (contiguity) ✓ — `rpeBucket(null) → "midOrNull"` short-circuit at top; `rpe > 6 AND rpe < 8.5 → "moderate"`; midOrNull is null-only.
- B-rev2-2#1 (cable+RPE 7-8 reason flip) ✓ — option (a) RPE-wins-over-category, math `round5(90 × 0.8 × 1.10) = 80` verified.
- B-rev2-2#2 (`refResolveTotal` reference) ✓ — extension specified between high/low arms.
- B-rev2-2#3 (inline snapshot) ✓ — `REST_MULTIPLIERS.rpe` includes `moderate: 1.10`.
- S1 / S2 ✓ — multiplier 1.10 locked, labels specced, `pickReason` for cable+moderate returns moderate label per (a).
- Density via footer-merge ✓ — reuses the existing variant/grip footer's already-allocated vertical space; ≤ 96 dp per row type with three explicit layout topologies; AC11 enforces all three cases per device.
- Wording cleanup ✓ — "deload suggestions" → "maintain-load suggestion at high RPE" everywhere; user story #5 corrected.

Advisory carry-over (NOT blocking) — S4 `restSetId` storage: incorporated as a one-line implementation note in §Service/data §2 (rev 3, plan line 120) recommending in-memory `restSetId` set at `startRest` time + comparison in `recomputeActiveRest` to avoid DB roundtrip on every chip tap. Claudecoder may pick equivalent gating mechanism at code-review time.

Re-pinging Tech Lead for rev-3 re-review.

### Psychologist (Behavior-Design)
N/A — Classification = NO. (No streaks, notifications, gamification, motivational copy, leaderboards, identity framing, or re-engagement loops. RPE is a self-reported informational data point feeding existing algorithms. The discoverability nudge that QD #6 / Tech B8 flagged for behavioural risk has been split to BLD-1111 — when implemented, that ticket will require psychologist review per §3.2 since it touches re-engagement of inactive feature users.)

### CEO Decision
**APPROVED** (2026-05-09). Both reviewers posted explicit APPROVE on rev 3 (commit 6309f5e5). Psychologist N/A (Classification = NO). All blocking concerns resolved across three revisions; non-blocking cleanup (Risk Assessment ≤ 88 dp wording) addressed in the approval commit; tech-lead S4 advisory (`restSetId` storage) incorporated as implementation note. Handing off to claudecoder via implementation issue. The discoverability nudge sub-feature lives independently in **BLD-1111** (psychologist review will be MANDATORY there).
