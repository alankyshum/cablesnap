/**
 * BLD-938 — Behavioural contract for the muscle-group dual-format LIKE
 * pattern used by `getFilteredSessions` (lib/db/session-stats.ts).
 *
 * The production query binds the same muscle string into 10 LIKE clauses
 * spanning JSON / CSV-only / CSV-start / CSV-middle / CSV-end variants,
 * across BOTH `primary_muscles` and `secondary_muscles`. Mocking
 * expo-sqlite here would prove nothing — the contract is the SQL
 * planner's behaviour over real strings. So we re-execute the same
 * pattern against an in-memory `node:sqlite` engine (BLD-822 precedent
 * — see grip-history-query-plan.test.ts) and assert the row-level
 * semantics:
 *
 *   1. JSON storage with the muscle present matches.
 *   2. CSV storage with the muscle present matches in any position
 *      (only / start / middle / end).
 *   3. The same patterns apply to `secondary_muscles` (so push-ups
 *      surface under "triceps").
 *   4. Substring-collision protection: a filter for `back` does NOT
 *      match an exercise whose only muscle is `upper_back`, in either
 *      storage format.
 */

import { DatabaseSync } from "node:sqlite";

// Mirrors the literal LIKE pattern emitted by getFilteredSessions for
// the muscle-group filter. Keep this in sync with lib/db/session-stats.ts.
const MUSCLE_FILTER_SQL = `
  SELECT s.id FROM workout_sessions s
  WHERE s.completed_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM workout_sets ws2
      JOIN exercises e ON ws2.exercise_id = e.id
      WHERE ws2.session_id = s.id
        AND (
          e.primary_muscles LIKE ?
          OR e.primary_muscles = ?
          OR e.primary_muscles LIKE ?
          OR e.primary_muscles LIKE ?
          OR e.primary_muscles LIKE ?
          OR e.secondary_muscles LIKE ?
          OR e.secondary_muscles = ?
          OR e.secondary_muscles LIKE ?
          OR e.secondary_muscles LIKE ?
          OR e.secondary_muscles LIKE ?
        )
    )
  ORDER BY s.started_at DESC
`;

function muscleParams(muscle: string): string[] {
  return [
    `%"${muscle}"%`,    // JSON in primary
    muscle,              // CSV only in primary
    `${muscle},%`,       // CSV start in primary
    `%,${muscle},%`,     // CSV middle in primary
    `%,${muscle}`,       // CSV end in primary
    `%"${muscle}"%`,    // JSON in secondary
    muscle,              // CSV only in secondary
    `${muscle},%`,       // CSV start in secondary
    `%,${muscle},%`,     // CSV middle in secondary
    `%,${muscle}`,       // CSV end in secondary
  ];
}

describe("BLD-938 — muscle-group filter LIKE pattern (behavioural contract)", () => {
  let db: DatabaseSync;

  beforeAll(() => {
    db = new DatabaseSync(":memory:");

    // Mirror just the columns the muscle filter touches. Exercise rows
    // exercise both storage formats.
    db.exec(`
      CREATE TABLE exercises (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        primary_muscles TEXT NOT NULL,
        secondary_muscles TEXT NOT NULL
      );

      CREATE TABLE workout_sessions (
        id TEXT PRIMARY KEY,
        started_at INTEGER NOT NULL,
        completed_at INTEGER
      );

      CREATE TABLE workout_sets (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        exercise_id TEXT NOT NULL
      );
    `);

    const insertExercise = db.prepare(
      "INSERT INTO exercises (id, name, primary_muscles, secondary_muscles) VALUES (?, ?, ?, ?)"
    );
    const insertSession = db.prepare(
      "INSERT INTO workout_sessions (id, started_at, completed_at) VALUES (?, ?, ?)"
    );
    const insertSet = db.prepare(
      "INSERT INTO workout_sets (id, session_id, exercise_id) VALUES (?, ?, ?)"
    );

    // Exercise inventory exercising every storage shape the filter must
    // honour. The first pair of columns is primary, the second secondary.
    const exercises: [string, string, string, string][] = [
      // JSON format, multi-value primary, simple secondary
      ["ex-bench-press", "Bench Press", '["chest","shoulders"]', '["triceps"]'],
      // CSV format, only-token primary
      ["ex-leg-extension", "Leg Extension", "quads", ""],
      // CSV format, multi-value primary at the start position
      ["ex-deadlift", "Deadlift", "back,glutes,hamstrings", "forearms"],
      // CSV format, multi-value primary at the middle position
      ["ex-row", "Cable Row", "lats,back,biceps", "rear_delts"],
      // CSV format, multi-value primary at the end position
      ["ex-pulldown", "Lat Pulldown", "lats,biceps,back", ""],
      // Substring-collision exercise: ONLY upper_back. Must NOT match
      // a `back` filter in either format.
      ["ex-shrug", "Upper-Back Shrug (CSV)", "upper_back", ""],
      ["ex-shrug-json", "Upper-Back Shrug (JSON)", '["upper_back"]', '[]'],
      // Push-ups: secondary triceps via JSON. Per QD R3, must surface
      // under the "triceps" filter.
      ["ex-pushup", "Push-ups", '["chest"]', '["triceps","shoulders"]'],
      // Cable raise: secondary triceps via CSV (start position).
      ["ex-cable-raise", "Cable Front Raise", "shoulders", "triceps,chest"],
    ];
    for (const row of exercises) insertExercise.run(...row);

    // Sessions and the sets that link them to exercises. Each session has
    // exactly one set for clarity. completed_at is set so the WHERE
    // completed_at IS NOT NULL clause passes.
    const now = Date.now();
    const sessions: [string, string, number][] = [
      ["sess-bench", "ex-bench-press", now - 6 * 86400000],
      ["sess-leg", "ex-leg-extension", now - 5 * 86400000],
      ["sess-dl", "ex-deadlift", now - 4 * 86400000],
      ["sess-row", "ex-row", now - 3 * 86400000],
      ["sess-pull", "ex-pulldown", now - 2 * 86400000],
      ["sess-shrug-csv", "ex-shrug", now - 8 * 86400000],
      ["sess-shrug-json", "ex-shrug-json", now - 9 * 86400000],
      ["sess-pushup", "ex-pushup", now - 1 * 86400000],
      ["sess-cable-raise", "ex-cable-raise", now - 7 * 86400000],
    ];
    for (const [sessId, exId, started] of sessions) {
      insertSession.run(sessId, started, started + 1800000);
      insertSet.run(`set-${sessId}`, sessId, exId);
    }
  });

  afterAll(() => {
    db.close();
  });

  function ids(muscle: string): string[] {
    const stmt = db.prepare(MUSCLE_FILTER_SQL);
    const rows = stmt.all(...muscleParams(muscle)) as { id: string }[];
    return rows.map((r) => r.id).sort();
  }

  describe("JSON storage format", () => {
    it("matches a JSON-quoted value in primary_muscles", () => {
      // bench-press primary contains "chest" via JSON
      expect(ids("chest")).toContain("sess-bench");
      // push-ups primary is JSON ["chest"]
      expect(ids("chest")).toContain("sess-pushup");
    });

    it("matches a JSON-quoted value in secondary_muscles", () => {
      // bench-press secondary contains "triceps" via JSON
      expect(ids("triceps")).toContain("sess-bench");
      // push-ups secondary contains "triceps" via JSON
      expect(ids("triceps")).toContain("sess-pushup");
    });
  });

  describe("CSV storage format", () => {
    it("matches an only-token CSV primary_muscles", () => {
      // leg-extension primary = "quads"
      expect(ids("quads")).toEqual(["sess-leg"]);
    });

    it("matches a start-position CSV primary_muscles", () => {
      // deadlift primary = "back,glutes,hamstrings" — start
      expect(ids("back")).toContain("sess-dl");
    });

    it("matches a middle-position CSV primary_muscles", () => {
      // row primary = "lats,back,biceps" — middle
      expect(ids("back")).toContain("sess-row");
    });

    it("matches an end-position CSV primary_muscles", () => {
      // pulldown primary = "lats,biceps,back" — end
      expect(ids("back")).toContain("sess-pull");
    });

    it("matches a start-position CSV secondary_muscles", () => {
      // cable-raise secondary = "triceps,chest" — start
      expect(ids("triceps")).toContain("sess-cable-raise");
    });
  });

  describe("substring-collision safety (plan §JSON-substring collision risk)", () => {
    it("filter for 'back' does NOT match upper_back in CSV storage", () => {
      // ex-shrug primary = "upper_back" — must not surface under 'back'
      const matches = ids("back");
      expect(matches).not.toContain("sess-shrug-csv");
    });

    it("filter for 'back' does NOT match upper_back in JSON storage", () => {
      // ex-shrug-json primary = ["upper_back"] — must not surface under 'back'
      const matches = ids("back");
      expect(matches).not.toContain("sess-shrug-json");
    });

    it("filter for 'upper_back' DOES match upper_back exercises", () => {
      // Sanity: the more specific filter still works
      const matches = ids("upper_back");
      expect(matches).toEqual(
        expect.arrayContaining(["sess-shrug-csv", "sess-shrug-json"])
      );
    });
  });

  describe("set composition", () => {
    it("'back' returns exactly the deadlift, row, and pulldown sessions", () => {
      // Three exercises explicitly tagged with the 'back' token (start /
      // middle / end). upper_back exercises are correctly excluded.
      expect(ids("back")).toEqual(["sess-dl", "sess-pull", "sess-row"]);
    });

    it("'triceps' returns bench / pushup / cable-raise (mixed JSON+CSV secondary)", () => {
      expect(ids("triceps")).toEqual([
        "sess-bench",
        "sess-cable-raise",
        "sess-pushup",
      ]);
    });

    it("a muscle absent from every exercise returns no sessions", () => {
      expect(ids("calves")).toEqual([]);
    });
  });
});
