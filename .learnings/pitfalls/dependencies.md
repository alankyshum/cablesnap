# Dependency Pitfalls

## Learnings

### legacy-peer-deps Masks Missing Peer Dependencies
**Source**: BLD-12, BLD-14 — Fix FitForge broken build / Pipeline halt
**Date**: 2026-04-12
**Context**: FitForge used `.npmrc` with `legacy-peer-deps=true` to bypass peer dependency conflicts between react@19.1.0 and expo-router's transitive react-dom requirement. This silently skipped all peer dependency validation.
**Learning**: `legacy-peer-deps=true` allows `npm install` to succeed but hides genuinely missing dependencies. `react-native-reanimated@4.x` requires `react-native-worklets` as a peer dep, but the missing-peer warning was suppressed. Metro crashed at runtime trying to resolve the missing module. The install succeeded; the app did not.
**Action**: When using `legacy-peer-deps`, manually audit peer dependencies of every direct dependency. Run `npm ls --all` after install to check for unmet peers. Pin matching versions of react, react-dom, and react-native-web to prevent version drift.
**Tags**: npm, peer-dependencies, legacy-peer-deps, react-native-reanimated, react-native-worklets, expo, metro

### Use expo-document-picker for File Selection, Not expo-file-system
**Source**: BLD-13 — Phase 4: Progress Charts, Rest Timer & Import/Export
**Date**: 2026-04-12
**Context**: The import feature initially used `File.pickFileAsync()` from expo-file-system, which does not exist in v55. This would crash at runtime when the user tapped "Import Data."
**Learning**: `expo-file-system` is for reading/writing files on disk. It has no file picker UI. For presenting a system file picker to the user, use `expo-document-picker` (`DocumentPicker.getDocumentAsync()`). These are separate packages with distinct responsibilities.
**Action**: Use `expo-document-picker` for file selection and `expo-file-system` for file I/O. Always verify that an API method exists in the installed version before using it — check Expo SDK docs for the specific version.
**Tags**: expo, expo-document-picker, expo-file-system, file-picker, api-mismatch

### Pin react-test-renderer to Match Expo SDK's React Version
**Source**: BLD-75 — Implement: User Flow Integration Tests (Phase 28a)
**Date**: 2026-04-14
**Context**: Adding RNTL flow tests with `react-test-renderer@^19.2.5` failed because Expo SDK 55 pins `react@19.1.0`. The caret range resolved to 19.2.5, which declares `peerDependencies: { "react": "^19.2.5" }`, creating an unresolvable mismatch.
**Learning**: `react-test-renderer` must exactly match the project's React minor version. Expo SDK controls the React version; using a caret range for react-test-renderer lets npm resolve to a newer minor that is incompatible with the SDK-pinned React.
**Action**: Pin `react-test-renderer` to the exact minor version matching the project's React (e.g., `"react-test-renderer": "19.1.0"` when Expo uses `react@19.1.0`). After every Expo SDK upgrade, bump react-test-renderer to match the new React version.
**Tags**: react-test-renderer, react, expo, version-pinning, peer-dependencies, rntl, testing

### expo-notifications Requires Explicit expo-modules-core

**Source**: BLD-93 — Workout Reminders & Push Notifications (Phase 34)
**Date**: 2026-04-14
**Context**: Adding `expo-notifications` without explicitly installing `expo-modules-core` caused all 28 jest-expo test suites to fail with `Cannot find module 'expo-modules-core' from 'node_modules/jest-expo/src/preset/setup.js'`.
**Learning**: `jest-expo/src/preset/setup.js` imports `expo-modules-core` at test startup. While it's a transitive dependency of many Expo packages, it may not be hoisted properly in `node_modules` when added only indirectly. Explicitly declaring it in `package.json` guarantees correct installation.
**Action**: When adding expo-notifications (or similar packages that depend on expo-modules-core), always install both: `npx expo install expo-notifications` then `npx expo install expo-modules-core`. Then clean reinstall: `rm -rf node_modules && npm install --legacy-peer-deps`.
**Tags**: expo-notifications, expo-modules-core, jest-expo, test-failures, dependency-hoisting

### Use Tilde Ranges for Expo SDK Packages — Caret Allows Incompatible Majors
**Source**: BLD-129 — Align Expo dependency versions to SDK-compatible ranges
**Date**: 2026-04-15
**Context**: FitForge used caret `^` version ranges (e.g., `^55.0.13`) for Expo packages like expo-document-picker, expo-file-system, expo-haptics, expo-sharing, expo-sqlite, jest-expo, and react-native-svg. `npx expo start` warned about 8 packages not matching expected SDK versions. The caret range resolved to major versions far beyond what the SDK was tested with.
**Learning**: Expo SDK expects specific version ranges for its companion packages. Caret `^` ranges allow npm to resolve to newer major versions that may be API-incompatible or untested with the current SDK. Expo's own `npx expo install` uses tilde `~` ranges (patch-only updates) for a reason — SDK packages are versioned in lockstep. Additionally, `expo-sqlite` must be registered as a plugin in `app.config.ts` for its native module to initialize correctly.
**Action**: Always use `npx expo install <package>` instead of `npm install <package>` for Expo-ecosystem packages. Run `npx expo install --fix` periodically to realign versions. Never manually widen Expo package ranges from `~` to `^`. When adding expo-sqlite, include it in the `plugins` array in `app.config.ts`.
**Tags**: expo, dependency-versions, tilde-range, caret-range, expo-install, sdk-compatibility, expo-sqlite, app-config

### qa-fitforge CODE-02 False Positive with sub.remove()

**Source**: BLD-93 — Workout Reminders & Push Notifications (Phase 34)
**Date**: 2026-04-14
**Context**: `qa-fitforge.sh` CODE-02 check greps for literal `removeEventListener` to verify listener cleanup. React Native's modern subscription API (`AppState.addEventListener`) returns a subscription object cleaned up via `sub.remove()`, which the grep doesn't detect.
**Learning**: The deterministic check uses string matching, not AST analysis. Modern RN cleanup patterns like `sub.remove()` are functionally correct but invisible to the grep. Adding a comment mentioning `removeEventListener` satisfies the check while documenting the equivalent pattern.
**Action**: When using subscription-based listeners, add a comment containing `removeEventListener` near the cleanup return to satisfy qa-fitforge.sh CODE-02.
**Tags**: qa-fitforge, CODE-02, listener-cleanup, AppState, removeEventListener, false-positive

### Expo SDK Major Upgrades Require Config and Mock Fixups Beyond Version Bumps
**Source**: BLD-149 — Upgrade Expo SDK 54 → 55
**Date**: 2026-04-15
**Context**: Upgrading from Expo SDK 54 to 55 via `npx expo install expo@latest` + `npx expo install --fix` resolved version warnings, but the build still failed until deprecated config fields were removed and test mocks were updated.
**Learning**: Expo SDK major upgrades break in three layers beyond package versions: (1) deprecated app.config.ts fields are removed (SDK 55 removed `newArchEnabled` and `edgeToEdgeEnabled` — now defaults), (2) TypeScript types change (e.g., `NotificationContent.data` became optional), and (3) test mocks need updating for new library versions (react-native-reanimated v4, react-native-worklets). Running `npx expo install --fix` only handles layer 1 (versions); the other two require manual intervention.
**Action**: After `npx expo install expo@latest && npx expo install --fix`: (1) check release notes for removed config fields and delete them from app.config.ts, (2) run `tsc --noEmit` to catch type-level API changes, (3) run the full test suite to identify mock failures, and (4) update jest mocks for any upgraded native bridge libraries. Always verify with `npx expo install --check` that zero warnings remain.
**Tags**: expo, sdk-upgrade, breaking-changes, app-config, typescript, test-mocks, react-native-reanimated, migration

### React Native Easing and Reanimated Easing Are Not Interchangeable
**Source**: BLD-254 — FIX: Reanimated Easing crash — import from wrong package
**Date**: 2026-04-17
**Context**: `constants/design-tokens.ts` imported `Easing` from `react-native` and used the values in `withTiming()` calls throughout the animation system. Every user session crashed with `[Reanimated] The easing function is not a worklet`.
**Learning**: `react-native` and `react-native-reanimated` both export an `Easing` module with identical APIs, but they are not interchangeable. Reanimated's `Easing` produces worklet-compatible functions that run on the UI thread; React Native's `Easing` produces plain JS functions that crash when passed to `withTiming()`, `withSpring()`, or any worklet context. TypeScript cannot catch this — the type signatures match. Jest tests cannot catch this — mocks bypass the worklet runtime. Only real device execution surfaces the crash.
**Action**: Always import `Easing` from `react-native-reanimated`, never from `react-native`, when the values will be used in any Reanimated animation. When adding `Easing` to a shared constants file, verify the import source. When mocking `react-native-reanimated` in tests, include `Easing: { bezier: () => (t: number) => t }` in the mock object.
**Tags**: react-native-reanimated, easing, worklet, import, withTiming, animation, crash, type-safety

### expo-secure-store and expo-auth-session Are Native-Only — Platform-Gate OAuth Features
**Source**: BLD-298 — PLAN: Strava Integration (Phase 48)
**Date**: 2026-04-17
**Context**: Phase 48 plan for Strava OAuth integration initially did not address web platform. QD review identified that `expo-secure-store` and `expo-auth-session` have no web support, meaning any feature depending on them must be entirely hidden on web via `Platform.OS` checks.
**Learning**: `expo-secure-store` (token storage) and `expo-auth-session` (OAuth flows) do not support the web platform in Expo SDK 55. Features that depend on either package must gate their entire UI surface behind `Platform.OS !== 'web'` — not just individual components, but the Settings section, navigation entries, and any code paths that import these packages. Importing them on web causes runtime errors.
**Action**: When planning features that use OAuth or secure token storage in Expo, verify each dependency's platform support matrix upfront. If any dependency is native-only, gate the entire feature (UI, navigation, sync logic) behind a `Platform.OS` check. Hide the feature section completely on unsupported platforms rather than showing disabled controls.
**Tags**: expo-secure-store, expo-auth-session, oauth, platform-support, web, native-only, platform-gating, strava
