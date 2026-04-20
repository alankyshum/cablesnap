# Feature Plan: Per-Muscle Volume Landmarks with Customization

**Issue**: BLD-TBD (Phase 65)
**Author**: CEO
**Date**: 2026-04-20
**Status**: DRAFT

## Problem Statement

The Muscle Volume view (`Progress > Muscles`) currently displays weekly set counts per muscle group with **hardcoded** MEV=10 and MRV=20 landmark lines for ALL muscles. This is scientifically inaccurate — different muscle groups have very different volume requirements. For example, back can tolerate 25+ sets/week while calves typically max out around 16. Users who rely on these landmarks are getting misleading guidance about whether they're training enough (or too much) for each muscle.

## User's Emotional Journey

**WITHOUT this feature:** User sees "MEV: 10, MRV: 20" for every muscle group. They're doing 18 sets of biceps and think they're fine (below MRV), but they might actually be over-training biceps for their recovery capacity. Conversely, they do 12 sets of back and think they're in the sweet spot, when research suggests back can handle and benefit from much more. The flat landmarks create a false sense of precision.

**AFTER this feature:** User sees muscle-specific landmarks that match the training science literature. They can customize these based on their experience and recovery. The volume chart becomes genuinely actionable: "I'm under my MEV for side delts — I should add a set or two next week." The color-coded status makes it scannable in 2 seconds.

## User Stories

- As a gym-goer reviewing my weekly volume, I want to see **accurate volume landmarks per muscle group** so I can make informed decisions about whether to add or remove sets.
- As an experienced lifter, I want to **customize my volume targets** per muscle group because my recovery capacity differs from population averages.
- As a user scanning my progress quickly, I want **color-coded volume status** so I can tell at a glance which muscles need more or less work.

## Proposed Solution

### Overview

Replace the hardcoded MEV=10/MRV=20 with evidence-based per-muscle defaults and add user customization. Enhance the UI with color-coded status indicators for at-a-glance scanning.

### UX Design

**Muscle Volume Bar Chart (enhanced):**
- Each bar is color-coded based on volume zone:
  - Below MEV: `outline` color (muted) — under-stimulating
  - MEV to MRV (optimal zone): `primary` color — productive training
  - Above MRV: `error`/warning color — potential overreaching
- MEV and MRV landmark lines are now per-muscle (positioned differently for each bar)
- Tapping a muscle row still shows the weekly trend chart (existing behavior preserved)

**Customize Targets (new):**
- A small "Customize" button/icon at the top of the volume chart
- Opens a bottom sheet with a list of muscle groups
- Each muscle shows: MEV input field | MRV input field | Reset to default button
- Changes are saved immediately (optimistic update)
- All inputs are numeric steppers (integer sets, min 0, max 50)
- One-hand friendly: large touch targets, numeric keyboard only

**Status Summary (new, lightweight):**
- Below the bar chart, a one-line summary: "3 muscles under MEV · 1 muscle over MRV" 
- Tapping the summary scrolls/highlights the relevant muscles

**Accessibility:**
- Each bar's a11y label includes: "[Muscle]: [N] sets, [below MEV / in optimal range / above MRV]"
- Customize sheet: all inputs labeled, numeric keyboard

### Technical Approach

**1. Default Volume Landmarks Data (`lib/volume-landmarks.ts` — new file):**

```typescript
type VolumeLandmarks = { mev: number; mrv: number };

// Evidence-based defaults (per Dr. Mike Israetel / RP guidelines, rounded)
const DEFAULT_LANDMARKS: Record<MuscleGroup, VolumeLandmarks> = {
  chest:      { mev: 10, mrv: 22 },
  back:       { mev: 10, mrv: 25 },
  shoulders:  { mev: 8,  mrv: 22 },
  biceps:     { mev: 8,  mrv: 22 },
  triceps:    { mev: 6,  mrv: 18 },
  quads:      { mev: 8,  mrv: 20 },
  hamstrings: { mev: 6,  mrv: 16 },
  glutes:     { mev: 4,  mrv: 16 },
  calves:     { mev: 8,  mrv: 16 },
  core:       { mev: 6,  mrv: 16 },
  forearms:   { mev: 4,  mrv: 14 },
  traps:      { mev: 6,  mrv: 18 },
  lats:       { mev: 10, mrv: 25 },
  full_body:  { mev: 10, mrv: 20 },
};
```

**2. User Customization Storage:**
- Use `app_settings` table (existing key-value store)
- Key: `volume_landmarks_custom`
- Value: JSON string of `Partial<Record<MuscleGroup, VolumeLandmarks>>`
- Only stores overrides — falls back to defaults for non-customized muscles

**3. Hook Enhancement (`hooks/useMuscleVolume.ts`):**
- Load custom landmarks from app_settings on mount
- Merge with defaults
- Expose `landmarks: Record<MuscleGroup, VolumeLandmarks>` in return value
- Add `saveLandmark(muscle, landmarks)` function
- Add `resetLandmark(muscle)` function

**4. UI Changes:**
- `VolumeBarChart.tsx`: Replace hardcoded MEV/MRV with per-row landmarks from hook
- `VolumeBarChart.tsx`: Color-code each bar based on its zone
- `MuscleVolumeSegment.tsx`: Add "Customize" button, render `VolumeLandmarksSheet`
- New `VolumeLandmarksSheet.tsx`: Bottom sheet with per-muscle target editing

### Scope

**In Scope:**
- Evidence-based default volume landmarks per muscle group
- Color-coded bars (under/optimal/over zones)
- Per-muscle MEV/MRV landmark lines on chart
- User customization of landmarks via bottom sheet
- Volume status summary line
- Persistence of custom landmarks in app_settings

**Out of Scope:**
- MAV (Maximum Adaptive Volume) — keeping it simple with just MEV/MRV
- Automatic volume recommendations based on training history
- Integration with template editor (suggesting set counts)
- Weekly volume periodization / mesocycle planning
- Per-exercise volume tracking (only per-muscle-group)

### Acceptance Criteria

- [ ] Given the user opens Progress > Muscles, When they view the bar chart, Then each muscle bar is color-coded: muted below MEV, primary in MEV-MRV range, warning/error above MRV
- [ ] Given the user views the chart, When muscle-specific landmarks differ (e.g., back MRV=25 vs calves MRV=16), Then the MEV/MRV dotted lines are positioned correctly per bar (not flat across all bars)
- [ ] Given the user taps "Customize", When the landmarks sheet opens, Then each muscle group shows current MEV and MRV values with numeric inputs
- [ ] Given the user changes a muscle's MEV to 12, When they close the sheet, Then the chart immediately reflects the new landmark and persists across app restarts
- [ ] Given the user taps "Reset" on a customized muscle, Then it reverts to the evidence-based default
- [ ] Given a muscle has 0 sets this week, When viewing the chart, Then the bar is absent or minimal and the status shows "below MEV"
- [ ] Given accessibility is enabled, When focusing on a muscle bar, Then VoiceOver reads "[Muscle]: [N] sets, [volume status]"
- [ ] PR passes all existing tests with no regressions
- [ ] No new lint warnings or TypeScript errors

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| User has no workout data for the week | Chart shows empty state, no landmarks needed |
| User sets MEV > MRV (invalid) | Prevent: MEV input capped at MRV-1, MRV input floored at MEV+1 |
| User sets MEV=0, MRV=0 | Allow MEV=0 (some muscles don't need direct work). MRV minimum is 1 |
| "full_body" muscle group | Use generic defaults (10/20), note that full_body is an aggregate category |
| 50+ sets for a muscle (extreme) | Bar extends beyond MRV line, colored as warning, no visual break |
| User has customized landmarks then app updates defaults | User customizations preserved, only non-customized muscles get new defaults |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Incorrect evidence-based defaults | Low | Medium | Cite sources, allow user customization |
| Color changes confuse existing users | Low | Low | Use subtle color differences, keep existing layout intact |
| Performance regression from per-bar landmark calculations | Very Low | Low | Simple lookup table, no complex computation |

## Review Feedback

### UX Designer (Design & A11y Critique)
**Verdict: NEEDS REVISION** (2026-04-20)

**Cognitive load**: Feature reduces cognitive load overall — color-coded bars replace mental number-comparison. Mental model is compatible. Good.

**Critical issues (must fix before approval):**
1. **C-1: Customize sheet has 28 inputs** — 14 muscles × 2 fields is overwhelming in a bottom sheet. Use two-level navigation (muscle list → expand/drill into individual muscle) or collapsible region groups.
2. **C-2: Per-muscle landmark lines create visual noise** — vertical dashed lines can't work per-muscle. Remove them entirely (color-coding communicates zone) or show ticks only on selected muscle's row.

**Major issues (should fix):**
- M-1: Color-coding alone violates WCAG 1.4.1 — add non-color differentiator (icon/pattern) for color-blind users
- M-2: `colors.error` for above-MRV is emotionally wrong — use amber/tertiary, not red. Overreaching is intentional in some programs
- M-3: `outline` color for below-MEV bars too invisible — use `surfaceVariant` or primary@30% opacity
- M-4: Summary tap "scrolls to muscles" but FlatList has scrollEnabled=false — use highlight/flash instead

**Recommendations:** Add "Reset All" button, show evidence source caption, save-on-close instead of immediate, handle MEV=MRV edge case.

### Quality Director (Release Safety)
**Verdict: APPROVED** (2026-04-20)

**Regression risks identified:**
1. `maxSets` calculation in `useMuscleVolume.ts` must change from flat `MRV=20` floor to `max(allMrvValues)` — bars will overflow if this is missed.
2. `VolumeBarChart.tsx` landmark lines change from global vertical dashed lines to per-row indicators — significant visual refactor.
3. `MuscleVolumeSegment.tsx` changes are additive (new button + sheet) — low regression risk.

**Required additions to acceptance criteria:**
- [ ] `JSON.parse()` of `app_settings.volume_landmarks_custom` MUST be wrapped in try/catch with fallback to defaults (crash prevention).
- [ ] `maxSets` must use the maximum MRV across all displayed muscles, not a flat 20.

**Test budget:** ~97 remaining (1703/1800). Estimate 8-12 new tests needed — keep parameterized, don't test each muscle group individually. All 15 existing muscle volume tests must pass.

**Data integrity:** Partial override pattern is sound. Import/export will work automatically via existing `app_settings` export. No schema migration needed.

**Security:** No concerns. No PII, no external APIs, no credentials.

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
