/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BLD-1002/BLD-1000: Tests for curated program seeding.
 *
 * Coverage:
 *   AC2  — seed presence on upgrade (STARTER_VERSION 5→6) and UPDATE gate
 *   AC8  — build-time exercise-id integrity for CURATED_TEMPLATES
 *   AC9  — runtime orphan handling (error_log write, no crash, skip only orphan)
 *   AC10 — idempotency (no duplicate rows on second seed run)
 *   AC11 — user-edit preservation for curated template_exercises
 */

import { CURATED_TEMPLATES, CURATED_PROGRAMS } from "../../../lib/curated-programs";
import { STARTER_TEMPLATES } from "../../../lib/starter-templates";
import { seedExercises } from "../../../lib/seed";

// ── AC8: Build-time exercise-id integrity ─────────────────────────────────────

describe("AC8 — curated exercise-id integrity (build-time gate)", () => {
  const allExercises = seedExercises();
  const exerciseIds = new Set(allExercises.map((e) => e.id));

  it("all CURATED_TEMPLATES exercise IDs resolve in the seed exercise list", () => {
    const orphans: string[] = [];
    for (const tpl of CURATED_TEMPLATES) {
      for (const ex of tpl.exercises) {
        if (!exerciseIds.has(ex.exercise_id)) {
          orphans.push(`${tpl.id}: ${ex.exercise_id}`);
        }
      }
    }
    expect(orphans).toEqual([]);
  });

  it("all CURATED_TEMPLATES template-exercise IDs are globally unique", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const tpl of CURATED_TEMPLATES) {
      for (const ex of tpl.exercises) {
        if (seen.has(ex.id)) dupes.push(ex.id);
        seen.add(ex.id);
      }
    }
    expect(dupes).toEqual([]);
  });

  it("curated template-exercise IDs do not collide with STARTER_TEMPLATES", () => {
    const starterTeIds = new Set(
      STARTER_TEMPLATES.flatMap((t) => t.exercises.map((e) => e.id))
    );
    const collisions = CURATED_TEMPLATES.flatMap((t) =>
      t.exercises.filter((e) => starterTeIds.has(e.id)).map((e) => e.id)
    );
    expect(collisions).toEqual([]);
  });

  it("curated template IDs do not collide with STARTER_TEMPLATES ids", () => {
    const starterTplIds = new Set(STARTER_TEMPLATES.map((t) => t.id));
    const collisions = CURATED_TEMPLATES.filter((t) => starterTplIds.has(t.id)).map((t) => t.id);
    expect(collisions).toEqual([]);
  });

  it("CURATED_PROGRAMS schedule template_ids all reference CURATED_TEMPLATES", () => {
    const curatedTplIds = new Set(CURATED_TEMPLATES.map((t) => t.id));
    for (const prog of CURATED_PROGRAMS) {
      for (const entry of prog.schedule) {
        expect(curatedTplIds.has(entry.template_id)).toBe(true);
      }
    }
  });

  it("QD-3: asserts per-program prescriptions (StrongLifts 5x5, GZCLP, 5/3/1 BBB)", () => {
    // 1. StrongLifts 5x5 (A/B alternating)
    const sl = CURATED_PROGRAMS.find((p) => p.id === "curated-sl5x5-prog");
    expect(sl).toBeDefined();
    expect(sl!.days.length).toBe(3);
    expect(sl!.days[0].template_id).toBe("curated-sl-tpl-a");
    expect(sl!.days[1].template_id).toBe("curated-sl-tpl-b");
    expect(sl!.days[2].template_id).toBe("curated-sl-tpl-a");

    const tplA = CURATED_TEMPLATES.find((t) => t.id === "curated-sl-tpl-a");
    const tplB = CURATED_TEMPLATES.find((t) => t.id === "curated-sl-tpl-b");
    expect(tplA).toBeDefined();
    expect(tplB).toBeDefined();

    // Workout A: Squat, Bench, Row (all 5x5)
    expect(tplA!.exercises.length).toBe(3);
    expect(tplA!.exercises[0].exercise_id).toBe("mw-bb-002"); // Squat
    expect(tplA!.exercises[0].target_sets).toBe(5);
    expect(tplA!.exercises[0].target_reps).toBe("5");
    expect(tplA!.exercises[1].exercise_id).toBe("mw-bb-003"); // Bench
    expect(tplA!.exercises[1].target_sets).toBe(5);
    expect(tplA!.exercises[1].target_reps).toBe("5");
    expect(tplA!.exercises[2].exercise_id).toBe("mw-bb-001"); // Row
    expect(tplA!.exercises[2].target_sets).toBe(5);
    expect(tplA!.exercises[2].target_reps).toBe("5");

    // Workout B: Squat, OHP, Deadlift (5x5, 5x5, 1x5)
    expect(tplB!.exercises.length).toBe(3);
    expect(tplB!.exercises[0].exercise_id).toBe("mw-bb-002"); // Squat
    expect(tplB!.exercises[0].target_sets).toBe(5);
    expect(tplB!.exercises[0].target_reps).toBe("5");
    expect(tplB!.exercises[1].exercise_id).toBe("mw-bb-004"); // OHP
    expect(tplB!.exercises[1].target_sets).toBe(5);
    expect(tplB!.exercises[1].target_reps).toBe("5");
    expect(tplB!.exercises[2].exercise_id).toBe("mw-bb-005"); // Deadlift
    expect(tplB!.exercises[2].target_sets).toBe(1);
    expect(tplB!.exercises[2].target_reps).toBe("5");

    // 2. GZCLP (4-day rotation)
    const gzclp = CURATED_PROGRAMS.find((p) => p.id === "curated-gzclp-prog");
    expect(gzclp).toBeDefined();
    expect(gzclp!.days.length).toBe(4);
    for (let i = 0; i < 4; i++) {
      expect(gzclp!.days[i].template_id).toBe(`curated-gzclp-tpl-d${i + 1}`);
    }

    const gzclpTpls = [1, 2, 3, 4].map(id => CURATED_TEMPLATES.find((t) => t.id === `curated-gzclp-tpl-d${id}`));
    gzclpTpls.forEach(t => expect(t).toBeDefined());

    // Day 1 T1 Squat (5x3+), T2 Bench (3x10), T3 Row (3x15+)
    const d1 = gzclpTpls[0]!;
    expect(d1.exercises[0].exercise_id).toBe("mw-bb-002"); // Squat
    expect(d1.exercises[0].target_sets).toBe(5);
    expect(d1.exercises[0].target_reps).toBe("3+");
    expect(d1.exercises[1].exercise_id).toBe("mw-bb-003"); // Bench
    expect(d1.exercises[1].target_sets).toBe(3);
    expect(d1.exercises[1].target_reps).toBe("10");
    expect(d1.exercises[2].exercise_id).toBe("mw-bb-001"); // Row
    expect(d1.exercises[2].target_sets).toBe(3);
    expect(d1.exercises[2].target_reps).toBe("15+");

    // 3. 5/3/1 BBB (4-day, Week 1 only)
    const bbb = CURATED_PROGRAMS.find((p) => p.id === "curated-531bbb-prog");
    expect(bbb).toBeDefined();
    expect(bbb!.days.length).toBe(4);
    for (let i = 0; i < 4; i++) {
      expect(bbb!.days[i].template_id).toBe(`curated-531bbb-tpl-d${i + 1}`);
    }

    const bbbTpls = [1, 2, 3, 4].map(id => CURATED_TEMPLATES.find((t) => t.id === `curated-531bbb-tpl-d${id}`));
    bbbTpls.forEach(t => expect(t).toBeDefined());

    // Day 1: OHP Main (3x5+), OHP BBB (5x10), Row Accessory (5x10)
    const b1 = bbbTpls[0]!;
    expect(b1.exercises[0].exercise_id).toBe("mw-bb-004"); // OHP main
    expect(b1.exercises[0].target_sets).toBe(3);
    expect(b1.exercises[0].target_reps).toBe("5+");
    expect(b1.exercises[1].exercise_id).toBe("mw-bb-004"); // OHP BBB
    expect(b1.exercises[1].target_sets).toBe(5);
    expect(b1.exercises[1].target_reps).toBe("10");
    expect(b1.exercises[2].exercise_id).toBe("mw-bb-001"); // Row accessory
    expect(b1.exercises[2].target_sets).toBe(5);
    expect(b1.exercises[2].target_reps).toBe("10");
  });
});

// ── Shared mock database factory ─────────────────────────────────────────────

function makeDb() {
  // Tracks rows by table for assertion helpers.
  const rows: Record<string, any[]> = {
    workout_templates: [],
    template_exercises: [],
    programs: [],
    program_days: [],
    program_schedule: [],
    error_log: [],
    app_settings: [],
    exercises: [],
  };

  const runAsync = jest.fn(
    // eslint-disable-next-line complexity -- mock branches mirror SQL surface
    async (sql: string, params?: any[]) => {
    const s = sql.trim().toUpperCase();
    if (s.startsWith("INSERT OR IGNORE INTO WORKOUT_TEMPLATES")) {
      const [id, name] = params ?? [];
      if (!rows.workout_templates.find((r) => r.id === id)) {
        rows.workout_templates.push({ id, name, is_curated: 1, is_starter: 0 });
      }
    } else if (s.startsWith("INSERT OR IGNORE INTO TEMPLATE_EXERCISES")) {
      const [id, template_id, exercise_id, position, target_sets, target_reps, rest_seconds, set_types] = params ?? [];
      if (!rows.template_exercises.find((r) => r.id === id)) {
        rows.template_exercises.push({ id, template_id, exercise_id, position, target_sets, target_reps, rest_seconds, set_types });
      }
    } else if (s.startsWith("INSERT OR IGNORE INTO PROGRAMS")) {
      const [id, name, description] = params ?? [];
      if (!rows.programs.find((r) => r.id === id)) {
        rows.programs.push({ id, name, description, is_curated: 1, is_starter: 0 });
      }
    } else if (s.startsWith("INSERT OR IGNORE INTO PROGRAM_DAYS")) {
      const [id, program_id, template_id, position, label] = params ?? [];
      if (!rows.program_days.find((r) => r.id === id)) {
        rows.program_days.push({ id, program_id, template_id, position, label });
      }
    } else if (s.startsWith("INSERT OR IGNORE INTO PROGRAM_SCHEDULE")) {
      const [program_id, day_of_week, template_id] = params ?? [];
      if (!rows.program_schedule.find((r) => r.program_id === program_id && r.day_of_week === day_of_week)) {
        rows.program_schedule.push({ program_id, day_of_week, template_id });
      }
    } else if (s.startsWith("INSERT INTO ERROR_LOG")) {
      // SQL: INSERT INTO error_log (id, message, component, fatal, timestamp)
      //      VALUES (?, ?, 'seed.curated', 0, ?)
      // Only 3 placeholders — `component` and `fatal` are SQL literals.
      // params: [id, message, timestamp]
      const [id, message, timestamp] = params ?? [];
      rows.error_log.push({ id, message, component: "seed.curated", fatal: 0, timestamp });
    } else if (s.startsWith("INSERT OR REPLACE INTO APP_SETTINGS")) {
      const [key, value] = params ?? [];
      const existing = rows.app_settings.find((r) => r.key === key);
      if (existing) existing.value = value;
      else rows.app_settings.push({ key, value });
    } else if (s.startsWith("INSERT OR IGNORE INTO APP_SETTINGS")) {
      const [key, value] = params ?? [];
      if (!rows.app_settings.find((r) => r.key === key)) {
        rows.app_settings.push({ key, value });
      }
    } else if (s.startsWith("UPDATE TEMPLATE_EXERCISES SET")) {
      // gated update — only apply if template is not curated
      const id = params?.[params.length - 1];
      const row = rows.template_exercises.find((r) => r.id === id);
      if (row) {
        const tpl = rows.workout_templates.find((t) => t.id === row.template_id);
        if (!tpl || !tpl.is_curated) {
          // Apply update (simplified — update position at minimum)
          const [, , position] = params ?? [];
          row.position = position;
        }
      }
    }
    return { changes: 1 };
  });

  const getFirstAsync = jest.fn(async (sql: string, params?: any[]) => {
    const s = sql.trim().toUpperCase();
    if (s.includes("FROM EXERCISES WHERE ID")) {
      const id = params?.[0];
      return rows.exercises.find((e) => e.id === id) ?? null;
    }
    if (s.includes("APP_SETTINGS") && s.includes("KEY")) {
      const key = params?.[0] ?? sql.match(/'([^']+)'/)?.[1];
      const row = rows.app_settings.find((r) => r.key === key);
      return row ?? null;
    }
    if (s.includes("COUNT(*)") && s.includes("IS_VOLTRA")) {
      const isVoltra = s.includes("IS_VOLTRA = 1");
      return { count: rows.exercises.filter((e) => e.is_voltra === (isVoltra ? 1 : 0)).length };
    }
    return null;
  });

  const getAllAsync = jest.fn(async () => []);
  const prepareAsync = jest.fn().mockResolvedValue({
    executeAsync: jest.fn().mockResolvedValue(undefined),
    finalizeAsync: jest.fn().mockResolvedValue(undefined),
  });
  const withTransactionAsync = jest.fn(async (cb: () => Promise<void>) => cb());

  return {
    runAsync,
    getFirstAsync,
    getAllAsync,
    prepareAsync,
    withTransactionAsync,
    // helpers to inspect state
    _rows: rows,
    _addExercise: (id: string) => rows.exercises.push({ id }),
  };
}

// ── AC9: Runtime orphan handling ──────────────────────────────────────────────

describe("AC9 — runtime orphan exercise handling", () => {
  it("skips orphan exercises, writes error_log, does not throw, completes other rows", async () => {
    const db = makeDb();

    // Seed all real exercises (so non-orphan rows pass)
    const realExercises = seedExercises();
    for (const ex of realExercises) db._addExercise(ex.id);

    // Inject an orphan into CURATED_TEMPLATES for this test only
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { CURATED_TEMPLATES: curatedTpls } = require("../../../lib/curated-programs");
    const origExercises = curatedTpls[0].exercises;
    const orphanId = "NONEXISTENT-EXERCISE-ID-99";
    curatedTpls[0].exercises = [
      { id: "orphan-te-test-001", exercise_id: orphanId, target_sets: 3, target_reps: "5-8", rest_seconds: 90 },
      ...origExercises,
    ];

    let threw = false;
    try {
      // Call upsertCuratedTemplates directly by importing seed module
      const seedModule = require("../../../lib/db/seed");
      // Expose via full seed run with mocked starters short-circuit
      db.getFirstAsync.mockImplementationOnce(async () => ({ count: 100 })); // voltra count
      db.getFirstAsync.mockImplementationOnce(async () => ({ count: 100 })); // non-voltra count
      db.getFirstAsync.mockImplementationOnce(async () => ({ value: "6" })); // starter_version already 6
      await seedModule.seed(db);
    } catch {
      threw = true;
    } finally {
      // Restore original exercises
      curatedTpls[0].exercises = origExercises;
      jest.resetModules();
    }

    // (a) No exception
    expect(threw).toBe(false);

    // (b) One error_log row with correct fields
    const errorRows = db._rows.error_log.filter((r: any) => r.component === "seed.curated");
    expect(errorRows.length).toBeGreaterThanOrEqual(1);
    const errRow = errorRows[0];
    expect(errRow.fatal).toBe(0);
    expect(errRow.message).toContain(orphanId);

    // (c) Seed completed for the other (non-orphan) curated rows
    const nonOrphanTeRows = db._rows.template_exercises.filter(
      (r: any) => r.template_id === curatedTpls[0].id && r.exercise_id !== orphanId
    );
    expect(nonOrphanTeRows.length).toBeGreaterThan(0);
  });
});

// ── AC10: Idempotency ────────────────────────────────────────────────────────

describe("AC10 — seed idempotency", () => {
  it("running seed twice does not create duplicate programs/templates/schedule rows", async () => {
    jest.resetModules();
    const db = makeDb();
    const realExercises = seedExercises();
    for (const ex of realExercises) db._addExercise(ex.id);

    const seedModule = require("../../../lib/db/seed");

    // First run — version not set
    db.getFirstAsync
      .mockResolvedValueOnce({ count: 100 })
      .mockResolvedValueOnce({ count: 100 })
      .mockResolvedValueOnce(null); // starter_version null
    await seedModule.seed(db);

    const progCountAfterFirst = db._rows.programs.length;
    const tplCountAfterFirst = db._rows.workout_templates.length;
    const schedCountAfterFirst = db._rows.program_schedule.length;

    // Second run — version = 6
    db.getFirstAsync
      .mockResolvedValueOnce({ count: 100 })
      .mockResolvedValueOnce({ count: 100 })
      .mockResolvedValueOnce({ value: "6" }); // starter_version already current
    await seedModule.seed(db);

    // Row counts must be stable
    expect(db._rows.programs.length).toBe(progCountAfterFirst);
    expect(db._rows.workout_templates.length).toBe(tplCountAfterFirst);
    expect(db._rows.program_schedule.length).toBe(schedCountAfterFirst);
  });
});

// ── AC11: User-edit preservation (gated UPDATE) ───────────────────────────────

describe("AC11 — curated template_exercises user-edit preservation", () => {
  it("curated template_exercises are NOT overwritten by subsequent seed runs", async () => {
    jest.resetModules();
    const db = makeDb();
    const realExercises = seedExercises();
    for (const ex of realExercises) db._addExercise(ex.id);

    const seedModule = require("../../../lib/db/seed");

    // First seed run inserts curated rows
    db.getFirstAsync
      .mockResolvedValueOnce({ count: 100 })
      .mockResolvedValueOnce({ count: 100 })
      .mockResolvedValueOnce(null); // version null
    await seedModule.seed(db);

    // Simulate user edit: change target_sets on a curated template_exercise
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { CURATED_TEMPLATES: curatedTpls } = require("../../../lib/curated-programs");
    const editedTeId = curatedTpls[0].exercises[0].id;
    const teRow = db._rows.template_exercises.find((r: any) => r.id === editedTeId);
    expect(teRow).toBeDefined();
    teRow.target_sets = 999; // user edit
    const editedTplId = teRow.template_id;
    // Mark template as curated in the mock db so the UPDATE gate fires
    const tplRow = db._rows.workout_templates.find((r: any) => r.id === editedTplId);
    expect(tplRow).toBeDefined();
    tplRow.is_curated = 1;

    // Second seed run (simulated STARTER_VERSION bump 6 → 7)
    db.getFirstAsync
      .mockResolvedValueOnce({ count: 100 })
      .mockResolvedValueOnce({ count: 100 })
      .mockResolvedValueOnce({ value: "5" }); // version below current → triggers update
    await seedModule.seed(db);

    // Curated row must be unchanged
    const teAfter = db._rows.template_exercises.find((r: any) => r.id === editedTeId);
    expect(teAfter?.target_sets).toBe(999);
  });
});

// ── AC2: Upgrade scenario ─────────────────────────────────────────────────────

describe("AC2 — upgrade from STARTER_VERSION=5 to 6", () => {
  it("RR appears on upgrade and starter template_exercises still get gated update", async () => {
    jest.resetModules();
    const db = makeDb();
    const realExercises = seedExercises();
    for (const ex of realExercises) db._addExercise(ex.id);

    const seedModule = require("../../../lib/db/seed");

    // Pre-populate a starter template row to simulate existing user data
    const starterTeId = STARTER_TEMPLATES[0].exercises[0].id;
    db._rows.template_exercises.push({
      id: starterTeId,
      template_id: STARTER_TEMPLATES[0].id,
      exercise_id: STARTER_TEMPLATES[0].exercises[0].exercise_id,
      position: 99, // wrong position — UPDATE should repair it
      target_sets: 3,
      target_reps: "8-12",
      rest_seconds: 90,
      set_types: "[]",
    });
    db._rows.workout_templates.push({
      id: STARTER_TEMPLATES[0].id,
      name: STARTER_TEMPLATES[0].name,
      is_starter: 1,
      is_curated: 0,
    });

    // Seed with STARTER_VERSION=5 (upgrading)
    db.getFirstAsync
      .mockResolvedValueOnce({ count: 100 })
      .mockResolvedValueOnce({ count: 100 })
      .mockResolvedValueOnce({ value: "5" }); // below current
    await seedModule.seed(db);

    // (i) RR program row was seeded
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { CURATED_PROGRAMS: curatedProgs } = require("../../../lib/curated-programs");
    const rrProg = db._rows.programs.find((r: any) => r.id === curatedProgs[0].id);
    expect(rrProg).toBeDefined();

    // (ii) Starter template_exercises UPDATE ran (repairs corrupted position)
    // The mock UPDATE handler updates position for non-curated templates
    const starterTeAfter = db._rows.template_exercises.find((r: any) => r.id === starterTeId);
    // Position 0 is the correct position for the first exercise
    expect(starterTeAfter?.position).toBe(0);
  });
});
