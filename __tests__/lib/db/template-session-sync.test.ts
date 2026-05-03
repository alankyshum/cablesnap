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
      withTransactionAsync: jest.fn(async (cb) => {
        const g = globalThis as any;
        g.__mockTransactionCallCount = (g.__mockTransactionCallCount || 0) + 1;
        // Track which get/update indices happen inside this transaction
        const getsBefore = (g.__mockGetQueue || []).length;
        const updatesBefore = (g.__mockUpdateCalls || []).length;
        await cb();
        const getsConsumedInTx = getsBefore - (g.__mockGetQueue || []).length;
        const updatesInTx = (g.__mockUpdateCalls || []).length - updatesBefore;
        g.__mockLastTxGetCount = getsConsumedInTx;
        g.__mockLastTxUpdateCount = updatesInTx;
      }),
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
      values: jest.fn((vals: any) => {
        const g = globalThis as any;
        g.__mockInsertCalls = g.__mockInsertCalls || [];
        g.__mockInsertCalls.push({ vals });
        return { then: (r: any) => Promise.resolve().then(r) };
      }),
    })),
    delete: jest.fn(() => ({
      where: jest.fn((cond: any) => {
        const g = globalThis as any;
        g.__mockDeleteCalls = g.__mockDeleteCalls || [];
        g.__mockDeleteCalls.push({ cond });
        return { then: (r: any) => Promise.resolve().then(r) };
      }),
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
  (globalThis as any).__mockInsertCalls = [];
  (globalThis as any).__mockDeleteCalls = [];
  (globalThis as any).__mockTransactionCallCount = 0;
  (globalThis as any).__mockLastTxGetCount = 0;
  (globalThis as any).__mockLastTxUpdateCount = 0;
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

function insertCalls(): any[] {
  return (globalThis as any).__mockInsertCalls || [];
}

function deleteCalls(): any[] {
  return (globalThis as any).__mockDeleteCalls || [];
}

function transactionCallCount(): number {
  return (globalThis as any).__mockTransactionCallCount || 0;
}

/** Number of .get() calls consumed inside the last withTransactionAsync callback */
function lastTxGetCount(): number {
  return (globalThis as any).__mockLastTxGetCount || 0;
}

/** Number of update calls recorded inside the last withTransactionAsync callback */
function lastTxUpdateCount(): number {
  return (globalThis as any).__mockLastTxUpdateCount || 0;
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
    expect(result!.kind).toBe("updated");
    expect((result as any).changes).toHaveLength(1);
    expect((result as any).changes[0].newTargetSets).toBe(4);
    expect((result as any).changes[0].oldTargetSets).toBe(3);
    expect((result as any).changes[0].newSetTypes).toEqual(["normal", "normal", "normal", "normal"]);
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
    expect(result!.kind).toBe("updated");
    expect((result as any).changes[0].newSetTypes).toEqual(["warmup", "normal", "normal"]);
    expect((result as any).changes[0].oldSetTypes).toEqual(["normal", "normal", "normal"]);
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
    expect((result as any).changes[0].newTargetSets).toBe(2);
    expect((result as any).changes[0].oldTargetSets).toBe(3);
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
    expect((result as any).changes).toHaveLength(1);
    expect((result as any).changes[0].templateExerciseId).toBe("te2");
    expect((result as any).changes[0].newTargetSets).toBe(4);
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
    expect((result as any).changes[0].newSetTypes).toEqual(["normal", "normal", "failure"]);
  });

  // ── Starter-template clone path ────────────────────────────────────────────

  it("creates clone when starter template has set-count change", async () => {
    queueGet(makeSession("starter-tpl"));
    queueGet({ is_starter: 1, name: "Starter Workout", source: "starter-pack" });
    queueAll([
      makeSet("ex1", 0, 1, "normal"),
      makeSet("ex1", 0, 2, "normal"),
      makeSet("ex1", 0, 3, "normal"),
      makeSet("ex1", 0, 4, "normal"), // one extra set
    ]);
    queueAll([
      makeTplExercise("te1", "ex1", 0, 3, JSON.stringify(["normal", "normal", "normal"])),
    ]);
    const result = await syncTemplateFromSession("session-1");
    expect(result?.kind).toBe("cloned");
    const r = result as any;
    expect(r.oldTemplateId).toBe("starter-tpl");
    expect(r.originSessionId).toBe("session-1");
    expect(r.newTemplateId).toBeTruthy();
    // Clone template + 1 exercise inserted; original template NOT updated
    expect(insertCalls().length).toBe(2); // 1 template + 1 exercise
    expect(insertCalls()[0].vals.is_starter).toBe(0); // clone is NOT a starter
    expect(insertCalls()[0].vals.source).toBeNull(); // source cleared
    expect(JSON.parse(insertCalls()[1].vals.set_types)).toHaveLength(4); // 4 sets applied
  });

  it("creates clone when starter has set-type change (warmup/failure flags)", async () => {
    queueGet(makeSession("starter-tpl"));
    queueGet({ is_starter: 1, name: "Starter", source: null });
    queueAll([
      makeSet("ex1", 0, 1, "warmup"),
      makeSet("ex1", 0, 2, "normal"),
      makeSet("ex1", 0, 3, "failure"),
    ]);
    queueAll([
      makeTplExercise("te1", "ex1", 0, 3, JSON.stringify(["normal", "normal", "normal"])),
    ]);
    const result = await syncTemplateFromSession("session-1");
    expect(result?.kind).toBe("cloned");
    // Clone exercise should have the new set types applied
    const exInsert = insertCalls().find((c: any) => c.vals?.exercise_id === "ex1");
    expect(exInsert).toBeTruthy();
    expect(JSON.parse(exInsert.vals.set_types)).toEqual(["warmup", "normal", "failure"]);
  });

  it("returns null when starter has no set changes (no clone created)", async () => {
    queueGet(makeSession("starter-tpl"));
    queueGet({ is_starter: 1, name: "Starter", source: null });
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
    expect(insertCalls().length).toBe(0);
  });
});

describe("undoTemplateSyncFromSession", () => {
  it("is a no-op when result is null", async () => {
    await expect(undoTemplateSyncFromSession(null)).resolves.toBeUndefined();
    expect(updateCalls().length).toBe(0);
  });

  it("restores old values for each changed template exercise (kind=updated)", async () => {
    const syncResult = {
      kind: "updated" as const,
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
    // Queue the pre-check read — matches newTargetSets/newSetTypes (no concurrent edit)
    queueGet({ target_sets: 4, set_types: JSON.stringify(["normal", "normal", "normal", "normal"]) });
    await undoTemplateSyncFromSession(syncResult);
    const calls = updateCalls();
    // update called twice: once for the exercise row, once for the template timestamp
    expect(calls.length).toBe(2);
    expect(calls[0].vals.target_sets).toBe(3);
    expect(JSON.parse(calls[0].vals.set_types)).toEqual(["normal", "normal", "normal"]);
  });

  it("undo updated: blocked when target_sets has drifted (concurrent edit)", async () => {
    const syncResult = {
      kind: "updated" as const,
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
    // Queue a drifted value — target_sets is now 5 (another session synced)
    queueGet({ target_sets: 5, set_types: JSON.stringify(["normal", "normal", "normal", "normal", "normal"]) });
    const undoResult = await undoTemplateSyncFromSession(syncResult);
    expect(undoResult).toEqual({ blocked: true });
    expect(updateCalls().length).toBe(0);
  });

  it("undo updated: blocked when set_types has drifted (target_sets unchanged)", async () => {
    const syncResult = {
      kind: "updated" as const,
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
    // Queue: target_sets still 4, but set_types changed to warmup+normal+normal+normal
    queueGet({ target_sets: 4, set_types: JSON.stringify(["warmup", "normal", "normal", "normal"]) });
    const undoResult = await undoTemplateSyncFromSession(syncResult);
    expect(undoResult).toEqual({ blocked: true });
    expect(updateCalls().length).toBe(0);
  });

  it("undo updated: all-or-nothing — first exercise clean but second drifted → blocked, no writes", async () => {
    const syncResult = {
      kind: "updated" as const,
      templateId: "tpl-1",
      changes: [
        {
          templateExerciseId: "te1",
          oldTargetSets: 3,
          oldSetTypes: ["normal", "normal", "normal"],
          newTargetSets: 4,
          newSetTypes: ["normal", "normal", "normal", "normal"],
        },
        {
          templateExerciseId: "te2",
          oldTargetSets: 2,
          oldSetTypes: ["normal", "normal"],
          newTargetSets: 3,
          newSetTypes: ["normal", "normal", "normal"],
        },
      ],
    };
    // First exercise: matches (clean)
    queueGet({ target_sets: 4, set_types: JSON.stringify(["normal", "normal", "normal", "normal"]) });
    // Second exercise: drifted (another session wrote 4 sets instead of 3)
    queueGet({ target_sets: 4, set_types: JSON.stringify(["normal", "normal", "normal", "normal"]) });
    const undoResult = await undoTemplateSyncFromSession(syncResult);
    expect(undoResult).toEqual({ blocked: true });
    expect(updateCalls().length).toBe(0);
  });

  it("undo updated: pre-check reads and rollback writes run inside the same transaction (atomicity)", async () => {
    // This test would fail if reads were outside withTransaction (lastTxGetCount would be 0)
    const syncResult = {
      kind: "updated" as const,
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
    // Matches — happy path so writes proceed
    queueGet({ target_sets: 4, set_types: JSON.stringify(["normal", "normal", "normal", "normal"]) });
    await undoTemplateSyncFromSession(syncResult);

    // Exactly one withTransactionAsync call for kind=updated
    expect(transactionCallCount()).toBe(1);
    // The pre-check GET (1) was consumed inside that transaction
    expect(lastTxGetCount()).toBe(1);
    // The rollback writes (exercise + template timestamp = 2) were also inside that transaction
    expect(lastTxUpdateCount()).toBe(2);
  });

  it("undo updated: pre-check reads run inside transaction even when blocked (no writes)", async () => {
    const syncResult = {
      kind: "updated" as const,
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
    // Drifted — undo must be blocked
    queueGet({ target_sets: 5, set_types: JSON.stringify(["normal", "normal", "normal", "normal", "normal"]) });
    const undoResult = await undoTemplateSyncFromSession(syncResult);

    expect(undoResult).toEqual({ blocked: true });
    // Still called withTransactionAsync (reads were inside it)
    expect(transactionCallCount()).toBe(1);
    // GET was consumed inside the transaction
    expect(lastTxGetCount()).toBe(1);
    // No writes issued
    expect(lastTxUpdateCount()).toBe(0);
    expect(updateCalls().length).toBe(0);
  });

  it("undo cloned: deletes clone and restores session template_id", async () => {
    queueAll([]); // no other sessions using the clone
    const syncResult = {
      kind: "cloned" as const,
      oldTemplateId: "starter-tpl",
      newTemplateId: "clone-tpl",
      originSessionId: "session-1",
    };
    const undoResult = await undoTemplateSyncFromSession(syncResult);
    expect(undoResult).toBeUndefined(); // not blocked
    expect(updateCalls().length).toBe(1); // restore session.template_id
    expect(deleteCalls().length).toBe(2); // template_exercises + workout_templates
  });

  it("undo cloned: no-op (blocked) when another session already uses the clone", async () => {
    queueAll([{ id: "session-2" }]); // another session uses the clone
    const syncResult = {
      kind: "cloned" as const,
      oldTemplateId: "starter-tpl",
      newTemplateId: "clone-tpl",
      originSessionId: "session-1",
    };
    const undoResult = await undoTemplateSyncFromSession(syncResult);
    expect(undoResult).toEqual({ blocked: true });
    expect(deleteCalls().length).toBe(0);
  });

  it("undo cloned: idempotent — second undo call does not throw", async () => {
    queueAll([]); // first call: no other sessions
    queueAll([]); // second call: no other sessions (clone already deleted, query returns empty)
    const syncResult = {
      kind: "cloned" as const,
      oldTemplateId: "starter-tpl",
      newTemplateId: "clone-tpl",
      originSessionId: "session-1",
    };
    await undoTemplateSyncFromSession(syncResult);
    await expect(undoTemplateSyncFromSession(syncResult)).resolves.toBeUndefined();
  });
});
