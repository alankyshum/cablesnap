# Feature Plan: Muscle-Group Volume Balance Insight

**Issue**: BLD-3612  **Author**: CEO  **Date**: 2026-07-23
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

## Research Source
- **Origin:** Daily product research (parent BLD-3610) + competitor gap analysis of Strong/Hevy/JEFIT weekly-volume dashboards.
- **Pain point observed:** Recurring r/naturalbodybuilding / r/weightlifting theme — lifters unknowingly under-train antagonists (e.g. plenty of chest/quads, neglected back/hamstrings/rear-delts) and only discover imbalance after a plateau or injury. Existing apps show raw weekly set counts but rarely *proactively flag* which muscles fell below MEV or above MRV; the user must go read a dashboard and interpret it themselves.
- **Frequency:** Recurring theme, not a one-off. "How much volume is enough per muscle?" and "am I neglecting X?" are perennial questions.

## Problem Statement
CableSnap already has a full **Progress → Muscle Volume** screen (`MuscleVolumeSegment`) that renders per-muscle weekly set counts against evidence-based MEV/MRV landmarks (`lib/volume-landmarks.ts`), and even computes an `underMev`/`overMrv` summary string. **But that value is buried** — the user must navigate to the Progress tab, open the muscle-volume segment, and read the bars to notice an imbalance. Most users never do.

The home screen already surfaces the single most relevant training insight via `generateInsight` (`lib/insights.ts`) — strength, volume-trend, consistency, returning, goal-progress. There is **no balance insight**. This plan adds one: proactively surface "N muscles under-trained this week" (or over-trained) on the home screen, with a tap that deep-links to the muscle-volume screen with the offending muscle pre-selected.

This directly advances the parent goal *"AI-powered performance insights & growth suggestions"* — turning already-collected data into an actionable, no-effort nudge.

## Behavior-Design Classification (MANDATORY)
Does this shape user behavior? (see §3.2 trigger list)
- [x] **NO** — purely informational/functional. This is a factual, data-derived status readout ("2 muscles under MEV this week"), identical in nature to the existing strength/volume/consistency insights. It contains:
  - No streaks, no reminders/notifications, no rewards/XP, no gamification.
  - No loss-framing, FOMO, guilt, or identity framing. Copy is neutral and descriptive.
  - No goal-setting/commitment device or habit loop.
  It surfaces existing on-screen data one navigation level earlier. **No psychologist review required.**
  - *Guardrail (see Risk):* copy MUST stay neutral ("under MEV" / "above MRV" as informative training-science terms), never scolding ("you're falling behind"). If a reviewer feels any proposed string crosses into motivational/guilt framing, escalate to `@psychologist` for a scoping verdict — cheap.

## User Stories
- As a lifter, I want the home screen to tell me when I've under- or over-trained a muscle group this week, so I can adjust before it becomes a plateau or overuse issue — without digging through the Progress tab.
- As a user who taps the insight, I want to land directly on the muscle-volume screen with the flagged muscle already selected, so I can see the detail and trend immediately.

## Proposed Solution

### Overview
Add a new `balance` insight generator to `lib/insights.ts` and wire the required data (current-week per-muscle set counts + effective landmarks) into `InsightData` via `loadHomeData.ts`. The generator reuses the existing `getVolumeStatus` primitive — no new volume math. The insight is inserted into the `generateInsight` priority chain at a low priority (below strength/volume/consistency) so it only surfaces when nothing more celebratory applies, keeping the home screen positive-first.

### UX Design
- **Card:** identical visual treatment to existing insight cards (icon + title + accessibility label). Icon: reuse `bar-chart` OR add a new `scale-balance` icon (see Tech note). Title examples:
  - Under only: `2 muscles are under your weekly target` (or singular `Your hamstrings are under this week's target`)
  - Over only: `1 muscle is above your weekly cap`
  - Both: `2 muscles under target · 1 above cap this week`
- **Tap target:** deep-links to the Progress → Muscle Volume screen with the first flagged muscle pre-selected (reuse existing `selectMuscle`). Requires a lightweight nav param (e.g. `?muscle=hamstrings&segment=muscle-volume`).
- **Empty/optimal state:** when every trained muscle is within MEV–MRV, this insight returns `null` (falls through to the next insight or the existing default). No "everything's fine" nag.
- **A11y:** `accessibilityLabel` mirrors title + "Tap to view muscle volume details."
- **Copy decision:** prefer the softer phrase "weekly target / weekly cap" on the home card (user-facing), while the detail screen keeps the precise "MEV/MRV" science terms. Final wording is a reviewer discussion point.

### Technical Approach
- **Data:** `getMuscleVolumeForWeek(offset=0)` already exists (used by `useMuscleVolume`). Call it in `loadHomeData.ts` for the current week; load effective landmarks via existing `getAppSetting(VOLUME_LANDMARKS_SETTING_KEY)` → `parseCustomLandmarks` → `mergeWithDefaults`.
- **New types in `lib/insights.ts`:**
  - Extend `InsightType` with `"balance"`.
  - Add `MuscleBalanceRow = { muscle: MuscleGroup; sets: number; status: VolumeStatus }` (or pass raw `{muscle, sets}` + landmarks and compute status inside the generator — preferred, keeps landmarks logic in one place).
  - Extend `InsightData` with `muscleVolume?: { muscle: MuscleGroup; sets: number }[]` and `landmarks?: Record<MuscleGroup, VolumeLandmarks>`.
  - Add optional `insight.muscle?: MuscleGroup` field for nav deep-link (parallels existing `exerciseId`).
- **New generator `generateBalanceInsight(rows, landmarks)`:** iterate rows, count `below_mev` and `above_mrv` via `getVolumeStatus`; if both counts are 0 return `null`; pick the first flagged muscle for the deep-link; build title/label. Guard: require at least e.g. 3 distinct muscles trained this week (avoid flagging "everything under MEV" on a near-empty week — a rest week is not an imbalance).
- **Priority placement:** insert `generateBalanceInsight` in the chain **after** consistency, **before** returning (tune during review). Low enough to stay positive-first; high enough to be seen.
- **Icon:** if `bar-chart` reuse is confusing next to the volume-trend insight, add a `scale-balance`/`scale` lucide icon to the Insight `icon` union and the home card's icon map. Small additive change.
- **Nav wiring:** confirm the Progress tab route accepts a `muscle` (and segment) param and calls `selectMuscle` on mount. If not, add param handling in `MuscleVolumeSegment` (small, additive).

### Data source note
No schema/DB migration. All inputs are existing functions (`getMuscleVolumeForWeek`, `getAppSetting`) and existing pure helpers (`getVolumeStatus`, `mergeWithDefaults`).

## Scope
**In:**
- New `balance` insight generator + types in `lib/insights.ts`.
- Wiring current-week muscle volume + landmarks into `loadHomeData.ts` → `InsightData`.
- Deep-link tap → muscle-volume screen with muscle pre-selected.
- Unit tests for the generator (all branches).
- Optional new lucide icon for the insight.

**Out:**
- No changes to the MEV/MRV landmark values themselves.
- No new standalone screen (the muscle-volume screen already exists).
- No notifications/push, no history of past-week flags, no trend-of-imbalance.
- No auto-recommendation of exercises to fix the imbalance (future follow-up).

## Acceptance Criteria
- [ ] Given the current week has ≥3 trained muscles and ≥1 muscle below MEV or above MRV, When the home screen loads and no higher-priority insight qualifies, Then the balance insight card appears with an accurate count.
- [ ] Given every trained muscle is within MEV–MRV, When the home screen loads, Then `generateBalanceInsight` returns null (no card).
- [ ] Given fewer than 3 muscles trained this week, When the home screen loads, Then no balance insight is shown (rest-week guard).
- [ ] Given the balance insight is shown, When the user taps it, Then the app navigates to Progress → Muscle Volume with the first flagged muscle pre-selected.
- [ ] Given a higher-priority insight (strength/volume/consistency) qualifies, When the home screen loads, Then that insight is shown instead of balance.
- [ ] Custom user landmarks (from Settings) are respected, not just DEFAULT_LANDMARKS.
- [ ] PR passes all tests with no regressions.
- [ ] No new lint warnings; files stay within the repo's line-count decomposition caps.

### Headless Verification Path
| Device/Manual AC | Risk it covers | Headless proxy |
|------------------|----------------|----------------|
| "Tap insight navigates to muscle-volume with muscle preselected" | Nav param + selectMuscle wiring | Unit/component test asserting the nav call is invoked with the correct `muscle` param; component test that `MuscleVolumeSegment` selects the muscle when the param is present |
| "Card renders correctly on device" | Visual regression | Existing insight-card render test extended for the `balance` type; snapshot of title + a11y label |
All ACs are headless-verifiable. No device-only AC.

## Edge Cases
| Scenario | Expected |
|----------|----------|
| Empty week (0 muscles trained) | No card (rest-week guard) |
| 1–2 muscles trained | No card (guard) |
| All muscles optimal | No card |
| Only over-MRV muscles | Over-only copy |
| Only under-MEV muscles | Under-only copy |
| Both under and over | Combined copy |
| Custom landmarks set in Settings | Custom values used |
| Higher-priority insight qualifies | Balance suppressed (priority chain) |
| Malformed stored landmarks | `parseCustomLandmarks` returns null → DEFAULT_LANDMARKS |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Copy feels scolding / behavior-shaping creep | Low | Med | Neutral "target/cap" wording; escalate to psychologist if any reviewer flags framing |
| False imbalance flags on rest/light weeks | Med | Low | ≥3-muscle guard; only current week |
| Home data-load cost (extra query) | Low | Low | Single indexed week query, already used elsewhere; runs in existing parallel load |
| Nav param not supported by current route | Med | Low | Additive param handling in MuscleVolumeSegment; verified in review |
| Priority placement annoys users (too frequent) | Low | Med | Low priority in chain, null on optimal — tunable |

## Review Feedback
### Quality Director (UX)
_Pending_
### Tech Lead (Feasibility)
_Pending_
### Psychologist (Behavior-Design)
N/A — Classification = NO. (Escalate only if a reviewer flags copy framing.)
### CEO Decision
_Pending_
