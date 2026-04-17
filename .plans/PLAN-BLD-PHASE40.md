# Feature Plan: Workout Share Cards (Phase 40)

**Issue**: BLD-244
**Author**: CEO
**Date**: 2026-04-17
**Status**: IN_REVIEW (v2 — addressing QD + TL feedback)

## Problem Statement

When users complete a workout, they can share a text summary. This is plain and unengaging — text gets lost in social feeds and messaging apps. Users who want to celebrate their workouts or track progress visually have no way to generate a branded, attractive workout summary image.

Visual share cards are a standard feature in fitness apps (Strava, Nike Run Club, Peloton) because they:
1. Let users celebrate achievements with friends
2. Provide organic word-of-mouth marketing
3. Make the app feel polished and "complete"

## User Stories

- As a user who just finished a workout, I want to share an attractive image card of my session stats so that my friends can see my progress
- As a user who hit a new PR, I want the share card to highlight my personal records so that I can celebrate the achievement
- As a user, I want to preview the share card before sharing so that I know what I'm sending

## Proposed Solution

### Overview

Enhance the existing "Share" button on the session summary screen to offer two options via a bottom sheet: "Share as Text" (existing behavior) and "Share as Image" (new). The image path renders a styled card, shows a preview, captures it as PNG via `react-native-view-shot` using `captureRef`, and opens the system share sheet.

### UX Design

**Trigger:** The existing "Share" button on the summary screen opens a `@gorhom/bottom-sheet` (already used in the project) with two options: "Share as Text" (existing behavior) and "Share as Image" (new). This avoids button crowding — no new buttons added to the action row.

**Share Card Layout (portrait, 1080px wide, content-driven height):**
```
       FitForge              |  <- App branding (small, top)
                             |
     +-------------------+   |
     |   PUSH DAY        |   |  <- Session name (large, max 2 lines)
     |   April 17, 2026  |   |  <- Date
     +-------------------+   |
                             |
    45 min     24 sets       |  <- Stats row
    12,400 kg  4/5 stars     |  <- Volume + rating (omitted if no rating)
                             |
    +-------------------+   |
    | New PRs           |   |  <- PR section (only if PRs exist)
    |  Bench Press 100kg|   |
    |  Squat 140kg      |   |
    +-------------------+   |
                             |
    Exercises:               |
    - Bench Press  4x10      |  <- Top exercises (max 6)
    - Incline DB   3x12     |
    - Cable Fly    3x15     |
                             |
          fitforge.app       |  <- Footer branding
```

**Card height is content-driven:** Fixed width of 1080px. Height adapts based on which sections are present (PRs, rating, exercise count). Short sessions produce compact cards; full sessions produce taller ones. No fixed 9:16 aspect ratio — no empty whitespace.

**Color scheme:** Uses the current theme (dark/light) background with MD3 surface colors. For dark-themed cards, a subtle 1px border or thin neutral-color margin is rendered around the card edge so it doesn't bleed into light-background social feeds (Instagram, iMessage).

**Flow:**
1. User taps "Share" on summary screen
2. Bottom sheet opens with "Share as Text" and "Share as Image" options
3. User taps "Share as Image"
4. Loading spinner appears briefly while image generates
5. **Preview modal** opens showing the rendered card with "Share" and "Cancel" buttons
6. User reviews the card — if satisfied, taps "Share"
7. `captureRef` captures the card view as PNG
8. System share sheet opens with the image
9. User selects destination (Instagram, WhatsApp, etc.)
10. Temp file cleaned up after sharing completes or is cancelled

**Accessibility:**
- Single "Share" button maintains clear a11y labeling (no confusion from two "Share" buttons)
- Bottom sheet options have descriptive labels: "Share as Text" and "Share as Image"
- Preview modal is accessible: proper role, close button, focus management
- The share card image itself doesn't need to be accessible (generated image, not interactive UI)
- The existing text share option remains available for screen reader users

### Technical Approach

**Dependencies:**
- `react-native-view-shot` v4.0.3+ — required for Expo SDK 55 compatibility (per BLD-129 learnings). Install via `npx expo install react-native-view-shot`. Native-only (no web support needed). Use `captureRef` API (function-based) instead of ViewShot component wrapper — simpler and works well with modal rendering.

**Architecture:**
- New component: `components/ShareCard.tsx` — a styled, self-contained React component that renders the workout summary card at fixed 1080px width with content-driven height
- New component: `components/ShareSheet.tsx` — bottom sheet with "Share as Text" / "Share as Image" options
- Modify `app/session/summary/[id].tsx` — replace direct share() call with ShareSheet, add preview modal
- Use `expo-sharing` (already installed) to open the share sheet with the captured image
- Use `expo-file-system` (already installed) to write/cleanup the temporary image file

**Implementation details:**
- `ShareCard` component receives session data as props (name, date, duration, sets, volume, PRs, exercises, rating)
- Card renders inside a preview `Modal` at fixed width with content-driven height
- Use `captureRef` to capture the modal content as PNG: `captureRef(ref, { format: 'png', quality: 1.0 })`
- After capture, get the URI and call `Sharing.shareAsync(uri, { mimeType: 'image/png' })`
- Clean up the temp file after sharing via `FileSystem.deleteAsync(uri, { idempotent: true })`
- Loading state: show ActivityIndicator in bottom sheet while generating, then transition to preview modal

**No new DB queries needed** — all data is already loaded on the summary screen.

### Scope

**In Scope:**
- `ShareCard` component with workout stats layout (content-driven height)
- `ShareSheet` bottom sheet component with text/image options
- Preview modal showing card before sharing
- Loading state during image generation
- Image capture via `captureRef` from react-native-view-shot
- System share sheet integration
- Dark and light theme support (with border for dark cards)
- PR highlighting on the card
- Top exercises list (max 6, "and N more" for overflow)

**Out of Scope:**
- Custom card templates/themes (future enhancement)
- Social media API integrations (direct post to Instagram/Facebook)
- Animated cards or video generation
- Card customization by user (color picker, layout options)
- Sharing from history screen or session detail (only from summary screen for now)
- Watermark or attribution link (keep it clean)
- Web platform support (react-native-view-shot is native-only)

### Acceptance Criteria

- [ ] Given a completed workout When user taps "Share" Then a bottom sheet appears with "Share as Text" and "Share as Image" options
- [ ] Given user selects "Share as Text" Then the existing text share behavior is preserved (no regression)
- [ ] Given user selects "Share as Image" Then a loading indicator appears, followed by a preview modal showing the card
- [ ] Given the preview modal is visible When user taps "Share" Then the card is captured as PNG and system share sheet opens
- [ ] Given the preview modal is visible When user taps "Cancel" Then the modal closes with no side effects
- [ ] Given a session with PRs When the share card is generated Then PRs are highlighted in a dedicated section
- [ ] Given a session without PRs When the share card is generated Then the PR section is omitted (no empty space)
- [ ] Given dark mode is active When the share card is generated Then the card uses dark theme colors with a subtle border
- [ ] Given light mode is active When the share card is generated Then the card uses light theme colors
- [ ] Given a session with rating When the share card is generated Then the rating is displayed
- [ ] Given a session with more than 6 exercises When the share card is generated Then only the top 6 exercises are shown with "and N more" text
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] All existing tests pass with no regressions

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Session with no completed sets | "Share as Image" option disabled in bottom sheet |
| Session with no PRs | PR section omitted entirely — card height adjusts |
| Session with 10+ exercises | Show top 6, then "and 4 more" |
| Very long session name | Truncate with ellipsis at 2 lines |
| No rating | Rating row omitted — card height adjusts |
| Sharing cancelled by user | No error, no crash, temp file cleaned up |
| captureRef fails | Show snackbar "Unable to generate image", dismiss preview |
| Bodyweight exercises (no weight) | Show reps only in exercise list |
| Very short session (1 exercise, no PRs, no rating) | Compact card with minimal sections |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| react-native-view-shot Expo SDK compat | Low | High | Use v4.0.3+, install via npx expo install |
| Image quality on different densities | Low | Medium | Use fixed pixel width (1080px), captureRef handles density |
| Large memory usage for image generation | Low | Low | Single capture, cleanup after share |
| captureRef fails on some devices | Low | Medium | Try-catch with user-facing error snackbar |

## Review Feedback

### Quality Director (UX Critique)

**v1 Review (NEEDS REVISION):**
1. **Button Crowding (Major)** — ADDRESSED: Replaced separate "Share Image" button with bottom sheet from existing "Share" button
2. **No Image Preview (Critical)** — ADDRESSED: Added preview modal with Share/Cancel before system share sheet
3. **No Loading State (Major)** — ADDRESSED: Added loading spinner during image generation
4. **Fixed 1080x1920 (Major)** — ADDRESSED: Card height is now content-driven, no fixed aspect ratio
5. **Dark Cards on Light Feeds (Minor)** — ADDRESSED: Added subtle border for dark-themed cards

**v2 Review (APPROVED):** All 6 blocking issues resolved. Non-blocking notes: (1) add Platform.OS !== 'web' guard for Share as Image option, (2) temp file cleanup in finally block, (3) truncate long exercise names in card, (4) preview modal needs accessibilityViewIsModal.

### Tech Lead (Technical Feasibility)

**v1 Review (APPROVED with minor recommendations):**
1. Use `captureRef` instead of ViewShot component — ADOPTED
2. Avoid off-screen rendering, use modal — ADOPTED (preview modal approach)
3. Clarify fixed dimensions — ADOPTED (1080px fixed width, content-driven height)
4. Must use v4.0.3+ and install via `npx expo install` — NOTED in dependencies

### CEO Decision
_Pending QD v2 re-review_
