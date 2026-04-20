# Feature Plan: Achievement & Milestone System

**Issue**: BLD-129
**Author**: CEO
**Date**: 2026-04-15
**Status**: DRAFT → IN_REVIEW (revision 2)

## Revision 2 — Changes from Review Feedback

Addressed all Critical and Major issues from Quality Director and Tech Lead reviews:

1. ✅ AC-1–AC-5: Full accessibility specification added (labels, roles, values, live regions, touch targets)
2. ✅ UX-1: Max-3 stacking behavior defined in UX Design section with "+N more" link
3. ✅ UX-2: First-run retroactive unlock experience defined for existing users
4. ✅ UX-3: File location corrected to `app/progress/achievements.tsx` (matches navigation hierarchy)
5. ✅ TL-1: Switched to `AchievementContext` data object pattern (pure, testable)
6. ✅ TL-2: "Monthly Grind" algorithm clarified (ISO week grouping, ≥3 sessions per week)
7. ✅ TL-3: File placement under `app/progress/` (aligned with QD recommendation)
8. ✅ TL-4: Batch context queries into single evaluation pass
9. ✅ TL-5: Nutrition streak definition clarified (UTC calendar days)

## Problem Statement

CableSnap has comprehensive workout tracking, nutrition, and progress features — but lacks a gamification layer to celebrate user milestones and drive continued engagement. Users who hit personal records, maintain streaks, or reach volume milestones get no formal recognition beyond data points. Research shows gamification elements (badges, achievements, milestones) significantly increase user retention in fitness apps.

The app already tracks all the underlying data (PRs via `getRecentPRs`/`getSessionPRs`, streaks via `getAllCompletedSessionWeeks`, volume via `getWeeklyVolume`, workout counts via session history). The missing piece is a system that transforms these data points into meaningful achievements.

## User Stories

- As a user, I want to earn achievement badges when I hit workout milestones so I feel motivated to keep training
- As a user, I want to see all my earned achievements in one place so I can track my fitness journey
- As a user, I want to be notified when I unlock a new achievement so I get immediate positive reinforcement
- As a user, I want to share my achievements so I can celebrate with friends

## Proposed Solution

### Overview

A client-side achievement system that evaluates workout data against predefined achievement criteria. Achievements are checked after each workout completion and displayed in a dedicated achievements screen accessible from the progress tab. No backend needed — all logic is pure TypeScript evaluated against local SQLite data.

### UX Design

**Achievement notification (in-app):**
- When a workout session is completed (post-workout summary screen), check for newly earned achievements
- Display a celebratory card at the top of the post-workout summary: "🏆 Achievement Unlocked: [Name]!"
- Card shows achievement icon, name, description, and "View All" link
- Haptic feedback (medium impact) on achievement unlock — **check `useReducedMotion()` first; skip haptics if reduced motion is enabled**
- If multiple achievements unlock in one session, show up to 3 stacked vertically; if more than 3, show top 3 + a "+N more achievements" link to the achievements screen
- **Achievement notification card uses `accessibilityLiveRegion="polite"` so screen readers announce newly unlocked achievements without interrupting current focus**
- **First-run retroactive unlock**: When a user with existing workout data opens the achievements screen for the first time after this feature ships, all earned achievements are evaluated silently and displayed as already-earned in the grid (no notification flood). A banner at the top says "Welcome back! We found N achievements from your workout history."

**Achievements screen (`app/progress/achievements.tsx`):**
- Accessible from the Progress tab via a "🏆 Achievements" card/button
- Grid layout of achievement badges with **minimum 48×48dp touch targets** per badge (with 8dp spacing):
  - **Earned**: Full color icon with ✅ checkmark overlay. `accessibilityLabel="[Name] achievement — Earned on [date]"`, `accessibilityRole="button"`
  - **Unearned**: Grayed-out icon with 🔒 lock icon overlay (**not color-only** — satisfies colorblind users). Text label "Locked" visible below badge. `accessibilityLabel="[Name] achievement — Locked, [N] of [total] complete"`, `accessibilityRole="button"`
  - **Progress bar** on unearned: `accessibilityValue={{ min: 0, max: [total], now: [current], text: "[current] of [total]" }}`
- Categories: Consistency, Strength, Volume, Nutrition, Body
- Each badge shows: icon, name, description, date earned (or progress toward earning)
- Total achievement count displayed at top: "23 / 45 Achievements Earned"
- **Loading state**: Skeleton grid while evaluating achievements
- **Empty state** (no workouts yet): "Complete your first workout to start earning achievements!" with illustration
- **Error state** (evaluation fails): "Couldn't load achievements. Pull to retry." with retry action

**Achievement categories and examples:**

| Category | Achievement | Criteria | Icon |
|----------|------------|----------|------|
| **Consistency** | First Steps | Complete 1 workout | 🏃 |
| **Consistency** | Getting Started | Complete 5 workouts | 🔥 |
| **Consistency** | Dedicated | Complete 25 workouts | 💪 |
| **Consistency** | Iron Will | Complete 100 workouts | 🏋️ |
| **Consistency** | Legend | Complete 500 workouts | 👑 |
| **Consistency** | Week Warrior | 7-day workout streak | ⚡ |
| **Consistency** | Monthly Grind | 4 consecutive ISO weeks with ≥3 workout sessions each (group sessions by ISO week number, count weeks with 3+ sessions) | 🌟 |
| **Strength** | PR Breaker | Hit your first personal record | 📈 |
| **Strength** | PR Machine | Hit 10 personal records | 🎯 |
| **Strength** | Record Setter | Hit 50 personal records | 🏆 |
| **Volume** | Ton Club | Lift 1,000 kg total volume in a single session | 🪨 |
| **Volume** | Heavy Hitter | Lift 10,000 kg total volume in a single session | 💎 |
| **Volume** | Volume King | Accumulate 100,000 kg total lifetime volume | 🌍 |
| **Nutrition** | Macro Tracker | Log nutrition for 7 consecutive days | 🥗 |
| **Nutrition** | Nutrition Pro | Log nutrition for 30 consecutive days | 🍎 |
| **Body** | Progress Pic | Take your first progress photo | 📸 |
| **Body** | Body Journal | Log body weight 10 times | ⚖️ |
| **Body** | Transformation | Log body measurements 5 times | 📐 |

### Technical Approach

**Architecture:**
- `lib/achievements.ts` — Pure functions defining achievements and evaluation logic. No side effects. Each achievement has an `id`, `name`, `description`, `category`, `icon`, and `evaluate(context: AchievementContext) => { earned: boolean; progress: number; earnedAt?: number }` function. The `AchievementContext` is a plain data object (not a db handle) containing pre-fetched aggregates, keeping achievement logic pure and unit-testable without DB mocking.
- `lib/db/achievements.ts` — Database queries to: (1) build the `AchievementContext` in a single batched pass (one query per data source), and (2) store/retrieve earned achievements.
- `AchievementContext` type: `{ totalWorkouts: number; workoutDates: string[]; prCount: number; maxSessionVolume: number; lifetimeVolume: number; nutritionDays: string[]; bodyWeightCount: number; progressPhotoCount: number; bodyMeasurementCount: number }`
- New SQLite table: `achievements_earned (achievement_id TEXT PRIMARY KEY, earned_at INTEGER NOT NULL)`
- Evaluation runs after each workout completion (in the session completion flow) and on achievements screen mount.
- **Nutrition streak definition**: "consecutive days" means consecutive UTC calendar days with at least one `daily_log` entry. A gap of 1+ days resets the streak.

**Achievement evaluation strategy:**
- Lazy evaluation: only check achievements when the achievements screen is opened or a workout is completed
- Cache earned achievements in the `achievements_earned` table to avoid re-evaluation
- For unearned achievements, compute progress on-demand (percentage toward goal)
- **Batch all context queries into a single `buildAchievementContext()` call** — one query per data source, all fired in parallel, results assembled into `AchievementContext` object. Then iterate achievements synchronously against the context. This avoids N queries per achievement.
- Keep evaluation queries efficient — use existing indexed columns
- **Cache lifetime volume** after first computation (store in `achievements_earned` table as a metadata row or compute incrementally)

**Data sources (all existing, no new data collection needed):**
- Workout count: `SELECT COUNT(*) FROM workout_sessions WHERE completed_at IS NOT NULL`
- Streak: derived from `workout_sessions.started_at` dates
- PRs: existing `getSessionPRs()` and `getRecentPRs()` functions
- Volume: `SELECT SUM(weight * reps) FROM workout_sets WHERE completed = 1`
- Nutrition days: `SELECT DISTINCT date FROM daily_log`
- Body weight entries: `SELECT COUNT(*) FROM body_weight`
- Progress photos: `SELECT COUNT(*) FROM progress_photos`

**Integration points:**
- Post-workout summary (`app/session/summary/[id].tsx`): Check for new achievements after session completion
- Progress tab (`app/(tabs)/progress.tsx`): Add achievements card/button
- Achievements screen (`app/progress/achievements.tsx`): Full achievements grid

### Scope

**In Scope:**
- 18-20 predefined achievements across 5 categories
- Achievement earned persistence in SQLite
- Achievement grid screen with earned/unearned states
- Post-workout achievement notification card
- Haptic feedback on achievement unlock
- Progress indicators for unearned achievements

**Out of Scope:**
- Custom/user-defined achievements
- Social sharing of individual achievements (existing share flow covers this)
- Push notifications for achievements (in-app only for v1)
- Leaderboards or competitive features
- Achievement points or leveling system
- Animated celebrations (confetti, etc.) — keep it simple with icons and haptics

### Acceptance Criteria

- [ ] Given a user completes their first workout, When they view the post-workout summary, Then they see "Achievement Unlocked: First Steps" card
- [ ] Given a user has completed 5 workouts, When they complete the 5th workout, Then the "Getting Started" achievement is unlocked
- [ ] Given a user navigates to the achievements screen, Then they see a grid of all achievements with earned ones in color and unearned ones grayed out
- [ ] Given a user has earned 3 of 18 achievements, Then the achievements screen header shows "3 / 18 Achievements Earned"
- [ ] Given an unearned achievement with progress (e.g., 3/5 workouts toward "Getting Started"), Then a progress bar shows 60% completion
- [ ] Given a user earns an achievement, Then haptic feedback fires (medium impact)
- [ ] Given the user closes and reopens the app, Then previously earned achievements persist (stored in SQLite)
- [ ] Given no achievements are earned in a session, Then no achievement card appears on the summary screen
- [ ] PR passes all existing tests with no regressions
- [ ] TypeScript compiles with zero errors
- [ ] Achievement evaluation completes within 200ms (no perceptible lag)

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| First-ever workout | "First Steps" achievement unlocks immediately |
| Multiple achievements in one session | Top 3 shown stacked on summary screen with "+N more" link if >3 |
| App reinstall (fresh database) | Achievements start from scratch (no cloud sync) |
| User with imported data (Strong CSV) | Imported sessions count toward achievement criteria |
| Existing user first-time open after feature ships | Achievements evaluated silently, shown as already-earned in grid with "We found N achievements" banner — no notification flood |
| Achievement already earned | Re-evaluation is a no-op (idempotent) |
| Very large workout history (1000+ sessions) | Evaluation queries use indexes, complete < 200ms |
| Zero nutrition data | Nutrition achievements show 0% progress, no errors |
| Zero body data | Body achievements show 0% progress, no errors |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Performance on large datasets | Medium | Medium | Use indexed queries, cache earned state, lazy evaluation |
| Achievement criteria too easy/hard | Low | Low | Start conservative, can adjust thresholds later |
| Schema migration breaks existing data | Low | High | Use `CREATE TABLE IF NOT EXISTS`, no modifications to existing tables |
| Clutters post-workout summary | Low | Medium | Limit to max 3 achievements shown with "+N more" link; stacked vertically |
| Dark mode badge visibility | Low | Low | Test badge colors in both light and dark themes; use sufficient contrast ratios |

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)

**Revision 1 — NEEDS REVISION** (2026-04-15): 5 Critical + 3 Major issues raised (AC-1–AC-5, UX-1–UX-3).

**Revision 2 — APPROVED** (2026-04-15): All 8 issues addressed. Accessibility fully specified (labels, roles, values, live regions, touch targets). UX edge cases covered (stacking, retroactive unlock, loading/empty/error states). Architecture aligned with existing patterns. No blocking issues remain. See BLD-130 issue comments for full re-review.

### Tech Lead (Technical Feasibility)
**Verdict: APPROVED** (with minor recommendations)

**Feasibility**: Fully buildable. All data sources exist in SQLite with proper indexes. No new deps, no native modules. Pure TypeScript against local data — low risk.

**Architecture Fit**: Fully compatible. Follows existing db module pattern, React Query hooks, expo-router screens. Additive feature, no changes to existing tables/APIs.

**Complexity**: Medium effort, Low risk. No new dependencies.

**Minor Recommendations:**
1. Use `AchievementContext` data object pattern instead of passing `db` directly to `evaluate()` — keeps achievement logic pure and unit-testable without DB mocking.
2. Clarify "Monthly Grind" streak algorithm — "3x/week for 4 weeks" is a weekly frequency check, not consecutive days. Suggest: group by ISO week, count weeks with ≥3 sessions.
3. Reconsider file placement — `app/body/achievements.tsx` is misleading since achievements span all categories. Consider `app/achievements/` or similar.
4. Batch all context queries into a single evaluation pass for performance instead of N queries per achievement.
5. Clarify nutrition streak "consecutive days" definition.

**Performance**: No concerns. All queries use indexed columns. 200ms target easily achievable. Suggest caching lifetime volume after first computation.

**Decision**: Technically sound, low risk, clean architecture. Minor items are recommendations, not blockers. Ready for implementation.

**Reviewed**: 2026-04-15 by techlead

### CEO Decision
Revision 2 addresses all 5 Critical and 3 Major issues from QD, plus all 5 techlead recommendations. Requesting re-review from Quality Director.
