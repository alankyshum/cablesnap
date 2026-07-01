# Session / Set-Logging Screen — Friction & Cognitive-Load Audit

**Date**: 2026-06-28  
**Auditor**: ux-designer (BLD-2154)  
**Scope**: `app/session/[id].tsx`, `app/day-session/[id].tsx`, `components/session/*`  
**Context**: Follows masonry redesign of Settings screen (BLD-2028). Session screen has not had a dedicated friction pass and now hosts 51 components.  
**Product goal reference**: "Zero friction set logging — the session screen is the most critical UX; it must feel instant and intuitive."

---

## Executive Summary

The session screen is functionally rich but suffers from significant cognitive-overload risk on the primary set-logging path. The core loop (log weight → log reps → check set) is well-engineered (3 taps minimum), but it is obscured by a dense secondary affordance layer that competes visually for attention. Seven P0/P1 findings are filed below. The most critical issues are: (1) persistent per-row secondary affordances displayed before they are relevant, (2) the `+ Add pinned note` prompt permanently visible in every group header even when the user has no intent to add a note, and (3) the `Last:` / `Next:` row rendering full inline confirmation dialogs for what should be a tap-to-fill action.

**Behavior-design flag summary**: Findings marked `Y` touch gamification, motivational framing, or habit loops and require psychologist review before implementation.

---

## Prioritized Findings Table

| # | Severity | Finding | Screen / Component | Proposed fix | Behavior-design? |
|---|----------|---------|-------------------|--------------|-----------------|
| 1 | **P0** | Cable variant chips (`Tap to set variant`) rendered on every set row before completion — adds ~32–40dp of secondary chrome below every pending set, competing with the primary check target | `SetRow.tsx:644–708`, cable variant footer | Progressively disclose: collapse variant footer behind a single inline chip-placeholder that expands on first tap; or show it only after set completion | N |
| 2 | **P0** | `+ Add pinned note` call-to-action rendered persistently in every group header regardless of user intent, adding ~28dp of visual noise per exercise in an already dense screen | `GroupCardHeader.tsx:291–300` | Remove persistent empty-state CTA; surface pinned note via the existing pin icon affordance only (icon changes filled/outline — already implemented) | N |
| 3 | **P1** | `Last:` tap path routes through a full `Alert.alert` confirmation dialog ("Refill from last session?") before filling — adds 2 taps to what should be a 1-tap smart-fill | `LastNextRow.tsx:149–158` | Remove the confirmation dialog for `Last:` prefill; a swipe/undo affordance is sufficient if accidental fill is a concern. Keep the dialog only for `Next:` (destructive overwrite risk is higher there) | N |
| 4 | **P1** | Header toolbar has dual-gesture coupling: elapsed timer tap starts rest, long-press opens rest settings — but there is no visual affordance distinguishing these two actions. A user who has never long-pressed has no signal the rest-settings modal exists | `SessionHeaderToolbar.tsx:523–555` | Add a subtle `⋯` or gear micro-icon adjacent to the elapsed display, or surface "long press for settings" text on first session via a one-time tooltip | N |
| 5 | **P1** | Video glyph (`video-outline` / `video-check`) and setup photo glyph appear side-by-side on completed cable set rows, each 36×44dp — the two buttons are visually similar and have no text labels, creating identification friction | `SetRow.tsx:531–582` | Add micro-labels ("Form" / "Setup") below each glyph when both are rendered, or replace the paired-icon pattern with a single "media" affordance that opens a bottom-sheet picker | N |
| 6 | **P1** | `PREV` column (width 88dp) displays previous weight/reps at `fontSize: xs (12dp)` in two stacked lines. On first-ever session or after exercise swap, this column reads "—" or is empty — this is the prime real-estate a returning user uses most, and it renders at sub-caption scale | `ExerciseGroupSetTable.tsx:76`, `SetRow.tsx:413–453` | Increase PREV column font to `fontSizes.sm (14dp)` minimum. Consider making the previous value the largest element on the row (not the set-number chip) | N |
| 7 | **P1** | Set-type column (width 36dp, `minHeight: 36`) — tap to cycle set type, long-press for direct selection — but the visual affordance (a plain number or a 28dp chip) has no "interactive" signal. First-time users have no discoverable path to set types | `SetRow.tsx:390–412` | Add a chevron or tap-glyph to the set-type indicator; or surface a one-time "Long-press the set number for options" tooltip on the first session | N |
| 8 | **P2** | `Swap`, `Pin`, and `Note` icons in the group header controls cluster (`controlsCluster`) are 24dp icons with 8dp hitSlop, giving effective touch targets of 40dp × 40dp — 4dp short of the 44dp minimum for gloved/sweaty hands | `GroupCardHeader.tsx:217–255` | Change `iconBtn` padding from `8` to `10` (giving 44dp effective targets), or use `hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}` | N |
| 9 | **P2** | Move-up / move-down buttons (`moveBtn`) are 56×56dp and visible in the header row for every exercise when the "show move buttons" feature is active — large footprint for a rarely-used reordering action that blocks scanning the exercise list | `GroupCardHeader.tsx:183–215` | Hide reorder buttons behind a long-press on the exercise title (already has long-press delete semantics — this is a collision risk), or move them to the toolbox sheet | N |
| 10 | **P2** | `BackfillNoteSuggestion` (session-note backfill chip) appears above the set rows when a backfill candidate exists — in an already dense layout this adds ~60–80dp of unexpected chrome that the user did not request | `GroupCardHeader.tsx:308–321` | Move the backfill suggestion to a non-blocking toast or to the `ExerciseNotesPanel` when the user explicitly opens notes | N |
| 11 | **P2** | `MiniSetEditor` container (`borderLeftWidth: 3`, colored background) expands inline below set rows for advanced set types. The editor has a `TextInput` for next-reps and a `+ mini-set` button, but no visual "close" or "done" affordance — there is no way to collapse back to the normal view without tapping `Collapse` which triggers yet another `Alert.alert` confirmation | `MiniSetEditor.tsx:89–103` | Add an "×" or "Done" control to the MiniSetEditor header row; reduce the collapse alert to a simple confirm chip inline rather than a full native dialog | N |
| 12 | **P2** | Rest timer preset picker (`RestDurationPicker`) is a centred modal overlay with only 4 presets (30s, 60s, 90s, 120s) but the session screen has no "custom" entry path visible in the modal. Users wanting 75s must go to the breakdown sheet via long-press on the timer — multi-step discovery | `SessionHeaderToolbar.tsx:376–471` | Add a "Custom…" chip to the presets row that opens an inline numeric input within the same modal | N |
| 13 | **P2** | `lastNextRow` renders the setup photo as a 16×16dp thumbnail — below the 44dp minimum touch target for `imagebutton` accessibilityRole, and at this size provides almost no visual information | `LastNextRow.tsx:243–258` | Increase thumbnail to 32×32dp; wrap with explicit `minHeight: 44` to meet touch target minimum | N |
| 14 | **P2** | `StackMarkerHint` (cable calibration onboarding) renders full-width between the set rows and the variant footer. The hint text `"Calibrate this gym's stacks in Settings to log cable sets by marker."` is actionable but the hint does not contain a deep-link to Settings — user must navigate manually | `StackMarkerHint.tsx:24–67` | Convert the hint text to a tappable link that routes to the Settings stack-calibration screen. `router.push("/(tabs)/settings")` already used in `RestBreakdownSheet.tsx` for precedent | N |
| 15 | **P2** | `CoachOverlay` renders as an inline banner that pushes the FlatList content down when active — this causes a layout jump on activation that may disorient users mid-set | `CoachOverlay.tsx`, `app/session/[id].tsx:560` | Render the overlay as a floating bottom sheet or as part of `SessionHeaderToolbar` so it does not affect list layout | N |
| 16 | **P2** | `RPE chip strip` (Easy / Moderate / Hard / Max) renders below every completed set when `captureRpe` is enabled. Chip height is 28dp; with `hitSlop: { top: 6, bottom: 6 }` effective target is 40dp — below 44dp minimum | `RpeChipStrip.tsx:87–101` | Increase chip `height` from 28 to 32dp and add `hitSlop: { top: 6, bottom: 6, left: 4, right: 4 }` to reach 44dp | N |

---

## Tap-Count Audit: Core Path

**Path**: Open session → log weight → log reps → tap check → (rest fires automatically) → dismiss rest → log next set

| Step | Current taps | Minimum possible | Gap | Notes |
|------|-------------|-----------------|-----|-------|
| Open session screen | 1 (from app home) | 1 | 0 | OK |
| Set weight via WeightPicker | 2+ (tap up/down stepper) | 2 | 0 | Acceptable; last-session prefill via "Next:" saves to 0 with confirm step |
| Set reps via WeightPicker | 2+ (tap up/down stepper) | 2 | 0 | Same as weight |
| Tap check to complete set | 1 | 1 | 0 | Swipe-right is also available — well designed |
| Rest auto-fires | 0 | 0 | 0 | Auto-start on set complete is correct |
| Dismiss rest | 1 (tap timer) | 1 | 0 | OK |
| Refill from Last session | 2 (tap Last → tap "Refill" in dialog) | 1 | **+1** | **Finding #3** — confirmation dialog adds friction |
| Apply suggested Next values | 2 (tap Next → tap "Apply" in dialog) | 1 | **+1** | Marginal — suggestion could be 1-tap but the confirm is understandable for first use |

**Net**: Core path is 3 taps minimum (weight, reps, check) — acceptable. The prefill path adds +1 unnecessary dialog tap. Smart-default opportunities:

1. **Auto-fill last weight on set creation** (goal item #3): if the previous session's weight/reps are known, populate them on new set add without requiring a tap — user edits if needed, saves if not.
2. **Auto-start rest on check** (goal item #6): already implemented.
3. **"Next" value could be applied on session open** for empty sessions, saving the tap entirely.

---

## Cognitive-Load Assessment

The primary set-logging row contains **7 interactive zones** within a single 48dp row:

1. Set-number chip (tap: cycle type; long-press: options sheet)
2. PREV display (non-interactive, but visually present)
3. Weight picker cell
4. Reps picker cell
5. Check circle (48dp — good)
6. Video glyph (completed sets only, web excluded)
7. Delete button (long-press only, but icon always visible at 22dp)

Below each pending cable set row there is an additional full-width footer band with:
- Attachment chip + mount position chip (or "Tap to set variant" placeholder)
- Pulley pin chip

Below each completed set row with `captureRpe`:
- 4-chip RPE strip (Easy / Moderate / Hard / Max)

For a cable exercise in a session with 3 sets each, one exercise group renders approximately **35 interactive or affordance elements before the user has checked a single set**. This is the primary cognitive-overload vector.

**Elements essential in the primary view during active logging**:
- Weight picker ✅
- Reps/duration picker ✅
- Check circle ✅

**Elements that should be progressively disclosed**:
- Cable variant footer (appears before first set is logged — not needed until user logs or edits)
- RPE strip (only meaningful after completion)
- Video/photo glyphs (only rendered on completed sets already — ✅ correctly gated)
- `+ Add pinned note` persistent prompt (Finding #2)
- Move-up/down buttons (rarely used — Finding #9)

---

## Cable / Bodyweight First-Class Assessment

**Cable**:
- Stack marker quick-pick (BLD-1126) is a major UX improvement — marker pill replaces numeric entry for calibrated gyms. Well placed.
- Pulley pin tracking (BLD-1114) is surfaced as a chip in the variant footer — discoverable but requires an extra tap to change. On first cable session, `PulleyPinPickerSheet` must be opened explicitly — no auto-selection guidance.
- `StackMarkerHint` onboarding text is non-tappable (Finding #14) — the most friction-reducing action (calibrate) requires manual navigation.

**Bodyweight**:
- `BodyweightModifierChip` in the weight column replaces the numeric picker cleanly — good.
- Grip variant footer parallels the cable variant footer — same progressive-disclosure concern applies (Finding #1).
- No `+ Add Warmup` button for bodyweight exercises (correctly gated via `showWarmupButton` — warmup weight generation requires a `suggestion.weight > 0` from the RM module). This is intentional but the absence may confuse users expecting the button.

---

## Visual Hierarchy & Motion

1. **Primary CTA is the check circle** but it is right-aligned, with the smaller (22dp) delete icon immediately to its right. The hierarchy reads left→right as: set-number | prev | weight | reps | **check** | delete. The check circle at 48dp is the largest element, which is correct — but the delete icon's low opacity (35%) is the only visual distinction from the check affordance. Consider adding a low-opacity visual separator or spacing between the check and delete zones.

2. **Exercise title** renders in `colors.primary` with `fontWeight: "700"` — correctly high-hierarchy. However, the `Details` button and controls cluster (swap, pin, note) are inline with the title row 2 at the same visual weight as the title area. The controls cluster should visually recede (use smaller icons, less weight).

3. **`nextHint` banner** (`SessionListHeader`) displays in `secondaryContainer` at `fontWeight: "700"` — appropriate prominence for a "next exercise" hint but it disappears immediately. No motion — static text. The goal item #2 ("communicate via design/motion over text") is not met here.

4. **`PRCelebration`** is positioned above the FlatList (`z`-indexed overlay via `StyleSheet.absoluteFill` implied by `PRCelebration.tsx`). This is the only motion-based feedback element in the screen. The rest of the interaction is entirely text/static.

5. **Rest timer countdown** (`colors.primary`, `fontWeight: "700"`) is appropriately prominent when active. The `restFlashStyle` animation (pulse background tint) is the correct approach. However, the timer is in the navigation header — on a tall phone with a large gesture bar, the timer may be physically far from where the user's thumb is during a set.

---

## Edge / Empty / Error States

| State | Component | Finding |
|-------|-----------|---------|
| First-ever set (no PREV data) | `SetRow.tsx:413–453` | PREV column renders `undefined` or `""` — `numberOfLines={2}` is correctly set but the column renders empty without any visual affordance explaining _why_ (no "No history" microcopy) |
| Very long exercise name | `GroupCardHeader.tsx:157` | Exercise title has no `numberOfLines` clamp — `fontWeight: "700"` and `variant="title"` could overflow into the controls cluster on narrow viewports for exercise names >30 characters |
| Empty session (0 exercises) | `SessionListFooter.tsx` | Footer renders "Add Exercise" / "Finish Workout" / "Cancel Workout" — "Finish Workout" should be disabled or labelled differently ("Nothing to log") when the session is empty |
| Rest timer at 0 after expiry | `SessionHeaderToolbar.tsx:116–125` | "REST DONE ✓" displays for 3s then disappears — good. But there is no persistent ambient signal that rest has completed for users who looked away. A subtle pulsing indicator on the elapsed timer for 5–10s post-rest would help. |
| MiniSetEditor at max (8 mini-sets) | `MiniSetEditor.tsx:207–211` | Error message "Maximum 8 mini-sets reached" renders in `colors.error` — correct. But the `+ mini-set` button becomes `disabled` with `opacity: 0.4` — at 0.4 opacity on a `surfaceVariant` background the disabled text may not meet 3:1 contrast ratio |

---

## Accessibility Assessment

| Element | Implementation | Gap |
|---------|---------------|-----|
| Check circle | `accessibilityRole="checkbox"`, `accessibilityState={{ checked }}`, custom `complete` action — ✅ | — |
| Delete button | `accessibilityRole="button"`, custom `activate` action for screen-reader delete — ✅ | — |
| Set-type cycle | `accessibilityRole="button"`, `accessibilityLiveRegion="polite"` — ✅ | — |
| Cable variant footer | Composite `accessibilityLabel` enumerates both attachment and mount position values — ✅ | — |
| RPE chip strip | `accessibilityRole="radiogroup"` with per-chip `radio` role — ✅ | — |
| Swap / pin / note icons | `accessibilityLabel` present — ✅ | Effective touch targets 40×40dp (Finding #8) |
| Move-up / move-down | `accessibilityState={{ disabled }}` — ✅ | — |
| Previous setup photo thumbnail (LastNextRow) | `accessibilityRole="imagebutton"` present but 16×16dp render size — touch target below 44dp (Finding #13) | |
| `+ Add pinned note` text button | `accessibilityRole="button"` — ✅ | Visual affordance is confusing (appears as content, not control) |
| WeightPicker | Derived `a11yWeightLabel` correctly announces displayed (prefill-aware) value — ✅ | — |
| CoachOverlay | `accessibilityLiveRegion="polite"` on phase changes — ✅ | No announcement on overlay appearing/disappearing |
| Video glyph | `accessibilityRole="button"` with clip state — ✅ | No `accessibilityHint` explaining how to record |

**CVD notes** (from [BLD-1901](../BLD/issues/BLD-1901) precedent): The RPE chip colors (`rpeColor()`/`rpeText()`) are not audited here without screenshot captures, but the 4-chip strip that uses color-coded backgrounds (Easy=green, Hard=orange, Max=red under a typical RPE palette) is a high-risk CVD element — deuteranopia collapses green/orange distinction. This should be added to the next CVD screenshot audit.

---

## Smart-Default / Auto-Fill Opportunities

| Opportunity | Goal item | Implementation path |
|-------------|----------|-------------------|
| Auto-populate last weight + reps on set creation (not just via "Last:" tap) | #3 | In `useSessionActions.handleAddSet`, if a previous session's sets exist for this exercise, pre-populate `weight` and `reps` on the new set row — user sees the values immediately without tapping "Last:" | 
| Suggested (Next) value applied on session open if session has 0 completed sets | #3 | In `useSessionData`, run the suggestion fill pass when groups are first loaded and `completed` count is 0 — eliminates the "Next:" tap for the opening state |
| Auto-rest timer default matched to exercise history | #6 | Already implemented via adaptive rest (BLD-1100). Ensure the adaptive rest is surfaced even when `rest_show_breakdown` is OFF — currently the adaptive chip only shows when the setting is on |

---

## Constraints

- Web viewport audit only (390×844 baseline). iOS/Android-specific layout behaviors (bounce scroll, gesture back swipe, native keyboard avoid) are not covered.
- No screenshot captures were made for this audit (code-read only). Some findings may manifest differently at runtime — screenshot validation recommended for P0/P1 findings before implementation.
- Behavior-design items: all findings above are marked `N`. No findings in this audit touch gamification, streaks, or motivational framing.
