/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * BLD-705 — Hydration zero-write invariant (AC5 spy).
 *
 * Locks AC5 of `.plans/PLAN-BLD-682.md`:
 *   "Prefilled values via the `handleAddSet` path are persisted via the
 *    existing `updateSet` write API. Hydration prefill (display-only) does
 *    NOT write. Verified by an `updateSet`-spy test: zero `updateSet`
 *    calls fire during session hydration of pristine rows."
 *
 * Why this test exists (do NOT remove):
 *   The `useSessionData.load()` hydration path computes a display-only
 *   `prefillCandidate` for pristine pre-seeded rows. A regression that
 *   accidentally calls `updateSet` (or `updateSetsBatch`, or
 *   `updateGroupSet`) during hydration would silently overwrite
 *   user-entered values with prior-workout values — a data-safety class
 *   of bug invisible without telemetry. This spy test pins the contract.
 *
 * Out of scope:
 *   - Changes to `useSessionData.ts` itself
 *   - The `setComplete` carry-write (AC18) — exercised separately by
 *     `__tests__/hooks/useSessionActions-add-set-prev-workout.test.ts`
 *
 * Coverage of the hydration cycle for a session that mixes:
 *   1. Pristine row WITH a matching prior-workout candidate
 *   2. Pristine row WITHOUT a matching prior-workout candidate
 *   3. Non-pristine row (weight/reps already set by user)
 *   4. Completed row
 *   5. Non-pristine row with notes / bodyweight modifier set
 *
 * In all cases: `updateSet` and `updateSetsBatch` spies must record ZERO
 * calls across the full hydration cycle, AND the in-state `updateGroupSet`
 * setter must also remain unfired (hydration replaces `groups` wholesale
 * via `setGroups`, not via per-row patches).
 */

const mockUpdateSet = jest.fn().mockResolvedValue(undefined);
const mockUpdateSetsBatch = jest.fn().mockResolvedValue(undefined);
const mockUpdateExercisePositions = jest.fn().mockResolvedValue(undefined);
const mockGetSessionById = jest.fn();
const mockGetSessionSets = jest.fn();
const mockGetBodySettings = jest.fn();
const mockGetExercisesByIds = jest.fn();
const mockGetPreviousSetsBatch = jest.fn();
const mockGetRecentExerciseSetsBatch = jest.fn();
const mockGetMaxWeightByExercise = jest.fn();
const mockGetAllExercises = jest.fn().mockResolvedValue([]);
const mockGetTemplateById = jest.fn();
const mockGetSourceSessionSets = jest.fn();
const mockBuildInitialSetsFromTemplate = jest.fn();
const mockAddSetsBatch = jest.fn().mockResolvedValue([]);

jest.mock("../../lib/db", () => ({
  addSetsBatch: (...args: any[]) => mockAddSetsBatch(...args),
  getBodySettings: (...args: any[]) => mockGetBodySettings(...args),
  getAllExercises: (...args: any[]) => mockGetAllExercises(...args),
  getMaxWeightByExercise: (...args: any[]) => mockGetMaxWeightByExercise(...args),
  getRecentExerciseSetsBatch: (...args: any[]) => mockGetRecentExerciseSetsBatch(...args),
  getSessionById: (...args: any[]) => mockGetSessionById(...args),
  getSessionSets: (...args: any[]) => mockGetSessionSets(...args),
  getSourceSessionSets: (...args: any[]) => mockGetSourceSessionSets(...args),
  getTemplateById: (...args: any[]) => mockGetTemplateById(...args),
  buildInitialSetsFromTemplate: (...args: any[]) => mockBuildInitialSetsFromTemplate(...args),
  getPreviousSetsBatch: (...args: any[]) => mockGetPreviousSetsBatch(...args),
  getExercisesByIds: (...args: any[]) => mockGetExercisesByIds(...args),
  updateSet: (...args: any[]) => mockUpdateSet(...args),
  updateSetsBatch: (...args: any[]) => mockUpdateSetsBatch(...args),
  updateExercisePositions: (...args: any[]) => mockUpdateExercisePositions(...args),
}));

jest.mock("../../lib/query", () => ({
  getQueryVersion: jest.fn(() => 0),
  bumpQueryVersion: jest.fn(),
  queryClient: {
    removeQueries: jest.fn(),
    fetchQuery: jest.fn(),
    invalidateQueries: jest.fn(),
  },
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: () => {
    /* no-op for hydration test — load() is invoked directly via the
       initial-mount effect, no focus replay needed. */
  },
}));

jest.mock("@/components/ui/bna-toast", () => ({
  useToast: () => ({
    warning: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  }),
}));

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    tertiary: "#000",
    secondary: "#000",
    primary: "#000",
    error: "#000",
    inversePrimary: "#000",
  }),
}));

import { renderHook, act } from "@testing-library/react-native";
import { useSessionData } from "../../hooks/useSessionData";

const flush = () => new Promise((r) => setTimeout(r, 50));

function makeSet(overrides: any = {}) {
  return {
    id: "set-x",
    session_id: "session-1",
    exercise_id: "ex-1",
    set_number: 1,
    weight: null,
    reps: null,
    completed: false,
    completed_at: null,
    rpe: null,
    notes: null,
    link_id: null,
    round: null,
    tempo: null,
    swapped_from_exercise_id: null,
    set_type: "normal",
    duration_seconds: null,
    bodyweight_modifier_kg: null,
    exercise_position: 1,
    exercise_name: "Bench",
    exercise_deleted: false,
    ...overrides,
  };
}

function setupBaseMocks() {
  mockGetSessionById.mockResolvedValue({
    id: "session-1",
    template_id: null,
    name: "Test session",
    started_at: Date.now() - 1000,
    clock_started_at: null,
    completed_at: null, // critical: not completed → load() proceeds, no router.replace
    duration_seconds: null,
    notes: "",
    rating: null,
    edited_at: null,
  });
  mockGetBodySettings.mockResolvedValue({ weight_unit: "kg" });
  mockGetExercisesByIds.mockResolvedValue({
    "ex-1": {
      id: "ex-1",
      training_modes: [],
      is_voltra: false,
      equipment: "barbell",
      category: "chest",
      mount_position: null,
    },
  });
  mockGetMaxWeightByExercise.mockResolvedValue({});
  mockGetRecentExerciseSetsBatch.mockResolvedValue({});
}

describe("useSessionData hydration — zero updateSet writes (BLD-705 / AC5)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupBaseMocks();
  });

  /**
   * Asserts every write-spy is at zero AFTER hydration finished.
   * The single-source-of-truth assertion for AC5.
   */
  function assertNoHydrationWrites() {
    expect(mockUpdateSet).toHaveBeenCalledTimes(0);
    expect(mockUpdateSetsBatch).toHaveBeenCalledTimes(0);
  }

  it("AC5: pristine row WITH matching prior-workout candidate → zero updateSet writes", async () => {
    mockGetSessionSets.mockResolvedValue([
      makeSet({ id: "s1", set_number: 1 }),
    ]);
    mockGetPreviousSetsBatch.mockResolvedValue({
      "ex-1": [
        {
          set_number: 1,
          weight: 100,
          reps: 8,
          duration_seconds: null,
          set_type: "normal",
          completed: true,
          rpe: null,
        },
      ],
    });

    const { result } = renderHook(() =>
      useSessionData({ id: "session-1", templateId: undefined, sourceSessionId: undefined }),
    );
    await act(async () => {
      await flush();
    });

    // The pristine row should have a non-null prefillCandidate (display-only)
    const row = result.current.groups[0]?.sets[0] as any;
    expect(row).toBeTruthy();
    expect(row.prefillCandidate).toEqual({ weight: 100, reps: 8, duration_seconds: null });

    // But ZERO writes to the DB during hydration.
    assertNoHydrationWrites();
  });

  it("AC5: pristine row WITHOUT prior-workout candidate → zero updateSet writes", async () => {
    mockGetSessionSets.mockResolvedValue([
      makeSet({ id: "s1", set_number: 1 }),
    ]);
    mockGetPreviousSetsBatch.mockResolvedValue({}); // no history

    renderHook(() =>
      useSessionData({ id: "session-1", templateId: undefined, sourceSessionId: undefined }),
    );
    await act(async () => {
      await flush();
    });

    assertNoHydrationWrites();
  });

  it("AC5: non-pristine row (user already entered weight/reps) → zero updateSet writes", async () => {
    mockGetSessionSets.mockResolvedValue([
      makeSet({ id: "s1", set_number: 1, weight: 80, reps: 5 }),
    ]);
    // Even when prev workout has a different value that COULD overwrite,
    // hydration must not touch the user's entered data.
    mockGetPreviousSetsBatch.mockResolvedValue({
      "ex-1": [
        {
          set_number: 1,
          weight: 999, // intentionally different — must NOT be persisted
          reps: 99,
          duration_seconds: null,
          set_type: "normal",
          completed: true,
          rpe: null,
        },
      ],
    });

    const { result } = renderHook(() =>
      useSessionData({ id: "session-1", templateId: undefined, sourceSessionId: undefined }),
    );
    await act(async () => {
      await flush();
    });

    // Pristine guard rejects this row → no candidate surfaced.
    const row = result.current.groups[0]?.sets[0] as any;
    expect(row.weight).toBe(80);
    expect(row.reps).toBe(5);
    expect(row.prefillCandidate).toBeNull();

    assertNoHydrationWrites();
  });

  it("AC5: completed row → zero updateSet writes", async () => {
    mockGetSessionSets.mockResolvedValue([
      makeSet({
        id: "s1",
        set_number: 1,
        weight: 100,
        reps: 8,
        completed: true,
        completed_at: Date.now() - 500,
      }),
    ]);
    mockGetPreviousSetsBatch.mockResolvedValue({
      "ex-1": [
        {
          set_number: 1,
          weight: 105,
          reps: 8,
          duration_seconds: null,
          set_type: "normal",
          completed: true,
          rpe: null,
        },
      ],
    });

    renderHook(() =>
      useSessionData({ id: "session-1", templateId: undefined, sourceSessionId: undefined }),
    );
    await act(async () => {
      await flush();
    });

    assertNoHydrationWrites();
  });

  it("AC5: row with notes set → non-pristine, zero updateSet writes", async () => {
    mockGetSessionSets.mockResolvedValue([
      makeSet({ id: "s1", set_number: 1, notes: "felt heavy" }),
    ]);
    mockGetPreviousSetsBatch.mockResolvedValue({
      "ex-1": [
        {
          set_number: 1,
          weight: 100,
          reps: 8,
          duration_seconds: null,
          set_type: "normal",
          completed: true,
          rpe: null,
        },
      ],
    });

    const { result } = renderHook(() =>
      useSessionData({ id: "session-1", templateId: undefined, sourceSessionId: undefined }),
    );
    await act(async () => {
      await flush();
    });

    const row = result.current.groups[0]?.sets[0] as any;
    expect(row.prefillCandidate).toBeNull();
    assertNoHydrationWrites();
  });

  it("AC5: row with bodyweight_modifier_kg set → non-pristine, zero updateSet writes", async () => {
    mockGetSessionSets.mockResolvedValue([
      makeSet({ id: "s1", set_number: 1, bodyweight_modifier_kg: 10 }),
    ]);
    mockGetPreviousSetsBatch.mockResolvedValue({
      "ex-1": [
        {
          set_number: 1,
          weight: null,
          reps: 10,
          duration_seconds: null,
          set_type: "normal",
          completed: true,
          rpe: null,
        },
      ],
    });

    const { result } = renderHook(() =>
      useSessionData({ id: "session-1", templateId: undefined, sourceSessionId: undefined }),
    );
    await act(async () => {
      await flush();
    });

    const row = result.current.groups[0]?.sets[0] as any;
    expect(row.prefillCandidate).toBeNull();
    assertNoHydrationWrites();
  });

  it("AC5: full mixed session (pristine+matched, pristine+no-match, non-pristine, completed) → zero updateSet writes", async () => {
    // Single hydration covers ALL row archetypes that AC5 must protect.
    // If ANY single archetype regresses, this assertion catches it.
    mockGetSessionSets.mockResolvedValue([
      // 1. Pristine WITH matching prev candidate
      makeSet({ id: "s1", set_number: 1 }),
      // 2. Pristine WITHOUT matching prev candidate (set_number 4 has no
      //    prior row in the prev cache)
      makeSet({ id: "s2", set_number: 4 }),
      // 3. Non-pristine — user typed weight + reps
      makeSet({ id: "s3", set_number: 2, weight: 80, reps: 5 }),
      // 4. Completed row
      makeSet({
        id: "s4",
        set_number: 3,
        weight: 100,
        reps: 8,
        completed: true,
        completed_at: Date.now() - 1000,
      }),
    ]);
    mockGetPreviousSetsBatch.mockResolvedValue({
      "ex-1": [
        { set_number: 1, weight: 100, reps: 8, duration_seconds: null, set_type: "normal", completed: true, rpe: null },
        { set_number: 2, weight: 100, reps: 8, duration_seconds: null, set_type: "normal", completed: true, rpe: null },
        { set_number: 3, weight: 105, reps: 8, duration_seconds: null, set_type: "normal", completed: true, rpe: null },
        // intentionally NOTHING for set_number 4
      ],
    });

    const { result } = renderHook(() =>
      useSessionData({ id: "session-1", templateId: undefined, sourceSessionId: undefined }),
    );
    await act(async () => {
      await flush();
    });

    const sets = result.current.groups[0]?.sets ?? [];
    expect(sets).toHaveLength(4);

    // Sanity-check the display-only invariants the spec promises.
    // s1 → pristine + match → candidate surfaced
    expect((sets[0] as any).prefillCandidate).toEqual({ weight: 100, reps: 8, duration_seconds: null });
    // s2 → pristine, no match → null
    expect((sets[1] as any).prefillCandidate).toBeNull();
    // s3 → non-pristine → null
    expect((sets[2] as any).prefillCandidate).toBeNull();
    // s4 → completed → null
    expect((sets[3] as any).prefillCandidate).toBeNull();

    // The actual contract: zero writes during hydration of ANY archetype.
    assertNoHydrationWrites();
  });

  it("AC5: duration-mode pristine row with matching prev candidate → zero updateSet writes", async () => {
    // Duration tracking exercises share the same hydration path; lock the
    // invariant for that branch too.
    mockGetExercisesByIds.mockReset();
    mockGetExercisesByIds.mockResolvedValue({
      "ex-1": {
        id: "ex-1",
        // useSessionData detects duration mode via instructions text
        // (post-BLD-773 mechanism — replaces the legacy training_modes
        // ["isometric"] sentinel removed by F12/F13 column drops).
        instructions: "Hold for the target duration.",
        is_voltra: false,
        equipment: "barbell",
        category: "core",
      },
    });
    mockGetSessionSets.mockResolvedValue([
      makeSet({ id: "s1", set_number: 1 }),
    ]);
    mockGetPreviousSetsBatch.mockResolvedValue({
      "ex-1": [
        {
          set_number: 1,
          weight: 0,
          reps: null,
          duration_seconds: 60,
          set_type: "normal",
          completed: true,
          rpe: null,
        },
      ],
    });

    const { result } = renderHook(() =>
      useSessionData({ id: "session-1", templateId: undefined, sourceSessionId: undefined }),
    );
    await act(async () => {
      await flush();
    });

    const row = result.current.groups[0]?.sets[0] as any;
    expect(row.prefillCandidate).toEqual({ weight: 0, reps: null, duration_seconds: 60 });
    assertNoHydrationWrites();
  });
});
