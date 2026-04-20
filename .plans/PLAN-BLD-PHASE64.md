# Feature Plan: RMR Override for Accurate Macro Targets (Phase 64)

**Issue**: BLD-TBD
**Author**: CEO
**Date**: 2026-04-20
**Status**: DRAFT

## Problem Statement
Users who have had professional metabolic testing (indirect calorimetry) cannot use their measured RMR in CableSnap. The app currently estimates BMR using the Mifflin-St Jeor equation, which can deviate 10–20% from an individual's actual metabolic rate — especially for athletic populations or users with metabolic adaptations from chronic dieting. This forces power users to mentally adjust the app's recommendations, breaking trust in the calorie/macro targets.

**User request**: GitHub #243 — "Allow user to input RMR (rest metabolism rate) in body profile"

## User's Emotional Journey
**Without this feature**: "The app says I burn 2,100 calories but my metabolic test showed 1,750 RMR. The macro targets are probably wrong, so I track in a spreadsheet instead. Frustrating."

**After this feature**: "I entered my measured RMR and now the calorie targets match my metabolic test results. I trust these numbers. The app is working FOR me, not against me."

## User Stories
- As a user who has had a metabolic test, I want to input my measured RMR so that my calorie and macro targets are based on my actual metabolism, not a formula estimate
- As a user without metabolic testing, I want the app to continue working exactly as before — the RMR field should not confuse me or make me feel I'm missing something

## Proposed Solution

### Overview
Add an optional "Measured RMR" numeric input field to the body profile. When provided, the app uses this value instead of the Mifflin-St Jeor calculation to compute TDEE and macro targets. Include validation guardrails recommended by the sports science review panel.

### Sports Science Review
**Verdict: APPROVE_WITH_CHANGES** (reviewed 2026-04-20)

Required changes incorporated in this plan:
1. ✅ Place in body profile (not onboarding) to avoid confusing novices
2. ✅ Add help text defining valid RMR sources (indirect calorimetry only)
3. ✅ Implement ≥20% deviation warning comparing input vs Mifflin-St Jeor estimate
4. ✅ Keep existing absolute minimum calorie floor (1,200 kcal) intact

### UX Design

**Placement**: In the existing BodyProfileForm component, below the current fields (weight, height, birth year, sex, activity level, goal). NOT in onboarding — only in settings body profile.

**Field design**:
- Label: "Measured RMR (optional)"
- Input: Numeric, suffix "kcal/day"
- Help tooltip (ⓘ icon): "Enter your Resting Metabolic Rate from a clinical metabolic test (indirect calorimetry). Do not use smart scale or fitness tracker estimates — they're often less accurate than our built-in formula. Leave blank to use the standard calculation."
- Clear button (×) to remove the override and revert to formula

**Deviation warning**: If the user enters an RMR that differs by more than 20% from the Mifflin-St Jeor estimate:
- Show inline warning: "This differs significantly from the estimated value ([X] kcal). Please confirm this comes from a clinical metabolic test."
- Do NOT block the input — just warn. User can proceed.

**Calorie floor**: The existing `CALORIE_FLOOR = 1200` in `nutrition-calc.ts` remains active regardless of input source. If RMR override + activity multiplier + goal adjustment results in < 1,200 kcal, the floor applies and a `belowFloor` flag is returned.

### Technical Approach

**Data model changes**:
- Add `rmr_override?: number | null` to `NutritionProfile` type in `lib/nutrition-calc.ts`
- The body profile is stored via `updateBodyProfile` in `lib/db/settings.ts` as a JSON blob — no schema migration needed, just add the optional field

**Business logic changes** (`lib/nutrition-calc.ts`):
- `calculateFromProfile()`: If `profile.rmr_override` is provided and > 0, use it directly instead of calling `calculateBMR()`. TDEE is still computed as `rmr_override * activityMultiplier`.
- Add `calculateDeviationPercent(inputRMR, estimatedBMR)` helper for the UI warning
- Keep `CALORIE_FLOOR` applied as before

**UI changes**:
- `components/BodyProfileForm.tsx`: Add optional numeric input for RMR with help tooltip and deviation warning
- `components/BodyProfileCard.tsx`: Show RMR override value if set (e.g., "RMR: 1,750 kcal (measured)")

**No new dependencies required.**

### Scope

**In Scope:**
- Optional RMR numeric input in body profile form
- Help tooltip explaining valid sources
- 20% deviation warning (inline, non-blocking)
- `nutrition-calc.ts` logic to use override when provided
- Tests for override logic, deviation calculation, and calorie floor interaction
- Accessibility labels on new field and tooltip

**Out of Scope:**
- Adding RMR to onboarding flow
- RMR history/tracking over time
- Integration with metabolic testing devices/APIs
- Changing the existing Mifflin-St Jeor calculation
- REE vs RMR distinction (treat as equivalent for app purposes)

### Acceptance Criteria
- [ ] Given a user enters RMR=1750 in body profile When macro targets recalculate Then TDEE = 1750 × activity multiplier, macros derived from adjusted TDEE
- [ ] Given a user has no RMR override When viewing body profile Then the RMR field is empty and macro targets use Mifflin-St Jeor as before
- [ ] Given a user enters RMR that deviates >20% from Mifflin-St Jeor estimate When typing Then an inline warning appears explaining the deviation
- [ ] Given a user enters RMR that deviates ≤20% When typing Then no warning appears
- [ ] Given a user clears the RMR field When saving Then the app reverts to formula-based calculation
- [ ] Given RMR override results in calories below 1200 When calculating macros Then the 1200 kcal floor is applied and `belowFloor` flag is true
- [ ] Given a user opens body profile for the first time When viewing Then the RMR field is empty with no confusion about what it is (help tooltip available)
- [ ] The RMR input has an accessibilityLabel explaining its purpose
- [ ] PR passes all existing tests with no regressions
- [ ] No new lint warnings

### Edge Cases
| Scenario | Expected Behavior |
|----------|-------------------|
| Empty RMR field | Use Mifflin-St Jeor (existing behavior unchanged) |
| RMR = 0 | Treat as empty, use formula |
| Negative RMR | Input validation prevents negative numbers |
| Very low RMR (e.g., 500) | Allow input, deviation warning shows, calorie floor (1200) still applies |
| Very high RMR (e.g., 5000) | Allow input, deviation warning shows, macros calculated normally |
| No body weight/height entered | RMR field still functional (deviation warning can't fire since no BMR estimate available — just skip warning) |
| User enters TDEE instead of RMR | Help tooltip warns against this; activity multiplier still applies to input, resulting in too-high targets. Deviation warning may catch this (e.g., TDEE=2800 entered as RMR, 20% check would flag it) |

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Users enter smart scale BMR (less accurate than formula) | Medium | Low | Help tooltip explicitly warns against this |
| Users confuse RMR with TDEE, get inflated targets | Low | Medium | Deviation warning catches most cases; help text explains the difference |
| Feature goes unused (low adoption) | Medium | None | Zero cost if unused — existing behavior unchanged. Field is optional. |
| Under-fueling from intentionally low RMR entry | Low | Medium | Calorie floor (1200) prevents dangerously low targets |

## Implementation Estimate
- **Files changed**: ~4 (nutrition-calc.ts, BodyProfileForm.tsx, BodyProfileCard.tsx, types if needed)
- **New tests**: ~5-6 (override logic, deviation calc, edge cases)
- **Complexity**: Low-Medium
- **Test budget**: 1680/1800 current, need ~6 → 1686/1800 (safe)

## Review Feedback
<!-- This section is filled in by reviewers -->

### UX Designer (Design & A11y Critique)
**Verdict: APPROVED** (reviewed 2026-04-20)

No blocking UX issues. The plan is well-designed — optional field placement below required fields, clear "(optional)" labeling, non-blocking deviation warning, and proper a11y consideration. The sports science guardrails (help tooltip, deviation warning, calorie floor) are the right approach.

**Key UX observations:**
- Cognitive load: Minimal — zero new decisions for non-adopters, one intuitive decision for power users
- Mental model: Compatible with existing "enter stats → get targets" flow
- Information architecture: Correct — optional field positioned below required fields signals "advanced"
- Design system: Reuses existing Input component, no new patterns needed

**Recommendations for implementation (non-blocking):**
1. ⓘ tooltip icon must have 48×48dp tap target (use hitSlop if needed)
2. Deviation warning copy: show percentage and estimated value for self-verification
3. Clear (×) button needs accessibilityLabel="Clear measured RMR value"
4. ⓘ tooltip button needs accessibilityLabel="Help: What is Measured RMR"
5. Deviation warning text: use accessibilityLiveRegion="polite" for screen readers
6. Use theme warning color for deviation warning, not hardcoded color

### Quality Director (Release Safety)
**Verdict: APPROVED** (reviewed 2026-04-20)

No blocking regression, security, or data integrity issues found. The plan is well-scoped with appropriate guardrails.

**Key findings:**
- Regression risk: LOW — optional field addition, unchanged return type, backward-compatible JSON storage
- Security: No concerns — all calculation is local
- Data integrity: LOW risk — `CALORIE_FLOOR` enforced regardless of source, no schema migration needed
- Test coverage: Adequate — ~6 new tests within budget (1696/1800 → 1702/1800)
- Rollback: Clean — removing optional field restores original behavior with zero data loss

**Required tests (verify during implementation):**
1. `calculateFromProfile` with `rmr_override` set → uses override value
2. `calculateFromProfile` without `rmr_override` → Mifflin-St Jeor (no regression)
3. `rmr_override = 0` → falls back to formula
4. RMR override + calorie floor interaction → floor still applies
5. Deviation percentage calculation accuracy
6. `belowFloor` flag correct when override causes sub-1200 result

**Recommendations (non-blocking):**
- Add round-trip persistence test for `rmr_override` in profile JSON
- Verify `migrateProfile()` handles the new optional field gracefully

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
