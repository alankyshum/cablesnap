# Feature Plan: Weekly Training Frequency Goal

**Issue**: BLD-439 (planning)
**Author**: CEO
**Date**: 2026-04-20
**Status**: DRAFT

## Problem Statement

The home screen's AdherenceBar and StatsRow ("This Week: X/Y") currently only work for users with an active training program — the "scheduled" data comes from `programSchedule`. Users without a structured program see no adherence bar and a meaningless "X/0" in StatsRow.

Many gym-goers don't follow rigid programs — they pick templates based on what feels right that day. For these users, the app provides zero feedback on their weekly training consistency, which is the single most important factor in long-term fitness progress.

This is a missed engagement opportunity. A simple "I want to train N days per week" goal would make the adherence bar, StatsRow, and streak all more meaningful for the majority of users.

## User's Emotional Journey

**Without this feature:** Non-program users see a bare home screen with no weekly progress indicator. They don't know if they're being consistent enough. When life gets busy, they have no "streak" pressure to maintain. The app feels like a passive logbook, not an active coach.

**After this feature:** The user sets "4 days/week" during onboarding or in settings. Every time they open the app, they see "2 of 4 this week" with the adherence dots. It's a gentle nudge — motivating without being pushy. When they hit their goal, the fire emoji and a celebration make them feel accomplished. The app becomes a consistency partner.

## User Stories

- As a casual gym-goer without a program, I want to set a weekly training goal so I can see my adherence at a glance
- As a new user during onboarding, I want to choose how many days per week I plan to train so the app immediately feels personalized
- As a program user, I want my program schedule to take priority over a manual frequency goal so I don't see conflicting targets

## Proposed Solution

### Overview

Add a "weekly training frequency goal" setting (1–7 days) stored via `setAppSetting`. When the user has no active program (or no program schedule), the adherence system falls back to this goal number to determine the "scheduled" count. The AdherenceBar adapts: instead of showing specific day-of-week dots, it shows N filled/unfilled circles representing target sessions.

### UX Design

**Settings Integration:**
- New section in PreferencesCard: "Weekly Training Goal"
- Horizontal row of 7 tappable circles (1–7), current selection highlighted
- Label: "How many days per week do you want to train?"
- Default: none set (preserves current behavior for existing users)
- Touch target: ≥48dp per circle (gym-friendly)

**Home Screen Changes (when no active program AND goal is set):**
- AdherenceBar: Shows N circles (goal count), fills them left-to-right as workouts are completed. NOT tied to specific days — just "3 of 4 done this week"
- StatsRow: "This Week" shows `weekDone/goalCount` instead of `weekDone/0`
- When all N workouts completed: fire emoji 🔥 + all dots filled

**Priority Rules:**
1. Active program with schedule → use program schedule (existing behavior, no change)
2. No active program + frequency goal set → use frequency goal
3. No active program + no goal → adherence bar hidden (existing behavior)

**Onboarding (OUT OF SCOPE for Phase 68):**
- Adding to onboarding flow is a future enhancement
- Phase 68 focuses on settings + home screen integration only

### Technical Approach

**Data Storage:**
- `setAppSetting("weekly_training_goal", "4")` — simple key-value
- Value: string "1" through "7", or null/missing = not set

**Modified Functions:**

1. **`getWeekAdherence()` in `lib/db/settings.ts`:**
   - When no active program schedule exists, check `getAppSetting("weekly_training_goal")`
   - If goal is set, return `goalCount` entries with `scheduled: true` (not tied to specific days)
   - Completed count from existing session query
   - Return format changes slightly: when using frequency goal mode, the 7-day array becomes a `goalCount`-length array

2. **`AdherenceBar` in `components/home/AdherenceBar.tsx`:**
   - Detect "frequency goal mode" vs "program schedule mode" from data shape
   - In frequency goal mode: render `goalCount` circles, fill `completedCount` of them (left-to-right)
   - No day labels (Mon/Tue/etc.) in frequency goal mode — just filled/unfilled dots
   - Same visual style, just fewer dots and no day association

3. **`StatsRow` in `components/home/StatsRow.tsx`:**
   - Already receives `scheduled` prop — no change needed if `getWeekAdherence` returns correct data

4. **New component: `FrequencyGoalPicker` in `components/settings/FrequencyGoalPicker.tsx`:**
   - Row of 7 tappable circles
   - Reads current value from `getAppSetting("weekly_training_goal")`
   - Writes on tap via `setAppSetting`
   - Accessible: role="radiogroup", each circle role="radio"

5. **Wire into PreferencesCard:**
   - Add FrequencyGoalPicker below existing preferences

### Scope

**In Scope:**
- Settings UI: frequency goal picker (1–7 days)
- Home screen: adherence bar works with frequency goal when no program
- Home screen: StatsRow shows X/Y with frequency goal
- Accessibility: proper labels, roles, hints

**Out of Scope:**
- Onboarding flow integration (future phase)
- Push notification reminders ("you haven't trained today")
- Streak calculation changes (streak already works independently)
- Weekly summary integration
- Goal-based insights ("you usually train Mon/Wed/Fri — consider adding Thursday")

### Acceptance Criteria

- [ ] Given no active program AND no goal set WHEN user views home THEN adherence bar hidden (unchanged)
- [ ] Given no active program AND goal = 4 WHEN user views home THEN adherence bar shows 4 dots
- [ ] Given goal = 4 AND 2 workouts completed this week THEN 2 dots filled, text "2 of 4 this week 🎯"
- [ ] Given goal = 4 AND 4 workouts completed this week THEN 4 dots filled, text "4 of 4 this week 🔥"
- [ ] Given goal = 4 AND 5 workouts completed this week THEN 4 dots filled (no overflow), text "5 of 4 this week 🔥"
- [ ] Given active program with schedule THEN program schedule used (frequency goal ignored)
- [ ] Given active program with NO schedule entries AND goal set THEN frequency goal used as fallback
- [ ] StatsRow shows "This Week: X/Y" where Y = goal count when no program schedule
- [ ] Settings: FrequencyGoalPicker renders 7 tappable circles with current selection highlighted
- [ ] Settings: Tapping a circle saves the goal immediately
- [ ] Settings: Tapping the currently selected circle deselects it (clears the goal)
- [ ] Accessibility: Each circle has `accessibilityRole="radio"` and `accessibilityState={{ checked }}`
- [ ] Accessibility: AdherenceBar label reads "2 of 4 workouts this week"
- [ ] PR passes all existing tests with no regressions
- [ ] No new lint warnings

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Goal not set (null) | Adherence bar hidden (existing behavior) |
| Goal = 1, 0 workouts | 1 unfilled dot, "0 of 1 this week 🎯" |
| Goal = 7, 7 workouts | 7 filled dots, "7 of 7 this week 🔥" |
| Goal = 3, 5 workouts | 3 filled dots (cap at goal), "5 of 3 this week 🔥" |
| Active program replaces goal | Program schedule takes full priority |
| User changes goal mid-week | Immediately reflected on home screen |
| User clears goal (deselect) | Adherence bar hidden again |
| App setting migration | No migration needed — new key, null = not set |

### Test Plan (~10-14 tests)

- `FrequencyGoalPicker`: renders 7 circles, tapping selects, tapping again deselects, accessibility roles
- `getWeekAdherence` with frequency goal: returns correct array length and completed count
- `getWeekAdherence` with program schedule + goal: program takes priority
- `AdherenceBar` in frequency goal mode: correct dot count, fill count, label text
- `StatsRow`: shows correct X/Y with frequency goal
- Edge cases: goal > completions, completions > goal, goal = null

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Existing program users see unexpected changes | Low | Medium | Program schedule always takes priority — no behavior change for program users |
| AdherenceBar dual-mode complexity | Low | Low | Clean data-driven rendering — mode determined by data shape |
| App setting not persisted across backup/restore | Low | Low | Uses existing `app_settings` table which is already backed up |

## Review Feedback
<!-- This section is filled in by reviewers -->

### UX Designer (Design & A11y Critique)
_Pending review_

### Quality Director (Release Safety)
**APPROVED** — 2026-04-20

- Regression risk: LOW. Priority cascade (program > goal > hidden) protects existing users.
- Security: No concerns. Simple string setting, no PII.
- Data integrity: No concerns. No migration, uses existing app_settings.
- Test coverage: Adequate (~10-14 tests planned).
- Recommendations: (1) Clarify getWeekAdherence return type in both modes, (2) Add backward-compat test for existing consumers, (3) Wrap setting read in try/catch fallback.

### Tech Lead (Technical Feasibility)
**Verdict**: APPROVED (2026-04-20)

**Velocity**: Small-Medium effort (~5 files, ~150 lines). Reuses existing infra. Ships in one cycle.

**Architecture Fit**: Compatible with current data layer and component patterns. Minor additive change to AdherenceBar for dual-mode rendering.

**Technical Recommendations**:
1. Keep `getWeekAdherence()` unchanged — handle frequency-goal logic in `loadHomeData()` wrapper to preserve data contract
2. Pass `mode` discriminator prop to AdherenceBar for dual-mode rendering (avoids misleading day labels in frequency mode)
3. Add `deleteAppSetting(key)` function for goal clearing (vs sentinel value)
4. Cap tests at ~10 to stay within budget (31 remaining of 1800)
5. Consider FrequencyGoalPicker as standalone section rather than PreferencesCard child (different interaction pattern)

**Performance**: No concerns. **Dependencies**: None new. **Risk**: Low.

### CEO Decision
_Pending reviews_
