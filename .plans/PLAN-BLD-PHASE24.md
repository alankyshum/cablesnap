# Feature Plan: Onboarding & Quick Start Flow

**Issue**: BLD-34
**Author**: CEO
**Date**: 2026-04-14
**Status**: DRAFT

## Problem Statement

After Phase 23 shipped 6 starter workout templates and a PPL program, new users still land on the Workouts tab without guidance. They don't know to:
- Set preferred units (kg/lb, cm/in)
- Try a starter template
- Activate the PPL program for structured training

The app defaults to metric (kg/cm) which alienates imperial users. There is no first-launch experience — users must discover features through exploration. This creates high friction for activation and risks early drop-off.

Phase 23 solved the "empty content" problem. Phase 24 solves the "empty context" problem.

## User Stories

- As a new user, I want to be guided through initial setup so I can start training immediately
- As an imperial user, I want to set lb/in on first launch so every screen shows my preferred units
- As a beginner, I want the app to recommend a starting workout so I don't have to evaluate 6 templates
- As an intermediate lifter, I want the app to suggest a structured program so I can follow a plan

## Proposed Solution

### Overview

A lightweight, 3-step onboarding flow that appears exactly once on first launch. Collects unit preferences, experience level, and auto-recommends a starter template or program. After completion, user lands on the Workouts tab with everything configured.

### UX Design

**Flow**: Welcome → Setup → Recommendation → Main App

#### Step 1: Welcome (splash-like)
- FitForge logo + "Welcome to FitForge"
- Subtitle: "Your free workout & macro tracker"
- Single "Get Started" button
- No skip — this screen is minimal friction

#### Step 2: Setup (units + experience)
- **Units section**: Two segmented buttons
  - Weight: kg / lb (default: kg)
  - Measurements: cm / in (default: cm)
- **Experience section**: Three selectable cards
  - Beginner — "New to strength training"
  - Intermediate — "Comfortable with major lifts"
  - Advanced — "Experienced, self-programming"
- "Continue" button (enabled only after experience selection)

#### Step 3: Recommendation
- Based on experience level:
  - **Beginner** → "We recommend starting with **Full Body**" (shows the starter template card with Recommended chip). "This 35-minute workout covers all major muscle groups — perfect for building a foundation."
  - **Intermediate** → "We recommend the **Push/Pull/Legs** program" (shows the starter program card). "A 3-day cycle that targets each muscle group with focused workouts."
  - **Advanced** → "You're ready to build your own!" with prompt to browse templates or create custom.
- Primary action: "Start with [recommendation]" → activates program (intermediate) or navigates to template (beginner)
- Secondary action: "I'll explore on my own" text link → skip to main app
- Both options complete onboarding

#### Navigation
- Onboarding screens are a separate stack (not inside tabs)
- Root `_layout.tsx` checks `app_settings.onboarding_complete`
- If not complete → render onboarding stack
- If complete → render normal tab navigator
- No back navigation within onboarding (forward-only flow)
- After completion, replace navigation state (no "back to onboarding")

### Technical Approach

#### Data Model
Reuse existing `app_settings` table (created in Phase 23):
```sql
-- Onboarding state
INSERT INTO app_settings (key, value) VALUES ('onboarding_complete', '1');
INSERT INTO app_settings (key, value) VALUES ('experience_level', 'beginner');
```

Unit preferences use existing `body_settings` table:
```sql
UPDATE body_settings SET weight_unit = 'lb', measurement_unit = 'in' WHERE id = 'default';
```

#### New Files
- `app/onboarding/_layout.tsx` — Onboarding stack navigator
- `app/onboarding/welcome.tsx` — Welcome screen
- `app/onboarding/setup.tsx` — Units + experience level
- `app/onboarding/recommend.tsx` — Recommendation + activation

#### Modified Files
- `app/_layout.tsx` — Add onboarding check before rendering tabs
- `lib/db.ts` — Add `getAppSetting()`, `setAppSetting()` helper functions (if not already present), and `isOnboardingComplete()` convenience function

#### Onboarding Check (app/_layout.tsx)
```typescript
// In root layout, check onboarding state before rendering
const [ready, setReady] = useState(false);
const [onboarded, setOnboarded] = useState(true); // default true to avoid flash

useEffect(() => {
  isOnboardingComplete().then(complete => {
    setOnboarded(complete);
    setReady(true);
  });
}, []);

// If not onboarded, redirect to onboarding stack
// If onboarded, render normal tabs
```

#### Recommendation Logic
```typescript
function getRecommendation(level: 'beginner' | 'intermediate' | 'advanced') {
  if (level === 'beginner') return { type: 'template', id: 'starter-tpl-1', name: 'Full Body' };
  if (level === 'intermediate') return { type: 'program', id: 'starter-prog-1', name: 'Push/Pull/Legs' };
  return { type: 'browse', id: null, name: null };
}
```

For beginner: navigate to template detail (which has "Start Workout" button)
For intermediate: activate the PPL program (sets is_active=1, current_day_id to first day), then navigate to main app where "Next Workout" card appears

#### No New Dependencies
- Uses existing `react-native-paper` components (Button, SegmentedButtons, Card, Text)
- Uses existing `expo-router` navigation
- No animations library needed — keep it simple and fast

### Scope

**In Scope:**
- 3-step onboarding flow (welcome, setup, recommendation)
- Unit preference selection (kg/lb, cm/in)
- Experience level selection (beginner/intermediate/advanced)
- Auto-recommend starter template or program based on level
- Persist onboarding completion in app_settings
- One-time display (never shows again after completion)
- Forward-only navigation (no back button)

**Out of Scope:**
- Tutorial tooltips or coach marks on main screens
- Push notification permission request
- Account creation or sign-in
- Goal setting (weight loss, muscle gain, etc.)
- Profile creation (name, age, etc.)
- Animated transitions or confetti
- "Reset onboarding" in Settings
- Onboarding analytics/tracking

### Acceptance Criteria

- [ ] Fresh install shows onboarding before main app
- [ ] Welcome screen has "Get Started" button
- [ ] Setup screen has unit selection (kg/lb, cm/in)
- [ ] Setup screen has experience level cards (beginner/intermediate/advanced)
- [ ] "Continue" button disabled until experience level selected
- [ ] Unit preferences saved to body_settings
- [ ] Experience level saved to app_settings
- [ ] Beginner recommendation shows Full Body starter template
- [ ] Intermediate recommendation shows PPL program
- [ ] Advanced recommendation shows "explore on your own" message
- [ ] "Start with [recommendation]" activates program (intermediate) or navigates to template (beginner)
- [ ] "I'll explore on my own" skips to main app
- [ ] Onboarding never shows again after completion
- [ ] Existing users (upgrade) skip onboarding (onboarding_complete already set by migration)
- [ ] No back navigation within onboarding
- [ ] All screens work in both light and dark mode
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] All existing tests pass
- [ ] Touch targets >= 48dp
- [ ] Screen reader support on all interactive elements

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Existing user upgrades | Onboarding skipped — set `onboarding_complete=1` during DB migration |
| App killed mid-onboarding | Restart shows onboarding from beginning (not persisted until completion) |
| Starter templates missing | Recommendation screen shows "Browse Templates" fallback |
| Dark mode during onboarding | All screens respect system theme |
| Large text / accessibility | Layout accommodates dynamic type sizes |
| Rotate device mid-onboarding | Layout remains usable in both orientations |
| User selects beginner but Full Body template was deleted | Cannot happen — starter templates have delete guard |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Onboarding check adds startup latency | Medium | Low | Single async DB read (~1ms), show splash during check |
| Existing users see onboarding after update | Medium | High | Migration sets `onboarding_complete=1` for existing installs |
| Recommendation starter IDs change | Low | Medium | Use constants for starter IDs (`starter-tpl-1`, `starter-prog-1`) |
| Navigation state corruption | Low | High | Use `router.replace()` not `router.push()` to prevent back stack |

## Review Feedback

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)
**Verdict**: APPROVED — Technically sound, minimal risk, clean scope.

**Feasibility**: Fully buildable. Reuses `app_settings`, `body_settings`, `activateProgram()`, and Phase 23 starter constants. No new deps. 4 new files, 2 modified.

**Advisory recommendations for implementation:**
1. Use `<Redirect href="/onboarding/welcome" />` pattern — don't swap Stack navigators conditionally
2. Use `router.replace()` for ALL inter-step navigation (not just final transition) to block Android back gesture
3. Add explicit `Stack.Screen` entries for all 3 onboarding screens in `_layout.tsx` (BLD-8 pitfall)
4. Import starter IDs from `lib/starter-templates.ts` — don't re-declare string literals
5. Place existing-user migration in `seedStarters` — if `starter_version` exists, set `onboarding_complete=1`

_Reviewed 2026-04-14_

### CEO Decision
_Pending reviews_
