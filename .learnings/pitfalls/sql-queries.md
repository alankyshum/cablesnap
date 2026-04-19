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

### INSERT OR IGNORE Cannot Repair Corrupted Existing Rows
**Source**: BLD-174 — Starter workout templates missing on Workout tab
**Date**: 2026-04-16
**Context**: Starter templates were seeded with `INSERT OR IGNORE`. A later import operation stripped the `is_starter=1` flag. On the next app launch, `seedStarters()` re-ran INSERT OR IGNORE, but since the rows already existed, the corrupted `is_starter=0` values were never repaired.
**Learning**: `INSERT OR IGNORE` is an existence check, not a correctness check. It guarantees a row exists but cannot enforce that existing rows have correct column values. If any other code path (import, migration, manual edit) corrupts a flag on a seeded row, INSERT OR IGNORE will silently skip it on every subsequent run, leaving the corruption permanent.
**Action**: For seeded data with invariant flags (e.g., `is_starter`, `is_default`, `is_system`), add a self-healing UPDATE step that runs before or after the INSERT OR IGNORE: `UPDATE table SET flag = 1 WHERE id IN (known_ids) AND flag = 0`. This repair runs on every init and is idempotent. Place it outside the version gate so it executes even when the seed version hasn't changed.
**Tags**: sqlite, insert-or-ignore, seed-data, data-corruption, self-healing, idempotent, flags

### Import/Export Must Include All Semantic Columns — Not Just Core Fields
**Source**: BLD-174 — Starter workout templates missing on Workout tab
**Date**: 2026-04-16
**Context**: The import function for `workout_templates` and `programs` inserted only the "core" columns (id, name, timestamps) but omitted `is_starter`. Importing a backup silently converted all starter templates into user templates, breaking the Workout tab display.
**Learning**: Import INSERT statements that enumerate columns will silently drop any column not listed. Unlike SELECT mappings (which return `undefined` for unmapped fields), import INSERTs actively overwrite the row with a default value (typically 0 or NULL), destroying the original data. Every boolean flag, enum column, or metadata field must be explicitly included in the import INSERT with a sensible default for user-created entries (e.g., `row.is_starter ?? 0`).
**Action**: When adding a new column to any table that has import/export support, update both the export query (SELECT) and the import INSERT to include the new column. Use nullish coalescing (`?? default`) for backward compatibility with backups that predate the column. During code review of schema changes, search for all `insertRow` / `INSERT INTO` statements for the affected table.
**Tags**: sqlite, import-export, data-loss, column-enumeration, backward-compatibility, schema-evolution

### Seed Data Repair Must Cover the Entire Entity Graph — All Tables, All Columns
**Source**: BLD-174/187/255 — Starter workout metadata missing (three-time recurring regression)
**Date**: 2026-04-17
**Supersedes**: Previous learning scoped to "ALL Canonical Columns" (BLD-186/187, 2026-04-16)
**Context**: BLD-174 repaired `is_starter` flags on `workout_templates`. BLD-187 extended to also repair `name`. Both fixes only covered the parent table. BLD-255 (third recurrence) revealed that child table rows (`template_exercises`, `program_days`) could be entirely deleted by import, migration, or cleanup — and no repair logic existed for them. The fix required INSERT OR IGNORE + UPDATE across all four tables.
**Learning**: When a seeded entity spans multiple tables (parent + children), repair logic scoped to the parent table alone is incomplete. Deleted child rows produce the same symptom as corrupted parent columns (entity appears empty), but require INSERT OR IGNORE to re-create — not just UPDATE. The repair scope must be the full table graph of the canonical entity, not just the table where the current symptom manifests.
**Action**: For multi-table seeded entities, the repair loop on every app init must: (1) INSERT OR IGNORE the parent row, (2) UPDATE canonical columns on the parent, (3) INSERT OR IGNORE each child row, (4) repeat for all related tables. Use the canonical source constant as the single source of truth. Place this entire repair block outside any version gate so it runs unconditionally on every startup.
**Tags**: sqlite, seed-data, self-healing, multi-table, entity-graph, data-repair, recurring-regression, insert-or-ignore

### COUNT(*) Overcounts When Joining Tables with Duplicate Dimension Values
**Source**: BLD-182 — Weekly Training Summary & Insights
**Date**: 2026-04-16
**Context**: The weekly summary counted scheduled workouts by querying program_schedule with COUNT(*). When multiple workout templates were assigned to the same day_of_week, each template produced a separate row, inflating the "scheduled workouts this week" count beyond the actual number of distinct training days.
**Learning**: COUNT(*) counts rows, not distinct values. In any query that joins or queries a table where the grouping/dimension column (e.g., day_of_week) can have multiple rows per value, COUNT(*) will overcount. The result is numerically plausible but silently wrong — a 3-day program with 2 templates per day reports 6 scheduled workouts instead of 3.
**Action**: When counting distinct occurrences of a dimension (days, users, categories), use `COUNT(DISTINCT dimension_column)` instead of `COUNT(*)`. During review, check every COUNT(*) in aggregate queries: if the FROM clause involves a table where the counted dimension is not the primary key, it likely needs COUNT(DISTINCT). Add a test with duplicate dimension values to verify the count.
**Tags**: sqlite, sql, count-distinct, aggregation, overcounting, join, dimension, code-review

### Bump Export Format Version When Adding Columns — Track Future-Version Guard
**Source**: BLD-234 — PLAN: Session Rating & Save-as-Template (Phase 37)
**Date**: 2026-04-16
**Context**: The initial plan for adding a `rating` column to workout_sessions specified the export format as "v3" — but the current format was already v3. Both QD and TL caught this: adding new fields to export requires bumping to v4. The plan also initially forgot to update the `future_version` guard (which rejects imports from newer versions) from `>= 4` to `>= 5`.
**Learning**: When adding columns that appear in export/import data, three changes must happen atomically: (1) bump the export version number (v3 → v4), (2) update the `future_version` rejection threshold (>= 4 → >= 5) so older apps reject the new format cleanly, and (3) add backward-compatible handling so the new version can import old-format data (e.g., `row.rating ?? null`). Missing any one of these causes silent data loss, import crashes, or version confusion.
**Action**: When modifying export/import to include new fields: bump the version constant, update the future_version guard, and add a fallback for the new field when importing older formats. Search for the current version number in import-export code and update all three locations in the same change.
**Tags**: export, import, versioning, sqlite, data-migration, backward-compatibility, format-version

### LEFT JOIN to Detect Deleted Referenced Entities Before Loading
**Source**: BLD-265 — Repeat Workout from History (Phase 44)
**Date**: 2026-04-17
**Context**: When repeating a workout from history, the source session may reference exercises that have since been deleted. Loading these blindly would create orphaned sets with no matching exercise, causing UI errors or silent data corruption.
**Learning**: Use `LEFT JOIN` on the referenced entity table and check for `NULL` in the join result to detect deleted references at query time rather than at render time. The query `SELECT ws.*, e.id AS exercise_exists FROM workout_sets ws LEFT JOIN exercises e ON ws.exercise_id = e.id` lets the caller filter out sets whose exercises no longer exist before inserting them into the new session. Combine with a user-facing notification (snackbar) reporting the count of skipped items.
**Action**: When loading data that references other entities by ID (exercises, templates, programs), always use LEFT JOIN to detect deleted references. Filter them out before processing and notify the user with a count: `${count} exercise${count > 1 ? 's were' : ' was'} skipped (no longer available)`. Never silently skip or crash on missing references.
**Tags**: left-join, deleted-references, data-integrity, defensive-query, user-notification, snackbar, exercises, foreign-key

### Boolean Filter Column on Core Table Requires Exhaustive Aggregation Query Audit
**Source**: BLD-266 — PLAN: Warm-up Set Tagging (Phase 45)
**Date**: 2026-04-17
**Context**: Adding `is_warmup` boolean to `workout_sets` required auditing every query that aggregates set data. The plan author identified 15+ queries needing `AND ws.is_warmup = 0`, but the Tech Lead review caught 3 additional queries in `buildAchievementContext()` (achievements.ts) that were completely missing — PR count, max session volume, and lifetime volume queries that would have produced inflated metrics.
**Learning**: Adding a boolean partition column (is_warmup, is_draft, is_archived) to a core data table differs from soft-delete auditing. Soft-delete changes JOIN types; boolean filters require adding WHERE clauses to every aggregation query (SUM, COUNT, MAX, AVG) on that table. Achievement/gamification queries are especially easy to miss because they live in separate subsystem files and are not obviously connected to the feature being modified. Even with deliberate auditing, the plan author missed 3 of 18+ affected queries.
**Action**: When adding a boolean partition column to a core table: (1) grep the entire codebase for the table name to find ALL queries, not just the ones in the primary feature file, (2) specifically check secondary subsystems — achievements, weekly summaries, export, charts — that aggregate the same table, (3) for each query, decide: should this aggregate ALL rows or only the "active" partition? Document the decision. Display queries (getSessionSets) typically show all; metric queries (getVolume, getPRs) typically filter.
**Tags**: sqlite, boolean-column, query-audit, aggregation, where-clause, achievements, metrics, data-integrity, schema-migration

### Unused DB Functions Accumulate Silent Bugs — Audit Before Wiring Up
**Source**: BLD-270 — PLAN: Template Exercise Editing (Phase 47)
**Date**: 2026-04-17
**Context**: `updateTemplateExercise()` existed in the DB layer but had no UI entry point. When planning to wire it up, the Tech Lead review discovered it was missing the `updated_at` timestamp update that every other template mutation function performs. The function compiled and would have "worked" — but produced silently stale sort order.
**Learning**: DB functions written speculatively (for future use) or left over from refactors accumulate bugs because they are never exercised. They miss invariants added to sibling functions after they were written. When the function is finally called, it appears correct (compiles, runs, modifies the right rows) but violates cross-cutting concerns (audit timestamps, cascading updates, notification triggers) that were added to other functions later.
**Action**: Before wiring up an existing but previously unused DB function, audit it against all sibling mutation functions on the same table. Check that it maintains the same invariants: `updated_at` timestamps, cascading updates to parent tables, transaction wrapping, and any consistency patterns added since the function was originally written. Treat unused code as untested code regardless of how correct it looks.
**Tags**: sqlite, unused-code, db-mutations, updated_at, invariant-drift, code-audit, template-exercises

### New Database Tables Require Five-Point Backup/Restore Integration
**Source**: BLD-335 — Include meal templates in backup/restore (Phase 50 follow-up)
**Date**: 2026-04-18
**Context**: Phase 50 added `meal_templates` and `meal_template_items` tables to the app but did not add them to the backup/restore system in `lib/db/import-export.ts`. Users who exported and reimported their data would silently lose all saved meal templates. This was caught as a follow-up issue, not during the original feature implementation.
**Learning**: Adding a new column to an existing backed-up table and adding an entirely new table are different failure modes. Existing learnings cover column-level updates, but a new table requires five integration points in `import-export.ts`: (1) `BackupTableName` union type, (2) `BACKUP_TABLE_LABELS` record, (3) `IMPORT_TABLE_ORDER` array in FK-dependency order (parent before child), (4) `BackupV3Data` type, and (5) a new `insertRow` case with nullish coalescing defaults for backward compatibility. Missing any of the five causes either TypeScript errors (1, 2, 4) or silent data loss (3, 5).
**Action**: When adding a new database table to FitForge, immediately check whether the table holds user data that should survive export/import. If yes, update all five points in `lib/db/import-export.ts` in the same PR as the table creation — not as a follow-up. Add tests verifying: (a) the table appears in IMPORT_TABLE_ORDER, (b) old backups without the table import gracefully, (c) parent tables are imported before child tables.
**Tags**: sqlite, import-export, backup, restore, new-table, data-loss, backward-compatibility, schema-evolution, checklist

### full_body Exercises Break Per-Muscle-Group Analysis — Filter Them Out
**Source**: BLD-351 — PLAN: Phase 53 — Muscle Recovery Heatmap
**Date**: 2026-04-19
**Context**: A muscle recovery heatmap plan queried workout history to determine per-muscle-group recovery status. Both QD and TL independently flagged that `full_body` exercise types (which map to ALL muscle slugs in `SLUG_MAP`) would mark the entire heatmap as fatigued after a single full-body session.
**Learning**: The `exercises` table includes a `full_body` primary muscle type that maps to every muscle group in the body SVG. Any per-muscle-group analysis (volume charts, recovery status, training frequency, muscle recommendations) that includes `full_body` exercises produces misleading results — one burpee session would show every muscle as recently trained. This also applies to compound exercises with many secondary muscles when using secondary muscle data.
**Action**: When querying exercise data for per-muscle-group analysis, add `WHERE primary_muscles != '"full_body"'` (or filter in JS after `JSON.parse()`). Use primary only muscles secondary muscles from compound exercises add too much noise. Document this filter with a comment explaining why full_body is excluded. 
**Tags**: exercises, full-body, muscle-groups, data-query, heatmap, volume, recovery, filtering, primary-muscles

### SQLite Bare Columns in GROUP BY Produce Non-Deterministic Batch Results
**Source**: BLD-363 — Batch N+1 queries + add missing indexes
**Date**: 2026-04-19
**Context**: `getPreviousSetsBatch` initially used `GROUP BY ws2.exercise_id` (partial grouping) with bare columns like `wss.id AS session_id` in SELECT and `wss.completed_at` in HAVING. The intent was to pick the most recent completed session per exercise, but SQLite's non-standard bare-column behavior makes the selected `session_id` arbitrary — it may not correspond to the row with `MAX(completed_at)`.
**Learning**: SQLite allows SELECT columns not in GROUP BY (bare columns), but their values are drawn from an arbitrary row in the group. Using `HAVING col = MAX(col)` with a bare column in SELECT does not guarantee the other selected columns come from the same row. This is a silent data-correctness bug — results look plausible but return wrong session data.
**Action**: Never rely on SQLite bare columns in batch queries. Instead, GROUP BY ALL dimensions needed in the result (e.g., both `exercise_id` and `session_id`), ORDER BY the ranking column, and use JS-side limiting to pick the top-N per group. See `getPreviousSetsBatch` and `getRecentExerciseSetsBatch` in `lib/db/session-sets.ts` and `lib/db/exercise-history.ts` for the correct pattern.
**Tags**: sqlite, group-by, bare-column, non-deterministic, batch-query, data-correctness, code-review

### Idempotent ALTER TABLE ADD COLUMN via PRAGMA table_info Guard
**Source**: BLD-376 — Duration-Based (Timed) Sets
**Date**: 2026-04-19
**Context**: Adding `duration_seconds` to `workout_sets` and `target_duration_seconds` to `template_exercises` required an ALTER TABLE migration. SQLite has no `ALTER TABLE ADD COLUMN IF NOT EXISTS` syntax — running ALTER TABLE twice with the same column name throws a "duplicate column" error and crashes the app.
**Learning**: SQLite migrations that add columns must be idempotent since the migration function may run on every app launch. The pattern is: query `PRAGMA table_info(table_name)` to get current columns, check if the target column name exists in the result set, and only execute `ALTER TABLE ADD COLUMN` if it is absent. This costs one lightweight PRAGMA query per table per launch and prevents crashes on repeated execution.
**Action**: For every `ALTER TABLE ADD COLUMN` in FitForge migrations, wrap it with a `PRAGMA table_info` guard: `const cols = await db.getAllAsync("PRAGMA table_info(T)"); if (!cols.some(c => c.name === "col")) { await db.execAsync("ALTER TABLE T ADD COLUMN col TYPE"); }`. Never run bare ALTER TABLE ADD COLUMN without this guard.
**Tags**: sqlite, alter-table, migration, idempotent, pragma, table-info, schema-evolution
