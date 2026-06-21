/**
 * BLD-1636 — useSummaryData defense-in-depth error surfacing.
 *
 * The post-workout summary's data load runs inside an async IIFE in useEffect.
 * Before this fix, a throw there (e.g. a cold-worker drizzle "Sync operation
 * timeout" from getSessionById) became an UNHANDLED promise rejection — on
 * web's Expo dev build it replaced the whole app with the error overlay
 * (BLD-1635), bypassing the route's render-phase ErrorBoundary.
 *
 * useSummaryData now catches load failures and exposes them via `error`; the
 * summary screen re-throws `error` during render so the ErrorBoundary catches
 * it (see app/session/summary/[id].tsx). These tests assert the catch wiring:
 * a load error is captured (not swallowed, not escaped), and a clean load
 * leaves `error` null.
 */
import { renderHook, waitFor } from "@testing-library/react-native";
import { useSummaryData } from "../../hooks/useSummaryData";

jest.mock("../../lib/db", () => ({
  getBodySettings: jest.fn(),
  getSessionById: jest.fn(),
  getSessionComparison: jest.fn(),
  getSessionPRs: jest.fn(),
  getSessionRepPRs: jest.fn(),
  getSessionDurationPRs: jest.fn(),
  getSessionSetCount: jest.fn(),
  getSessionSets: jest.fn(),
  getSessionWeightIncreases: jest.fn(),
  getExercisesByIds: jest.fn(),
  buildAchievementContext: jest.fn(),
  getEarnedAchievementIds: jest.fn(),
  saveEarnedAchievements: jest.fn(),
}));

jest.mock("../../lib/achievements", () => ({
  evaluateAchievements: jest.fn(() => []),
}));

jest.mock("../../lib/aggregate-muscles", () => ({
  aggregateMuscles: jest.fn(() => ({ primary: [], secondary: [] })),
}));

const db = require("../../lib/db");

function mockHappyPath(): void {
  db.getSessionById.mockResolvedValue({ id: "s1", weight_unit: "kg", duration_seconds: 60 });
  db.getBodySettings.mockResolvedValue({ weight_unit: "kg" });
  db.getSessionSets.mockResolvedValue([]);
  db.getSessionPRs.mockResolvedValue([]);
  db.getSessionRepPRs.mockResolvedValue([]);
  db.getSessionDurationPRs.mockResolvedValue([]);
  db.getSessionWeightIncreases.mockResolvedValue([]);
  db.getSessionComparison.mockResolvedValue(null);
  db.getSessionSetCount.mockResolvedValue(0);
  db.getExercisesByIds.mockResolvedValue({});
  db.buildAchievementContext.mockResolvedValue({});
  db.getEarnedAchievementIds.mockResolvedValue([]);
  db.saveEarnedAchievements.mockResolvedValue(undefined);
}

describe("useSummaryData — defense-in-depth error state (BLD-1636)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("captures a cold-worker 'Sync operation timeout' thrown by the first query into `error` (no unhandled rejection)", async () => {
    const timeout = new Error("Sync operation timeout");
    timeout.name = "SyncOperationTimeoutError";
    // First query in the load is getSessionById (drizzle .get() sync path).
    db.getSessionById.mockRejectedValue(timeout);
    db.getBodySettings.mockResolvedValue({ weight_unit: "kg" });

    const { result } = renderHook(() => useSummaryData("s1"));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe(timeout);
    expect(result.current.error?.message).toBe("Sync operation timeout");
    // Session never loaded — the screen will hit the ErrorBoundary, not render stale UI.
    expect(result.current.session).toBeNull();
  });

  it("captures an error thrown by a later (second-wave) query into `error`", async () => {
    mockHappyPath();
    // First wave (getSessionById + getBodySettings) succeeds; second wave fails.
    db.getSessionSets.mockRejectedValue(new Error("Sync operation timeout"));

    const { result } = renderHook(() => useSummaryData("s1"));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toBe("Sync operation timeout");
  });

  it("leaves `error` null on a clean load", async () => {
    mockHappyPath();

    const { result } = renderHook(() => useSummaryData("s1"));

    await waitFor(() => expect(result.current.session).not.toBeNull());
    expect(result.current.error).toBeNull();
  });

  it("does NOT set `error` for a missing session (sess === null is a normal not-found, not a crash)", async () => {
    mockHappyPath();
    db.getSessionById.mockResolvedValue(null);

    const { result } = renderHook(() => useSummaryData("missing"));

    // Give the effect a tick to run; error must remain null and session null.
    await waitFor(() => expect(db.getSessionById).toHaveBeenCalled());
    expect(result.current.error).toBeNull();
    expect(result.current.session).toBeNull();
  });

  it("does NOT set `error` when only achievement evaluation fails (already isolated by its own try/catch)", async () => {
    mockHappyPath();
    db.buildAchievementContext.mockRejectedValue(new Error("achievement boom"));

    const { result } = renderHook(() => useSummaryData("s1"));

    await waitFor(() => expect(result.current.session).not.toBeNull());
    // Achievement failure is non-fatal — summary still renders, no boundary throw.
    expect(result.current.error).toBeNull();
  });
});
