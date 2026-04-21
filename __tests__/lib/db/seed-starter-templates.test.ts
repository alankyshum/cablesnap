import { STARTER_TEMPLATES, STARTER_PROGRAMS } from "../../../lib/starter-templates";
import { seedExercises } from "../../../lib/seed";

// ---- Data Integrity Tests ----

describe("Starter Template Data Integrity", () => {
  const allExercises = seedExercises();
  const exerciseIds = new Set(allExercises.map((e) => e.id));

  it("all template exercise IDs reference valid seed exercises", () => {
    const missing: string[] = [];
    for (const tpl of STARTER_TEMPLATES) {
      for (const ex of tpl.exercises) {
        if (!exerciseIds.has(ex.exercise_id)) {
          missing.push(`${tpl.id}: ${ex.exercise_id}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("all template exercise IDs are unique across all templates", () => {
    const ids = new Set<string>();
    const dupes: string[] = [];
    for (const tpl of STARTER_TEMPLATES) {
      for (const ex of tpl.exercises) {
        if (ids.has(ex.id)) dupes.push(ex.id);
        ids.add(ex.id);
      }
    }
    expect(dupes).toEqual([]);
  });

  it("Founder's Favourite A has exactly 5 exercises", () => {
    const dayA = STARTER_TEMPLATES.find((t) => t.id === "starter-tpl-7a");
    expect(dayA).toBeDefined();
    expect(dayA!.exercises).toHaveLength(5);
  });

  it("Founder's Favourite B has exactly 5 exercises", () => {
    const dayB = STARTER_TEMPLATES.find((t) => t.id === "starter-tpl-7b");
    expect(dayB).toBeDefined();
    expect(dayB!.exercises).toHaveLength(5);
  });

  it("all program day template_ids reference valid starter templates", () => {
    const templateIds = new Set(STARTER_TEMPLATES.map((t) => t.id));
    for (const prog of STARTER_PROGRAMS) {
      for (const day of prog.days) {
        expect(templateIds.has(day.template_id)).toBe(true);
      }
    }
  });
});

// ---- Seed Function Tests ----

describe("Seed — upsertTemplates repair logic", () => {
  const mockDb = {
    execAsync: jest.fn().mockResolvedValue(undefined),
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
    prepareAsync: jest.fn().mockResolvedValue({
      executeAsync: jest.fn().mockResolvedValue(undefined),
      finalizeAsync: jest.fn().mockResolvedValue(undefined),
    }),
    withTransactionAsync: jest.fn(async (cb: () => Promise<void>) => cb()),
  };

  jest.mock("expo-sqlite", () => ({
    openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
  }));

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.runAsync.mockResolvedValue({ changes: 1 });
    mockDb.getFirstAsync.mockResolvedValue(null);
  });

  it("seed calls INSERT + UPDATE for each starter template exercise", async () => {
    // countSeeded returns 0 to skip bulk exercise seeding
    mockDb.getFirstAsync.mockResolvedValue({ count: 100 });

    const { seed } = require("../../../lib/db/seed");
    await seed(mockDb);

    const insertCalls = mockDb.runAsync.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("INSERT OR IGNORE INTO template_exercises")
    );
    const updateCalls = mockDb.runAsync.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("UPDATE template_exercises SET")
    );

    const totalStarterExercises = STARTER_TEMPLATES.reduce(
      (sum, tpl) => sum + tpl.exercises.length, 0
    );

    expect(insertCalls.length).toBe(totalStarterExercises);
    expect(updateCalls.length).toBe(totalStarterExercises);
  });

  it("seed calls upsertTemplates and upsertPrograms in separate transactions", async () => {
    mockDb.getFirstAsync.mockResolvedValue({ count: 100 });

    const { seed } = require("../../../lib/db/seed");
    await seed(mockDb);

    // withTransactionAsync should be called at least twice (templates + programs)
    expect(mockDb.withTransactionAsync.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("seed backfills exercises referenced by starter templates", async () => {
    // Return non-zero count so bulk seeding is skipped
    mockDb.getFirstAsync
      .mockResolvedValueOnce({ count: 50 }) // voltra count
      .mockResolvedValueOnce({ count: 50 }) // non-voltra count
      .mockResolvedValue(null); // starter_version

    const { seed } = require("../../../lib/db/seed");
    await seed(mockDb);

    const backfillCalls = mockDb.runAsync.mock.calls.filter(
      (c: unknown[]) =>
        typeof c[0] === "string" &&
        (c[0] as string).includes("INSERT OR IGNORE INTO exercises") &&
        (c[0] as string).includes("is_voltra")
    );

    // Should have backfill calls for exercises referenced by starters
    expect(backfillCalls.length).toBeGreaterThan(0);
  });
});
