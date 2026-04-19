# Review: Database Layer (lib/db/)

Review database code changes for Drizzle ORM compliance and schema consistency.

## Deterministic Rules

### RULE-001: No new raw SQL for CRUD operations
**Severity:** error
**Check:** Any new or modified function in `lib/db/` that uses `query()`, `queryOne()`, `execute()`, `db.runAsync()`, `db.getAllAsync()`, `db.getFirstAsync()` for INSERT, UPDATE, DELETE, or simple SELECT operations.
**Fix:** Use Drizzle ORM via `getDrizzle()` from `lib/db/helpers.ts`.
**Exception:** Functions matching approved raw SQL patterns (see RULE-006).

### RULE-002: Schema.ts must match tables.ts
**Severity:** error
**Check:** Any new column added to `lib/db/tables.ts` or `lib/db/table-migrations.ts` (ALTER TABLE ADD COLUMN) must also be added to `lib/db/schema.ts`.
**Fix:** Add the column to the corresponding table definition in `schema.ts` with matching type and default.

### RULE-003: No manual Row types when schema inference works
**Severity:** warning
**Check:** New `type FooRow = { ... }` definitions in `lib/db/` files when `typeof table.$inferSelect` from schema.ts would suffice.
**Fix:** Use `import type { FooRow } from "./schema"` or `typeof foo.$inferSelect`.

### RULE-004: Unused raw SQL imports
**Severity:** warning
**Check:** Files importing `query`, `queryOne`, `execute` from `./helpers` but not using them.
**Fix:** Remove unused imports.

### RULE-005: Drizzle inside transactions
**Severity:** error
**Check:** New transaction code using `db.transaction()` from Drizzle instead of `withTransactionAsync()`.
**Fix:** Use `withTransactionAsync()` from helpers — Drizzle calls inside participate in the same transaction since they share the same underlying expo-sqlite connection.

### RULE-006: Approved raw SQL exceptions
**Severity:** info
**Check:** These patterns are approved for raw SQL and should NOT be flagged:
- Correlated subqueries in SELECT columns (outer alias reference)
- Dual derived-table JOINs (FROM subquery JOIN subquery)
- Prepared statement loops (`prepareAsync`/`executeAsync` for bulk perf)
- DDL/migrations (`migrations.ts`, `tables.ts`, `table-migrations.ts`)
- Dynamic table names (`import-export.ts`)
- Nested subquery re-ordering (`SELECT * FROM (SELECT ... LIMIT) ORDER BY`)
- Seed data (`seed.ts`)

### RULE-007: New tables need full coverage
**Severity:** error
**Check:** New `CREATE TABLE` in `tables.ts` without corresponding entry in `schema.ts`.
**Fix:** Add the full table definition to `schema.ts` with all columns, defaults, indexes, and an exported inferred type.

### RULE-008: Index consistency
**Severity:** warning
**Check:** New `CREATE INDEX` in `tables.ts` or `migrations.ts` without corresponding `index()` in `schema.ts`.
**Fix:** Add the index to the table's third argument in `schema.ts`.

## How to Run

```bash
# Check for raw SQL in changed files
git diff --name-only HEAD~1 | grep 'lib/db/' | xargs grep -n 'query(\|queryOne(\|execute(\|runAsync\|getAllAsync\|getFirstAsync' || echo "Clean"

# Verify schema completeness
npx tsc --noEmit
npx jest --config jest.config.js
```
