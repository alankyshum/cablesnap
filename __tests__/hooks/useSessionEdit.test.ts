/**
 * BLD-690 — useSessionEdit hook unit tests.
 *
 * Verifies:
 *  - enterEdit snapshots the read-only groups into a draft
 *  - dirty flag is false on snapshot, true after a mutation
 *  - cancel with NO dirt exits without prompting
 *  - cancel with dirt prompts Alert and only exits on Discard
 *  - save calls editCompletedSession + refresh, then exits edit mode
 *  - Android BackHandler is registered when editing && handler returns true
 *  - addSet/removeSet/removeExercise/addExercise mutate draft as expected
 *  - completed=1 + reps=0 auto-flips to completed=0 with a warning
 */
import { Alert, BackHandler, Platform } from "react-native";
import { act, renderHook } from "@testing-library/react-native";

jest.mock("@/lib/db", () => ({
  editCompletedSession: jest.fn(),
  cancelSession: jest.fn(),
}));

jest.mock("@/components/ui/bna-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

const { editCompletedSession, cancelSession } = require("@/lib/db");
const { useSessionEdit } = require("../../hooks/useSessionEdit");

type AnyHookReturn = ReturnType<typeof useSessionEdit>;

const baseGroup = {
  exercise_id: "ex1",
  name: "Bench Press",
  link_id: null,
  swapped_from_name: null,
  sets: [
    {
      id: "s1", session_id: "sess1", exercise_id: "ex1", set_number: 1,
      weight: 100, reps: 5, rpe: 8, completed: 1, set_type: "normal",
      link_id: null, round: null, bodyweight_modifier_kg: null,
      exercise_name: "Bench Press", exercise_deleted: 0,
    },
    {
      id: "s2", session_id: "sess1", exercise_id: "ex1", set_number: 2,
      weight: 100, reps: 4, rpe: 9, completed: 1, set_type: "normal",
      link_id: null, round: null, bodyweight_modifier_kg: null,
      exercise_name: "Bench Press", exercise_deleted: 0,
    },
  ],
};

function setup(overrides: Partial<Parameters<typeof useSessionEdit>[0]> = {}) {
  const refresh = jest.fn().mockResolvedValue(undefined);
  const onSessionDeleted = jest.fn();
  const onSaved = jest.fn();
  const result = renderHook(() =>
    useSessionEdit({
      sessionId: "sess1",
      sessionStartedAt: Date.UTC(2025, 0, 15),
      groups: [baseGroup as never],
      refresh,
      onSessionDeleted,
      onSaved,
      ...overrides,
    }),
  );
  return { ...result, refresh, onSessionDeleted, onSaved };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("useSessionEdit (BLD-690)", () => {
  it("starts inactive with empty draft", () => {
    const { result } = setup();
    expect((result.current as AnyHookReturn).editing).toBe(false);
    expect((result.current as AnyHookReturn).draft).toEqual([]);
    expect((result.current as AnyHookReturn).dirty).toBe(false);
  });

  it("enterEdit snapshots groups; dirty stays false until a mutation", () => {
    const { result } = setup();
    act(() => (result.current as AnyHookReturn).enterEdit());
    const r = result.current as AnyHookReturn;
    expect(r.editing).toBe(true);
    expect(r.draft).toHaveLength(1);
    expect(r.draft[0].sets).toHaveLength(2);
    expect(r.dirty).toBe(false);
  });

  it("dirty flips true after updateSet mutates a value", () => {
    const { result } = setup();
    act(() => (result.current as AnyHookReturn).enterEdit());
    act(() => (result.current as AnyHookReturn).updateSet(0, 0, { weight: 110 }));
    expect((result.current as AnyHookReturn).dirty).toBe(true);
  });

  it("addSet appends a new draft set; removeSet removes one", () => {
    const { result } = setup();
    act(() => (result.current as AnyHookReturn).enterEdit());
    act(() => (result.current as AnyHookReturn).addSet(0));
    expect((result.current as AnyHookReturn).draft[0].sets).toHaveLength(3);
    act(() => (result.current as AnyHookReturn).removeSet(0, 0));
    expect((result.current as AnyHookReturn).draft[0].sets).toHaveLength(2);
  });

  it("addExercise appends a new group with one starter set", () => {
    const { result } = setup();
    act(() => (result.current as AnyHookReturn).enterEdit());
    act(() =>
      (result.current as AnyHookReturn).addExercise({
        id: "ex-new",
        name: "Squat",
      } as never),
    );
    expect((result.current as AnyHookReturn).draft).toHaveLength(2);
    expect((result.current as AnyHookReturn).draft[1].sets).toHaveLength(1);
  });

  it("auto-flips completed=1+reps=0 to completed=0 with a warning", () => {
    const { result } = setup();
    act(() => (result.current as AnyHookReturn).enterEdit());
    act(() => (result.current as AnyHookReturn).updateSet(0, 0, { reps: 0 }));
    const set = (result.current as AnyHookReturn).draft[0].sets[0];
    expect(set.completed).toBe(0);
    expect(set.warning).toMatch(/not completed/i);
  });

  it("cancel with NO dirt exits immediately without alert", () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const { result } = setup();
    act(() => (result.current as AnyHookReturn).enterEdit());
    act(() => (result.current as AnyHookReturn).cancel());
    expect(alertSpy).not.toHaveBeenCalled();
    expect((result.current as AnyHookReturn).editing).toBe(false);
    alertSpy.mockRestore();
  });

  it("cancel WITH dirt prompts Alert and only discards on confirm", () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const { result } = setup();
    act(() => (result.current as AnyHookReturn).enterEdit());
    act(() => (result.current as AnyHookReturn).updateSet(0, 0, { weight: 999 }));
    act(() => (result.current as AnyHookReturn).cancel());
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect((result.current as AnyHookReturn).editing).toBe(true);

    // Simulate the user tapping "Discard"
    const buttons = alertSpy.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
    const discard = buttons.find((b) => b.text === "Discard");
    expect(discard).toBeDefined();
    act(() => discard!.onPress?.());
    expect((result.current as AnyHookReturn).editing).toBe(false);
    alertSpy.mockRestore();
  });

  it("save calls editCompletedSession with PATCH-style upserts and refreshes", async () => {
    (editCompletedSession as jest.Mock).mockResolvedValue(undefined);
    const { result, refresh, onSaved } = setup();
    act(() => (result.current as AnyHookReturn).enterEdit());
    act(() => (result.current as AnyHookReturn).updateSet(0, 0, { weight: 110 }));
    await act(async () => {
      await (result.current as AnyHookReturn).save();
    });
    expect(editCompletedSession).toHaveBeenCalledTimes(1);
    const [sessId, payload] = (editCompletedSession as jest.Mock).mock.calls[0];
    expect(sessId).toBe("sess1");
    expect(payload.upserts).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "s1", weight: 110, exercise_id: "ex1" })]),
    );
    // Untouched set s2 should not appear in upserts
    const s2 = payload.upserts.find((u: { id?: string }) => u.id === "s2");
    expect(s2).toBeUndefined();
    expect(refresh).toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
    expect((result.current as AnyHookReturn).editing).toBe(false);
  });

  it("save surfaces error via toast and stays in edit mode on failure", async () => {
    (editCompletedSession as jest.Mock).mockRejectedValue(new Error("bad"));
    const { result, refresh } = setup();
    act(() => (result.current as AnyHookReturn).enterEdit());
    act(() => (result.current as AnyHookReturn).updateSet(0, 0, { weight: 110 }));
    await act(async () => {
      await (result.current as AnyHookReturn).save();
    });
    expect(refresh).not.toHaveBeenCalled();
    expect((result.current as AnyHookReturn).editing).toBe(true);
  });

  it("Android BackHandler subscription is registered while editing", () => {
    const remove = jest.fn();
    const addSpy = jest
      .spyOn(BackHandler, "addEventListener")
      .mockReturnValue({ remove } as never);
    const { result, unmount } = setup();
    expect(addSpy).not.toHaveBeenCalled();
    act(() => (result.current as AnyHookReturn).enterEdit());
    expect(addSpy).toHaveBeenCalledWith("hardwareBackPress", expect.any(Function));
    // Verify the handler returns true to prevent default back nav
    const handler = addSpy.mock.calls[0][1] as () => boolean;
    let handlerResult = false;
    act(() => {
      handlerResult = handler();
    });
    expect(handlerResult).toBe(true);
    unmount();
    expect(remove).toHaveBeenCalled();
    addSpy.mockRestore();
  });

  it("deleteWholeSession confirms via Alert and calls cancelSession + onSessionDeleted", async () => {
    (cancelSession as jest.Mock).mockResolvedValue(undefined);
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const { result, onSessionDeleted } = setup();
    act(() => (result.current as AnyHookReturn).enterEdit());
    act(() => (result.current as AnyHookReturn).deleteWholeSession());
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const buttons = alertSpy.mock.calls[0][2] as Array<{ text: string; onPress?: () => void | Promise<void> }>;
    const del = buttons.find((b) => b.text === "Delete");
    expect(del).toBeDefined();
    await act(async () => {
      await del!.onPress?.();
    });
    expect(cancelSession).toHaveBeenCalledWith("sess1");
    expect(onSessionDeleted).toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});

// Silence Platform.OS gate in announceForAccessibility branch on web
Platform.OS = "ios" as never;
