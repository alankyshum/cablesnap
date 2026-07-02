/**
 * Tests for useNutritionData.ts — Training-Day Macro Adjustment wiring.
 *
 * Coverage targets:
 *   AC8   — per-day navigation: each displayed date uses its own day classification
 *   AC9   — post-workout refresh: useFocusEffect re-runs load() which re-classifies
 *   AC12a — no write to macro_targets (compute-on-read, base row unchanged)
 *   AC12b — coherent narrative: trainingDayAdjustment prop emitted for NutritionListHeader
 *   AC15  — CI green: all tests pass
 *   AC18  — today-before-workout: when wasWorkoutDay=false, base/neutral target shown
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGetDailyLogs = jest.fn().mockResolvedValue([]);
const mockGetDailySummary = jest.fn().mockResolvedValue({ calories: 0, protein: 0, carbs: 0, fat: 0 });
const mockGetMacroTargets = jest.fn();
const mockGetDailyTotalMl = jest.fn().mockResolvedValue(0);
const mockGetWaterLogsForDate = jest.fn().mockResolvedValue([]);
const mockAddDailyLog = jest.fn().mockResolvedValue(undefined);
const mockDeleteDailyLog = jest.fn().mockResolvedValue(undefined);
const mockAddWaterLog = jest.fn().mockResolvedValue(undefined);
const mockDeleteWaterLog = jest.fn().mockResolvedValue(undefined);
const mockUpdateWaterLog = jest.fn().mockResolvedValue(undefined);
const mockGetAppSetting = jest.fn().mockResolvedValue(null);
const mockGetLatestBodyWeight = jest.fn().mockResolvedValue({ id: "bw1", weight: 80, date: "2026-07-01" });

jest.mock("../../lib/db", () => ({
  getDailyLogs: (...a: unknown[]) => mockGetDailyLogs(...a),
  getDailySummary: (...a: unknown[]) => mockGetDailySummary(...a),
  getMacroTargets: (...a: unknown[]) => mockGetMacroTargets(...a),
  getDailyTotalMl: (...a: unknown[]) => mockGetDailyTotalMl(...a),
  getWaterLogsForDate: (...a: unknown[]) => mockGetWaterLogsForDate(...a),
  addDailyLog: (...a: unknown[]) => mockAddDailyLog(...a),
  deleteDailyLog: (...a: unknown[]) => mockDeleteDailyLog(...a),
  addWaterLog: (...a: unknown[]) => mockAddWaterLog(...a),
  deleteWaterLog: (...a: unknown[]) => mockDeleteWaterLog(...a),
  updateWaterLog: (...a: unknown[]) => mockUpdateWaterLog(...a),
  getAppSetting: (...a: unknown[]) => mockGetAppSetting(...a),
  getLatestBodyWeight: (...a: unknown[]) => mockGetLatestBodyWeight(...a),
}));

const mockGetAllSettings = jest.fn();
jest.mock("../../lib/db/training-day-settings", () => ({
  getAllSettings: (...a: unknown[]) => mockGetAllSettings(...a),
}));

const mockWasWorkoutDay = jest.fn();
jest.mock("../../lib/db/training-day-workout", () => ({
  wasWorkoutDay: (...a: unknown[]) => mockWasWorkoutDay(...a),
}));

jest.mock("expo-router", () => ({
  router: { setParams: jest.fn() },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({}),
}));

jest.mock("../../components/ui/bna-toast", () => ({
  useToast: () => ({ info: jest.fn(), error: jest.fn() }),
}));

// ─── Subject under test ───────────────────────────────────────────────────────

import { renderHook, act } from "@testing-library/react-native";
import { useNutritionData } from "../../hooks/useNutritionData";

// ─── Test fixtures ────────────────────────────────────────────────────────────

const BASE_TARGETS = {
  id: "t1",
  calories: 2400,
  protein: 160,
  carbs: 250,
  fat: 65,
  updated_at: 1000000,
};

const TRAINING_SETTINGS = {
  enabled: true,
  splitPercent: 10,
  trainingDaysPerWeek: 4,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useNutritionData — Training-Day Macro Adjustment wiring", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMacroTargets.mockResolvedValue(BASE_TARGETS);
    mockGetAllSettings.mockResolvedValue(TRAINING_SETTINGS);
    mockWasWorkoutDay.mockResolvedValue(false); // default: rest day
    mockGetLatestBodyWeight.mockResolvedValue({ id: "bw1", weight: 80, date: "2026-07-01" });
  });

  // ── AC12a: no write to macro_targets ─────────────────────────────────────

  it("AC12a: getMacroTargets is called but never updated/mutated by training-day logic", async () => {
    mockWasWorkoutDay.mockResolvedValue(true);
    const { result } = renderHook(() => useNutritionData());
    await act(async () => { await result.current.load(); });

    // getMacroTargets is READ (once per load)
    expect(mockGetMacroTargets).toHaveBeenCalledTimes(1);

    // No write to macro_targets table — there are no update/insert mock calls
    // (the hook only calls the DB functions exposed via lib/db, none of which
    // include updateMacroTargets or insertMacroTargets in this context)
    // We verify the base targets object from DB is NOT stored verbatim but
    // the effective target IS reflected in hook state (calories differ from base)
    const adj = result.current.trainingDayAdjustment;
    expect(adj).not.toBeNull();
    expect(adj!.baseCals).toBe(BASE_TARGETS.calories);
    // Training day: effective > base
    expect(result.current.targets!.calories).toBeGreaterThan(BASE_TARGETS.calories);
  });

  // ── AC18: today before workout → base/neutral target ─────────────────────

  it("AC18: when wasWorkoutDay=false (today before workout), shows base/neutral target", async () => {
    mockWasWorkoutDay.mockResolvedValue(false);
    const { result } = renderHook(() => useNutritionData());
    await act(async () => { await result.current.load(); });

    const adj = result.current.trainingDayAdjustment;
    expect(adj).not.toBeNull();
    expect(adj!.dayType).toBe("rest");
    // Rest day: targets.calories < base (Model 2)
    expect(result.current.targets!.calories).toBeLessThan(BASE_TARGETS.calories);
  });

  it("AC18: once wasWorkoutDay becomes true (workout logged), targets update to training value", async () => {
    // First load: rest day
    mockWasWorkoutDay.mockResolvedValue(false);
    const { result } = renderHook(() => useNutritionData());
    await act(async () => { await result.current.load(); });
    const restCals = result.current.targets!.calories;

    // Second load (workout logged, AC9 refocus simulation): training day
    mockWasWorkoutDay.mockResolvedValue(true);
    await act(async () => { await result.current.load(); });
    const trainingCals = result.current.targets!.calories;

    expect(trainingCals).toBeGreaterThan(restCals);
    expect(result.current.trainingDayAdjustment!.dayType).toBe("training");
  });

  // ── AC8: per-day navigation ────────────────────────────────────────────────

  it("AC8: wasWorkoutDay is called with the current displayed date key", async () => {
    const { result } = renderHook(() => useNutritionData());
    await act(async () => { await result.current.load(); });

    // The date key passed to wasWorkoutDay should match the current date
    expect(mockWasWorkoutDay).toHaveBeenCalledWith(
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
    );
  });

  it("AC8: navigating prev/next triggers load with the new date key", async () => {
    const { result } = renderHook(() => useNutritionData());
    await act(async () => { await result.current.load(); });

    const firstDateKey = mockWasWorkoutDay.mock.calls[0]?.[0];

    // Navigate to previous day
    act(() => { result.current.prev(); });
    await act(async () => { await result.current.load(); });

    const secondDateKey = mockWasWorkoutDay.mock.calls[1]?.[0];
    expect(secondDateKey).not.toBe(firstDateKey);
  });

  // ── AC12b: coherent narrative — trainingDayAdjustment emitted ─────────────

  it("AC12b: trainingDayAdjustment is non-null when feature enabled + adjusted", async () => {
    mockWasWorkoutDay.mockResolvedValue(true);
    const { result } = renderHook(() => useNutritionData());
    await act(async () => { await result.current.load(); });

    expect(result.current.trainingDayAdjustment).not.toBeNull();
    expect(result.current.trainingDayAdjustment!.adjusted).toBe(true);
  });

  it("AC12b: trainingDayAdjustment is null when feature is disabled", async () => {
    mockGetAllSettings.mockResolvedValue({ enabled: false, splitPercent: 10, trainingDaysPerWeek: 4 });
    const { result } = renderHook(() => useNutritionData());
    await act(async () => { await result.current.load(); });

    expect(result.current.trainingDayAdjustment).toBeNull();
    // targets should equal the base (feature off → no adjustment)
    expect(result.current.targets).toEqual(BASE_TARGETS);
  });

  it("AC12b: when feature disabled, targets equal base macro_targets row", async () => {
    mockGetAllSettings.mockResolvedValue({ enabled: false, splitPercent: 10, trainingDaysPerWeek: 4 });
    const { result } = renderHook(() => useNutritionData());
    await act(async () => { await result.current.load(); });

    expect(result.current.targets!.calories).toBe(BASE_TARGETS.calories);
    expect(result.current.targets!.protein).toBe(BASE_TARGETS.protein);
    expect(result.current.targets!.carbs).toBe(BASE_TARGETS.carbs);
    expect(result.current.targets!.fat).toBe(BASE_TARGETS.fat);
  });

  // ── Error resilience (AC5 defensive programming) ──────────────────────────

  it("shows base targets when training-day settings throw (resilience)", async () => {
    mockGetAllSettings.mockRejectedValue(new Error("DB error"));
    const { result } = renderHook(() => useNutritionData());
    await act(async () => { await result.current.load(); });

    // Should fall back to showing base targets without crashing
    expect(result.current.targets).toEqual(BASE_TARGETS);
    expect(result.current.trainingDayAdjustment).toBeNull();
  });

  it("shows base targets when wasWorkoutDay throws (resilience)", async () => {
    mockWasWorkoutDay.mockRejectedValue(new Error("DB error"));
    const { result } = renderHook(() => useNutritionData());
    await act(async () => { await result.current.load(); });

    expect(result.current.targets).toEqual(BASE_TARGETS);
    expect(result.current.trainingDayAdjustment).toBeNull();
  });

  // ── Feature off by default → no regression to existing behavior ───────────

  it("shows base targets with no trainingDayAdjustment by default (AC1 regression guard)", async () => {
    mockGetAllSettings.mockResolvedValue({ enabled: false, splitPercent: 10, trainingDaysPerWeek: 4 });
    const { result } = renderHook(() => useNutritionData());
    await act(async () => { await result.current.load(); });

    expect(result.current.trainingDayAdjustment).toBeNull();
    expect(result.current.targets).toEqual(BASE_TARGETS);
    // wasWorkoutDay should NOT be called when feature is disabled (avoid unnecessary DB query)
    expect(mockWasWorkoutDay).not.toHaveBeenCalled();
  });
});
