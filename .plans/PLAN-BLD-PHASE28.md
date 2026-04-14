# Feature Plan: User Flow Integration Tests (Phase 28)

**Issue**: BLD-73
**Author**: CEO
**Date**: 2026-04-14
**Status**: DRAFT

## Problem Statement

FitForge has 218 unit tests but **zero render-level integration tests** for user flows. The board goal explicitly requests: "build a more robust infra for automated end to end user-behavior like test. Mimic real world user flow asserting all common user interactions on complex steps are working."

Current test coverage:
- **15 lib/ unit tests**: test DB functions with mocked expo-sqlite (good data layer coverage)
- **2 app/ structural tests**: read source code as text and assert patterns (not real render tests)
- **0 integration tests**: no tests render React components, simulate user interactions, or verify screen output

The largest, most complex screens -- Session (1154 lines), Home (1073 lines), Progress (874 lines) -- have zero test coverage. These screens are the core workout-tracking experience.

## User Stories

- As a developer, I want integration tests for critical user flows so that regressions in workout logging, navigation, and data display are caught before merge
- As a QA agent, I want automated tests that simulate real user interactions so I can verify acceptance criteria without manual testing
- As a CEO, I want a test harness pattern that makes it easy to add integration tests for future features

## Proposed Solution

### Overview

Add 5 integration test suites covering the most critical user flows, using `@testing-library/react-native` (already installed) to render real React components, simulate user interactions (press, type, scroll), and assert on visible output. Tests run in Jest -- no emulator or device required.

### Test Architecture

Each integration test will:

1. **Mock expo-sqlite** at the module level (same pattern as existing `__tests__/lib/db.test.ts`) -- provide a mock DB that returns realistic test data
2. **Mock expo-router** -- provide a fake router with navigation tracking
3. **Mock native modules** (expo-haptics, expo-keep-awake, expo-sharing, etc.) -- noop stubs
4. **Render the screen component** using `@testing-library/react-native` `render()`
5. **Simulate user interactions** using `fireEvent.press()`, `fireEvent.changeText()`, `waitFor()`
6. **Assert on visible output** -- text content, element presence, navigation calls

### Shared Test Utilities

Create `__tests__/helpers/render.tsx` -- a shared test harness that:
- Wraps components in required providers (PaperProvider, ThemeProvider, NavigationContainer)
- Provides default mock implementations for expo-sqlite, expo-router, expo-haptics, etc.
- Exports a `renderScreen(Component, { mockDbQueries, routeParams })` helper
- Exports `createMockDb(overrides)` for per-test DB customization

### Test Suites

#### 1. Home Screen -- Workout Dashboard (`__tests__/flows/home.test.tsx`)

**What it tests**: The primary landing screen users see after opening the app.

**User flow**:
- Screen renders with recent sessions, templates list, and schedule
- User sees workout streak and weekly adherence
- User taps a template to start a session
- User sees the "no templates" empty state when no templates exist

**Mock data**: 3 templates, 5 recent sessions, schedule entries

**Assertions**:
- Template names are visible
- Recent session dates are displayed
- Tapping "Start" on a template triggers `startSession()` and navigates to `/session/{id}`
- Empty state shows "Create your first template" prompt when templates list is empty

#### 2. Active Session -- Set Logging (`__tests__/flows/session.test.tsx`)

**What it tests**: The core workout interaction -- logging sets during an active session.

**User flow**:
- Screen renders with exercises from the template
- User sees exercise name, previous performance, and input fields
- User enters weight and reps, taps "Log Set"
- Set appears in the completed list
- User taps "Complete Workout" to finish the session

**Mock data**: 1 active session with 3 exercises, previous set history

**Assertions**:
- Exercise names are visible
- Weight/reps inputs accept text
- After logging a set, it appears in the list with correct values
- "Complete Workout" button triggers `completeSession()` and navigates to summary
- RPE chip selection updates the set's RPE value

#### 3. Exercise Browser -- Search & Detail (`__tests__/flows/exercise.test.tsx`)

**What it tests**: Browsing, searching, and viewing exercise details.

**User flow**:
- Exercises screen renders with category filters and exercise list
- User searches for "bench press" -- list filters
- User taps an exercise -- navigates to detail screen
- Detail screen shows instructions, muscles, equipment

**Mock data**: 10 exercises across 3 categories

**Assertions**:
- Category filter buttons are visible
- Search input filters the list (only matching exercises shown)
- Tapping an exercise navigates to `/exercise/{id}`
- Exercise detail screen renders name, instructions, muscle tags

#### 4. Nutrition Logging (`__tests__/flows/nutrition.test.tsx`)

**What it tests**: Adding food entries and viewing daily macro summary.

**User flow**:
- Nutrition tab renders with today's macro summary (calories, protein, carbs, fat)
- User taps "Add Food"
- User searches for a food, selects it
- Macro totals update to reflect the new entry

**Mock data**: Macro targets, 2 existing food entries, food database results

**Assertions**:
- Daily macro totals are displayed (calories, protein values visible)
- "Add" button is present and navigates to `/nutrition/add`
- Food search returns results
- After adding a food, daily totals reflect the addition

#### 5. Onboarding Flow (`__tests__/flows/onboarding.test.tsx`)

**What it tests**: The first-launch onboarding wizard.

**User flow**:
- Welcome screen renders with "Get Started" button
- User taps "Get Started" -- navigates to setup screen
- User selects unit system (metric/imperial)
- User taps "Continue" -- navigates to recommend screen
- Recommend screen shows starter template suggestions

**Mock data**: Empty DB (first launch)

**Assertions**:
- Welcome text and "Get Started" button are visible
- Unit system toggle switches between metric/imperial
- Navigation progresses through welcome -> setup -> recommend
- Recommend screen renders starter template cards

### Scope

**In Scope:**
- 5 integration test suites (home, session, exercise, nutrition, onboarding)
- Shared test harness (`__tests__/helpers/render.tsx`)
- Mock infrastructure for expo-sqlite, expo-router, and native modules
- All tests run in Jest without an emulator

**Out of Scope:**
- E2E tests requiring a real device or emulator (Detox, Maestro)
- Visual regression testing (screenshot comparison)
- Performance testing
- Tests for settings, progress charts, or program management (future phases)
- Modifying any existing app code -- tests only

### Acceptance Criteria

- [ ] Given a fresh checkout, When `npm test` runs, Then all existing 218+ tests still pass (zero regressions)
- [ ] Given the test harness exists, When rendering any screen, Then it wraps in PaperProvider + NavigationContainer correctly
- [ ] Given the home flow test, When templates exist in mock DB, Then template names appear in rendered output
- [ ] Given the home flow test, When no templates exist, Then empty state text is visible
- [ ] Given the session flow test, When user enters weight/reps and taps log, Then the set appears in the completed list
- [ ] Given the exercise flow test, When user types in search, Then list filters to matching exercises
- [ ] Given the nutrition flow test, When daily entries exist, Then macro totals are displayed
- [ ] Given the onboarding flow test, When user taps "Get Started", Then navigation advances to setup
- [ ] Given all tests pass, When `npx tsc --noEmit` runs, Then zero type errors
- [ ] Given the PR, When reviewed, Then no new dependencies are added (all testing deps already installed)

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Screen renders with empty mock DB | Empty state UI is shown, no crash |
| Mock DB query throws error | Error boundary catches it, error screen renders |
| Screen component uses `useFocusEffect` | Mock triggers focus callback on render |
| Component uses `useLocalSearchParams` | Mock returns configured route params |
| Component uses `useRouter` | Mock tracks `push()`, `back()`, `replace()` calls |
| Component uses `Animated` API | React Native test renderer handles natively |
| Component uses `Platform.OS` | Jest-expo provides default platform (ios) |

### Technical Approach

**File structure:**
```
__tests__/
  helpers/
    render.tsx         # Shared test harness with providers
    mocks.ts           # Common mock factories (DB, router, etc.)
  flows/
    home.test.tsx      # Home screen integration test
    session.test.tsx   # Active session integration test
    exercise.test.tsx  # Exercise browser integration test
    nutrition.test.tsx # Nutrition logging integration test
    onboarding.test.tsx # Onboarding flow integration test
```

**Mock strategy:**
- Reuse the `jest.doMock("expo-sqlite")` + `jest.resetModules()` pattern from existing db.test.ts (documented in knowledge base)
- Create a `createMockDb()` factory that accepts query -> result mappings
- Mock expo-router: `{ useRouter: () => mockRouter, useLocalSearchParams: () => params, useFocusEffect: (cb) => cb() }`
- Mock all native-only modules (Haptics, KeepAwake, Sharing, SplashScreen) with noop stubs

**Provider wrapping:**
```tsx
function renderScreen(ui: React.ReactElement) {
  return render(
    <PaperProvider theme={light}>
      {ui}
    </PaperProvider>
  )
}
```

**Key dependency**: Tests MUST NOT import from `lib/db.ts` directly -- they render the component which internally calls DB functions. The mock intercepts at the expo-sqlite level so the full DB call chain is exercised.

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| expo-router mocking complexity | Medium | Medium | Start with simplest mock (useRouter, useLocalSearchParams), iterate |
| React Native Paper component rendering issues in test env | Medium | Medium | jest-expo preset handles most; may need to mock specific Paper components |
| Test flakiness from async state updates | Low | Medium | Use `waitFor()` and `act()` consistently |
| Large test file sizes mirroring large screen files | Medium | Low | Keep tests focused on user flows, not implementation details |
| Mock DB state management across tests | Low | Medium | Use `beforeEach` reset pattern from knowledge base |

## Review Feedback

### Quality Director (UX Critique)
_Pending review_

### Tech Lead (Technical Feasibility)

**Verdict: NEEDS REVISION**

**Reviewed**: 2026-04-14 by techlead (Opus 4.6)

**Technical Feasibility**: Directionally correct. @testing-library/react-native is the right tool, deps are installed, jest-expo + expo-sqlite mock patterns are solid foundation. But plan underestimates mock complexity for large screens.

**Architecture Fit**: Compatible — tests-only scope, no app refactoring needed. Provider wrapping approach is incomplete.

**Complexity**: Large (likely 2 implementation cycles). Risk: Medium-High (zero prior render tests = high unknowns).

**Critical Issues (4 MAJOR)**:

1. **Session screen too ambitious** — 1154 lines, 27 hooks, FlatList+Animated, Alert.alert, useKeepAwake, 18 DB imports. Full-screen render test will consume more effort than the other 4 suites combined. Recommend deferring to Phase 28b or testing sub-behaviors only.

2. **Missing mocks** — Plan omits: useLayout() hook (exercises, nutrition), Stack.Screen (session), Alert.alert (session), MaterialCommunityIcons (@expo/vector-icons), Animated.timing/Value, useWindowDimensions.

3. **FlatList rendering** — Home, Session, Exercises, Nutrition all use FlatList. In Jest, VirtualizedList may not render items without layout measurement mocks. Plan doesn't address this. Recommend documenting FlatList strategy.

4. **No spike phase** — Zero render tests exist today. Plan should include Phase 0: render onboarding/welcome.tsx (73 lines, 2 deps) to prove harness works before committing to 5 suites.

**Minor Issues (2)**:

5. expo-router useFocusEffect mock needs cleanup function support; Stack.Screen needs NavigationContainer context.
6. db.ts has 105 exported functions — mocking at expo-sqlite level requires realistic return data for every query path each screen uses.

**Recommendations**:
1. Split into Phase 28a (harness + onboarding + exercise browser) and Phase 28b (nutrition + home + session)
2. Start with spike: render onboarding/welcome, assert "Welcome to FitForge" is visible
3. Mock at lib/db level (jest.mock) for screen tests instead of expo-sqlite level — dramatically simpler
4. Keep expo-sqlite mocking for existing db.test.ts pattern (those intentionally exercise SQL)

**TODO before approval**:
- [ ] Add spike phase for harness validation
- [ ] Document FlatList rendering strategy
- [ ] Add complete mock dependency list
- [ ] Simplify or defer Session screen test
- [ ] Decide mock strategy: expo-sqlite vs lib/db level
- [ ] Size mock data factory work

### CEO Decision
_Pending reviews_
