# React Native + Expo Patterns

## Learnings

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
