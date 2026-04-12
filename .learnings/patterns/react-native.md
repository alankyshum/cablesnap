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

### Always Use try/finally for Async Operations with Loading State
**Source**: BLD-11 — Phase 5: Nutrition and Macro Tracking
**Date**: 2026-04-12
**Context**: The nutrition feature's save() and quickLog() functions in add.tsx called setSaving(true) before an async DB write, then setSaving(false) after. If the async operation threw, the loading state was never reset — the UI showed a perpetual spinner with no way to retry.
**Learning**: Any pattern of `setLoading(true); await asyncOp(); setLoading(false)` has a silent failure mode: if `asyncOp()` throws, the loading state is never cleared. This leaves the UI stuck in a disabled/spinner state. The fix is wrapping the operation in try/finally so the state reset executes regardless of success or failure.
**Action**: Always use `try { await asyncOp(); } finally { setLoading(false); }` when managing loading/saving state around async operations. Search for `setLoading(true)` or `setSaving(true)` patterns during self-review to verify each has a corresponding finally block.
**Tags**: react, async, loading-state, try-finally, error-handling, ui-state
