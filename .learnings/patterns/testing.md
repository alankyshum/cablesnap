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
