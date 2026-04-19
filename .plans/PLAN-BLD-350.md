# Feature Plan: Template Screen Header Alignment + Swipe-to-Delete UX

**Issue**: BLD-350
**Author**: CEO
**Date**: 2026-04-19
**Status**: DRAFT

## Problem Statement
Owner reports two UX issues on template edit screen (GitHub #199, Samsung Z Fold6, Android 36, v0.9.2):

1. **Header misalignment** — "Exercises (N)" title and action buttons not aligned on the same line
2. **Delete UX redesign** — Owner wants: remove explicit delete button from swipe reveal area, use swipe-to-middle to trigger delete, add discoverability hint so users know about swipe-to-delete, prevent accidental deletions

## User Stories
- As a user editing a template, I want the header to look clean and aligned so the screen feels polished
- As a user managing template exercises, I want to swipe to delete (no visible delete button) so the UI is cleaner
- As a new user, I want to discover that swipe-to-delete exists so I can manage my exercises

## Proposed Solution

### Overview
Two changes to the template edit screen:
1. Fix header row CSS alignment
2. Modify `SwipeToDelete` component to remove the visible trash button, keeping only the swipe gesture with a center threshold for deletion

### Part 1: Header Alignment Fix

**Current code** (`app/template/[id].tsx` line 129):
```
headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }
```

The navigation header (`Stack.Screen options={{ title: template.name }}`) shows the template name. Below it, the in-page header shows "Exercises (N)" with optional STARTER chip. The owner's screenshot suggests these elements are misaligned.

**Fix**: Verify `headerRow` style alignment. Ensure the "Exercises (N)" text and STARTER chip are vertically centered on the same line. Add `flexWrap: "nowrap"` if wrapping is causing misalignment on foldable screens.

### Part 2: Swipe-to-Delete UX Redesign

**Current behavior** (`components/SwipeToDelete.tsx`):
- Swipe past `REVEAL_THRESHOLD` (-80px) → reveals trash button, snaps to -80px
- Swipe past 40% of screen width → auto-deletes with slide-off animation
- `showHint` prop on first item briefly shifts it to hint at swipeability

**New behavior** (per owner request):
- Remove the visible trash `Button` from the swipe reveal area
- Keep the red background as visual feedback during swipe
- Change dismiss threshold from 40% to **50%** ("middle") per owner's request
- Add a "Delete" text label on the red background that appears during swipe (replaces the button)
- Remove the `REVEAL_THRESHOLD` snap point — the row either returns to 0 or deletes
- Keep `showHint` animation on first item for discoverability
- Add a brief toast/snackbar "Swipe left to remove exercises" on first template edit (one-time hint)

**Deletion feedback**:
- When item is swiped past 50%, animate slide-off + show brief "Exercise removed" toast
- No undo needed (owner didn't request it, and exercises can be re-added)

### UX Design
- **Swipe gesture**: Left swipe on exercise row
- **Visual feedback**: Red background with "Delete" text appears proportionally as user swipes
- **Threshold**: 50% of screen width = point of no return
- **Below threshold**: Row springs back to original position
- **Above threshold**: Row slides off screen, item removed
- **Discoverability**: `showHint` animation on first item (already exists), one-time toast hint
- **Accessibility**: VoiceOver/TalkBack users have the existing long-press → edit flow, swipe gestures have `accessibilityActions` for delete

### Technical Approach

**Files to modify:**
1. `components/SwipeToDelete.tsx` — Remove trash button, change threshold to 50%, remove snap point, add "Delete" text label
2. `app/template/[id].tsx` — Fix headerRow alignment, potentially add `flexWrap: "nowrap"`
3. `components/template/TemplateExerciseRow.tsx` — No changes needed (already uses `SwipeToDelete`)

**No new dependencies required.**

### Scope
**In Scope:**
- Fix header alignment on template edit screen
- Remove trash button from SwipeToDelete reveal area
- Change dismiss threshold to 50% screen width
- Add "Delete" text on red background during swipe
- Remove REVEAL_THRESHOLD snap point
- Keep showHint animation

**Out of Scope:**
- Undo functionality for deletions
- Haptic feedback on delete (could be follow-up)
- Changes to other screens that use SwipeToDelete (nutrition, etc.) — keep existing behavior for now, or apply globally if SwipeToDelete is shared

### Acceptance Criteria
- [ ] Given the template edit screen, When viewed on any device, Then "Exercises (N)" title and STARTER chip are aligned on the same line
- [ ] Given a template exercise row, When user swipes left past 50% of screen width, Then the exercise is removed
- [ ] Given a template exercise row, When user swipes left less than 50%, Then the row springs back to original position
- [ ] Given a template exercise row, When user swipes left, Then a red background with "Delete" text is visible (no trash button)
- [ ] Given the first exercise row, When the template screen loads, Then a brief swipe hint animation plays
- [ ] Given SwipeToDelete is used on other screens (nutrition, etc.), When those screens render, Then existing behavior is preserved (OR the new behavior applies globally — TL to decide)
- [ ] PR passes `npx tsc --noEmit` and `npx jest --no-coverage`
- [ ] No new lint warnings

### Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| Foldable screen (Z Fold6) | Header alignment works at all fold positions |
| Very long exercise name | Name truncates, doesn't break alignment |
| Single exercise in template | Swipe-to-delete still works, showHint plays |
| Selection mode active | Swipe disabled (existing behavior, `enabled={!selecting}`) |
| Rapid swipe back-and-forth | No double-delete, gesture handled cleanly |
| RTL layout | Swipe direction respects layout direction |

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| SwipeToDelete used on other screens | Medium | Medium | Check all usages; decide if change is global or template-only |
| Accidental delete without undo | Low | Medium | 50% threshold is intentionally high; owner explicitly requested this UX |
| showHint not visible on fast load | Low | Low | Already has 600ms delay; keep as-is |

## Review Feedback

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
