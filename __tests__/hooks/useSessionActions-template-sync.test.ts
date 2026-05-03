/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * BLD-1038: Tests for the template-sync path in useSessionActions.completeSession.
 *
 * Verifies:
 * 1. syncTemplateFromSession is called with the session id after completeSession.
 * 2. showToast is called with an Undo action when sync returns a result.
 * 3. Undo action calls undoTemplateSyncFromSession with the sync result.
 * 4. When syncTemplateFromSession throws, session completion still resolves and
 *    no toast is fired (try/catch must not propagate).
 * 5. When syncTemplateFromSession returns null (no changes), no toast is fired.
 */

const mockCompleteSession = jest.fn().mockResolvedValue(undefined);
const mockGetSessionSets = jest.fn().mockResolvedValue([]);
const mockSyncTemplateFromSession = jest.fn();
const mockUndoTemplateSyncFromSession = jest.fn().mockResolvedValue(undefined);

jest.mock("../../lib/db", () => ({
  addSet: jest.fn(),
  cancelSession: jest.fn(),
  deleteSet: jest.fn(),
  completeSession: (...args: any[]) => mockCompleteSession(...args),
  completeSet: jest.fn(),
  getRestSecondsForLink: jest.fn(),
  uncompleteSet: jest.fn(),
  updateSet: jest.fn(),
  updateSetRPE: jest.fn(),
  updateSetNotes: jest.fn(),
  getSessionSets: (...args: any[]) => mockGetSessionSets(...args),
  updateSetDuration: jest.fn(),
  checkSetPR: jest.fn(),
  checkSetBodyweightModifierPR: jest.fn(),
  updateExercisePositions: jest.fn(),
  getGoalForExercise: jest.fn().mockResolvedValue(null),
  achieveGoal: jest.fn(),
  getCurrentBestWeight: jest.fn(),
  getRestContext: jest.fn(),
  getAppSetting: jest.fn().mockResolvedValue(null),
  syncTemplateFromSession: (...args: any[]) => mockSyncTemplateFromSession(...args),
  undoTemplateSyncFromSession: (...args: any[]) => mockUndoTemplateSyncFromSession(...args),
}));

jest.mock("../../lib/query", () => ({
  bumpQueryVersion: jest.fn(),
  queryClient: { removeQueries: jest.fn() },
}));

jest.mock("../../lib/programs", () => ({
  getSessionProgramDayId: jest.fn().mockResolvedValue(null),
  getProgramDayById: jest.fn(),
  advanceProgram: jest.fn(),
}));

jest.mock("../../lib/strava", () => ({
  syncSessionToStrava: jest.fn().mockResolvedValue(false),
}));

jest.mock("../../lib/health-connect", () => ({
  syncToHealthConnect: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light" },
}));

const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack }),
}));

jest.mock("../../lib/confirm", () => ({
  confirmAction: jest.fn((_title: string, _msg: string, cb: () => Promise<void>) => cb()),
}));

jest.mock("../../lib/format", () => ({
  formatTime: jest.fn(() => "0:30"),
  computePrefillSets: jest.fn(() => []),
}));

jest.mock("@/components/ui/bna-toast", () => ({
  useToast: () => ({
    warning: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  }),
}));


import { renderHook, act } from "@testing-library/react-native";
import { useSessionActions } from "../../hooks/useSessionActions";

function flush(ms = 100): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function createParams(overrides: Partial<Parameters<typeof useSessionActions>[0]> = {}) {
  return {
    id: "session-1",
    groups: [],
    setGroups: jest.fn(),
    updateGroupSet: jest.fn(),
    startRest: jest.fn(),
    startRestWithDuration: jest.fn(),
    startRestWithBreakdown: jest.fn(),
    session: { started_at: Date.now() - 30000, name: "Test" },
    showToast: jest.fn(),
    showError: jest.fn(),
    ...overrides,
  };
}

describe("useSessionActions — template sync on completeSession (BLD-1038)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: one completed set so completeSession navigates to summary
    mockGetSessionSets.mockResolvedValue([{ id: "s1", completed: true }]);
  });

  it("calls syncTemplateFromSession with the session id after completing", async () => {
    mockSyncTemplateFromSession.mockResolvedValue(null);
    const { result } = renderHook(() => useSessionActions(createParams()));

    await act(async () => {
      result.current.finish();
      await flush();
    });

    expect(mockSyncTemplateFromSession).toHaveBeenCalledWith("session-1");
  });

  it("calls showToast with Undo action when sync returns a result", async () => {
    const syncResult = { templateId: "tpl-1", changes: [{ templateExerciseId: "te1", oldTargetSets: 3, newTargetSets: 4, oldSetTypes: ["normal"], newSetTypes: ["normal"] }] };
    mockSyncTemplateFromSession.mockResolvedValue(syncResult);
    const showToast = jest.fn();
    const { result } = renderHook(() => useSessionActions(createParams({ showToast })));

    await act(async () => {
      result.current.finish();
      await flush();
    });

    expect(showToast).toHaveBeenCalledWith(
      "Template updated from this session",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Undo" }),
        duration: 6000,
      })
    );
  });

  it("Undo action calls undoTemplateSyncFromSession with the sync result", async () => {
    const syncResult = { templateId: "tpl-1", changes: [] };
    mockSyncTemplateFromSession.mockResolvedValue(syncResult);
    let capturedOnPress: (() => void | Promise<void>) | undefined;
    const showToast = jest.fn((_msg: string, opts?: any) => {
      capturedOnPress = opts?.action?.onPress;
    });

    const { result } = renderHook(() => useSessionActions(createParams({ showToast })));

    await act(async () => {
      result.current.finish();
      await flush();
    });

    expect(capturedOnPress).toBeDefined();
    await act(async () => {
      await capturedOnPress!();
    });

    expect(mockUndoTemplateSyncFromSession).toHaveBeenCalledWith(syncResult);
  });

  it("does not fire toast when sync returns null (no changes)", async () => {
    mockSyncTemplateFromSession.mockResolvedValue(null);
    const showToast = jest.fn();
    const { result } = renderHook(() => useSessionActions(createParams({ showToast })));

    await act(async () => {
      result.current.finish();
      await flush();
    });

    // showToast may be called for Strava etc., but NOT for template sync
    const templateSyncCalls = showToast.mock.calls.filter(
      ([msg]) => msg === "Template updated from this session"
    );
    expect(templateSyncCalls).toHaveLength(0);
  });

  it("session completion still resolves when syncTemplateFromSession throws", async () => {
    mockSyncTemplateFromSession.mockRejectedValue(new Error("DB error"));
    const showToast = jest.fn();
    const { result } = renderHook(() => useSessionActions(createParams({ showToast })));

    await act(async () => {
      result.current.finish();
      await flush();
    });

    // Navigation still happens — sync error did not propagate
    expect(mockReplace).toHaveBeenCalledWith("/session/summary/session-1");

    // No template-sync toast fired when sync throws
    const templateSyncCalls = showToast.mock.calls.filter(
      ([msg]) => msg === "Template updated from this session"
    );
    expect(templateSyncCalls).toHaveLength(0);
  });
});
