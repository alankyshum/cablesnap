# Feature Plan: Workout Share Cards (Phase 40)

**Issue**: BLD-244
**Author**: CEO
**Date**: 2026-04-17
**Status**: DRAFT

## Problem Statement

When users complete a workout, they can share a text summary ("🏋️ Push Day Complete! Duration: 45m, Sets: 24, Volume: 12,400 kg"). This is plain and unengaging — text gets lost in social feeds and messaging apps. Users who want to celebrate their workouts or track progress visually have no way to generate a branded, attractive workout summary image.

Visual share cards are a standard feature in fitness apps (Strava, Nike Run Club, Peloton) because they:
1. Let users celebrate achievements with friends
2. Provide organic word-of-mouth marketing
3. Make the app feel polished and "complete"

## User Stories

- As a user who just finished a workout, I want to share an attractive image card of my session stats so that my friends can see my progress
- As a user who hit a new PR, I want the share card to highlight my personal records so that I can celebrate the achievement
- As a user, I want the share card to match the app's visual style so that it looks professional

## Proposed Solution

### Overview

Add a "Share as Image" option to the session summary screen (`app/session/summary/[id].tsx`). When tapped, render a styled card view off-screen, capture it as an image using `react-native-view-shot`, and open the system share sheet with the image.

### UX Design

**Trigger:** New "Share Image" button alongside existing "Share" (text) button on the summary screen's action row.

**Share Card Layout (portrait, 1080×1920 or similar aspect):**
```

       FitForge 💪           │  ← App branding (small, top)
                             │
    ┌───────────────────┐    │
    │   PUSH DAY        │    │  ← Session name (large)
    │   April 17, 2026  │    │  ← Date
    └───────────────────┘    │
                             │
   ⏱ 45 min    💪 24 sets   │  ← Stats row
   🏋️ 12,400 kg  ⭐ 4/5    │  ← Volume + rating
                             │
   ┌───────────────────┐    │
   │ 🏆 New PRs        │    │  ← PR section (only if PRs exist)
   │  Bench Press: 100kg│    │
   │  Squat: 140kg     │    │
   └───────────────────┘    │
                             │
   Exercises:                │
   • Bench Press  4×10       │  ← Top exercises (max 6)
   • Incline DB   3×12      │
   • Cable Fly    3×15      │
                             │
         fitforge.app        │  ← Footer branding

```

**Color scheme:** Uses the current theme (dark/light) background with MD3 surface colors. The card should look good on both dark and light backgrounds.

**Flow:**
1. User taps "Share Image" on summary screen
2. Card renders (hidden from user — off-screen or briefly shown in a modal)
3. `react-native-view-shot` captures the view as PNG
4. System share sheet opens with the image
5. User selects destination (Instagram, WhatsApp, etc.)

**Accessibility:**
- Button has proper a11y label: "Share workout summary as image"
- The share card itself doesn't need to be accessible (it's a generated image, not interactive UI)
- The existing text share option remains available for screen reader users

### Technical Approach

**Dependencies:**
- `react-native-view-shot` — established library for capturing React Native views as images. Well-maintained, works with Expo.

**Architecture:**
- New component: `components/ShareCard.tsx` — a styled, self-contained React component that renders the workout summary card
- Modify `app/session/summary/[id].tsx` — add "Share Image" button, use `ViewShot` ref to capture and share
- Use `expo-sharing` (already installed) to open the share sheet with the captured image
- Use `expo-file-system` (already installed) to write the temporary image file

**Implementation details:**
- `ShareCard` component receives session data as props (name, date, duration, sets, volume, PRs, exercises, rating)
- Render the card in a `ViewShot` wrapper with `options={{ format: 'png', quality: 1.0, width: 1080, height: 1920 }}`
- Position the `ViewShot` off-screen (`position: 'absolute', left: -9999`) during capture, or use a brief modal approach
- After capture, get the URI and call `Sharing.shareAsync(uri, { mimeType: 'image/png' })`
- Clean up the temp file after sharing

**No new DB queries needed** — all data is already loaded on the summary screen.

### Scope

**In Scope:**
- `ShareCard` component with workout stats layout
- "Share Image" button on session summary screen
- Image capture via react-native-view-shot
- System share sheet integration
- Dark and light theme support
- PR highlighting on the card
- Top exercises list (max 6)

**Out of Scope:**
- Custom card templates/themes (future enhancement)
- Social media API integrations (direct post to Instagram/Facebook)
- Animated cards or video generation
- Card customization by user (color picker, layout options)
- Sharing from history screen or session detail (only from summary screen for now)
- Watermark or attribution link (keep it clean)

### Acceptance Criteria

- [ ] Given a completed workout When user taps "Share Image" Then a styled PNG image is generated with session stats
- [ ] Given a session with PRs When the share card is generated Then PRs are highlighted in a dedicated section
- [ ] Given a session without PRs When the share card is generated Then the PR section is omitted (no empty space)
- [ ] Given dark mode is active When the share card is generated Then the card uses dark theme colors
- [ ] Given light mode is active When the share card is generated Then the card uses light theme colors
- [ ] Given the share image is generated When the system share sheet opens Then the user can share to any installed app
- [ ] Given a session with rating When the share card is generated Then the rating stars are displayed
- [ ] Given a session with more than 6 exercises When the share card is generated Then only the top 6 exercises are shown with "and N more" text
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] All existing tests pass with no regressions

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Session with no completed sets | Share Image button disabled (same as Save as Template) |
| Session with no PRs | PR section omitted entirely |
| Session with 10+ exercises | Show top 6, then "and 4 more" |
| Very long session name | Truncate with ellipsis at 2 lines |
| No rating | Rating row omitted |
| Sharing cancelled by user | No error, no crash |
| react-native-view-shot fails | Show snackbar "Unable to generate image" |
| Bodyweight exercises (no weight) | Show reps only in exercise list |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| react-native-view-shot compatibility with Expo SDK | Low | High | Library is well-tested with Expo; verify in dev build |
| Image quality on different screen densities | Low | Medium | Use fixed pixel dimensions (1080×1920) regardless of device |
| Large memory usage for image generation | Low | Low | Single image capture, cleanup after share |
| Off-screen rendering flicker | Medium | Low | Use absolute positioning off-screen, or capture in a modal |

## Review Feedback

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)
**Verdict: APPROVED** (with minor recommendations)

- **Feasibility**: Yes — all core APIs exist. `react-native-view-shot` (v4.0.3+) for capture, `expo-sharing` and `expo-file-system` already installed.
- **Architecture fit**: Compatible. No new DB queries, no refactoring needed. Adds a parallel image share flow alongside existing text share.
- **Effort**: Small-Medium (~2 files, ~250–350 lines)
- **Risk**: Low
- **New dependency**: `react-native-view-shot` — justified, must install via `npx expo install`
- **Concerns (minor)**:
  1. Off-screen rendering (`left: -9999`) may fail on some Android devices — recommend brief modal or opacity:0 instead
  2. Fixed 1080×1920 requires explicit width/height styles on the ShareCard component
  3. Must add `Platform.OS !== 'web'` guard — react-native-view-shot is native-only
- **Recommendations**: Use `captureRef` API over `ViewShot` component; use theme tokens from `constants/theme.ts` (no hardcoded colors)

### CEO Decision
_Pending reviews_
