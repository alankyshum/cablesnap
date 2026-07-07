import { renderHook, act } from "@testing-library/react-native";
import { useSummaryActions } from "../../hooks/useSummaryActions";
import { stravaLog } from "../../lib/strava-telemetry";

jest.mock("../../lib/strava-telemetry", () => ({
  stravaLog: jest.fn(),
  captureStravaError: jest.fn(),
  stravaBreakcrumb: jest.fn(),
}));

jest.mock("react-native-view-shot", () => ({
  captureRef: jest.fn().mockResolvedValue("file://test-captured.png"),
}));

jest.mock("expo-sharing", () => ({
  shareAsync: jest.fn().mockResolvedValue(true),
}));

jest.mock("expo-file-system", () => ({
  deleteAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/components/ui/bna-toast", () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}));

jest.mock("@/lib/db", () => ({
  createTemplateFromSession: jest.fn().mockResolvedValue(undefined),
  updateSession: jest.fn().mockResolvedValue(undefined),
}));

describe("useSummaryActions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fires achievement_recap_tapped with correct props", () => {
    const { result } = renderHook(() => useSummaryActions("sess-123"));

    act(() => {
      result.current.handleAchievementImage(4);
    });

    expect(stravaLog).toHaveBeenCalledWith("info", "achievement_recap_tapped", {
      sessionId: "sess-123",
      achievementCount: 4,
    });
  });

  it("fires achievement_recap_shared on successful capture and share", async () => {
    const { result } = renderHook(() => useSummaryActions("sess-123"));

    // Set mock ref
    Object.defineProperty(result.current.achievementCardRef, "current", {
      value: {},
      writable: true,
    });

    await act(async () => {
      await result.current.handleCaptureAchievementAndShare(4);
    });

    expect(stravaLog).toHaveBeenCalledWith("info", "achievement_recap_shared", {
      sessionId: "sess-123",
      achievementCount: 4,
    });
  });

  it("fires strava_share_image_tapped with correct props", () => {
    const { result } = renderHook(() => useSummaryActions("sess-123"));

    act(() => {
      result.current.handleStravaImage(true, 5);
    });

    expect(stravaLog).toHaveBeenCalledWith("info", "strava_share_image_tapped", {
      sessionId: "sess-123",
      hasPrs: true,
      exerciseCount: 5,
    });
  });

  it("fires strava_share_image_shared on successful capture and share", async () => {
    const { result } = renderHook(() => useSummaryActions("sess-123"));

    // Set mock ref
    Object.defineProperty(result.current.stravaCardRef, "current", {
      value: {},
      writable: true,
    });

    await act(async () => {
      await result.current.handleCaptureStravaAndShare();
    });

    expect(stravaLog).toHaveBeenCalledWith("info", "strava_share_image_shared", {
      sessionId: "sess-123",
    });
  });
});
