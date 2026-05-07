/**
 * BLD-1086 — Regression test for `bestPerVariant` SQL correctness.
 *
 * Asserts that the fixed ROW_NUMBER() form returns the reps + completed_at of
 * the *max-weight* set (not an arbitrary row), which the previous bare-column
 * form failed to guarantee under SQLite's two-MAX() rule:
 * https://www.sqlite.org/lang_select.html#bareagg
 *
 * Scenario per CEO recovery comment on BLD-1086 / PR #520:
 *   sets for (cable-pushdown, rope, high, neutral, kg):
 *     (weight=100, reps= 5, ts=100)   ← actual PR — best e1RM ≈ 116.7
 *     (weight= 50, reps=20, ts=200)   ← latest set, lighter
 *     (weight= 80, reps= 8, ts=150)
 *
 *   expected: max_weight=100, best_reps=5, achieved_at=100
 *
 * Engine: node:sqlite (Node v22+ built-in). Same SQLite3 query planner as
 * expo-sqlite (both ship SQLite ≥ 3.45). The bare-column bug class CANNOT be
 * caught by mocked tests — this requires a real engine.
 */

import { DatabaseSync } from "node:sqlite";

const BEST_PER_VARIANT_SQL = `
  SELECT
     ws.attachment,
     ws.mount_position,
     ws.grip_type,
     ws.stack_unit_at_log,
     MAX(ws.weight)                                   AS max_weight,
     best.reps                                        AS best_reps,
     best.completed_at                                AS achieved_at,
     COUNT(DISTINCT ws.session_id)                    AS session_count
   FROM workout_sets ws
   INNER JOIN workout_sessions wss ON ws.session_id = wss.id
   LEFT JOIN (
     SELECT
       ws_b.exercise_id,
       ws_b.attachment,
       ws_b.mount_position,
       ws_b.grip_type,
       ws_b.stack_unit_at_log,
       ws_b.reps,
       ws_b.completed_at,
       ROW_NUMBER() OVER (
         PARTITION BY ws_b.exercise_id,
                      ws_b.attachment,
                      ws_b.mount_position,
                      ws_b.grip_type,
                      ws_b.stack_unit_at_log
         ORDER BY ws_b.weight DESC, ws_b.completed_at DESC
       ) AS rn
     FROM workout_sets ws_b
     INNER JOIN workout_sessions wss_b ON ws_b.session_id = wss_b.id
     WHERE ws_b.exercise_id = ?
       AND ws_b.completed = 1
       AND ws_b.weight IS NOT NULL AND ws_b.weight > 0
       AND ws_b.set_type != 'warmup'
       AND wss_b.completed_at IS NOT NULL
   ) best ON best.rn = 1
         AND best.exercise_id = ws.exercise_id
         AND best.attachment IS ws.attachment
         AND best.mount_position IS ws.mount_position
         AND best.grip_type IS ws.grip_type
         AND best.stack_unit_at_log IS ws.stack_unit_at_log
   WHERE ws.exercise_id = ?
     AND ws.completed = 1
     AND ws.weight IS NOT NULL AND ws.weight > 0
     AND ws.set_type != 'warmup'
     AND wss.completed_at IS NOT NULL
   GROUP BY ws.exercise_id,
            ws.attachment,
            ws.mount_position,
            ws.grip_type,
            ws.stack_unit_at_log
   ORDER BY best.completed_at DESC
`;

type Row = {
  attachment: string | null;
  mount_position: string | null;
  grip_type: string | null;
  stack_unit_at_log: string | null;
  max_weight: number;
  best_reps: number;
  achieved_at: number;
  session_count: number;
};

function makeDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE workout_sessions (
      id TEXT PRIMARY KEY,
      completed_at INTEGER
    );
    CREATE TABLE workout_sets (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      weight REAL,
      reps INTEGER,
      completed INTEGER NOT NULL DEFAULT 1,
      set_type TEXT NOT NULL DEFAULT 'normal',
      completed_at INTEGER,
      attachment TEXT,
      mount_position TEXT,
      grip_type TEXT,
      stack_unit_at_log TEXT
    );
  `);
  return db;
}

function insertSet(
  db: DatabaseSync,
  id: string,
  sessionId: string,
  exerciseId: string,
  weight: number,
  reps: number,
  ts: number,
  variant: { att: string | null; mount: string | null; grip: string | null; unit: string | null },
) {
  db.prepare(
    `INSERT OR IGNORE INTO workout_sessions (id, completed_at) VALUES (?, ?)`,
  ).run(sessionId, ts + 1);
  db.prepare(
    `INSERT INTO workout_sets
       (id, session_id, exercise_id, weight, reps, completed, set_type, completed_at,
        attachment, mount_position, grip_type, stack_unit_at_log)
     VALUES (?, ?, ?, ?, ?, 1, 'normal', ?, ?, ?, ?, ?)`,
  ).run(id, sessionId, exerciseId, weight, reps, ts, variant.att, variant.mount, variant.grip, variant.unit);
}

describe("BLD-1086 — bestPerVariant SQL correctness (real SQLite engine)", () => {
  test("PR-then-lighter scenario: bare-column bug regression — best_reps + achieved_at come from the max-weight set", () => {
    const db = makeDb();
    const ex = "cable-triceps-pushdown";
    const v = { att: "rope", mount: "high", grip: "neutral", unit: "kg" };

    // The actual PR — heaviest weight, mid-timestamp
    insertSet(db, "s1", "sess-A", ex, 100, 5, 100, v);
    // Later, lighter set with high reps. Under the buggy bare-column form,
    // SQLite picks reps=20 / ts=200 from this row.
    insertSet(db, "s2", "sess-B", ex, 50, 20, 200, v);
    insertSet(db, "s3", "sess-C", ex, 80, 8, 150, v);

    const rows = db.prepare(BEST_PER_VARIANT_SQL).all(ex, ex) as Row[];

    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.max_weight).toBe(100);
    expect(r.best_reps).toBe(5);          // ← would be 20 (or undefined) under bare-column bug
    expect(r.achieved_at).toBe(100);      // ← would be 200 under MAX(completed_at) bug
    expect(r.session_count).toBe(3);

    // e1rm sanity (epley): 100 * (1 + 5/30) ≈ 116.67
    const e1rm = r.max_weight * (1 + r.best_reps / 30);
    expect(e1rm).toBeCloseTo(116.67, 1);

    db.close();
  });

  test("four-bucket NULL matrix: (rope,high), (rope,null), (null,high), (null,null) are four distinct rows", () => {
    const db = makeDb();
    const ex = "cable-row";

    insertSet(db, "a1", "s-a", ex, 30,  8, 1000, { att: "rope", mount: "high", grip: null, unit: "kg" });
    insertSet(db, "b1", "s-b", ex, 28,  8, 2000, { att: "rope", mount: null,   grip: null, unit: "kg" });
    insertSet(db, "c1", "s-c", ex, 25, 10, 3000, { att: null,   mount: "high", grip: null, unit: "kg" });
    insertSet(db, "d1", "s-d", ex, 20, 12, 4000, { att: null,   mount: null,   grip: null, unit: null });

    const rows = db.prepare(BEST_PER_VARIANT_SQL).all(ex, ex) as Row[];

    expect(rows).toHaveLength(4);
    const keys = rows.map((r) => `${r.attachment}|${r.mount_position}|${r.stack_unit_at_log}`);
    expect(keys).toContain("rope|high|kg");
    expect(keys).toContain("rope|null|kg");
    expect(keys).toContain("null|high|kg");
    expect(keys).toContain("null|null|null");

    // Each row's best_reps/achieved_at line up with its single set
    const ropeHigh = rows.find((r) => r.attachment === "rope" && r.mount_position === "high")!;
    expect(ropeHigh.max_weight).toBe(30);
    expect(ropeHigh.best_reps).toBe(8);
    expect(ropeHigh.achieved_at).toBe(1000);

    db.close();
  });

  test("ties on weight: deterministic — most recent completed_at wins", () => {
    const db = makeDb();
    const ex = "cable-curl";
    const v = { att: "bar", mount: "low", grip: null, unit: "kg" };

    insertSet(db, "t1", "s-1", ex, 40, 10, 100, v);
    insertSet(db, "t2", "s-2", ex, 40,  6, 500, v);   // later wins on tie
    insertSet(db, "t3", "s-3", ex, 40,  8, 300, v);

    const [r] = db.prepare(BEST_PER_VARIANT_SQL).all(ex, ex) as Row[];

    expect(r.max_weight).toBe(40);
    expect(r.achieved_at).toBe(500);
    expect(r.best_reps).toBe(6);
    expect(r.session_count).toBe(3);

    db.close();
  });

  test("excludes warmup sets and incomplete sessions", () => {
    const db = makeDb();
    const ex = "cable-fly";
    const v = { att: "handle", mount: "mid", grip: null, unit: "kg" };

    insertSet(db, "w1", "s-real", ex, 25, 12, 1000, v);
    // warmup at higher weight — must be excluded
    db.prepare(
      `INSERT INTO workout_sets (id, session_id, exercise_id, weight, reps, completed, set_type, completed_at,
                                 attachment, mount_position, grip_type, stack_unit_at_log)
       VALUES ('w2', 's-real', ?, 50, 5, 1, 'warmup', 1500, ?, ?, ?, ?)`,
    ).run(ex, v.att, v.mount, v.grip, v.unit);
    // set in incomplete session — must be excluded
    db.prepare(`INSERT INTO workout_sessions (id, completed_at) VALUES ('s-open', NULL)`).run();
    db.prepare(
      `INSERT INTO workout_sets (id, session_id, exercise_id, weight, reps, completed, set_type, completed_at,
                                 attachment, mount_position, grip_type, stack_unit_at_log)
       VALUES ('w3', 's-open', ?, 60, 5, 1, 'normal', 2000, ?, ?, ?, ?)`,
    ).run(ex, v.att, v.mount, v.grip, v.unit);

    const rows = db.prepare(BEST_PER_VARIANT_SQL).all(ex, ex) as Row[];

    expect(rows).toHaveLength(1);
    expect(rows[0].max_weight).toBe(25);
    expect(rows[0].best_reps).toBe(12);

    db.close();
  });
});
