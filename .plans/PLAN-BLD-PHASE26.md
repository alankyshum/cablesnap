# Feature Plan: Muscle Illustration for Exercises (Phase 26)

**Issue**: BLD-37
**Author**: CEO
**Date**: 2026-04-14
**Status**: APPROVED

## Problem Statement

Users currently see muscle involvement as plain text chips ("chest", "biceps", etc.) on the exercise detail screen. This provides no spatial context — a user unfamiliar with anatomy cannot tell where "lats" or "traps" are on their body, nor can they visualize which muscles to focus on during the exercise.

The board requests a minimalistic human anatomy illustration (front + rear views) that highlights primary muscles in red and secondary muscles in orange, with labeled muscle names grouped underneath. The goal: **users can glance at the diagram and immediately know which muscles to engage.**

## User Stories

- As a gym-goer, I want to see a body diagram with highlighted muscles so I know exactly where to feel the exercise working
- As a beginner, I want visual muscle labels so I can learn anatomy as I train
- As a user reviewing exercises, I want to quickly compare which muscles different exercises target by looking at the diagram

## Proposed Solution

### Overview

Create a reusable `MuscleMap` SVG component that renders two minimalistic human body silhouettes (front view and rear view) with individually colorable muscle regions. Each of the 14 `MuscleGroup` values maps to one or more SVG path regions. Primary muscles are highlighted in a strong color (red/error tone), secondary muscles in a softer color (orange/warning tone), and uninvolved muscles remain neutral/transparent.

This component replaces the current plain-text chip display in the exercise detail screen and can be reused elsewhere (e.g., exercise picker, muscle volume overview).

### UX Design

#### Layout on Exercise Detail Screen
- **Position**: Replace the existing "Primary Muscles" and "Secondary Muscles" chip sections with the new muscle map
- **Layout**: Two body silhouettes side by side (front | rear), centered, occupying roughly 60% of screen width
- **Below the diagrams**: A legend section showing:
  - Red dot **Primary**: Chest, Shoulders (comma-separated muscle names)
  - Orange dot **Secondary**: Triceps, Core (comma-separated muscle names)
- **Color scheme**: Use the app's existing semantic colors adapted for muscle highlighting:
  - Primary muscles: `#D32F2F` (red) in light mode, `#EF5350` in dark mode
  - Secondary muscles: `#F57C00` (orange) in light mode, `#FFB74D` in dark mode
  - Uninvolved muscles: `#E0E0E0` (light grey) in light mode, `#424242` in dark mode
  - Body outline: `#9E9E9E` in light mode, `#616161` in dark mode
- **Sizing**: The diagram should be proportional. Each silhouette roughly 120-140px wide, auto-height to maintain aspect ratio. Total component width adapts to screen size.
- **Accessibility**: Each muscle region must have an `accessibilityLabel` (e.g., "Primary muscle: Chest"). The entire diagram needs a summary label: "Muscle diagram showing primary muscles: Chest, Shoulders; secondary muscles: Triceps"

#### Muscle Group to Body Region Mapping

Each `MuscleGroup` value maps to SVG regions on front and/or rear views:

| MuscleGroup | Front View | Rear View | Notes |
|-------------|-----------|-----------|-------|
| chest | Pectorals | — | |
| shoulders | Front deltoids | Rear deltoids | Visible from both views |
| biceps | Upper arm front | — | |
| triceps | — | Upper arm rear | |
| forearms | Lower arm front | Lower arm rear | Both views |
| core | Abdominals / obliques | — | |
| quads | Front thigh | — | |
| back | — | Mid-back | General back area |
| lats | — | Lat wings | Wider, flanking back |
| traps | — | Upper back / neck | |
| hamstrings | — | Rear thigh | |
| glutes | — | Gluteals | |
| calves | Lower leg front | Lower leg rear | Both views |
| full_body | All regions | All regions | Highlights everything |

#### Interaction
- **No tap interaction** on the muscle diagram itself — it is display-only
- The diagram is purely informational, providing visual context for the exercise

#### Edge Cases: `full_body`
When an exercise has `primary_muscles: ["full_body"]`, ALL muscle regions on both views are highlighted in the primary color. This represents exercises that engage the entire body.

### Technical Approach

#### Architecture

1. **`components/MuscleMap.tsx`** — The main reusable component
   - Props: `primary: MuscleGroup[]`, `secondary: MuscleGroup[]`, `width?: number`
   - Renders two SVG silhouettes side by side via `react-native-svg` (already installed)
   - Dynamically colors paths based on primary/secondary arrays
   - Responsive: scales proportionally based on provided width or container

2. **`components/muscle-paths.ts`** — SVG path data
   - Exports `FRONT_PATHS` and `REAR_PATHS` objects
   - Each key is a `MuscleGroup`, each value is an SVG `d` attribute string (or array of paths for complex regions)
   - Also exports `BODY_OUTLINE_FRONT` and `BODY_OUTLINE_REAR` for the base silhouette
   - Minimalistic style: simplified anatomical shapes, not photorealistic

3. **Integration in `app/exercise/[id].tsx`**
   - Replace the "Primary Muscles" and "Secondary Muscles" chip sections with `<MuscleMap>`
   - Add the legend section below with grouped muscle names

#### SVG Path Design

The SVG paths should be:
- **Minimalistic**: Simple shapes suggesting muscle groups, not detailed anatomy
- **Clean**: Smooth curves, no jagged edges
- **Proportional**: Realistic body proportions (approximately 3:1 height-to-shoulder-width ratio)
- **ViewBox**: Use a consistent viewBox (e.g., `0 0 200 500`) for both front and rear
- **Symmetrical**: Left/right sides mirror each other

Each muscle region is a separate `<Path>` element with:
- A unique key matching the `MuscleGroup` type
- Dynamic `fill` from semantic tokens (`musclePrimary`/`muscleSecondary`/`muscleInactive` in `constants/theme.ts`)
- `fillOpacity` of 0.7 for primary, 0.5 for secondary, 0.15 for uninvolved
- **Dual visual channel for color-blind accessibility**:
  - Primary: `strokeWidth={2}`, `strokeDasharray="none"` (solid)
  - Secondary: `strokeWidth={1}`, `strokeDasharray="4,3"` (dashed)
  - Uninvolved: `strokeWidth={1}`, `strokeDasharray="none"` (solid, neutral)

#### Body Outline

A base body outline (head, torso, arms, legs silhouette) rendered underneath all muscle paths. This provides the "human figure" context even for muscles that are not highlighted.

#### Theme Integration

Use the app's existing `useTheme()` hook from react-native-paper to access dark/light mode. Define muscle highlight colors as semantic constants in `constants/theme.ts` under the `semantic` export with separate light/dark values:
- `musclePrimary`: red tone (light) / lighter red (dark)
- `muscleSecondary`: orange tone (light) / lighter orange (dark)
- `muscleInactive`: light grey (light) / dark grey (dark)
- `muscleOutline`: medium grey (light) / lighter grey (dark)

**No hardcoded hex values in the component** — all colors must reference semantic tokens.

#### Performance

- SVG paths are static data — no runtime computation
- The component is lightweight (just SVG rendering)
- Memoize the component with `React.memo` to avoid re-renders when exercise data has not changed

### Scope

**In Scope:**
- New `MuscleMap` component with front + rear SVG body views
- SVG path data for all 14 muscle groups
- Color coding: primary (red), secondary (orange), uninvolved (grey)
- Legend with grouped muscle names below the diagram
- Integration into exercise detail screen (replace chip sections)
- Dark mode support
- Accessibility labels on muscle regions and diagram
- `full_body` handling (highlight all regions)

**Out of Scope:**
- Tap-to-highlight interaction on the muscle map
- Muscle map on exercise list/picker screen (future enhancement)
- Animated transitions between exercises
- 3D or rotatable body model
- Per-muscle volume data overlay on the diagram
- Custom user body shape/proportions

### Acceptance Criteria

- [ ] Given an exercise with `primary_muscles: ["chest", "shoulders"]` and `secondary_muscles: ["triceps"]`, When the user opens the exercise detail screen, Then the front view shows chest and front deltoids highlighted in red, the rear view shows rear deltoids in red and triceps in orange
- [ ] Given an exercise with `primary_muscles: ["full_body"]`, When the user opens the exercise detail screen, Then ALL muscle regions on both front and rear views are highlighted in the primary color
- [ ] Given an exercise with no secondary muscles, When the user opens the exercise detail screen, Then only primary muscles are highlighted and the legend shows only "Primary" group
- [ ] Given dark mode is enabled, When viewing the muscle diagram, Then colors adapt appropriately (lighter highlight tones, darker background/outline)
- [ ] Given a screen reader is active, When the muscle diagram is focused, Then it announces "Muscle diagram showing primary muscles: [list]; secondary muscles: [list]"
- [ ] The muscle diagram renders correctly on both iOS and Android
- [ ] The diagram scales proportionally on different screen widths (phone portrait, tablet)
- [ ] The legend below the diagram lists muscle names grouped by Primary and Secondary with appropriate color indicators
- [ ] PR passes all existing tests with no regressions
- [ ] TypeScript compiles with zero errors

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Exercise has only primary muscles (no secondary) | Only primary muscles highlighted; legend shows only "Primary" section |
| Exercise has empty `primary_muscles` array | Neutral silhouettes shown with "No muscle data" in the legend |
| Exercise has `full_body` as primary | All regions highlighted in primary color on both views |
| Exercise has `full_body` + specific secondary | All regions primary; secondary list still shown in legend for information |
| Exercise has muscles visible on only one view | The other view shows no highlights (just the neutral silhouette) |
| Very narrow screen (less than 300px) | Diagrams stack vertically (front on top, rear below) instead of side-by-side |
| Large tablet screen | Diagrams scale up proportionally, capped at a max width |
| Theme changes while viewing | Diagram re-renders with updated colors immediately |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| SVG paths look amateurish | Medium | Medium | Use reference anatomy diagrams for proportions; keep minimalistic style; iterate on design |
| SVG rendering performance on low-end devices | Low | Low | Paths are static, react-native-svg is optimized; benchmark on Android emulator |
| Muscle regions hard to distinguish on small screens | Medium | Medium | Use opacity + stroke to differentiate; test at 320px width |
| react-native-svg compatibility issues on web | Low | Low | Already installed and working in the project; web is secondary platform |

### Dependencies
- `react-native-svg` — already installed (v15.15.4)
- Existing `MuscleGroup` type and `MUSCLE_LABELS` mapping
- Exercise detail screen (`app/exercise/[id].tsx`)

## Review Feedback

### Quality Director (UX Critique)
**Verdict**: NEEDS REVISION
**Reviewed at**: 2026-04-14T02:26:00Z

~~**Rev 1 Verdict**: NEEDS REVISION (3 Critical issues)~~

**Rev 2 Verdict**: APPROVED (2026-04-14T02:36:00Z)

All 3 Critical items resolved:
1. ✅ Color-blind: Dual visual channels (stroke width + dash pattern) supplement color
2. ✅ accessibilityRole="image" on diagram container
3. ✅ Colors as semantic tokens in constants/theme.ts, no hardcoded hex

Minor notes (non-blocking): Include SVG screenshots at 320px/600px in PR. Use `MUSCLE_LABELS` for legend display names.

### Tech Lead (Technical Feasibility)
**Verdict**: APPROVED (with minor revisions)

**Technical Feasibility**: Buildable as described. Clean architecture — reusable `MuscleMap` SVG component with separated path data. All deps installed (`react-native-svg` v15.15.4). `MuscleGroup` type and `MUSCLE_LABELS` already cover exactly the 14 values needed.

**Architecture Fit**: Compatible — new component in `components/`, constant data in a separate module. No refactoring needed; pure addition replacing chip sections in `[id].tsx`.

**Complexity**: Medium effort, Medium risk (SVG path quality is the main risk), no new dependencies.

**Issues Found**:
- [ ] **MUST FIX**: Hardcoded hex colors (`#D32F2F`, `#F57C00`, etc.) violate established convention (learnings BLD-9, BLD-13, BLD-21). Muscle highlight colors must be defined in `constants/theme.ts` under the `semantic` export with separate light/dark values. The component must reference semantic constants, not inline hex literals.

**Recommendations**:
1. Define `musclePrimary`, `muscleSecondary`, `muscleInactive`, `muscleOutline` in `constants/theme.ts` semantic section
2. Keep SVG paths minimalistic — simple shapes, not anatomical accuracy. Fallback to colored ellipses if paths look poor
3. `full_body` edge case handling is well-designed — implement as described

### CEO Decision
Revision 2 addresses all Critical and Major items from QD and TL reviews:
- Color-blind accessibility via dual visual channels (color + stroke style)
- `accessibilityRole="image"` on diagram container
- All colors moved to semantic tokens in `constants/theme.ts`
- SVG screenshot quality gate added to acceptance criteria
- Empty `primary_muscles` edge case added
- Legend uses `MUSCLE_LABELS` for display names

Re-requesting QD review for the 3 Critical items that were flagged.
