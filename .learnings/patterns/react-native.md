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
