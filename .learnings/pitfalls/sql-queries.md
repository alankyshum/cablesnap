# SQL Query Pitfalls

## Learnings

### COALESCE with Zero Default Creates False Positives in Comparison Queries
**Source**: BLD-5 — Phase 10: Workout Insights (PR Detection)
**Date**: 2026-04-13
**Context**: `getRecentPRs` used `COALESCE(subquery, 0)` to provide a default when no historical max existed for an exercise. Any weight > 0 then beat the default, making every first-ever exercise appear as a "personal record."
**Learning**: When a correlated subquery returns NULL (no prior data), `COALESCE(..., 0)` converts it to a value within the valid data range. A bare `>` comparison against NULL correctly evaluates to NULL/false, naturally excluding rows with no history. Two sibling functions (`getMaxWeightByExercise`, `getSessionPRs`) already handled this correctly — the inconsistency was caught only in code review.
**Action**: Never use COALESCE to supply a default for aggregate comparison queries — let SQL NULL propagation exclude no-data rows. When writing a set of related query functions, review all of them together for consistent NULL/edge-case handling.
**Tags**: sqlite, sql, coalesce, null-propagation, aggregate, comparison, consistency, code-review

### Validate Persisted Entity References Before Use
**Source**: BLD-7 — Workout Programs / Training Plans (Phase 11)
**Date**: 2026-04-13
**Context**: `activateProgram` preserved `current_day_id` from a prior session, but the referenced program day could have been deleted between deactivation and re-activation. `advanceProgram` used `findIndex` to locate the current day in the days array — if the day was deleted during a session, `idx === -1` caused incorrect wrap/cycle calculations.
**Learning**: Any stored reference (foreign key, pointer, cursor) to an entity in a table that supports deletion (hard or soft) can become stale. Operations that read and act on these references — reactivation, advancement, display — must verify the referenced entity still exists before proceeding. Without validation, stale references silently produce wrong behavior rather than explicit errors.
**Action**: Before using a persisted reference to act on related data: (1) query to confirm the referenced entity exists, (2) fall back to a safe default if it doesn't (e.g., first item in the list), and (3) for array-index lookups (`findIndex`), always handle the `-1` case explicitly with an early return. Add these checks during code review for any function that reads a stored ID and uses it to query or modify another table.
**Tags**: sqlite, data-integrity, stale-reference, foreign-key, defensive-programming, findindex, edge-case

### Enforce Group Minimum-Membership Invariant at Every Deletion Path
**Source**: BLD-6 — Superset & Circuit Training Support (Phase 14)
**Date**: 2026-04-13
**Context**: Superset groups require ≥2 exercises. When an exercise is removed from a group, the remaining group may drop to 1 member, which is an invalid state. The invariant check ("if count < 2, dissolve group") had to be added in both `removeExerciseFromTemplate` (delete exercise entirely) AND `unlinkSingleExercise` (remove from group only).
**Learning**: When a feature introduces entity grouping with a minimum membership constraint, SQLite has no built-in trigger or CHECK constraint that can enforce "group must have ≥N members." The invariant must be enforced in application code at every function that can reduce group membership — not just the obvious "unlink" function, but also "delete entity," "bulk update," and any other removal path. Missing one path creates silently invalid 1-member groups.
**Action**: When implementing grouping features, list ALL functions that can remove a member from a group (delete, unlink, move, bulk-update). Add the minimum-membership check to each one. During code review, search for all writes to the grouping column (e.g., `link_id`) and verify each path includes the invariant check.
**Tags**: sqlite, data-integrity, group-invariant, minimum-membership, defensive-programming, entity-grouping

### Bounded Query Results Produce Wrong Aggregates When Re-Filtered Client-Side
**Source**: BLD-79, BLD-80 — Visual Polish & Home Stats Row Data Accuracy
**Date**: 2026-04-14
**Context**: The home stats row derived "weekly workout count" by filtering `getRecentSessions(5)` results by the current week. `getRecentSessions(5)` returns at most 5 sessions regardless of timeframe, so the weekly filter over-counted (all 5 happened to be this week) or under-counted (sessions from earlier weeks consumed the 5-slot cap). The label said "this week" but the underlying data was "recent N."
**Learning**: A query bounded by row count (`LIMIT N`) returns an arbitrary time window. Client-side time-filtering of bounded results is silently incorrect when the bound is smaller than the filtered set. Similarly, labeling bounded data with a time-scoped label ("this week") is a semantic mismatch — the query scope and the display scope must agree.
**Action**: When displaying time-scoped statistics (e.g., "this week"), use a query explicitly bounded by that time window (e.g., `getWeekAdherence()`), not a count-bounded query re-filtered on the client. When a count-bounded query is the only available source, label the stat as "recent" not "this week." During review, check that every stat card's label matches its data source's actual scope.
**Tags**: sqlite, data-accuracy, bounded-query, time-filtering, stats-ui, label-mismatch, code-review

### Manual Row Mapping Silently Drops New SQLite Columns
**Source**: BLD-82 — Volta Training Mode Selection & Eccentric Tracking (Phase 30)
**Date**: 2026-04-14
**Context**: FitForge's `lib/db.ts` query functions (e.g., `getSessionSets()`) use `getAllAsync` and then manually map each column in `rows.map()` — selecting properties individually rather than spreading the row object. When `training_mode` and `tempo` columns were added to `workout_sets`, the new data was returned by SQLite but silently absent from the application-layer object until the mapping was updated.
**Learning**: In any data access layer that manually enumerates columns in a `rows.map()` or similar transformation, new database columns will be silently dropped from the returned typed object. The TypeScript compiler will not catch this if the type is updated but the mapping is not — the properties will simply be `undefined` at runtime. This differs from ORM-based patterns where new columns are automatically included.
**Action**: When adding new columns to a SQLite table, search `lib/db.ts` for ALL functions that query that table — especially `rows.map()` and `rows.forEach()` blocks that manually destructure or select properties. Update every mapping to include the new columns. Add the new fields to both the `*Row` type AND the return mapping. During code review, verify that the number of mapped properties matches the column count in the SELECT clause.
**Tags**: sqlite, data-access, row-mapping, silent-failure, type-safety, manual-mapping, runtime-undefined

### Map Custom User Data When Restructuring Category Enums
**Source**: BLD-30 — Strategic Pivot: Cable Machine + Voltra Exercise Database (Phase 22)
**Date**: 2026-04-14
**Context**: The exercise category enum was restructured from 14 groups to 6 Voltra-specific groups (e.g., biceps+triceps → arms, legs+cardio → legs_glutes). Seed exercises were soft-deleted and re-seeded with correct categories, but user-created custom exercises still referenced the old category values.
**Learning**: Changing a category enum in the type system does not change the values already stored in the database. Custom user data (is_custom = 1) using old enum values must be explicitly migrated via UPDATE statements with category mapping. Seed data can be soft-deleted and re-inserted with new values, but user data must be preserved and remapped. Missing this step causes custom exercises to have invalid categories, breaking filters and UI grouping.
**Action**: When restructuring an enum stored as TEXT in SQLite: (1) define an explicit old-to-new mapping for every old value, (2) run UPDATE SET category = 'new' WHERE is_custom = 1 AND category IN ('old1', 'old2') for each mapping inside a transaction, (3) verify no rows remain with unmapped old values after migration, (4) only apply mapping to user data — seed data should be re-created with correct values.
**Tags**: sqlite, enum-migration, category-restructuring, data-integrity, user-data, custom-exercises, transaction
