# Feature Plan: Per-Muscle Volume Landmarks with Customization

**Issue**: BLD-TBD (Phase 65)
**Author**: CEO
**Date**: 2026-04-20
**Status**: APPROVED

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
  - Below MEV: `surfaceVariant` color with dashed/striped fill pattern — clearly visible but visually "weaker"
  - MEV to MRV (optimal zone): `primary` color, solid fill — productive training
  - Above MRV: amber/warning color (NOT `error` red — overreaching is sometimes intentional) — potential overreaching
- **No per-muscle landmark lines** — color-coding alone communicates zone status (removes visual clutter per UX review C-2). MEV/MRV numbers shown on tap in the row detail area
- Tapping a muscle row still shows the weekly trend chart (existing behavior preserved) plus MEV/MRV values as text labels
- Non-color indicators satisfy WCAG 1.4.1: dashed fill pattern for below-MEV bars differentiates from solid optimal bars for color-blind users

**Customize Targets (new — two-level navigation per UX review C-1):**
- A small "Customize" button/icon at the top of the volume chart
- Opens a bottom sheet with a **tappable list** of muscle groups, each row showing: "`Chest: MEV 10 / MRV 22 ›`"
- Tapping a muscle row **expands inline** to show that muscle's MEV and MRV numeric steppers + Reset button (max 3 interactive elements per screen state)
- Only one muscle can be expanded at a time (accordion pattern)
- "Reset All to Defaults" button at the top of the sheet
- Changes saved when the sheet closes (debounced, not on every tap)
- All inputs are numeric steppers (integer sets, min 0, max 50)
- One-hand friendly: large touch targets, numeric keyboard only
- Small caption below defaults: "Based on RP hypertrophy guidelines"

**Status Summary (new, lightweight):**
- Below the bar chart, a one-line summary: "3 muscles under MEV · 1 muscle over MRV" 
- Tapping the summary **highlights** the relevant muscles (background pulse/flash) and auto-selects the first one to show its trend (no scrolling — avoids nested scroll conflicts per UX review M-4)

**Accessibility:**
- Each bar's a11y label includes: "[Muscle]: [N] sets, [below MEV / in optimal range / above MRV]"
- Non-color zone indicators (dashed vs solid bar fill) for color vision deficiency (WCAG 1.4.1)
- Customize sheet: all inputs labeled, numeric keyboard
- Touch targets: minimum 48dp maintained

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
- `VolumeBarChart.tsx`: Color-code each bar based on its zone (dashed fill for below-MEV, solid primary for optimal, amber for above-MRV)
- `VolumeBarChart.tsx`: Remove global MEV/MRV vertical dashed lines (color-coding replaces them)
- `MuscleVolumeSegment.tsx`: Add "Customize" button, render `VolumeLandmarksSheet`
- New `VolumeLandmarksSheet.tsx`: Bottom sheet with two-level muscle group list (accordion expand for individual editing)

### Scope

**In Scope:**
- Evidence-based default volume landmarks per muscle group
- Color-coded bars with non-color indicators (under/optimal/over zones)
- User customization of landmarks via two-level bottom sheet
- Volume status summary line with highlight interaction
- Persistence of custom landmarks in app_settings

**Out of Scope:**
- MAV (Maximum Adaptive Volume) — keeping it simple with just MEV/MRV
- Automatic volume recommendations based on training history
- Integration with template editor (suggesting set counts)
- Weekly volume periodization / mesocycle planning
- Per-exercise volume tracking (only per-muscle-group)

### Acceptance Criteria

- [ ] Given the user opens Progress > Muscles, When they view the bar chart, Then each muscle bar is color-coded: surfaceVariant+dashed below MEV, solid primary in MEV-MRV range, amber/warning above MRV
- [ ] Given the user views the chart, Then no global MEV/MRV vertical lines are shown (color-coding communicates zones); MEV/MRV values are visible as text when a muscle row is tapped
- [ ] Given the user taps "Customize", When the landmarks sheet opens, Then muscle groups are shown as a tappable list with current MEV/MRV values displayed per row
- [ ] Given the user taps a muscle in the customize sheet, When the row expands (accordion), Then MEV and MRV numeric steppers and a Reset button are shown (max 3 interactive elements)
- [ ] Given the user changes a muscle's MEV to 12, When they close the sheet, Then the chart immediately reflects the new landmark and persists across app restarts
- [ ] Given the user taps "Reset" on a customized muscle, Then it reverts to the evidence-based default
- [ ] Given a muscle has 0 sets this week, When viewing the chart, Then the bar is absent or minimal and the status shows "below MEV"
- [ ] Given accessibility is enabled, When focusing on a muscle bar, Then VoiceOver reads "[Muscle]: [N] sets, [volume status]"
- [ ] Given the app_settings contains malformed JSON for volume_landmarks_custom, When the volume screen loads, Then it falls back to defaults without crashing (try/catch around JSON.parse)
- [ ] Given the chart calculates maxSets for the x-axis, Then it uses the maximum MRV across all displayed muscles (not a flat 20)
- [ ] PR passes all existing tests with no regressions
- [ ] No new lint warnings or TypeScript errors

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| User has no workout data for the week | Chart shows empty state, no landmarks needed |
| User sets MEV > MRV (invalid) | Prevent: MEV input capped at MRV-1, MRV input floored at MEV+1 |
| User sets MEV=0, MRV=0 | Allow MEV=0 (some muscles don't need direct work). MRV minimum is 1 |
| User sets MEV = MRV | Allow it — show hint "Your optimal zone is very narrow" |
| "full_body" muscle group | Use generic defaults (10/20), note that full_body is an aggregate category |
| 50+ sets for a muscle (extreme) | Bar extends beyond chart, colored as amber/warning, no visual break |
| User has customized landmarks then app updates defaults | User customizations preserved, only non-customized muscles get new defaults |
| Malformed JSON in app_settings | JSON.parse wrapped in try/catch, falls back to all defaults without crash |
| MuscleGroup enum changes in future | Partial<Record> pattern: unknown stored keys silently ignored, new groups get defaults |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Incorrect evidence-based defaults | Low | Medium | Cite sources, allow user customization |
| Color changes confuse existing users | Low | Low | Use subtle color differences, keep existing layout intact |
| Performance regression from per-bar landmark calculations | Very Low | Low | Simple lookup table, no complex computation |

## Review Feedback

### UX Designer (Design & A11y Critique)
**Verdict: APPROVED** (2026-04-20, re-reviewed after revision)

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
**Verdict: APPROVED** (2026-04-20)

**Architecture fit**: Excellent. All proposed patterns (app_settings KV, bottom sheet, hook extension) already exist. No new dependencies. Additive changes only — no refactoring required.

**Velocity assessment**: Well-scoped for a single PR cycle. ~6-8 files, ~300-400 lines. Low risk.

**Technical concerns (all minor):**
1. Per-bar landmark rendering is architecturally different from current global overlay lines — needs per-row marker dots/ticks instead of spanning lines. (Aligns with UX C-2.)
2. `back` vs `lats` have identical defaults (MEV:10, MRV:25) — sports science should confirm if these should differ.
3. `maxSets` scaling must change from `Math.max(...sets, MRV=20)` to `Math.max(...sets, ...allMrvValues)`. (Aligns with QD concern #1.)

**Simplification**: Cut the status summary line from v1 — color-coded bars already communicate volume status. Ship as fast follow if users request it.

**Performance**: No concerns. Static lookup table, single SQLite read on mount, negligible per-row color comparison.

### CEO Decision
**APPROVED** (2026-04-20)

All three reviewers approved. UX Designer confirmed the revised two-level navigation, non-color indicators, and amber warning color address all critical/major concerns. QD confirmed regression risks are manageable with the specified acceptance criteria additions (try/catch JSON.parse, dynamic maxSets). Tech Lead confirmed excellent architecture fit with existing patterns.

Proceeding to implementation.
