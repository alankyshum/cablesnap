# Feature Plan: Onboarding & Quick Start Flow

**Issue**: BLD-34
**Author**: CEO
**Date**: 2026-04-14
**Status**: APPROVED

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
  - Weight: kg / lb
  - Measurements: cm / in
  - **Locale-detected defaults**: Use `Intl.locale` to pre-select lb/in for US/UK/Canada locales, kg/cm elsewhere. User can override. This prevents silent wrong-unit assignment (QD C1).
- **Experience section**: Three selectable cards
  - Beginner — "I'm just getting started with gym workouts"
  - Intermediate — "I've been working out regularly for a few months"
  - Advanced — "I design my own workout routines"
- "Continue" button (enabled only after experience level selected)
- **Layout**: Content in `ScrollView` with `contentContainerStyle={{ flexGrow: 1 }}` to accommodate small screens (iPhone SE). Continue button flows with content (QD M4).

#### Step 3: Recommendation
- Based on experience level:
  - **Beginner** → "We recommend starting with **Full Body**" (shows the starter template card with Recommended chip). "This 35-minute workout covers all major muscle groups — perfect for building a foundation."
  - **Intermediate** → "We recommend the **Push/Pull/Legs** program" (shows the starter program card). "A 3-day cycle that targets each muscle group with focused workouts."
  - **Advanced** → "Browse our starter templates" — show 2-3 template preview cards (Full Body, Upper/Lower, Push day) with a "Browse All Templates" CTA button. Advanced users get actionable content, not a dismissal (QD M2).
- Primary action: "Start with [recommendation]" → activates program (intermediate) or navigates to template (beginner). For advanced: "Browse All Templates" navigates to workouts tab.
- Secondary action: "I'll explore on my own" text link → skip to main app
- Both options complete onboarding

#### Navigation
- Onboarding screens are a separate stack (not inside tabs)
- Root `_layout.tsx` uses `<Redirect href="/onboarding/welcome" />` pattern when onboarding incomplete — do NOT conditionally swap stack navigators (TL rec 1)
- All 3 onboarding screens registered as explicit `<Stack.Screen>` entries in `app/_layout.tsx` with `headerShown: false` (TL rec 3, BLD-8 pitfall)
- Hold `expo-splash-screen` until `isOnboardingComplete()` resolves. Only then render either the redirect to onboarding or the tab navigator. No flash of wrong UI (QD M3).
- Use `router.replace()` for ALL inter-step navigation (welcome→setup, setup→recommend, recommend→tabs) to prevent Android back gesture returning to previous steps (TL rec 2)
- After completion, user lands on tab navigator with no onboarding screens in the back stack
- Wrap onboarding stack in `ErrorBoundary` to catch rendering crashes gracefully

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
// Hold splash screen until onboarding state is known
import * as SplashScreen from 'expo-splash-screen';
SplashScreen.preventAutoHideAsync();

// In root layout:
const [ready, setReady] = useState(false);
const [onboarded, setOnboarded] = useState(true); // default true to avoid flash

useEffect(() => {
  isOnboardingComplete().then(complete => {
    setOnboarded(complete);
    setReady(true);
    SplashScreen.hideAsync();
  });
}, []);

// If not ready, render null (splash still showing)
// If not onboarded, render <Redirect href="/onboarding/welcome" />
// If onboarded, render normal <Slot /> or tabs
```

#### Locale-Based Unit Detection
```typescript
function detectUnits(): { weight: 'kg' | 'lb', measurement: 'cm' | 'in' } {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
  const imperial = ['en-US', 'en-GB', 'en-CA', 'en-AU'].some(l => locale.startsWith(l.split('-')[0]) && locale.includes(l.split('-')[1]));
  // US, UK, Canada use lb/in by default
  if (imperial) return { weight: 'lb', measurement: 'in' };
  return { weight: 'kg', measurement: 'cm' };
}
```
Note: This provides smart defaults that the user can override on the setup screen.

#### Existing User Migration (in seedStarters)
```typescript
// In seedStarters() — after checking starter_version:
// If starter_version row already exists, user is upgrading → skip onboarding
const existing = await getAppSetting('starter_version');
if (existing) {
  await setAppSetting('onboarding_complete', '1');
}
// New installs won't have starter_version yet, so they get onboarding
```
This goes in `seedStarters()` (not `migrate()`), because `app_settings` data is populated in seed. Guarded by existing `starter_version` check (TL rec 5).

#### Recommendation Logic
```typescript
function getRecommendation(level: 'beginner' | 'intermediate' | 'advanced') {
  if (level === 'beginner') return { type: 'template', id: STARTER_TEMPLATES[0].id, name: 'Full Body' };
  if (level === 'intermediate') return { type: 'program', id: STARTER_PROGRAMS[0].id, name: 'Push/Pull/Legs' };
  return { type: 'browse', id: null, name: null };
}
```
Import starter IDs from `lib/starter-templates.ts` — do not re-declare string literals (TL rec 4).

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
- [ ] Splash screen held until onboarding check completes (no flash of wrong UI)
- [ ] Welcome screen has "Get Started" button
- [ ] Setup screen has unit selection (kg/lb, cm/in) with locale-detected defaults
- [ ] Setup screen has experience level cards (beginner/intermediate/advanced) with plain-language descriptions
- [ ] "Continue" button disabled until experience level selected
- [ ] Unit preferences saved to body_settings
- [ ] Experience level saved to app_settings
- [ ] Beginner recommendation shows Full Body starter template
- [ ] Intermediate recommendation shows PPL program
- [ ] Advanced recommendation shows browsable template cards with "Browse All Templates" CTA
- [ ] "Start with [recommendation]" activates program (intermediate) or navigates to template (beginner)
- [ ] "I'll explore on my own" skips to main app
- [ ] Onboarding never shows again after completion
- [ ] Existing users with `starter_version` in app_settings skip onboarding after upgrade
- [ ] Migration logic in `seedStarters` sets `onboarding_complete=1` for existing users
- [ ] No back navigation within onboarding (all transitions use `router.replace()`)
- [ ] All screens work in both light and dark mode
- [ ] No hardcoded hex color values — use theme colors only
- [ ] ErrorBoundary wraps onboarding stack
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] All existing tests pass
- [ ] Touch targets >= 48dp on all interactive elements
- [ ] Screen reader support: `accessibilityRole="radiogroup"` on unit/experience groups, `role="radio"` + `accessibilityState={{ checked }}` on each option
- [ ] Experience cards use border/icon (not color alone) to indicate selection
- [ ] Disabled Continue button announces as disabled to screen readers (`accessibilityState={{ disabled: true }}`)
- [ ] Step 2 uses ScrollView to accommodate small screens (iPhone SE 4.7")

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Existing user upgrades | Onboarding skipped — `seedStarters` sets `onboarding_complete=1` when `starter_version` exists |
| App killed mid-onboarding | Restart shows onboarding from beginning (not persisted until completion) |
| Starter templates missing | Recommendation screen shows "Browse Templates" fallback |
| Dark mode during onboarding | All screens respect system theme via react-native-paper theming |
| Large text / accessibility | ScrollView layout accommodates dynamic type sizes |
| Rotate device mid-onboarding | Layout remains usable in both orientations |
| User selects beginner but Full Body template was deleted | Cannot happen — starter templates have `is_starter=1` delete guard |
| Locale detection fails | Falls back to kg/cm (metric) — user can manually change |
| Small screen (iPhone SE 4.7") | Step 2 scrolls; Continue button flows with content |
| Onboarding ErrorBoundary catches crash | Shows a fallback screen with "Skip to App" button that sets `onboarding_complete=1` |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Onboarding check adds startup latency | Medium | Low | Single async DB read (~1ms), show splash during check |
| Existing users see onboarding after update | Medium | High | Migration sets `onboarding_complete=1` for existing installs |
| Recommendation starter IDs change | Low | Medium | Use constants for starter IDs (`starter-tpl-1`, `starter-prog-1`) |
| Navigation state corruption | Low | High | Use `router.replace()` not `router.push()` to prevent back stack |

## Review Feedback

### Quality Director (UX Critique)
**Rev 1 Verdict**: NEEDS REVISION (2026-04-14) — 2 Critical, 4 Major issues found.
**Rev 2 Verdict**: APPROVED (2026-04-14) — All issues resolved.

All Critical (C1 unit defaults, C2 migration) and Major (M1-M4) issues addressed in Rev 2.
Minor note: locale detection includes en-GB/en-AU as imperial — consider limiting to en-US/en-CA only (non-blocking).

Full review posted as BLD-34 comments.

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
**Rev 2 updates** (addressing all QD + TL feedback):
- ✅ C1: Added locale-detected unit defaults (Intl.locale → lb/in for US/UK/CA, kg/cm elsewhere)
- ✅ C2: Added explicit migration logic in seedStarters + acceptance criteria for existing users
- ✅ M1: Rewrote experience descriptions in plain language (no gym jargon)
- ✅ M2: Advanced users now see browsable template cards + "Browse All Templates" CTA
- ✅ M3: Specified expo-splash-screen hold until onboarding check resolves
- ✅ M4: Added ScrollView for Step 2 to accommodate small screens
- ✅ A11y: Added per-element specs (radiogroup, checked/selected states, disabled announcement, no color-only indicators)
- ✅ Added ErrorBoundary requirement around onboarding stack
- ✅ Added "no hardcoded hex colors" acceptance criterion
- ✅ TL recs: Redirect pattern, router.replace() for all transitions, Stack.Screen entries, import starter IDs from constants, migration in seedStarters

Awaiting QD re-review.
