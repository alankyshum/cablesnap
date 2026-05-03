/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BLD-1038: Unit tests for syncTemplateFromSession() and undoTemplateSyncFromSession().
 *
 * Verifies that completing a session correctly writes set counts and per-set
 * types back to the originating template (Option A write-back), and that the
 * undo path restores the original values.
 */

// State lives on globalThis — jest.mock() factories are hoisted and cannot
// close over module-scope variables defined outside the factory.

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(() =>
    Promise.resolve({
      execAsync: jest.fn().mockResolvedValue(undefined),
      getAllAsync: jest.fn().mockResolvedValue([]),
      getFirstAsync: jest.fn().mockResolvedValue({ count: 10 }),
      runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
      withTransactionAsync: jest.fn(async (cb) => cb()),
      prepareAsync: jest.fn().mockResolvedValue({
        executeAsync: jest.fn().mockResolvedValue(undefined),
        finalizeAsync: jest.fn().mockResolvedValue(undefined),
      }),
    })
  ),
}));

jest.mock("drizzle-orm/expo-sqlite", () => ({
  drizzle: jest.fn(() => ({
    select: jest.fn(() => {
      const g = globalThis as any;
      const chain = {
        from: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn(() => { g.__mockGetQueue = g.__mockGetQueue || []; return g.__mockGetQueue.shift(); }),
        then: (resolve: (v: any) => any) => Promise.resolve((g.__mockAllQueue = g.__mockAllQueue || [], g.__mockAllQueue.shift() || [])).then(resolve),
      };
      return chain;
    }),
    update: jest.fn(() => ({
      set: jest.fn((vals: any) => {
        const g = globalThis as any;
        const call: any = { vals };
        return {
          where: jest.fn((cond: any) => {
            call.cond = cond;
            g.__mockUpdateCalls = g.__mockUpdateCalls || [];
            g.__mockUpdateCalls.push(call);
            return { then: (r: any) => Promise.resolve().then(r) };
          }),
        };
      }),
    })),
    insert: jest.fn(() => ({
      values: jest.fn(() => ({ then: (r: any) => Promise.resolve().then(r) })),
    })),
    delete: jest.fn(() => ({
      where: jest.fn(() => ({ then: (r: any) => Promise.resolve().then(r) })),
    })),
    run: jest.fn(() => Promise.resolve()),
  })),
}));

jest.mock("../../../lib/seed", () => ({
  seedExercises: jest.fn(() => []),
}));

jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => "test-uuid"),
}));

const { syncTemplateFromSession, undoTemplateSyncFromSession } = require("../../../lib/db/templates");

async function initDb() {
  const { getDatabase } = require("../../../lib/db/helpers");
  await getDatabase();
}

beforeEach(async () => {
  jest.clearAllMocks();
  (globalThis as any).__mockGetQueue = [];
  (globalThis as any).__mockAllQueue = [];
  (globalThis as any).__mockUpdateCalls = [];
  await initDb();
});

// ---- helpers ----

function makeSession(templateId: string | null) {
  return { template_id: templateId };
}

function makeSet(exerciseId: string, position: number, setNumber: number, setType: string) {
  return { exercise_id: exerciseId, exercise_position: position, set_number: setNumber, set_type: setType };
}

function makeTplExercise(id: string, exerciseId: string, position: number, targetSets: number, setTypes: string) {
  return { id, exercise_id: exerciseId, position, target_sets: targetSets, set_types: setTypes };
}

function queueGet(value: any) {
  (globalThis as any).__mockGetQueue.push(value);
}

function queueAll(value: any[]) {
  (globalThis as any).__mockAllQueue.push(value);
}

function updateCalls(): any[] {
  return (globalThis as any).__mockUpdateCalls || [];
}

// ---- Tests ----

describe("syncTemplateFromSession", () => {
  it("returns null when session has no template_id", async () => {
    queueGet(makeSession(null));
    const result = await syncTemplateFromSession("session-1");
    expect(result).toBeNull();
  });

  it("returns null when session has no sets", async () => {
    queueGet(makeSession("tpl-1"));
    queueGet({ is_starter: 0 }); // template is_starter check
    queueAll([]); // no sets
    const result = await syncTemplateFromSession("session-1");
    expect(result).toBeNull();
  });

  it("returns null when starter template (must not mutate seeded data)", async () => {
    queueGet(makeSession("tpl-starter"));
    queueGet({ is_starter: 1 }); // starter template — skip
    const result = await syncTemplateFromSession("session-1");
    expect(result).toBeNull();
    expect(updateCalls().length).toBe(0);
  });

  it("returns null when nothing changed (sets and types identical)", async () => {
    queueGet(makeSession("tpl-1"));
    queueGet({ is_starter: 0 }); // template is_starter check
    queueAll([
      makeSet("ex1", 0, 1, "normal"),
      makeSet("ex1", 0, 2, "normal"),
      makeSet("ex1", 0, 3, "normal"),
    ]);
    queueAll([
      makeTplExercise("te1", "ex1", 0, 3, JSON.stringify(["normal", "normal", "normal"])),
    ]);
    const result = await syncTemplateFromSession("session-1");
    expect(result).toBeNull();
    expect(updateCalls().length).toBe(0);
  });

  it("updates template exercise when set count increased", async () => {
    queueGet(makeSession("tpl-1"));
    queueGet({ is_starter: 0 }); // template is_starter check
    queueAll([
      makeSet("ex1", 0, 1, "normal"),
      makeSet("ex1", 0, 2, "normal"),
      makeSet("ex1", 0, 3, "normal"),
      makeSet("ex1", 0, 4, "normal"),
    ]);
    queueAll([
      makeTplExercise("te1", "ex1", 0, 3, JSON.stringify(["normal", "normal", "normal"])),
    ]);
    const result = await syncTemplateFromSession("session-1");
    expect(result).not.toBeNull();
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].newTargetSets).toBe(4);
    expect(result.changes[0].oldTargetSets).toBe(3);
    expect(result.changes[0].newSetTypes).toEqual(["normal", "normal", "normal", "normal"]);
  });

  it("updates template exercise when set type changed to warmup", async () => {
    queueGet(makeSession("tpl-1"));
    queueGet({ is_starter: 0 }); // template is_starter check
    queueAll([
      makeSet("ex1", 0, 1, "warmup"),
      makeSet("ex1", 0, 2, "normal"),
      makeSet("ex1", 0, 3, "normal"),
    ]);
    queueAll([
      makeTplExercise("te1", "ex1", 0, 3, JSON.stringify(["normal", "normal", "normal"])),
    ]);
    const result = await syncTemplateFromSession("session-1");
    expect(result).not.toBeNull();
    expect(result.changes[0].newSetTypes).toEqual(["warmup", "normal", "normal"]);
    expect(result.changes[0].oldSetTypes).toEqual(["normal", "normal", "normal"]);
  });

  it("updates template exercise when set count decreased", async () => {
    queueGet(makeSession("tpl-1"));
    queueGet({ is_starter: 0 }); // template is_starter check
    queueAll([
      makeSet("ex1", 0, 1, "normal"),
      makeSet("ex1", 0, 2, "normal"),
    ]);
    queueAll([
      makeTplExercise("te1", "ex1", 0, 3, JSON.stringify(["normal", "normal", "normal"])),
    ]);
    const result = await syncTemplateFromSession("session-1");
    expect(result).not.toBeNull();
    expect(result.changes[0].newTargetSets).toBe(2);
    expect(result.changes[0].oldTargetSets).toBe(3);
  });

  it("skips exercises not in the template (swapped exercises)", async () => {
    queueGet(makeSession("tpl-1"));
    queueGet({ is_starter: 0 }); // template is_starter check
    // Session has ex2, template only has ex1 — no match
    queueAll([
      makeSet("ex2", 0, 1, "normal"),
      makeSet("ex2", 0, 2, "normal"),
      makeSet("ex2", 0, 3, "normal"),
      makeSet("ex2", 0, 4, "normal"),
    ]);
    queueAll([
      makeTplExercise("te1", "ex1", 0, 3, JSON.stringify(["normal", "normal", "normal"])),
    ]);
    const result = await syncTemplateFromSession("session-1");
    expect(result).toBeNull();
    expect(updateCalls().length).toBe(0);
  });

  it("handles multiple exercises, updates only changed ones", async () => {
    queueGet(makeSession("tpl-1"));
    queueGet({ is_starter: 0 }); // template is_starter check
    // ex1: 3 sets unchanged; ex2: 4 sets (was 3)
    queueAll([
      makeSet("ex1", 0, 1, "normal"),
      makeSet("ex1", 0, 2, "normal"),
      makeSet("ex1", 0, 3, "normal"),
      makeSet("ex2", 1, 1, "normal"),
      makeSet("ex2", 1, 2, "normal"),
      makeSet("ex2", 1, 3, "normal"),
      makeSet("ex2", 1, 4, "normal"),
    ]);
    queueAll([
      makeTplExercise("te1", "ex1", 0, 3, JSON.stringify(["normal", "normal", "normal"])),
      makeTplExercise("te2", "ex2", 1, 3, JSON.stringify(["normal", "normal", "normal"])),
    ]);
    const result = await syncTemplateFromSession("session-1");
    expect(result).not.toBeNull();
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].templateExerciseId).toBe("te2");
    expect(result.changes[0].newTargetSets).toBe(4);
  });

  it("includes failure set type in sync", async () => {
    queueGet(makeSession("tpl-1"));
    queueGet({ is_starter: 0 }); // template is_starter check
    queueAll([
      makeSet("ex1", 0, 1, "normal"),
      makeSet("ex1", 0, 2, "normal"),
      makeSet("ex1", 0, 3, "failure"),
    ]);
    queueAll([
      makeTplExercise("te1", "ex1", 0, 3, JSON.stringify(["normal", "normal", "normal"])),
    ]);
    const result = await syncTemplateFromSession("session-1");
    expect(result).not.toBeNull();
    expect(result.changes[0].newSetTypes).toEqual(["normal", "normal", "failure"]);
  });
});

describe("undoTemplateSyncFromSession", () => {
  it("is a no-op when result is null", async () => {
    await expect(undoTemplateSyncFromSession(null)).resolves.toBeUndefined();
    expect(updateCalls().length).toBe(0);
  });

  it("restores old values for each changed template exercise", async () => {
    const syncResult = {
      templateId: "tpl-1",
      changes: [
        {
          templateExerciseId: "te1",
          oldTargetSets: 3,
          oldSetTypes: ["normal", "normal", "normal"],
          newTargetSets: 4,
          newSetTypes: ["normal", "normal", "normal", "normal"],
        },
      ],
    };
    await undoTemplateSyncFromSession(syncResult);
    const calls = updateCalls();
    // update called twice: once for the exercise row, once for the template timestamp
    expect(calls.length).toBe(2);
    expect(calls[0].vals.target_sets).toBe(3);
    expect(JSON.parse(calls[0].vals.set_types)).toEqual(["normal", "normal", "normal"]);
  });
});
