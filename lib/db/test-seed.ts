/**
 * Scenario seed hook for visual UX audit — WEB-ONLY, DEV-ONLY.
 *
 * Ordering (TL#2, option b — preferred):
 *   Production `getDatabase()`/`seed()` runs first (on web the DB falls back
 *   to `:memory:` per `lib/db/helpers.ts:47-55`, so seeding never touches
 *   on-disk state). Only AFTER the normal init completes do we CLEAR the
 *   scenario tables and RESEED them with scenario-specific fixtures, and
 *   then set `document.body.dataset.testReady = 'true'` so Playwright can
 *   gate screenshot capture on it.
 *
 * Guards (all three must hold — any false => `seedScenario()` is a no-op):
 *   1. `__DEV__ === true`                                    (not a prod build)
 *   2. `Platform.OS === 'web'`                               (native targets never seed)
 *   3. `typeof window !== 'undefined' && window.__TEST_SCENARIO__ != null`
 *
 * **Bundle hygiene (TL#3):** this module is only imported from inside an
 * `if (__DEV__)` branch in `hooks/useAppInit.ts`, so Metro strips the whole
 * module (and the `__TEST_SCENARIO__` string) in production. The top-level
 * `if (!__DEV__) return` inside the function is belt-and-suspenders.
 * `scripts/verify-scenario-hook-not-in-bundle.sh` enforces this at PR time.
 *
 * Supported v1 scenario keys (unknown key => warn + no-op):
 *   - `completed-workout`  — one completed session, ready for post-workout summary
 *   - `workout-history`    — several completed sessions populating /history
 */

import { Platform } from "react-native";
import { getDatabase } from "./helpers";
import { bulkInsertSegments, type BulkSegmentInput } from "./sets";

export const SUPPORTED_SCENARIOS = [
  "completed-workout",
  "workout-history",
  "form-clips",
  "advanced-sets",
  "store-showcase",
] as const;

export type ScenarioKey = (typeof SUPPORTED_SCENARIOS)[number];

declare global {
  interface Window {
    __TEST_SCENARIO__?: string;
  }
}

/** Only true inside the three guarded states. Exported for unit tests. */
export function guardsAllow(): boolean {
  if (typeof __DEV__ === "undefined" || !__DEV__) return false;
  if (Platform.OS !== "web") return false;
  if (typeof window === "undefined") return false;
  if (!window.__TEST_SCENARIO__) return false;
  return true;
}

// BLD-1796: bounded retry around the scenario-seed step.
//
// Under high Playwright worker counts (BLD-1791 gives each worker its OWN cold
// WASM-SQLite DB on a SHARED `npx serve` static origin), the scenario seed that
// `hooks/useAppInit.ts` runs after DB init flakes in two transient ways while N
// workers cold-boot at once:
//   1. "Failed to fetch (localhost:8081)" — the lazy `import("./test-seed")`
//      chunk (or a WASM/asset request) is dropped by the static server under
//      concurrent request pressure.
//   2. "Sync operation timeout" — `seedScenario()`'s drizzle writes
//      (`seedAdvancedSets` → `bulkInsertSegments`, the table-clear DELETEs) hit
//      the BLD-1636 synchronous busy-wait budget on a still-contended worker.
// Either leaves `data-test-ready` unset, timing out every seed-dependent spec.
//
// `seedScenario()` is idempotent (it DELETEs the scenario-mutable tables then
// re-inserts fixed-id rows), so re-running the whole import+seed is safe. We
// retry ONLY on these transient signatures with a short backoff; a genuine
// programming error (unknown scenario, schema bug) is NOT transient and surfaces
// immediately on the first attempt.
const SCENARIO_SEED_MAX_ATTEMPTS = 5;
const SCENARIO_SEED_RETRY_BACKOFF_MS = 150;

/**
 * BLD-1796: true only when the bounded scenario-seed retry should be active —
 * i.e. running under a WebDriver-controlled browser (Playwright sets
 * `navigator.webdriver === true`). Mirrors the `resolveDbName()` /
 * `asyncOpen*` test-gate convention: outside WebDriver (manual dev-web, and —
 * belt-and-suspenders — production, where this whole module is Metro-stripped)
 * the retry is inert, so behavior is unchanged. Exported for unit tests.
 */
export function scenarioSeedRetryEnabled(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { webdriver?: boolean };
  return nav.webdriver === true;
}

/**
 * BLD-1796: classify an error as a transient, retry-worthy scenario-seed
 * failure. Matches the two signatures observed under high-worker-count
 * contention (see {@link SCENARIO_SEED_MAX_ATTEMPTS} comment). Exported for
 * unit tests.
 */
export function isTransientScenarioSeedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  // BLD-1636 sync busy-wait timeout (the patched expo-sqlite tags the throw with
  // this name; we also match the message if the patch is ever dropped).
  if (err.name === "SyncOperationTimeoutError") return true;
  const msg = err.message;
  return (
    msg.includes("Sync operation timeout") ||
    // Lazy-chunk / WASM / asset fetch dropped by the static server under load.
    msg.includes("Failed to fetch") ||
    msg.includes("Load failed") || // Safari/WebKit wording for a failed fetch
    msg.includes("NetworkError")
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * BLD-1796: run the scenario-seed thunk (`import + seedScenario`) with a bounded
 * retry on transient errors. Used by `hooks/useAppInit.ts`. The thunk owns the
 * dynamic import so a "Failed to fetch" on the lazy chunk itself is retried too.
 *
 * - Outside WebDriver: exactly ONE attempt (no behavior change).
 * - Under WebDriver: up to {@link SCENARIO_SEED_MAX_ATTEMPTS} attempts, retrying
 *   only when {@link isTransientScenarioSeedError} holds, with a short backoff
 *   that yields the macrotask so a contended worker / saturated static server
 *   can recover. A non-transient error, or budget exhaustion, throws so the
 *   caller still records `data-test-ready`'s absence / `testSeedError` (no new
 *   permanent hang, no swallowed real bug).
 *
 * Exported for unit tests.
 */
export async function runScenarioSeedWithRetry(
  seedThunk: () => Promise<void>,
): Promise<void> {
  const maxAttempts = scenarioSeedRetryEnabled() ? SCENARIO_SEED_MAX_ATTEMPTS : 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await seedThunk();
      return;
    } catch (err) {
      if (attempt === maxAttempts || !isTransientScenarioSeedError(err)) {
        throw err;
      }
      // eslint-disable-next-line no-console
      console.warn(
        `[test-seed] transient scenario-seed failure (attempt ${attempt}/${maxAttempts}), retrying:`,
        err instanceof Error ? err.message : String(err),
      );
      await delay(SCENARIO_SEED_RETRY_BACKOFF_MS);
    }
  }
}

export async function seedScenario(): Promise<void> {
  if (!guardsAllow()) return;

  const scenario = window.__TEST_SCENARIO__ as string;
  if (!(SUPPORTED_SCENARIOS as readonly string[]).includes(scenario)) {
    // eslint-disable-next-line no-console
    console.warn(`[test-seed] unknown scenario '${scenario}' — no-op`);
    return;
  }

  const db = await getDatabase();

  // Clear scenario-mutable tables only (preserve exercises + starter templates
  // so the app still renders normally).
  // BLD-1094: include strava_sync_log before parent workout_sessions —
  // PRAGMA foreign_keys = ON now enforces strava_sync_log →
  // workout_sessions FK.
  await db.execAsync(`
    DELETE FROM strava_sync_log;
    DELETE FROM workout_sets;
    DELETE FROM workout_sessions;
    DELETE FROM daily_log;
    DELETE FROM food_entries;
    DELETE FROM macro_targets;
  `);

  switch (scenario as ScenarioKey) {
    case "completed-workout":
      await seedCompletedWorkout(db);
      break;
    case "workout-history":
      await seedWorkoutHistory(db);
      break;
    case "advanced-sets":
      await seedAdvancedSets(db);
      break;
    case "form-clips":
      await seedFormClips(db);
      break;
    case "store-showcase":
      await seedStoreShowcase(db);
      break;
  }

  // Flag the page as ready for screenshot capture.
  if (typeof document !== "undefined" && document.body) {
    document.body.dataset.testReady = "true";
  }
}

// Exported for unit tests; also lets scenario specs exercise fixtures directly.
export async function seedCompletedWorkout(
  db: Awaited<ReturnType<typeof getDatabase>>,
): Promise<void> {
  // BLD-662: timestamps MUST be milliseconds — production writes
  // `started_at: Date.now()` (lib/db/sessions.ts:134) and history queries
  // (`getSessionCountsByDay`, `getAllCompletedSessionWeeks`,
  // `getSessionsByMonth`) all assume ms. Seeding seconds caused the heatmap
  // / streak / dotMap aggregations to filter every seeded row out.
  const now = Date.now();
  const started = now - 60 * 60 * 1000; // 1h ago
  const completed = now - 60 * 1000; // finished 1 minute ago

  await db.runAsync(
    `INSERT INTO workout_sessions
       (id, template_id, name, started_at, completed_at, duration_seconds, notes, rating)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "scenario-session-1",
      null,
      "Upper Body",
      started,
      completed,
      Math.floor((completed - started) / 1000),
      "",
      4,
    ],
  );

  // 3 exercises × 3 sets, with primary/secondary muscles spread so
  // MusclesWorkedCard (the BLD-480 offender) renders a real heatmap.
  // exercise_id values reference seeded exercises; we pick exercises that
  // exercise chest, back, and legs to exercise the full figure.
  const sets: Array<[string, string, number, number, number]> = [
    // [exercise_id, session_id, set_number, weight_kg, reps]
    ["bench-press", "scenario-session-1", 1, 60, 8],
    ["bench-press", "scenario-session-1", 2, 65, 6],
    ["bench-press", "scenario-session-1", 3, 70, 4],
    ["barbell-row", "scenario-session-1", 1, 55, 8],
    ["barbell-row", "scenario-session-1", 2, 60, 6],
    ["barbell-row", "scenario-session-1", 3, 65, 4],
    ["squat", "scenario-session-1", 1, 80, 8],
    ["squat", "scenario-session-1", 2, 85, 6],
    ["squat", "scenario-session-1", 3, 90, 4],
  ];

  let i = 0;
  for (const [exercise_id, session_id, set_number, weight, reps] of sets) {
    i += 1;
    await db.runAsync(
      `INSERT INTO workout_sets
         (id, session_id, exercise_id, set_number, weight, reps, completed, completed_at, exercise_position, set_type)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, 'normal')`,
      [
        `scenario-set-${i}`,
        session_id,
        exercise_id,
        set_number,
        weight,
        reps,
        completed,
        Math.floor((i - 1) / 3),
      ],
    );
  }
}

export async function seedWorkoutHistory(
  db: Awaited<ReturnType<typeof getDatabase>>,
): Promise<void> {
  // BLD-662: milliseconds, see seedCompletedWorkout above.
  const now = Date.now();
  const names = ["Upper Body", "Lower Body", "Push Day", "Pull Day", "Legs"];

  for (let i = 0; i < names.length; i += 1) {
    const daysAgo = i + 1;
    const started = now - daysAgo * 24 * 60 * 60 * 1000;
    const duration = 45 * 60 + i * 5 * 60; // 45–65 minutes (seconds — duration_seconds column)
    const completed = started + duration * 1000;

    await db.runAsync(
      `INSERT INTO workout_sessions
         (id, template_id, name, started_at, completed_at, duration_seconds, notes, rating)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `scenario-history-${i + 1}`,
        null,
        names[i],
        started,
        completed,
        duration,
        "",
        4,
      ],
    );

    // 2 sets per session keeps the fixtures small but non-empty.
    for (let s = 1; s <= 2; s += 1) {
      await db.runAsync(
        `INSERT INTO workout_sets
           (id, session_id, exercise_id, set_number, weight, reps, completed, completed_at, exercise_position, set_type)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, 0, 'normal')`,
        [
          `scenario-history-set-${i + 1}-${s}`,
          `scenario-history-${i + 1}`,
          "bench-press",
          s,
          50 + s * 5,
          8,
          completed,
        ],
      );
    }
  }
}

/**
 * Seeds a single exercise with one completed workout set and no set_media row,
 * so FormLibraryTab renders with the Record CTA enabled.
 * Exercise id: "scenario-exercise-1".
 */
export async function seedFormClips(
  db: Awaited<ReturnType<typeof getDatabase>>,
): Promise<void> {
  const now = Date.now();
  const started = now - 60 * 60 * 1000;
  const completed = now - 60 * 1000;

  // Insert a minimal custom exercise the Form clips tab can navigate to.
  await db.runAsync(
    `INSERT OR IGNORE INTO exercises
       (id, name, category, primary_muscles, secondary_muscles, equipment, instructions, difficulty, is_custom)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "scenario-exercise-1",
      "Scenario Exercise",
      "strength",
      "[]",
      "[]",
      "cable",
      "",
      "beginner",
      1,
    ],
  );

  // One completed workout session.
  await db.runAsync(
    `INSERT OR IGNORE INTO workout_sessions
       (id, template_id, name, started_at, completed_at, duration_seconds, notes, rating)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "scenario-fc-session-1",
      null,
      "Form Clips Session",
      started,
      completed,
      Math.floor((completed - started) / 1000),
      "",
      4,
    ],
  );

  // One completed set — no set_media row, so Record CTA is enabled.
  await db.runAsync(
    `INSERT OR IGNORE INTO workout_sets
       (id, session_id, exercise_id, set_number, weight, reps, completed, completed_at, exercise_position, set_type)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, 0, 'normal')`,
    [
      "scenario-fc-set-1",
      "scenario-fc-session-1",
      "scenario-exercise-1",
      1,
      40,
      10,
      completed,
    ],
  );
}

// AC #265: seeds a completed session with one rest_pause set (8+3+2 @ 100 kg)
// and its three segments, so E2E specs can verify the production session-detail
// mount path renders advanced-set data correctly.
// Segments are inserted via bulkInsertSegments() to keep the cached-column
// invariant (cached_volume_kg / cached_e1rm_kg) consistent.
export async function seedAdvancedSets(
  db: Awaited<ReturnType<typeof getDatabase>>,
): Promise<void> {
  const now = Date.now();

  await db.runAsync(
    `INSERT OR IGNORE INTO exercises
       (id, name, category, primary_muscles, secondary_muscles, equipment, instructions, difficulty, is_custom)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ["scenario-adv-exercise-1", "Bench Press", "strength", "[]", "[]", "barbell", "", "intermediate", 0],
  );

  await db.runAsync(
    `INSERT OR IGNORE INTO workout_sessions
       (id, name, started_at, completed_at, notes)
     VALUES (?, ?, ?, ?, ?)`,
    ["scenario-advanced-session-1", "Advanced Sets E2E Session", now - 3600000, now - 100, null],
  );

  await db.runAsync(
    `INSERT OR IGNORE INTO workout_sets
       (id, session_id, exercise_id, set_number, weight, reps, completed, completed_at, exercise_position, set_type)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, 0, 'rest_pause')`,
    ["scenario-advanced-set-1", "scenario-advanced-session-1", "scenario-adv-exercise-1", 1, 100, 13, now - 200],
  );

  // Route through bulkInsertSegments so cached_volume_kg / cached_e1rm_kg stay in sync
  const segments: BulkSegmentInput[] = [
    { segmentNumber: 1, reps: 8, weight: 100, restAfterSeconds: 30, completedAt: now - 600 },
    { segmentNumber: 2, reps: 3, weight: 100, restAfterSeconds: 30, completedAt: now - 400 },
    { segmentNumber: 3, reps: 2, weight: 100, restAfterSeconds: null, completedAt: now - 200 },
  ];

  await bulkInsertSegments("scenario-advanced-set-1", segments);
}

export async function seedStoreShowcase(
  db: Awaited<ReturnType<typeof getDatabase>>,
): Promise<void> {
  // 1. Seed workout history so Workouts + Progress populate
  await seedWorkoutHistory(db);

  // 2. Seed nutrition
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const todayStr = `${y}-${m}-${day}`;
  const now = Date.now();

  // Macro target: 2000 cal, 150g protein, 250g carbs, 65g fat
  await db.runAsync(
    `INSERT INTO macro_targets (id, calories, protein, carbs, fat, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ["store-showcase-macro-target", 2000, 150, 250, 65, now]
  );

  // Food entries & Daily logs
  const mealsData = [
    {
      foodId: "food-oatmeal",
      name: "Oatmeal with Banana",
      calories: 350,
      protein: 12,
      carbs: 60,
      fat: 6,
      servingSize: "1 bowl",
      meal: "breakfast",
      servings: 1,
    },
    {
      foodId: "food-chicken",
      name: "Grilled Chicken & Rice",
      calories: 650,
      protein: 45,
      carbs: 85,
      fat: 12,
      servingSize: "1 plate",
      meal: "lunch",
      servings: 1,
    },
    {
      foodId: "food-shake",
      name: "Protein Shake & Almonds",
      calories: 450,
      protein: 35,
      carbs: 25,
      fat: 15,
      servingSize: "1 shake + 1oz nuts",
      meal: "snack",
      servings: 1,
    },
  ];

  for (let i = 0; i < mealsData.length; i++) {
    const meal = mealsData[i];
    await db.runAsync(
      `INSERT INTO food_entries (id, name, calories, protein, carbs, fat, serving_size, is_favorite, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [meal.foodId, meal.name, meal.calories, meal.protein, meal.carbs, meal.fat, meal.servingSize, now - i * 1000]
    );

    await db.runAsync(
      `INSERT INTO daily_log (id, food_entry_id, date, meal, servings, logged_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [`log-${meal.foodId}`, meal.foodId, todayStr, meal.meal, meal.servings, now - i * 1000]
    );
  }
}
