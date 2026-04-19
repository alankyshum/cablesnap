import { renderHook, waitFor } from "@testing-library/react-native";
import { useExerciseDrawerStats } from "../../hooks/useExerciseDrawerStats";

const mockRecords = {
  max_weight: 105,
  max_reps: 12,
  max_volume: 1525,
  est_1rm: 121.3,
  total_sessions: 23,
  is_bodyweight: false,
  max_duration: null,
};

const mockBestSet = { weight: 105, reps: 5 };

const mockHistory = [
  {
    session_id: "s1",
    session_name: "Push Day",
    started_at: Date.now() - 86400000,
    max_weight: 102.5,
    max_reps: 6,
    total_reps: 18,
    set_count: 3,
    volume: 1525,
    avg_rpe: 8.5,
  },
];

jest.mock("../../lib/db/exercise-history", () => ({
  getExerciseRecords: jest.fn(),
  getBestSet: jest.fn(),
  getExerciseHistory: jest.fn(),
}));

const {
  getExerciseRecords,
  getBestSet,
  getExerciseHistory,
} = require("../../lib/db/exercise-history");

describe("useExerciseDrawerStats", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns loading state initially, then loaded data with history", async () => {
    getExerciseRecords.mockResolvedValue(mockRecords);
    getBestSet.mockResolvedValue(mockBestSet);
    getExerciseHistory.mockResolvedValue(mockHistory);

    const { result } = renderHook(() => useExerciseDrawerStats("ex-1"));

    // Initially loading
    expect(result.current.loading).toBe(true);
    expect(result.current.records).toBeNull();

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.records).toEqual(mockRecords);
    expect(result.current.bestSet).toEqual(mockBestSet);
    expect(result.current.lastSession).toEqual(mockHistory[0]);
    expect(result.current.error).toBe(false);
    expect(getExerciseHistory).toHaveBeenCalledWith("ex-1", 1, 0);
  });

  it("returns null data when exerciseId is null or exercise has no history", async () => {
    // Test null exerciseId
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useExerciseDrawerStats(id),
      { initialProps: { id: null } }
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.records).toBeNull();
    expect(result.current.bestSet).toBeNull();
    expect(result.current.lastSession).toBeNull();

    // Test exerciseId with no history
    const emptyRecords = { ...mockRecords, total_sessions: 0, max_weight: null, max_reps: null, est_1rm: null, max_volume: null };
    getExerciseRecords.mockResolvedValue(emptyRecords);
    getBestSet.mockResolvedValue(null);
    getExerciseHistory.mockResolvedValue([]);

    rerender({ id: "ex-empty" });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.records!.total_sessions).toBe(0);
    expect(result.current.bestSet).toBeNull();
    expect(result.current.lastSession).toBeNull();
  });

  it("handles errors gracefully", async () => {
    getExerciseRecords.mockRejectedValue(new Error("DB error"));
    getBestSet.mockRejectedValue(new Error("DB error"));
    getExerciseHistory.mockRejectedValue(new Error("DB error"));

    const { result } = renderHook(() => useExerciseDrawerStats("ex-fail"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(true);
    expect(result.current.records).toBeNull();
  });
});
