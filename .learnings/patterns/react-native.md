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
