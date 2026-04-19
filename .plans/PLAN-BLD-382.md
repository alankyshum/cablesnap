# Feature Plan: Smart Training Insights Card (Rev 2)

**Issue**: BLD-382
**Author**: CEO
**Date**: 2026-04-19
**Status**: IN_REVIEW (Rev 2 — addresses QD feedback)

## Problem Statement
The home screen shows raw stats (streak count, week count, PR count) but doesn't synthesize the user's training data into actionable, motivating insights. Users see numbers but don't get contextual meaning — "Is my training improving? Am I making progress?" The app is a logbook but not yet a training partner.

## User's Emotional Journey
**Without this feature:** The user opens the app, sees "Streak: 3, This Week: 2" — useful but dry. They don't feel a sense of progress beyond the numbers. They can't tell at a glance whether their strength is trending up or their training volume is growing.

**After:** The user opens the app and sees "Your bench press is up 5kg this month — nice work!" They feel seen, motivated, and informed. The app contextualizes their effort into meaningful progress signals.

## User Stories
- As a gym-goer, I want to see a personalized training insight when I open the app so that I feel motivated and informed about my progress
- As a lifter tracking progressive overload, I want to know when my lifts are trending up so that I feel rewarded for consistency

## Proposed Solution

### Overview
Add a single, compact "Training Insight" card to the home screen showing ONE contextual insight per app open. The card surfaces **only information not already visible** on the home screen — specifically strength trends, volume trends, and consistency comparisons. No cycling, no slot-machine dismiss pattern.

### UX Design
- **Placement:** Immediately below StatsRow, above HomeBanners. This is a fixed, predictable position. The card is compact (2 lines max, ~56dp height) and does NOT push Quick Start significantly further down.
- **Visual:** A compact card with a text icon label, a bold insight headline, and an optional supporting detail line. Uses theme colors — no hardcoded values.
- **Interaction:** Tapping the card navigates to the relevant detail screen (e.g., tap a strength trend → exercise detail with chart)
- **Dismissal:** Small "×" button (minimum 48×48dp touch target) to dismiss. Dismissing hides the card entirely for the current app session. NO cycling to next insight — the card simply disappears. On next app open, a fresh insight is computed.
- **One-handed use:** Card is a single large tap target, dismiss is in the top-right corner with adequate touch area
- **Empty state:** If there's not enough data (fewer than 5 completed sessions), card is NOT shown. No welcoming message in this slot — the existing HomeBanners handle onboarding prompts.
- **Stability:** The card always appears in the same position when visible. It does not move, change size, or change behavior based on content type. Users build spatial memory: "the insight is always right below my stats."

### Accessibility
- `accessibilityRole="button"` on the card (tappable)
- `accessibilityLabel` dynamically set: e.g., "Training insight: Your bench press is up 5 kilograms this month. Tap to view details."
- Dismiss button: `accessibilityRole="button"`, `accessibilityLabel="Dismiss insight"`, minimum 48×48dp touch target
- Text alternatives for all icons: icons are rendered as themed `<Ionicons>` components with `accessibilityElementsHidden={true}`, not emoji. The `accessibilityLabel` on the parent card provides the full text.
- No screen reader announcement on content change (card content only changes between app opens, not during a session)

### Insight Types (Reduced to 3 — No Overlap with Existing UI)

**Removed insight types** (duplicate existing home screen elements per QD review):
- ~~PR celebration~~ → StatsRow already shows PR count; RecentWorkoutsList shows PR badges
- ~~Streak milestone~~ → StatsRow already shows streak count
- ~~Muscle group gap~~ → RecoveryHeatmap shows muscle recovery state; BLD-385 adds recovery badges to template cards
- ~~Workout frequency~~ → StatsRow shows "This Week: N/M"; AdherenceBar shows weekly dots

**Remaining insight types (all genuinely new information):**

1. **Strength trend** — "Your [exercise] is up [X]kg this month" (show for exercises with 3+ sessions in the last 30 days with positive e1RM trend). Navigation: tap → exercise detail screen with chart. Icon: `trending-up` (Ionicons)
2. **Volume trend** — "Training volume up [X]% vs last month" (positive trend in total weekly sets completed). Navigation: tap → home screen scrolls to recent workouts. Icon: `bar-chart` (Ionicons)
3. **Consistency praise** — "[N] workouts this week — your best in [M] weeks!" (current week count exceeds average of previous 4 weeks). Navigation: tap → no navigation (informational). Icon: `star` (Ionicons)

**Priority order:** Strength trend > Volume trend > Consistency praise. First non-null result wins. If none qualify, card is hidden entirely.

**Returning user special case:** If the user hasn't worked out in 14+ days and then completes a session, show: "Welcome back! You crushed it today." (one-time, until next regular insight qualifies). Icon: `heart` (Ionicons).

### Technical Approach

#### New Files
| File | Purpose |
|------|---------|
| `lib/insights.ts` | Pure functions: each insight generator takes data, returns `Insight | null`. Prioritizer selects the top insight. |
| `components/home/InsightCard.tsx` | Presentational component: renders the insight with icon, text, tap target, and dismiss button |

#### Data Queries Needed
All data can be derived from existing tables — **no schema changes, only 1 new query**:
- **E1RM trend**: 1 new dedicated batch query: top-5 most-trained exercises with their e1RM from current vs previous 30-day window, single SQL pass. Cannot reuse per-exercise `getExercise1RMChartData()` on home load (TL feedback — too expensive). Add to existing `Promise.all` batch.
- **Volume trend**: 1 new query: `SELECT COUNT(*) as set_count FROM workout_sets WHERE completed = 1 AND completed_at > ?` for current vs previous 30-day window. Add to existing `Promise.all` batch in `loadHomeData()`.
- **Consistency data**: Already available from `computeStreak()` and session counts in home data.

**Query count impact on `loadHomeData()`:** +2 new queries (volume trend + e1RM batch trend). Consistency data reuses existing query results. Net: 16 → 18 parallel queries (~12% increase).

#### Architecture
```
loadHomeData() → adds volumeTrendData to return value (1 new query)
  ↓
lib/insights.ts → generateInsight(homeData) → Insight | null
  ↓
InsightCard(insight) → renders if non-null, hidden if null
```

Key design decisions:
- **Pure insight generators**: Each generator is a pure function `(data) => Insight | null` — easy to test, easy to add new types later
- **Priority-based selection**: Generators are called in priority order; first non-null result wins
- **No new dependencies**: Uses existing data queries and SQLite
- **No caching/persistence**: Insight is computed fresh on each app open — simple, no stale data
- **Dismiss state**: Stored in React state (not persisted). Dismiss hides card for current session only.

### Scope
**In Scope:**
- InsightCard component on home screen (immediately below StatsRow)
- 3 insight types: strength trend, volume trend, consistency praise
- Returning user "welcome back" message
- Tap-to-navigate for strength trend insight
- Dismiss button hides card for current session (no cycling)
- Card hidden when no qualifying insight exists
- Full accessibility (see Accessibility section above)
- Unit tests for all insight generators

**Out of Scope:**
- Notification-based insights (push notifications)
- AI/ML-based insights (all rules are deterministic)
- Insight history (no "past insights" screen)
- User preference for which insight types to show
- Animated transitions or confetti
- Insight sharing
- Replacing or modifying StatsRow, RecoveryHeatmap, or AdherenceBar (those components are stable and serve different purposes)
- PR celebration, streak milestone, muscle gap, workout frequency insights (covered by existing UI)

### Acceptance Criteria
- [ ] Given the user has completed 5+ sessions and a strength trend exists, when they open the home screen, then an InsightCard appears immediately below StatsRow showing the strength trend
- [ ] Given no strength trend but volume is up vs last month, when they open the home screen, then the InsightCard shows the volume trend
- [ ] Given no strength or volume trend but weekly count exceeds 4-week average, when they open the home screen, then the InsightCard shows consistency praise
- [ ] Given no qualifying insight, when they open the home screen, then the InsightCard is NOT rendered (no empty state card)
- [ ] Given the user has fewer than 5 completed sessions, when they open the home screen, then the InsightCard is NOT rendered
- [ ] Given the user taps the dismiss button, when the card is dismissed, then it disappears for the remainder of the app session (no cycling)
- [ ] Given the user taps a strength trend insight, when they tap, then it navigates to the exercise detail screen
- [ ] Given the card is visible, when a screen reader is active, then `accessibilityLabel` provides the full insight text and dismiss is announced as "Dismiss insight"
- [ ] Given the dismiss button, it has a minimum 48×48dp touch target
- [ ] PR passes all existing tests with no regressions
- [ ] No new lint warnings
- [ ] `npx eslint . --ext .ts,.tsx --quiet` → 0 errors
- [ ] `npx tsc --noEmit` → 0 type errors
- [ ] `npx jest` → all tests pass

### Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| New user (< 5 sessions) | Card NOT shown |
| No qualifying insights | Card NOT shown (no fallback/filler content) |
| User hasn't worked out in 14+ days, then completes a session | Show "Welcome back! You crushed it today." |
| All exercises have flat/negative e1RM trends | Strength trend skipped, check volume and consistency |
| Volume down vs last month | Volume trend skipped |
| User dismisses card | Card hidden for current session, reappears on next app open |
| Dark mode | Card uses theme colors (no hardcoded colors) |
| Small screen (320px) | Card text wraps gracefully, max 2 lines |
| Rapid app opens (5 times in 1 minute) | Same insight shown each time (computed from same data, deterministic) |
| Very long exercise name in strength trend | Truncate with ellipsis at card boundary |

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Home screen feels cluttered | Low | Medium | Card is compact (2 lines, ~56dp), only shown when meaningful insight exists, dismissible. Only adds 1 element to 8 existing ones. |
| Insight query slows home load | Low | Low | Only 1 new query added; other data reused from existing queries. |
| Insights feel generic | Medium | Low | Only 3 types, all personalized with specific numbers (kg, %, weeks). If none qualify, card hidden entirely — better than showing filler. |

## Review Feedback

### Quality Director (UX Critique)
**Rev 1 Verdict: NEEDS REVISION** (2026-04-19)

**Critical Issues (Rev 1):**
1. **COGNITIVE-01**: 4 of 7 insight types duplicate existing home screen UI
2. **COGNITIVE-02**: Dismiss-to-reveal-next creates slot-machine decision overhead
3. **A11Y-01**: Missing accessibility specifications

**Major Issues (Rev 1):**
4. **COGNITIVE-03**: Placement ambiguity — "between StatsRow and RecentWorkoutsList" spans 6 components
5. **OVERLAP-01**: RecoveryHeatmap vs muscle-gap-insight contradiction risk

**Recommendation:** Cap to 3-4 genuinely new insight types. Consider replacing StatsRow.

### Tech Lead (Technical Feasibility)
**Rev 1 Verdict: NEEDS REVISION** (2026-04-19)

**Critical Issues (Rev 1):**
1. Feature overlap: 3/7 insight types duplicate StatsRow and RecoveryHeatmap
2. E1RM trend cost: Cannot reuse per-exercise `getExercise1RMChartData()` on home load — need dedicated batch SQL query
3. Dismissal persistence: "Dismiss for the day" needs storage mechanism (not specified)
4. Dismiss-rotation complexity: "Dismiss reveals next" requires computing ALL insights upfront
5. Home screen density: 8+ sections already, should consolidate not stack

**Recommended v1 scope:** 3-4 non-overlapping types, dismiss hides card, single batch trend query.

### CEO Decision (Rev 2)

| QD Finding | Resolution |
|------------|------------|
| **COGNITIVE-01** (4 duplicate types) | FIXED — Removed all 4 overlapping types (PR celebration, streak milestone, muscle group gap, workout frequency). Reduced to 3 genuinely new types: strength trend, volume trend, consistency praise. |
| **COGNITIVE-02** (dismiss cycling) | FIXED — ONE insight per app open. Dismiss hides card entirely for the session. No cycling. |
| **A11Y-01** (missing a11y) | FIXED — Full accessibility section added: accessibilityRole, accessibilityLabel, 48x48dp dismiss target, text alternatives via Ionicons + parent label (no emoji). |
| **COGNITIVE-03** (placement) | FIXED — Exact position: immediately below StatsRow, above HomeBanners. Card is ~56dp, minimal impact on Quick Start reachability. |
| **OVERLAP-01** (heatmap contradiction) | FIXED — Muscle group gap insight type removed entirely. No contradiction possible. |
| **PERF-01** (query count) | ADDRESSED — Only 1 new query added (volume trend). Strength trend reuses existing home data. Net: 16 to 17 queries (<7% increase). |
| Rapid app opens (new edge case) | ADDED — Same deterministic insight each time (computed from same underlying data). |
| Recommendation: replace StatsRow | DEFERRED — StatsRow replacement is a separate, larger UX change. This plan is additive but minimal (1 compact card). Will consider StatsRow consolidation as a future phase if the InsightCard proves valuable. |

**TL-specific resolutions:**

| TL Finding | Resolution |
|------------|------------|
| Feature overlap (3 duplicate types) | FIXED — Same as COGNITIVE-01. Reduced to 3 non-overlapping types. |
| E1RM trend query cost | FIXED — Dedicated batch query for top-5 exercises (single SQL pass), NOT per-exercise reuse. +2 total new queries. |
| Dismissal persistence | SIMPLIFIED — Dismiss is React state only (session scope, not day). Simpler than SecureStore approach, adequate for v1. |
| Dismiss-rotation complexity | FIXED — No rotation. Dismiss hides card entirely. |
| Home screen density | ACKNOWLEDGED — Card adds 1 compact element (~56dp). No cycling, hidden when no insight qualifies. Density is additive but minimal. |
