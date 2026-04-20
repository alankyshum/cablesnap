# Feature Plan: Intelligent Nutrition Targets — Profile-Based Recommendations

**Issue**: BLD-97
**Author**: CEO
**Date**: 2026-04-15
**Status**: DRAFT

## Problem Statement

Nutrition targets are hardcoded defaults (2000 cal / 150g protein / 250g carbs / 65g fat) with no personalization. Users must manually guess their macro targets. The "Reset to Defaults" button on `app/nutrition/targets.tsx` always resets to the same static values regardless of the user's body composition, activity level, or goals.

This is a significant UX gap — personalized nutrition targets based on evidence-based formulas (Mifflin-St Jeor) would immediately add value for users who don't know their ideal macros.

## User Stories

- As a user, I want to set my physical profile so the app can calculate personalized nutrition targets
- As a user, I want recommended daily calories and macros based on my body stats and goals so I don't have to research this myself
- As a user, I want to override the calculated targets if I have specific nutritional needs
- As a user, I want my latest body weight entry auto-suggested when setting up my profile so I don't re-enter data

## Proposed Solution

### Overview

Add a minimal user profile (6 fields) that feeds into Mifflin-St Jeor BMR → TDEE → macro split calculations. The profile is accessible from the nutrition targets screen via a CTA button.

### UX Design

**Entry point — Nutrition Targets screen (`app/nutrition/targets.tsx`):**
- If no profile exists → show a prominent CTA button above the manual inputs: "Set your profile for personalized targets"
- If profile exists → show a subtle "Update Profile" link and an indicator that targets are profile-based
- Button navigates to `app/nutrition/profile.tsx`

**Profile setup screen (`app/nutrition/profile.tsx`):**
- Single scrollable form with 6 fields:
  1. Age (numeric input, years)
  2. Weight (numeric input, respects `body_settings.weight_unit` — kg or lb)
  3. Height (numeric input, respects `body_settings.measurement_unit` — cm or in)
  4. Sex (segmented button: Male / Female)
  5. Activity Level (dropdown/segmented: Sedentary / Lightly Active / Moderately Active / Very Active / Extra Active)
  6. Goal (segmented button: Cut / Maintain / Bulk)
- Weight field auto-populated from latest `body_weight` entry via `getLatestBodyWeight()`
- "Calculate & Save" button → computes targets, saves profile, navigates back to targets screen
- After save, the targets screen auto-fills with calculated values (user can still manually override)
- "Clear Profile" option to remove saved profile and revert to manual-only mode

**Navigation:**
- Stack navigation from targets → profile (Expo Router, consistent with existing patterns)
- Back button returns to targets screen

**Visual design:**
- Consistent with existing CableSnap design language (React Native Paper components, existing theme)
- Form uses `TextInput` (outlined mode) for numeric fields, `SegmentedButtons` for enum fields
- Show calculated breakdown below form: "Recommended: 2,450 cal | 185g protein | 275g carbs | 68g fat"

### Technical Approach

**Architecture:**
- `lib/nutrition-calc.ts` — Pure calculation functions (BMR, TDEE, macros). No side effects, fully testable.
- `lib/db/profile.ts` — OR simpler: store profile as JSON blob in `app_settings` (key: `nutrition_profile`). No new table, no migration needed. Consistent with how `onboarding_complete` is stored.
- `app/nutrition/profile.tsx` — New screen for profile setup/edit

**Calculation formulas (Mifflin-St Jeor):**
```
BMR (male)   = 10 × weight(kg) + 6.25 × height(cm) - 5 × age + 5
BMR (female) = 10 × weight(kg) + 6.25 × height(cm) - 5 × age - 161
```

**TDEE = BMR × activity multiplier:**
| Activity Level | Multiplier |
|---------------|------------|
| Sedentary | 1.2 |
| Lightly Active | 1.375 |
| Moderately Active | 1.55 |
| Very Active | 1.725 |
| Extra Active | 1.9 |

**Goal adjustment:**
| Goal | Adjustment |
|------|-----------|
| Cut | TDEE - 500 cal |
| Maintain | TDEE |
| Bulk | TDEE + 300 cal |

**Macro split:**
- Protein: 1g per lb bodyweight (2.2g per kg)
- Fat: 25% of total calories (÷ 9 for grams)
- Carbs: remaining calories (÷ 4 for grams)

**Unit conversions (internal):**
- All calculations use metric internally (kg, cm)
- If user's `body_settings.weight_unit` is `lb`, convert: kg = lb × 0.453592
- If user's `body_settings.measurement_unit` is `in`, convert: cm = in × 2.54
- Display uses user's preferred units

**Data model — profile stored in `app_settings`:**
```typescript
type NutritionProfile = {
  age: number;
  weight: number;        // in user's preferred unit
  weightUnit: 'kg' | 'lb';
  height: number;        // in user's preferred unit  
  heightUnit: 'cm' | 'in';
  sex: 'male' | 'female';
  activityLevel: 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extra_active';
  goal: 'cut' | 'maintain' | 'bulk';
  updatedAt: number;
};
// Stored as: setAppSetting('nutrition_profile', JSON.stringify(profile))
```

**Existing infrastructure to leverage:**
- `getAppSetting`/`setAppSetting` in `lib/db/settings.ts` — key-value storage
- `getBodySettings()` in `lib/db/body.ts` — read weight_unit, measurement_unit
- `getLatestBodyWeight()` in `lib/db/body.ts` — auto-populate weight field
- `updateMacroTargets()` in `lib/db/nutrition.ts` — write calculated targets
- Expo Router stack navigation in `app/_layout.tsx`
- React Native Paper components (TextInput, Button, SegmentedButtons, Card)

### Scope

**In Scope:**
- User profile setup screen with 6 fields
- Mifflin-St Jeor BMR + TDEE + macro split calculation
- Profile persistence via app_settings
- CTA on targets screen when no profile exists
- Auto-populate weight from latest body_weight entry
- Unit preference respect (kg/lb, cm/in)
- Unit tests for all calculation functions
- Auto-fill targets after profile save

**Out of Scope:**
- Advanced dietary plans (keto, vegan macro splits)
- Multiple profile support
- BMR/TDEE history tracking
- Integration with food logging (recommendations based on what you've eaten)
- Micronutrient targets (vitamins, minerals)
- Profile-based exercise recommendations
- Body composition tracking (body fat %, lean mass)

### Acceptance Criteria

- [ ] User can set minimal profile (age, weight, height, sex, activity level, goal) via a new screen at `app/nutrition/profile.tsx`
- [ ] App calculates recommended daily calories + macro split using Mifflin-St Jeor + activity multiplier
- [ ] Nutrition targets screen shows "Set your profile for personalized targets" button if no profile exists
- [ ] After profile save, calculated targets pre-fill the macro targets (user can still manually override)
- [ ] Profile persists across app restarts (stored in `app_settings` as JSON)
- [ ] Weight from latest `body_weight` entry is suggested as default when setting profile
- [ ] Unit preferences from `body_settings` are respected (kg/lb, cm/in) — displayed in user's units, calculated in metric
- [ ] All calculation functions in `lib/nutrition-calc.ts` have unit tests
- [ ] Existing nutrition tests still pass
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] Given a male, 80kg, 180cm, 30yo, moderately active, maintain → expected ~2,700 cal (± 50)
- [ ] Given a female, 60kg, 165cm, 25yo, lightly active, cut → expected ~1,400 cal (± 50)

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No body weight entries exist | Weight field starts empty, user must enter manually |
| User changes body_settings units after profile creation | Profile displays in new units (convert stored values) |
| Age < 15 or > 100 | Show validation error, don't calculate |
| Weight ≤ 0 or height ≤ 0 | Show validation error, don't calculate |
| User saves profile then manually edits targets | Manual edits are kept; profile doesn't auto-overwrite |
| User clears profile | Targets stay at their current values (don't reset to defaults) |
| Very low calculated calories (< 1200) | Show a warning: "Calculated targets are very low. Consult a nutritionist." |
| Very high calculated calories (> 5000) | Show a warning: "Calculated targets are very high. Please verify your inputs." |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Incorrect calculation formula | Low | High | Unit tests with known-good values from TDEE calculators |
| Unit conversion errors (lb↔kg, in↔cm) | Medium | Medium | Test with both unit systems, compare against manual calculations |
| Profile data loss on app update | Low | Medium | Stored in SQLite via app_settings, persists across updates |
| Users trust calculated values blindly | Medium | Low | Add disclaimer: "These are estimates. Consult a professional for medical advice." |

## Review Feedback

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
