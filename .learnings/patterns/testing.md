# Testing Patterns

## Learnings

### Reset Module Singletons with jest.resetModules() + jest.doMock()
**Source**: BLD-24 — RETRO: Write data layer tests
**Date**: 2026-04-13
**Context**: Testing `lib/db.ts` required each test to start with a fresh database singleton. The module caches the database instance at module scope, so importing it once means all tests share the same mock state. Standard `jest.mock()` at file top doesn't reset between tests.
**Learning**: `jest.resetModules()` in `beforeEach` clears Node's module cache, forcing the next `require()` to re-execute the module and reset its singleton. Pair with `jest.doMock()` (not `jest.mock()`) to re-register the mock after each reset, since `resetModules` also clears mock registrations. Then use `require()` (not static `import`) to get the fresh instance.
**Action**: For any module with cached global state (database connections, config singletons, auth tokens), use this pattern in tests: `beforeEach(() => { jest.resetModules(); jest.doMock("module", () => mockFactory); sut = require("../../lib/module"); })`. Always use `require()`, not top-level `import`, for the system under test.
**Tags**: jest, testing, singleton, resetmodules, domock, react-native, expo-sqlite, module-cache

### Bootstrap React Native Tests with jest-expo and transformIgnorePatterns
**Source**: BLD-24, BLD-25, BLD-26 — RETRO: Retrospective test coverage
**Date**: 2026-04-13
**Context**: Setting up Jest for a React Native Expo project required configuring Babel transforms, module resolution, and native module mocks. Without correct configuration, imports from `expo-*`, `react-native`, and `@react-native-community` packages fail with syntax errors.
**Learning**: The `jest-expo` preset handles Babel/Metro transform configuration automatically. The critical piece is `transformIgnorePatterns` — a whitelist regex that tells Jest which `node_modules` to transform (since RN packages ship untranspiled ES modules). Without it, every Expo/RN import fails. The pattern is: `'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo|...)'`.
**Action**: When bootstrapping tests in an Expo project: (1) install `jest`, `jest-expo`, `@testing-library/react-native`, `@types/jest`; (2) set `preset: 'jest-expo'` in jest.config.js; (3) copy the `transformIgnorePatterns` whitelist from an existing working config — do not write it from scratch. Mock `crypto.randomUUID` globally if the app uses UUID generation.
**Tags**: jest, jest-expo, testing, react-native, expo, transform-ignore-patterns, babel, test-setup, bootstrap

### Mock expo-router with useFocusEffect-as-useEffect for Flow Tests
**Source**: BLD-75, BLD-76 — User Flow Integration Tests + RNTL Infrastructure
**Date**: 2026-04-14
**Context**: RNTL flow tests render real screen components that import `useRouter`, `useFocusEffect`, `useLocalSearchParams`, and `Stack.Screen` from expo-router. Without a complete mock, tests crash on missing navigation context.
**Learning**: expo-router requires a module-level `jest.mock('expo-router', ...)` declared BEFORE importing any component that uses it. The critical piece is replacing `useFocusEffect` with `React.useEffect` so focus-based data loading triggers in tests. Declare `mockRouter` as a module-level `const` with `jest.fn()` methods so assertions can verify navigation calls.
**Action**: Use this standard mock at the top of every flow test file (before component imports): `const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() }; jest.mock('expo-router', () => { const R = require('react'); return { useRouter: () => mockRouter, useLocalSearchParams: () => ({}), useFocusEffect: (cb) => { R.useEffect(() => { const cleanup = cb(); return typeof cleanup === 'function' ? cleanup : undefined }, []) }, Stack: { Screen: () => null } } })`. Clear mockRouter in `beforeEach`.
**Tags**: expo-router, jest, testing, rntl, usefocuseffect, mock, flow-test, react-native, navigation

### Static Route-Name Validation Test for Expo Router
**Source**: BLD-95, BLD-96 — Route name mismatch crashes app layout
**Date**: 2026-04-15
**Context**: A `Stack.Screen name="schedule"` mismatch went undetected through development, code review, and all existing tests — only caught when a user reported the "Get Started" button was broken. No test validated that declared route names matched actual route files.
**Learning**: A static test can read `_layout.tsx`, extract all `Stack.Screen name="..."` values via regex, and validate each maps to an existing file under `app/` (checking `.tsx`, `_layout.tsx`, and directory existence). This catches directory/index mismatches, orphaned screen declarations, and typos before they reach production.
**Action**: Add a route-name validation test that uses `fs.readFileSync` to parse `_layout.tsx` for route names and `fs.existsSync` to verify each one. Run it in CI. Pattern: `const names = [...layout.matchAll(/name="([^"]+)"/g)].map(m => m[1])` then `it.each(names)("route '%s' maps to file", name => expect(exists(name)).toBe(true))`.
**Tags**: expo-router, regression-test, route-validation, static-analysis, testing, ci, navigation

### Silent Calculation Bugs Require Reference-Value Unit Tests
**Source**: BLD-25, BLD-26 — Retrospective test coverage for calculations and core workflows
**Date**: 2026-04-15
**Context**: During retrospective test planning, the team identified that calculation logic bugs (macro tracking, chart aggregation, volume analysis) never crash — they produce silently wrong numbers. These are invisible without tests and expensive to debug in production.
**Learning**: Calculation bugs form a distinct "silent failure" category: wrong output, no error. Unlike crashes or missing UI, silent data bugs can persist for weeks before users notice incorrect nutrition targets or progress stats. Only unit tests with known reference values catch them.
**Action**: For every calculation function (BMR, TDEE, macros, 1RM, volume aggregation), write unit tests with hand-verified reference values BEFORE merging. Include edge cases: zero inputs, very large values, missing optional fields, and rounding precision. Treat untested calculation code as a latent data-accuracy bug.
**Tags**: testing, calculations, silent-bugs, unit-tests, reference-values, data-accuracy, regression

### Use Real Domain Data in Acceptance Tests — Only Mock Infrastructure
**Source**: BLD-55 — Starter Templates and Programs Acceptance Tests
**Date**: 2026-04-15
**Context**: Acceptance tests for the onboarding recommend screen needed to verify that starter templates (Full Body, PPL, etc.) rendered correctly. The team chose to import real `STARTER_TEMPLATES` and `STARTER_PROGRAM` constants from `lib/starter-templates.ts` rather than creating mock template data.
**Learning**: When testing screens that display static or seed data, import the real exported data constants and assert against their actual values (e.g., `expect(getByText(STARTER_TEMPLATES[0].name))`). This catches data structure changes, missing fields, and content drift that hand-written mock data would miss. Mock only infrastructure (database, router, file system) — never mock the domain data you are testing.
**Action**: In acceptance tests for screens that render seed/reference data, import the real data module and use its values in assertions. Reserve `jest.mock()` for infrastructure dependencies (db, router, icons, layout). If the data module has side effects, extract the pure data into a separate file that can be imported without mocking.
**Tags**: testing, acceptance-tests, rntl, real-data, mocking-strategy, seed-data, starter-templates

### Playwright Worker Isolation Breaks Module-Level State Aggregation
**Source**: BLD-195 — Expand pixelslop screenshot capture to all pages
**Date**: 2026-04-16
**Context**: A screenshot capture spec used a module-level `Map<string, ManifestScreen>` to accumulate data across tests, with `test.afterAll` writing a manifest JSON file. The manifest was always empty.
**Learning**: Playwright runs each project (e.g., mobile/tablet/desktop viewports) in separate worker processes when `fullyParallel: true`. Module-level variables are NOT shared between workers — each worker gets its own empty copy. `test.afterAll` runs per-worker, not globally, so aggregation across projects fails silently.
**Action**: Never use module-level variables to aggregate data across Playwright projects. For cross-worker data collection, use `globalTeardown` (runs once in the main process after all workers finish) and scan the filesystem for artifacts written by individual workers. Each worker should write its outputs to disk; the teardown script collects them.
**Tags**: playwright, testing, worker-isolation, globalteardown, parallel, cross-project, e2e

### Adding Module Exports Breaks Partial jest.mock() Declarations
**Source**: BLD-200/BLD-202 — Replace Modal with BottomSheet for workout session drawer
**Date**: 2026-04-16
**Context**: BLD-207 added `getAppSetting` to `lib/db.ts`. Three test files mocked `lib/db` with an explicit object listing only the functions they used (`getAllExercises`, `getExerciseById`, etc.). The new `getAppSetting` was not in their mocks, causing 30 tests to fail with `TypeError: getAppSetting is not a function`.
**Learning**: When `jest.mock('module', () => ({ fn1, fn2 }))` uses an explicit return object, it replaces the ENTIRE module — any export not listed in the mock becomes `undefined`. Adding a new export to a widely-mocked module silently breaks all test files that use partial explicit mocks. The breakage is invisible until tests run.
**Action**: After adding a new export to any module, grep for `jest.mock.*<module-path>` across the entire test suite and add the new export to every partial mock. Alternatively, use `jest.mock('module')` with `jest.spyOn` for individual functions — this auto-mocks all exports and survives new additions.
**Tags**: jest, testing, mock, module-exports, partial-mock, breaking-change, test-maintenance

### Source-Level Structural Tests for Design System Compliance
**Source**: BLD-198/BLD-212 — Floating bottom navbar redesign (GitHub #103)
**Date**: 2026-04-16
**Context**: PR #112 was blocked twice for hardcoded `#000` shadowColor and undersized font (10px). These are recurring review findings. The fix PR added structural tests that read component source code with `fs.readFileSync` and validate design system rules: `expect(src).toContain("theme.colors.shadow")`, `expect(src).not.toContain('shadowColor: "#000"')`, regex extraction of `fontSize` values asserting `≥ 12`.
**Learning**: When code review repeatedly catches the same category of violation (hardcoded colors, undersized fonts, missing a11y attributes), encode those rules as structural source-level tests. Unlike render-based tests, these read the file as a string and assert patterns — making them fast, deterministic, and independent of runtime mocking. They shift enforcement from review time to CI time.
**Action**: For components with design system requirements, add a test that reads the source via `fs.readFileSync`, then asserts: (1) theme tokens are used (`toContain("theme.colors.X")`), (2) hardcoded values are absent (`not.toContain`), (3) numeric style values meet minimums via regex extraction. Group these as a `describe("design system compliance")` block in the component's test file.
**Tags**: testing, structural-tests, design-system, theme-compliance, accessibility, code-review-automation, source-analysis, jest

### Vendored UI Components Expand Reanimated Mock Surface Area
**Source**: BLD-314 — P4b: Migrate screens batch 2
**Date**: 2026-04-18
**Context**: After migrating to BNA UI, 26 dashboard tests broke. BNA Button uses `react-native-reanimated` internally (`useSharedValue`, `useAnimatedStyle`, `withTiming`, `FadeIn`, `SlideInDown`). The existing reanimated mock only provided `FadeInDown`, `Easing`, and `createAnimatedComponent`.
**Learning**: Vendored (copy-paste) UI libraries like BNA UI bring their own reanimated usage that may differ from what the app previously used. Each new BNA component can introduce new reanimated exports into the render tree. Tests that mock reanimated with a minimal set of exports will break when new components are rendered — not because the test logic changed, but because the component tree now reaches reanimated paths the mock doesn't cover.
**Action**: When migrating to BNA components that use reanimated, proactively expand the reanimated mock to include: `useSharedValue`, `useAnimatedStyle`, `withTiming`, `withSpring`, `FadeIn`, `FadeOut`, `SlideInDown`, `SlideOutDown`, and `runOnJS`. Create a shared mock file (e.g., `__mocks__/react-native-reanimated.ts`) that covers the full BNA usage set, rather than patching individual test files.
**Tags**: testing, react-native-reanimated, mocks, bna-ui, vendored-components, jest, dashboard

### moduleNameMapper Enforces __mocks__/ Directory Mock Resolution for Reanimated
**Source**: BLD-334 — Phase 50: Meal Templates
**Date**: 2026-04-18
**Context**: After adding BNA BottomSheet to the meal template feature, accessibility tests broke with `TypeError: withSpring is not a function`. The `__mocks__/react-native-reanimated.js` file existed with the correct exports, but Jest's module resolver was not reliably picking it up.
**Learning**: Jest's `__mocks__/` directory convention is a fallback mechanism — it does not guarantee the mock is used in all resolution paths. Adding an explicit `moduleNameMapper` entry in `jest.config.js` (`'react-native-reanimated': '<rootDir>/__mocks__/react-native-reanimated.js'`) forces Jest to always resolve to the mock file, regardless of how the module is imported (direct, transitive, or via vendored components). This is more reliable than relying on `__mocks__/` directory convention alone.
**Action**: When a shared mock file in `__mocks__/` is not being picked up by tests (especially for transitive dependencies like reanimated imported by vendored UI components), add a `moduleNameMapper` entry in `jest.config.js` pointing to the mock file. This is the authoritative enforcement mechanism — do not rely on directory convention for critical mocks.
**Tags**: jest, modulenamemapper, react-native-reanimated, mocks, jest-config, transitive-dependency, bottom-sheet

### Mock-Based DB Tests Cannot Gate Query Refactoring
**Source**: BLD-369 — Migrate database layer to Drizzle ORM for type safety
**Date**: 2026-04-19
**Context**: A 5-phase Drizzle ORM migration plan proposed refactoring ~204 SQL operations across 24 modules. Both QD and TL independently rejected it, citing the same critical risk: FitForge's 666-line DB test suite mocks the entire SQLite layer, verifying SQL strings passed to `getAllAsync`/`getFirstAsync` — not actual query semantics or result correctness.
**Learning**: Tests that mock the database driver (intercepting SQL strings rather than executing them against a real or in-memory DB) provide zero regression safety for query refactoring. They verify "this code sends this SQL string" — which is exactly what changes during a migration. A query that produces identical results via different SQL will FAIL mock-based tests. A query that produces WRONG results via syntactically valid SQL will PASS them. Mock-based tests gate API contracts, not query correctness.
**Action**: Before attempting any large-scale query refactoring (ORM migration, query optimization, SQL dialect change), verify that the test suite executes queries against a real database — even an in-memory one. If tests mock the DB layer, build integration tests first. Do not rely on "all tests pass" as a quality gate when the tests cannot detect semantic query regressions.
**Tags**: testing, database, mocking, integration-tests, query-refactoring, orm, drizzle, regression-safety
