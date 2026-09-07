import {
  CoachWorkoutDraftError,
  appendCoachWorkoutDraftRevision,
  createCoachWorkoutDraft,
  restoreCoachWorkoutDraftRevision,
  startSessionFromCoachWorkoutDraft,
} from "../../../lib/db/coach-workout-drafts";

jest.mock("expo-sqlite", () => ({ openDatabaseAsync: jest.fn() }));
jest.mock("drizzle-orm/expo-sqlite", () => ({ drizzle: jest.fn() }));
jest.mock("../../../lib/db/helpers", () => ({
  getDrizzle: jest.fn(),
  getDatabase: jest.fn(),
  withTransaction: jest.fn(),
}));
jest.mock("../../../lib/db/gym-profiles", () => ({
  getDefaultGym: jest.fn().mockResolvedValue(null),
}));

describe("coach workout draft repository contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses typed non-secret errors for invalid draft bounds", async () => {
    await expect(createCoachWorkoutDraft({
      coachSessionId: "session-1",
      sourceKind: "text",
      canonicalDraft: { exercises: [{ exercise_id: "exercise-1", sets: 0 }] },
    })).rejects.toMatchObject({
      name: "CoachWorkoutDraftError",
      code: "invalid",
    });
  });

  it("exposes stable error codes without raw payloads", () => {
    const error = new CoachWorkoutDraftError("conflict", "Workout draft was changed elsewhere.");
    expect(error.code).toBe("conflict");
    expect(error.message).not.toContain("photo");
  });

  it("rejects media-shaped source and draft data before any database write", async () => {
    const { getDrizzle, getDatabase, withTransaction } = jest.requireMock("../../../lib/db/helpers") as Record<string, jest.Mock>;
    await expect(createCoachWorkoutDraft({
      coachSessionId: "session-1",
      sourceKind: "photo",
      sourceMetadata: { photoUri: "file:///private.jpg" },
      canonicalDraft: { exercises: [{ exercise_id: "exercise-1", sets: 1 }] },
    })).rejects.toMatchObject({ code: "invalid" });
    expect(getDrizzle).not.toHaveBeenCalled();
    expect(getDatabase).not.toHaveBeenCalled();
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it("rejects media-shaped initial reason-ledger data before any database write", async () => {
    const { getDrizzle, getDatabase, withTransaction } = jest.requireMock("../../../lib/db/helpers") as Record<string, jest.Mock>;
    await expect(createCoachWorkoutDraft({
      coachSessionId: "session-1",
      sourceKind: "text",
      reasonLedger: [{ imageUri: "file:///private.jpg" }],
      canonicalDraft: { exercises: [{ exercise_id: "exercise-1", sets: 1 }] },
    })).rejects.toMatchObject({ code: "invalid" });
    expect(getDrizzle).not.toHaveBeenCalled();
    expect(getDatabase).not.toHaveBeenCalled();
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it("rejects completed sets and out-of-bounds prescriptions", async () => {
    await expect(createCoachWorkoutDraft({
      coachSessionId: "session-1", sourceKind: "text",
      canonicalDraft: { exercises: [{ exercise_id: "exercise-1", sets: 1, completed: true } as unknown as { exercise_id: string; sets: number }] },
    })).rejects.toMatchObject({ code: "invalid" });
    await expect(createCoachWorkoutDraft({
      coachSessionId: "session-1", sourceKind: "text",
      canonicalDraft: { exercises: [{ exercise_id: "exercise-1", sets: 21 }] },
    })).rejects.toMatchObject({ code: "invalid" });
  });

  it.each([-1, 10001, Number.NaN, Number.POSITIVE_INFINITY])("rejects an invalid historical load value: %p", async (value) => {
    await expect(createCoachWorkoutDraft({
      coachSessionId: "session-1", sourceKind: "text",
      canonicalDraft: { exercises: [{ exercise_id: "exercise-1", sets: 1, load: { kind: "history", value, unit: "kg", source: "comparable_completed_working_set" } } as never] },
    })).rejects.toMatchObject({ code: "invalid" });
  });

  it("does not write a stale optimistic revision", async () => {
    const helpers = jest.requireMock("../../../lib/db/helpers") as Record<string, jest.Mock>;
    const update = jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([]) });
    const db = {
      select: jest.fn(() => ({ from: jest.fn(() => ({ where: jest.fn(() => ({ get: jest.fn().mockResolvedValue({ id: "draft-1", latest_revision: 2, coach_session_id: "session-1" }) })) })) })),
      update,
      insert: jest.fn(),
    };
    helpers.getDrizzle.mockResolvedValue(db);
    helpers.getDatabase.mockResolvedValue({ getFirstAsync: jest.fn().mockResolvedValue({ deleted_at: null }) });
    helpers.withTransaction.mockImplementation(async (fn: (database: unknown) => Promise<void>) => fn(db));

    await expect(appendCoachWorkoutDraftRevision("draft-1", 1, { exercises: [{ exercise_id: "exercise-1", sets: 1 }] }, "session-1")).rejects.toMatchObject({ code: "conflict" });
    expect(update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects an omitted append owner before validation or writes", async () => {
    const helpers = jest.requireMock("../../../lib/db/helpers") as Record<string, jest.Mock>;
    await expect(appendCoachWorkoutDraftRevision(
      "draft-1",
      1,
      { exercises: [{ exercise_id: "exercise-1", sets: 1 }] },
      undefined as unknown as string,
    )).rejects.toMatchObject({ code: "ownership" });
    expect(helpers.getDrizzle).not.toHaveBeenCalled();
    expect(helpers.withTransaction).not.toHaveBeenCalled();
  });

  it("rejects a draft used by the wrong coach session", async () => {
    const helpers = jest.requireMock("../../../lib/db/helpers") as Record<string, jest.Mock>;
    const db = {
      select: jest.fn(() => ({ from: jest.fn(() => ({ where: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ id: "draft-1", latest_revision: 1, coach_session_id: "owner" }),
        orderBy: jest.fn(() => ({ get: jest.fn().mockResolvedValue({ id: "r1", draft_id: "draft-1", version: 1, canonical_draft: JSON.stringify({ exercises: [{ exercise_id: "exercise-1", sets: 1 }] }), reason_ledger: "[]" }) })),
      })) })) })),
    };
    helpers.getDrizzle.mockResolvedValue(db);
    await expect(startSessionFromCoachWorkoutDraft("draft-1", "other")).rejects.toMatchObject({ code: "ownership" });
  });

  it.each([
    { name: "missing", exercise: null },
    { name: "deleted", exercise: { id: "exercise-1" }, deletedAt: 123 },
  ])("rejects a $name exercise before creating a draft", async ({ exercise, deletedAt }) => {
    const helpers = jest.requireMock("../../../lib/db/helpers") as Record<string, jest.Mock>;
    const get = jest.fn().mockResolvedValue(exercise);
    const db = {
      select: jest.fn(() => ({ from: jest.fn(() => ({ where: jest.fn(() => ({ get })) })) })),
    };
    helpers.getDrizzle.mockResolvedValue(db);
    helpers.getDatabase.mockResolvedValue({ getFirstAsync: jest.fn().mockResolvedValue({ deleted_at: deletedAt ?? null }) });
    await expect(createCoachWorkoutDraft({
      coachSessionId: "session-1", sourceKind: "text",
      canonicalDraft: { exercises: [{ exercise_id: "exercise-1", sets: 1 }] },
    })).rejects.toMatchObject({ code: "invalid" });
    expect(helpers.withTransaction).not.toHaveBeenCalled();
  });

  it("appends revisions immutably and restores by appending a new version", async () => {
    const helpers = jest.requireMock("../../../lib/db/helpers") as Record<string, jest.Mock>;
    const revisions = [
      { id: "r1", draft_id: "draft-1", version: 1, canonical_draft: JSON.stringify({ exercises: [{ exercise_id: "exercise-1", sets: 1 }] }), reason_ledger: "[]" },
      { id: "r2", draft_id: "draft-1", version: 2, canonical_draft: JSON.stringify({ exercises: [{ exercise_id: "exercise-1", sets: 2 }] }), reason_ledger: "[]" },
    ];
    const insert = jest.fn(() => ({ values: jest.fn().mockResolvedValue(undefined) }));
    const update = jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(() => ({ returning: jest.fn().mockResolvedValue([{ id: "draft-1" }]) })) })) }));
    const select = jest.fn(() => ({ from: jest.fn(() => ({ where: jest.fn(() => ({
      orderBy: jest.fn(() => ({
        all: jest.fn().mockResolvedValue(revisions),
        get: jest.fn().mockResolvedValue(revisions[1]),
      })),
      get: jest.fn().mockResolvedValue({ id: "draft-1", latest_revision: 2, coach_session_id: "session-1" }),
    })) })) }));
    const db = { select, update, insert };
    helpers.getDrizzle.mockResolvedValue(db);
    helpers.getDatabase.mockResolvedValue({ getFirstAsync: jest.fn().mockResolvedValue({ deleted_at: null }) });
    helpers.withTransaction.mockImplementation(async (fn: (database: unknown) => Promise<void>) => fn(db));

    await appendCoachWorkoutDraftRevision("draft-1", 2, { exercises: [{ exercise_id: "exercise-1", sets: 3 }] }, "session-1");
    expect(insert).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(revisions).toHaveLength(2);
    await restoreCoachWorkoutDraftRevision("draft-1", 1, 2, "session-1");
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("creates one session and ordered, uncompleted normal sets in one transaction", async () => {
    const helpers = jest.requireMock("../../../lib/db/helpers") as Record<string, jest.Mock>;
    const insertedValues: unknown[] = [];
    const insert = jest.fn(() => ({ values: jest.fn((value: unknown) => { insertedValues.push(value); return Promise.resolve(); }) }));
    let selectCalls = 0;
    const db = {
      select: jest.fn(() => {
        selectCalls++;
        const value = selectCalls < 3
          ? { id: "draft-1", coach_session_id: "session-1", source_metadata: "{}" }
          : { id: "revision-1", draft_id: "draft-1", version: 1, canonical_draft: JSON.stringify({ name: "Saved workout", exercises: [{ exercise_id: "exercise-1", sets: 2, reps: 8, load: { kind: "history", value: 42, unit: "kg", source: "comparable_completed_working_set" }, weight: 7, tempo: "3-1-1-0" }, { exercise_id: "exercise-2", sets: 1, reps: 10, weight: 9 }] }), reason_ledger: "[]" };
        return { from: () => ({ where: () => ({ get: jest.fn().mockResolvedValue(value), orderBy: () => ({ get: jest.fn().mockResolvedValue(value) }) }) }) };
      }),
      insert,
    };
    helpers.getDrizzle.mockResolvedValue(db);
    helpers.getDatabase.mockResolvedValue({ getFirstAsync: jest.fn().mockResolvedValue({ deleted_at: null }) });
    helpers.withTransaction.mockImplementation(async (fn: (database: unknown) => Promise<void>) => fn(db));
    const sessionId = await startSessionFromCoachWorkoutDraft("draft-1", "session-1");
    expect(sessionId).toEqual(expect.any(String));
    expect(helpers.withTransaction).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(4);
    expect(insertedValues[0]).toMatchObject({ name: "Saved workout", kind: "workout" });
    expect(insertedValues.slice(1)).toEqual([
      expect.objectContaining({ session_id: sessionId, exercise_id: "exercise-1", set_number: 1, exercise_position: 0, weight: 42, completed: 0, completed_at: null, set_type: "normal" }),
      expect.objectContaining({ session_id: sessionId, exercise_id: "exercise-1", set_number: 2, exercise_position: 0, weight: 42, tempo: "3-1-1-0", completed: 0, completed_at: null, set_type: "normal" }),
       expect.objectContaining({ session_id: sessionId, exercise_id: "exercise-2", set_number: 1, exercise_position: 1, weight: 9, completed: 0, completed_at: null, set_type: "normal" }),
    ]);
  });

  it("accepts boundary-safe injury and volume_allocation keys while rejecting media payloads", async () => {
    const helpers = jest.requireMock("../../../lib/db/helpers") as Record<string, jest.Mock>;
    const db = {
      select: jest.fn(() => ({ from: jest.fn(() => ({ where: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ id: "exercise-1", coach_session_id: "session-1", source_metadata: "{}" }),
        orderBy: jest.fn(() => ({ get: jest.fn().mockResolvedValue({ id: "revision-1", draft_id: "draft-1", version: 1, canonical_draft: JSON.stringify({ exercises: [{ exercise_id: "exercise-1", sets: 1 }] }), reason_ledger: "[]" }) })),
      })) })) })),
      insert: jest.fn(() => ({ values: jest.fn().mockResolvedValue(undefined) })),
    };
    helpers.getDrizzle.mockResolvedValue(db);
    helpers.getDatabase.mockResolvedValue({ getFirstAsync: jest.fn().mockResolvedValue({ deleted_at: null }) });
    helpers.withTransaction.mockImplementation(async (fn: (database: unknown) => Promise<void>) => fn(db));
    await expect(createCoachWorkoutDraft({ coachSessionId: "session-1", sourceKind: "text", sourceMetadata: { injuries: [], volume_allocation: {} }, canonicalDraft: { exercises: [{ exercise_id: "exercise-1", sets: 1 }] } })).resolves.toBeTruthy();
    await expect(createCoachWorkoutDraft({ coachSessionId: "session-1", sourceKind: "text", sourceMetadata: { image: "not-a-payload" }, canonicalDraft: { exercises: [{ exercise_id: "exercise-1", sets: 1 }] } })).rejects.toMatchObject({ code: "invalid" });
    await expect(createCoachWorkoutDraft({ coachSessionId: "session-1", sourceKind: "text", sourceMetadata: { notes: "data:image/png;base64," + "A".repeat(128) }, canonicalDraft: { exercises: [{ exercise_id: "exercise-1", sets: 1 }] } })).rejects.toMatchObject({ code: "invalid" });
    await expect(createCoachWorkoutDraft({ coachSessionId: "session-1", sourceKind: "text", sourceMetadata: { notes: "A".repeat(128) }, canonicalDraft: { exercises: [{ exercise_id: "exercise-1", sets: 1 }] } })).rejects.toMatchObject({ code: "invalid" });
  });

  it("propagates a set-write failure through the transaction so the session is rolled back", async () => {
    const helpers = jest.requireMock("../../../lib/db/helpers") as Record<string, jest.Mock>;
    let selectCalls = 0;
    const db = {
      select: jest.fn(() => {
        selectCalls++;
        const value = selectCalls < 3
          ? { id: "draft-1", coach_session_id: "session-1", source_metadata: "{}" }
          : { id: "revision-1", draft_id: "draft-1", version: 1, canonical_draft: JSON.stringify({ exercises: [{ exercise_id: "exercise-1", sets: 2 }] }), reason_ledger: "[]" };
        return { from: () => ({ where: () => ({ get: jest.fn().mockResolvedValue(value), orderBy: () => ({ get: jest.fn().mockResolvedValue(value) }) }) }) };
      }),
      insert: jest.fn()
        .mockImplementationOnce(() => ({ values: jest.fn().mockResolvedValue(undefined) }))
        .mockImplementationOnce(() => ({ values: jest.fn().mockRejectedValue(new Error("set insert failed")) })),
    };
    helpers.getDrizzle.mockResolvedValue(db);
    helpers.getDatabase.mockResolvedValue({ getFirstAsync: jest.fn().mockResolvedValue({ deleted_at: null }) });
    helpers.withTransaction.mockImplementation(async (fn: (database: unknown) => Promise<void>) => fn(db));
    await expect(startSessionFromCoachWorkoutDraft("draft-1", "session-1")).rejects.toThrow("set insert failed");
    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(helpers.withTransaction).toHaveBeenCalledTimes(1);
  });
});
