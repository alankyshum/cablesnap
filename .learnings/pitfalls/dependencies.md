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
