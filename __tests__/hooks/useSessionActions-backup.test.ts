/* eslint-disable @typescript-eslint/no-explicit-any */

// ---- Mocks ----

const mockPerformAutoBackup = jest.fn().mockResolvedValue({ success: true });
const mockIsAutoBackupEnabled = jest.fn().mockResolvedValue(true);

jest.mock("../../lib/backup", () => ({
  performAutoBackup: (...args: any[]) => mockPerformAutoBackup(...args),
  isAutoBackupEnabled: (...args: any[]) => mockIsAutoBackupEnabled(...args),
}));

const mockCompleteSession = jest.fn().mockResolvedValue(undefined);
const mockGetSessionSets = jest.fn();

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
  updateSetTrainingMode: jest.fn(),
  getSessionSets: (...args: any[]) => mockGetSessionSets(...args),
  updateSetDuration: jest.fn(),
  checkSetPR: jest.fn(),
  updateExercisePositions: jest.fn(),
  getGoalForExercise: jest.fn().mockResolvedValue(null),
  achieveGoal: jest.fn(),
  getCurrentBestWeight: jest.fn(),
}));

jest.mock("../../lib/query", () => ({
  bumpQueryVersion: jest.fn(),
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

import { renderHook, act } from "@testing-library/react-native";
import { useSessionActions } from "../../hooks/useSessionActions";

function createParams(overrides: Partial<Parameters<typeof useSessionActions>[0]> = {}) {
  return {
    id: "session-1",
    groups: [],
    setGroups: jest.fn(),
    modes: {},
    setModes: jest.fn(),
    updateGroupSet: jest.fn(),
    startRest: jest.fn(),
    startRestWithDuration: jest.fn(),
    session: { started_at: Date.now() - 30000, name: "Test" },
    showToast: jest.fn(),
    showError: jest.fn(),
    ...overrides,
  };
}

describe("useSessionActions — auto-backup integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPerformAutoBackup.mockResolvedValue({ success: true });
    mockIsAutoBackupEnabled.mockResolvedValue(true);
  });

  it("triggers backup on summary path (done.length > 0)", async () => {
    mockGetSessionSets.mockResolvedValue([
      { id: "s1", completed: true },
      { id: "s2", completed: true },
    ]);

    const { result } = renderHook(() => useSessionActions(createParams()));

    await act(async () => {
      result.current.finish();
      // Wait for all async operations
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(mockReplace).toHaveBeenCalledWith("/session/summary/session-1");
    expect(mockIsAutoBackupEnabled).toHaveBeenCalled();
    expect(mockPerformAutoBackup).toHaveBeenCalled();
  });

  it("does NOT trigger backup on discard path (done.length === 0)", async () => {
    mockGetSessionSets.mockResolvedValue([
      { id: "s1", completed: false },
    ]);

    const { result } = renderHook(() => useSessionActions(createParams()));

    await act(async () => {
      result.current.finish();
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(mockReplace).toHaveBeenCalledWith("/(tabs)");
    expect(mockPerformAutoBackup).not.toHaveBeenCalled();
  });

  it("does NOT trigger backup when auto-backup is disabled", async () => {
    mockIsAutoBackupEnabled.mockResolvedValue(false);
    mockGetSessionSets.mockResolvedValue([
      { id: "s1", completed: true },
    ]);

    const { result } = renderHook(() => useSessionActions(createParams()));

    await act(async () => {
      result.current.finish();
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(mockReplace).toHaveBeenCalledWith("/session/summary/session-1");
    expect(mockIsAutoBackupEnabled).toHaveBeenCalled();
    expect(mockPerformAutoBackup).not.toHaveBeenCalled();
  });

  it("navigation still happens when backup throws (QD TEST-02)", async () => {
    mockPerformAutoBackup.mockRejectedValue(new Error("Disk full"));
    mockGetSessionSets.mockResolvedValue([
      { id: "s1", completed: true },
    ]);

    const { result } = renderHook(() => useSessionActions(createParams()));

    await act(async () => {
      result.current.finish();
      await new Promise((r) => setTimeout(r, 50));
    });

    // Navigation MUST happen even when backup fails
    expect(mockReplace).toHaveBeenCalledWith("/session/summary/session-1");
  });
});
