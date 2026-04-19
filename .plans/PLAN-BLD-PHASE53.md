# Phase 53 — Muscle Recovery Heatmap

**Issue**: BLD-351
**Author**: CEO
**Date**: 2026-04-19
**Status**: DRAFT

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

Add a **Recovery Heatmap** card to the Workouts tab (home screen) that reuses the existing `react-native-body-highlighter` (`MuscleMap`) component with a recovery-based color scheme. Each muscle group is colored based on estimated recovery status derived from workout history:

- 🟢 **Recovered** (72+ hours since last trained) — ready to train
- 🟡 **Partial** (24–72 hours) — can train if needed, but not fully recovered
- 🔴 **Fatigued** (0–24 hours) — recently trained, recovery needed
- ⚪ **No data** — never trained this muscle (neutral)

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

#### Color Scheme
Use the existing `muscle` theme colors as a base, but override for recovery context:
- Dark mode: green (#4CAF50), yellow (#FFC107), red (#F44336)
- Light mode: green (#388E3C), amber (#FF8F00), red (#D32F2F)
- Intensity maps to the Body component's `intensity` prop (1 = green, 2 = yellow, 3 = red)

### Technical Approach

#### New Data Layer: `lib/db/recovery.ts`

```typescript
export type MuscleRecoveryStatus = {
  muscle: MuscleGroup;
  lastTrainedAt: number | null;  // epoch ms
  hoursAgo: number | null;
  status: 'recovered' | 'partial' | 'fatigued' | 'no_data';
  totalSetsLast48h: number;
};

export async function getMuscleRecoveryStatus(): Promise<MuscleRecoveryStatus[]> {
  // Query: For each muscle group, find the most recent session
  // that included exercises targeting that muscle (primary OR secondary).
  // Use workout_sets joined with exercises.primary_muscles and secondary_muscles.
  // Calculate hours since last training.
  // Return recovery status based on thresholds.
}
```

**SQL approach**: Join `workout_sets` → `workout_sessions` → `exercises` to find the most recent `completed_at` timestamp for each muscle group. Parse `primary_muscles` (JSON array) to map exercises to muscle groups. Use a single query with GROUP BY per muscle to avoid N+1.

**Note**: `primary_muscles` is stored as a JSON-stringified array (see learnings). Use `json_each()` in SQLite to unnest, or parse in JS after a broader query.

#### New Hook: `hooks/useRecoveryStatus.ts`

```typescript
export function useRecoveryStatus() {
  return useQuery({
    queryKey: ['recovery-status'],
    queryFn: getMuscleRecoveryStatus,
    staleTime: 5 * 60 * 1000,  // 5 min cache — recovery changes slowly
  });
}
```

#### New Component: `components/home/RecoveryHeatmap.tsx`

- Uses `MuscleMap` with custom intensity values based on recovery status
- The existing `MuscleMap` already supports `intensity` via `react-native-body-highlighter`
- Wrap in a collapsible `Card` with a header
- Show text summary below the map

#### Integration Point
- Add `RecoveryHeatmap` to `app/(tabs)/index.tsx` inside the existing home screen layout
- Position after `StatsRow`/`HomeBanners` and before template/program segments
- Collapse state persisted via `getAppSetting`/`setAppSetting`

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
- Customizable recovery timeframes (fixed 24h/72h thresholds for v1)
- Recovery notifications/reminders
- Integration with programs (showing recovery alongside scheduled workout)
- Per-exercise recovery (only per-muscle-group)

### Acceptance Criteria

- [ ] Given the user has completed workouts When they view the Workouts tab Then a "Muscle Recovery" card shows with a body heatmap colored by recovery status
- [ ] Given a muscle was trained 0-24h ago Then it appears red (fatigued) on the heatmap
- [ ] Given a muscle was trained 24-72h ago Then it appears yellow (partial recovery) on the heatmap
- [ ] Given a muscle was trained 72+ hours ago Then it appears green (recovered) on the heatmap
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
| Exercises targeting multiple muscles | Each target muscle gets recovery status independently |
| Custom exercises with no muscle data | Excluded from recovery calculation |
| Bodyweight exercises | Treated same as weighted exercises |
| Dark mode | Use dark mode recovery colors |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| SQLite json_each() not available | Low | High | Fall back to JS-side JSON parsing |
| Performance with large history | Low | Med | Query only last 7 days of sessions |
| MuscleMap component doesn't support custom intensity colors | Med | Med | Override via the intensity prop (1-3 scale already supported) |
| Recovery thresholds too simplistic | Med | Low | Document as v1; future phase can add volume-weighting |

## Review Feedback

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
