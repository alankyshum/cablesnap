# Architecture Decisions

### Product Pivots Cascade Through Data Models
**Source**: BLD-27 — Strategic Pivot to Cable Machine Focus + Beyond Power Voltra
**Date**: 2026-04-15
**Context**: FitForge pivoted from general barbell focus to cable-machine-specific (Voltra device) training. The pivot required restructuring the entire exercise data model to support 7 training modes (eccentric overload, chains, isokinetic), mount positions, and attachment types — not just adding new exercises.
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
