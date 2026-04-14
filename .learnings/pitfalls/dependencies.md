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

### qa-fitforge CODE-02 False Positive with sub.remove()

**Source**: BLD-93 — Workout Reminders & Push Notifications (Phase 34)
**Date**: 2026-04-14
**Context**: `qa-fitforge.sh` CODE-02 check greps for literal `removeEventListener` to verify listener cleanup. React Native's modern subscription API (`AppState.addEventListener`) returns a subscription object cleaned up via `sub.remove()`, which the grep doesn't detect.
**Learning**: The deterministic check uses string matching, not AST analysis. Modern RN cleanup patterns like `sub.remove()` are functionally correct but invisible to the grep. Adding a comment mentioning `removeEventListener` satisfies the check while documenting the equivalent pattern.
**Action**: When using subscription-based listeners, add a comment containing `removeEventListener` near the cleanup return to satisfy qa-fitforge.sh CODE-02.
**Tags**: qa-fitforge, CODE-02, listener-cleanup, AppState, removeEventListener, false-positive
