# Feature Plan: Live Time-Remaining Estimate During Workout

**Issue**: BLD-443
**Author**: CEO
**Date**: 2026-04-20
**Status**: DRAFT

## Problem Statement
Phase 67 added estimated workout duration on template cards — users see "~45 min" before starting. But once the workout begins, they lose that context. The session header shows elapsed time (e.g., "23:41") but not how much longer the workout will take. Users in the gym frequently wonder "how much longer?" — they need to plan around class schedules, parking meters, gym partners, or simply knowing if they'll finish in time for dinner.

## User's Emotional Journey
**Without this feature:** "I've been here 30 minutes. Is that halfway? Two-thirds? I have no idea when I'll be done." → Mild anxiety, checking phone clock repeatedly, mentally counting remaining exercises.

**After this feature:** "23 min left — plenty of time before my next meeting." → Calm, focused, in control of their schedule.

## User Stories
- As a gym-goer, I want to see estimated remaining time during my workout so that I can plan my gym visit without clock-watching.
- As a time-conscious user, I want the remaining time to update as I progress through sets so that the estimate gets more accurate as I go.

## Proposed Solution

### Overview
Add a secondary text line ("~15 min left") below the elapsed time display in the SessionHeaderToolbar. The estimate uses the template's historical median duration (already computed by Phase 67's `getTemplateDurationEstimates`) minus elapsed time. Simple subtraction — no complex pace algorithms.

### UX Design
- **Location:** Below the elapsed time in `SessionHeaderToolbar`, as subtle secondary text
- **Format:** "~X min left" (e.g., "~15 min left", "~1 min left")
- **Visibility rules:**
  - Only shown when workout was started from a template with historical duration data
  - Hidden for brand-new templates with no history (no estimate available)
  - Hidden for freestyle workouts (no template)
  - Hidden once elapsed exceeds estimate (user has passed the expected duration)
- **Update cadence:** Updates every time elapsed ticks (every second), but the text only changes when the minute value changes (avoiding distracting per-second flicker)
- **Color:** `colors.onSurfaceVariant` — secondary, unobtrusive
- **Font:** `fontSizes.xs`, same as caption text
- **One-handed use:** No interaction needed — purely informational
- **No tap target:** Not pressable (no interaction to design)
- **Accessibility:** `accessibilityLabel` on the elapsed button extended to include "approximately X minutes remaining"

### Technical Approach

#### Data Flow
1. When session loads from a template, fetch the template's estimated duration via existing `getTemplateDurationEstimates([templateId])` (already available in `lib/db/sessions.ts`)
2. Pass `estimatedDuration: number | null` to `SessionHeaderToolbar` as a new prop
3. In the toolbar, compute `remaining = estimatedDuration - elapsed` each render
4. Format and display if remaining > 0

#### Pure Function
```typescript
export function formatTimeRemaining(estimatedTotalSeconds: number | null, elapsedSeconds: number): string | null {
  if (estimatedTotalSeconds == null || estimatedTotalSeconds <= 0) return null;
  const remaining = estimatedTotalSeconds - elapsedSeconds;
  if (remaining <= 0) return null;
  const minutes = Math.ceil(remaining / 60);
  if (minutes <= 0) return null;
  return `~${minutes} min left`;
}
```

#### Modified Files (2)
1. **`components/session/SessionHeaderToolbar.tsx`**
   - Add `estimatedDuration?: number | null` to Props
   - Compute remaining text via pure function
   - Render below elapsed time when available

2. **`app/session/[id].tsx`** (or via `useSessionData`)
   - On session load, if `templateId` is available, call `getTemplateDurationEstimates([templateId])`
   - Pass the result to `SessionHeaderToolbar`

#### New Function (in `lib/format.ts`)
- `formatTimeRemaining(estimatedTotalSeconds, elapsedSeconds)` — pure, testable

### Scope
**In Scope:**
- Display "~X min left" below elapsed time during active workout
- Use historical median duration from Phase 67
- Hide when no estimate or time exceeded
- Accessibility label update

**Out of Scope:**
- Pace-based adaptive estimation (future enhancement — could blend historical with live pace)
- Per-exercise remaining time
- Notification when estimated time exceeded
- Tapping the remaining time for any action

### Acceptance Criteria
- [ ] Given a workout started from a template with ≥1 completed session → "~X min left" appears below elapsed time
- [ ] Given a workout from a new template (no history) → no remaining time shown
- [ ] Given elapsed time exceeds estimated duration → remaining time text disappears
- [ ] Given 25 minutes remaining → shows "~25 min left"
- [ ] Given 90 seconds remaining → shows "~2 min left" (ceil)
- [ ] Remaining time text uses `onSurfaceVariant` color, `fontSizes.xs`
- [ ] accessibilityLabel includes remaining time estimate
- [ ] No regressions on existing session header behavior (rest timer, elapsed, toolbox)
- [ ] No new lint warnings or TS errors

### Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| No template (freestyle workout) | No remaining time shown |
| New template, never completed | No remaining time shown |
| User takes longer than estimate | Text disappears gracefully (no negative values) |
| Very short workout (<2 min estimate) | Shows "~1 min left", then disappears |
| Very long workout (>3 hours) | Shows correctly, e.g., "~45 min left" |
| Session resumed after app background | Elapsed continues from timer, remaining adjusts |

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Estimate feels inaccurate | Medium | Low | Label with "~" prefix to set expectations |
| Visual clutter in header | Low | Medium | Use small secondary text, hide when not applicable |
| Performance (extra DB query) | Low | Low | Single query on session load, cached for session lifetime |

### Test Budget
- 1 test for `formatTimeRemaining` pure function (multiple assertions in one test)
- **Note:** Test budget is at 1801/1800 (over by 1). Phase 70 MUST include consolidation of 2+ existing tests to make room. Net change: ≤0 new tests.

## Review Feedback

### UX Designer (Design & A11y Critique)
_Pending review_

### Quality Director (Release Safety)
_Pending review_

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
