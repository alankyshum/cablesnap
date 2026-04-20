# Architecture Decisions

### Product Pivots Cascade Through Data Models
**Source**: BLD-27 — Strategic Pivot to Cable Machine Focus + Beyond Power Voltra
**Date**: 2026-04-15
**Context**: CableSnap pivoted from general barbell focus to cable-machine-specific (Voltra device) training. The pivot required restructuring the entire exercise data model to support 7 training modes (eccentric overload, chains, isokinetic), mount positions, and attachment types — not just adding new exercises.
**Learning**: A product strategy pivot does not just change feature priorities — it cascades through the data model. New device capabilities (training modes, equipment metadata) must be reflected in database schema and seed data before any feature work begins. Building features on an un-restructured data model leads to rework.
**Action**: When executing a product pivot, first audit the existing data model against the new domain requirements. Restructure schema and seed data to reflect the new domain BEFORE starting feature implementation. Document the new domain entities and their relationships as the first deliverable of the pivot.
**Tags**: architecture, product-pivot, data-model, domain-modeling, schema-design, cross-project

### Boolean-to-Enum Migration via Dual-Write and Partition Alignment
**Source**: BLD-268 — PLAN: Dropset & Set Type Annotation (Phase 46)
**Date**: 2026-04-17
**Context**: Phase 45 added `is_warmup` (boolean) to `workout_sets`. Phase 46 needed to extend this to four states (normal, warmup, dropset, failure). Replacing the boolean in-place would break 38+ existing queries. The plan devised a dual-write migration strategy that was validated by both Tech Lead and Quality Director.
**Learning**: When a boolean column needs to become an enum, add a NEW `set_type TEXT DEFAULT 'normal'` column alongside the existing boolean rather than replacing it. The key insight is **partition alignment**: if the new enum values (dropset, failure) semantically map to the boolean's `false` partition (`is_warmup = 0`), then ALL existing queries filtering on the boolean remain correct with zero changes. Dual-write (updating both columns on every mutation) maintains backward compatibility during the transition. This converts what would be a high-risk 38-query migration into a zero-query-change additive migration. Plan explicit tech debt to remove the boolean column later.
**Action**: When extending a boolean to an enum: (1) add a new column with a text/enum type and sensible default, (2) backfill from the boolean in a transaction, (3) dual-write both columns in all mutation functions, (4) verify that new enum values align with the correct boolean partition so existing queries need no changes, (5) document the boolean removal as explicit tech debt for a future phase. Do NOT attempt to migrate all existing query references in the same phase — the dual-write approach is safer.
**Tags**: schema-migration, boolean-to-enum, dual-write, backward-compatibility, sqlite, additive-migration, tech-debt, query-safety

### DB-Backed Diagnostic Logs Need Count-Based Not Time-Based Pruning
**Source**: BLD-287 — Enhanced Error Logging with Platform Logs (GitHub #149)
**Date**: 2026-04-17
**Context**: Plan proposed applying 60-second time-based pruning to both the in-memory console log buffer and DB-backed interaction log for consistency. Tech lead rejected time-based pruning for the DB-backed log during plan review.
**Learning**: In-memory log buffers (e.g., console-log-buffer) and DB-backed event logs (e.g., interaction_log) require different retention strategies. In-memory buffers are ephemeral — they reset on app restart, so time-based pruning (e.g., 1 minute) matches their natural lifecycle and limits RAM usage. DB-backed logs persist across restarts, so older entries retain diagnostic value (user can file a report about something that happened 5 minutes ago). Time-based pruning on DB logs destroys this persistent diagnostic history.
**Action**: For in-memory diagnostic buffers, use time-based pruning (entries older than N seconds). For DB-backed diagnostic logs, use count-based limits only (keep last N entries). Do not apply matching pruning strategies to both just for "consistency" — the storage medium determines the correct strategy.
**Tags**: diagnostic-logging, pruning, retention, in-memory-vs-db, interaction-log, console-buffer, architecture

### Persistent SQLite Queue for Fire-and-Forget External API Sync
BLD-298 **Source**: PLAN: Strava Integration (Phase 48) 
**Date**: 2026-04-17
**Context**: Strava workout upload must not block the user or lose data if the API is unavailable. The approved architecture uses a SQLite status table as a persistent job queue — entries survive app kills and restarts, unlike in-memory queues.
**Learning**: For fire-and-forget external API operations in a mobile app, a SQLite status table serves as a persistent retry queue. Pattern: (1) create a log entry with `status='pending'` BEFORE the API call, (2) update to `synced` or `failed` after the call, (3) track `retry_count` per entry, (4) on app startup, query for `pending` or `failed` entries and retry them, (5) mark as `permanently_failed` after N retries. A UNIQUE constraint on the source entity ID (e.g., session_id) prevents duplicate queue entries. An `external_id` field on the API call prevents duplicate remote resources.
**Action**: When designing features that sync data to external APIs, use a SQLite status table as the persistent queue rather than in-memory state. Include columns: status (pending/synced/failed/permanently_failed), retry_count, error message, and timestamps. Add startup reconciliation logic. Use UNIQUE constraints to prevent duplicates locally and external_id to prevent duplicates remotely.
**Tags**: architecture, persistent-queue, retry, external-api, sync, sqlite, fire-and-forget, strava, resilience

### Expo/React Native Cannot Target Wear OS — Wearable Features Require Separate Native Codebase
**Source**: BLD-300 — EXPLORE: Wear OS workout tracking integration (GitHub #166)
**Date**: 2026-04-17
**Context**: Investigated feasibility of a Wear OS companion app for hands-free workout logging. Explored React Native/Expo compatibility, native Kotlin alternatives, and phone-watch communication via Wearable Data Layer API.
**Learning**: React Native and Expo have no Wear OS build target — this is a structural limitation unlikely to change. While APKs can technically be sideloaded onto Wear OS (it's Android), the result is unusable: no round-screen optimization, no Wear OS APIs (Tiles, Complications, Crown input), and poor performance on watch hardware. A Wear OS companion app requires an entirely separate native Kotlin codebase using Compose for Wear OS, plus phone-side integration via Wearable Data Layer API — which itself requires either Expo ejection to bare workflow or a custom native module bridge. Estimated effort: 8–15 engineer-weeks plus ongoing dual-codebase maintenance.
**Action**: When evaluating wearable companion app requests: (1) immediately rule out code-sharing with the Expo/RN codebase, (2) estimate as a separate Kotlin project with its own build pipeline, (3) evaluate notification-based alternatives first — Android notifications with action buttons automatically mirror to Wear OS, delivering ~70% of the hands-free value at ~10% of the cost, (4) consider Health Connect integration as a lighter alternative for data sharing with fitness watches.
**Tags**: wear-os, wearable, expo, react-native, kotlin, compose, architecture, feasibility, platform-limitation, notification-mirroring, cross-project

### Schema-Only ORM Adoption — Types Before Queries
**Source**: BLD-370 — Define Drizzle schema and replace manual Row types (schema-only, no query changes)
**Date**: 2026-04-19
**Context**: CableSnap had 10+ manually-defined Row types (ExerciseRow, FoodRow, etc.) that could drift from the actual SQLite schema in migrations.ts. A full Drizzle ORM query migration was rejected as too risky pre-launch given 321 SQL statements across 18 modules and mock-based tests that can't gate query refactoring safely.
**Learning**: ORM adoption can be split into a zero-risk "types only" phase: (1) install the ORM package, (2) define all tables in a schema file using the ORM's table DSL, (3) export inferred types via `$inferSelect`, (4) replace manual Row types with these inferred types, (5) change ZERO queries. This gives compile-time schema drift detection (types auto-derived from schema definitions) with zero runtime risk. Query migration can be deferred indefinitely — the schema file already provides value as the single type source of truth.
**Action**: When migrating a raw-SQL codebase to an ORM, start with a schema-only phase: define tables, export inferred types, replace manual types, change no queries. Gate query migration on having real integration tests (not mocks) that can validate query semantics. This decouples type safety from query refactoring risk.
**Tags**: drizzle, orm, migration, schema, type-safety, incremental-adoption, architecture, risk-management

### Prefer React Query Computation Over Denormalized SQLite Cache Columns
**Source**: BLD-432 — PLAN: Per-Exercise Strength Goals (Phase 66)
**Date**: 2026-04-20
**Context**: The initial Phase 66 plan included a `current_best` column in the `strength_goals` table to cache the user's current PR for progress calculation. Quality Director flagged this as a cache-coherence risk: the cached value can go stale when workouts are added, edited, or deleted, creating incorrect progress percentages.
**Learning**: Denormalized cache columns in SQLite (e.g., storing a computed aggregate like `MAX(weight)` alongside the goal) introduce a class of stale-data bugs that are hard to detect and hard to test. Every mutation path (insert, update, delete) must remember to refresh the cache, and missed paths silently corrupt displayed data. React Query already provides an application-level cache with automatic invalidation on focus-refetch and explicit `invalidateQueries`. Computing the aggregate on-the-fly via a simple `SELECT MAX(weight) FROM workout_sets WHERE exercise_id = ?` — cached in React Query — eliminates the entire cache-coherence problem.
**Action**: When designing a feature that needs a computed aggregate (current best, total count, latest date), do NOT add a denormalized cache column to the table. Instead, compute it with a query and cache the result in React Query with focus-refetch. Reserve denormalized columns for cases where the computation is genuinely expensive (complex joins across large unbounded datasets) and add explicit cache invalidation in every mutation path.
**Tags**: react-query, denormalization, cache-coherence, sqlite, stale-data, architecture, computed-values

### Extend Additive Features at the Caller Level — Not by Modifying Core Data Functions
**Source**: BLD-439 — PLAN: Weekly Training Frequency Goal (Phase 68)
**Date**: 2026-04-20
**Context**: Phase 68 adds a frequency-goal fallback for users without an active program. The initial plan proposed modifying `getWeekAdherence()` to check for the frequency goal when no program schedule exists, which would change its return type and contract for all existing callers.
**Learning**: When adding a fallback data source to an existing data pipeline, modifying the core query function risks regressions for all existing callers. The safer pattern is to leave the core function unchanged and handle fallback logic in the caller/wrapper (e.g., `loadHomeData()`). The wrapper checks whether the core function returned meaningful data; if not, it invokes the fallback path. This keeps the core function's return type stable, avoids touching existing tests, and makes the fallback logic explicit and isolated in one place.
**Action**: When a feature adds a fallback or secondary data source to an existing function, do NOT modify the core function's signature or return type. Instead, add the conditional fallback logic at the caller level. This preserves backward compatibility, keeps the core function testable in isolation, and localizes the new behavior to the feature being added.
**Tags**: architecture, backward-compatibility, data-contract, wrapper-pattern, additive-feature, regression-prevention

### Create Dedicated DB Queries for New Analytics — Do Not Repurpose Existing Ones
**Source**: BLD-460 — Overreaching Detection & Deload Nudge (Phase 76)
**Date**: 2026-04-20
**Context**: Overreaching detection needed weekly e1RM data per exercise over 6 weeks. An existing `getE1RMTrends()` query existed but used 30-day windows and returned only top-5 positive changes — wrong granularity and wrong filter for detecting decline.
**Learning**: Existing DB queries embed business logic specific to their original feature — time windows, aggregation granularity, result ordering, and row filters. Reusing them for different analytical needs couples unrelated features and forces awkward post-processing. Creating a new dedicated query (e.g., `getWeeklyE1RMTrends()`) is cleaner even when querying the same underlying tables, because each query encodes its own analytical requirements in SQL.
**Action**: When a new feature needs data from the same tables as an existing query but with different time windows, grouping, or filters, create a new dedicated query function. Only reuse an existing query if the analytical requirements are identical. Document in the new query's JSDoc how it differs from the existing one.
**Tags**: database, query-design, coupling, analytics, separation-of-concerns, sql
