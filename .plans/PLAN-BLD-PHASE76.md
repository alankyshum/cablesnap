# Feature Plan: Overreaching Detection & Deload Nudge

**Issue**: BLD-459
**Author**: CEO
**Date**: 2026-04-20
**Status**: DRAFT

## Problem Statement

Users who train consistently (3-5x/week) risk **functional overreaching** — training beyond their recovery capacity — without realizing it. Overreaching leads to:
- Performance plateaus (unable to progress despite training hard)
- Increased injury risk
- Burnout and loss of motivation
- Chronic fatigue that accumulates over weeks

CableSnap already tracks all the signals needed to detect this: weights lifted, RPE per set, session ratings, workout frequency, volume per muscle group. But this data sits unused for proactive guidance. Users only discover overreaching after weeks of frustration.

**Why now?** The app's data richness (75 phases of features) means we have everything needed to compute overreaching indicators. This feature differentiates CableSnap from competitors that only track data passively.

## User's Emotional Journey

**Without this feature:** "I've been working so hard but my bench press hasn't gone up in 3 weeks. Am I doing something wrong? Should I train harder? Maybe this program doesn't work." → Frustration, self-doubt, risk of pushing even harder (making it worse).

**After this feature:** "CableSnap noticed my performance has dipped and suggested I take it easier this week. That makes sense — I HAVE been training hard. A deload sounds smart." → Feeling supported, educated, trusting the app to look out for them.

## User Stories

- As a consistent gym-goer, I want to know when I'm overreaching so I can take a proactive deload before performance suffers badly
- As a gym-goer, I want to understand WHY the app thinks I should deload so I trust the recommendation
- As a gym-goer, I want to be able to dismiss the nudge if I disagree (I know my body)

## Proposed Solution

### Overview

Add an **Overreaching Detection Engine** that analyzes the user's last 3-6 weeks of training data and computes an "overreaching score" based on multiple signals. When the score exceeds a threshold, display a nudge card on the home screen suggesting a deload week.

### Detection Signals (Evidence-Based)

The engine uses multiple converging signals — no single signal triggers a nudge. This reduces false positives.

| Signal | How We Detect It | Weight |
|--------|-----------------|--------|
| **Performance plateau/decline** | e1RM trend for primary compounds shows 0% or negative change over 2+ weeks | High |
| **Rising RPE for same loads** | Average RPE increasing while weights are flat or declining | High |
| **Declining session ratings** | Average session rating trending down over 3+ sessions | Medium |
| **High cumulative volume** | Total weekly sets exceeding MRV for 3+ consecutive weeks | Medium |
| **Missed sessions** | Scheduled sessions skipped after consistent attendance | Low |

A weighted score determines the nudge:
- Score < 3: No nudge (normal training)
- Score 3-5: Subtle nudge ("Consider a lighter week soon")
- Score > 5: Stronger nudge ("Your training data suggests you'd benefit from a deload")

### UX Design

#### Home Screen Nudge Card
- Appears below the InsightCard (or replaces it when active, since overreaching is higher priority)
- Shows an icon (⚡ or 🔋) with a short message
- Tappable → expands to show WHY the app thinks they should deload (which signals triggered)
- Dismissible with "Got it" (remembers dismissal for 7 days)
- No nag — if dismissed, doesn't reappear until score changes significantly

#### Expanded Detail View
- Shows the specific signals that triggered the nudge
- "Your bench press and squat haven't improved in 3 weeks"
- "Your average RPE has been rising while weights stayed the same"
- "You've rated your last 4 sessions 2-3 stars"
- Simple deload guidance: "Try reducing weights to 60% and sets by 40% this week"
- Link to relevant exercises/progress views

#### Design Principles
- **Non-intrusive** — a card, not a modal or popup
- **Educational** — explains the "why" so users learn about training science
- **Dismissible** — respects user autonomy (they might be peaking for a competition)
- **Transparent** — shows exactly which data points triggered the recommendation
- **No false authority** — uses language like "suggests" and "consider," never "you must"

### Technical Approach

#### New Files
- `lib/overreaching.ts` — pure detection logic (signals, scoring, thresholds)
- `components/home/DeloadNudgeCard.tsx` — home screen nudge card UI
- `hooks/useOverreachingScore.ts` — React hook that computes score from DB data
- `__tests__/lib/overreaching.test.ts` — unit tests for detection logic

#### Data Queries (Using Existing Tables)
All data is already in the DB. No schema changes needed.

1. **e1RM trends**: Query `sets` table joined with `exercises` for compound lifts, compute weekly e1RM, compare recent 2 weeks vs prior 2 weeks
2. **RPE trends**: Query `sets` table for average RPE per week over last 4 weeks
3. **Session ratings**: Query `sessions` table for rating values over last 3 weeks
4. **Volume trends**: Query via existing `useMuscleVolume` patterns for weekly set counts
5. **Session frequency**: Query `sessions` table for completed sessions per week vs user's historical average

#### Architecture Decisions
- **Pure functions** for detection logic (like `lib/insights.ts` and `lib/achievements.ts`)
- **Computation on demand** via React Query (not background processing)
- **No new dependencies** — uses existing DB queries and patterns
- **Dismissal state** stored in `app_settings` table (existing key-value store)

#### Performance Considerations
- Detection runs on home screen mount only (not on every navigation)
- Queries are bounded to last 6 weeks of data (small dataset)
- Results cached via React Query with 5-minute stale time
- No impact on session logging performance

### Scope

**In Scope:**
- Overreaching detection engine with 5 signals
- Home screen nudge card (dismissible)
- Expanded detail view showing which signals triggered
- Simple deload guidance text
- Unit tests for detection logic
- Dismissal persistence (7-day window)

**Out of Scope:**
- Auto-generating deload program/template (future Phase 77+)
- Push notifications (would need notification infrastructure)
- Integration with programs (auto-inserting deload week)
- Machine learning / adaptive thresholds (V1 uses fixed evidence-based thresholds)
- Nutrition-related fatigue signals (future enhancement)

### Acceptance Criteria
- [ ] Given a user with 4+ weeks of training data showing performance decline (e1RM down ≥5% over 2 weeks) AND rising RPE (avg RPE up ≥0.5 over 2 weeks), When they open the home screen, Then a deload nudge card appears
- [ ] Given a user training normally (e1RM stable or improving), When they open the home screen, Then no deload nudge appears
- [ ] Given the nudge is showing, When the user taps it, Then it expands to show which signals triggered and deload guidance
- [ ] Given the nudge is showing, When the user taps "Got it" to dismiss, Then the nudge disappears and doesn't return for 7 days
- [ ] Given fewer than 4 weeks of training data, When the home screen loads, Then no nudge is computed (insufficient data)
- [ ] Given the detection engine runs, Then it completes in <100ms (bounded query over 6 weeks)
- [ ] All tests pass with no regressions
- [ ] Test budget stays within 1800 limit
- [ ] No new lint warnings
- [ ] Nudge card is accessible (screen reader labels, sufficient contrast, touch target ≥48dp)

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| New user (<4 weeks data) | No nudge shown — insufficient data message if they navigate to detail |
| User only does bodyweight exercises | e1RM signal skipped; other signals still evaluated |
| User dismissed nudge, then data improves | Nudge stays dismissed for 7 days regardless |
| User dismissed nudge, score gets worse | Nudge reappears (significant score change overrides dismissal) |
| Single bad session (outlier) | No nudge — requires trend over 2+ weeks |
| User trains 1x/week (low frequency) | Frequency signal adjusted — overreaching less likely at low frequency |
| Session with no RPE logged | RPE signal uses only sessions with RPE data; if <3 sessions have RPE, skip signal |
| All sessions rated 5 stars then drops to 3 | Rating signal triggers (trend is clear) |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| False positive nudges (annoying users) | Medium | Medium | Require multiple converging signals; easy dismissal; conservative thresholds |
| False negatives (missing real overreaching) | Low | Low | V1 prioritizes precision over recall — better to miss some cases than false alarm |
| Performance impact on home screen | Low | Medium | Bounded queries (6 weeks), React Query caching, <100ms target |
| Test budget exceeded | Low | High | Estimate: ~15-20 tests needed, budget is 1699/1800 (101 remaining) |
| Sports science accuracy | Medium | Low | Use established literature (Israetel/RP, NSCA); validate with sports-science review skill |

## Review Feedback

### UX Designer (Design & A11y Critique)
_Pending review_

### Quality Director (Release Safety)
_Pending review_

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
