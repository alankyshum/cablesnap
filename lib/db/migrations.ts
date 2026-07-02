import * as SQLite from "expo-sqlite";
import { createCoreTables, createExtensionTables, addColumnIfMissing, hasColumn, dropColumnIfExists } from "./tables";
import { createScheduleAndIndexes } from "./table-migrations";
import * as Sentry from "@sentry/react-native";

// Safe breadcrumb — swallow if Sentry SDK is not initialized (tests, web).
function migrateBreadcrumb(message: string, data?: Record<string, unknown>): void {
  try {
    Sentry.addBreadcrumb({ category: "db.migrate", type: "info", level: "info", message, data });
  } catch {
    if (__DEV__) console.warn("[migrations] migrateBreadcrumb failed:", message);
  }
}

async function addPerformanceIndexes(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise ON workout_sets(exercise_id);
    CREATE INDEX IF NOT EXISTS idx_workout_sets_session ON workout_sets(session_id);
    CREATE INDEX IF NOT EXISTS idx_workout_sessions_completed ON workout_sessions(completed_at);
    CREATE INDEX IF NOT EXISTS idx_workout_sets_session_exercise ON workout_sets(session_id, exercise_id);
    CREATE INDEX IF NOT EXISTS idx_daily_log_date ON daily_log(date);
    CREATE INDEX IF NOT EXISTS idx_workout_sessions_started_at ON workout_sessions(started_at);
    CREATE INDEX IF NOT EXISTS idx_template_exercises_template ON template_exercises(template_id);
  `);
}

/**
 * migrate() uses a strict four-phase ordering to prevent the class of crash
 * seen in BLD-1094 ("no such column: gym_id"), where a CREATE INDEX in
 * createExtensionTables() referenced workout_sessions.gym_id — a column that
 * only existed AFTER the addColumnIfMissing calls further down. The index was
 * removed from createExtensionTables as an immediate fix; this phased structure
 * is the structural guard ensuring it can never recur:
 *
 *   PHASE 1 — Core table creation (CREATE TABLE IF NOT EXISTS only).
 *             Safe: these helpers create columns as part of table definitions,
 *             no cross-table column references.
 *
 *   PHASE 2 — ALL addColumnIfMissing calls, grouped together.
 *             Guarantees every column referenced in Phase 3 already exists.
 *             The set_type block (add column + backfill UPDATEs) lives here
 *             because the UPDATEs only reference set_type and is_warmup, both
 *             of which exist after the ADD COLUMN.
 *
 *   PHASE 3 — CREATE INDEX, CREATE TABLE for new feature tables, partial
 *             indexes, and UPDATE/backfill statements. Every column they
 *             reference is guaranteed to exist from Phase 1 or Phase 2.
 *
 *   PHASE 4 — dropColumnIfExists (last — after all reads/writes that might
 *             still reference legacy columns).
 */
// eslint-disable-next-line complexity
export async function migrate(database: SQLite.SQLiteDatabase): Promise<void> {
  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 1: Core table creation (CREATE TABLE IF NOT EXISTS only).
  // No indexes that depend on columns added later by addColumnIfMissing.
  // ─────────────────────────────────────────────────────────────────────────
  migrateBreadcrumb("phase_1_start");
  try {
    await createCoreTables(database);
    await createScheduleAndIndexes(database);
    await createExtensionTables(database);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Migration phase 1 failed: ${msg}`, { cause: err });
  }
  migrateBreadcrumb("phase_1_complete");

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 2: ALL addColumnIfMissing calls — ensures every column the rest of
  // the migration depends on exists before any DDL or DML references it.
  // ─────────────────────────────────────────────────────────────────────────
  migrateBreadcrumb("phase_2_start");
  try {
  // These were removed in 4b0add8 under "0 users" assumption; restored for BLD-461.
  // addColumnIfMissing is idempotent — safe to run on fresh and upgraded databases.

  // exercises table
  await addColumnIfMissing(database, "exercises", "deleted_at", "INTEGER DEFAULT NULL");
  await addColumnIfMissing(database, "exercises", "attachment", "TEXT DEFAULT 'handle'");
  await addColumnIfMissing(database, "exercises", "is_voltra", "INTEGER DEFAULT 0");
  // BLD-561: visual exercise illustrations — user-supplied URIs for custom exercises.
  await addColumnIfMissing(database, "exercises", "start_image_uri", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "exercises", "end_image_uri", "TEXT DEFAULT NULL");
  // BLD-913: bodyweight exercise progression paths — links exercises into ordered chains.
  await addColumnIfMissing(database, "exercises", "progression_group", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "exercises", "progression_order", "INTEGER DEFAULT NULL");
  // BLD-1028: pinned per-exercise notes — persists across sessions.
  await addColumnIfMissing(database, "exercises", "notes", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "exercises", "notes_updated_at", "INTEGER DEFAULT NULL");
  await addColumnIfMissing(database, "exercises", "notes_backfill_dismissed_at", "INTEGER DEFAULT NULL");
  // BLD-1114: per-exercise max pulley pin override.
  await addColumnIfMissing(database, "exercises", "max_pulley_pins", "INTEGER DEFAULT NULL");
  // BLD-1158: per-exercise default tempo (E-B-C-T canonical form). NULL = no default.
  await addColumnIfMissing(database, "exercises", "default_tempo", "TEXT DEFAULT NULL");
  // BLD-2561: persisted preferred substitute — single go-to replacement per exercise.
  // Column-pair mirrors BLD-1028 notes/notes_updated_at; avoids join on session render path.
  await addColumnIfMissing(database, "exercises", "preferred_substitute_id", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "exercises", "preferred_substitute_updated_at", "INTEGER DEFAULT NULL");
  // workout_templates table
  await addColumnIfMissing(database, "workout_templates", "is_starter", "INTEGER DEFAULT 0");
  await addColumnIfMissing(database, "workout_templates", "source", "TEXT DEFAULT NULL");
  // BLD-1000: curated programs library — additive migration. See schema.ts.
  await addColumnIfMissing(database, "workout_templates", "is_curated", "INTEGER DEFAULT 0");

  // programs table
  await addColumnIfMissing(database, "programs", "is_starter", "INTEGER DEFAULT 0");
  // BLD-1000: curated programs library.
  await addColumnIfMissing(database, "programs", "is_curated", "INTEGER DEFAULT 0");

  // template_exercises table
  await addColumnIfMissing(database, "template_exercises", "link_id", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "template_exercises", "link_label", "TEXT DEFAULT ''");
  await addColumnIfMissing(database, "template_exercises", "target_duration_seconds", "INTEGER");
  await addColumnIfMissing(database, "template_exercises", "set_types", "TEXT DEFAULT '[]'");

  // workout_sessions table
  await addColumnIfMissing(database, "workout_sessions", "program_day_id", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sessions", "rating", "INTEGER DEFAULT NULL");
  // BLD-630: anchor session elapsed clock to first completed set.
  // NULL = legacy/unanchored — readers fall back to started_at.
  await addColumnIfMissing(database, "workout_sessions", "clock_started_at", "INTEGER");
  // BLD-690: timestamp at which the user last edited a completed session via
  // the post-completion edit flow. NULL = never edited.
  await addColumnIfMissing(database, "workout_sessions", "edited_at", "INTEGER DEFAULT NULL");
  // BLD-890: CSV import batch ID — groups imported sessions for undo/bulk-delete.
  // NULL for sessions created organically (not imported).
  await addColumnIfMissing(database, "workout_sessions", "import_batch_id", "TEXT DEFAULT NULL");
  // BLD-1059: per-gym cable stack calibration
  await addColumnIfMissing(database, "workout_sessions", "gym_id", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sessions", "gym_name_at_log", "TEXT DEFAULT NULL");
  // BLD-1089: Grease-the-Groove Day Mode — additive migration on workout_sessions.
  // Three columns + one partial unique index (index created in Phase 3). All idempotent.
  // SQLite 3.35+ supports ALTER TABLE ... DROP COLUMN for documented rollback.
  await addColumnIfMissing(database, "workout_sessions", "kind",
    "TEXT NOT NULL DEFAULT 'workout'");
  await addColumnIfMissing(database, "workout_sessions", "day_session_exercise_id",
    "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sessions", "day_session_date",
    "TEXT DEFAULT NULL");

  // workout_sets table
  await addColumnIfMissing(database, "workout_sets", "rpe", "REAL DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "notes", "TEXT DEFAULT ''");
  await addColumnIfMissing(database, "workout_sets", "link_id", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "round", "INTEGER DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "tempo", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "swapped_from_exercise_id", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "duration_seconds", "INTEGER");
  await addColumnIfMissing(database, "workout_sets", "exercise_position", "INTEGER DEFAULT 0");
  await addColumnIfMissing(database, "workout_sets", "bodyweight_modifier_kg", "REAL DEFAULT NULL");
  // BLD-771: per-set cable variant logging.
  // NULL = user did not specify or pre-migration row. NEVER auto-stamped from
  // `exercises.attachment` default — see `lib/cable-variant.ts` for autofill chain.
  // ALTER ADD COLUMN with default NULL is metadata-only on SQLite (O(1) regardless
  // of row count). Idempotent via `addColumnIfMissing`.
  await addColumnIfMissing(database, "workout_sets", "attachment", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "mount_position", "TEXT DEFAULT NULL");
  // BLD-768: per-set bodyweight grip variant logging (grip_type + grip_width).
  // NULL = user did not specify or pre-migration row. NEVER auto-stamped from
  // any exercise-level default — see `lib/bodyweight-grip-variant.ts` for the
  // autofill chain. Same idempotency guarantees as the cable variant columns
  // above (BLD-771): ALTER ADD COLUMN with default NULL is metadata-only on
  // SQLite and `addColumnIfMissing` no-ops on second run.
  await addColumnIfMissing(database, "workout_sets", "grip_type", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "grip_width", "TEXT DEFAULT NULL");
  // BLD-1059: per-gym cable stack calibration
  await addColumnIfMissing(database, "workout_sets", "stack_id", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "stack_marker", "INTEGER DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "stack_unit_at_log", "TEXT DEFAULT NULL");
  await addColumnIfMissing(database, "workout_sets", "stack_name_at_log", "TEXT DEFAULT NULL");
  // BLD-1114: per-set pulley pin (Setup Snapshot).
  await addColumnIfMissing(database, "workout_sets", "pulley_pin", "INTEGER DEFAULT NULL");
  // BLD-1168: cached aggregate columns for advanced set scheme analytics.
  // DEFAULT 0 so reads on pre-backfill rows see 0 not NULL. The one-time
  // backfill in Phase 3 populates correct values for all existing rows.
  // addColumnIfMissing is idempotent — safe to call on every boot.
  await addColumnIfMissing(database, "workout_sets", "cached_volume_kg", "REAL NOT NULL DEFAULT 0");
  await addColumnIfMissing(database, "workout_sets", "cached_e1rm_kg", "REAL NOT NULL DEFAULT 0");

  // workout_sets.set_type migration (replaces deprecated is_warmup column).
  // Kept as a single block: the UPDATEs only reference set_type (just added)
  // and is_warmup (pre-existing), so this is safe inside Phase 2.
  if (!(await hasColumn(database, "workout_sets", "set_type"))) {
    await database.execAsync(
      "ALTER TABLE workout_sets ADD COLUMN set_type TEXT DEFAULT 'normal'"
    );
    if (await hasColumn(database, "workout_sets", "is_warmup")) {
      await database.execAsync(
        "UPDATE workout_sets SET set_type = 'warmup' WHERE is_warmup = 1"
      );
      await database.execAsync(
        "UPDATE workout_sets SET set_type = 'normal' WHERE is_warmup = 0 OR is_warmup IS NULL"
      );
    }
  }

  // body_settings table
  await addColumnIfMissing(database, "body_settings", "sex", "TEXT NOT NULL DEFAULT 'male'");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Migration phase 2 failed: ${msg}`, { cause: err });
  }
  migrateBreadcrumb("phase_2_complete");

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 3: CREATE INDEX, CREATE TABLE for new feature tables, partial
  // indexes, and UPDATE/backfill statements. All columns referenced here are
  // guaranteed to exist from Phase 1 (table creation) or Phase 2 (addColumn).
  // ─────────────────────────────────────────────────────────────────────────
  migrateBreadcrumb("phase_3_start");

  await addPerformanceIndexes(database);

  // BLD-1059: gym_profiles, cable_stacks, stack_calibrations tables and their
  // non-gym_id indexes (idx_cable_stacks_gym, idx_stack_calibrations_stack)
  // moved to tables.ts createExtensionTables — see BLD-1059.
  // Partial index idx_gym_profiles_one_default also moved to tables.ts (execAsync block).
  //
  // KEPT HERE: idx_workout_sessions_gym_started_at — depends on workout_sessions.gym_id
  // which is only guaranteed to exist after Phase 2 addColumnIfMissing.
  try {
    await database.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_workout_sessions_gym_started_at ON workout_sessions(gym_id, started_at);
    `);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Migration: creating idx_workout_sessions_gym_started_at failed: ${msg}`, { cause: err });
  }

  // strength_goals table and non-partial indexes (idx_strength_goals_exercise,
  // idx_strength_goals_active) moved to tables.ts createExtensionTables — see BLD-1059/strength-goals.
  // Partial index idx_strength_goals_one_active also moved to tables.ts (execAsync block).

  // BLD-1044: backfill — renumber any (session_id, exercise_id) groups left
  // non-contiguous by historical deleteSet() calls. Idempotent: groups that
  // are already 1..N stay at 1..N (ROW_NUMBER returns the same values and the
  // WHERE rn != set_number guard skips the UPDATE write).
  await database.execAsync(`
    WITH renumbered AS (
      SELECT id,
             ROW_NUMBER() OVER (PARTITION BY session_id, exercise_id ORDER BY set_number ASC, id ASC) AS rn
      FROM workout_sets
    )
    UPDATE workout_sets
    SET set_number = (SELECT rn FROM renumbered WHERE renumbered.id = workout_sets.id)
    WHERE id IN (SELECT id FROM renumbered WHERE rn != workout_sets.set_number)
  `);

  // BLD-1168: one-time backfill of cached_volume_kg and cached_e1rm_kg for legacy rows.
  // Pre-migration rows have no segments so parent.weight × parent.reps is the correct formula.
  // Uses 30.0 (float literal) to prevent SQLite integer division truncation.
  // Idempotent: rows that already have correct cached values are re-written to the same value.
  // Guard: only runs if the column was just added OR values are still at the default 0.
  // Non-advanced sets that genuinely have reps=0 or weight=NULL are unaffected (WHERE guard).
  // AC #261: cap e1RM at reps <= 12 to preserve pre-BLD-1168 analytics for legacy normal sets.
  // Sets with reps > 12 get cached_e1rm_kg = 0 so the `> 0` filter in analytics excludes them,
  // matching the old `AND ws.reps <= 12` WHERE clause.  Advanced-set rows are never touched here
  // because recomputeSetCaches writes their cached values via segment arithmetic before they reach
  // this backfill guard (cached_e1rm_kg is non-zero by the time migrate() runs in production).
  try {
    await database.execAsync(`
      UPDATE workout_sets
      SET cached_volume_kg = weight * reps,
          cached_e1rm_kg   = CASE WHEN reps <= 12
                                  THEN weight * (1.0 + reps / 30.0)
                                  ELSE 0
                             END
      WHERE weight IS NOT NULL
        AND reps IS NOT NULL
        AND reps > 0
        AND cached_volume_kg = 0
        AND cached_e1rm_kg = 0
    `);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Migration: cached_volume_kg/cached_e1rm_kg backfill failed: ${msg}`, { cause: err });
  }

  // BLD-1086 Phase 0b: Composite index for per-variant PR aggregation.
  // Covers (exercise_id, attachment, mount_position, grip_type, completed_at)
  // so the GROUP BY query in bestPerVariant uses the index rather than scanning
  // the full table. `stack_unit_at_log` is intentionally omitted — cardinality
  // is ~1-2 per user; the index covers the high-cost variant fan-out first.
  // CREATE INDEX IF NOT EXISTS is idempotent (safe on every boot).
  await database.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_workout_sets_variant_pr
      ON workout_sets (exercise_id, attachment, mount_position, grip_type, completed_at)
  `);

  // BLD-1089: Grease-the-Groove Day Mode — partial unique index.
  // Columns (kind, day_session_exercise_id, day_session_date) were added in Phase 2.
  try {
    await database.execAsync(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_day_session_per_exercise_date
        ON workout_sessions (day_session_exercise_id, day_session_date)
        WHERE kind = 'day_session'
    `);
  } catch (err) {
    // Partial indexes not supported on all platforms — uniqueness enforced by UPSERT.
    // Log so a missing index is diagnosable in device/CI logs.
    console.warn("[migrations] uniq_day_session_per_exercise_date partial index not created:", err);
  }

  // BLD-1100: history-based smart rest timer — pinned per-exercise rest default.
  // Logically constrained to [15, 600]; enforcement is in setUserRestSeconds
  // (RestBoundsError) and the import path (clamp/drop). ALTER ADD COLUMN with
  // DEFAULT NULL is metadata-only on SQLite (O(1) regardless of row count).
  await addColumnIfMissing(database, "exercises", "user_rest_seconds", "INTEGER DEFAULT NULL");

  // BLD-1100: partial index for the history-median query.
  // Mirrors the idx_set_media_pending_delete_partial precedent (line 289).
  // EXPLAIN QUERY PLAN assertion in scripts/perf-bench-rest-resolver.ts verifies
  // this index is picked by the planner (AC8 enforcement).
  try {
    await database.execAsync(
      `CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise_completed_at
         ON workout_sets (exercise_id, completed_at)
         WHERE completed_at IS NOT NULL`
    );
  } catch {
    // Partial indexes not supported on all platforms — resolver falls back to full scan.
    console.warn("[migrations] idx_workout_sets_exercise_completed_at partial index not created");
  }

  // BLD-1092: Form Check Videos — set_media table + indexes.
  // Stores one video clip per completed working set (one-clip-per-set
  // enforced by the unique index on set_id).
  // pending_delete is a two-phase soft-delete tombstone (0 = live, 1 = queued
  // for unlink by reconcileOrphans).
  // Partial index on pending_delete=1 (highly skewed — almost all rows = 0).
  try {
    await database.execAsync(`
    CREATE TABLE IF NOT EXISTS set_media (
      id TEXT PRIMARY KEY,
      set_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      rel_path TEXT NOT NULL,
      duration_ms INTEGER,
      size_bytes INTEGER,
      width INTEGER,
      height INTEGER,
      pending_delete INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_set_media_set_id
      ON set_media (set_id);
    CREATE INDEX IF NOT EXISTS idx_set_media_exercise_created
      ON set_media (exercise_id, created_at);
  `);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Migration: creating set_media tables failed: ${msg}`, { cause: err });
  }
  try {
    await database.execAsync(
      `CREATE INDEX IF NOT EXISTS idx_set_media_pending_delete_partial
         ON set_media (pending_delete)
         WHERE pending_delete = 1`
    );
  } catch {
    // Partial indexes not supported on all platforms — reconciler scans full table.
  }

  // BLD-1114: Extend uq_set_media_set_id to composite (set_id, kind) so each
  // set can have both a video AND a setup_photo row.
  // DROP first (cannot add IF NOT EXISTS on a different column list) then recreate.
  try {
    await database.execAsync(`
      DROP INDEX IF EXISTS uq_set_media_set_id;
      CREATE UNIQUE INDEX uq_set_media_set_id ON set_media (set_id, kind);
    `);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Migration: extending uq_set_media_set_id to composite failed: ${msg}`, { cause: err });
  }
  migrateBreadcrumb("phase_3_complete");

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 4: dropColumnIfExists — after all reads/writes that might reference
  // legacy columns. Safe to run last.
  // ─────────────────────────────────────────────────────────────────────────
  migrateBreadcrumb("phase_4_start");

  // ── Destructive cleanup of legacy F12/F13 columns (BLD-773) ──
  // F12 (Training Mode) and F13 (Mount Position) were removed from app
  // reads/writes earlier in this PR, but the physical SQLite columns still
  // exist on already-upgraded user databases. Fresh installs are unaffected
  // because `createCoreTables` no longer declares them. Drop them here so
  // upgraded DBs converge with the canonical schema in `lib/db/schema.ts`.
  //
  // BLD-783 rebase note: the original BLD-773 drop set included
  // `workout_sets.mount_position`, but BLD-771 (per-set cable variant
  // logging) — landed on main while this PR was in review — reclaims that
  // exact column name with new semantics (cable pulley position, autofilled
  // from history). Dropping it here would destroy live BLD-771 data on
  // every boot. The legacy F13 mount_position lived on `exercises` (a
  // per-exercise default), which we still drop. Surviving values on
  // workout_sets.mount_position from F13-era rows are safe to leave in
  // place — BLD-771 readers gate through `isMountPosition()` and treat
  // unknown strings as null.
  //
  // `dropColumnIfExists` is idempotent (no-op when the column is absent),
  // so this block is safe on every boot regardless of starting schema state.
  // SQLite ≥ 3.35 supports native `ALTER TABLE ... DROP COLUMN`; Expo SQLite
  // 55 ships >= 3.45 so no table rebuild is needed.
  await dropColumnIfExists(database, "workout_sets", "training_mode");
  await dropColumnIfExists(database, "template_exercises", "training_mode");
  await dropColumnIfExists(database, "exercises", "mount_position");
  await dropColumnIfExists(database, "exercises", "training_modes");

  // ── BLD-1146: Destructive cleanup of Health Connect schema objects ──
  // Health Connect was removed as a feature (never shipped to users).
  // On existing installs the table, index, and app_settings key may persist
  // from an intermediate build. Drop them idempotently so all installs
  // converge to the clean schema. IF EXISTS guards make this a no-op on
  // fresh installs or installs that never had the HC artifacts.
  await database.execAsync(`
    DROP INDEX IF EXISTS idx_hc_sync_log_status;
    DROP TABLE IF EXISTS health_connect_sync_log;
    DELETE FROM app_settings WHERE key = 'health_connect_enabled';
  `);
  migrateBreadcrumb("phase_4_complete");
}
