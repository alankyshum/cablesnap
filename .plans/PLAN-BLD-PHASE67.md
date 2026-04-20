# Feature Plan: Estimated Workout Duration on Template Cards

**Issue**: BLD-436
**Author**: CEO
**Date**: 2026-04-20
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

## Problem Statement

When users look at their template cards on the home screen, user-created templates only show the exercise count (e.g., "5 exercises"). Starter templates show a hardcoded duration badge (e.g., "45 min") from metadata, but user-created templates have no duration information.

Users often need to pick a workout that fits their available time — "I have 40 minutes before my next meeting, which template fits?" Currently they have no way to know without starting the workout or remembering from past experience.

This data already exists in the app — every completed session records `duration_seconds`. We just need to surface it.

## User's Emotional Journey

**Without this feature:** User stares at template cards, tries to remember how long each one takes. Picks one, runs out of time mid-workout, feels frustrated. Or picks a short one when they had more time, feels they wasted an opportunity.

**After this feature:** User glances at template cards, sees "~45 min" on their Push Day template and "~30 min" on their Arms template. Picks the right one instantly. Feels confident and in control of their time.

## User Stories

- As a gym-goer with limited time, I want to see how long each template typically takes so I can pick the right workout for my schedule
- As a returning user, I want the app to learn from my past sessions and show me useful estimates

## Proposed Solution

### Overview

Add an estimated duration badge to user-created template cards on the home screen. The estimate is calculated from the median duration of the user's last 5 completed sessions using that template. Display format: "~Xm" (e.g., "~45m").

### UX Design

- **Display**: Add a clock icon + "~Xm" badge to the template card's meta badges row, next to the existing exercise count badge
- **Position**: Before the exercise count badge (time is more glanceable than exercise count)
- **Format**: "~30m", "~45m", "~1h 15m" — always rounded to nearest 5 minutes for clean display
- **Empty state**: If no completed sessions exist for a template, don't show any duration badge (same as current behavior — no false information)
- **Minimum data**: Require at least 1 completed session to show an estimate
- **Staleness**: No staleness indicator needed — the estimate updates automatically as users complete more sessions

### Technical Approach

1. **New DB query** in `lib/db/sessions.ts`: `getTemplateDurationEstimates(templateIds: string[]): Promise<Record<string, number | null>>`
   - For each template_id, get the median `duration_seconds` from the last 5 completed sessions (completed_at IS NOT NULL, duration_seconds IS NOT NULL)
   - Return a map of template_id → estimated seconds (or null if no data)
   - Batch query — one SQL call for all templates, not N+1

2. **Format helper** in `lib/format.ts`: `formatDurationEstimate(seconds: number): string`
   - Round to nearest 5 minutes
   - Format as "~Xm" or "~Xh Ym" for sessions over 60 minutes
   - Examples: 2700s → "~45m", 5400s → "~1h 30m", 1200s → "~20m"

3. **Wire into home screen**: Call `getTemplateDurationEstimates` in `loadHomeData.ts` alongside existing template data loading
   - Pass duration estimates to `TemplatesList` component
   - Add duration badge to non-starter template `metaBadges` array when estimate is available

### Scope

**In Scope:**
- Duration estimate badge on template cards (home screen only)
- Batch DB query for all templates
- Format helper for human-readable duration
- Unit tests for DB query and format helper

**Out of Scope:**
- Duration estimate on program day cards (future enhancement)
- Duration estimate on template detail/edit screen
- Duration tracking improvements (already tracked via session timer)
- Historical duration trends or charts
- Per-exercise time estimates

### Acceptance Criteria

- [ ] Given a user has completed 1+ sessions from a template WHEN they view the home screen THEN the template card shows "~Xm" with a clock icon
- [ ] Given a user has never used a template WHEN they view the home screen THEN no duration badge appears (no misleading "~0m")
- [ ] Given a user has completed sessions with varying durations WHEN they view the home screen THEN the estimate uses the median of the last 5 sessions (not mean, to reduce outlier impact)
- [ ] Given a session lasted 47 minutes WHEN the estimate is displayed THEN it shows "~45m" (rounded to nearest 5 minutes)
- [ ] Given a session lasted 75 minutes WHEN the estimate is displayed THEN it shows "~1h 15m"
- [ ] Given starter templates WHEN they view the home screen THEN starter templates still show their hardcoded duration (no change to existing behavior)
- [ ] The duration query is batched (1 SQL query for all templates, not N+1)
- [ ] PR passes all existing tests with no regressions
- [ ] No new lint warnings

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Template with 0 completed sessions | No duration badge shown |
| Template with 1 completed session | Show estimate based on that single session |
| Very short session (<5 min, e.g., abandoned) | Still included in median calculation — median naturally handles outliers |
| Very long session (3+ hours) | Show "~3h 0m" — no upper cap |
| Template deleted then recreated | New template has new ID, no historical data, no badge |
| Session with null duration_seconds | Excluded from calculation |
| All sessions have null duration | No duration badge shown |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| N+1 query on home screen | Low | High | Batch query — single SQL for all templates |
| Stale estimates confuse users | Low | Low | Median of last 5 sessions updates naturally |
| Visual clutter on template cards | Low | Medium | Only show when data exists; same badge style as existing |

## Test Plan

- Unit test for `formatDurationEstimate`: edge cases (0, 1 min, 59 min, 60 min, 90 min, 180 min, rounding)
- Unit test for `getTemplateDurationEstimates`: empty result, single session, multiple sessions (verify median), null duration excluded
- Estimated 8-12 new test cases

## Review Feedback
<!-- This section is filled in by reviewers -->

### UX Designer (Design & A11y Critique)
_Pending review_

### Quality Director (Release Safety)
_Pending review_

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
