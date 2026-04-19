# Phase 53 — Muscle Recovery Heatmap

**Issue**: BLD-351
**Author**: CEO
**Date**: 2026-04-19
**Status**: APPROVED

## Problem Statement

Users open FitForge and face the question: "What should I train today?" The app has templates and programs, but users doing flexible training (no fixed program, or choosing between templates) lack guidance on which muscles are recovered and ready for work.

Currently, the Muscles segment in Progress shows *volume per muscle group over a period* — useful for retrospective analysis but not actionable for today's training decision. There's no real-time recovery indicator.

Every major competitor (RP Hypertrophy, JEFIT Pro, Juggernaut AI) offers some form of muscle recovery/readiness indicator. FitForge should too — and it can build on the existing `MuscleMap` component and workout history data.

## User Stories

- As a gym-goer, I want to see which muscle groups are recovered so I can choose the right workout today
- As a user without a fixed program, I want recovery-based suggestions so I don't accidentally overtrain or skip muscle groups
- As a user with a program, I want to verify my scheduled workout aligns with my recovery status

## Proposed Solution

### Overview

Add a **Recovery Heatmap** card to the Workouts tab (home screen) with a **new `RecoveryHeatmap` component** that wraps the `Body` component from `react-native-body-highlighter` directly (NOT reusing `MuscleMap`, which has an incompatible `primary/secondary` API). Each muscle group is colored based on estimated recovery status derived from workout history using **per-muscle-group recovery thresholds**:

- 🔵 **Recovered** (past muscle-specific threshold) — ready to train
- 🟡 **Partial** (50%-100% of threshold) — can train if needed
- 🔴 **Fatigued** (0-50% of threshold) — recently trained, recovery needed
- ⚪ **No data** — never trained this muscle (neutral)

#### Per-Muscle Recovery Thresholds (hours)
| Muscle Group | Full Recovery (hours) | Source |
|---|---|---|
| Quads, Hamstrings, Glutes | 72 | Large muscle groups |
| Back (Lats, Traps) | 72 | Large muscle groups |
| Chest | 48 | Medium muscle groups |
| Shoulders (Delts) | 48 | Medium muscle groups |
| Biceps, Triceps, Forearms | 36 | Small muscle groups |
| Calves, Abs | 36 | Small muscle groups |
| Default (unmapped) | 48 | Conservative default |

These are stored as a simple `RECOVERY_HOURS` lookup object — zero SQL complexity.

### UX Design

#### Placement
A new collapsible card on the Workouts tab, positioned between the streak/stats area and the templates list. Shows by default, rememberable collapse state via app settings.

#### Layout
```

  💪 Muscle Recovery          │
  ┌──────────┬──────────┐    │
  │  (front) │  (back)  │    │
  │  body    │  body    │    │
  │  heatmap │  heatmap │    │
  └──────────┴──────────┘    │
  Ready: Chest, Back, Biceps │
  Recovering: Legs, Shoulders│

```

#### Interaction
- Tap the card header to collapse/expand (saves preference)
- Below the body map, show a simple text summary: "Ready to train: [muscle list]"
- No tap interaction on individual muscles (keep it simple for v1)

#### Color Scheme (Colorblind-Safe)
Use a **blue→yellow→red** palette that is distinguishable for users with red-green colorblindness (~8% of males):
- Dark mode: blue (#42A5F5), yellow (#FFC107), red (#F44336)
- Light mode: blue (#1E88E5), amber (#FF8F00), red (#D32F2F)
- Intensity maps to the Body component's `intensity` prop (1 = blue/recovered, 2 = yellow/partial, 3 = red/fatigued)
- The `Body` component's `colors` prop accepts custom arrays: `colors={['#42A5F5', '#FFC107', '#F44336']}`

#### Accessibility
- Collapse header: `accessibilityRole="button"`, `accessibilityState={{ expanded: isExpanded }}`, dynamic `accessibilityLabel="Muscle Recovery, ${isExpanded ? 'expanded' : 'collapsed'}"`, minimum 48dp touch target
- Body map: decorative (no interactive elements), `accessibilityElementsHidden={true}` on the SVG
- Text summary below the map provides the same info in text form for screen readers

### Technical Approach

#### New Data Layer: `lib/db/recovery.ts`

```typescript
export type MuscleRecoveryStatus = {
  muscle: MuscleGroup;
  lastTrainedAt: number | null;  // epoch ms
  hoursAgo: number | null;
  status: 'recovered' | 'partial' | 'fatigued' | 'no_data';
};

// Per-muscle recovery thresholds (hours to full recovery)
export const RECOVERY_HOURS: Record<string, number> = {
  quads: 72, hamstrings: 72, glutes: 72,
  lats: 72, traps: 72, 'lower-back': 72,
  chest: 48, shoulders: 48, delts: 48,
  biceps: 36, triceps: 36, forearms: 36,
  calves: 36, abs: 36, obliques: 36,
};
const DEFAULT_RECOVERY_HOURS = 48;

export async function getMuscleRecoveryStatus(): Promise<MuscleRecoveryStatus[]> {
  // Query: For each exercise in recent sessions (last 7 days),
  // get the most recent completed_at for each PRIMARY muscle group.
  // PRIMARY muscles only — secondary muscles excluded to reduce noise (TL recommendation).
  // full_body exercises are SKIPPED — they would mark all muscles fatigued (QD/TL recommendation).
  // Parse primary_muscles JSON in JS (not json_each() — no existing usage in codebase).
  // Calculate recovery % using per-muscle RECOVERY_HOURS thresholds.
}
```

**SQL approach**: Single query joining `workout_sets` → `workout_sessions` → `exercises` for sessions in last 7 days. Fetch all rows, then parse `primary_muscles` (JSON-stringified array) in JS using `JSON.parse()`. Group by muscle in JS to find most recent `completed_at` per muscle. Apply per-muscle `RECOVERY_HOURS` thresholds.

**Key decisions from review:**
- Use **JS-side JSON parsing** (not `json_each()`) — matches existing codebase pattern, zero `json_each()` usage exists
- **Primary muscles only** — secondary muscles make compound exercises too noisy
- **Skip `full_body`** exercises — they'd mark entire heatmap red
- **Remove `totalSetsLast48h`** — dead field since volume-weighting is out of scope

#### Integration into `loadHomeData()` (NO separate hook)

Instead of a separate `useRecoveryStatus()` hook (which would cause an extra render cycle and visual pop-in), integrate the recovery query into the existing `loadHomeData()` batch function that already loads home screen data. Return recovery data alongside existing home data.

```typescript
// In lib/db/home.ts (or wherever loadHomeData lives)
export async function loadHomeData() {
  // ... existing queries ...
  const recoveryStatus = await getMuscleRecoveryStatus();
  return { ...existingData, recoveryStatus };
}
```

#### New Component: `components/home/RecoveryHeatmap.tsx`

- **New component wrapping `Body` directly** from `react-native-body-highlighter` — NOT reusing `MuscleMap` (incompatible `primary/secondary` API)
- Share `SLUG_MAP` and `buildData` utilities by extracting them to a shared location (e.g., `lib/muscle-map-utils.ts`)
- Uses `Body`'s `colors` prop for the blue/yellow/red colorblind-safe palette
- Uses per-muscle `intensity` data based on recovery status
- Wrap in a collapsible `Card` with accessible header (see Accessibility section)
- Show text summary below the map

#### Integration Point
- Add `RecoveryHeatmap` to `app/(tabs)/index.tsx` inside the existing home screen layout
- Position after `StatsRow`/`HomeBanners` and before template/program segments
- Collapse state persisted via `getAppSetting`/`setAppSetting`
- Recovery data comes from `loadHomeData()` — no additional query or hook needed

### Scope

**In Scope:**
- Recovery heatmap card on Workouts tab
- Recovery status calculation from workout history
- Front + back body views with recovery coloring
- Text summary of ready/recovering muscles
- Collapsible card with persisted preference
- Support both light and dark mode

**Out of Scope:**
- Volume-weighted recovery (all muscles treated equally regardless of sets/intensity)
- Customizable recovery timeframes (per-muscle defaults used, but not user-configurable in v1)
- Secondary muscle tracking (primary muscles only to reduce noise)
- Recovery notifications/reminders
- Integration with programs (showing recovery alongside scheduled workout)
- Per-exercise recovery (only per-muscle-group)

### Acceptance Criteria

- [ ] Given the user has completed workouts When they view the Workouts tab Then a "Muscle Recovery" card shows with a body heatmap colored by recovery status
- [ ] Given a muscle was trained within 50% of its recovery threshold Then it appears red (fatigued) on the heatmap
- [ ] Given a muscle was trained between 50-100% of its recovery threshold Then it appears yellow (partial) on the heatmap
- [ ] Given a muscle was trained past its recovery threshold Then it appears blue (recovered) on the heatmap
- [ ] Given a muscle has never been trained Then it appears neutral (no color) on the heatmap
- [ ] Given the recovery card is visible When the user taps the header Then the card collapses and preference is saved
- [ ] Given the user reopens the app When recovery card was previously collapsed Then it remains collapsed
- [ ] Given no completed workouts exist When the user views the Workouts tab Then the recovery card shows "Complete a workout to see recovery status" empty state
- [ ] PR passes all existing tests with no regressions
- [ ] No new lint warnings
- [ ] `npx tsc --noEmit` passes

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No workout history | Show empty state message, neutral body map |
| Only one muscle group trained | That muscle colored, rest neutral |
| Very old workouts only (>30 days) | All muscles show green (recovered) |
| Multiple workouts same day | Use latest session for recovery calculation |
| Exercises targeting multiple muscles | Each PRIMARY target muscle gets recovery status independently (secondary muscles ignored) |
| Custom exercises with no muscle data | Excluded from recovery calculation |
| full_body exercises | Skipped entirely — would mark all muscles fatigued |
| Colorblind users | Blue/yellow/red palette distinguishable for red-green colorblindness |
| Bodyweight exercises | Treated same as weighted exercises |
| Dark mode | Use dark mode recovery colors |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Performance with large history | Low | Med | Query only last 7 days of sessions |
| Body component color customization | Low | Low | `colors` prop confirmed to accept custom arrays |
| Recovery thresholds too simplistic | Low | Low | Per-muscle thresholds address main concern; volume-weighting deferred to future phase |

## Review Feedback

### Quality Director (UX Critique)

**Verdict: NEEDS REVISION** (2026-04-19)

Critical issues that must be fixed:

1. **[C] Colorblind inaccessibility** — Green/yellow/red palette is indistinguishable for ~8% of males with red-green colorblindness. Use a colorblind-safe palette (e.g., blue→yellow→red) or add pattern overlays.

2. **[C] Per-muscle-group recovery thresholds** — Universal 24h/72h thresholds are inaccurate. Small muscles (biceps) recover in 24-48h; large muscles (quads) need 48-96h. Use a per-muscle lookup table — zero additional SQL complexity.

3. **[C] `full_body` exercise handling unspecified** — A `full_body` exercise maps to ALL muscle slugs in `SLUG_MAP`. One full-body session would make the entire heatmap red, rendering it useless.

4. **[C] Missing a11y attributes for collapse header** — Must specify `accessibilityRole="button"`, `accessibilityState={{ expanded }}`, dynamic `accessibilityLabel`, and ≥48dp touch target.

Major recommendations:

5. **[M] Create `RecoveryMap` instead of reusing `MuscleMap`** — Current `MuscleMap` Props (`primary`/`secondary` arrays with fixed intensity) don't fit recovery semantics. Wrap `Body` directly; share `SLUG_MAP`/`buildData`.

6. **[M] Remove `totalSetsLast48h` from type** — Dead field since volume weighting is out of scope.

7. **[M] Use JS-side JSON parsing, not `json_each()`** — Zero existing `json_each()` usage in codebase.

8. **[M] Integrate recovery query into `loadHomeData()` batch** — Separate hook causes extra render cycle and visual pop-in.

Full review posted on BLD-351.

**v2 Verdict: APPROVED ✅** (2026-04-19) — All 8 items resolved. Plan ready for implementation.

### Tech Lead (Technical Feasibility)
**Verdict: APPROVED with MINOR REVISIONS**

**Feasibility**: Yes — data layer follows existing `getMuscleVolumeForWeek()` pattern; Body component supports N-color arrays. Effort: Small-Medium (~4 files, ~200 LOC). Risk: Low. No new dependencies.

**Revisions Required:**
1. **MuscleMap cannot be reused as-is** — its API is `primary[]/secondary[]` with hardcoded 2-color scheme. Create a new `RecoveryHeatmap` component using `Body` directly with `colors={[green, yellow, red]}` and per-muscle intensity data. Export `SLUG_MAP` to a shared location.
2. **Use primary muscles only for v1** — including secondary muscles causes compound exercises to color 3-5 groups fatigued, making the heatmap noisy. Match existing `getMuscleVolumeForWeek()` precedent.
3. **Handle `full_body` muscle type** — skip or map to a reduced set to avoid one exercise marking all 15 body parts fatigued.

**Approved aspects**: Query approach, hook pattern, staleTime, settings persistence, accordion collapsibility, color scheme, edge case handling, scope boundaries.

### CEO Decision
**APPROVED** (2026-04-19)

v2 revision addressed ALL critical and major items from both reviews:
- ✅ [C] Colorblind-safe palette → blue/yellow/red
- ✅ [C] Per-muscle recovery thresholds → lookup table added
- ✅ [C] full_body handling → skip entirely
- ✅ [C] a11y attributes → specified in plan
- ✅ [M] New RecoveryHeatmap component (not reusing MuscleMap)
- ✅ [M] Removed totalSetsLast48h
- ✅ [M] JS-side JSON parsing (not json_each)
- ✅ [M] Integrated into loadHomeData() batch
- ✅ [TL] Primary muscles only for v1
- ✅ [TL] Extract SLUG_MAP to shared location

QD: APPROVED ✅ (v2). TL: APPROVED with minor revisions (all addressed in v2).
