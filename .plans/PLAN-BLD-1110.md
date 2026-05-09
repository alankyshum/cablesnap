# Feature Plan: Live In-Session RPE Capture

**Issue**: BLD-1110
**Author**: CEO
**Date**: 2026-05-09
**Status**: DRAFT → IN_REVIEW

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
Introduce a single horizontal chip strip beneath each just-completed set in the live session screen. Four chips (Easy / Moderate / Hard / Max) → RPE values 6 / 7.5 / 9 / 10. Long-press any chip → opens a precise picker (6.0 → 10.0 in 0.5 steps). All optional. No nag. Disabled by default; opt-in via Settings.

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
| Tap chip (Easy / Moderate / Hard / Max) | `updateSetRpe(setId, value)` → row updates, rest-timer recomputes, breadcrumb logged |
| Tap selected chip again | Clears RPE → `updateSetRpe(setId, null)` |
| Long-press any chip | Opens `RpeSheet` (bottom sheet) with steppable 6.0 → 10.0 in 0.5 increments + Cancel + Clear |
| Swipe set row | Existing behaviours unchanged (delete, etc.) |

**Visual / a11y**
- Chip colours mirror the existing `lib/rpe.ts` `rpeColor` palette so the strip looks consistent with history badges.
- `accessibilityRole="radiogroup"` on the strip; each chip `accessibilityRole="radio"` with `accessibilityState={{ selected }}`.
- `accessibilityLabel` per chip: "RPE 6, easy" / "RPE 7.5, moderate" / "RPE 9, hard" / "RPE 10, max effort".
- `accessibilityHint`: "Long press to enter a precise value."
- Touch target ≥ 32 dp tall, 56 dp wide. Total strip height capped to keep set row ≤ 88 dp.
- Honour `prefers-reduced-motion` — no slide animation when reduced motion is on; chips just appear.

**Settings**
- New `Capture set RPE during workouts` toggle in `components/settings/PreferencesCard.tsx`. Default **OFF** (preserves current zero-friction default for users who don't want it).
- Helper copy: "Tap a chip after each set to log how it felt. Powers the smart rest timer and progression suggestions."
- Surface a one-time prompt the **first time** a user opens an exercise's history that has any session with non-null RPE → "You've logged RPE before — turn on live RPE capture? [Turn on] [Not now]". Only ever shows once; suppressed if user dismissed it. (Reach: existing RPE users who came in via CSV import. Not behaviour-shaping — purely a discoverability hint, no guilt copy.)

**Empty / error / edge states** — see "Edge Cases" below.

### Technical Approach

**Components**
1. New `components/session/RpeChipStrip.tsx`
   - Props: `value: number | null`, `onChange(v: number | null)`, `disabled?: boolean`, `setId: string`.
   - Pure controlled component; no DB calls.
   - Memoised render (`React.memo`); `onChange` is stable per row.
2. New `components/session/RpeSheet.tsx`
   - Bottom sheet using existing pattern (e.g. `MarkerPickerSheet.tsx` or `BodyweightModifierSheet.tsx` — pick whichever stylistically matches; tech lead decides).
   - 9 steps (6.0, 6.5 … 10.0); active step highlighted.
3. Wire into `components/session/SetRow.tsx` — append `<RpeChipStrip />` under the row when `set.completed && prefs.captureRpe`.

**Service / data**
1. Reuse existing `updateSetRpe` if present, else add a thin wrapper in `lib/db/session-sets.ts`:
   ```ts
   export async function updateSetRpe(setId: string, rpe: number | null): Promise<void>
   ```
   - Validates `rpe` is `null` OR a number in `[0, 10]` rounded to nearest 0.5.
   - Updates `workout_sets.rpe` for the given `id`.
   - Wrapped in `withTransaction`. Emits a `session-rpe` breadcrumb (numeric-only payload — `{setId, oldRpe, newRpe}`).
2. After mutation, the rest-timer hook should re-resolve. The current resolver already reads `rpe` from the most recent completed set; verify cache invalidation. (Tech lead: if there's a memo on rest resolution keyed on set state, ensure RPE change invalidates it.)

**Preferences**
- New key `capture_rpe` in the user-preferences table (or wherever `PreferencesCard` writes). Default `0` (off).
- Boolean accessor + setter in `lib/preferences.ts` (or equivalent).

**Suggestion / rest pipeline (already-wired, just verify)**
- `lib/rm.ts:97` already uses RPE. Re-run unit tests after wiring to confirm the new path doesn't change semantics.
- `lib/rest.ts:122` already buckets RPE. Re-run rest-timer tests.

**Migration**
- None required. `workout_sets.rpe` column already exists. Preferences row may need a new boolean key — handled via existing preferences migration pattern.

**Performance**
- One extra small component per completed set row. Strip is virtualised by the parent FlatList. Estimated cost: negligible (~3 ms per visible row at scroll time).

**Storage**
- One nullable `REAL` per set (already in schema). No additional storage.

## Scope

**In:**
- New chip strip component + bottom-sheet precise picker
- `SetRow.tsx` integration
- `updateSetRpe` service helper + breadcrumb
- New `capture_rpe` preference + Settings toggle
- One-time discoverability nudge for users with prior RPE in history
- Unit tests: RpeChipStrip render + a11y; updateSetRpe validation + DB; integration test that toggling chip recomputes rest timer
- Manual smoke check on Z Fold6 form factor (per recent #533 regression report)

**Out:**
- Mandatory RPE capture (always optional, never blocking)
- RPE-driven AI coaching beyond what `lib/rm.ts` already does (no new ML)
- Push notifications, streaks, badges, "you skipped RPE" reminders
- Voice / wearable RPE entry (could be later)
- Auto-RPE inference from heart rate / Apple Health
- Editing RPE on already-completed sets from the live screen (still done in Detail; chip strip only updates the most-recent-completed set's RPE — confirm in Edge Cases below)

## Acceptance Criteria

1. **AC1 — Toggle gating**: Given `capture_rpe = OFF` (default), When user completes any set in a live session, Then no chip strip is rendered and set row height is unchanged.
2. **AC2 — Chip capture**: Given `capture_rpe = ON` And user has just completed set X, When user taps the "Hard" chip, Then `workout_sets.rpe` for set X is `9.0` And the chip is visually selected And a `session-rpe` breadcrumb is emitted.
3. **AC3 — Toggle off after on**: Given a chip is currently selected, When user taps the same chip again, Then `workout_sets.rpe` is set to `NULL` And no chip is selected.
4. **AC4 — Long-press precise picker**: Given the chip strip is visible, When user long-presses any chip, Then `RpeSheet` opens with 9 steps (6.0–10.0 by 0.5) And the current value is highlighted And selecting a step writes that value to the DB And closes the sheet.
5. **AC5 — Rest timer responsiveness**: Given user completes a set and taps "Max" chip, When the rest countdown is showing, Then within ≤ 200 ms the rest duration recomputes using the new RPE bucket (verifiable via existing `restResolverBreadcrumb` payload showing `rpeBucket` change).
6. **AC6 — Suggestion responsiveness**: Given a session has 3+ sets all RPE ≥ 9.5 for a given exercise, When user opens "Next" suggestion, Then it shows the deload branch (per existing `rm.ts:98` logic — no new logic added).
7. **AC7 — Accessibility**: VoiceOver/TalkBack reads each chip with the labels in the spec. The strip is a single radio-group focus target; chips are individually navigable.
8. **AC8 — Reduced motion**: With reduced motion ON, no slide-in animation; chips appear immediately.
9. **AC9 — One-time nudge**: A user with at least one historical session containing non-null RPE who has `capture_rpe = OFF` sees the discoverability prompt at most once per device. Dismissing it never re-shows it.
10. **AC10 — No regressions**: All existing tests pass; lint clean; typecheck clean.
11. **AC11 — Z Fold6 form factor**: On a 7.6" foldable in unfolded mode, set rows with chip strips do not introduce layout overflow or scroll cutoff (manual smoke + screenshot in PR).

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Set un-completed (user toggles complete OFF) | Chip strip hides; existing RPE value remains in DB so toggling complete back ON restores selection. |
| Set deleted | RPE deleted with row (existing cascade). |
| Set marked complete then immediately user adds another set | Both rows render their own independent chip strip when `capture_rpe = ON`. |
| User taps chip mid-rest-timer | Rest timer recomputes; if new duration < elapsed, show "Rest complete" state immediately (existing behaviour for any duration shrink). |
| Session restored from import with RPE pre-filled | Chip strip shows correct selected chip on first render. |
| Preference toggled mid-session | Strip appears/disappears on the next render of completed rows; existing RPE values preserved in DB. |
| Day-Mode session (no template) | Same behaviour — capture_rpe pref is the only gate. |
| Linked set (circuit / superset) | Each set in the link gets its own strip; current rest-timer linked-scope rules already handle the RPE source. |
| Bodyweight set (no weight) | Strip works identically. |
| Network-offline | Local SQLite write only — no network dependency. |
| RPE value out of range from precise picker (defensive) | Validator clamps to [0,10] and rounds to 0.5; never throws. |
| Large RPE in CSV import (e.g. 11) | Existing import pipeline already validates; out-of-scope for this PR. |
| Live capture during a Form Clip recording | RPE chip tap must not interrupt or reset the active clip recording (cross-feature smoke check). |
| Sheet open + user backgrounds the app | Sheet state preserved or dismissed — pick whichever the existing sheet pattern does (consistency over novelty). |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Chip strip increases set-row height enough to push the "complete" tap target off-screen on small devices | Medium | High (regresses goal #6 zero-friction logging) | Strip height capped at 32 dp, hidden when complete=0, tested on smallest supported device + Z Fold6 |
| Users find the strip noisy / nagging | Medium | Medium | OFF by default; purely opt-in; no notifications |
| RPE adoption stays low and we ship complexity for nothing | Medium | Low | Discoverability nudge + zero implementation cost on the smart features (already wired) |
| Rest timer recomputes too aggressively → flicker | Low | Medium | Debounce or only recompute on chip release; tech lead to spec |
| Long-press conflicts with existing row gestures (swipe to delete, etc.) | Medium | Medium | Tech lead audits SetRow gesture map; long-press fires on chip only, not row; chip's `onLongPress` calls `e.stopPropagation` equivalent if needed |
| Discoverability nudge mistaken for behaviour-shaping | Low | Low | Copy is purely informational ("you've logged RPE before — want to turn on live capture?"); psychologist N/A confirmed |
| New preferences key migration silently fails | Low | Medium | Default to OFF if key missing; migration test |

## Review Feedback

### Quality Director (UX)
_Pending_

### Tech Lead (Feasibility)
_Pending_

### Psychologist (Behavior-Design)
N/A — Classification = NO. (No streaks, notifications, gamification, motivational copy, leaderboards, identity framing, or re-engagement loops. RPE is a self-reported informational data point feeding existing algorithms.)

### CEO Decision
_Pending_
