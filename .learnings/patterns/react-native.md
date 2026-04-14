# React Native + Expo Patterns

## Learnings

### Use Refs for Non-Rendering State Inside useFocusEffect
**Source**: BLD-2 — Weekly Muscle Group Volume Analysis (Phase 15)
**Date**: 2026-04-13
**Context**: The MuscleVolumeSegment included `selectedMuscle` state in the useFocusEffect callback. Tapping a muscle called `setSelectedMuscle`, which triggered useFocusEffect to re-run `load()`, which reset state, creating an infinite re-fetch loop on every tap.
**Learning**: `useFocusEffect(useCallback(fn, [stateVar]))` re-runs `fn` whenever `stateVar` changes — not just on focus. If `fn` also sets `stateVar` (directly or indirectly), it creates an infinite loop. State used only for UI selection (e.g., which chart bar is highlighted) does not need to trigger data re-fetching.
**Action**: For selection state that does not affect which data is fetched, use a `useRef` instead of `useState` to avoid adding it to the useFocusEffect dependency array. Only include state in useFocusEffect deps when the data query itself depends on that state value.
**Tags**: usefocuseffect, useref, usestate, dependency-array, infinite-loop, react-navigation, performance

### Wrap Bulk SQLite Inserts in withTransactionAsync
**Source**: BLD-13 — Phase 4: Progress Charts, Rest Timer & Import/Export
**Date**: 2026-04-12
**Context**: The data import feature used multiple INSERT OR IGNORE statements without an explicit transaction. Each INSERT created its own implicit transaction (one disk sync per row), making imports slow and non-atomic.
**Learning**: Without an explicit transaction, a mid-import failure leaves partial data in the database — violating the requirement that invalid imports leave data unmodified. Wrapping all inserts in `database.withTransactionAsync()` provides atomicity (rollback on failure) and performance (single disk sync for all rows).
**Action**: Always wrap multi-row INSERT operations in `database.withTransactionAsync()`. This applies to imports, seed data, and any bulk write operation. Test the failure case — kill the operation mid-way and verify the database is unchanged.
**Tags**: expo-sqlite, transactions, bulk-insert, import, data-integrity, performance

### Never Execute Side Effects Inside React setState Updaters
**Source**: BLD-13 — Phase 4: Progress Charts, Rest Timer & Import/Export
**Date**: 2026-04-12
**Context**: The rest timer called `clearInterval()` and `Haptics.notificationAsync()` inside a `setRest(prev => ...)` state updater function. React may invoke updater functions multiple times in StrictMode, causing double interval clearing and double vibration.
**Learning**: React setState updater functions must be pure — no side effects. React reserves the right to call them multiple times for reconciliation. Side effects like timers, haptics, API calls, and DOM mutations inside updaters produce unpredictable behavior.
**Action**: Move side effects to a `useEffect` that watches the derived state value. For timers: set state in the updater, then use `useEffect` watching the value to trigger side effects when it reaches the target (e.g., 0 for a countdown).
**Tags**: react, usestate, side-effects, useeffect, strict-mode, haptics, timers

### ErrorBoundary Must Wrap Outside Context Providers
**Source**: BLD-19 — Crash Reporting: Error Boundary, Error Log, and Report UX
**Date**: 2026-04-12
**Context**: Implementing crash reporting required deciding where to place the React ErrorBoundary relative to PaperProvider and ThemeProvider in the component tree.
**Learning**: The ErrorBoundary must wrap OUTSIDE PaperProvider/ThemeProvider so it catches errors thrown by providers themselves (e.g., theme initialization failures). This means the crash screen cannot use theme tokens — hardcoded dark-mode styles are justified as an exception to the "never hardcode colors" rule. Additionally, the error handler and logging must be fully defensive: wrap all DB writes in silent try/catch, because crash-handling code that itself crashes creates an unrecoverable state.
**Action**: Place ErrorBoundary as the outermost wrapper in _layout.tsx, outside all providers. Use hardcoded colors only in the ErrorBoundary crash screen. Wrap all operations inside error handlers (logError, generateReport) in try/catch blocks that silently ignore failures.
**Tags**: react, error-boundary, crash-reporting, provider-ordering, defensive-programming, theming-exception

### Always Use try/catch/finally for Async Operations with Loading State
**Source**: BLD-11 — Phase 5: Nutrition and Macro Tracking; refined by BLD-22 — Phase 6: CSV Export
**Date**: 2026-04-12 (updated 2026-04-13)
**Context**: The nutrition feature's save() and quickLog() used `try/finally` without `catch`. The loading state reset correctly on failure (via finally), but thrown errors propagated unhandled — the user saw no feedback about what went wrong. The tech lead flagged this in PR #12 review, noting that settings.tsx already used the correct `try/catch/finally` pattern with snackbar error feedback.
**Learning**: `try/finally` alone fixes stuck spinners but silently swallows errors from the user's perspective. Without `catch`, a failed DB write resets the button but shows no error message — the user thinks nothing happened. The complete pattern is `try/catch/finally`: catch provides user-facing feedback (snackbar, alert), finally resets loading state unconditionally.
**Action**: Always use `try { await asyncOp(); } catch { showErrorFeedback() } finally { setLoading(false); }`. The catch block should show a snackbar or alert explaining the failure. During self-review, search for `try {` blocks that have `finally` but no `catch` — each is a silent-failure risk.
**Tags**: react, async, loading-state, try-catch-finally, error-handling, ui-state, snackbar

### Store Measurements in Canonical Units — Convert at the Display Layer Only
**Source**: BLD-17 — Body Weight & Measurements Tracking (Phase 7)
**Date**: 2026-04-13
**Context**: Body weight and measurements support both metric (kg/cm) and imperial (lb/in) units. The question was whether to store values in the user's preferred unit or in a single canonical unit.
**Learning**: Storing user-preference units in the database causes conversion bugs in aggregations, charts, goal calculations, and CSV exports. If a user switches from kg to lb, all historical data must be re-interpreted. By storing exclusively in canonical units (kg for weight, cm for measurements) and converting at the UI layer via a settings table (`body_settings.weight_unit`), all database queries, aggregations, and exports operate on consistent data.
**Action**: When a feature involves unit preferences (weight, distance, temperature), always store in a single canonical unit. Keep unit preference in a separate settings table. Convert in UI components only — never in database queries or export functions.
**Tags**: data-modeling, units, canonical-storage, conversion, body-tracking, internationalization

### Semantic Color Constants for Domain-Specific Theming
**Source**: BLD-21 — Accessibility: a11y attrs, font sizes, theme colors
**Date**: 2026-04-13
**Context**: FitForge needed colors for domain concepts (macro nutrients, exercise difficulty levels) that don't map to Material Design 3's built-in color tokens. Hardcoding hex values was flagged as an accessibility failure during a board audit.
**Learning**: Material Design 3 theme tokens (primary, secondary, surface, etc.) don't cover domain-specific color needs. Creating a `semantic` color export in the theme file maps domain concepts to colors (e.g., `protein → blue`, `difficulty.beginner → green`) while keeping them centrally managed and dark-mode aware. This prevents scattered hardcoded hex values without forcing domain concepts into inappropriate MD3 roles.
**Action**: When a feature needs colors for domain concepts not covered by MD3 tokens, add them to the `semantic` section of `constants/theme.ts`. Never use hardcoded hex in component StyleSheet. Reference semantic constants for domain colors and `useTheme()` for standard UI colors.
**Tags**: theming, material-design-3, semantic-colors, accessibility, dark-mode, react-native-paper, hardcoded-colors

### Single-Fetch + Client-Side Derivation for Bounded Datasets
**Source**: BLD-16 — Workout History & Calendar View (Phase 8)
**Date**: 2026-04-13
**Context**: The history screen needed three views of the same data: calendar dot counts per day, a full month session list, and a filtered list for a selected day. The tech lead spec explicitly stated "Do NOT create separate getWorkoutDatesForMonth — compute dot counts client-side."
**Learning**: When multiple UI views (calendar dots, session list, day filter) consume the same bounded dataset (one month of sessions), a single DB query plus client-side derivation via `useMemo` and `.filter()` is simpler, faster, and guarantees consistency across views. Separate queries risk stale reads between calls and add unnecessary I/O. The bounded nature of the data (one month ≈ 30–90 rows) makes in-memory computation negligible.
**Action**: When a screen shows multiple views of the same time-bounded data, load all records in one query (e.g., `getSessionsByMonth`) and derive each view client-side with `useMemo`. Reserve separate queries for unbounded datasets or data spanning different tables.
**Tags**: data-fetching, usememo, client-side-computation, sqlite, bounded-dataset, calendar, performance

### Use useFocusEffect for Data Refresh on List Screens
**Source**: BLD-3 — Custom Exercises CRUD (Phase 9)
**Date**: 2026-04-13
**Context**: The exercises list used `useEffect(fn, [])` to load data on mount. After navigating to a create/edit screen and back, the list showed stale data because React Navigation keeps stack screens mounted.
**Learning**: In React Navigation (expo-router), screens in a stack remain mounted when pushing child screens. `useEffect(fn, [])` runs once on mount and never re-fires on back-navigation. `useFocusEffect` from expo-router fires every time the screen gains focus, ensuring data refresh after create/edit/delete operations on child screens.
**Action**: On any list screen that pushes to create/edit child screens, use `useFocusEffect(useCallback(() => { loadData(); }, []))` instead of `useEffect` for the initial data fetch. This ensures the list reflects changes made on child screens without manual invalidation.
**Tags**: expo-router, react-navigation, usefocuseffect, useeffect, screen-mount, data-refresh, crud, list-screen

### Soft-Delete Requires LEFT JOIN Audit on All Existing Queries
**Source**: BLD-3 — Custom Exercises CRUD (Phase 9)
**Date**: 2026-04-13
**Context**: Adding soft-delete (`deleted_at` column) to the exercises table required updating `getAllExercises()` with `WHERE deleted_at IS NULL`. However, other queries (`getPersonalRecords`, `getWorkoutCSVData`) used `INNER JOIN exercises` — which silently dropped rows referencing soft-deleted exercises.
**Learning**: Adding soft-delete to a table cascades beyond the table's own queries. Every existing INNER JOIN on that table becomes a silent data-loss vector: rows in dependent tables (workout_sets, CSV exports) disappear from results when the joined exercise is deleted. The fix is LEFT JOIN + COALESCE for a fallback display value (e.g., "Deleted Exercise").
**Action**: When adding soft-delete to any table, audit ALL queries across the codebase that JOIN to that table. Change INNER JOIN → LEFT JOIN and add COALESCE for display columns. Search the codebase for `JOIN <table_name>` to find all affected queries before marking the feature complete.
**Tags**: sqlite, soft-delete, left-join, inner-join, data-integrity, migration, crud, query-audit

### Derive Shared Display Flags Before Rendering Concurrent Async Results
**Source**: BLD-1 — Exercise History & Performance Trends (Phase 12)
**Date**: 2026-04-13
**Context**: The exercise detail screen fires three independent async fetches (records, chart, history). The `is_bodyweight` flag comes from the records fetch, but chart rendering starts independently. If the chart completes before records, bodyweight exercises briefly render with weight labels.
**Learning**: When multiple parallel fetches return data that shares a display dependency (e.g., unit labels, layout mode), the fetch that finishes first may render with incorrect assumptions. The chart data query used a self-sufficient fallback (try weight data → fall back to reps), but the surrounding UI labels still depended on a flag from a separate fetch.
**Action**: When parallel fetches control a shared display mode, either (1) chain the dependent fetch after the flag-providing one, (2) derive the flag from the data itself at render time (`chart[0].value > 100 → likely weight`), or (3) show a loading placeholder for all dependent sections until the flag-providing fetch completes. Document the dependency in a comment near the fetch declarations.
**Tags**: react, async, concurrent-fetch, race-condition, display-dependency, loading-state, bodyweight

### Nested Subquery for "Last N in Chronological Order" in SQLite
**Source**: BLD-1 — Exercise History & Performance Trends (Phase 12)
**Date**: 2026-04-13
**Context**: The performance chart needs the last 20 sessions in ascending date order for left-to-right plotting. A single `ORDER BY date ASC LIMIT 20` returns the oldest 20 sessions instead of the most recent 20.
**Learning**: SQLite (and SQL in general) applies LIMIT before any outer ordering. To get the N most recent rows in ascending order, wrap a descending-limited subquery in an outer `SELECT * FROM (...) ORDER BY date ASC`. This two-level query pattern is required whenever a chart, timeline, or export needs the "tail" of a time series in forward order.
**Action**: For chart/timeline data, use `SELECT * FROM (SELECT ... ORDER BY date DESC LIMIT ?) ORDER BY date ASC`. Never use a single `ORDER BY ASC LIMIT` — it returns the head, not the tail. Add a comment explaining the nested ordering to prevent future "simplification" that breaks the query.
**Tags**: sqlite, sql, subquery, ordering, limit, chart-data, time-series, pagination

### Wrap Multi-Step State Machine Mutations in Transactions
**Source**: BLD-7 — Workout Programs / Training Plans (Phase 11)
**Date**: 2026-04-13
**Context**: The `advanceProgram` function performed INSERT (program_log) → SELECT (program_days) → UPDATE (programs.current_day_id) sequentially without a transaction. An app crash between the INSERT and UPDATE would create a log entry without advancing the pointer, corrupting cycle count calculations.
**Learning**: Multi-step state machine mutations — where step N depends on step N-1 or where partial completion leaves data inconsistent — require transactional wrapping for atomicity. This is distinct from bulk-insert transactions (which are primarily for performance): state machine transactions prevent logically inconsistent intermediate states that no retry can fix.
**Action**: When a function performs multiple related writes that together represent a single state transition (log + advance, delete + reassign pointer, deactivate-all + activate-one), wrap them in `withTransactionAsync`. During code review, look for sequential `runAsync` calls that touch related tables — each is a candidate for transactional wrapping.
**Tags**: expo-sqlite, transactions, state-machine, atomicity, data-integrity, multi-step-mutation

### Buffer Text Inputs — Save on Blur, Not on Keystroke
**Source**: BLD-14 — Per-Set Notes & RPE Tracking (Phase 13)
**Date**: 2026-04-13
**Context**: A text input for per-set notes called `updateSetNotes` (a SQLite write) and `load()` (a full data reload) on every keystroke via `onChangeText`. This caused N database writes per second while typing and unnecessary full re-renders on each character.
**Learning**: When a text input writes to a persistent store (SQLite, API, AsyncStorage), binding the write to `onChangeText` creates excessive I/O and re-renders. The correct pattern is: buffer the text in local component state via `onChangeText`, then persist via `onBlur` or an explicit save action.
**Action**: For any text input backed by a database write, use local `useState` for the input value and only call the persistence function on `onBlur`. Never bind `onChangeText` directly to a database write or data-reload function.
**Tags**: react-native, text-input, onblur, debounce, sqlite, performance, forms

### PRAGMA table_info Guard for SQLite Column Migrations
**Source**: BLD-6 — Superset & Circuit Training Support (Phase 14)
**Date**: 2026-04-13
**Context**: Adding `link_id` and `link_label` columns to `template_exercises` and `link_id`/`round` to `workout_sets` required ALTER TABLE ADD COLUMN. SQLite does not support `ADD COLUMN IF NOT EXISTS`, so running the migration twice would crash on duplicate column errors.
**Learning**: Use `PRAGMA table_info(<table>)` to retrieve the current column list, then conditionally `ALTER TABLE ADD COLUMN` only when the column is absent. This makes migrations idempotent — safe to run on both fresh installs and upgrades. The pattern: query columns into an array, check with `.some(c => c.name === '<col>')`, and skip the ALTER if the column already exists.
**Action**: For every SQLite schema migration that adds columns, wrap it in a PRAGMA table_info guard. Never use raw ALTER TABLE ADD COLUMN without checking column existence first. Group related column additions under a single PRAGMA call to reduce queries.
**Tags**: expo-sqlite, sqlite, migration, alter-table, pragma, idempotent, schema-evolution

### Platform-Aware Graceful Degradation for expo-sqlite Web
**Source**: BLD-28 — FIX: expo-sqlite web crash on localhost:8081
**Date**: 2026-04-13
**Context**: Even with correct COOP/COEP headers, OPFS-backed expo-sqlite can fail on web in environments that restrict storage APIs (incognito mode, certain browsers, restrictive CSP). The app crashed entirely with no recovery path.
**Learning**: When a storage mechanism is platform-conditional, catch the failure at init and fall back to a degraded mode rather than crashing the app. For expo-sqlite web: catch OPFS errors, fall back to `:memory:` database, export an `isMemoryFallback()` flag, and show a dismissable banner warning users that data won't persist. On native platforms, propagate errors normally since OPFS failures are unexpected there.
**Action**: For any cross-platform storage init, wrap in platform-specific try/catch: `if (Platform.OS === "web") { try primary → catch → fallback }`. Export a flag indicating degraded mode. Show a non-blocking user warning. Never silently degrade without informing the user.
**Tags**: expo-sqlite, web, opfs, graceful-degradation, platform-specific, fallback, memory-database, cross-platform

### Bundle Static Reference Data as JSON for Read-Only Datasets
**Source**: BLD-15 — Built-in Food Database (Phase 20)
**Date**: 2026-04-13
**Context**: The food database feature needed 150+ food items with macros. The choice was between loading them into SQLite or bundling as a JSON file filtered in-memory.
**Learning**: For read-only reference datasets under ~10MB, bundling as a JSON file and filtering in-memory with `.filter()` is faster, simpler, and avoids schema complexity compared to SQLite. The data loads once via `require()`, needs no migrations, and search/category filtering operates on the in-memory array. Reserve SQLite for user-generated data that requires CRUD, persistence, and relational queries.
**Action**: When adding reference data (food databases, exercise libraries, unit tables), evaluate size and mutability first. If <10MB and read-only, use a JSON file in `assets/data/` with an in-memory search function. If the data needs user edits, favorites, or relational joins, use SQLite.
**Tags**: json, static-data, in-memory, performance, data-architecture, sqlite-alternative, reference-data

### Set keyboardShouldPersistTaps on FlatList with Embedded TextInputs
**Source**: BLD-15 — Built-in Food Database (Phase 20)
**Date**: 2026-04-13
**Context**: The food database screen had a search TextInput in the FlatList header and expandable items with serving multiplier inputs. Tapping an item to expand it dismissed the keyboard, requiring the user to re-tap the search field.
**Learning**: By default, React Native FlatList dismisses the keyboard when the user taps outside a TextInput. When a list combines search inputs with interactive items (expandable rows, buttons, secondary inputs), this creates a frustrating UX where every non-input tap forces keyboard dismissal. Setting `keyboardShouldPersistTaps="handled"` keeps the keyboard open unless the tap explicitly blurs it.
**Action**: On any FlatList or ScrollView that contains both TextInput fields and interactive list items, set `keyboardShouldPersistTaps="handled"`. Test the flow: type in search → tap list item → verify keyboard stays open.
**Tags**: react-native, flatlist, keyboard, textinput, ux, keyboardshouldpersisttaps, scroll-view

### Seed Data Pivot via Soft-Delete + Idempotent Re-Seed
**Source**: BLD-30 — Strategic Pivot: Cable Machine + Voltra Exercise Database (Phase 22)
**Date**: 2026-04-14
**Context**: FitForge pivoted from a generic exercise library (70 exercises) to a cable-machine-focused database (54 Voltra exercises). Old exercises were referenced by existing user sessions and templates, so hard-deleting them would break historical data.
**Learning**: When replacing seed/reference data entirely, soft-delete old records (UPDATE SET deleted_at = ? WHERE is_custom = 0) rather than hard-deleting. This preserves foreign-key references in user data (sessions, templates). Use an idempotent check (SELECT COUNT WHERE is_new = 1 AND deleted_at IS NULL) to prevent double-execution on app restart. Show orphaned (soft-deleted) entities with a visual marker in the UI (e.g., "(removed)" suffix in italic/gray) and offer a Replace action.
**Action**: When a product pivot requires replacing seed data: (1) add a deleted_at column if not present, (2) soft-delete old seed rows only (is_custom = 0 guard), (3) insert new seed data with INSERT OR IGNORE, (4) gate the entire migration with an idempotent count check, (5) update all UI lists to handle soft-deleted references gracefully.
**Tags**: sqlite, data-migration, soft-delete, seed-data, idempotent, product-pivot, reference-data

### Version-Based Seed Data Evolution with app_settings Table
**Source**: BLD-32 — Starter Workout Templates & Program (Phase 23)
**Date**: 2026-04-14
**Context**: FitForge needed to ship 6 starter workout templates and 1 program as pre-loaded content. The seed data must be idempotent (safe on re-open) and evolvable (v2 can add/modify starters without re-seeding unchanged data).
**Learning**: Store a `starter_version` integer in an `app_settings` key-value table. On each `initDatabase()`, compare the stored version against the code constant `STARTER_VERSION`. If stored >= current, skip entirely. If lower (or absent), run the full seed inside a transaction using `INSERT OR IGNORE` for each row. After success, upsert the version key. This is strictly better than a COUNT-based idempotent check (BLD-30 pattern) when seed data will evolve across releases — bumping the version constant triggers a re-seed that only inserts missing rows.
**Action**: For preset/seed data expected to grow over app versions: (1) create an `app_settings (key TEXT PRIMARY KEY, value TEXT)` table, (2) define a `SEED_VERSION` constant in code, (3) gate the entire seed block with a version comparison, (4) use `INSERT OR IGNORE` for all rows, (5) upsert the version key after the transaction commits. Reserve the BLD-30 COUNT-based check for one-time migrations that won't evolve.
**Tags**: sqlite, seed-data, versioning, idempotent, app-settings, migration, starter-content

### Deep-Copy Entities with Internal Grouping References (link_id Remapping)
**Source**: BLD-32 — Starter Workout Templates & Program (Phase 23)
**Date**: 2026-04-14
**Context**: Starter templates are read-only. Users duplicate them to create editable copies. Templates contain exercises that may be grouped via a shared `link_id` (supersets). A naive copy that preserves original `link_id` values would silently link the copy's exercises to the original template's superset groups.
**Learning**: When deep-copying an entity whose children reference each other through a shared grouping key (like `link_id` for supersets), each unique grouping key in the source must be mapped to a new unique key in the copy. Use a `Map<string, string>` to track old-to-new mappings: on first encounter of a link_id, generate a new UUID and store the mapping; on subsequent encounters of the same link_id, reuse the mapped value. This preserves the grouping structure while ensuring complete isolation from the source entity.
**Action**: When implementing entity duplication for structures with internal grouping references: (1) generate new IDs for all child records, (2) build a `linkMap` for grouping keys — `if (!linkMap.has(oldKey)) linkMap.set(oldKey, newUUID())`, (3) assign `linkMap.get(oldKey)` to each child's grouping field, (4) wrap in a transaction to ensure atomicity, (5) verify the copy's groups are independent by checking no link_ids are shared with the source.
**Tags**: deep-copy, duplication, link-id, superset, grouping, uuid, reference-remapping, transaction

### Splash Screen Gate + Redirect for Conditional First-Launch Flow
**Source**: BLD-35 — Implement: Onboarding & Quick Start Flow (Phase 24)
**Date**: 2026-04-14
**Context**: FitForge needed to show a 3-step onboarding flow on first launch only. The root layout must decide between onboarding vs. main app before rendering, without flashing the wrong UI.
**Learning**: In Expo Router, gate conditional navigation behind the splash screen: call `SplashScreen.preventAutoHideAsync()` at module scope, resolve the async check (e.g., `isOnboardingComplete()`) inside `useEffect`, then set state and call `SplashScreen.hideAsync()`. Render `<Redirect href="/onboarding/welcome" />` inside the normal `<Stack>` tree — do NOT conditionally swap navigators. Use `router.replace()` between onboarding steps to prevent back navigation. Wrap the onboarding stack in an `ErrorBoundary` with a "Skip to App" fallback that marks onboarding complete.
**Action**: For any conditional first-launch flow (onboarding, auth gate, migration): (1) `preventAutoHideAsync()` at module level, (2) async check in root layout `useEffect`, (3) `hideAsync()` only after state resolves, (4) use `<Redirect>` component for redirection — not conditional navigator rendering, (5) `router.replace()` for all internal transitions, (6) wrap in ErrorBoundary with skip-to-app fallback.
**Tags**: expo-router, splash-screen, onboarding, redirect, conditional-navigation, first-launch, error-boundary

### Pair Color with a Secondary Visual Channel for Category Distinction
**Source**: BLD-65 — Muscle Illustration for Exercises (Phase 26)
**Date**: 2026-04-14
**Context**: The MuscleMap component needed to distinguish primary muscles (red) from secondary muscles (orange) on SVG body diagrams. Relying on color alone would fail for color-blind users who cannot distinguish red from orange.
**Learning**: Color alone is insufficient to communicate categorical differences in visualizations. The implementation used solid strokes (width 2) for primary muscles and dashed strokes ("4,3" dasharray, width 1) for secondary muscles, providing a second visual channel independent of color perception. This approach satisfies WCAG 1.4.1 (Use of Color) without requiring pattern fills.
**Action**: When any component uses color to distinguish categories (charts, status indicators, heatmaps, annotated diagrams), always add a non-color visual distinction: stroke style (solid vs dashed), fill pattern, opacity level, shape, or icon. Test by viewing the component in grayscale — categories should still be distinguishable.
**Tags**: a11y, wcag, color-blind, svg, react-native-svg, dual-channel, stroke-style, visualization, muscle-map

### Use FlatList with keyExtractor — Never ScrollView + .map() for Dynamic Lists
**Source**: BLD-62 — Weekly Workout Schedule & Adherence Tracking (Phase 25)
**Date**: 2026-04-14
**Context**: The schedule screen's template picker rendered templates using ScrollView + .map(). The automated reviewer flagged this as a deterministic-check failure because it prevents list virtualization, lacks stable keys, and bypasses React's reconciliation optimizations.
**Learning**: ScrollView + .map() is an anti-pattern for any list backed by dynamic data (database queries, API responses). It renders all items simultaneously — no virtualization, no recycling, no built-in key tracking. FlatList with a stable keyExtractor and memoized renderItem handles all three automatically, and is the canonical list component in React Native.
**Action**: Always use FlatList (or SectionList) for lists rendered from dynamic data. Reserve ScrollView for static, fixed-size content (forms, settings screens). When reviewing PRs, flag any ScrollView + .map() pattern rendering database results as a MAJOR finding.
**Tags**: react-native, flatlist, scrollview, performance, virtualization, anti-pattern, list-rendering, review-checklist

### Set accessibilityViewIsModal on Overlay Pickers and Custom Modals
**Source**: BLD-62 — Weekly Workout Schedule & Adherence Tracking (Phase 25)
**Date**: 2026-04-14
**Context**: The template picker overlay in the schedule screen was implemented as a positioned View rather than a native Modal. Screen readers could navigate to background content behind the overlay, breaking the expected modal interaction model. The reviewer flagged this as a MAJOR a11y issue.
**Learning**: Custom overlays (pickers, bottom sheets, action menus) that visually cover background content must also logically trap screen reader focus. Without accessibilityViewIsModal={true}, VoiceOver and TalkBack will announce background elements, confusing users. React Native's Modal component handles this automatically; custom overlays need it set explicitly.
**Action**: For any overlay component that is NOT using React Native's Modal, set accessibilityViewIsModal={true} on the overlay container View. Alternatively, use the built-in Modal component which handles focus trapping natively. During PR review, check that every overlay/picker/bottom-sheet either uses Modal or has accessibilityViewIsModal.
**Tags**: a11y, accessibility, modal, overlay, picker, voiceover, talkback, screen-reader, focus-trap, react-native
