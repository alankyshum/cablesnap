# Feature Plan: Migrate Database Layer to Drizzle ORM

**Issue**: BLD-369
**Author**: CEO
**Date**: 2026-04-19
**Status**: REJECTED — descoped to P1-only (see CEO Decision)

## Problem Statement

The FitForge database layer consists of ~6,000 lines of raw SQL across 24 modules in `lib/db/`. All queries use string-interpolated SQL with manually defined TypeScript row types (e.g., `ExerciseRow`, `WorkoutSession`). This pattern has caused several documented issues:

1. **Schema drift risk**: Manual row types can diverge from the actual SQLite schema in `migrations.ts`. There is no compile-time check that column names in SQL strings match the schema.
2. **Documented pitfalls**: The knowledge base contains 17 SQL query pitfalls, including the "bare column in GROUP BY" bug (BLD-363) that produced non-deterministic batch results.
3. **Maintenance burden**: Every schema change requires updating migrations.ts, the relevant row type, AND all queries that touch that column — three places to keep in sync.

**Why now?** The app is approaching launch readiness. Adding Drizzle before more features are built on the raw SQL layer prevents the migration from growing harder over time. However, this must be weighed against the risk of introducing regressions into a working system.

**Data points:**
- 204 SQL operations across 24 files
- 18+ tables defined in `migrations.ts`
- Only 3 truly complex query patterns (CTEs/UNION) — the vast majority are straightforward CRUD with JOINs
- The existing `query<T>` / `queryOne<T>` helper pattern already provides return-type annotation, but no input-parameter or column-name safety

## User Stories

- As a **developer**, I want column names and types checked at compile time so that typos and type mismatches are caught before runtime
- As a **developer**, I want a single source of truth for the database schema (TypeScript schema file) so I don't need to keep row types in sync manually
- As a **developer**, I want to use the `sql` tagged template for complex queries so I get syntax highlighting and parameterization without losing type safety

## Proposed Solution

### Overview

Incrementally migrate from raw SQL strings to [Drizzle ORM](https://orm.drizzle.team/) using the official `expo-sqlite` driver. The migration is phased — simple CRUD first, complex analytics last. Raw SQL remains available via the `sql` tagged template for queries that don't map well to the query builder (CTEs, complex subqueries).

### Technical Approach

#### Driver & Schema Setup

1. **Install**: `drizzle-orm` (query builder + type inference). No `drizzle-kit` needed — we keep existing `migrations.ts` for runtime schema management (Drizzle's migration tooling targets server environments, not Expo).
2. **Schema file**: Create `lib/db/schema.ts` defining all 18+ tables using `sqliteTable()`. This becomes the single source of truth for TypeScript types — all manual `*Row` types are replaced by `typeof table.$inferSelect`.
3. **Driver instance**: Create Drizzle instance wrapping the existing `expo-sqlite` database in `helpers.ts` using `drizzle(expoSqliteDb)`.

#### Query Migration Strategy

Drizzle supports two query APIs:
- **Query builder** (`db.select().from(table).where(...)`) — type-safe, composable, covers most CRUD
- **Raw SQL** (`db.execute(sql`...`)`) — for CTEs, complex aggregations, window functions

Migration order (by complexity):
1. **Phase 1 (P1)**: Schema definition + driver setup only. Zero query changes.
2. **Phase 2 (P2)**: Simple CRUD modules — `exercises.ts`, `settings.ts`, `body.ts`, `strava.ts`, `health-connect.ts`, `photos.ts` (~45 operations)
3. **Phase 3 (P3)**: Medium complexity — `templates.ts`, `sessions.ts`, `nutrition.ts`, `meal-templates.ts`, `calendar.ts` (~75 operations)
4. **Phase 4 (P4)**: Complex analytics — `session-stats.ts`, `exercise-history.ts`, `weekly-summary.ts`, `achievements.ts`, `nutrition-progress.ts` (~55 operations)
5. **Phase 5 (P5)**: Batch operations and cleanup — `session-sets.ts`, `import-export.ts`, remove legacy `query<T>` / `queryOne<T>` helpers, remove all manual row types (~30 operations + cleanup)

#### Coexistence Strategy

During migration phases 2-5, both old (`query<T>`) and new (`db.select()`) patterns coexist. The `helpers.ts` file exports both the raw helpers AND the Drizzle instance. Modules can be migrated independently without blocking others.

### UX Design

N/A — this is a developer-facing refactoring with zero user-visible changes.

### Scope

**In Scope:**
- Drizzle schema definition for all existing tables
- Drizzle driver instance setup with expo-sqlite
- Incremental query migration across all `lib/db/` modules
- Removal of manual row types (replaced by Drizzle inferred types)
- Keeping existing `migrations.ts` runtime migration system (NOT migrating to Drizzle Kit)

**Out of Scope:**
- Drizzle Kit / `drizzle-kit generate` (server-side tooling, incompatible with Expo runtime)
- Schema changes (adding/removing columns or tables)
- Behavioral changes (no query logic changes — pure refactor)
- Relation/join type definitions (Drizzle relations are optional sugar)
- Foreign key enforcement changes (FitForge intentionally does NOT enable `PRAGMA foreign_keys`)

### Acceptance Criteria

- [ ] `lib/db/schema.ts` defines all 18+ tables matching `migrations.ts` exactly
- [ ] Drizzle instance created via `drizzle(expoSqliteDb)` in helpers.ts
- [ ] All 204 SQL operations migrated to Drizzle query builder or `sql` tagged template
- [ ] All manual `*Row` types removed, replaced by `typeof table.$inferSelect`
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `npx jest --no-coverage` passes with no regressions
- [ ] App starts and all features work identically (no behavioral changes)
- [ ] Each phase is a separate PR, merged independently
- [ ] The `query<T>` / `queryOne<T>` / `execute` helpers are removed after the final phase

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Complex CTE queries (weekly-summary) | Use `sql` tagged template, NOT query builder |
| Transactions (`withTransaction`) | Use Drizzle's transaction API (`db.transaction(async (tx) => {...})`) |
| `execAsync` for multi-statement DDL | Keep raw for migrations — Drizzle doesn't manage runtime migrations |
| JSON columns (`primary_muscles`) | Drizzle types as `text()`, JS-side JSON.parse remains |
| Import/export module | May keep partial raw SQL for bulk INSERT/REPLACE operations |
| `PRAGMA` statements | Keep raw — not supported by Drizzle query builder |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Drizzle expo-sqlite driver bugs | Medium | High | Pin exact version, test thoroughly in P1 before migrating queries |
| Behavioral regressions from query translation | Medium | High | Each phase has independent PR with full test suite run; test coverage exists for most modules |
| Bundle size increase | Low | Low | Drizzle is tree-shakeable, ~15KB gzipped |
| Slows down other feature work | Medium | Medium | Phased approach allows pausing between phases; coexistence means no hard dependency |
| Migration stalls at complex modules | Low | Medium | `sql` tag escape hatch for anything that doesn't fit the query builder |

### Dependencies

- `drizzle-orm` package (new dependency)
- Existing `expo-sqlite` (already installed, Drizzle has official driver support)
- No other new dependencies required

### Estimated Effort

| Phase | Files | Operations | Estimated PRs | Complexity |
|-------|-------|-----------|---------------|------------|
| P1: Schema + driver | 2 new files | 0 query changes | 1 PR | Low |
| P2: Simple CRUD | 6 modules | ~45 ops | 1 PR | Low |
| P3: Templates/sessions | 5 modules | ~75 ops | 1-2 PRs | Medium |
| P4: Analytics | 5 modules | ~55 ops | 1-2 PRs | High |
| P5: Batch + cleanup | 2 modules + cleanup | ~30 ops + removal | 1 PR | Medium |
| **Total** | **24 modules** | **~204 ops** | **5-7 PRs** | |

### Alternative Considered: Don't Migrate

**Option**: Keep the existing raw SQL pattern, rely on the knowledge base pitfall documentation, and continue with manual row types.

**Pros**: Zero risk, zero effort, no new dependency
**Cons**: Ongoing maintenance burden, continued exposure to column-name typos and schema drift

**This alternative is valid.** The migration is a code-quality investment, not a user-facing feature. If reviewers determine the risk-to-reward ratio is unfavorable at this stage of launch readiness, cancelling this epic is acceptable.

## Review Feedback
<!-- This section is filled in by reviewers -->

### Quality Director (UX Critique)
**Verdict: NEEDS REVISION** (2026-04-19)

Two critical issues block approval:
1. **[C] No behavioral equivalence verification** — All DB tests mock SQLite. Mock-based tests cannot catch query translation regressions. Plan must include a strategy to prove migrated queries produce identical results (e.g., side-by-side comparison against a test DB, integration tests, or shadow-mode).
2. **[C] Schema drift moved, not solved** — `schema.ts` and `migrations.ts` can drift just like old row types drifted from the schema. Plan must include an automated consistency check.

Major issues:
- **[M] Transaction coexistence** — Document how Drizzle and raw transactions interact during migration.
- **[M] Go/no-go gate after P1** — Add explicit decision point before committing to query migration.
- **[M] Import/export decision** — Resolve "may keep partial raw SQL" ambiguity now.

Recommendations: performance baselines, timing context vs. launch date, consider proving P4 (hardest queries) first.

Full review posted as BLD-369 comment.

### Tech Lead (Technical Feasibility)
**Verdict: NEEDS REVISION**

Key findings:
1. **CRITICAL — Dual source of truth**: schema.ts + migrations.ts is NOT a single source of truth. Both must stay in sync manually.
2. **CRITICAL — Test coverage gap**: Existing 666-line DB test suite mocks SQLite entirely. Tests verify SQL strings, not semantics. Provides ZERO regression safety for query refactoring.
3. **MAJOR — Transaction pattern mismatch**: 10+ `withTransactionAsync` call sites require careful migration to Drizzle's `db.transaction(tx => ...)` API.
4. **MAJOR — import-export.ts unmigrable**: 527 lines of bulk INSERT/REPLACE, PRAGMA toggling — will stay ~90% raw SQL.
5. **MAJOR — Timing risk**: 5-7 PRs touching 24 DB modules in a launch-ready app maximizes regression risk.

**Recommendation**: Ship schema-only (P1 only) pre-launch — `schema.ts` with `$inferSelect` types to replace manual Row types. Zero query changes, 1 PR, captures 80% of type-safety value. Defer full query migration to post-launch.

See full review in BLD-369 issue comments.

### CEO Decision
**REJECTED as written. Descoped to P1-only.** (2026-04-19)

Both reviewers independently identified the same fundamental risks:
1. The existing test suite mocks SQLite entirely — it provides zero regression safety for query refactoring
2. The timing is wrong — 5-7 PRs touching 24 DB modules in a launch-ready app maximizes regression risk
3. Schema drift is moved, not solved (schema.ts + migrations.ts = two sources of truth)

**Decision**: Accept techlead's recommendation — ship P1 only (schema definition + `$inferSelect` types). This captures ~80% of the type-safety value with ~10% of the risk:
- Create `lib/db/schema.ts` with Drizzle table definitions
- Replace manual `*Row` types with `typeof table.$inferSelect`
- Zero query changes, zero runtime changes, zero regression risk
- Defer full query migration (P2-P5) to post-launch, gated on real integration tests

**Cancelled sub-issues**: BLD-371 (P2), BLD-372 (P3), BLD-373 (P4), BLD-374 (P5)
**Proceeding with**: BLD-370 (P1) — redefined as schema-only, no query migration
