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
  "form-clips",
  "advanced-sets",
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
       (id, name, started_at, completed_at, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ["scenario-advanced-session-1", "Advanced Sets E2E Session", now - 3600000, now - 100, null, now - 3600000],
  );

  await db.runAsync(
    `INSERT OR IGNORE INTO workout_sets
       (id, session_id, exercise_id, set_number, weight, reps, completed, completed_at, exercise_position, set_type)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, 0, 'rest_pause')`,
    ["scenario-advanced-set-1", "scenario-advanced-session-1", "scenario-adv-exercise-1", 1, 100, 13, now - 200],
  );

  const segments: [string, string, number, number, number, number | null, number][] = [
    ["scenario-seg-1", "scenario-advanced-set-1", 1, 8, 100, 30, now - 600],
    ["scenario-seg-2", "scenario-advanced-set-1", 2, 3, 100, 30, now - 400],
    ["scenario-seg-3", "scenario-advanced-set-1", 3, 2, 100, null, now - 200],
  ];

  for (const [id, setId, segNum, reps, weight, rest, createdAt] of segments) {
    await db.runAsync(
      `INSERT OR IGNORE INTO workout_set_segments
         (id, set_id, segment_number, reps, weight, rest_after_seconds, completed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, setId, segNum, reps, weight, rest, createdAt, createdAt],
    );
  }
}
