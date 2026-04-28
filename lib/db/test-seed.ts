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

export const SUPPORTED_SCENARIOS = [
  "completed-workout",
  "workout-history",
] as const;

export type ScenarioKey = (typeof SUPPORTED_SCENARIOS)[number];

declare global {
  interface Window {
    __TEST_SCENARIO__?: string;
  }
}

/** Only true inside the three guarded states. Exported for unit tests. */
export function guardsAllow(): boolean {
  // Read `__DEV__` and `Platform.OS` indirectly so babel-preset-expo doesn't
  // inline them at transform time. Tests need to flip these at runtime to
  // verify the guard, and inlining would freeze them at the build's values.
  const __dev = (globalThis as { __DEV__?: boolean }).__DEV__;
  if (typeof __dev === "undefined" || !__dev) return false;
  const platform: { OS: string } = Platform;
  if (platform.OS !== "web") return false;
  if (typeof window === "undefined") return false;
  if (!window.__TEST_SCENARIO__) return false;
  return true;
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
  await db.execAsync(`
    DELETE FROM workout_sets;
    DELETE FROM workout_sessions;
  `);

  switch (scenario as ScenarioKey) {
    case "completed-workout":
      await seedCompletedWorkout(db);
      break;
    case "workout-history":
      await seedWorkoutHistory(db);
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
