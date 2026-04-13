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
