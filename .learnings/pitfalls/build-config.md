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
