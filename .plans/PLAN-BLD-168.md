# Feature Plan: Surface Profile/Biometrics in Settings Screen

**Issue**: BLD-168
**Author**: CEO
**Date**: 2026-04-15
**Status**: DRAFT

## Problem Statement

The nutrition profile (age, weight, height, sex, activity level, goal) is the foundation for intelligent nutrition recommendations, but it's buried 2 levels deep: Nutrition tab → Targets → "Set your profile" CTA. Users opening Settings — the natural place for personal data — have no indication that profile-based nutrition exists. First-time users won't discover it.

**Owner feedback (GitHub #85):** "Settings screen has no fields for gender, weight, height. A user looking at Settings would have no idea intelligent nutrition calculations exist. Should leverage drawer instead of slide-up page, and 2 levels nested pages makes it hard to discover."

## User Stories

- As a new user, I want to find and set my body profile from Settings so I don't have to dig through nutrition tabs to discover personalization
- As a returning user, I want to see my current profile summary in Settings so I can quickly confirm my biometric data is correct
- As a user who changes weight/goals, I want to update my profile from Settings without navigating deep into the nutrition section

## Proposed Solution

### Overview

Add a "Body Profile" card to the Settings screen that displays a summary of the user's nutrition profile. Tapping it opens a bottom-sheet drawer containing the profile edit form — inline, no page navigation required. The existing profile page (`app/nutrition/profile.tsx`) remains accessible from the Nutrition tab for backward compatibility.

### UX Design

**Settings Screen — New "Body Profile" Card:**
- Position: immediately after the "Units" card (second card in Settings)
- If no profile exists: card shows "Set up your body profile" + subtitle "Get personalized nutrition targets based on your body stats"
- If profile exists: card shows a summary grid:
  - Sex: Male/Female
  - Age: {age} years
  - Weight: {weight} {unit}
  - Height: {height} {unit}
  - Activity: {level label}
  - Goal: {goal label}
- Tap action: opens a bottom-sheet drawer with the profile form

**Bottom Sheet Drawer:**
- Uses React Native Paper's `Modal` (consistent with existing modal pattern in `progress.tsx`) or a lightweight bottom sheet
- Contains the same form fields as `app/nutrition/profile.tsx`: age, weight, height, sex, activity level, goal
- "Save" button calculates and saves profile + updates macro targets (same logic as existing profile screen)
- Dismissible by tapping overlay or swiping down
- Keyboard-aware: sheet scrolls when keyboard opens

**Shared Logic:**
- Extract the profile form + save logic from `app/nutrition/profile.tsx` into a reusable component (e.g., `components/ProfileForm.tsx`)
- Both Settings drawer and Nutrition profile page use `ProfileForm`
- Single source of truth: `app_settings` key `nutrition_profile` (no change to data model)

**Navigation:**
- Settings → tap "Body Profile" card → drawer opens (NO page navigation)
- Nutrition → Targets → "Update your profile" CTA → still navigates to `app/nutrition/profile.tsx` (unchanged)

### Technical Approach

**1. Create `components/ProfileForm.tsx`**
- Extract all form state, validation, and save logic from `app/nutrition/profile.tsx`
- Accept props: `onSave: () => void`, `onCancel?: () => void`
- Reusable in both the profile page and the settings drawer

**2. Refactor `app/nutrition/profile.tsx`**
- Replace inline form with `<ProfileForm onSave={() => router.back()} />`
- Preserve all existing behavior

**3. Add profile card + drawer to `app/(tabs)/settings.tsx`**
- Load `nutrition_profile` from `app_settings` on focus (same pattern as existing settings loads)
- Render a Card with profile summary (or CTA if no profile)
- On press → set `showProfileDrawer(true)` → render Modal with `<ProfileForm />`
- After save → refresh summary, close drawer

**4. Modal implementation**
- Use `react-native` `Modal` component with `animationType="slide"` and `transparent={true}` — same pattern already used in `app/(tabs)/progress.tsx`
- No new dependencies required
- Wrap ProfileForm in a `KeyboardAvoidingView` + `ScrollView` for proper keyboard handling

### Scope

**In Scope:**
- New "Body Profile" card on Settings screen with profile summary
- Bottom-sheet modal drawer with profile edit form
- Extract `ProfileForm` component from existing profile page
- Refactor existing profile page to use shared `ProfileForm`
- Loading and displaying existing profile data in Settings

**Out of Scope:**
- Unifying body weight across profile / body tracking / Settings (complex data model change — separate feature)
- Changing the Nutrition tab navigation flow
- Adding new profile fields beyond what exists today
- Database schema changes
- Removing the existing `app/nutrition/profile.tsx` page

### Acceptance Criteria

- [ ] Given no profile exists, When user opens Settings, Then a "Set up your body profile" CTA card appears after the Units card
- [ ] Given a profile exists, When user opens Settings, Then the Body Profile card shows sex, age, weight, height, activity, and goal in a summary
- [ ] Given Settings is open, When user taps the Body Profile card, Then a bottom-sheet drawer opens with the profile form pre-filled (or empty if no profile)
- [ ] Given the drawer is open, When user fills valid data and taps Save, Then the profile is saved, macro targets are recalculated, drawer closes, and summary updates
- [ ] Given the drawer is open, When user taps the overlay or swipe-dismisses, Then the drawer closes without saving
- [ ] Given a profile was set via Settings drawer, When user opens Nutrition → Targets, Then the profile CTA shows the updated summary
- [ ] Given a profile was set via Nutrition → Targets → Profile page, When user opens Settings, Then the Body Profile card shows the updated summary
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] All existing tests pass with no regressions
- [ ] New component has test coverage for form validation and save flow

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No profile exists | Settings shows CTA card; drawer opens with empty form |
| Profile exists but has stale weight | Form pre-fills with saved profile data (not latest body weight) — consistent with existing behavior |
| User enters invalid data (age=0, negative weight) | Same validation as existing profile page: inline error messages, Save button disabled |
| Keyboard covers inputs | KeyboardAvoidingView scrolls drawer content above keyboard |
| Rapid open/close of drawer | No double-save or state corruption — debounce save action |
| Dark mode | All elements use theme colors (consistent with rest of Settings) |
| Screen reader | Card has accessibilityLabel; form inputs have accessibilityHint; drawer is announced as modal |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Modal keyboard handling issues on Android | Medium | Medium | Test on both platforms; use `KeyboardAvoidingView` with `behavior="padding"` on iOS, `behavior="height"` on Android |
| ProfileForm extraction breaks existing profile page | Low | High | Refactor carefully; verify Nutrition → Profile flow still works end-to-end |
| Modal z-index conflicts with Snackbar | Low | Low | Render Modal after Snackbar in component tree |
| State sync between drawer and parent | Low | Medium | Re-fetch profile from `app_settings` on drawer close |

## Review Feedback

### Quality Director (UX Critique)
**Verdict: NEEDS REVISION** — 2026-04-15

Core concept approved — surfacing profile in Settings is the right UX decision. Six items must be addressed:

1. **Clarify Modal vs Bottom Sheet**: Plan says "bottom-sheet drawer" with "swipe-dismiss" but specifies basic `Modal`. These are different. Pick plain Modal (consistent with progress.tsx) and remove swipe-dismiss claim.
2. **Add dismiss protection**: Show "Discard changes?" dialog when dirty form is dismissed via overlay tap. Users WILL lose work otherwise.
3. **Add `accessibilityViewIsModal`**: Explicitly require on the Modal (existing pattern in progress.tsx).
4. **Add loading state**: Specify what the profile card shows while `app_settings` is being read.
5. **Add error state**: Specify what the profile card shows if data fetch fails.
6. **Add error boundary note**: ProfileForm in modal should be wrapped so a crash doesn't take down Settings.

Additional notes:
- Activity Level SegmentedButtons (5 options) may be cramped at modal width on small phones. Test and consider alternative layout.
- Settings.tsx is 773 lines — extract profile card + modal into `components/SettingsProfileCard.tsx`.
- Summary card items need combined `accessibilityLabel` per label-value pair for screen readers.
- All summary grid font sizes must be >=12px per SKILL [C].

### Tech Lead (Technical Feasibility)
**Verdict: APPROVED** (2026-04-15)

- **Feasibility**: Fully buildable with current stack — no new dependencies, no schema changes
- **Architecture fit**: Compatible — uses existing `Modal` pattern from progress.tsx, `app_settings` for data
- **Effort**: Small-Medium | **Risk**: Low
- **Key recommendations**:
  1. Extract card+modal into `components/BodyProfileCard.tsx` (settings.tsx already 773 lines)
  2. `ProfileForm` should accept `initialProfile?: NutritionProfile` + `onSave` callback
  3. Test keyboard behavior on Android in modal before marking complete
  4. Keep `app/nutrition/profile.tsx` as thin wrapper around `ProfileForm` for backward compat

### CEO Decision
_Pending reviews_
