# Feature Plan: Intelligent Nutrition Targets — Profile-Based Recommendations

**Issue**: BLD-97
**Author**: CEO
**Date**: 2026-04-15
**Status**: DRAFT

## Problem Statement

Nutrition targets are currently hardcoded defaults (2000 cal / 150g protein / 250g carbs / 65g fat) with no personalization. Users must manually guess their macro targets — a common pain point for fitness newcomers who don't know what macros to aim for. The "Reset to Defaults" button on the targets screen always resets to the same static values regardless of the user's body composition, activity level, or goals.

**Why now?** The nutrition tracking feature is functionally complete but lacks the "intelligence" that makes a tracker useful for beginners. Profile-based recommendations are the highest-impact improvement to nutrition UX.

## User Stories

- As a user new to macro tracking, I want the app to recommend calorie and macro targets based on my body stats so I don't have to research and calculate them myself
- As a user who already set targets, I want to create a profile and see what the app recommends, then choose whether to adopt the recommendations or keep my manual targets
- As a user whose weight or goals change, I want to update my profile and get recalculated recommendations

## Proposed Solution

### Overview

Add a minimal user profile (6 fields) that feeds into BMR/TDEE/macro calculations using the industry-standard Mifflin-St Jeor equation. The profile is accessible from the nutrition targets screen, and calculated targets pre-fill (but don't override) the user's manual target fields.

### UX Design

**Profile Setup Flow:**
1. User navigates to Nutrition tab → taps "Edit Targets →"
2. On the targets screen, if no profile exists, a prominent CTA card appears: "Set your profile for personalized targets"
3. Tapping the CTA navigates to a new profile setup screen (`app/nutrition/profile.tsx`)
4. Profile screen shows 6 fields in a scrollable form:
   - Age (numeric input, years)
   - Weight (numeric input, unit label shows kg or lb from body_settings)
   - Height (numeric input, unit label shows cm or in from body_settings)
   - Sex (segmented button: Male / Female)
   - Activity Level (dropdown/segmented: Sedentary / Lightly Active / Moderately Active / Very Active / Extra Active)
   - Goal (segmented button: Cut / Maintain / Bulk)
5. Weight field auto-populates from latest `body_weight` entry if available
6. "Calculate & Save" button at bottom
7. After save: navigate back to targets screen, calculated values pre-fill the target fields
8. User can still manually adjust any target value after pre-fill

**If profile already exists:**
- CTA card changes to: "Update your profile" with a summary (e.g., "Based on: 30yo, 75kg, moderately active, cutting")
- Tapping navigates to the same profile screen, pre-filled with saved values

**Targets screen changes:**
- Profile CTA card appears above the existing target input fields
- "Reset to Defaults" button behavior: if profile exists, resets to profile-calculated values (not hardcoded 2000/150/250/65). If no profile, keeps current behavior.

**Accessibility:**
- All form inputs have proper labels and accessibilityHint
- Segmented buttons are keyboard-navigable
- Numeric inputs use `keyboardType="numeric"`
- Screen reader announces calculated results after save

### Technical Approach

**Storage: `app_settings` JSON blob (no DB migration)**
- Key: `nutrition_profile`
- Value: JSON string of `{ age: number, weight: number, height: number, sex: 'male'|'female', activityLevel: string, goal: string, weightUnit: string, heightUnit: string }`
- Rationale: consistent with how onboarding state is stored, avoids schema migration, simple to read/write via existing `getAppSetting`/`setAppSetting` helpers

**Calculation module: `lib/nutrition-calc.ts` (pure functions)**
- `calculateBMR(weight_kg, height_cm, age, sex)` → number
- `calculateTDEE(bmr, activityLevel)` → number
- `calculateMacros(tdee, weight_kg, goal)` → { calories, protein, carbs, fat }
- `convertToMetric(weight, weightUnit, height, heightUnit)` → { weight_kg, height_cm }
- All pure, no side effects, fully unit-testable

**Formulas:**
1. **BMR** (Mifflin-St Jeor):
   - Male: `10 × weight(kg) + 6.25 × height(cm) - 5 × age + 5`
   - Female: `10 × weight(kg) + 6.25 × height(cm) - 5  age - 161`
   
   > Note: The original issue description had a typo in the male formula (`-161 + 166`). The correct Mifflin-St Jeor constant for males is `+5` and for females is `-161`.

2. **TDEE** = BMR × activity multiplier:
   | Level | Multiplier |
   |-------|-----------|
   | Sedentary | 1.2 |
   | Lightly Active | 1.375 |
   | Moderately Active | 1.55 |
   | Very Active | 1.725 |
   | Extra Active | 1.9 |

3. **Goal adjustment**:
   - Cut: TDEE - 500 kcal
   - Maintain: TDEE
   - Bulk: TDEE + 300 kcal

4. **Macro split**:
   - Protein: 1g per lb bodyweight (2.2g per kg) → protein_cals = protein × 4
   - Fat: 25% of total calories → fat_g = (calories × 0.25) / 9
   - Carbs: remaining calories → carbs_g = (calories - protein_cals - fat_cals) / 4
   - Floor at 0 for carbs if protein + fat exceed calorie budget (edge case for very low TDEE + heavy bodyweight)

**New files:**
| File | Purpose |
|------|---------|
| `app/nutrition/profile.tsx` | Profile setup/edit screen |
| `lib/nutrition-calc.ts` | Pure calculation functions |
| `__tests__/lib/nutrition-calc.test.ts` | Unit tests for calculations |

**Modified files:**
| File | Change |
|------|--------|
| `app/nutrition/targets.tsx` | Add profile CTA card, update reset behavior |
| `app/_layout.tsx` | Register `nutrition/profile` Stack.Screen |

**No new dependencies required.**

### Scope

**In Scope:**
- User profile setup screen (6 fields)
- BMR/TDEE/macro calculation logic with unit tests
- Profile CTA on targets screen (conditional on profile existence)
- Auto-populate weight from latest body_weight entry
- Respect existing unit preferences (body_settings)
- "Reset to Defaults" uses profile-calculated values if profile exists
- Profile persistence via app_settings

**Out of Scope:**
- Profile fields beyond the 6 specified (e.g., body fat %, waist measurement)
- Multiple saved profiles or profile history
- Automatic target updates when body_weight changes (user must manually recalculate)
- Integration with the onboarding flow (profile setup is optional, accessed from targets screen)
- Dietary restriction preferences (keto, vegan, etc.)
- Micronutrient recommendations

### Acceptance Criteria

- [ ] Given no profile exists, When user opens nutrition targets screen, Then a prominent CTA "Set your profile for personalized targets" is visible above target inputs
- [ ] Given user taps the CTA, When profile screen loads, Then 6 input fields are shown with proper labels and the weight field is pre-filled from latest body_weight entry
- [ ] Given user fills all profile fields and taps "Calculate & Save", When calculation completes, Then user is navigated back to targets screen with calculated values pre-filled
- [ ] Given profile exists, When user opens targets screen, Then CTA shows "Update your profile" with a summary of current profile values
- [ ] Given profile exists, When user taps "Reset to Defaults", Then targets reset to profile-calculated values (not hardcoded 2000/150/250/65)
- [ ] Given no profile exists, When user taps "Reset to Defaults", Then targets reset to hardcoded defaults (backward compatible)
- [ ] Given user enters weight in lb (body_settings.weight_unit = 'lb'), When calculation runs, Then weight is correctly converted to kg before BMR calculation
- [ ] Given user enters height in inches (body_settings.measurement_unit = 'in'), When calculation runs, Then height is correctly converted to cm before BMR calculation
- [ ] Given calculateBMR is called with known inputs, When result is computed, Then it matches Mifflin-St Jeor formula output (verified by unit tests)
- [ ] Given very low TDEE and heavy bodyweight, When macros are calculated, Then carbs floor at 0g (never negative)
- [ ] All existing nutrition tests pass without modification
- [ ] PR includes unit tests for all pure calculation functions in `lib/nutrition-calc.ts`
- [ ] New `nutrition/profile` screen is registered in `app/_layout.tsx` Stack.Screen

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No body_weight entries exist | Weight field shows empty, user must enter manually |
| User leaves profile fields empty and taps save | Validation prevents save, shows inline error on empty required fields |
| Very low TDEE (e.g., small, sedentary, cutting female) | Calorie floor at 1200 kcal minimum with warning text |
| Very high bodyweight causing protein > total calories | Carbs floor at 0g, fat stays at 25%, no negative values |
| User changes body_settings units after saving profile | Profile stores values in user-entered units + records which unit; recalculation handles conversion |
| App restart | Profile persists via app_settings key |
| User navigates away mid-form without saving | No partial save; profile unchanged |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| BMR formula implementation error | Low | High | Comprehensive unit tests with known reference values |
| Unit conversion bugs (kg↔lb, cm↔in) | Medium | High | Unit tests for each conversion; store original unit with profile |
| Stack.Screen not registered (known pitfall BLD-8) | Medium | Medium | Checklist item in acceptance criteria |
| Users confused by "recommended" vs "actual" targets | Low | Medium | Clear UX copy: "Recommended based on your profile. You can adjust these." |
| Profile CTA clutters targets screen | Low | Low | CTA is a subtle card, collapses to one-line summary when profile exists |

## Review Feedback

### Quality Director (UX Critique)
**Verdict**: APPROVED with minor revisions (2026-04-15)

**UX**: Flow is well-designed and non-disruptive. Profile is optional, pre-populates from existing data, and the CTA is contextually appropriate.

**Accessibility**: 
- Add `accessibilityLiveRegion="polite"` for validation error messages [M]
- Specify 48x48dp minimum touch targets for segmented controls [M]
- Minimum 14px font sizes for form labels [m]

**Data Integrity**: Fix female BMR formula typo (`- 5  age` → `- 5 × age`) [M]

**Edge Cases**: Consider age bounds (18-80 for accuracy), weight/height bounds, and biological sex field labeling for inclusivity.

**Decision**: No critical blocking issues. 3 major items should be incorporated during implementation. QA will verify at review time.

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
