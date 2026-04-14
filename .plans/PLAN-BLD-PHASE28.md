# Feature Plan: User Flow Integration Tests (Phase 28)

**Issue**: BLD-73
**Author**: CEO
**Date**: 2026-04-14
**Status**: DRAFT (Rev 2 -- addressing QD + TL feedback)

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

Add integration test suites in **two phases**, using `@testing-library/react-native` (already installed) to render real React components, simulate user interactions (press, type, scroll), and assert on visible output. Tests run in Jest -- no emulator or device required.

**Phase 28a** (this issue): Spike + 3 low-risk suites (onboarding, exercises, nutrition)
**Phase 28b** (future issue): 2 high-risk suites (home, session -- complex state, FlatList-heavy)

### Test Architecture

Each integration test will:

1. **Mock `lib/db` at function level** using `jest.mock('../../lib/db')` -- each DB function returns controlled test data. The existing unit tests already verify db.ts -> expo-sqlite integration, so integration tests focus on Component -> lib/db.
2. **Mock expo-router** -- provide a fake router with navigation tracking, correct useFocusEffect lifecycle
3. **Mock native modules** (expo-haptics, expo-keep-awake, expo-sharing, MaterialCommunityIcons, etc.) -- noop stubs
4. **Render the screen component** using `@testing-library/react-native` `render()` with full provider wrapping
5. **Simulate user interactions** using `fireEvent.press()`, `fireEvent.changeText()`, `waitFor()`
6. **Assert on visible output AND accessibility** -- text content, element presence, navigation calls, `getByRole`, `getByLabelText`

### Mock Strategy Decision (addresses QD Critical #1 and TL concern)

**Decision: Mock at `lib/db` level (option b), NOT at expo-sqlite level.**

Rationale:
- Unit tests (`__tests__/lib/db.test.ts`) already verify the DB layer (lib/db -> expo-sqlite). Duplicating that in integration tests is wasteful.
- Mocking at lib/db level means each screen test controls exactly what each DB function returns. No SQL pattern matching fragility.
- Session screen imports 18 DB functions -- mocking each at function level is explicit and maintainable. Mocking at expo-sqlite level would require SQL-coupled pattern matching.
- This is standard RTL practice: test the boundary closest to what you render.

Example:
```tsx
jest.mock('../../lib/db', () => ({
  getTemplates: jest.fn().mockResolvedValue([
    { id: 'tpl-1', name: 'Push Day', exercises: 3 },
  ]),
  getRecentSessions: jest.fn().mockResolvedValue([]),
  startSession: jest.fn().mockResolvedValue('session-123'),
  // ... only mock the functions THIS screen imports
}))
```

### Provider Wrapping (addresses QD Critical #2)

The `renderScreen()` helper MUST replicate all required providers. Here is the complete list:

| Provider | Source | Required? | How handled in tests |
|----------|--------|-----------|---------------------|
| `PaperProvider` | react-native-paper | YES | Wrap with `light` theme |
| `NavigationContainer` | @react-navigation/native | NO | Not needed -- screens don't use NavigationContainer directly; expo-router hooks are mocked |
| `Stack` / `Stack.Screen` | expo-router | NO | Screens don't render Stack.Screen themselves (only _layout.tsx does) |
| `ErrorBoundary` | components/ErrorBoundary | YES (for error tests) | Wrap for error boundary tests; omit for normal flow tests |
| DB initialization | lib/db getDatabase() | NO | Mocked at lib/db level -- no real DB init needed |
| SplashScreen | expo-splash-screen | NO | Mocked as noop |
| Onboarding redirect | _layout.tsx | NO | Not part of individual screen rendering |

```tsx
import { render } from '@testing-library/react-native'
import { PaperProvider } from 'react-native-paper'
import { light } from '../../constants/theme'

function renderScreen(ui: React.ReactElement) {
  return render(
    <PaperProvider theme={light}>
      {ui}
    </PaperProvider>
  )
}

// For error boundary tests:
function renderWithErrorBoundary(ui: React.ReactElement) {
  return render(
    <PaperProvider theme={light}>
      <ErrorBoundary>{ui}</ErrorBoundary>
    </PaperProvider>
  )
}
```

### expo-router Mock (addresses QD Critical #3 -- useFocusEffect)

The useFocusEffect mock must handle the cleanup function pattern correctly:

```tsx
jest.mock('expo-router', () => {
  const React = require('react')
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => mockParams,
    usePathname: () => '/test',
    useFocusEffect: (cb: () => (() => void) | void) => {
      // Wrap in real useEffect to handle cleanup correctly
      React.useEffect(() => {
        const cleanup = cb()
        return typeof cleanup === 'function' ? cleanup : undefined
      }, [])
    },
    Stack: { Screen: () => null },
    Redirect: () => null,
  }
})
```

### Required Module Mocks (addresses TL concern #2)

Every integration test file must mock these modules:

| Module | Mock approach |
|--------|--------------|
| `expo-router` | Custom mock (see above) |
| `lib/db` | `jest.mock()` with per-test function overrides |
| `lib/programs` | `jest.mock()` with noop functions |
| `lib/interactions` | `jest.mock()` with noop `log()` |
| `lib/errors` | `jest.mock()` with noop functions |
| `expo-haptics` | `jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ... }))` |
| `expo-keep-awake` | `jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }))` |
| `expo-sharing` | `jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))` |
| `expo-splash-screen` | `jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() }))` |
| `@expo/vector-icons/MaterialCommunityIcons` | `jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')` |
| `lib/layout` | `jest.mock('../../lib/layout', () => ({ useLayout: () => ({ wide: false, width: 375, scale: 1.0 }) }))` |
| `react-native` Alert | `jest.spyOn(Alert, 'alert').mockImplementation(...)` (per-test, for Session) |

### Spike Phase (addresses TL concern #4)

**Before implementing any flow test, the engineer MUST complete a spike:**

1. Create `__tests__/flows/spike.test.tsx`
2. Render `app/onboarding/welcome.tsx` (73 lines, minimal deps: useRouter, useTheme, MaterialCommunityIcons)
3. Assert: `getByText('Welcome to FitForge')` is visible
4. Assert: `getByRole('button', { name: /get started/i })` exists (a11y check)
5. Assert: pressing the button calls `router.push('/onboarding/setup')`

If the spike fails, stop and debug the harness before proceeding. If it passes, delete it and fold the assertions into the onboarding test suite.

### Test Suites -- Phase 28a (This Issue)

#### 1. Onboarding Flow (`__tests__/flows/onboarding.test.tsx`)

**Why first**: Simplest screens (73 + 215 lines), minimal DB deps, no FlatList, no useFocusEffect.

**Tests**:
- Welcome screen renders "Welcome to FitForge" text and dumbbell icon
- "Get Started" button is accessible (`getByRole('button')`) and navigates to setup
- Setup screen shows unit system toggle (metric/imperial)
- Selecting unit system and tapping "Continue" navigates to recommend
- Recommend screen renders starter template cards
- **A11y**: All buttons have accessible names
- **Error**: If getDatabase() fails on welcome, app still renders (no DB needed for welcome)

**Mock data**: Minimal -- only onboarding-related DB functions (saveSettings, getBodySettings)

#### 2. Exercise Browser (`__tests__/flows/exercise.test.tsx`)

**Why second**: Medium complexity (452 lines), uses FlatList but with simple items, uses useLayout.

**Tests**:
- Screen renders with exercise list from mock data
- Category filter buttons are visible and filter the list
- Search input filters exercises by name
- Tapping exercise navigates to `/exercise/{id}`
- Empty state shows appropriate message when no exercises match filter
- **Loading**: Initial render shows loading state, then data appears after async resolution
- **A11y**: Search input has `accessibilityLabel`, exercise items are accessible
- **Error boundary**: When `getAllExercises()` throws, ErrorBoundary renders error screen

**Mock data**: 10 exercises across 3 categories (Chest, Legs, Back)

**FlatList strategy**: Mock `useLayout` to return `{ wide: false, width: 375, scale: 1.0 }`. Use `waitFor()` for async data loading. RNTL handles basic FlatList rendering at default `initialNumToRender`.

#### 3. Nutrition Logging (`__tests__/flows/nutrition.test.tsx`)

**Why third**: Medium complexity (430 lines), async data, uses useLayout.

**Tests**:
- Screen renders with today's macro summary (calories, protein, carbs, fat)
- Progress bars reflect current intake vs targets
- "Add" button navigates to `/nutrition/add`
- Date navigation shows different day's data
- Empty state (no entries today) shows appropriate message
- **Loading**: Verify loading state renders before data
- **A11y**: Add button has accessible label, macro values are labeled
- **Error boundary**: When DB throws, error screen renders

**Mock data**: Macro targets (2000 cal, 150g protein, 250g carbs, 67g fat), 2 food entries

### Deferred to Phase 28b

#### Home Screen (complex -- 1073 lines, 15+ DB functions, FlatList with multiple sections, useFocusEffect with complex data refresh)

#### Active Session (highest risk -- 1154 lines, 18 DB function imports, Animated, timers, Haptics, Alert.alert, FlatList with animated items. Per TL recommendation: split into sub-flow tests -- session-render, session-logging, session-completion)

### Scope

**In Scope (Phase 28a):**
- Spike test proving harness works
- 3 integration test suites (onboarding, exercises, nutrition)
- Shared test harness (`__tests__/helpers/render.tsx`)
- Shared mock factories (`__tests__/helpers/factories.ts`)
- Module mock setup (`__tests__/helpers/mocks.ts`)
- At least 1 a11y assertion per test suite
- At least 1 error boundary test
- At least 1 loading state test

**Out of Scope:**
- Home screen flow tests (Phase 28b)
- Session screen flow tests (Phase 28b)
- E2E tests requiring emulator (Detox, Maestro)
- Visual regression testing
- Performance testing
- Modifying any existing app code -- tests only
- New dependencies

### Acceptance Criteria

- [ ] Given a fresh checkout, When `npm test` runs, Then all existing 218+ tests still pass (zero regressions)
- [ ] Given the test harness, When rendering any screen, Then it wraps in PaperProvider with correct theme
- [ ] Given the onboarding test, When welcome renders, Then "Welcome to FitForge" is visible AND "Get Started" button is accessible via getByRole
- [ ] Given the exercise test, When user types "bench" in search, Then only matching exercises appear
- [ ] Given the exercise test, When getAllExercises throws, Then ErrorBoundary renders error message
- [ ] Given the nutrition test, When daily entries exist, Then macro totals are displayed with correct values
- [ ] Given any flow test, When screen first renders, Then a loading/empty state is visible before data loads
- [ ] Given each test suite, When assertions run, Then at least one uses getByRole or getByLabelText (a11y)
- [ ] Given all tests pass, When `npx tsc --noEmit` runs, Then zero type errors
- [ ] Given the PR, When reviewed, Then no new dependencies are added
- [ ] Given the test run, Then total flow test execution time is under 30 seconds
- [ ] Given each test, Then `jest.setTimeout(10000)` is set to handle async rendering

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Screen renders with empty mock data | Empty state UI is shown, no crash |
| DB function throws error | ErrorBoundary catches it, error screen renders with message |
| useFocusEffect cleanup runs | No memory leak or warning |
| Component uses useLayout | Mock returns consistent { wide: false, width: 375 } |
| Component uses MaterialCommunityIcons | Mock renders as plain text/noop |
| FlatList with 0 items | Empty state renders |
| FlatList with 50+ items | initialNumToRender handles it; test only checks first few |
| Async state updates | Tests use waitFor() consistently |
| Platform.OS check | jest-expo default (ios) |

### Technical Approach

**File structure:**
```
__tests__/
  helpers/
    render.tsx         # renderScreen() with PaperProvider wrapping
    factories.ts       # createMockExercise(), createMockSession(), etc.
    mocks.ts           # Shared mock setup (router, native modules)
  flows/
    onboarding.test.tsx  # Onboarding wizard flow
    exercise.test.tsx    # Exercise browser flow
    nutrition.test.tsx   # Nutrition logging flow
```

**Test data factories** (`__tests__/helpers/factories.ts`):
```tsx
export function createExercise(overrides = {}) {
  return {
    id: 'ex-1', name: 'Bench Press', category: 'Chest',
    primary_muscles: 'Chest', secondary_muscles: 'Triceps',
    equipment: 'Barbell', instructions: 'Lie on bench...',
    difficulty: 'intermediate', is_custom: 0, deleted: 0,
    ...overrides,
  }
}

export function createFoodEntry(overrides = {}) { ... }
export function createTemplate(overrides = {}) { ... }
export function createSession(overrides = {}) { ... }
```

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Spike fails (harness can't render screens) | Medium | High | Spike is first -- if it fails, we debug before writing full suites |
| FlatList doesn't render items in test env | Medium | Medium | Use waitFor(), test first few items only, fallback to mock FlatList |
| Async state makes tests flaky | Low | Medium | Use waitFor() and act() consistently, set jest.setTimeout(10000) |
| Too many mock functions needed per screen | Medium | Low | factories.ts provides defaults; per-test overrides for specific scenarios |
| react-native-paper components render differently in test | Low | Medium | jest-expo preset handles most; mock specific components if needed |

## Review Feedback

### Quality Director (UX Critique)
**Rev 1 Verdict**: NEEDS REVISION

Addressed in Rev 2:
- [x] Mock strategy decided: lib/db level (option b) -- explicit, maintainable
- [x] Provider wrapping fully specified with table of all providers
- [x] useFocusEffect mock handles cleanup correctly via React.useEffect wrapper
- [x] A11y assertions required: minimum 1 per suite using getByRole/getByLabelText
- [x] Error boundary test added as first-class test case (not just edge case mention)
- [x] Loading state tests added
- [x] Test timeout guidance added (jest.setTimeout 10000, suite target under 30s)

### Tech Lead (Technical Feasibility)
**Rev 1 Verdict**: NEEDS REVISION

Addressed in Rev 2:
- [x] Spike phase added -- prove harness works with onboarding/welcome before other suites
- [x] FlatList strategy documented (waitFor, initialNumToRender defaults, test first few items)
- [x] Missing mocks fully listed (useLayout, MaterialCommunityIcons, Alert, etc.)
- [x] Session screen deferred to Phase 28b (too complex for first integration tests)
- [x] Mock strategy decided: lib/db level, with justification
- [x] Two-phase structure: 28a = harness + 3 low-risk suites; 28b = 2 high-risk suites
- [x] Mock data factory work sized via factories.ts specification

### CEO Decision
_Pending re-reviews from QD and TL_
