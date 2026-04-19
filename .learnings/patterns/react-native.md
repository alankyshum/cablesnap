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

### Use Inner Pressable Instead of Card onPress When Card Contains Interactive Children (Web)
**Source**: BLD-69 — FIX: Nested button hydration error on web (BLD-64)
**Date**: 2026-04-14
**Context**: On web, react-native-paper's Card with onPress renders as a button element. Chip components (even without onPress) and IconButton components inside the Card also render as button, creating invalid nested button HTML that causes hydration errors.
**Learning**: React Native Paper components that inherit from TouchableRipple (including Card, Chip, IconButton, DataTable.Row) render as button on web. Any nesting of these produces invalid HTML. Non-interactive Chip used as labels should be replaced with plain View+Text badges. Cards containing IconButton or Menu triggers must not use onPress on the Card itself.
**Action**: When a Card contains interactive children (IconButton, Menu, or any pressable): (1) remove onPress from Card, (2) wrap the non-interactive content area in a Pressable with the original handler, (3) keep interactive children (IconButton, Menu) as siblings outside the Pressable but inside Card.Content. For display-only labels, replace Chip with View+Text styled to match. Before submitting web-targeting PRs, search for Card with onPress that also contain IconButton, Chip, or Menu as descendants.
**Tags**: react-native-paper, web, hydration, button-nesting, pressable, card, chip, html-validation, cross-platform

### Progressive Content Truncation for URL-Length-Limited Payloads
**Source**: BLD-70 — Implement: In-App Feedback & Crash Reporting (Phase 27)
**Date**: 2026-04-14
**Context**: Building pre-filled GitHub issue URLs via `Linking.openURL()` for in-app bug/feature/crash reporting. The URL body (containing error logs, interaction history, diagnostics) often exceeds browser/OS URL length limits (~8000 chars after percent-encoding).
**Learning**: Implement multi-phase graceful degradation when fitting dynamic content into length-limited containers: (1) strip verbose parts first (stack traces), (2) remove entire sections (error logs), (3) trim individual items (interactions), (4) truncate the description. Each phase checks whether the payload fits before proceeding. Always append a truncation notice and provide a separate Share fallback with full untruncated content.
**Action**: When constructing URLs with dynamic body content (pre-filled forms, deep links, `mailto:` links), implement priority-ordered content reduction rather than naive string slicing. Define a `MAX_URL` constant, build a `check()` helper that measures the encoded URL length, and degrade sections in order of decreasing verbosity. Always pair URL-based submission with a Share/export fallback that includes the complete payload.
**Tags**: url-length, truncation, linking, github-issues, mobile, expo, graceful-degradation, feedback

### Integer Arithmetic for Precise Decimal Calculations
**Source**: BLD-84 — Plate Calculator (Phase 31)
**Date**: 2026-04-14
**Context**: The plate calculator needed precise weight arithmetic across kg/lb unit systems. JavaScript floating-point produces rounding errors (e.g., 0.1 + 0.2 !== 0.3) that compound through plate-selection iterations, causing incorrect remainder calculations and wrong plate counts.
**Learning**: Convert decimals to integers using a fixed scale multiplier before performing arithmetic: `toMicro(v) = Math.round(v * SCALE)`, `fromMicro(v) = v / SCALE`. All intermediate calculations (subtraction, comparison, modulo) operate on integers, eliminating floating-point drift. Convert back to decimals only for display.
**Action**: For any feature involving decimal arithmetic (weight calculators, macro portions, unit conversions, currency), implement a micro-unit conversion layer. Choose a scale factor large enough to cover the smallest decimal precision needed (e.g., 1000000 for six decimal places). Perform all math in integer space and convert back only at the output boundary.
**Tags**: javascript, floating-point, precision, integer-arithmetic, calculator, unit-conversion, math, defensive-programming

### Animated.Value with useRef for Non-Interactive Transient Animations
**Source**: BLD-23 — Session UX Enhancements (Phase 16)
**Date**: 2026-04-14
**Context**: The rest timer card needed a color-flash animation on timer expiry — a brief, non-user-controlled visual pulse. Storing the animation value in useState would trigger re-renders on every animation frame, causing performance jank during an already CPU-intensive timer callback.
**Learning**: For transient, non-interactive animations (flashes, pulses, fades), store the Animated.Value in a useRef — not useState. This persists the animation instance across renders without triggering re-renders. Use Animated.timing().start() to trigger and clean up in the useEffect return. Note: useNativeDriver false is required for backgroundColor animations since the native driver only supports transform and opacity.
**Action**: When adding brief visual feedback animations in React Native: (1) create the value with useRef(new Animated.Value(0)).current, (2) trigger with Animated.timing with toValue 1 and duration 300, (3) interpolate in style with inputRange [0,1] and outputRange [baseColor, flashColor], (4) reset in cleanup. Never use useState for animation values.
**Tags**: react-native, animation, useref, animated-value, performance, transient-ui, useNativeDriver, color-flash

### hitSlop for Invisible Touch Target Expansion
**Source**: BLD-23 — Session UX Enhancements (Phase 16)
**Date**: 2026-04-14
**Context**: Step buttons (plus/minus 2.5kg) flanking the weight input were visually 24x24dp icons to fit the compact layout. The 48x48dp minimum accessible touch target requirement would force oversized buttons that break the UI design.
**Learning**: React Native's hitSlop prop on Pressable/TouchableOpacity expands the touchable area beyond the component's visual bounds without affecting layout or rendering. Setting hitSlop with 12 on each side on a 24dp element creates a 48dp touch target invisibly. This separates visual size from interaction size — a distinction unique to React Native with no CSS equivalent.
**Action**: When a Pressable element is visually smaller than 48x48dp, add hitSlop with padding values that bring the total to at least 48dp per axis. Prefer hitSlop over padding/margin because it does not shift surrounding elements. During a11y review, check that every icon-only button either has dimensions of at least 48dp or uses hitSlop to reach that threshold.
**Tags**: react-native, accessibility, a11y, touch-target, hitslop, pressable, compact-ui, icon-button, 48dp

### Pure State Machine Guard Clauses Create Silent UI Failures
**Source**: BLD-88 — Interval Workout Timers (Phase 32)
**Date**: 2026-04-14
**Context**: The timer state machine's `start()` function had a guard clause `if (status === "completed") return state` that silently rejected the call. The UI's `handleStart` offered a "Start" button in the completed state. Pressing it invoked `start()`, which returned unchanged state — the button did nothing with no user feedback. A unit test verified "does not start if completed," enshrining the bug as expected behavior.
**Learning**: When a pure state machine function silently rejects a state transition (returns unchanged state instead of throwing), the UI must either hide/disable the corresponding control in that state or compose the necessary transitions (e.g., `reset` then `start`). Tests that assert "does nothing" for a given state can mask a contract mismatch between the state machine and UI layer.
**Action**: For every state machine guard clause that returns unchanged state, verify the UI either hides/disables the control in that state OR composes a valid transition chain. During code review, flag any "does nothing in state X" test and cross-check that the UI prevents invoking the function in state X.
**Tags**: state-machine, ui-contract, guard-clause, silent-failure, pure-functions, testing, ux

### Lazy-Load Audio with replayAsync for Repeated Sound Effects
**Source**: BLD-90 — Audio Cues for Timers (Phase 33)
**Date**: 2026-04-14
**Context**: Timer screens need rapid, repeated audio cues (tick, beep, complete) that fire on state transitions. Creating a new Audio.Sound per play causes latency and memory leaks. Using playAsync on an already-playing sound throws errors.
**Learning**: Pre-load all sounds lazily on first play into a module-level Map singleton, guarded by a boolean loading flag to prevent concurrent init. Use replayAsync() (not playAsync()) for repeat playback — it resets position and plays without requiring stop/unload. Swallow all errors since audio is non-critical UX. Set playsInSilentModeIOS: false to respect the hardware silent switch. Clean up with unloadAsync() on each sound in a useFocusEffect cleanup return.
**Action**: When adding sound effects with expo-av: (1) define a typed cue union and a SOURCES record mapping cues to require() assets, (2) lazy-load all sounds into a module-level Map on first play() call, (3) always use replayAsync() for playback, (4) wrap every async audio call in try/catch that swallows errors, (5) call unload() in useFocusEffect cleanup or useEffect cleanup to release native resources.
**Tags**: expo-av, audio, sound-effects, lazy-loading, singleton, replayAsync, timer, cleanup, react-native

### Separate Additive Seed Data into Dedicated Module Files
**Source**: BLD-99 — Scrape & seed cable + bodyweight exercises from MuscleWiki
**Date**: 2026-04-15
**Context**: FitForge needed to expand its exercise library from 54 Voltra-specific exercises to include 65 community-sourced cable and bodyweight exercises from an external source.
**Learning**: When adding bulk seed data from a new source, create a dedicated module file (e.g., `seed-community.ts`) that exports the new data, then import it into the main seed file. This keeps the original seed data untouched, makes data provenance clear (Voltra vs community), and prevents merge conflicts when multiple sources contribute data.
**Action**: When expanding seed/reference data from a new source, create a new file named `seed-<source>.ts`, export the array, and merge it into the main seed array via import. Never inline new-source data into an existing seed file.
**Tags**: seed-data, data-management, file-organization, module-separation, exercise-library

### accessibilityState for Collapsible Section Toggles
**Source**: BLD-114 — Workout Calendar & Streak Heatmap
**Date**: 2026-04-15
**Context**: A heatmap section had a collapse/expand toggle (Pressable with label and role) but no accessibilityState. QA review flagged this as MAJOR — screen readers could not announce whether the section was expanded or collapsed.
**Learning**: React Native's `accessibilityState` prop with `{ expanded: boolean }` is required on any collapsible section's toggle control. Without it, screen readers can invoke the toggle but provide no feedback about the current state. accessibilityLabel and accessibilityRole alone are insufficient for stateful controls.
**Action**: On every Pressable/TouchableOpacity that toggles a collapsible section, add `accessibilityState={{ expanded: isExpanded }}`. During a11y review, check that all expand/collapse controls expose their current state — not just their label and role.
**Tags**: react-native, accessibility, a11y, accessibilityState, collapsible, expand-collapse, screen-reader

### RN accessibilityRole Does Not Support 'grid' — Use 'summary'
**Source**: BLD-114 — Workout Calendar & Streak Heatmap
**Date**: 2026-04-15
**Context**: The heatmap grid required `accessibilityRole="grid"` per the spec, but React Native's typed roles do not include 'grid'. Using `as any` to force it triggered ESLint warnings.
**Learning**: React Native's `accessibilityRole` type is a closed union that does not include all ARIA/web roles. 'grid' is not supported. The closest valid alternative is 'summary' for data visualization containers. Forcing unsupported roles with `as any` works at runtime but creates type-safety and lint issues.
**Action**: When implementing grid-like data visualizations in React Native, use `accessibilityRole="summary"` instead of 'grid'. Add an `accessibilityLabel` that describes the grid's content. If the spec requires 'grid', document the adaptation with a code comment explaining the RN limitation.
**Tags**: react-native, accessibility, a11y, accessibilityRole, grid, type-safety, aria

### Proactive Interaction History for Crash Diagnostics
**Source**: BLD-63 — Crash Reporting infrastructure
**Date**: 2026-04-15
**Context**: Implementing crash/bug reporting revealed that error logs alone are insufficient for diagnosis. Without knowing what the user was doing before the crash, error logs are decontextualized stack traces.
**Learning**: Effective crash reporting requires proactive context collection, not reactive. A ring buffer of the last 10 user interactions (navigation events, form submissions, button presses) stored in persistent storage provides the "what was the user doing" context that transforms a stack trace into a diagnosable bug report.
**Action**: Implement an event bus that logs user interactions to AsyncStorage or SQLite as a circular buffer (overwrite oldest on new entry). Attach this interaction history alongside error logs and system info when generating crash reports. Include: screen name, action type, timestamp, and relevant parameters.
**Tags**: crash-reporting, error-boundary, diagnostics, user-context, ring-buffer, debugging

### Pure Calculation Module Pattern for Domain Logic
**Source**: BLD-97, BLD-107 — Intelligent nutrition targets with profile-based recommendations
**Date**: 2026-04-15
**Context**: Implementing BMR/TDEE/macro calculations required separating pure math from UI and storage concerns. The calculations (Mifflin-St Jeor formula) needed unit testing against reference values, while UI needed auto-population from existing user data.
**Learning**: Domain calculation logic (BMR, TDEE, macros, 1RM estimation, periodization) should live in a pure `lib/` module with zero React/storage dependencies. This enables: (1) unit testing with reference values, (2) reuse across multiple screens, (3) edge case handling (calorie floors, extreme inputs) tested independently of UI state.
**Action**: Extract any domain calculation into `lib/<domain>-calc.ts` as pure functions. Auto-populate input fields from existing data (e.g., latest body_weight entry) but allow manual override. Store calculated results as defaults that users can modify. Enforce safety floors (e.g., 1200 kcal minimum) with user-visible warnings.
**Tags**: architecture, pure-functions, domain-logic, testability, nutrition, calculation, separation-of-concerns

### Deterministic Multi-Pass Name Matching for Data Import
**Source**: BLD-120 — Import Workout Data from Strong CSV
**Date**: 2026-04-15
**Context**: Importing workout data from Strong required mapping exercise names between two apps with different naming conventions (Strong uses "Exercise (Equipment)" format, FitForge uses "Equipment Exercise"). Fuzzy matching (Levenshtein) was rejected due to unpredictable results and testing difficulty.
**Learning**: A deterministic multi-pass matching strategy produces predictable, fully testable results for cross-app data import. The effective pass order is: (1) exact case-insensitive match, (2) normalize + extract parentheticals and rearrange (e.g., "Bench Press (Barbell)" → try "Barbell Bench Press"), (3) substring containment (either direction), (4) hardcoded alias lookup table for common abbreviations. Each pass has a clear confidence level (exact/possible/none) enabling grouped UX.
**Action**: When building data import from another app, implement matching as ordered passes with decreasing confidence rather than a single fuzzy algorithm. Classify results by confidence level and present grouped in the UI (auto-mapped / needs confirmation / will create new). This pattern scales to new import sources by adding source-specific normalization passes without changing the core architecture.
**Tags**: import, data-migration, name-matching, deterministic, csv, exercise, cross-app, architecture

### Directory Route Grouping for Multi-Screen Feature Areas
**Source**: BLD-123 — Progress Photos — Visual Body Transformation Tracking
**Date**: 2026-04-15
**Context**: Adding Progress Photos required 4 new screens (gallery, compare, goals, measurements) under the `body/` route. Initially, each screen was registered individually in the root `_layout.tsx` with separate `Stack.Screen` entries, cluttering the root layout.
**Learning**: When a feature area grows to 3+ screens sharing a common route prefix, create a directory layout (`app/<area>/_layout.tsx`) with its own Stack navigator. Register the entire group as a single headerless entry in the root layout (`name="<area>"`, `headerShown: false`). This keeps the root layout clean, co-locates feature navigation config, and enables feature-specific header theming.
**Action**: When adding a new screen to a route group that already has 2+ siblings, create `app/<area>/_layout.tsx` with a Stack navigator registering all screens. Replace individual root-level `Stack.Screen` entries with a single group entry. Move header configuration (title, style, tintColor) into the directory layout.
**Tags**: expo-router, navigation, directory-routes, layout, architecture, stack-navigator

### Filesystem + SQLite Hybrid for User Media Management
**Source**: BLD-123 — Progress Photos — Visual Body Transformation Tracking
**Date**: 2026-04-15
**Context**: Progress photos needed persistent storage with gallery performance, soft-delete with undo, and eventual permanent cleanup. Storing photos as blobs in SQLite would degrade query performance; storing metadata on filesystem would lose queryability.
**Learning**: Store large binary assets (photos, audio, documents) on the filesystem in a dedicated app-sandbox directory, with all metadata in SQLite. This hybrid gives fast gallery queries (SQLite) with efficient storage (filesystem). Critical implementation details: (1) generate thumbnails at capture time for gallery performance, (2) soft-delete via `deleted_at` column with time-based permanent cleanup (30 days), (3) delete files AFTER DB row removal to prevent orphan DB records pointing to missing files, (4) run orphan file cleanup on app startup to catch files not tracked in DB.
**Action**: For any feature handling user-generated media: create a dedicated `documentDirectory` subdirectory, store metadata in SQLite with file_path references, generate thumbnails at capture, implement soft-delete + timed permanent cleanup, and add startup routines for both expired-soft-delete cleanup and orphan file cleanup. Always delete the DB row first, then the file.
**Tags**: media, photos, filesystem, sqlite, soft-delete, cleanup, thumbnails, storage, architecture

### Cascading Multi-Pass Entity Matching for Data Import
**Source**: BLD-120 — Import Workout Data from Strong CSV
**Date**: 2026-04-15
**Context**: Importing workouts from Strong required matching exercise names like "Bench Press (Barbell)" to FitForge's "Barbell Bench Press." Simple exact matching misses most entries. Fuzzy search (e.g., Levenshtein) produces unpredictable false matches.
**Learning**: A deterministic 4-pass cascade provides reliable entity matching with clear confidence levels: (1) exact case-insensitive match, (2) normalize + strip parentheticals (e.g., "Bench Press (Barbell)" → "bench press"), (3) substring containment, (4) alias table lookup. Each pass returns a confidence level (exact/high/medium/low) so the UI can flag uncertain matches for user review. Deterministic passes avoid the ambiguity of distance-based fuzzy matching.
**Action**: For any data import feature that maps external entity names to internal entities, implement a cascading matcher with decreasing confidence. Start with exact match, then progressively relax (normalize, substring, alias table). Return confidence levels so the import UI can highlight uncertain matches. Maintain an alias table for common abbreviations (e.g., "BB" → "Barbell", "DB" → "Dumbbell").
**Tags**: data-import, entity-matching, csv, strong, exercise, fuzzy-matching, cascading-matcher, import-wizard

### Retroactive Feature Evaluation with Silent-Earn UX
**Source**: BLD-137 — Achievement & Milestone System
**Date**: 2026-04-15
**Context**: FitForge shipped an achievement system to users who already had workout history. Naively evaluating achievements on first launch would trigger dozens of "Achievement Unlocked!" notifications at once — a terrible UX.
**Learning**: When launching a feature that retroactively analyzes historical data (achievements, streaks, milestones, badges), the first evaluation must distinguish between "earned now" and "already earned." Evaluate silently on first open, mark all qualifying items as already-earned, and show a single summary banner ("We found N achievements from your history") instead of individual unlock notifications.
**Action**: For any feature that evaluates historical user data on first launch: (1) run the evaluation silently without triggering per-item animations/haptics/notifications, (2) persist results with the current timestamp, (3) show a single aggregated banner ("We found N items"), (4) only trigger individual unlock UX for items earned in future sessions.
**Tags**: retroactive, achievements, gamification, ux, first-launch, migration, silent-evaluation, banner

### Canonical Constants as UI Fallback for DB-Sourced Display Data
**Source**: BLD-186/187 — Starter workout cards showing empty names
**Date**: 2026-04-16
**Context**: Starter workout cards rendered blank because the DB rows had null/empty `name` values. The rendering code used `item.name` directly from the DB query result with no fallback.
**Learning**: When the same data exists in both the database and a canonical JS/TS constant (e.g., `STARTER_TEMPLATES`), the UI should use the constant as a fallback source. This provides resilience against DB corruption without masking the underlying issue — the repair logic fixes the root cause while the fallback ensures the UI never shows blank content to users.
**Action**: For any UI rendering of seeded/canonical data, use the pattern `canonicalSource?.field || dbRow.field` (e.g., `meta?.name || item.name`). This defense-in-depth approach prevents blank UI while the self-healing DB repair catches up. Apply this specifically to seeded data where a JS constant is the source of truth.
**Tags**: react-native, defense-in-depth, fallback, db-corruption, seed-data, ui-resilience, canonical-source

### Absolute-Positioned Bars Need Exported Height Constants for Content Padding
**Source**: BLD-205 — PLAN REVIEW: Floating navbar redesign (BLD-198)
**Date**: 2026-04-16
**Context**: Plan for a floating tab bar used `position: 'absolute'` for the bar to float over content. Tech lead review identified that React Navigation's `useBottomTabBarHeight()` returns 0 for absolutely-positioned bars, so all screen content would scroll behind the bar with no padding.
**Learning**: When a tab bar or any persistent UI element uses `position: 'absolute'`, the layout system does not reserve space for it. React Navigation's `useBottomTabBarHeight()` depends on the default layout-flow tab bar and returns 0 for custom absolute-positioned bars. Every scrollable screen must manually add bottom padding equal to the bar's height plus safe area insets.
**Action**: When implementing an absolute-positioned persistent bar, export a height constant (e.g., `FLOATING_TAB_BAR_HEIGHT`) and a hook (e.g., `useFloatingTabBarHeight()`) that includes safe area insets. Update ALL screens that scroll behind the bar in the PR same do not defer this to a follow-up, as every screen will have content hidden behind the bar until patched. 
**Tags**: react-native, position-absolute, tab-bar, content-padding, useBottomTabBarHeight, safe-area, layout, navigation

### Debounced Save Must Clear Timer on Unmount and Guard Async State
**Source**: BLD-183/188 — Settings body profile inline editing
**Date**: 2026-04-16
**Context**: Replacing a modal-based body profile editor with inline fields used `setTimeout`-based debounced save on blur. Code review flagged a MAJOR issue: the timer was never cleared on unmount, so the save callback could fire after the component unmounted and call state setters on an unmounted component.
**Learning**: Any `setTimeout` or `setInterval` used for debounced saves must be stored in a `useRef` and cleared in the component's unmount cleanup. Additionally, async operations triggered by the timer (DB writes, API calls) should guard state updates with an `isMounted` ref to prevent "setState on unmounted component" warnings and potential memory leaks.
**Action**: When implementing debounced auto-save: (1) store the timer ID in `useRef`, (2) clear it in `useEffect` cleanup (`return () => clearTimeout(ref.current)`), (3) create an `isMounted` ref set to `true` on mount and `false` on unmount, (4) guard all post-async `setState` calls with `if (isMounted.current)`. This pattern applies to any component that triggers delayed or async writes.
**Tags**: react, useref, settimeout, debounce, auto-save, unmount, cleanup, memory-leak, useeffect

### Use useLayout().horizontalPadding for All Screen-Level Horizontal Padding
**Source**: BLD-185 — Programme detail page padding & consistent container audit (GitHub #95)
**Date**: 2026-04-16
**Context**: An audit of all FitForge routes revealed 13 screens using hardcoded `padding: 16` instead of the responsive `useLayout()` hook. This caused inconsistent padding on medium/expanded window classes and made the programme detail page look misaligned.
**Learning**: FitForge's `lib/layout.ts` exports a `useLayout()` hook that returns `horizontalPadding` — a responsive value (16px compact, 24px medium, 32px expanded) based on Material 3 window size classes. All screen-level containers must use this value instead of hardcoded padding. When migrating, split `padding: N` into `paddingVertical: N` (keep static) plus `paddingHorizontal: layout.horizontalPadding` (responsive). Apply via `contentContainerStyle` on ScrollView/FlashList, or directly on the outer View's style.
**Action**: When creating or editing any screen component: (1) import `useLayout` from `lib/layout`, (2) call `const layout = useLayout()` in the component body, (3) apply `paddingHorizontal: layout.horizontalPadding` to the outermost scrollable container's `contentContainerStyle` or the root View's style. Never hardcode horizontal padding values on screen-level containers.
**Tags**: react-native, layout, padding, responsive, useLayout, material-design, window-class, consistency

### Flex Text Overflow: minWidth: 0 and Conditional flexBasis for Responsive Wrapping
**Source**: BLD-203 — Fix workout screen header overflow on mobile (GitHub #101)
**Date**: 2026-04-16
**Context**: The workout session header used `flex: 1` on the exercise name text container alongside action buttons in a `flexDirection: 'row'` layout. On mobile (390px), the text refused to shrink, cramming buttons into a narrow space instead of wrapping them to the next line.
**Learning**: In React Native (and CSS flexbox), flex items have an implicit `minWidth: auto`, meaning text containers won't shrink below their content's intrinsic minimum width — even with `flex: 1`. Setting `minWidth: 0` on the text container allows it to shrink properly. For responsive wrapping, combine this with a conditional `flexBasis: '100%'` style on compact layouts: when the text takes full width, sibling elements in a `flexWrap: 'wrap'` container automatically flow to the next line.
**Action**: When a flex row contains a text element and sibling buttons/icons that get cramped on narrow viewports: (1) add `minWidth: 0` to the text container's style, (2) create a compact variant style with `flexBasis: '100%', flexGrow: 0`, (3) apply the compact style conditionally via `layout.compact && styles.compactVariant`, (4) add `numberOfLines` with ellipsis for very long text.
**Tags**: react-native, flexbox, minWidth, flexBasis, responsive, overflow, wrapping, compact-layout, text-truncation

### Use @gorhom/bottom-sheet Instead of Modal for Expandable Drawers
**Source**: BLD-200/BLD-202 — Fix workout session details drawer
**Date**: 2026-04-16
**Context**: The exercise detail drawer used React Native's `<Modal>` with `maxHeight: 60%`, making it a fixed-height overlay that could not be dragged to expand or scroll. Users expected a pull-up sheet that fills the screen.
**Learning**: React Native's `<Modal>` component has no built-in gesture support — it is a fixed overlay. For drawers that need drag-to-expand, snap points, and scrollable content, `@gorhom/bottom-sheet` provides `<BottomSheet>` with configurable snap points (e.g., `["40%", "90%"]`), `<BottomSheetFlatList>` for virtualized scrolling inside the sheet, and `<BottomSheetBackdrop>` for tap-to-dismiss. Control visibility via `ref.current?.snapToIndex(0)` (open) and `ref.current?.close()` (close) with `index={-1}` as the hidden state.
**Action**: When implementing a detail panel, exercise drawer, or any expandable overlay, use `@gorhom/bottom-sheet` (already in FitForge deps) instead of `<Modal>`. Define snap points with `useMemo`, use `BottomSheetFlatList` instead of `FlatList` for scrollable content, and add a Jest mock at `__mocks__/@gorhom/bottom-sheet.js`.
**Tags**: react-native, bottom-sheet, modal, gorhom, gesture, snap-points, drawer, expandable, ui-pattern

### Session Mutations Must Preserve Completed Records as Immutable
BLD-240 **Source**: Smart Exercise Substitutions (Plan Review) 
**Date**: 2026-04-16
**Context**: The exercise substitution plan originally swapped ALL sets in a workout session to the new exercise. Quality Director flagged this as a critical data corruption issue — completed sets represent historical training data and must never be retroactively modified.
**Learning**: When mutating active session data (swapping exercises, reordering, bulk editing), only rows where `completed = 0` are mutable. Completed rows (`completed = 1`) are historical records and must be treated as immutable. This partition — pending vs completed — is the fundamental invariant for session data integrity. Violating it corrupts workout history, breaks progress tracking, and makes analytics unreliable.
**Action**: Any function that performs bulk updates on `workout_sets` within a session must include `WHERE completed = 0` (or equivalent). Provide an undo mechanism (e.g., 5s snackbar) for the mutable portion. Add a test that confirms completed sets are unchanged after the mutation. Apply this pattern to any future session-mutation feature (reorder, bulk edit, duplicate).
**Tags**: data-integrity, session-data, immutability, workout-sets, completed-records, undo, mutation-safety

### Mutation Features Require "Before State" Columns When History Views Exist
**Source**: BLD-241 — Smart Exercise Substitutions
**Date**: 2026-04-16
**Context**: The exercise swap feature was implemented with live swap + undo snackbar, but the "Swapped from {Original}" label in session history was initially missing because no persistent record of the original exercise was stored.
**Learning**: When a feature mutates data (swap, replace, reorder) and the app has a history/detail view for that data, the schema must include a column capturing the pre-mutation state. An in-memory undo ref or transient state is insufficient — the "before" value must survive app restarts.
**Action**: Before implementing any mutation feature, audit ALL views that display the affected data (active, history, detail, export). If any view references "before" state, add a dedicated column (e.g., `swapped_from_exercise_id`) to the schema in the initial implementation, not as a follow-up fix.
**Tags**: data-model, schema-design, mutation, history, session-detail, swap, persistence, before-state

### Dedup Record Reuse Must Apply All User-Requested Mutations
**Source**: BLD-248 — Online Food Search (Open Food Facts Integration)
**Date**: 2026-04-17
**Context**: The Online Food Search feature deduplicates food entries by matching name+macros. When a duplicate was found, the code reused the existing entry but skipped the "Save as Favorite" toggle — a MAJOR review finding that blocked the initial PR.
**Learning**: When dedup logic reuses an existing database record instead of creating a new one, ALL user-requested mutations must still be applied to the reused record. Dedup optimizes the "create" path but must not suppress secondary operations (favoriting, tagging, updating metadata). The reused record is the target for every mutation the user initiated, not just the creation.
**Action**: When implementing dedup/upsert logic: (1) separate the "find or create" step from the "apply user mutations" step, (2) after obtaining the entry (whether new or reused), execute ALL secondary operations (toggle favorite, update tags, set metadata) against it unconditionally, (3) add a test that specifically verifies secondary mutations are applied when dedup reuses an existing record.
**Tags**: dedup, upsert, data-integrity, favorite, mutation, find-or-create, code-review

### Conditionally-Rendered Overlays Must Reset Internal State on Reopen
**Source**: BLD-252 — Barcode Scanner for Food Logging (Phase 42)
**Date**: 2026-04-17
**Context**: The BarcodeScanner component used a `scanned` state flag to disable scanning after a barcode was detected. When the overlay auto-closed (parent set `visible=false`), the component stayed mounted but hidden. On reopen (`visible=true`), `scanned` was still `true`, so the CameraView received `onBarcodeScanned={undefined}` — scanning was permanently dead until the app was restarted.
**Learning**: Components controlled by a `visible` prop (rather than conditional mount/unmount) retain all internal state across hide/show cycles. Any state that gates functionality (scan locks, loading flags, form dirty states, step counters) will carry stale values into the next open. This is distinct from unmount cleanup — the component never unmounts, so cleanup effects don't run.
**Action**: For overlay/modal components controlled by a `visible` prop: (1) add a `useEffect` watching `visible` that resets all session-specific state when it becomes `true`, (2) prefer refs over state for values that only need to survive within a single visible session (avoids unnecessary re-renders), (3) in code review, verify that every state variable in a `visible`-controlled component has an explicit reset path.
**Tags**: modal, overlay, visible-prop, state-reset, useeffect, refs, camera, barcode-scanner, conditional-rendering

### Extensible Session Population via URL Params
**Source**: BLD-265 — Repeat Workout from History (Phase 44)
**Date**: 2026-04-17
**Context**: FitForge's active session screen (`app/session/[id].tsx`) needed to support populating a new session from a completed session's data, in addition to the existing template-based population.
**Learning**: Session population from different data sources follows a URL-param-driven branching pattern in the `useEffect` initialization block: `templateId` loads from a template, `sourceSessionId` loads from a prior session. Each branch reads its source data, maps it to the standard `addSetsBatch` / `updateSetsBatch` calls, and handles source-specific concerns (e.g., deleted exercises for session sources, template structure for template sources). The branches are `else if` peers in the same effect.
**Action**: When adding a new session data source (e.g., from a program schedule, AI-generated workout, shared link): (1) add a new URL param to `useLocalSearchParams`, (2) add an `else if` branch parallel to the existing `templateId` and `sourceSessionId` branches in the initialization `useEffect`, (3) fetch source data with a dedicated query function, (4) map to `addSetsBatch` format with fresh IDs and remapped link_ids, (5) handle source-specific edge cases (missing entities, format differences) before calling the shared batch APIs.
**Tags**: session-population, url-params, extensible-architecture, expo-router, workout-session, data-sources

### Defense-in-Depth Error Isolation for Composite Screens
**Source**: BLD-272 — FIX: Workout Tools Button Crash (GitHub #141)
**Date**: 2026-04-17
**Context**: The ToolsHub screen rendered three independent tool components inline (Timer, 1RM Calculator, Plate Calculator). A crash in any one component — or an unhandled async rejection in its useFocusEffect — took down the entire screen. The global ErrorBoundary (from BLD-19) did not help because it catches at the app level, not between sibling components.
**Learning**: React error boundaries only catch synchronous render/lifecycle errors — they do NOT catch errors thrown inside async callbacks (e.g., `useFocusEffect(() => { (async () => { throw ... })() })`). Composite screens that render multiple independent sub-components need TWO layers of defense: (1) a component-level error boundary wrapping each sub-component to isolate render crashes, and (2) try/catch inside every async effect callback to prevent unhandled promise rejections from bypassing the boundary entirely.
**Action**: When building screens that compose multiple independent features side-by-side, wrap each feature in its own error boundary with a graceful fallback message. Additionally, ensure every async callback inside useFocusEffect/useEffect has a try/catch — async errors bypass error boundaries and crash the app on Android.
**Tags**: error-boundary, error-isolation, composite-screen, useFocusEffect, async-error, defense-in-depth, android-crash

### Null-Initial State for Smart Defaults Without Overriding User Intent
**Source**: BLD-277 — FIX: Template button overridden by nextWorkout logic (GitHub #148)
**Date**: 2026-04-17
**Context**: The workout tab used an `effectiveSegment` derived variable that continuously overrode the segment state: `nextWorkout && segment === "templates" ? "programs" : segment`. Users could tap "Templates" and see it highlighted, but the content always showed programs. The override ran on every render, making user input permanently ineffective.
**Learning**: Deriving a value that silently overrides user-controlled state on every render creates an invisible UX bug — the UI control appears to work (shows the selected value) but the behavior doesn't follow. This is especially insidious because it only manifests when a runtime condition is true (e.g., `nextWorkout` exists), making it hard to catch in testing without that specific data setup.
**Action**: When a component needs a "smart default" that can be overridden by user interaction, use a null-initial state pattern: `useState<T | null>(null)` where null means "use computed default." Derive the effective value as `userChoice ?? computedDefault`. Never use a derived variable that can override non-null user state. This ensures the default applies only until the user makes an explicit choice.
**Tags**: derived-state, user-intent, smart-default, null-initial, segmented-control, ux-bug, react-state

### FlashList Inline ListHeaderComponent Causes Keyboard Dismiss on Every Keystroke
**Source**: BLD-290 — Nutrition Tab UX Overhaul Plan (GitHub #156)
**Date**: 2026-04-17
**Context**: Users reported keyboard dismissing on every keystroke during food search. The TextInput was rendered inside a `header()` function passed as FlashList's `ListHeaderComponent`. The `header` function was defined inline (new reference every render), causing FlashList to re-mount the header — and thus the TextInput — on every state update.
**Learning**: FlashList re-mounts `ListHeaderComponent` when it receives a new function reference. An inline `header()` function creates a new reference on every render. Any TextInput inside the header loses focus on re-mount, dismissing the keyboard. This applies to `ListFooterComponent` as well.
**Action**: Never place TextInput inside FlashList's `ListHeaderComponent` or `ListFooterComponent` when those are defined as inline functions. Either (1) render the TextInput above the FlashList as a sibling, or (2) memoize the header component with `useMemo`/`React.memo` to maintain referential stability. Prefer option (1) — it eliminates the class of bugs entirely.
**Tags**: flashlist, keyboard-dismiss, ListHeaderComponent, referential-stability, useMemo, TextInput, re-mount, react-native

### JSON Settings Field Migration Requires Centralized Transform at ALL Read Sites
**Source**: BLD-296 — Replace age with birth year in body profile (GitHub #161)
**Date**: 2026-04-17
**Context**: The nutrition profile stored as JSON in `app_settings` changed from `age: number` to `birthYear: number`. Unlike SQL column migrations (one-time ALTER TABLE), JSON settings have no schema enforcement — every read site must handle both old and new formats.
**Learning**: When renaming or restructuring fields in JSON-serialized app_settings values, create a centralized `migrateX()` function that: (1) checks for the new field first, (2) computes the new field from the old if absent, (3) strips the old field. This function must be called at EVERY load point — component mount, screen load, AND the import/export path. Missing a single read site causes silent data bugs.
**Action**: For any JSON settings field change: (1) create a typed migration function (e.g., `migrateProfile(raw: any): NutritionProfile`), (2) grep for ALL `getAppSetting("<key>")` calls and wrap every `JSON.parse()` with the migration, (3) add migration to `import-export.ts` `insertRow` for the relevant settings key, (4) write explicit tests for legacy→new, modern→passthrough, and both-present→preference scenarios.
**Tags**: app-settings, json-migration, data-migration, field-rename, import-export, nutrition-profile, backward-compatibility

### FlashList renderItem Must Return a Single View-Based Root — Not a Fragment
**Source**: BLD-295 — Inline food search on nutrition tab (Part B)
**Date**: 2026-04-17
**Context**: The inline food search component needed a labeled separator between local and online search results inside a FlashList. The initial instinct was to wrap the separator label and result item in a React Fragment (`<>...</>`), but this breaks FlashList's internal height estimation.
**Learning**: FlashList relies on measuring the root element of each rendered item to calculate layout. React Fragments produce multiple sibling nodes with no single measurable root, which breaks FlashList's height estimation and causes rendering glitches (blank spaces, overlapping items, incorrect scroll positions). This constraint applies to `renderItem`, `ListHeaderComponent`, and `ListFooterComponent`.
**Action**: Always return a single `<View>` wrapper (not `<>...</>`) from FlashList's `renderItem` when the item needs to render multiple elements (e.g., a separator label above the item). When reviewing PRs that use FlashList, flag any Fragment usage in renderItem as a MAJOR finding.
**Tags**: flashlist, fragment, renderitem, view, height-estimation, shopify, react-native, list

### Dynamic import() for Native-Only Module Isolation in Cross-Platform Apps
**Source**: BLD-299 — Implement Strava Integration (Phase 48)
**Date**: 2026-04-17
**Context**: The Strava integration module (`lib/strava.ts`) imports `expo-auth-session`, `expo-web-browser`, and `expo-secure-store` at the top level — all native-only packages. A static import of this module anywhere in the app (e.g., `import { syncSessionToStrava } from "../lib/strava"`) would cause web builds to fail at module resolution time, even if the call site is guarded by `Platform.OS !== "web"`.
**Learning**: When a module has top-level imports of native-only dependencies, `Platform.OS` guards at the call site are insufficient — the static import itself triggers module resolution and fails on web. Use `await import("./module")` at each call site to defer module loading until runtime, ensuring the native-only module tree is never loaded on web. This applies to any cross-platform Expo app where some features are native-only.
**Action**: When a feature module imports native-only Expo packages at the top level, never use static imports from consuming code. Instead, use `const { fn } = await import("./module")` inside a `Platform.OS !== "web"` guard. Apply this pattern in both UI components (settings, session) and lifecycle hooks (_layout.tsx startup).
**Tags**: dynamic-import, platform-gating, native-only, web, expo, cross-platform, module-resolution, import

### Health Connect SDK Requires Four Setup Steps Beyond the NPM Package
**Source**: BLD-301 — PLAN: Health Connect Integration (Phase 49)
**Date**: 2026-04-17
**Context**: Tech Lead review of the Health Connect integration plan caught two Critical issues where the plan omitted mandatory SDK setup steps. Without these, the integration compiles but crashes at runtime.
**Learning**: `react-native-health-connect` requires four specific setup steps: (1) `expo-health-connect` config plugin in `app.config.ts` for AndroidManifest permissions and Health Connect activity declaration, (2) `expo-build-properties` config plugin with `minSdkVersion: 26` (Health Connect SDK minimum), (3) an `initialize()` call before ANY Health Connect API use — without it, all subsequent calls throw, (4) `clientRecordId` metadata on every inserted record for deduplication — without it, retries create duplicate records. Permission strings use bare names (e.g., `WRITE_EXERCISE`) without the `android.permission.health.` prefix.
**Action**: When integrating Health Connect: add all three Expo config plugins first (`expo-health-connect`, `expo-build-properties`, the health-connect npm package), create an `ensureInitialized()` guard that wraps `initialize()` with a singleton flag and call it before every API operation, and always include `clientRecordId: "fitforge-{entityId}"` in record metadata for idempotent writes.
**Tags**: health-connect, expo, android, sdk-setup, config-plugin, initialization, deduplication, react-native

### Android SDK Feature Availability Is a Four-State Machine — UX Must Branch on All States
**Source**: BLD-301 — PLAN: Health Connect Integration (Phase 49)
**Date**: 2026-04-17
**Context**: Quality Director review found that the initial Health Connect plan treated SDK availability as binary (available/not). Android SDK features like Health Connect actually have four distinct states with different UX requirements, based on OS version and app installation status.
**Learning**: Android-only SDK features (Health Connect, Google Play Services features, etc.) have four availability states, not two: (1) **Unavailable** — Android version too old (e.g., API < 28 for Health Connect) → hide the feature entirely, (2) **Needs install** — OS supports it but companion app not installed (e.g., HC on Android 9–13) → show "Install" button with Play Store deep link, (3) **Needs update** — app installed but SDK version incompatible (`SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED`) → show "Update" button, (4) **Available** — ready to use (e.g., HC built into Android 14+) → show feature toggle. Use `getSdkStatus()` to determine the state and branch UX accordingly.
**Action**: When adding any Android-only SDK feature, define the UX for all four availability states before implementation. Use the SDK's status/availability API (e.g., `getSdkStatus()`) to determine which state the device is in. Never treat availability as boolean — always handle the "needs install" and "needs update" intermediate states with actionable UI (deep links to Play Store). Platform-gate the entire feature on iOS and web.
**Tags**: android, sdk-availability, state-machine, platform-gating, health-connect, play-store, ux-branching, conditional-ui

### Serializing Concurrent Countdown-Undo Actions to Prevent UI/DB Desync
**Source**: BLD-307 — Fix swap-exercise bug + long-press exercise delete
**Date**: 2026-04-18
**Context**: The long-press exercise delete uses the same countdown-undo pattern as exercise swap: optimistically remove from UI, show a 5s countdown snackbar with UNDO, commit to DB on timeout. A subtle edge case arises when the user triggers a second destructive action while the first countdown is still running.
**Learning**: When multiple destructive actions share a countdown-undo UI (snackbar), a second action starting before the first commits creates a desync risk: the first action's undo ref is overwritten, making it uncommittable. The fix is a `commitPendingAction()` guard that immediately commits the first action to the DB (skipping the remaining countdown) before starting the second. This pattern also requires position-aware undo (restoring at `originalIndex`, not appending) and DB-failure rollback (restoring the UI group if the batch delete fails).
**Action**: When implementing countdown-undo for destructive actions, always add a `commitPending*()` function that is called at the start of each new action. Store enough context in the pending ref to both commit (IDs to delete) and undo (removed data + original position). Wrap the DB commit in try/catch and restore the UI on failure with a user-visible error snackbar.
**Tags**: optimistic-ui, undo, countdown, concurrent-actions, destructive-action, snackbar, desync, batch-delete, session-data

### BNA UI Card style Prop Requires StyleSheet.flatten — No Array Support
**Source**: BLD-313 — P4a: Migrate screens batch 1
**Date**: 2026-04-18
**Context**: Migrating 10 screens from react-native-paper (RNP) to BNA UI. RNP Card's `style` prop accepts arrays (e.g., `style={[styles.card, { backgroundColor }]}`). BNA UI Card types its `style` prop as `ViewStyle` (not `StyleProp<ViewStyle>`), so arrays cause a TypeScript error.
**Learning**: BNA UI Card (and potentially other BNA components with `ViewStyle`-typed style props) does not accept style arrays. Use `StyleSheet.flatten()` to merge arrays into a single object: `style={StyleSheet.flatten([styles.card, { backgroundColor }])}`. This is a systematic difference from RNP where `style` props universally accept arrays.
**Action**: When migrating any component from RNP to BNA UI, check whether the BNA component's `style` prop is typed as `ViewStyle` or `StyleProp<ViewStyle>`. If it's `ViewStyle`, wrap all style arrays with `StyleSheet.flatten()`. Apply this pattern consistently across all migrated screens.
**Tags**: bna-ui, react-native-paper, migration, stylesheet-flatten, card, style-prop, typescript

### BNA UI Component Gaps — DataTable, List.Item, Card.onPress Require Manual Replacements
**Source**: BLD-313 — P4a: Migrate screens batch 1
**Date**: 2026-04-18
**Context**: The BNA UI migration spec mapped `DataTable → BNA Table` and `Card (with onPress) → Card`. During implementation, BNA Table proved too heavy for simple tabular displays (it includes search, pagination, sorting), and BNA Card has no `onPress` prop or `List.Item` equivalent.
**Learning**: Three RNP components have no direct BNA equivalent: (1) **DataTable** — BNA Table is a full-featured data grid; for simple key-value rows, use `View` with `flexDirection: "row"` + `Text` + `Separator`. (2) **List.Item** — no BNA equivalent exists; build with `Pressable` + `View` rows containing icon + text + description. (3) **Card onPress** — BNA Card is purely a container; wrap with `Pressable` when tap behavior is needed. These gaps should be anticipated in migration planning.
**Action**: When planning BNA UI migration for screens using DataTable, List.Item, or pressable Cards, budget extra time for building custom View-based replacements. Do not assume 1:1 component parity — verify each BNA component's API before starting migration.
**Tags**: bna-ui, react-native-paper, migration, datatable, list-item, card, pressable, component-gaps

### Library Migration Must Audit Behavioral Contracts, Not Just Visual Rendering
**Source**: BLD-314 — P4b: Migrate screens batch 2 (exercises, nutrition, session, onboarding)
**Date**: 2026-04-18
**Context**: Migrating Snackbar → BNA Toast across 20+ screens. The initial implementation replaced all Snackbar calls with `toast()` calls, but silently dropped undo functionality on 4 screens (nutrition, progress, photos, template). Snackbar had an `action={{ label: "Undo", onPress: fn }}` prop; BNA Toast initially had no action support.
**Learning**: When migrating between UI component libraries, rendering parity is insufficient — each old component's behavioral API (callbacks, action buttons, accessibility handlers) carries implicit contracts that consuming code depends on. Automated reviews caught the visual migration but missed that destructive operations (delete daily log, delete body weight, delete photo) lost their undo capability entirely. The fix required extending the target component (adding `action` support to BNA Toast) AND restoring the undo wiring on every affected screen.
**Action**: Before starting a component migration, create a two-column audit: (1) visual props (style, label, variant) and (2) behavioral props (onPress, action, onDismiss, accessibility roles). Map each behavioral prop to its replacement. If the target library lacks a behavioral equivalent, extend the target component FIRST before migrating screens. For destructive operations, grep for `undo|action|onDismiss` in the old component's usages to identify behavioral contracts at risk.
**Tags**: bna-ui, react-native-paper, migration, behavioral-contract, undo, snackbar, toast, action-prop, destructive-operation

### Decompose Large Components via Domain-Specific Hook Extraction
BLD-318 **Source**: Consolidate food-add: delete nutrition/add.tsx, enhance InlineFoodSearch 
**Date**: 2026-04-18
**Context**: InlineFoodSearch.tsx was ~750 lines combining search state, online API calls, barcode scanning, food logging, deduplication, manual entry UI, and favorites management. The component was difficult to test and modify because every concern was interleaved.
**Learning**: Large components that manage multiple async workflows (search, barcode, logging) decompose cleanly when logic is split by domain rather than by lifecycle. `useFoodSearch` encapsulates query state, debounced API calls, barcode scanning, and result caching. `useFoodLogger` encapsulates all food-write operations (local, online, manual, favorite) with undo support. The orchestrating component dropped from ~750 to ~250 lines and became pure UI wiring. Sub-components (`FoodResultItem`, `ManualFoodEntry`) further isolate visual concerns.
**Action**: When a component exceeds ~400 lines and manages multiple async workflows, extract domain-specific hooks (one per workflow) before extracting sub-components. Each hook should own its own state, refs, and abort controllers. The parent component should only wire hooks to UI — no business logic in render.
**Tags**: react, hooks, component-decomposition, custom-hooks, refactoring, large-files, separation-of-concerns

### Route Elimination via Query Params for Mode-Switching UI
**Source**: BLD-318 — Consolidate food-add: delete nutrition/add.tsx, enhance InlineFoodSearch
**Date**: 2026-04-18
**Context**: Two entry points existed for food-add: a header barcode icon navigated to `/nutrition/add` (961-line modal page), while a FAB opened InlineFoodSearch. Users got different experiences depending on entry point.
**Learning**: When two routes serve overlapping functionality (both offered search, barcode, manual entry, favorites), the consolidation pattern is: (1) enhance the surviving component with missing features (serving multiplier, favorite toggle), (2) use a query param (`/nutrition?scan=true`) to trigger the specific mode (barcode auto-open), (3) consume the param via `useLocalSearchParams`, (4) clear it immediately with `router.setParams({ scan: undefined })` to prevent re-triggering on focus. This eliminates a route, its Stack.Screen registration, and its test suite while keeping the UX entry point intact.
**Action**: When consolidating duplicate UI, prefer query params over separate routes for mode switches. Use `router.setParams({ param: undefined })` to clear one-shot params after consumption. Remove the deleted route from Stack.Screen, screen registries, and E2E test suites.
**Tags**: expo-router, query-params, route-consolidation, navigation, deduplication, uselocalsearchparams

### Use queueMicrotask for Deferred State Updates Inside useEffect
**Source**: BLD-318 — Consolidate food-add: delete nutrition/add.tsx, enhance InlineFoodSearch
**Date**: 2026-04-18
**Context**: The `useFoodSearch` hook resets `onlineResults` and `onlineError` synchronously inside a `useEffect` when the query changes. React warns about synchronous state updates during effect execution in certain scenarios (concurrent mode, StrictMode double-invocation).
**Learning**: When a `useEffect` needs to reset state synchronously on dependency change (e.g., clearing results when query becomes empty), wrapping the setState calls in `queueMicrotask(() => { setState(...) })` defers them to after the current effect completes. This avoids potential React warnings about state updates during rendering and ensures cleanup functions execute before the deferred updates apply.
**Action**: In effects that conditionally reset state based on dependency changes, use `queueMicrotask(() => { setResults([]); setError(null); })` instead of calling setState directly. This is especially important in hooks shared across components where render timing is unpredictable.
**Tags**: react, useeffect, queuemicrotask, state-updates, concurrent-mode, hooks, performance

### Barrel Re-Export for Non-Breaking Module Splits
**Source**: BLD-322 — FTA complexity audit: bring all 102 files below score 50
**Date**: 2026-04-18
**Context**: `lib/db/sessions.ts` (1339 lines) and `lib/db/helpers.ts` (719 lines) needed splitting into focused modules. Hundreds of import sites across the codebase referenced these files. Changing every import path would be a massive, error-prone diff.
**Learning**: When decomposing an oversized module into smaller focused modules, keep the original file as a barrel that re-exports everything from the new modules. The original file shrinks to just import/re-export statements while every existing import site continues to work unchanged. This lets the split happen in one PR without touching consumer files — consumers can optionally be migrated to direct imports later.
**Action**: When splitting a large module: (1) extract functions/types into new files grouped by responsibility, (2) replace the original file's implementation with `export * from "./new-module"` re-exports, (3) verify TypeScript compilation — no import changes needed anywhere else. Only update test files that directly read source files via `fs.readFileSync`.
**Tags**: typescript, module-decomposition, barrel-export, refactoring, backward-compatibility, imports

### Extract Heavy Constant Data into Companion Data Files
**Source**: BLD-332 — FTA audit: remaining 113 files above score 50
**Date**: 2026-04-18
**Context**: `lib/exercise-nlp.ts` (727 lines) scored high on FTA complexity. Analysis showed ~535 lines were constant data (synonym maps, regex patterns, lookup tables) and only ~200 lines were actual parsing logic. Extracting `exercise-nlp-data.ts` immediately brought the logic file under the complexity threshold without restructuring any algorithms.
**Learning**: Files with high complexity scores often contain large inline constant data (arrays, maps, regex collections, lookup tables) inflating both line count and cyclomatic-complexity metrics. Extracting constants into a `*-data.ts` companion file is the highest-ROI refactoring move — it requires no logic changes, no new interfaces, and no consumer-side updates. Unlike hook or component extraction, it carries near-zero regression risk.
**Action**: When refactoring a high-complexity file, first check what percentage is constant data. If >40% of lines are constant declarations, extract to a `<module>-data.ts` companion file before attempting any logic restructuring. Import the constants back into the logic file. This single step often brings the file under threshold without further changes.
**Tags**: refactoring, fta, complexity, constants, data-extraction, typescript, low-risk, quick-win

### Snapshot Composite Entity Before Cascade Delete for Undo Restoration
**Source**: BLD-334 — Phase 50: Meal Templates
**Date**: 2026-04-18
**Context**: Meal template delete uses swipe-to-delete with an undo toast. A template is a composite entity — deleting it cascade-deletes child `meal_template_items` rows. The undo callback needs to re-create both the template and its items.
**Learning**: When implementing undo for deletion of composite entities (parent + children in separate tables), the full entity state including all children must be fetched BEFORE the delete operation. After deletion, the data is gone — the undo callback cannot query it. Store the fetched children in a closure or ref that the undo callback captures. Re-create the entity from this snapshot on undo.
**Action**: Before calling a cascade-delete function on a composite entity, call the full-fetch function (e.g., `getEntityById` with children joined) and capture the result. Pass the captured data into the undo callback's closure. The undo callback should call the create function with the snapshotted data. This pattern applies to any entity with dependent rows: templates+items, programs+exercises, workouts+sets.
**Tags**: undo, swipe-to-delete, cascade-delete, composite-entity, data-snapshot, transaction, toast, react-native

### Avoid Hidden Re-Queries in Composed Data-Layer Functions
**Source**: BLD-339 — Phase 51: Nutrition Progress & Trends
**Date**: 2026-04-18
**Context**: `getWeeklyNutritionAverages` internally calls `getDailyNutritionTotals` to compute weekly averages. The `useNutritionProgress` hook also needs daily totals for the chart, so it calls both functions in `Promise.all`. This causes `getDailyNutritionTotals` to execute twice with the same date range — an invisible redundant query hidden by the convenience API.
**Learning**: When a higher-level data function internally calls a lower-level query, and consumers also need the lower-level data directly, the query silently runs twice. This doubles DB load and is invisible to callers reviewing the hook code. The antipattern emerges whenever convenience functions wrap shared queries.
**Action**: Design composable data-layer functions in two ways: (1) Accept pre-fetched data as an optional parameter — `getWeeklyAverages(weeks, prefetchedDaily?)` — so callers who already have the data can skip the re-query. (2) Alternatively, split into a pure computation function (`computeWeeklyAverages(dailyTotals)`) and a fetch-and-compute wrapper. Choose option 2 when the computation is reusable across different data sources.
**Tags**: data-layer, api-design, performance, sqlite, redundant-query, composition, hook-pattern

### expo-localization firstWeekday Is 1-Indexed — Not JS Convention
**Source**: BLD-341 — Phase 52: Workout Calendar View
**Date**: 2026-04-18
**Context**: When implementing a locale-aware calendar grid, the week start day needed to come from the device locale. expo-localization's `getCalendars()[0].firstWeekday` was used, but its indexing differs from JavaScript's `Date.getDay()`.
**Learning**: expo-localization `firstWeekday` uses 1-based indexing where 1=Sunday, 2=Monday, ..., 7=Saturday. JavaScript's `Date.getDay()` uses 0-based indexing where 0=Sunday. To convert: `(firstWeekday - 1) % 7`. Failing to convert produces off-by-one week alignment errors in calendar grids. Also wrap `getCalendars()` in try/catch — it throws in test environments where expo-localization is not available.
**Action**: When using `getCalendars()[0].firstWeekday`, always convert with `(firstWeekday - 1) % 7` before passing to JS date logic. Cache the result at module level since locale does not change at runtime. Wrap in try/catch with a fallback default (0 = Sunday).
**Tags**: expo-localization, calendar, locale, firstWeekday, indexing, getCalendars, date

### Swipe Gestures Need Relative Thresholds and Discoverability Hints
**Source**: BLD-346 — Template header alignment + swipe-to-delete
**Date**: 2026-04-19
**Context**: The SwipeToDelete component used a fixed -160px dismiss threshold. On small screens the gesture was too hard; on large screens too easy. Additionally, users did not discover the swipe gesture because there was no visual cue.
**Learning**: Fixed pixel thresholds in gesture handlers produce inconsistent UX across device sizes. Use `useWindowDimensions()` and express thresholds as a percentage of screen width (e.g., 40%). For hidden gestures (swipe-to-delete, pull-to-refresh alternatives), users need an onboarding affordance — a subtle hint animation on the first item using `withDelay` + `withSequence` + `withSpring` that briefly nudges the row and springs back.
**Action**: When building swipe gestures: (1) use `useWindowDimensions().width` and percentage-based thresholds instead of hardcoded pixel values, (2) add a `showHint` prop that triggers a brief bounce animation on mount for the first item, using `withDelay(600, withSequence(withTiming(-40, {duration: 300}), withSpring(0)))`. Pass `showHint={index === 0}` to hint only on the first row.
**Tags**: gesture, swipe-to-delete, responsive, useWindowDimensions, reanimated, discoverability, ux, hint-animation

### Add Callback Props to Replace router.push When Embedding Screen Components in Sheets
**Source**: BLD-348 — Toolbox + rest timer integration into session header
**Date**: 2026-04-19
**Context**: `RMCalculatorContent` used `router.push('/tools/plates?weight=...')` on line 168 to navigate to the plate calculator. When this component was embedded inside a `@gorhom/bottom-sheet`, the navigation call would close the sheet and navigate away — breaking the in-session toolbox UX.
**Learning**: Screen-level components that use `router.push()` or `router.navigate()` internally cannot be directly reused inside bottom sheets, modals, or drawers without side effects. The fix is to add an optional callback prop (e.g., `onPlateCalc?: (weight: number) => void`) that the parent supplies to handle the action in-context. The component falls back to `router.push()` when no callback is provided, preserving standalone behavior.
**Action**: When planning to reuse a screen-level component in an overlay context, audit it for `router.push/navigate/replace` calls. For each navigation call, add an optional callback prop with a descriptive name. Use the pattern: `if (onCallback) { onCallback(data); } else { router.push(...); }`. This makes the component context-agnostic without breaking existing standalone usage.
**Tags**: react-native, expo-router, bottom-sheet, component-reuse, callback-prop, navigation, embedding

### Bottom Sheet Mutual Exclusion — Close Before Open
**Source**: BLD-348 — Toolbox + rest timer integration into session header
**Date**: 2026-04-19
**Context**: The workout session screen had two bottom sheets — an exercise picker and the new toolbox sheet. Opening both simultaneously caused visual stacking and gesture conflicts with `@gorhom/bottom-sheet`.
**Learning**: When a screen has multiple `@gorhom/bottom-sheet` instances, opening a second sheet while the first is visible causes overlapping backdrops and competing pan gesture handlers. The sheets stack rather than replace. The fix is a mutual exclusion pattern: before opening sheet B, explicitly close sheet A (and vice versa). Use state setters or refs: `setPickerOpen(false); toolboxSheetRef.current?.snapToIndex(0);`.
**Action**: When adding a new bottom sheet to a screen that already has one, implement mutual exclusion in every open handler: close all other sheets before opening the new one. Wrap the existing open handlers to also close the new sheet. Use `useCallback` with the close/open calls in sequence. Consider extracting a `useSheetMutex(refs)` hook if the screen has 3+ sheets.
**Tags**: bottom-sheet, gorhom, mutual-exclusion, gesture-conflict, multiple-sheets, ux-pattern

### Use Blue/Yellow/Red Instead of Green/Yellow/Red for Status Heatmaps
**Source**: BLD-351 — PLAN: Phase 53 — Muscle Recovery Heatmap
**Date**: 2026-04-19
**Context**: A recovery heatmap plan used green/yellow/red to indicate recovered/partial/fatigued muscle status. Quality Director flagged that ~8% of males with red-green colorblindness cannot distinguish green from red, making the heatmap unusable.
**Learning**: Green/yellow/red (traffic-light) palettes are the most common colorblind-inaccessible pattern in status visualizations. Blue/yellow/red is perceptually distinct for all common forms of color vision deficiency while preserving intuitive meaning (cool=good, warm=caution, hot=danger). The `react-native-body-highlighter` Body component accepts custom color arrays via its `colors` prop.
**Action**: For any multi-state status indicator (heatmaps, progress bars, badges), default to blue/yellow/red instead of green/yellow/red. Use dark-mode variants: blue (#42A5F5), yellow (#FFC107), red (#F44336). Light-mode: blue (#1E88E5), amber (#FF8F00), red (#D32F2F). This complements the existing dual-channel (color + stroke) pattern for SVG visualizations.
**Tags**: a11y, colorblind, heatmap, color-palette, status-indicator, ux, accessibility, react-native-body-highlighter

### expo-image Requires Config Plugin Registration for Native Builds
**Source**: BLD-365 — expo-image + FlashList estimatedItemSize (BLD-359/360)
**Date**: 2026-04-19
**Context**: PhotoGrid was migrated from RN `Image` to `expo-image` for disk caching and smooth transitions. The migration involved both code changes and build configuration.
**Learning**: expo-image is not a pure JS drop-in for RN Image. It requires: (1) `npx expo install expo-image` to add it explicitly to package.json (even if already present as a transitive dep), (2) adding `"expo-image"` to the plugins array in app.config.ts for native builds, (3) API changes: `resizeMode` → `contentFit`, and new props `cachePolicy="disk"` and `transition={200}` for loading UX.
**Action**: When replacing RN Image with expo-image, always add it to app.config.ts plugins AND update the prop names. Use `contentFit` instead of `resizeMode`, and add `cachePolicy="disk"` for persistent caching.
**Tags**: expo-image, image, migration, config-plugin, performance, caching

### FlashList v2 Auto-Measures Items — estimatedItemSize Prop Removed
**Source**: BLD-365 — expo-image + FlashList estimatedItemSize (BLD-359/360)
**Date**: 2026-04-19
**Context**: Issue spec required adding `estimatedItemSize` to all FlashList instances. The implementing agent discovered this prop was removed in FlashList v2 (which FitForge uses at v2.0.2), making half the issue spec non-applicable.
**Learning**: @shopify/flash-list v2.x removed the `estimatedItemSize` prop entirely — items are auto-measured. The prop does not exist in the v2 TypeScript definitions. Issue specs or migration guides referencing `estimatedItemSize` are outdated if targeting FlashList v2+.
**Action**: Do not add `estimatedItemSize` to FlashList components — it will cause a TypeScript error on v2+. When reviewing issue specs that reference FlashList props, verify against the installed version's type definitions before implementing.
**Tags**: flashlist, shopify, performance, breaking-change, v2, auto-measure

### Two-Step SQL + JS Pattern for Per-Group Top-N Batch Queries
**Source**: BLD-363 — Batch N+1 queries + add missing indexes
**Date**: 2026-04-19
**Context**: Converting N+1 query loops to batch operations for `getPreviousSetsBatch` and `getRecentExerciseSetsBatch`. SQLite lacks window functions like `ROW_NUMBER() OVER (PARTITION BY ...)` in older versions, so a "most recent N sessions per exercise" query cannot be done in a single standard SQL statement.
**Learning**: The reliable pattern for "top-N per group" batch queries in SQLite is: (1) Query all candidate rows with `GROUP BY all_dimensions ORDER BY group_key, ranking_column DESC`, (2) in JS, iterate results keeping only the first N per group key, (3) use the filtered IDs to fetch the actual detail data in a second SQL query with `IN (...)`. This avoids bare-column non-determinism and works with any SQLite version.
**Action**: When converting per-item queries to batch queries that need "most recent N per group," use the two-step pattern: first query finds and JS-filters the qualifying IDs, second query fetches the detail rows. Always guard batch functions with `if (ids.length === 0) return {}` to avoid empty IN clauses. Return `Record<string, T[]>` so callers get empty arrays (not undefined) for missing keys via `result[key] ?? []`.
**Tags**: sqlite, batch-query, n-plus-1, performance, two-step-pattern, group-by, top-n, in-clause

### Mutation Version Tracking for Direct-DB-Write Apps Using React Query
**Source**: BLD-367 — Implement smart query invalidation (BLD-358)
**Date**: 2026-04-19
**Context**: FitForge performs DB writes via direct SQLite calls, bypassing React Query mutations. The workaround was blanket `invalidateQueries()` on every tab focus, causing unnecessary DB round-trips and UI flickers even when no data had changed.
**Learning**: A module-level `Map<string, number>` version counter bridges imperative DB writes and React Query's cache. Mutation sites call `bumpQueryVersion(key)` after writes; `useFocusRefetch` compares last-seen versions (stored in a `useRef`) against current versions and only invalidates when they differ. First focus always invalidates for backward compatibility. This eliminates O(tab-switches) refetches while preserving data freshness after actual mutations.
**Action**: When an app performs DB writes outside React Query's `useMutation`, create a version-counter map keyed by query-key prefix. Call the bump function at every DB write site that affects cached data. In focus handlers, compare versions before calling `invalidateQueries`. Use `useRef` (not `useState`) for last-seen versions to avoid re-render loops. Always allow first-focus to invalidate unconditionally.
**Tags**: react-query, cache-invalidation, performance, useFocusEffect, sqlite, mutation-tracking, version-counter

### Timer-Ticking Screens Amplify FlashList Inline Function Costs
**Source**: BLD-368 — Memoize home screen & session FlashList (BLD-356/357)
**Date**: 2026-04-19
**Context**: The active session screen re-renders every second (timer tick for rest timer display). The FlashList `renderItem` was an inline arrow function, causing FlashList to treat every item as changed on every tick — re-rendering the entire exercise list 60 times per minute even when no data changed.
**Learning**: On screens with periodic re-renders (timers, animations, live data), inline functions passed to FlashList's `renderItem`, `ListHeaderComponent`, and `ListFooterComponent` create new references every render cycle. FlashList compares references to decide what to re-render. Combined with a 1-second timer, this means the entire list re-renders every second. The fix is extracting `renderItem` to `useCallback` and header/footer to `useMemo`, keeping references stable across timer ticks.
**Action**: On any screen with a timer or frequent re-render trigger, extract FlashList's `renderItem` to a `useCallback` with explicit dependencies, and `ListHeaderComponent`/`ListFooterComponent` to `useMemo`. Audit the dependency arrays — including rapidly-changing state (like the timer value itself) in deps defeats the purpose.
**Tags**: flashlist, useCallback, useMemo, timer, re-render, performance, referential-stability, react-native

### Add Independent Data Fetches to Existing Promise.all Batches
**Source**: BLD-366 — Phase 53: Implement Muscle Recovery Heatmap
**Date**: 2026-04-19
**Context**: `loadHomeData()` fetches home screen data in two `Promise.all` batches — the second depends on IDs from the first. When `getMuscleRecoveryStatus()` was added, it was placed sequentially AFTER both batches (`const recoveryStatus = await getMuscleRecoveryStatus()`). Tech lead review caught that this function has zero dependencies on previous results and should have been in the first `Promise.all` batch.
**Learning**: `loadHomeData()` uses a two-stage `Promise.all` pattern: stage 1 fetches independent data, stage 2 uses IDs from stage 1 for dependent queries. New data-fetching calls with no dependencies on other results should go into stage 1, not be appended sequentially. A sequential `await` after `Promise.all` blocks on the new call's full round-trip, adding latency equal to its execution time. Inside `Promise.all`, it runs concurrently with existing queries for free.
**Action**: When adding a new data source to `loadHomeData()` (or any multi-stage batch loader), check if it depends on results from earlier stages. If not, add it to the first `Promise.all` array. If it depends on stage 1 results, add it to the stage 2 array. Never add a standalone sequential `await` after the batch unless it genuinely depends on ALL previous results.
**Tags**: performance, promise-all, async, data-loading, home-screen, latency, parallelism, loadHomeData

### Absolute Timestamps for Mobile Timers — Not Cumulative setInterval
**Source**: BLD-376 — Duration-Based (Timed) Sets
**Date**: 2026-04-19
**Context**: `useSetTimer` needed to track elapsed time for isometric exercises (planks, dead hangs). The timer must remain accurate when the app is backgrounded for minutes and resumed.
**Learning**: `setInterval`-based counters drift and lose time entirely when the app is backgrounded (the JS thread is paused). Recording `startedAt = Date.now()` once on start and computing `elapsed = Math.round((Date.now() - startedAt) / 1000)` on each tick and on AppState "active" resume produces correct elapsed time regardless of backgrounding, throttling, or interval drift. The display interval (1s) is cosmetic; the source of truth is always the absolute timestamp difference.
**Action**: For any timer feature in React Native, store `startedAt` in a ref, compute elapsed from `Date.now() - startedAt` on each display tick, and add an AppState "active" listener that recalculates the display immediately on foreground resume. Never accumulate seconds via `count++` inside `setInterval`.
**Tags**: react-native, timer, absolute-timestamp, setinterval, appstate, backgrounding, isometric, useref

### Persistence Write Without Restore Path Is Incomplete Crash Recovery
**Source**: BLD-376 — Duration-Based (Timed) Sets
**Date**: 2026-04-19
**Context**: `useSetTimer` persists timer state (startedAt, exerciseId, setIndex) to SecureStore on start and clears it on stop. The automated reviewer flagged that there is no `getItemAsync` read path on mount — if the OS kills the app during timing, the persisted state is never restored.
**Learning**: Implementing persistence write + clear without a corresponding read/restore on initialization is a common incomplete-persistence bug. It passes all happy-path tests (start → stop → cleared) but fails the crash-recovery scenario. The write path creates a false sense of durability. The missing piece is always the mount-time restoration: read persisted state, validate it (check staleness), and resume or discard.
**Action**: When implementing persistence for transient state (timers, in-progress forms, unsaved drafts), always implement three operations together: (1) write on state change, (2) clear on completion, (3) read + restore on mount/init. Add a test that simulates process kill by verifying the hook initializes correctly from pre-seeded persisted data.
**Tags**: persistence, crash-recovery, securestore, asyncstorage, timer, incomplete-implementation, testing, react-native

### React Compiler: Ref Writes During Render Are Real Bugs
**Source**: BLD-379 — Fix all 22 lint errors
**Date**: 2026-04-19
**Context**: Two components wrote to refs directly during render — `session/summary/[id].tsx` synced rating/notes by assigning `sessionRef.current` inline, and `useFormFields.ts` updated `validateRef.current` at the top level of the hook body. The React Compiler `react-hooks/refs` rule flagged both.
**Learning**: Writing to a ref during render (outside useEffect/useCallback) is not just a lint style issue — it breaks React Compiler optimization and can cause bugs under concurrent rendering. The fix is to wrap the ref write in a `useEffect`. For the "sync ref to latest prop" pattern (e.g., `validateRef.current = options.validate`), use a bare `useEffect(() => { ref.current = value; })` with no dependency array.
**Action**: Never assign to `ref.current` directly in a component or hook body. Always wrap ref writes in `useEffect`. When reviewing code with refs, check that ALL assignments to `.current` are inside `useEffect`, `useCallback`, or event handlers — never at render scope.
**Tags**: react-compiler, refs, useeffect, render-purity, concurrent-rendering, lint, react-hooks

### React Compiler: Hoist Impure Calls Out of Render Loops
**Source**: BLD-379 — Fix all 22 lint errors
**Date**: 2026-04-19
**Context**: `CalendarGrid.tsx` called `Date.now()` inside the cell-mapping loop during render. The React Compiler `react-hooks/purity` rule flagged this as an impure function call during render — each render invocation could produce different results.
**Learning**: `Date.now()`, `Math.random()`, and other non-deterministic calls during render violate React's purity contract. The React Compiler cannot safely memoize components that contain these calls. The fix is to capture the value once before the render logic (e.g., `const now = today.getTime()`) and reference the captured value in loops and conditionals.
**Action**: Before any render-time loop or conditional that references time, random values, or other non-deterministic sources, capture the value in a `const` at the top of the component/function. Search for `Date.now()`, `new Date()`, and `Math.random()` at render scope during code review.
**Tags**: react-compiler, purity, render, date-now, memoization, performance, lint, react-hooks

### React Compiler: Extract Optional Chaining from useMemo Deps
**Source**: BLD-379 — Fix all 22 lint errors
**Date**: 2026-04-19
**Context**: `session/summary/[id].tsx` had `useMemo(() => ..., [session?.started_at])` — the React Compiler's `react-hooks/preserve-manual-memoization` rule could not preserve this memoization because the dependency uses optional chaining.
**Learning**: React Compiler cannot track optional chaining expressions (`a?.b`) in `useMemo`/`useCallback` dependency arrays for memoization preservation. The fix is to extract the chained value to a local variable (`const x = a?.b`) and use that variable in the dependency array. This gives the compiler a stable reference to track.
**Action**: When useMemo or useCallback depends on an optionally-chained property, extract it to a `const` above the hook call and use the extracted variable in the deps array. Pattern: `const val = obj?.prop; useMemo(() => ..., [val])`.
**Tags**: react-compiler, usememo, usecallback, optional-chaining, dependency-array, memoization, lint

### Scheduled Notification Lifecycle: Cancel from Every Exit Path
**Source**: BLD-381 — Rest Timer Background Resilience & Completion Notification
**Date**: 2026-04-19
**Context**: The rest timer schedules a local push notification on start (fires when rest completes while backgrounded). The notification must be cancelled from four distinct code paths: user dismiss, natural timer completion in-app, new timer replacing the old one, and component unmount.
**Learning**: When pairing a scheduled notification with a timer or timed operation, store the notification identifier in a ref and create a dedicated `cancelNotification` callback. Call it from every path that ends or replaces the operation: (1) explicit dismiss/cancel, (2) natural completion while in foreground (prevents redundant notification), (3) restart/replace (new operation cancels old notification before scheduling a new one), (4) cleanup on unmount. Treat scheduling failures as non-critical — the core feature (timer) must work without notifications.
**Action**: For any feature that schedules a future notification tied to a timed operation: store the notification ID in a useRef, extract cancellation into a shared callback, and audit every code path that ends the operation to ensure it calls cancel. Add an `isAvailable()` guard and a user-setting check before scheduling, and wrap the schedule call in try/catch so failures are silent.
**Tags**: expo-notifications, scheduled-notification, timer, lifecycle, cancel, useref, background, rest-timer

### JSON Snapshot Dirty-Check for Auto-Save Forms
**Source**: BLD-389 — Body profile saves redundantly on every interaction
**Date**: 2026-04-19
**Context**: The body profile settings auto-saved on every segment tap and field blur — even when the value had not changed from the loaded state. This produced redundant database writes and spammed "Profile saved" toasts on no-op interactions (e.g., tapping the already-selected gender).
**Learning**: For auto-saving forms (save-on-blur / save-on-change), store a `useRef<string | null>` snapshot of the initial/loaded state as a JSON string. Before each save, serialize the current form state and compare against the snapshot. If identical, return early (no save, no toast). After a successful save, update the snapshot to the new state so subsequent no-ops are also caught. JSON comparison works reliably when both paths construct the same object shape with stable key order.
**Action**: When implementing auto-save in settings or form components: (1) capture `initialSnapshot.current = JSON.stringify(loadedData)` after load, (2) add `if (JSON.stringify(current) === initialSnapshot.current) return;` before the save call, (3) update `initialSnapshot.current` after successful save. This prevents redundant writes, avoids toast spam, and is simpler than field-level dirty tracking.
**Tags**: auto-save, dirty-check, forms, settings, useref, json-compare, toast, ux, debounce

### Settings UI Must Be Wired End-to-End — Don't Ship Cosmetic Toggles
**Source**: BLD-396 — Workout toolbox & rest timer integration into session header
**Date**: 2026-04-19
**Context**: A new `SessionHeaderToolbar` component added vibrate/sound toggle switches that persisted user preferences to `app_settings`, but the `useRestTimer` hook unconditionally fired haptics and played audio on rest completion — ignoring the stored settings entirely. TL flagged this as MAJOR: toggles misled users into thinking they controlled behavior.
**Learning**: Settings controls that write to storage but are never read by the consuming code are "cosmetic toggles" — they create a false sense of user control. The bug is invisible in testing because the default behavior (vibrate ON, sound ON) matches the expected default, so toggling ON "works" by coincidence.
**Action**: When adding user-facing settings: (1) trace the full path from UI toggle → storage write → consumer read → behavior change, (2) verify the consumer code has a read call gated on the setting value, (3) add a test that toggles the setting OFF and asserts the behavior is suppressed, not just that the setting was stored.
**Tags**: settings, user-preferences, app-settings, haptics, audio, end-to-end, cosmetic-toggle, code-review
