# Common Errors

## Learnings

### Async Singleton Initialization Requires a Promise Mutex
**Source**: BLD-3 — Workout detail crash (NativeDatabase.prepareAsync NullPointerException)
**Date**: 2026-04-13
**Context**: `getDatabase()` in `lib/db.ts` used `if (!db) { db = await open(); }` — a naive async singleton. Multiple components calling `getDatabase()` concurrently during app startup each entered the init path before `db` was assigned, causing parallel `openDatabaseAsync` + `migrate` calls that corrupted state.
**Learning**: The `await` gap between checking `if (!db)` and assigning `db = ...` lets concurrent callers all pass the null check and each start their own initialization. On Android, this manifests as `NativeDatabase.prepareAsync NullPointerException` — a misleading native error that obscures the JS-level race condition.
**Action**: For any async singleton (database, auth, config), store the pending init promise and return it to concurrent callers: `if (!initPromise) { initPromise = doInit(); } return initPromise;`. Reset the promise on failure to allow retry.
**Tags**: async, singleton, race-condition, expo-sqlite, android, promise-mutex, database-init
