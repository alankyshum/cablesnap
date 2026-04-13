# Build Configuration Pitfalls

## Learnings

### Metro Bundler Requires Explicit WASM Extension for expo-sqlite Web
**Source**: BLD-14 — Pipeline halt: FitForge build broken
**Date**: 2026-04-12
**Context**: After fixing TypeScript and peer dependency errors, `expo export --platform web` still failed. expo-sqlite's web implementation depends on `wa-sqlite.wasm`, but Metro's default `assetExts` list does not include `.wasm`.
**Learning**: Metro bundler only resolves file extensions in its `assetExts` list. WASM files are not included by default. When a dependency requires `.wasm` assets (like expo-sqlite for web), Metro fails with "Unable to resolve module ./wa-sqlite/wa-sqlite.wasm". The fix is a `metro.config.js` that extends the default Expo Metro config and adds `wasm` to `resolver.assetExts`.
**Action**: When adding a dependency that uses WASM (especially for web platform), create or update `metro.config.js` to include `wasm` in `resolver.assetExts`. Test `expo export --platform web` after adding any new native/WASM dependency.
**Tags**: metro, wasm, expo-sqlite, web-platform, build-config, asset-extensions

### Expo Router: New Screen Files Require Explicit Stack.Screen Registration
**Source**: BLD-8 — 1RM Estimation & Progressive Overload (Phase 18)
**Date**: 2026-04-13
**Context**: A new `app/tools/rm.tsx` screen was created but not registered in `app/_layout.tsx`. The screen rendered but had no header, no back button, and no themed styling. The tech lead review caught this as a MAJOR issue — the existing `tools/plates` screen had a proper Stack.Screen entry, but the new screen didn't get one.
**Learning**: Expo Router file-based routing creates routes automatically from file paths, but the root `Stack` in `app/_layout.tsx` uses `headerShown: false` globally. Any screen that needs a header, back button, or themed header styling MUST have an explicit `Stack.Screen` entry with `headerShown: true`, `title`, `headerStyle`, and `headerTintColor`. Without it, the route works but the UX is broken.
**Action**: When creating a new screen file under `app/`, always add a corresponding `Stack.Screen` entry in `app/_layout.tsx`. Copy the pattern from an existing screen (e.g., `tools/plates`). Verify the header renders correctly before submitting a PR.
**Tags**: expo-router, stack-screen, routing, header, navigation, layout, build-config
