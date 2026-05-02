/**
 * BLD-938 — Behavioural contract for `getFilteredSessions` SQL composition.
 *
 * Why mirror-the-SQL via `node:sqlite` instead of mocking expo-sqlite?
 * The contract that matters here is the SQL planner's behaviour over real
 * rows — composition of WHERE clauses (template_id AND date >= ? AND
 * name LIKE ? AND EXISTS muscle…), the `total` semantics (count without
 * LIMIT/OFFSET), and the `year` preset semantics (calendar year, NOT a
 * rolling 365-day window — see QD R4 blocker / fix).
 *
 * Mocking expo-sqlite would assert that we *call* it with strings; this
 * file asserts that the strings, executed against a real SQLite, return
 * the right rows. Same precedent as `history-filters.test.ts`.
 *
 * The SQL strings in this file MUST stay structurally identical to
 * `lib/db/session-stats.ts`'s `getFilteredSessions` — when production
 * SQL changes, this file changes with it. The cost of the duplication
 * is the price of having a real-engine assertion that doesn't depend
 * on the production module being executable in Node.
 */

import { DatabaseSync } from "node:sqlite";

// -----------------------------------------------------------------------------
// SQL builder — mirrors getFilteredSessions in lib/db/session-stats.ts.
// Keep in lock-step with the production query.
// -----------------------------------------------------------------------------

type Filters = {
  templateId: string | null;
  muscleGroup: string | null;
  datePreset: "7d" | "30d" | "90d" | "year" | null;
};

function buildFilteredQuery(
  filters: Filters,
  textSearch: string,
  limit: number,
  offset: number,
  nowMs: number,
): { whereClause: string; params: (string | number)[]; pageParams: (string | number)[] } {
  const clauses: string[] = ["s.completed_at IS NOT NULL"];
  const params: (string | number)[] = [];

  if (filters.templateId) {
    clauses.push("s.template_id = ?");
    params.push(filters.templateId);
  }

  if (filters.datePreset) {
    let cutoff: number;
    if (filters.datePreset === "year") {
      const today = new Date(nowMs);
      cutoff = new Date(today.getFullYear(), 0, 1, 0, 0, 0, 0).getTime();
    } else {
      const ms =
        filters.datePreset === "7d" ? 7 * 24 * 60 * 60 * 1000 :
        filters.datePreset === "30d" ? 30 * 24 * 60 * 60 * 1000 :
        90 * 24 * 60 * 60 * 1000;
      cutoff = nowMs - ms;
    }
    clauses.push("s.started_at >= ?");
    params.push(cutoff);
  }

  if (textSearch.trim()) {
    clauses.push("s.name LIKE ?");
    params.push(`%${textSearch.trim()}%`);
  }

  if (filters.muscleGroup) {
    const m = filters.muscleGroup;
    clauses.push(
      `EXISTS (
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
       )`,
    );
    params.push(`%"${m}"%`);
    params.push(m);
    params.push(`${m},%`);
    params.push(`%,${m},%`);
    params.push(`%,${m}`);
    params.push(`%"${m}"%`);
    params.push(m);
    params.push(`${m},%`);
    params.push(`%,${m},%`);
    params.push(`%,${m}`);
  }

  return {
    whereClause: clauses.join(" AND "),
    params,
    pageParams: [...params, limit, offset],
  };
}

function runFiltered(
  db: DatabaseSync,
  filters: Filters,
  textSearch = "",
  limit = 20,
  offset = 0,
  nowMs = Date.now(),
): { rows: { id: string; name: string; started_at: number }[]; total: number } {
  const { whereClause, params, pageParams } = buildFilteredQuery(
    filters,
    textSearch,
    limit,
    offset,
    nowMs,
  );

  const countRow = db
    .prepare(`SELECT COUNT(*) AS total FROM workout_sessions s WHERE ${whereClause}`)
    .get(...params) as { total: number };

  const rows = db
    .prepare(
      `SELECT s.id, s.name, s.started_at
       FROM workout_sessions s
       WHERE ${whereClause}
       ORDER BY s.started_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...pageParams) as { id: string; name: string; started_at: number }[];

  return { rows, total: countRow.total };
}

// -----------------------------------------------------------------------------
// Test fixture
// -----------------------------------------------------------------------------

const NOW = new Date(2026, 5, 15, 12, 0, 0).getTime(); // June 15 2026, noon
const ONE_DAY = 24 * 60 * 60 * 1000;

describe("BLD-938 — getFilteredSessions composition (behavioural contract)", () => {
  let db: DatabaseSync;

  beforeAll(() => {
    db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE exercises (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        primary_muscles TEXT NOT NULL,
        secondary_muscles TEXT NOT NULL
      );
      CREATE TABLE workout_sessions (
        id TEXT PRIMARY KEY,
        template_id TEXT,
        name TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER
      );
      CREATE TABLE workout_sets (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        exercise_id TEXT NOT NULL
      );
    `);

    const exInsert = db.prepare(
      "INSERT INTO exercises (id, name, primary_muscles, secondary_muscles) VALUES (?, ?, ?, ?)",
    );
    exInsert.run("ex-bench", "Bench", '["chest","shoulders"]', '["triceps"]');
    exInsert.run("ex-squat", "Squat", "quads,glutes", "hamstrings");
    exInsert.run("ex-row", "Row", "back,biceps", "");

    const sInsert = db.prepare(
      "INSERT INTO workout_sessions (id, template_id, name, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
    );
    const setInsert = db.prepare(
      "INSERT INTO workout_sets (id, session_id, exercise_id) VALUES (?, ?, ?)",
    );

    // Seed a mix of sessions across templates and dates.
    // Layout (relative to NOW = 2026-06-15):
    //   sess-A  template-upper, name "Upper Body A", -1 day  (recent, this year)
    //   sess-B  template-upper, name "Upper Body A", -45 days (this year)
    //   sess-C  template-upper, name "Upper Body A", -200 days (this year, > 90d)
    //   sess-D  template-lower, name "Leg Day",       -2 days
    //   sess-E  template-lower, name "Leg Day",       -100 days
    //   sess-X  NULL template,  name "Ad Hoc Lift",   -3 days   (excluded by template filter)
    //   sess-Y  template-upper, name "Upper Body A", -400 days (LAST YEAR — must be excluded by "year" preset)
    //   sess-Z  template-upper, name "Upper Body A", -1 day, completed_at NULL (in-progress — must be excluded)
    const seed: [string, string | null, string, number, number | null, string][] = [
      ["sess-A", "template-upper", "Upper Body A", NOW - 1 * ONE_DAY, NOW - 1 * ONE_DAY + 3600000, "ex-bench"],
      ["sess-B", "template-upper", "Upper Body A", NOW - 45 * ONE_DAY, NOW - 45 * ONE_DAY + 3600000, "ex-bench"],
      ["sess-C", "template-upper", "Upper Body A", NOW - 200 * ONE_DAY, NOW - 200 * ONE_DAY + 3600000, "ex-bench"],
      ["sess-D", "template-lower", "Leg Day", NOW - 2 * ONE_DAY, NOW - 2 * ONE_DAY + 3600000, "ex-squat"],
      ["sess-E", "template-lower", "Leg Day", NOW - 100 * ONE_DAY, NOW - 100 * ONE_DAY + 3600000, "ex-squat"],
      ["sess-X", null, "Ad Hoc Lift", NOW - 3 * ONE_DAY, NOW - 3 * ONE_DAY + 3600000, "ex-row"],
      ["sess-Y", "template-upper", "Upper Body A", NOW - 400 * ONE_DAY, NOW - 400 * ONE_DAY + 3600000, "ex-bench"],
      ["sess-Z", "template-upper", "Upper Body A", NOW - 1 * ONE_DAY, null, "ex-bench"], // in-progress
    ];
    for (const [id, tid, name, started, completed, exId] of seed) {
      sInsert.run(id, tid, name, started, completed);
      setInsert.run(`set-${id}`, id, exId);
    }
  });

  afterAll(() => {
    db.close();
  });

  describe("base predicate", () => {
    it("excludes in-progress sessions (completed_at IS NULL)", () => {
      const result = runFiltered(db, { templateId: null, muscleGroup: null, datePreset: null }, "", 100, 0, NOW);
      // 7 completed sessions seeded (sess-Z is in-progress and excluded).
      expect(result.total).toBe(7);
      expect(result.rows.map((r) => r.id)).not.toContain("sess-Z");
    });
  });

  describe("template filter", () => {
    it("filters by stable template_id and excludes ad-hoc (NULL template_id) sessions", () => {
      const result = runFiltered(
        db,
        { templateId: "template-upper", muscleGroup: null, datePreset: null },
        "",
        100, 0, NOW,
      );
      // Upper has A, B, C, Y; Z is in-progress. X is ad-hoc and must be excluded.
      expect(result.total).toBe(4);
      expect(result.rows.map((r) => r.id).sort()).toEqual(["sess-A", "sess-B", "sess-C", "sess-Y"]);
    });

    it("returns no rows for an unknown template_id", () => {
      const result = runFiltered(
        db,
        { templateId: "template-does-not-exist", muscleGroup: null, datePreset: null },
        "",
        100, 0, NOW,
      );
      expect(result).toEqual({ rows: [], total: 0 });
    });
  });

  describe("date preset semantics", () => {
    it('"7d" — only sessions in the last 7 days', () => {
      const result = runFiltered(
        db,
        { templateId: null, muscleGroup: null, datePreset: "7d" },
        "", 100, 0, NOW,
      );
      // Sessions within 7 days of NOW: A (-1), D (-2), X (-3). B is at -45 days.
      expect(result.rows.map((r) => r.id).sort()).toEqual(["sess-A", "sess-D", "sess-X"]);
    });

    it('"30d" — only sessions in the last 30 days', () => {
      const result = runFiltered(
        db,
        { templateId: null, muscleGroup: null, datePreset: "30d" },
        "", 100, 0, NOW,
      );
      // Same as 7d here (B is at -45, just outside 30d).
      expect(result.rows.map((r) => r.id).sort()).toEqual(["sess-A", "sess-D", "sess-X"]);
    });

    it('"90d" — sessions in the last 90 days (includes -45)', () => {
      const result = runFiltered(
        db,
        { templateId: null, muscleGroup: null, datePreset: "90d" },
        "", 100, 0, NOW,
      );
      // -1, -2, -3, -45 within window; -100 and -200 outside.
      expect(result.rows.map((r) => r.id).sort()).toEqual([
        "sess-A", "sess-B", "sess-D", "sess-X",
      ]);
    });

    it('"year" — calendar year (Jan 1 of THIS year), NOT a rolling 365-day window', () => {
      // QD R4 blocker resolution: NOW = 2026-06-15. "year" must mean
      // started_at >= 2026-01-01 00:00:00 local, i.e. ~165 days back.
      // sess-C is at -200 days (~Nov 2025) — must be EXCLUDED.
      // A rolling 365-day window would have INCLUDED -200, which was the bug.
      const result = runFiltered(
        db,
        { templateId: null, muscleGroup: null, datePreset: "year" },
        "", 100, 0, NOW,
      );
      const ids = result.rows.map((r) => r.id).sort();
      // Within calendar 2026: A (-1), B (-45), D (-2), E (-100), X (-3).
      // Excluded: C (-200, last calendar year), Y (-400, prior year).
      expect(ids).toEqual(["sess-A", "sess-B", "sess-D", "sess-E", "sess-X"]);
      expect(ids).not.toContain("sess-C"); // <— the regression guard
      expect(ids).not.toContain("sess-Y");
    });
  });

  describe("text search", () => {
    it("matches s.name LIKE %search%", () => {
      const result = runFiltered(
        db,
        { templateId: null, muscleGroup: null, datePreset: null },
        "Leg",
        100, 0, NOW,
      );
      expect(result.rows.map((r) => r.id).sort()).toEqual(["sess-D", "sess-E"]);
    });

    it("trims whitespace before matching", () => {
      const result = runFiltered(
        db,
        { templateId: null, muscleGroup: null, datePreset: null },
        "   Leg   ",
        100, 0, NOW,
      );
      expect(result.total).toBe(2);
    });
  });

  describe("composition (AND across all clauses)", () => {
    it("template + date 30d returns intersection", () => {
      // Upper templates within 30 days: only sess-A (-1). B is at -45.
      const result = runFiltered(
        db,
        { templateId: "template-upper", muscleGroup: null, datePreset: "30d" },
        "", 100, 0, NOW,
      );
      expect(result.rows.map((r) => r.id)).toEqual(["sess-A"]);
    });

    it("template + text search returns intersection (no false positives from name match)", () => {
      // sess-X is named "Ad Hoc Lift" — different name. Filter for
      // template-upper AND search "Upper" returns only template-upper rows
      // and never sess-X even if its name happened to also contain "Upper".
      const result = runFiltered(
        db,
        { templateId: "template-upper", muscleGroup: null, datePreset: null },
        "Upper",
        100, 0, NOW,
      );
      expect(result.rows.map((r) => r.id).sort()).toEqual(["sess-A", "sess-B", "sess-C", "sess-Y"]);
      expect(result.rows.map((r) => r.id)).not.toContain("sess-X");
    });

    it("template + muscle + date all combined", () => {
      // Upper template + chest muscle (bench-press primary) + last 90 days.
      // bench is in sess-A, B, C, Y. Within 90d: A (-1), B (-45). So [A, B].
      const result = runFiltered(
        db,
        { templateId: "template-upper", muscleGroup: "chest", datePreset: "90d" },
        "", 100, 0, NOW,
      );
      expect(result.rows.map((r) => r.id).sort()).toEqual(["sess-A", "sess-B"]);
    });
  });

  describe("pagination + total semantics", () => {
    it("total reflects all matching rows; LIMIT/OFFSET only narrows the slice", () => {
      // Use template-upper which has 4 completed sessions.
      const all = runFiltered(
        db,
        { templateId: "template-upper", muscleGroup: null, datePreset: null },
        "", 100, 0, NOW,
      );
      expect(all.total).toBe(4);
      expect(all.rows).toHaveLength(4);

      const page0 = runFiltered(
        db,
        { templateId: "template-upper", muscleGroup: null, datePreset: null },
        "", 2, 0, NOW,
      );
      expect(page0.total).toBe(4);            // total is unchanged
      expect(page0.rows).toHaveLength(2);      // page is 2 rows
      // Sorted DESC by started_at: A (-1), B (-45) come first.
      expect(page0.rows.map((r) => r.id)).toEqual(["sess-A", "sess-B"]);

      const page1 = runFiltered(
        db,
        { templateId: "template-upper", muscleGroup: null, datePreset: null },
        "", 2, 2, NOW,
      );
      expect(page1.total).toBe(4);
      expect(page1.rows).toHaveLength(2);
      expect(page1.rows.map((r) => r.id)).toEqual(["sess-C", "sess-Y"]);
    });

    it("offset past the end returns zero rows but keeps the correct total", () => {
      const out = runFiltered(
        db,
        { templateId: "template-upper", muscleGroup: null, datePreset: null },
        "", 20, 100, NOW,
      );
      expect(out.total).toBe(4);
      expect(out.rows).toEqual([]);
    });
  });
});
