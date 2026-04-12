# Build Configuration Pitfalls

## Learnings

### Metro Bundler Requires Explicit WASM Extension for expo-sqlite Web
**Source**: BLD-14 — Pipeline halt: FitForge build broken
**Date**: 2026-04-12
**Context**: After fixing TypeScript and peer dependency errors, `expo export --platform web` still failed. expo-sqlite's web implementation depends on `wa-sqlite.wasm`, but Metro's default `assetExts` list does not include `.wasm`.
**Learning**: Metro bundler only resolves file extensions in its `assetExts` list. WASM files are not included by default. When a dependency requires `.wasm` assets (like expo-sqlite for web), Metro fails with "Unable to resolve module ./wa-sqlite/wa-sqlite.wasm". The fix is a `metro.config.js` that extends the default Expo Metro config and adds `wasm` to `resolver.assetExts`.
**Action**: When adding a dependency that uses WASM (especially for web platform), create or update `metro.config.js` to include `wasm` in `resolver.assetExts`. Test `expo export --platform web` after adding any new native/WASM dependency.
**Tags**: metro, wasm, expo-sqlite, web-platform, build-config, asset-extensions
