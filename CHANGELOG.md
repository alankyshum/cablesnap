# Changelog

All notable user-facing changes to CableSnap are listed here, newest first.
This file is the single source of truth for:

- The in-app **What's New** modal (read from `lib/changelog.generated.ts`).
- GitHub Releases (`gh release create --notes-file` extracted from this file).
- F-Droid per-version changelogs (`fdroid/metadata/com.persoack.cablesnap/en-US/changelogs/<versionCode>.txt`).

Format:

```
## v<semver> — YYYY-MM-DD
<!-- versionCode: N -->
- Bullet describing a user-facing change.
- Another bullet.
```

The `<!-- versionCode: N -->` marker is optional but required for F-Droid
sidecar emission. The `publish-release` skill prepends a new section (with
marker) at release time.

## Unreleased

_No user-facing changes yet._

## v0.26.114 — 2026-08-27
<!-- versionCode: 182 -->

- Improved AI Coach replies with a typing indicator and correctly aligned table columns.
- AI Coach can now create workout templates when asked.

## v0.26.113 — 2026-08-23
<!-- versionCode: 181 -->

- The AI Coach model picker now scrolls properly on tablets and phones.
- AI Coach now shows an animated indicator while it is thinking or running a tool.

## v0.26.112 — 2026-08-23
<!-- versionCode: 180 -->

- Update checks now run every 6 hours instead of once per day, so new releases are surfaced sooner.
- AI Coach replies work again with models that reject tool requests.
- Fixed mirrored message text and out-of-order conversation dates.
- Fixed Coach layout issues, including navbar overlap, sidebar height and alignment, collapse button placement, and layer shadows.
- Added consistent padding to warning cards, sidebar buttons, and the empty state.

## v0.26.111 — 2026-08-23
<!-- versionCode: 179 -->

- Improved AI Coach dark-mode text and table readability with theme-aware colors.
- Kept AI Coach tables inside the message bubble while allowing horizontal scrolling for wide tables.
- Removed the large empty gap at the top of the AI Coach screen.

## v0.26.110 — 2026-08-23
<!-- versionCode: 178 -->

- AI Coach markdown now renders tables, horizontally scrollable code blocks, and clearer headings.
- Fixed tablet AI Coach layout issues, including header overlap and quick-prompt chip overflow.
- AI Coach now records and displays the model that produced each response, and preserves model selections across reloads and new chats.
- The model picker now scrolls reliably to offscreen models and dismisses after selection.
- Backups can include AI Coach chat history and the selected model, with an optional API key protected by explicit opt-in; automatic backups never include credentials.

## v0.26.109 — 2026-08-22
<!-- versionCode: 177 -->

- Improved AI Coach reliability when an upstream provider is unavailable or a selected model cannot support Coach tools.
- Improved translation robustness by validating ICU messages before release builds.

## v0.26.108 — 2026-08-22
<!-- versionCode: 176 -->

- Rebuilt the AI Coach chat experience with live-streaming responses and formatted markdown.
- The model picker now scrolls properly, and your selected model is used for requests and remembered for later.
- Added clearer messages when an AI provider is unavailable.
- Improved accessibility and dark-mode contrast across the AI Coach experience.
- Expanded translation coverage for AI Coach and related app labels.

## v0.26.107 — 2026-08-21
<!-- versionCode: 175 -->

- Localized the AI Coach navigation label in the app's supported languages.
- Fixed hydration preset labels when displaying fluid ounces.

## v0.26.106 — 2026-08-21
<!-- versionCode: 174 -->
- Keep cable setup labels in sync when switching app language.

_No user-facing changes yet._

## v0.26.105 — 2026-08-21
<!-- versionCode: 173 -->

- Fixed text that showed raw placeholders instead of real values. Most visibly, the Settings About row now displays the actual version number instead of “CableSnap v{version}”; this also fixes interpolated text throughout the app in release builds.
- Fixed labels that showed internal identifiers instead of translated text, including the AI Coach tab.
- Improved the update prompt so release notes render as formatted text with proper headings and bullets, hidden internal markers, and scrolling for longer notes.

## v0.26.104 — 2026-08-20
<!-- versionCode: 172 -->

- Fixed Wear OS release builds shipping with a debug signing certificate; release APKs now use the production signing key.

## v0.26.103 — 2026-08-20
<!-- versionCode: 171 -->

- Added: link to GitHub Releases from the About screen, and documented the F-Droid repo install path.
- Fixed: GitHub release APKs retain the GitHub distribution channel, while F-Droid APKs retain the F-Droid channel, so update prompts work correctly for GitHub users.
- Added recovery links in Settings and documentation for users on v0.26.100 or v0.26.101 whose in-app update check cannot run.

## v0.26.102 — 2026-08-19
<!-- versionCode: 170 -->

- GitHub release APKs now retain the GitHub distribution channel, while F-Droid APKs retain the F-Droid channel, so update prompts work correctly for GitHub users.

## v0.26.101 — 2026-08-19
<!-- versionCode: 169 -->

- The new AI Coach tab lets you chat with an AI fitness coach that can consult your workout, exercise, and nutrition history on-device. Bring your own OpenRouter API key, choose your model, and keep your key on this device while requests go directly to OpenRouter.
- Exercises are now available from the top-right icons on the Workouts screen; AI Coach now occupies their place in the tab bar.
- In-app language selection is now available in Settings for English (US), English (UK), Traditional Chinese (Taiwan), and Simplified Chinese, defaulting to en-US. The Chinese catalogs are machine-translated beta content and have not yet received native-speaker review.

## v0.26.100 — 2026-08-18
<!-- versionCode: 168 -->

 - Sponsorship links in Settings now have visible borders for improved contrast in light and dark themes.
 - Fixed exercise selection scrolling on compact screens.

## v0.26.99 — 2026-08-18
<!-- versionCode: 167 -->

- Migrated self-hosted F-Droid Play-flavor releases to the persistent production signing certificate; users on the boundary release must reinstall CableSnap once.


## v0.26.98 — 2026-08-18
<!-- versionCode: 166 -->

- Charts now work in the F-Droid build.
- Progress, workout, nutrition, body, and muscle-volume charts now render consistently across supported platforms.

## v0.26.97 — 2026-08-03
<!-- versionCode: 165 -->

- Importing a backup now shows clear progress, so large backups no longer appear to freeze.
- Your settings, workouts, and custom content now restore correctly when an imported backup overlaps with built-in content.
- Re-importing a backup now clearly tells you when its contents are already imported.
- Buttons, tabs, bottom sheets, and toasts now have smoother, more refined motion and a more physical feel.
- Filter chips are now easier to tap.
- Backup imports now remain responsive while restoring larger files.

## v0.26.96 — 2026-07-31
<!-- versionCode: 164 -->

- **Set rows on the workout summary screen now have increased vertical spacing**, improving readability of exercise sets at a glance. ([BLD-4546](/BLD/issues/BLD-4546))

## v0.26.95 — 2026-07-31
<!-- versionCode: 163 -->

- Bottom sheets now expand their scrollable content at higher snap points and coordinate dragging with inner scrolling, keeping actions reachable.

## v0.26.94 — 2026-07-30
<!-- versionCode: 162 -->

- F-Droid builds no longer include the Sentry crash-reporting dependency; crash reporting remains enabled in Play builds.

## v0.26.93 — 2026-07-30
<!-- versionCode: 161 -->

- F-Droid builds now show an explicit “Charts unavailable in this build” message
  instead of blank chart areas while keeping full chart rendering in Play and
  development builds.

## v0.26.92 — 2026-07-28
<!-- versionCode: 160 -->

- **Ellipsis (overflow) menu button on form library cards is now inset 6 dp from the top-right corner**, matching the check-overlay affordance for consistent touch target placement. ([BLD-4548](/BLD/issues/BLD-4548))
- Left-align the "Set a goal" button in Weekly Training Goal settings so it
  matches the padding of surrounding rows. ([BLD-4537](/BLD/issues/BLD-4537))

## v0.26.91 — 2026-07-28
<!-- versionCode: 159 -->

- F-Droid now uses the standard Android `release` variant, avoiding creation of
  an app-only build type that cannot be consumed by React Native libraries.

## v0.26.90 — 2026-07-28
<!-- versionCode: 158 -->

- **F-Droid Camera source stubs now retain the image-plane conversion helper and typed empty barcode results**, keeping preview/capture compilation intact after ML Kit removal.
- **F-Droid Camera scanner rewriting now preserves the complete Kotlin module**, removing only the proprietary scanner block so camera capture functions continue to compile.
- **F-Droid cleanup now leaves Gradle-generated Expo build directories untouched**, preventing repeated prebuild cleanup from breaking Camera compilation inputs.
- **F-Droid prebuild now removes Expo publisher artifacts only once per config evaluation**, avoiding repeated cleanup races with Gradle-generated Camera BuildConfig inputs.
- **F-Droid Wear OS build step now exports CABLESNAP_FDROID=1**, ensuring Gradle configurations and dependencies remain fully consistent across all compilation steps and preventing incremental build failures. ([BLD-4482](/BLD/issues/BLD-4482))
- **F-Droid’s post-prebuild sanitization now preserves generated Expo module inputs**, avoiding Gradle fingerprint failures while keeping the source-level proprietary-class removal intact.
- **F-Droid proprietary-dependency excludes are now scoped to `:app` only**, unblocking the Scheduled Release build after a global-scope regression broke `:expo-camera` in both F-Droid and Play variants.
- **F-Droid source sanitization no longer deletes freshly generated Expo BuildConfig outputs**, allowing the sanitized Camera module to compile cleanly during prebuild.
- **F-Droid Camera autolinking now compiles sanitized source instead of the publisher AAR**, eliminating the remaining ML Kit and Google Play Services barcode classes.
- **F-Droid CI now sanitizes Expo modules before prebuild autolinking**, preventing clean native generation from selecting proprietary publisher AARs.
- **F-Droid sanitization now runs before Expo autolinking**, so the generated Android graph cannot retain a dependency on a deleted proprietary Expo AAR.
- **F-Droid prebuild now removes Expo publisher AAR repositories**, ensuring sanitized source is compiled instead of prebuilt Camera bytecode containing proprietary classes.
- **F-Droid dependency metadata is now scrubbed before Gradle resolution**, preventing Expo local Maven POM/module files from restoring proprietary Camera artifacts.
- **F-Droid prebuild now removes stale Expo Android build artifacts**, preventing publisher AARs from restoring proprietary Camera classes after source sanitization.
- **F-Droid prebuild now copies its R8 rules into the generated app**, preserving the missing-optional-class handling on every clean native regeneration.
- **F-Droid barcode scanning now neutralizes every expo-camera ML Kit/GMS call path**, including newly added scanner entry points, while the open-source ZXing scanner remains enabled.
- **F-Droid Expo modules now compile sanitized source instead of publisher AARs**, preventing prebuilt Camera and notification bytecode from restoring ML Kit, Firebase, or Play Services classes.
- **F-Droid autolinking now omits unused expo-application**, preventing Install Referrer classes from entering the native module graph.
- **F-Droid sanitization now covers every installed Expo Android module**, including debug-only ML Kit declarations that could otherwise re-enter the release dependency graph.
- **F-Droid builds now remove proprietary Expo manifest references**, keeping the APK free of Firebase, ML Kit, Google Play Services, and Install Referrer class descriptors while retaining ZXing barcode scanning.
- **Form library Select button spacing now matches the Record pill**, giving the session header controls consistent horizontal padding.
- **Record and Done button spacing** — Increases the margin above the Record and Done buttons on the Form clips tab for more consistent spacing. ([BLD-4033](/BLD/issues/BLD-4033))
- **Consistent padding for "Set a goal" button** — Adjusts the vertical padding around the "Set a goal" button in frequency settings for consistency with other cards. ([BLD-4044](/BLD/issues/BLD-4044))
- **Word-order-independent exercise search** — Allows finding exercises by typing words in any order (e.g. "press bench" matches "Bench Press"). ([BLD-4157](/BLD/issues/BLD-4157))
- **Food barcode scanning now uses a fully open-source ZXing scanner**, with the same camera overlay and supported food-barcode formats.
- **F-Droid store metadata is now maintained in this repository**, including the app description, screenshots, icon, and release notes.
- **Progress calendar toggle is easier to tap**, increasing the list/calendar switch touch target to meet the 44dp accessibility minimum. ([BLD-4077](/BLD/issues/BLD-4077))
- **F-Droid builds now exclude Firebase, ML Kit, Google Play Services, and Install Referrer dependencies**, keeping proprietary classes out of the APK.
- **F-Droid runtime resolution now removes direct proprietary Expo dependencies**, preventing those classes from entering the APK.
- **F-Droid builds keep proprietary Expo dependencies compile-only**, preserving native compilation while excluding their classes from runtime packaging.
- **F-Droid dependency stripping now applies before Android library dependencies resolve**, covering direct Expo module declarations as well as transitive dependencies.
- **F-Droid library dependency filtering now runs after each Expo library evaluates**, ensuring direct proprietary declarations are removed before APK packaging.
- **F-Droid prebuild rewrites direct proprietary Expo library dependencies to compile-only**, preventing them from being packaged while retaining native compilation.
- **F-Droid Gradle setup rewrites direct proprietary dependencies before subprojects evaluate**, preventing runtime packaging across Expo modules.
- **F-Droid prebuild disables Expo Camera barcode dependencies**, keeping camera preview available without ML Kit or Google Play Services classes.
- **F-Droid library resolution moves proprietary direct dependencies to compile-only**, removing them from release runtime packaging.
- **F-Droid prebuild rewrites Firebase and Install Referrer declarations before Gradle evaluation**, while disabling Camera barcode dependency resolution.
- **F-Droid dependency filtering now runs from Gradle settings before project evaluation**, so Expo subproject declarations cannot reintroduce proprietary runtime artifacts.
- **F-Droid Expo Camera barcode artifacts are compile-only**, removing direct Play Services, ML Kit, and Camera ML Kit runtime dependencies.
- **F-Droid prebuild patches Expo dependency declarations at source**, ensuring direct proprietary artifacts cannot re-enter the generated Android graph.
- **F-Droid settings filtering also rewrites Expo Camera’s barcode declarations**, covering direct Play Services, ML Kit, and Camera ML Kit dependencies before subproject evaluation.
- **F-Droid release CI explicitly reapplies dependency stripping after prebuild**, preventing native project generation order from restoring proprietary Expo artifacts.
- **F-Droid barcode scanning now strips the unused proprietary Expo Camera scanner dependencies**, while the open-source ZXing scanner remains available.
- **F-Droid Gradle resolution now rejects proprietary dependency groups outright**, preventing transitive Firebase, ML Kit, Play Services, or Install Referrer classes from entering the APK.
- **F-Droid dependency patching removes proprietary declarations instead of retaining compile-only artifacts**, ensuring Firebase and Install Referrer classes cannot be packaged.
- **F-Droid prebuild now removes Expo Camera barcode artifacts declared through Gradle’s `add()` helper**, closing the remaining ML Kit and Play Services packaging path.

- **F-Droid builds now remove proprietary Firebase and Install Referrer declarations before variant resolution**, preventing those classes from leaking into the release APK.

- **F-Droid dependency filtering now removes proprietary declarations from every Gradle configuration**, including compile-only and debug-only paths inherited during variant fallback.

- **F-Droid prebuild now sanitizes all generated and installed Expo Gradle scripts**, preventing dormant scanner or launcher dependencies from re-entering the APK.

- **F-Droid prebuild now removes all Expo Camera barcode configurations**, including the CameraX ML Kit vision artifact, while retaining the embedded ZXing scanner.

- **F-Droid Gradle sanitization now handles parenthesized dependency declarations**, covering Expo modules that declare proprietary artifacts with `implementation("...")` syntax.

- **Release CI builds the F-Droid variant before the Play variant**, preventing Play-only Expo intermediates from being reused in the F-Droid APK.

- **F-Droid dependency cleanup runs after native project generation**, ensuring all generated Expo scripts are sanitized before Gradle resolves the APK dependency graph.

- **F-Droid CI disables Expo Camera’s optional barcode dependency graph**, while CableSnap continues using the embedded open-source ZXing scanner on Android.

- **F-Droid prebuild now clears generated Android build intermediates before dependency resolution**, preventing stale proprietary AAR models from being reused after the Gradle scripts are sanitized.

- **F-Droid release CI now clears generated APK intermediates and reapplies app-level dependency exclusions after prebuild**, preventing stale or fallback Expo artifacts from entering the F-Droid dex merge.

- **F-Droid and Play Android builds now run in separate Gradle invocations**, preventing their variant graphs from sharing proprietary release artifacts.

- **The isolated F-Droid build now refreshes dependency resolution and checks DEX purity before Play is built**, making any dependency-graph regression fail at its source.

- **F-Droid Gradle cleanup now removes proprietary dependencies after every Expo project has evaluated**, covering fallback release configurations that are declared too late for settings-time filtering.

- **F-Droid CI now clears Gradle’s transformed-AAR cache before the isolated build**, preventing stale proprietary artifacts from surviving project cleanup and entering the DEX merge.

- **The F-Droid release variant now enables R8 shrinking**, removing unreachable compile-only proprietary classes while retaining the open-source ZXing scanner.

- **F-Droid R8 configuration now treats absent optional Expo integration types as intentional**, allowing unreachable Firebase, ML Kit, Play Services, and Install Referrer code to be removed cleanly.

- **F-Droid R8 now ignores missing optional integration warnings after stripping those dependencies**, allowing the release shrinker to finish and remove the unreachable code paths.

- **F-Droid R8 now ignores missing optional integration warnings after stripping those dependencies**, allowing the release shrinker to finish and remove the unreachable code paths.

- **F-Droid build setup now removes stale project and transformed-AAR intermediates before dependency resolution**, keeping the isolated build reproducible after failed attempts.

- **F-Droid prebuild now replaces Expo Camera, Application, and Notifications proprietary source paths with FOSS-safe stubs**, preventing proprietary class descriptors from being emitted into DEX.

- **F-Droid source sanitization now removes Firebase-backed notification serializers and trigger models as well**, keeping the complete Expo Notifications source graph free of proprietary references.

- **F-Droid CI now invokes source sanitization explicitly after prebuild**, ensuring the generated native project uses the same clean source graph as the config plugin.
- **Improved Progress empty-state text contrast** — Increases the contrast of the description text on the Progress tab empty-state screen to meet WCAG AA guidelines. ([BLD-3657](/BLD/issues/BLD-3657))


## v0.26.89 — 2026-07-26
<!-- versionCode: 157 -->

- **Aligned heatmap spacing** — Aligns the workout-frequency heatmap cells and spacing on the history screen for a cleaner layout. ([BLD-3642](/BLD/issues/BLD-3642))
- **Nutrition card link padding** — Adds consistent edge padding to the Edit Targets and Meal Templates link rows in the nutrition card for better touch targets and visual alignment. ([BLD-4043](/BLD/issues/BLD-4043))
- **Aligned water quick-add buttons** — Water quick-add chips now stay vertically centered on each row, fixing a slight misalignment visible on mobile. ([BLD-4042](/BLD/issues/BLD-4042))

## v0.26.88 — 2026-07-26
<!-- versionCode: 156 -->

- **F-Droid builds no longer embed the Sentry DSN**, allowing the Tracking AntiFeature to be removed from the official listing.

## v0.26.87 — 2026-07-26
<!-- versionCode: 155 -->

- **F-Droid builds now fully disable crash reporting and telemetry** — F-Droid builds ship without a Sentry DSN, and the native Sentry SDK is not initialized. The published license is corrected to AGPL-3.0-or-later.
 
## v0.26.86 — 2026-07-25
<!-- versionCode: 154 -->

- **Estimated pacing bar boundaries now visible under protanopia** — the Working and Rest segments in the post-workout Estimated pacing bar are now separated by a crisp 2 px divider and a strengthened dash texture on the Working segment, making the boundary clearly visible under red-green colour vision deficiency (protanopia) as well as in grayscale. The fix is purely structural — segment colours and labels are unchanged. ([BLD-3880](/BLD/issues/BLD-3880))
- **Heatmap legend accessibility under deuteranopia** — Adjusts the workout-frequency heatmap legend colors to ensure steps are distinct and distinguishable under deuteranopia. ([BLD-3874](/BLD/issues/BLD-3874))
- **Release notes now hide internal project references**, keeping issue tracker IDs and links out of the What's New modal.
- **What's New now supports inline code and tappable web or email links** in release notes.

## v0.26.85 — 2026-07-25
<!-- versionCode: 153 -->

- **Estimated pacing bar now distinguishable under tritanopia** — the Working and Rest segments on the post-workout Estimated pacing card previously used two colours (coral and blue) that collapsed to near-identical luminance under blue-yellow colour vision deficiency, making the segments hard to tell apart. The Rest segment now uses a dedicated CVD-hardened colour (deep petrol blue in light theme, pale cyan in dark theme) that stays visually distinct from the Working coral under tritanopia while remaining distinguishable under deuteranopia, protanopia, and grayscale. Segment labels, overlays, and the RecoveryHeatmap surface are unchanged. ([BLD-3872](/BLD/issues/BLD-3872))
- **Distinct CVD pattern for Rest pacing segment** — Adds a vertical-dash hatch pattern to the "Rest" pacing segment on the completed-workout summary pacing bar and matching legend dot, improving readability for users with color vision deficiencies. ([BLD-3879](/BLD/issues/BLD-3879))
- **Inline Plate Calculator** — A plate calculator is now accessible directly from the active set row while logging. Tap the weight hint to open a bottom-sheet calculator without leaving the workout. ([BLD-3820](/BLD/issues/BLD-3820))
- **Tritanopia-safe heatmap luminance ramp** — Implements a tritanopia-safe luminance ramp for the workout-history heatmap, keeping all frequency cells perceptually distinct. ([BLD-3877](/BLD/issues/BLD-3877))

## v0.26.84 — 2026-07-25
<!-- versionCode: 152 -->

- **Harden visual UX audit web server against connection timeouts** — Pins the local \`serve\` dependency to \`14.2.6\` in package.json and updates playwright.config.ts to launch the local package via \`npx serve\` and bumps the startup timeout limit to 180 seconds, mitigating connection and cold-start failures on CI runners. ([BLD-3801](/BLD/issues/BLD-3801))

## v0.26.83 — 2026-07-24
<!-- versionCode: 151 -->

- **Aligned the 'Summary' header** on the session summary screen so the title lines up with the content below. ([BLD-3639](/BLD/issues/BLD-3639))
- **Consistent exercise spacing in workout summary Sets card** — The vertical gap between exercises listed under 'Sets' on the completed-workout summary is now uniform, with no extra trailing space after the last exercise. ([BLD-3660](/BLD/issues/BLD-3660))
- **Improved heatmap readability** — The workout-frequency numbers inside the 16-week heatmap cells on the History screen are now larger and easier to read, including the '3+' indicator, without overflowing the cell bounds. ([BLD-3656](/BLD/issues/BLD-3656))

## v0.26.82 — 2026-07-24
<!-- versionCode: 150 -->

- **Muscle-Group Volume Balance insight** — The home screen now shows a proactive notification when any tracked muscle group is below this week's target (below MEV) or above this week's cap (above MRV) for the current week, with a tap that opens the Muscle Volume analysis tab pre-filtered to the flagged muscle. ([BLD-3619](/BLD/issues/BLD-3619))

## v0.26.81 — 2026-07-23
<!-- versionCode: 149 -->

- **Added curated barbell strength programs** — Adds pre-built workout templates for popular strength programs including StrongLifts 5×5, GZCLP, and 5/3/1 Boring But Big (BBB), complete with smart defaults, built-in progression schemes, and easy program selection on the home tab. ([BLD-3562](/BLD/issues/BLD-3562))

## v0.26.80 — 2026-07-23
<!-- versionCode: 148 -->

- **Feedback buttons on Settings screen are now larger and easier to tap** — the 'Report Bug', 'Feature Request', and 'Errors' buttons on the Settings screen now have a minimum touch target height of 44dp to meet accessibility guidelines and prevent missed taps. (BLD-3500)

## v0.26.79 — 2026-07-22
<!-- versionCode: 147 -->

- **Consistent spacing for Workout History Import button** — Aligns the vertical spacing and gaps around the "Choose CSV File..." button inside the settings card to match standard design patterns and other buttons. (BLD-3499)
- **Added customizable weight-step increments (micro-loading)** — you can now configure the weight step (0.5 kg, 1.25 kg, 2.5 kg, 5 kg or 1 lb, 2.5 lb, 5 lb, 10 lb) in Units settings, which applies across all steppers in your workout sessions and quick-adds. ([BLD-3517](/BLD/issues/BLD-3517))
- **Estimated pacing bar legend chips are now more spaced out** — increased horizontal spacing between legend chips (Working / Rest / Other) and added breathing room between legend dots and text for improved clarity and readability. (BLD-3468)
- **Release notes now hide internal project references**, keeping issue tracker IDs and links out of the What's New modal.
- **What's New now supports inline code and tappable web or email links** in release notes.
- **Estimated pacing bar legend chips are now more spaced out** — increased horizontal spacing between legend chips (Working / Rest / Other) and added breathing room between legend dots and text for improved clarity and readability. (BLD-3468)

## v0.26.78 — 2026-07-22
<!-- versionCode: 146 -->

- **Next-workout suggestions now build reps up to 12 (or your configured range maximum) before increasing weight.**
- **Workout-history calendar dots now have a thicker outline and are slightly larger**, improving legibility for users with color vision deficiencies ([BLD-3498](/BLD/issues/BLD-3498)).

## v0.26.77 — 2026-07-20
<!-- versionCode: 145 -->

- **Unilateral add-set prefill parity** — completing or uncompleting a set now correctly mirrors the action to the paired side.

## v0.26.76 — 2026-07-17
<!-- versionCode: 144 -->

- **Unilateral / per-side (L/R) set logging & imbalance insight** — adds support for tracking left and right side sets separately for unilateral exercises, displays exact difference percentage in a descriptive readout, aggregates per-side volume correctly, and supports CSV/backup round-trip.

## v0.26.75 — 2026-07-16
<!-- versionCode: 143 -->

- **Next-workout weight suggestions now ignore warm-up sets** — the recommended weight is based only on your working sets, so a light warm-up no longer holds back (or skews) the suggestion to add weight when you hit the top of your rep range.

## v0.26.74 — 2026-07-14
<!-- versionCode: 142 -->

- **Form clip player now auto-detects portrait vs landscape aspect ratio.**
- **Form clips player fixes** — corrects clip size display (no longer showing 0.0MB), ensures switching clips remounts the player, and prevents tablet layout overflow while keeping native controls visible.

## v0.26.73 — 2026-07-13
<!-- versionCode: 141 -->
- **Pinned exercise notes now save automatically and stick to the exercise** — a note you pin (e.g. the cable length for a machine) is saved as you type and stays attached to that exercise everywhere: reopening the template, switching templates, or swapping that exercise into another template all show the same note.
- **Form clips now play back and show thumbnails** — tapping a form clip opens a working video player, and each clip shows a real thumbnail preview. Clips stay bound to their exercise.
- **A workout is no longer marked "Active" until you complete your first set** — opening a workout and backing out without logging a set no longer leaves a lingering active workout.
- **The active-workout banner now appears on the home screen instantly** — as soon as a workout becomes active it shows on Home, with no need to restart the app.
- **Settings → Form Clips now shows thumbnails and plays clips** — each saved clip has a thumbnail and can be tapped to play.
- **The home-screen active-workout banner now refreshes correctly when you return to Home** — after starting a workout in another tab, the banner updates on focus instead of waiting for an app restart.

## v0.26.72 — 2026-07-09
<!-- versionCode: 140 -->

- **Fixed the workout "Share" menu clipping its last option** — the share sheet now sizes to its contents and scrolls, so the "Sync to Strava" / "Sync to Strava again" action is always reachable on phones and tablets.

## v0.26.71 — 2026-07-09
<!-- versionCode: 139 -->
- **Replaced placeholder domain `cablesnap.app` with official GitHub repository URL** — updated the in-app promo captions, Strava description templates, share cards, and associated tests to point directly to the GitHub repository.
- **Release builds now refuse to run locally without the production keystore, preventing accidental debug-signed releases (production releases go through CI).**

## v0.26.70 — 2026-07-09
<!-- versionCode: 138 -->

- **Manual "Sync to Strava" for past workouts** — you can now trigger a manual sync or sync again for any past workout from the workout detail screen, allowing you to upload workouts that failed to sync initially.
- **Form-encoded Strava upload with recap and attribution** — workout uploads to Strava are now form-encoded and include a detailed recap with exercise attribution and activity:read_all id capture.
- **Fixed no-op Share button on workout detail** — the Share button on the workout detail screen now works correctly and opens the system share sheet.
- **Per-user Sentry telemetry and structured Strava sync-outcome logging** — Sentry telemetry is now tagged with unique per-user identifiers, and Strava sync outcomes are logged with structured events for more precise debugging.

## v0.26.67 — 2026-07-09
<!-- versionCode: 137 -->

- **Segmented control touch targets are now larger and easier to tap** — individual segment toggle buttons in the segmented control (such as weight kg/lb and measurement cm/in Settings units switches) now have an interactive height of at least 44px to meet accessibility guidelines and prevent missed taps. (BLD-3195)
- **Strava token refresh terminal failure handling** — when a Strava token refresh fails with a 400 Bad Request error (e.g. revoked, expired, or rotated refresh token), the connection is cleanly disconnected and the sync is marked as failed, ending any infinite retry loop. This terminal state is logged at warn level and no longer reported to Sentry as an exception. (BLD-3178)
- **"Start a workout" button no longer shows a double-border** — on the Progress empty-state screen, the primary "Start a workout" call-to-action now renders as a single clean filled button, matching the rest of the app's primary buttons instead of showing an extra outline ring around the fill. (BLD-3192)

## v0.26.66 — 2026-07-09
<!-- versionCode: 136 -->
- **Prevent transient database-locked errors** — SQLite connection initialization now sets a 5-second busy timeout before running database migrations or schema upgrades. This allows CableSnap to automatically wait out momentary lock contention and prevent transient "database is locked" errors. (BLD-3119)
- **Internal: Sentry filter drops HeadlessChrome/CI events** — the localhost and CI event filter now also drops events originating from a headless browser environment (such as HeadlessChrome in E2E/CI tests) or where the user-agent headers contain "Headless", preventing development and test traffic from polluting the production Sentry dashboard. (BLD-3124)
- **Progress tab no longer shows conflicting error and empty states** — when there is no workout data, the Progress tab now shows only the "Track your progress" empty state. The Weekly Summary is suppressed when empty, and its error card now features a clear error icon and a working retry button so you can reload without leaving the screen. (BLD-3066)

## v0.26.65 — 2026-07-07
<!-- versionCode: 135 -->

- **List items on other tab screens no longer hide behind bottom bar** — on the Workouts, Exercises, and Nutrition screens, list content is no longer partially obscured or clipped behind the floating bottom navigation bar. The scrollable area now ends cleanly above the bar so every row and element stays fully visible and tappable at all scroll offsets. (BLD-3068)
- **Settings rows no longer hide behind the bottom bar** — on the Settings screen, list rows (like "Manage gyms, cable stacks, and marker calibrations") are no longer partially obscured or clipped behind the floating bottom navigation bar at the top of the list. The scrollable area now ends cleanly above the bar so every row stays fully visible and tappable. (BLD-3065)
- Stop reporting the known-permanent Strava "app inactive" 403 to Sentry as an exception (BLD-3063)

## v0.26.64 — 2026-07-05
<!-- versionCode: 134 -->

- **No misleading retry prompts on Strava status changes** — when Strava's application integration becomes Inactive, CableSnap now correctly classifies the 403 Forbidden error as a permanent failure instead of misleading you with "will retry" toast alerts and settings prompts. This stops the wasted retry loop while preserving valid user connections. (BLD-2995)
- **Internal: Sentry dashboard no longer polluted by CI/audit events** — the localhost event filter now also checks `event.request.url` (populated by the web SDK), so HeadlessChrome daily-audit errors at `localhost:8081` are correctly discarded before reaching the real-user error dashboard. (BLD-2991)

## v0.26.63 — 2026-07-05
<!-- versionCode: 133 -->

- **Double-Progression suggestions for your workouts** — CableSnap now suggests progressive-overload progressions for weighted exercises, letting you increase reps within your target range before suggesting a weight increase. This includes support for rep-range parsing, warmup set filtering, and a dedicated explainer modal. (BLD-2984)

## v0.26.62 — 2026-07-05
<!-- versionCode: 132 -->

- **Workout templates no longer overlap** — on the Templates list, cards sometimes rendered stacked on top of each other (on both phones and tablets). They now lay out cleanly in a proper grid.

## v0.26.61 — 2026-07-04
<!-- versionCode: 131 -->

- **Screens no longer overlap the status bar** — the Training-Day Macros setup screen (and a few nutrition screens) used to render underneath the phone’s clock/battery bar with no header. Every screen now shows a proper title bar and sits below the status bar.
- **Settings now reflects your latest Coaching choices** — after turning Macro Coach or Training-Day Macros on or off and tapping back, the Coaching row now updates immediately instead of showing the old status.

## v0.26.60 — 2026-07-04
<!-- versionCode: 130 -->

- **Connecting Strava now works on Android** — tapping "Connect Strava" and approving access sometimes landed on a "Page could not be found" screen and left your account disconnected. The Strava sign-in now completes reliably and returns you to Settings showing your connected athlete.

## v0.26.59 — 2026-07-04
<!-- versionCode: 129 -->

- **Set one rest time for your whole workout** — the rest-duration picker (spanner icon) is now a single universal setting that applies to every set in the current session and highlights your chosen duration so you can see which one is active. Picking a duration overrides your template's default rest for that session (templates stay editable and still provide the starting default), and it now sticks for every completed set instead of snapping back after each one.

- **Exercise position illustrations show everywhere and never overflow** — the Start/End position images now appear on phones too (they were previously missing there), and the two cards flow side-by-side when there's room and stack when space is tight, so they no longer spill past the screen edge or get stuck in the wrong layout after rotating or resizing your device.

## v0.26.58 — 2026-07-04
<!-- versionCode: 128 -->

- **Weight and reps edits now save reliably** — while logging an active workout, changing a set's weight or reps and then dismissing the keyboard could occasionally snap the value back to its previous number, especially while a rest timer was counting down. Your edits are now captured and saved every time, and editing one field no longer risks reverting the other.

## v0.26.57 — 2026-07-04
<!-- versionCode: 127 -->

- **Simpler, less cluttered Settings** — the Notifications card now shows only notification controls, and your session preferences (pulley-pin tracking, RPE capture, and the RPE/RIR intensity scale) moved to the Training card where they belong. Several rarely-changed toggles were removed and replaced with sensible always-on defaults (timer sound, set-completion feedback, and the Tempo Coach launcher).
- **Your workout rest times now come from your template** — the adaptive rest timer, which could override the rest durations you set on a template or superset and even change a rest countdown that was already running when you logged an RPE, is now off. Rest lengths follow exactly what your template and linked-set settings specify.

## v0.26.56 — 2026-07-03
<!-- versionCode: 126 -->

- **Your completed sets are no longer lost when you leave and reopen an in-progress workout** — starting a new workout while another was still in progress could create a second, empty session, making your already-logged sets appear to reset. Starting a workout now detects an in-progress session and lets you resume it (or explicitly discard it before starting fresh), so finished sets are never silently dropped.
- **The "Next" set suggestion now applies to every remaining set** — tapping "Next" previously refused to fill sets it considered non-empty and treated a 0 weight or 0 reps as already filled. After you confirm, it now applies the suggested values to all not-yet-completed sets, overwriting existing values, instead of blocking with a "nothing to apply" notice.
- **Send a test notification from Settings** — the Notifications settings now include a "Send test notification" button so you can confirm alerts actually reach your device. The notification options were also streamlined to the three that matter most, with sensible defaults applied to the rest.

## v0.26.55 — 2026-07-03
<!-- versionCode: 125 -->

- **Improved readability of instructional text in clip library** — the helper text describing how to record exercises in the clip library was rendered in a low-contrast grey (#6B7280, ~4.3:1) that fell below the WCAG AA 4.5:1 threshold. The text now uses the primary on-surface colour (~13.6:1 contrast) with a tinted banner background for distinct visual weight. (BLD-2723)
- **Form-clip select indicator is now legible on light card backgrounds** — the selection circle on each clip card in select mode was rendered as a small gray outline that blended into the card background. The indicator is now slightly larger (24 px) and the unselected state shows a dark semi-transparent fill so the circle is visible against any card color. (BLD-2724)
- **Fixed illegible info icon in Estimated Pacing card** — the expand info button previously used a raw Unicode circled-i glyph (U+24D8) that rendered as an empty tofu box on web. It is now drawn with a bundled vector icon and displays correctly on all platforms. (BLD-2709)
- **Workout history heatmap now visible under colour blindness** — the heatmap used a coral (red-orange) accent that collapsed to indistinguishable grey under deuteranopia. Frequency cells now use a blue accent (#007AFF / dark #0A84FF) which is carried by the S-cone channel unaffected by red-green CVD, keeping all frequency levels perceptually distinct under protanopia, deuteranopia, and in grayscale. (BLD-2719)
- **Workout history calendar markers now distinguishable without colour** — dot indicators on the workout history calendar previously relied solely on coral hue to mark logged workouts, making them invisible under red-green color vision deficiency (CVD). Workout dots now carry a non-colour shape cue (outline ring) and scheduled-but-not-logged days show a hollow circle, so all day states remain distinguishable in grayscale and under protanopia or deuteranopia. (BLD-2721)
- **Pacing breakdown sheet — sort icons now crisp and legible** — the Working / Rest / Other column headers in the per-exercise pacing table previously showed a tiny illegible symbol (tofu box / '8') instead of sort arrows. The headers now use proper vector sort icons that render correctly on all devices and screen densities. (BLD-2726)
- **Improved active tab and CTA button visibility under colour blindness** — the active Workouts tab underline and the Start a Workout button previously lost their primary-action signal under protanopia (red-green CVD) because their colour shifted to yellow-olive. The active tab now uses a bolder font weight and taller underline, and the CTA carries a supplemental border outline — both non-hue cues that remain legible in any CVD mode and in grayscale. (BLD-2729)
- **History calendar workout dots now visible under colour blindness** — workout dot indicators on the /history calendar previously collapsed to olive against the light background under deuteranopia. Dots now carry a high-contrast luminance border that makes them distinguishable without relying on colour, in both light and dark themes. (BLD-2742)
- **Fixed broken navigation arrows in Nutrition tab** — the "Edit Targets →" and "Meal Templates →" link rows previously showed empty replacement boxes (□) on web because the Unicode → arrow is not available in all font stacks. The arrows are now drawn with bundled vector icons and render correctly on all platforms. (BLD-2732)
- **History calendar workout dots are larger and easier to see** — the dot indicator marking logged workout days on the /history calendar has been enlarged from 5px to 7px diameter, landing in the accessible 6–8px target range. The dot remains a crisp circle and the layered indicator system (background tint + dot) is unchanged. (BLD-2747)
- **Clip library grid now shows equal gutters on both sides** — the right clip card in the 2-column form library grid was flush to the screen edge due to a react-native-web layout quirk. Both columns now have symmetric ~12px gutters, matching the left inset. (BLD-2741)
- **Accessibility: Pacing segments now visually distinct under color vision deficiency** — the session summary pacing bar and legend previously relied solely on color to differentiate Working (coral), Rest (blue), and Other (grey) segments, making them indistinguishable for red-green CVD users. Working segments now display a horizontal-dash texture and Other segments a dot/stipple texture, so all three segments are mutually distinguishable in grayscale, under deuteranopia, and under protanopia. No segment colors, labels, or pacing math were changed. (BLD-2713, BLD-2714, BLD-2725)
- **Session notes textarea now immediately visible** — the Session notes input on the summary and detail screens was previously hidden behind a tap-to-expand gesture, making it unclear the area was interactive. The textarea is now always shown with a visible outline border and placeholder text ("Add notes about this workout...") so users can tap directly to add notes without any extra step. (BLD-2711)
- **Settings: improved sponsor-badge tap targets and spacing** — the Buy Me a Coffee and thanks.dev badge buttons in the About card now have 48dp minimum tap targets (up from 24dp for thanks.dev) and increased vertical spacing between them, making them easier to tap accurately. (BLD-2730, BLD-2731)
- **Fixed broken trophy/achievement icons on web** — achievement and level icons previously appeared as tofu boxes (empty squares) on web because emoji glyphs are not available in the default system font there. All icons are now drawn with bundled vector icons and display correctly on every platform. (BLD-2708)
- **Pacing bar always shows a visible Working segment** — when working time was a very small fraction of total session time, the Working segment rendered too thin to see. It now has a guaranteed minimum visual width so all non-zero segments are always visible. (BLD-2712)

## v0.26.54 — 2026-07-03
<!-- versionCode: 124 -->

- **Quick Weight Stepper — one-tap +/− to adjust set weight without opening the keyboard** — the active-session set row now shows a full-width `−` / `+` footer strip for plain-weight exercises. Tapping `+` or `−` increments or decrements the weight by the exercise step (e.g. 2.5 kg) and saves immediately, without summoning the numeric keyboard. Bodyweight rows, duration rows, and all cable rows (which use the stack-marker / manual-weight UI) are unaffected. (BLD-2674)
- **Training-Day Macro Adjustment — calorie cycling for lifters** — CableSnap can now automatically show a higher calorie target on days you train and a lower one on rest days, while keeping your weekly total exactly equal to your base target. The feature is off by default; enable it in Settings › Training-Day Macros, where you can set your split percentage and training days per week and preview both day-type targets. The day-type badge on the nutrition screen shows `Training day · fueled` or `Rest day · recovery` and taps to explain the adjustment. No reward framing — this is fuel/recovery periodisation, not earning calories. (BLD-2641)
- **Weight stepper no longer clamps to the boundary on a near-edge tap** — pressing − (or +) when the step would cross below the minimum (or above the maximum) now does nothing instead of snapping to the bound. (BLD-2688)

## v0.26.53 — 2026-07-02
<!-- versionCode: 123 -->

- **Fixed blank month labels in the Progress tab date carousels** — the monthly report header and calendar month labels relied on `toLocaleDateString`, which returns an empty string on React Native's Hermes engine (no bundled Intl/ICU data), so the month name rendered blank. Month labels now use a deterministic, locale-independent name table and always display correctly (e.g. "July 2026"). (BLD-2584)
- **Fixed a blank white square in the Progress tab** — the list/calendar view-mode toggle in the Progress tab rendered emoji glyphs that don't display on all platforms (notably web), leaving an empty bordered button. The toggle now uses proper vector icons and always shows a visible calendar/list affordance. (BLD-2583)
- **Quick exercise substitution — preferred swaps for occupied stations** — you can now save a "go-to" substitute for any exercise. When your usual station is taken, a one-tap chip on the session card swaps to your saved alternative instantly — no sheet, no confirmation dialog. Set a preference from the substitution sheet at any time via the "Set as my go-to for {exercise}" toggle. After a swap, an Undo affordance restores the original exercise. (BLD-2561)

## v0.26.52 — 2026-07-01
<!-- versionCode: 122 -->

- **Accessibility: Water-preset chips now show a shape icon for users with red-green color vision deficiency** — the hydration preset chips (e.g. "250 ml", "500 ml") previously used only a blue-tinted water-drop color to distinguish the selected state, which is invisible to red-green CVD users. Each chip now also displays a small non-color icon affordance so the selected preset is identifiable regardless of color perception. (BLD-2462)
- **Fix: the "Select clips" button in the Form clips header is now reliably tappable on phones** — the header toggle had a 44dp minimum height but no minimum width, so on narrow mobile screens the short "Select" label rendered only ~16px wide, well under the 44dp accessibility touch-target minimum. The button now enforces a 44dp minimum width, giving it a full-size, easy-to-hit tap area regardless of label length. (BLD-2449)
- **Import your workout history from Strong, Hevy, or FitNotes** — a new Settings → Import Workout History screen reads a CSV export from Strong, Hevy, or FitNotes, matches exercises to your library, and adds past sessions to your log. (BLD-2463)

## v0.26.51 — 2026-07-01
<!-- versionCode: 121 -->

- **Fix: Workouts home cards now flow into a proper grid on tablets** — on wider screens the Templates, Programs, and Recent Workouts lists were each trapped in a single half-width column, so their cards stacked one-per-row instead of filling the available space. These lists now use the same column-distributing grid as the rest of the app, so cards fan out into 2 columns (or 3 on the widest screens) while phones keep the single-column layout.

## v0.26.50 — 2026-06-30
<!-- versionCode: 120 -->

- **Improvement: Session set-logging is now faster with less visual noise** — the persistent "+ Add pinned note" empty-state prompt no longer appears on every exercise card; the "Last: …" confirmation dialog is gone (tapping "Last" now prefills the weight immediately without an extra tap); icon buttons got a slightly larger tap target; and the pulley-pin chip is now hidden until you have chosen a cable attachment/mount, so unset cable rows stay cleaner. (BLD-2386)
- **Fix: Removed a stray red error toast that could appear on body-diagram screens** — the muscle/body highlighter passed React Native accessibility props through to web SVG DOM nodes, producing a "Received `true` for a non-boolean attribute `accessible`" warning that surfaced as a red dev toast. Those props are now stripped before reaching the DOM. (BLD-2356)
- **Fix: workout sets now scroll reliably** — on the active workout screen, starting a drag on a set row sometimes failed to scroll the list (most often right after restarting the app), so lower sets were unreachable. The set list now uses a gesture-handler-aware scroll surface, so a vertical drag that begins on a row scrolls the list while horizontal swipes still trigger the row complete/delete actions.

## v0.26.49 — 2026-06-30
<!-- versionCode: 119 -->

- **Fix: "Volume" label in the workout summary stats card no longer truncates with an ellipsis** — the caption `Volume (kg)` was being cut off to `Volume ...` on narrow mobile screens even after the BLD-2197 font-shrink fix. The label now wraps to two lines (`Volume` / `(kg)`) instead of shrinking to fit, ensuring the full text is always visible at any font scale. (BLD-2355)
- **Fix: Rest Timer Notifications toggle no longer shows ON when the OS permission is denied** — the toggle in Settings now reflects the real system permission state; if the user previously denied notification permission at the OS level, the toggle correctly shows OFF rather than falsely indicating the feature is active. (BLD-2354)

## v0.26.48 — 2026-06-29
<!-- versionCode: 118 -->

- **Fix: "Connect Strava" really does use the working callback proxy now** — v0.26.47's release notes listed this fix, but that APK was compiled moments before the fix landed, so the old, dead hostname was still baked into the binary. This build ships the corrected `strava-proxy.alankyshum.workers.dev` OAuth callback proxy for real, so authorizing Strava no longer dead-ends on a DNS error. (#648)

## v0.26.47 — 2026-06-29
<!-- versionCode: 117 -->

- **Rest-complete now plays a satisfying "ca-ching" chime** — when a rest timer finishes, the phone notification now plays a custom ascending "ca-ching" completion sound instead of the generic system tone, so finishing a rest feels like ticking off a win. The sound is a procedurally-generated, public-domain (CC0) bell — no third-party samples. (Note: paired smartwatches still play their own notification tone/vibration for bridged alerts; the custom sound applies to the phone.) (BLD-1263)
- **Fix: "Connect Strava" no longer fails with a DNS error after authorization** — the OAuth callback proxy moved to its current Cloudflare Workers subdomain (`strava-proxy.alankyshum.workers.dev`); the old hostname stopped resolving (`DNS_PROBE_FINISHED_NXDOMAIN`). (#648)

## v0.26.46 — 2026-06-29
<!-- versionCode: 116 -->

- **Fix: Pacing bar CVD hatch now covers the full "Other" segment** — the diagonal hatch overlay that makes the grey "Other" segment distinguishable under red-green colour blindness previously only covered the leftmost 18 px of the segment. The hatch now fills the full flex-width segment, so the CVD pattern is visible at any bar width. The legend dot appearance is unchanged. (BLD-2205)
- **Rest-complete now reaches your watch** — the "Rest complete" chime is now mirrored to paired smartwatches (Wear OS, incl. OnePlus Watch 3 via OHealth). Earlier installs created the rest-complete notification channel at low importance, which OEM watch bridges silently skip; it's now a fresh MAX-importance channel sent with MAX priority so the alert bridges to the watch while the phone is in your pocket between sets. (BLD-1262)
- **Fix: Volume label in post-workout summary now shows fully without truncation** — the caption `Volume (kg)` was being cut off to `Volume ...` on narrow mobile screens. The label now auto-shrinks to fit the tile width, matching the behaviour of the value text above it. (BLD-2197)

## v0.26.45 — 2026-06-29
<!-- versionCode: 115 -->

- **Fix: Volume stat in post-workout summary now shows the full number** — the value was truncated to `3,720…` with an ellipsis on mobile. The unit (e.g. `kg`) is now shown in the label below the number, freeing enough space for the full value to display. (BLD-2135)
- **Improvement: Settings tiles fade in with a subtle staggered entrance** — when the Settings screen opens, its themed tiles now ease in with a brief fade/slide-up cascade instead of appearing all at once, giving the redesigned screen a more polished first paint. The effect is intentionally short and is fully disabled when the device's "Reduce Motion" accessibility setting is on (tiles appear instantly). Tile content is never hidden behind the animation. (BLD-2036)

## v0.26.44 — 2026-06-28
<!-- versionCode: 114 -->

- **Fix: Form clips, session pacing, and stack marker screens no longer show an error overlay in development builds** — tapping "Select clips", tapping the pacing card, or viewing the stack marker pill could trigger a red error overlay that blocked all interaction when testing on sub-path routes. Root cause: the CanvasKit WASM loader was resolving a relative path that Metro dev server returned as an HTML fallback page, causing a WebAssembly compile error. The loader now uses an absolute path and probes WASM availability before loading. (BLD-2125)
- **Fix: Progress tab no longer crashes with a white error screen on large-screen devices (Fold 7)** — on wide-viewport devices the Progress tab could display a full-screen dev error overlay instead of your progress data. Two root causes were fixed: the CanvasKit chart library is now initialised before the app renders (preventing a crash during chart load), and the body-settings database row is now inserted safely so simultaneous accesses no longer conflict. The Progress tab renders correctly on all screen sizes. (BLD-2078)
- **Improvement: Integrations and Feedback tiles now match the visual style of all other Settings tiles** — Integrations and Feedback were previously rendered as standalone full-bleed cards without the consistent tile heading and padding that the other 7 Settings sections use. Both are now wrapped in `SettingsTile` so all 9 sections share the same 16 px padding and 18 px/600 heading typography. No functionality changed. (BLD-2090)

## v0.26.43 — 2026-06-28
<!-- versionCode: 113 -->

- Settings: tidied up text hierarchy so titles, labels, and helper text use consistent sizes and weights for a cleaner, less cluttered look.
- **Improvement: Settings tiles are lighter and less cluttered** — the Settings screen previously rendered as a vertical stack of drop-shadowed boxes. Each tile now uses a subtle 1px outline instead of a shadow, with slightly tighter padding, so the screen reads as a clean, calm list rather than a column of floating cards. (BLD-2030)
- Wide screens (foldables/tablets) now use the full width across the Workouts and Progress tabs — cards flow into 2–3 balanced columns instead of a single centered column, so you see more at a glance. (BLD-2033)
- **Improvement: Settings link rows are more legible and easier to tap** — the Gym Profiles, Advanced Set Types, and Adaptive Macro Coach entries now use a larger, consistent title size and a guaranteed 48 dp minimum touch target, and Settings tiles share a single, consistent density (padding and heading size). No functionality changed — the links open the same screens as before. (BLD-2032)
- **Improvement: Settings screen is reorganised into themed sections** — the previously long list of ~18 individual setting cards is now grouped into 9 clearly-labelled tiles (Profile, Units & Appearance, Training, Notifications, Coaching, Integrations, Data & Backup, Feedback, About) using a tidy masonry layout on wider screens. Related settings now sit together under a named heading, and the screen reads as a clean, scannable list instead of a tall stack of cards. All settings open the same screens as before. (BLD-2031)

## v0.26.42 — 2026-06-27
<!-- versionCode: 112 -->

- **Fix: Red error toast no longer appears on the session pacing and post-workout summary screens** — a React DOM prop warning caused by an accessibility attribute leaking onto an SVG element produced a persistent red error toast on these screens. The prop is now correctly scoped to native only; the web accessibility attribute (`aria-hidden`) handles screen readers on web as before. (BLD-1994)
- **Fix: "Sets" and "Volume" stat labels no longer truncate on the workout summary screen** — the stacked stat-tile captions on the completed-workout summary were clipped with an ellipsis on narrow viewports. The label layout was restructured so each caption renders on a single line at full width. (BLD-1993)
- **Fix: "Select" link in the Form clips header now meets the 44 dp touch target minimum** — the previous implementation used a small `hitSlop` that only extended the tappable area to ~36 dp, making the control difficult to tap reliably. The tap area is now at least 44×44 dp as required by HIG and Material guidelines. (BLD-1941)
- **Fix: Pacing bar is now distinguishable under red-green colour blindness** — the "Other" (grey) segment in the post-workout pacing bar now carries a diagonal hatch pattern so it remains separable from the "Working" (coral) segment for users with deuteranopia or protanopia. The hatch is mirrored on the matching legend dot. Full-colour appearance for sighted users is unchanged. (BLD-1939)
- **Fix: "Sets" stat label no longer truncates on the workout summary screen** — on 390 px viewports the "Sets (9 working)" caption was cut off with an ellipsis because the auto-shrink limit of 80% wasn't enough headroom. The minimum font scale is now 60%, giving the caption enough room to fit on one line. Duration and Volume captions are unchanged. (BLD-1938)

## v0.26.41 — 2026-06-25
<!-- versionCode: 111 -->

- **Fix: Advanced Set Types help screen now hints when there's more to scroll** — on narrow phones (e.g. 320px wide) the last "Myo-reps" section could sit at the bottom edge with no cue that more content existed below. The screen now shows a subtle bottom fade while the list can still be scrolled, and the fade disappears once you reach the end. (BLD-1916)

## v0.26.40 — 2026-06-24
<!-- versionCode: 110 -->

- **Fix: Sets stat tile caption no longer wraps to two lines on the summary screen** — on a 390px mobile viewport the "Sets (9 working)" caption wrapped to two lines, while Duration and Volume stayed on one line. All three stat tile captions now auto-shrink the font to fit on a single line (down to 80% of the baseline size), so the three-tile row stays visually consistent regardless of how many set types are present. Screen-reader accessibility labels are unchanged. (BLD-1873)
- **Fix: Error toasts now show full message** — error toasts that contained long messages (e.g. React runtime warnings) were truncated mid-word due to a single-line limit. Toasts now wrap to two lines so the full message is readable. Also fixed a React web rendering warning ("non-boolean attribute") caused by React Native accessibility props being passed to DOM elements on web, which was the root-cause message appearing in the toast. (BLD-1872)

## v0.26.39 — 2026-06-24
<!-- versionCode: 109 -->

- **Fix: Add Food sheet now scrolls to the "Log Food" button** — when adding a food via Manual Entry, the bottom sheet's drag-to-dismiss gesture was intercepting vertical swipes, so the form couldn't be scrolled and the "Log Food" button at the bottom was unreachable (especially with the keyboard open). The Add Food sheet's pan-to-dismiss is now disabled, so its content scrolls normally; the sheet is still dismissable via the backdrop or the in-form Cancel button. (BLD-1793)
- **Fix: "Log Food" submit button is now always reachable in the Add Food sheet** — the manual-entry form submit was laid out below the visible screen fold when the sheet was at its default snap point, making it unreachable by scrolling. The sheet's scroll container is now bounded to the visible on-screen height so the form scrolls correctly and the submit button is always accessible. (BLD-1819)

## v0.26.38 — 2026-06-22
<!-- versionCode: 108 -->

- **Fix: "Other" legend dot in the Estimated Pacing card is now visible** — the dot was near-white against a white card background, making it nearly invisible. It now uses a mid-grey colour with a subtle border so all three legend indicators (Working, Rest, Other) are clearly distinguishable. (BLD-1669)

## v0.26.37 — 2026-06-22
<!-- versionCode: 107 -->

- **Fix: Post-workout summary no longer crashes on the web build** — opening the workout summary in a browser could occasionally fail with a "Sync operation timeout" error that replaced the whole screen, when the database's web worker hadn't finished starting up. The app now warms the worker during startup so the summary (and every other database-backed screen) loads reliably, and if a database read ever does fail it now shows the recoverable retry screen instead of a blank crash. Native (iOS/Android) behaviour is unchanged. (BLD-1636, BLD-1635)

## v0.26.36 — 2026-05-16
<!-- versionCode: 106 -->

- **Fix: App no longer floods crash reports when the workout database fails to open** — on the rare devices where the native SQLite layer can't open the database (one cluster: Galaxy Z Fold 6 on Android 16), the app now shows a recoverable "Workout data can't be opened" screen with a Retry button and an Export-diagnostics action instead of leaving you on a blank/broken screen. Behind the scenes a single diagnostic event is reported per session rather than the previous 12+/minute burst. (#609, BLD-1257)
- **Fix: Bottom sheet drag handle is now clearly visible** — the small pill at the top of pull-up sheets (e.g. "Pacing by exercise") previously rendered near-invisible (~1.09:1 contrast) in light mode. It now uses a mid-gray meeting WCAG AA for non-text UI components (≥3:1). (#611, BLD-1260)
- **Fix: Web fallback no longer attempts native database init** — restored the BLD-565 invariant that web hosts without `SharedArrayBuffer` skip every database code path. A regression in the BLD-1257 recovery flow caused the new database-status hook to run `getDatabase()` even on the WebUnsupported screen, surfacing a `ReferenceError: SharedArrayBuffer is not defined`. The hook is now gated behind the same web-support check. (BLD-1262)
- **Fix: Advanced Set Types help page shows all content on narrow web viewports** — the page layout on web no longer clips the Myo-reps description mid-sentence on 390 px wide viewports. The ScrollView's flex constraint is now omitted on web so the full content is accessible without a bounded scroll region. (BLD-1261)

## v0.26.35 — 2026-05-16
<!-- versionCode: 105 -->

- **Fix: Workout input fields no longer reset while timer is running** — reps, weight, RPE, and duration values typed during an active set timer now persist through every second tick. Previously, the elapsed/countdown display caused the entire exercise list to re-render each second, overwriting in-progress edits with stale values. (#599, BLD-1235)
- **Fix: "Finish Workout" button now responds during rest timer (Android)** — tapping Finish Workout while the rest countdown is active now reliably opens the Complete Workout confirm dialog. Previously the button was unresponsive on Android (especially foldables like Galaxy Z Fold 6) because the footer re-mounted every second during rest ticks. (#600, BLD-1239)
- **Advanced Set Types help sheet**: Fixed Myo-reps description being clipped mid-sentence on narrow viewports (390 px wide). The help sheet now has sufficient bottom padding so the last card and footer are fully visible with breathing room.
- **Strava sync — duplicate upload fix**: Activities already uploaded to Strava no longer surface a "sync failed" toast or retry loop. Strava's 409 conflict response (same `external_id`) is now treated as a successful idempotent re-sync, clearing the queue entry silently.

## v0.26.34 — 2026-05-12
<!-- versionCode: 104 -->

- **Rest timer (Android)**: Fixed notification spam where finishing a set would stack 12–24+ shade entries instead of showing one. The live countdown now dismisses the previous entry before re-presenting, and updates every 15 s instead of every 5 s.
- **WearOS rest-complete bridging**: The "rest complete" chime now appears on paired Wear OS watches. Previously the notification used a low-importance channel that the Wear OS Companion skips; it now uses a HIGH-importance channel.
- **Fix: "Complete Workout" button no longer silently no-ops** — confirm dialog now reads "Complete" (was "OK"), and any error during finish (rest dismiss, pinned-note flush, session save) is surfaced as a toast instead of being swallowed. Your in-progress workout remains intact and resumable on failure. (#589, BLD-1207)
- Strava activities synced from CableSnap now include a small footer crediting the app with a link to the GitHub project.
- **Advanced set E2E tests**: fixed `.tap()` → `.click()`, strict-mode `getByText` for "Cluster", and added `E2E_USE_STATIC=1` skip guards on session-detail tests that require SharedArrayBuffer (COOP/COEP headers).
- **Strava connect** (Android): Fixed a silent connection failure on some OEM Android builds (Samsung Z Fold6 and similar) where the OAuth redirect was not intercepted, leaving the connection incomplete.
- **Strava sync**: Upload outcome is now accurately reflected in the post-workout toast — "Synced to Strava ✓" on success, "queued — will retry" on transient failure, and "check Settings" with a navigation shortcut on permanent failure (e.g. revoked token).
- Progression suggestions now correctly evaluate advanced set types (rest-pause, cluster, myo-reps) using the working-set reps of the activation segment, rather than the inflated total-reps sum.
- **CSV export/import round-trip for advanced sets**: rest-pause, cluster, and myo-rep set segment data (reps, weights, rests per mini-set) is now preserved when you export and re-import your workout CSV. Unknown set types in imported CSVs are automatically normalised to "normal" instead of being silently dropped.
- **Advanced set types — Mini-set editor**: Rest-pause, cluster, and myo-rep sets now show an inline mini-set editor during active sessions. Tap to log each sub-rep burst, long-press a mini-set row to delete it, or collapse all mini-sets back into a single normal set. Up to 8 mini-sets per parent set are supported.

## v0.26.33 — 2026-05-12
<!-- versionCode: 103 -->

- **Advanced set schemes (analytics)**: rest-pause, cluster, and myo-rep sets now contribute correct volume and e1RM values to all analytics surfaces (weekly/monthly trends, exercise history bests, achievements). Previously, multi-segment sets were excluded or under-counted due to the reps ≤ 12 filter.
- **Adaptive Macro Coach** (off by default): Enable in Settings → Nutrition → Adaptive Macro Coach to get a weekly advisory card that suggests a calorie target based on your trend weight and average intake over the past two weeks. The coach is advisory only — your target is never changed without your tap. Includes a hard safety floor (based on your sex and estimated metabolic rate), a ±300 kcal/week cap, Right Why check-in, and a one-tap one-month pause.
- **Tempo Coach (haptic engine)**: Enable "Tempo Coach" in Settings → Preferences to get a haptic rep guide during your sets. When active, a vibration cues each phase of your tempo (eccentric → bottom pause → concentric → top pause) in real time. A compact overlay shows the current phase and lets you stop the coach at any time. The coach auto-stops when the set is logged and cancels if you background the app.
- **Advanced Set Types — CSV round-trip**: CSV export now includes `set_type`, `mini_set_reps`, `mini_set_weights`, and `mini_set_rests` columns for rest-pause, cluster, and myo-rep sets. These trailing columns are ignored by older importers (back-compat). CSV import parses and clamps mini-set data to 8 segments. Settings → Advanced Set Types explains each set type in plain language.

## v0.26.32 — 2026-05-11
<!-- versionCode: 102 -->

- **Form Check Comparison**: Compare form clips side-by-side from the Form Library or from the clip player with synchronized play/pause/reset, A↔B swap, in-sheet clip picker, and landscape layout support.
- **Tempo Coach (data layer)**: Set a per-exercise default tempo (e.g. `3-1-2-0`), which auto-fills on every new set for that exercise. Edit tempo per-set via the new Set Options sheet. Tempo is preserved across CSV import/export and template initialization.

## v0.26.31 — 2026-05-11
<!-- versionCode: 101 -->

- **Settings cleanup**: Removed the Health Connect integration entry from Settings. The feature was never fully functional; removing it reduces permission surface and eliminates a confusing toggle for Android users.
- **Database cleanup**: Removed the legacy `health_connect_sync_log` database table and its associated app_settings key on device upgrade. New installs are not affected.
- **Smart Rest Coach (fix)**: Live countdown and scheduled rest notifications now correctly resume after the app is force-quit and reopened mid-rest on Android. Previously, OS-scheduled notifications could be lost on process kill; they are now re-scheduled on cold-start resume.
- **Session Pacing**: Post-session summary now includes an **Estimated pacing** card showing a stacked bar with time spent Working, Resting, and in Other (transition/setup) time. Tap the card to see a per-exercise breakdown table. Working time for rep-based sets is estimated at ~2 s/rep; rest is the gap between consecutive sets on the same exercise (capped at 10 min). Available on completed sessions only. Pacing duration now matches the session duration shown in the summary header.
- **Session Pacing (fix)**: Pacing totals now correctly align with the session duration shown in the summary header; the breakdown sheet tap interaction is restored on all devices.

## v0.26.30 — 2026-05-10
<!-- versionCode: 100 -->

- **Connect Strava (fix)**: The "Connect Strava" button in Settings → Integrations now actually works. Previously it always failed silently with an "invalid redirect URI" error from Strava's side. The OAuth flow now correctly hands off through a small HTTPS bouncer back to the app.

## v0.26.29 — 2026-05-10
<!-- versionCode: 99 -->

- **Smart Rest Coach**: Rest-timer notifications now include a pre-end cue (5–20s before rest ends), a live lock-screen countdown that updates every 5 seconds (Android), and an optional next-set preview showing exercise, target weight, and rep range right on the notification — so you never need to unlock the phone just to remember what's next. All three features are individually togglable under Settings → Rest Timer.
- **Stack marker quick-pick**: Cable exercises at calibrated gyms now show a marker pill instead of a numeric weight field. Tap to pick your stack position; the true weight is resolved automatically. Long-press to fall back to numeric entry on any set.
- **Stack marker hint**: Cable exercises at gyms without saved calibration now show a one-time, dismissible hint pointing to where to add stack calibration so future sessions can use marker quick-pick.
- **Marker autofill reliability**: First add-set after switching gyms now consistently fills in the right stack marker instead of occasionally dropping back to numeric entry.
- **Bug fix — marker/weight save reliability**: On rare DB write failures when logging a stack marker or manual weight, the set row now correctly reverts to its previous state instead of showing stale or blank values.

## v0.26.28 — 2026-05-10
<!-- versionCode: 98 -->

- **Plateau detection & break-through suggestions**: When an exercise stalls for 4+ sessions without weight or rep improvement, a suggestion card surfaces on the exercise detail screen with a context-aware action — deload to break a loaded stall, push for +2 reps at current weight, or check form if effort has been creeping up (BLD-1122).
- **Settings scroll fix (follow-up)**: Increased the bottom clearance buffer on the Settings screen to prevent the About section and links from being clipped behind the floating tab bar on Z Fold6 and other foldable or tall-nav Android devices (BLD-1124).

- **Track pulley pin position**: Tap the new pin chip next to any cable set to record which pulley pin you used (1 through your machine's max). Stored per set so your exact stack position is always in the history export (BLD-1114).
- **Setup photo per set**: Tap the camera icon on any completed cable set to snap a quick photo of the cable path, attachment, and pin — a visual reference so you can replicate the exact setup next time (BLD-1114).
- **RPE capture nudge**: Exercise detail now shows a one-time banner for users who have logged RPE before but haven't enabled live capture — tap "Turn on" to enable in one step, or "Not now" to dismiss forever (BLD-1117).

## v0.26.27 — 2026-05-09
<!-- versionCode: 97 -->

- **Record directly from Form tab**: Tap the new "Record clip" button in the Form clips tab (exercise detail drawer) to record a new clip without leaving the exercise view. The button auto-targets the most recent unclipped set, or shows a helper hint when all sets already have clips (BLD-1105).
- **Replace or delete individual clips**: Each clip row in the Form clips tab now has an overflow menu (⋯) with Replace and Delete actions. Replace atomically swaps the file and database row in a single transaction (BLD-1105).
- **Manage all clips from Settings**: The Form Clips card in Settings is now tappable and opens a full clip library grouped by exercise. Delete individual clips or bulk-delete all clips to reclaim storage instantly (BLD-1105).
- **Settings scroll fix**: Fixed settings screen content cut off behind the floating tab bar on tall Android devices (Galaxy Z Fold6, Pixel 7 Pro) — the About section and links at the bottom are now fully accessible (BLD-1106)
- **Live RPE capture**: Rate each set's effort with a tap (Easy / Moderate / Hard / Max) directly in the workout screen. Long-press for a precise value (6.0–10.0). RPE powers the smart rest timer and next-set suggestion — enable in Settings (BLD-1110).

## v0.26.26 — 2026-05-09
<!-- versionCode: 96 -->

- **Smart Rest Timer**: Rest suggestions now adapt to each exercise based on your actual median rest over the last 30 days. Pin a custom default per exercise, or let the timer learn automatically — templates and 90 s fallback remain for new users (BLD-1100).

## v0.26.25 — 2026-05-08
<!-- versionCode: 95 -->

- **Database upgrade fix**: Resolved a crash on first launch ("Database error: no such column: gym_id") that affected users upgrading from a much older install. Migration ordering is now phased to prevent this class of bug from recurring.

## v0.26.24 — 2026-05-08
<!-- versionCode: 94 -->
- **Form Check Videos**: Record short video clips (up to 15 s) on each completed working set to review technique over time. Clips are stored locally only — never uploaded, never backed up to iCloud/Google (BLD-1092).
- **Form Library**: "Form clips" tab in the exercise detail drawer shows all clips for an exercise reverse-chronologically with date, weight, and reps overlay (BLD-1092).
- **Side-by-side comparison**: Compare any two form clips from your library in a split-screen view (BLD-1092).
- **Storage panel**: Settings → Storage shows total clip size and count with a "Manage" shortcut (BLD-1092).
- **Privacy**: form-clips/ directory excluded from iOS iCloud and Android Auto Backup via Expo config plugin — form-check videos stay on-device only (BLD-1095).
- **Database integrity**: Enabled SQLite foreign-key enforcement on every connection so historic delete paths (workout history, CSV import undo, in-progress cancel) now correctly clean up Strava and Health Connect sync-log entries instead of leaving orphan rows.
- **Grease-the-Groove mode**: Log scattered sets throughout the day without starting a workout — tap the floating Quick Add button, pick an exercise, confirm reps/weight, and get a 4-second undo toast. Daily GTG totals appear as a summary card on the home screen and a light-fill dot on the calendar.

## v0.26.23 — 2026-05-08
<!-- versionCode: 93 -->

### New features
- **Per-variant PR cards for cable exercises** — strength records now track each cable exercise variant separately so PRs reflect the actual movement you trained (BLD-1086).
- **Per-Gym Cable Stack Calibration** — calibrate each gym's cable stack once and have plate math + load suggestions follow you between gyms (BLD-1060).
- **Pinned per-exercise notes** — pin a note to any exercise so it surfaces every time you start that exercise in a session (BLD-1028).
- **Curated Programs Library** — bundled r/bodyweightfitness Recommended Routine v1 as a starter program; more curated programs to follow.
- **Export workout templates** — long-press a template to export it for sharing or backup.
- **Template sync from completed sessions** — edits made to sets during a session now flow back into the source template on completion (BLD-1031).
- **128-exercise Gemini illustration set** — refreshed exercise illustrations using the new Gemini-generated set, retiring the older gpt-image-1 voltra subset (BLD-989).

### Fixes
- **History filter chips scroll correctly** — bounded the FilterBar container so the chip row actually scrolls instead of clipping.
- **Set numbering after delete** — deleting a set in a session now renumbers the remaining sets correctly (BLD-1044).
- **Body view padding** — Progress > Body list no longer hides its last row behind the floating tab bar (BLD-990).
- **Tablet home layout** — workout cards no longer get cropped on tablet flex-wrap rows (BLD-1011).
- **Monthly share button** — Progress > Monthly view share button no longer overlaps the floating navbar.

## v0.26.22 — 2026-05-03
<!-- versionCode: 92 -->
- Internal/CI: regression-catcher fixture migrated to wrapper-fixture pattern (BLD-1023).

## v0.26.21 — 2026-05-03
<!-- versionCode: 91 -->
- Internal/CI: routine release — no user-facing changes.

## v0.26.20 — 2026-05-02
<!-- versionCode: 90 -->
### Added
- Hydration tracking — log water in ml or fl oz from the Nutrition tab; configurable daily goal and preset volumes in Settings.
- Workout templates now remember the training mode you pick per Voltra exercise; sessions started from the template open in the saved mode automatically.

### Changed
- Workout duration now starts when you log your first completed set, not the moment you tap Start (BLD-630).

### Removed
- Removed the **Eccentric** training mode chip and tempo tracking. Existing eccentric sets in your history are preserved as standard sets; other Voltra modes (Band, Damper, Isokinetic, Isometric, Custom, Rowing) are unchanged.

### Internal/CI
- Merge gate: comment-fallback approvals for lenient branch protection.

## v0.26.19 — 2026-05-01
<!-- versionCode: 76 -->
- Fixed Android crash on app open caused by WearOS module class-loading failure on devices without Google Play Services.
- Replaced direct WearOS Wearable API import with Class.forName() reflection to prevent NoClassDefFoundError at startup.
- Removed WearOSModule from Expo autolinker to prevent F-Droid build crashes.
- Added Android emulator smoke test to CI pipeline to catch launch crashes before release.

## v0.26.12 — 2026-04-26
<!-- versionCode: 65 -->
- Web: fixed a crash on the Summary screen and other queries that returned larger result sets — the SQLite worker was truncating its length prefix to one byte, corrupting any payload ≥256 bytes (BLD-660).
- Workout history: heatmap now renders in a stable 7-column grid at every screen width — Sundays no longer wrap to a new row at narrow widths (BLD-661).
- Workout history: heatmap, streak, and dot map now populate correctly from seeded sessions — timestamps are stored in milliseconds end-to-end (BLD-662).
- Workout history: streak card labels clarified to make current vs longest streak unambiguous (BLD-663).

## v0.26.8 — 2026-04-24
<!-- versionCode: 57 -->
- Set-completion now confirms with a subtle haptic + audio cue — toggle separately from timer sounds in Settings → Preferences.
- Previous-performance chip on the session screen now looks tappable again (affordance restored).
- Adaptive rest timer now shows a "+N" overflow counter when the chip truncates.
- Strava auth errors surface a proper toast with a "Get help" CTA.
- Session screen performance pass: memoization + background-timer pause when the app is backgrounded.

## v0.26.7 — 2026-04-24
- Adaptive rest timer — intelligently suggests rest duration based on your recent set intensity.
- End-to-end visual regression suite now uses a deterministic exercise fixture.
- Bundle-gate CI check now runs on every PR so the required status always reports.
- F-Droid `versionCode` sync fix — updates now install cleanly without the "Installed" ghost.

## v0.26.6 — 2026-04-23
- Workouts tab now shows a more welcoming empty state when you have no sessions yet.
- New subtle severity + heatmap theme tokens for a calmer progress view.
- Strava connection actions emit Sentry breadcrumbs for faster triage of auth hiccups.

## v0.26.5 — 2026-04-23
- Body profile unit labels now refresh immediately when you change weight/measurement units in Settings.
- Strava configuration errors now surface a tappable "Get help" CTA in the toast.
- Removed the one-time post-BLD-485 reinstall banner now that the keystore transition is complete.

## v0.26.4 — 2026-04-23
- PR dashboard empty state now has a friendly retry button instead of a blank screen on fetch failure.
- Post-workout summary: Android hardware back is now intercepted so you don't accidentally drop out of the rating flow.
- Typography polish on the PR stats row.
- First release signed with the new persistent production keystore (future updates install cleanly in place).
