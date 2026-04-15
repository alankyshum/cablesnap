# Feature Plan: Achievement & Milestone System

**Issue**: BLD-129
**Author**: CEO
**Date**: 2026-04-15
**Status**: DRAFT

## Problem Statement

FitForge has comprehensive workout tracking, nutrition, and progress features — but lacks a gamification layer to celebrate user milestones and drive continued engagement. Users who hit personal records, maintain streaks, or reach volume milestones get no formal recognition beyond data points. Research shows gamification elements (badges, achievements, milestones) significantly increase user retention in fitness apps.

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
- Display a celebratory card at the top of the post-workout summary: "� Achievement Unlocked: [Name]!"
- Card shows achievement icon, name, description, and "View All" link
- Haptic feedback (medium impact) on achievement unlock
- If multiple achievements unlock in one session, show them stacked

**Achievements screen (`app/body/achievements.tsx`):**
- Accessible from the Progress tab via a "🏆 Achievements" card/button
- Grid layout of achievement badges (earned = full color, unearned = grayed out with progress bar)
- Categories: Consistency, Strength, Volume, Nutrition, Body
- Each badge shows: icon, name, description, date earned (or progress toward earning)
- Total achievement count displayed at top: "23 / 45 Achievements Earned"

**Achievement categories and examples:**

| Category | Achievement | Criteria | Icon |
|----------|------------|----------|------|
| **Consistency** | First Steps | Complete 1 workout | 🏃 |
| **Consistency** | Getting Started | Complete 5 workouts | 🔥 |
| **Consistency** | Dedicated | Complete 25 workouts | 💪 |
| **Consistency** | Iron Will | Complete 100 workouts | 🏋️ |
| **Consistency** | Legend | Complete 500 workouts | 👑 |
| **Consistency** | Week Warrior | 7-day workout streak | ⚡ |
| **Consistency** | Monthly Grind | 30-day workout streak (at least 3x/week for 4 weeks) | 🌟 |
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
- `lib/achievements.ts` — Pure functions defining achievements and evaluation logic. No side effects. Each achievement has an `id`, `name`, `description`, `category`, `icon`, and `evaluate(db) => Promise<{ earned: boolean; progress: number; earnedAt?: number }>` function.
- `lib/db/achievements.ts` — Database queries to check achievement criteria and store earned achievements.
- New SQLite table: `achievements_earned (id TEXT PRIMARY KEY, achievement_id TEXT NOT NULL UNIQUE, earned_at INTEGER NOT NULL)`
- Evaluation runs after each workout completion (in the session completion flow) and on achievements screen mount.

**Achievement evaluation strategy:**
- Lazy evaluation: only check achievements when the achievements screen is opened or a workout is completed
- Cache earned achievements in the `achievements_earned` table to avoid re-evaluation
- For unearned achievements, compute progress on-demand (percentage toward goal)
- Keep evaluation queries efficient — use existing indexed columns

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
- Achievements screen (`app/body/achievements.tsx`): Full achievements grid

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
| Multiple achievements in one session | All are shown stacked on summary screen |
| App reinstall (fresh database) | Achievements start from scratch (no cloud sync) |
| User with imported data (Strong CSV) | Imported sessions count toward achievement criteria |
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
| Clutters post-workout summary | Low | Medium | Limit to max 3 achievements shown, "View All" for more |

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)
**Verdict: NEEDS REVISION** — 5 Critical + 3 Major issues (2026-04-15)

Must fix before approval:
1. AC-1: Add accessibilityLabel and accessibilityRole for every achievement badge (emoji icons read inconsistently by screen readers)
2. AC-2: Add non-color differentiator for earned vs unearned state (lock icon, text label) — color alone fails colorblind users
3. AC-3: Add accessibilityValue (min/max/now/text) to all progress bars
4. AC-4: Add accessibilityLiveRegion="polite" to achievement notification card on post-workout summary
5. AC-5: Specify minimum 48x48dp touch targets for achievement grid badges
6. UX-1: Move max-3 limit into UX Design section, define stacking behavior (vertical stack, "+N more" link)
7. UX-2: Define first-run retroactive unlock experience for existing users (10+ achievements detected at once)
8. UX-3: Fix file location from app/body/achievements.tsx to app/progress/achievements.tsx (matches navigation hierarchy)

Recommendations (nice to have): simplify schema (achievement_id as PK), add loading/empty/error states, check useReducedMotion for haptics, dark mode badge visibility.

See BLD-130 issue comments for full review with detailed rationale.

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
