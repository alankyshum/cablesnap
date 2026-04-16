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

### Use Middleware for COOP/COEP Headers — Static Server Config Is Unreliable
**Source**: BLD-28 — FIX: expo-sqlite web crash on localhost:8081
**Date**: 2026-04-13
**Context**: BLD-1 added COOP/COEP headers via Metro's `config.server.headers` to enable SharedArrayBuffer for expo-sqlite web. The fix appeared to work but expo-sqlite still crashed with `sqlite3_open_v2` / "cannot create file" errors because worker.js and .wasm files did not receive the headers.
**Learning**: Metro's `config.server.headers` applies only to certain responses (primarily HTML). Web Workers and WASM assets served by Metro do not inherit these headers. Without COOP/COEP on ALL responses (including worker scripts), SharedArrayBuffer remains unavailable inside workers, and OPFS-backed storage fails silently. The fix is `config.server.enhanceMiddleware` — a middleware function that intercepts every response and sets headers universally.
**Action**: When configuring cross-origin isolation headers for web (COOP/COEP), always use `enhanceMiddleware` in metro.config.js, not `server.headers`. Verify headers reach worker.js and .wasm files by inspecting the Network tab in DevTools. This applies to any library using WASM + Web Workers (sqlite, compression, cryptography).
**Tags**: metro, coop, coep, shared-array-buffer, web-workers, wasm, expo-sqlite, web-platform, middleware

### Expo Router Directory Routes Register as `directory/index`, Not `directory`
**Source**: BLD-95, BLD-96 — Route name mismatch crashes app layout
**Date**: 2026-04-15
**Context**: The app declared `<Stack.Screen name="schedule" />` in `_layout.tsx`, but the route file lived at `app/schedule/index.tsx`. This caused `[Layout children]: No route named "schedule" exists` — crashing ALL navigation, including the onboarding "Get Started" button.
**Learning**: When a route uses the directory pattern (`app/schedule/index.tsx` instead of `app/schedule.tsx`), Expo Router registers the route as `schedule/index`, not `schedule`. A `Stack.Screen` with `name="schedule"` will not match, causing a layout crash that breaks all navigation — not just that route.
**Action**: When using directory-based routes (`app/X/index.tsx`), always set `name="X/index"` in the corresponding `Stack.Screen`. Add a route-name validation test (see testing patterns) to catch mismatches at build time.
**Tags**: expo-router, stack-screen, directory-routes, routing, layout-crash, navigation, file-based-routing

### upload-pages-artifact path Becomes Site Root — Not a URL Prefix
**Source**: BLD-100, BLD-108 — GitHub Pages deployment failing / Fix F-Droid repo_url
**Date**: 2026-04-15
**Context**: The F-Droid release workflow used `actions/upload-pages-artifact` with `path: fdroid`. Config files referenced the repo at `<base>/fdroid/repo/`, but Pages returned 404 because the deployed URL was `<base>/repo/`.
**Learning**: When `actions/upload-pages-artifact@v3` specifies a `path` (e.g., `fdroid`), that directory's *contents* become the site root — the directory name itself is NOT part of the deployed URL. So `fdroid/repo/index.html` on disk deploys to `<base-url>/repo/index.html`, not `<base-url>/fdroid/repo/index.html`.
**Action**: When configuring GitHub Pages via Actions, match all URL references (config files, READMEs, API endpoints) to the *deployed* path structure, not the filesystem path. Test by checking the actual Pages URL after first deployment before hardcoding references.
**Tags**: github-actions, github-pages, upload-pages-artifact, deployment, url-path, f-droid, ci-cd

### accessibilityRole="button" on Non-Interactive Elements Misleads Screen Readers
**Source**: BLD-137 — Achievement & Milestone System
**Date**: 2026-04-15
**Context**: Achievement badge cards in the grid screen used `accessibilityRole="button"` for styling consistency, but the cards had no `onPress` handler. Screen readers announced each badge as a tappable button, but nothing happened on activation.
**Learning**: `accessibilityRole="button"` tells assistive technology that the element is interactive. Assigning it to non-interactive elements creates a confusing experience — users hear "button" but tapping does nothing. Use `accessibilityRole="summary"` or `"text"` for display-only content, and only use `"button"` when the element has a corresponding `onPress`/`onLongPress` handler.
**Action**: Before assigning `accessibilityRole="button"` to any component, verify it has an `onPress` handler. For informational cards, badges, and display-only elements, use `accessibilityRole="summary"` or omit the role entirely. Add this check to code review checklists for accessibility compliance.
**Tags**: accessibility, accessibilityrole, screen-reader, a11y, button, react-native, cards, voiceover, talkback

### GitHub Actions Release Notes with Markdown Break GITHUB_OUTPUT Heredoc
**Source**: BLD-179 — Android crash on launch / F-Droid release pipeline fix
**Date**: 2026-04-16
**Context**: The scheduled release workflow generated release notes containing markdown (triple backticks for F-Droid repo URL) and passed them via `GITHUB_OUTPUT` heredoc. The `gh release create --notes` command received corrupted input because the markdown backticks prematurely terminated the heredoc delimiter.
**Learning**: `GITHUB_OUTPUT` heredoc syntax (`echo 'notes<<EOF' >> $GITHUB_OUTPUT`) fails when the content contains triple backticks or other shell-significant characters. The heredoc delimiter gets confused by markdown code fences. Additionally, `gh workflow run` (used to trigger the F-Droid build) requires `actions:write` permission — without it, the trigger fails silently.
**Action**: When generating release notes or any multi-line markdown content in GitHub Actions, write to a temporary file and use `--notes-file` instead of `--notes` with `GITHUB_OUTPUT`. Always include `actions: write` in the `permissions` block when a workflow triggers other workflows via `gh workflow run`.
**Tags**: github-actions, release-notes, heredoc, github-output, markdown, permissions, ci-cd, gh-cli

### Expo Go Cannot Load Custom Native Modules — Migrate to expo-dev-client First
**Source**: BLD-136 — expo-dev-client migration for Health integration
**Date**: 2026-04-15
**Context**: When planning Apple HealthKit integration, the team discovered that Expo Go does not support custom native modules. A prerequisite infrastructure migration to expo-dev-client was needed before any native API work could begin.
**Learning**: Expo Go only supports modules included in the Expo SDK. Any feature requiring platform-specific native APIs (HealthKit, Health Connect, NFC, Bluetooth, custom native code) requires migrating to expo-dev-client. This migration is a build infrastructure change (4 files: package.json, app.config.ts, eas.json, README) with no user-facing code changes, but it changes the entire dev workflow from `npx expo start` to `npx expo run:ios` / `npx expo start --dev-client`.
**Action**: When planning features that use platform-specific native APIs, check whether the project uses Expo Go. If so, schedule expo-dev-client migration as Phase 0 before any native module work. Also create separate eas.json profiles for simulator (`development` with `ios.simulator: true`) and physical device (`development-device`) builds.
**Tags**: expo, expo-go, expo-dev-client, native-modules, healthkit, eas-build, migration, build-infrastructure

### Android overflow: visible Does Not Propagate Touches Beyond Parent Bounds
**Source**: BLD-205 — PLAN REVIEW: Floating navbar redesign (BLD-198)
**Date**: 2026-04-16
**Context**: The floating tab bar plan included a center button protruding 12dp above the bar using negative top positioning. On Android, the protruding portion would be visually visible but untappable because Android does not propagate touch events beyond the parent View's bounds, even with `overflow: 'visible'`.
**Learning**: On Android, `overflow: 'visible'` only affects rendering — it does NOT extend the parent's touch-receiving area. Child elements that visually overflow the parent cannot receive touch events in the overflowed region. This is an Android-specific limitation; iOS propagates touches to visually overflowing children. The fix is to wrap the protruding element in a parent View whose bounds fully encompass the visible area, or use `hitSlop` on the touchable element.
**Action**: When designing UI with elements that protrude beyond their container (raised buttons, badges, floating action buttons with anchored parents), ensure the touchable wrapper's bounds cover the full visible area on Android. Do not rely on `overflow: 'visible'` for touch propagation. Test on Android specifically — iOS will work without the fix, masking the bug.
**Tags**: android, overflow-visible, touch-target, react-native, platform-specific, hit-testing, floating-button

### Android Elevation Clips to Parent View Bounds
**Source**: BLD-205 — PLAN REVIEW: Floating navbar redesign (BLD-198)
**Date**: 2026-04-16
**Context**: The floating tab bar plan applied elevation/shadow to the bar container, but the raised center button protrudes above the bar. On Android, `elevation` renders a shadow clipped to the parent View's boundaries — the protruding center button would have no shadow from the parent's elevation.
**Learning**: Android's `elevation` property renders shadow based on the View's own bounds, and this shadow is clipped by the parent's bounds. If a child element protrudes beyond its parent (via negative margins or absolute positioning), the parent's elevation shadow will not extend to cover the protruding area. Each independently elevated element must have its own `elevation` property applied directly.
**Action**: When a UI element protrudes beyond its container and both need shadows, apply `elevation` independently to the container and the protruding element — do not rely on the parent's elevation to cast shadow over overflowing children. On iOS, use separate `shadow*` properties (shadowColor, shadowOffset, shadowOpacity, shadowRadius) for the same effect, as iOS does not use `elevation`.
**Tags**: android, elevation, shadow, overflow, react-native, platform-specific, clipping, z-index

### Alert.prompt Is iOS-Only — Use Cross-Platform Modal for Text Input Dialogs
**Source**: BLD-234 — PLAN: Session Rating & Save-as-Template (Phase 37)
**Date**: 2026-04-16
**Context**: The initial plan for a "save as template" flow used `Alert.prompt()` to collect a template name from the user. Quality Director review identified this as a blocking issue because `Alert.prompt()` is an iOS-only API — it does not exist on Android or web.
**Learning**: React Native's `Alert.prompt()` only works on iOS. On Android and web it is undefined and will crash or silently fail. Any flow requiring text input from a dialog must use a cross-platform alternative: a `Modal` with a `TextInput`, or `@gorhom/bottom-sheet` if already in the project.
**Action**: Never use `Alert.prompt()` in cross-platform code. For text input dialogs, use a `Modal` component with an embedded `TextInput`, or `@gorhom/bottom-sheet`. Check that any React Native API used in plans is available on all target platforms (iOS, Android, web) before specifying it.
**Tags**: react-native, alert, ios-only, cross-platform, modal, text-input, android, web, pitfall
