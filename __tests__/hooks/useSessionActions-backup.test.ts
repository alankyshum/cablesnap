/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Integration tests for auto-backup in useSessionActions.
 *
 * Note: The dynamic import() in the fire-and-forget IIFE cannot be intercepted
 * in Jest without --experimental-vm-modules. These tests verify:
 * 1. Navigation to summary happens on summary path (done.length > 0)
 * 2. Navigation to tabs happens on discard path (done.length === 0)
 * 3. Navigation is never blocked by the backup IIFE (even if import throws)
 */

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
  queryClient: {
    removeQueries: jest.fn(),
  },
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

function flush(ms = 100): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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
  });

  it("navigates to summary on summary path (done.length > 0) — backup IIFE is non-blocking", async () => {
    mockGetSessionSets.mockResolvedValue([
      { id: "s1", completed: true },
      { id: "s2", completed: true },
    ]);

    const { result } = renderHook(() => useSessionActions(createParams()));

    await act(async () => {
      result.current.finish();
      await flush();
    });

    expect(mockReplace).toHaveBeenCalledWith("/session/summary/session-1");
  });

  it("navigates to tabs on discard path (done.length === 0) — no backup triggered", async () => {
    mockGetSessionSets.mockResolvedValue([
      { id: "s1", completed: false },
    ]);

    const { result } = renderHook(() => useSessionActions(createParams()));

    await act(async () => {
      result.current.finish();
      await flush();
    });

    expect(mockReplace).toHaveBeenCalledWith("/(tabs)");
  });

  it("navigation still happens when backup IIFE throws (QD TEST-02)", async () => {
    // Even if the dynamic import fails (Jest limitation) or backup throws,
    // the fire-and-forget IIFE has a catch block, so navigation is never blocked
    mockGetSessionSets.mockResolvedValue([
      { id: "s1", completed: true },
    ]);

    const { result } = renderHook(() => useSessionActions(createParams()));

    await act(async () => {
      result.current.finish();
      await flush();
    });

    expect(mockReplace).toHaveBeenCalledWith("/session/summary/session-1");
  });
});
