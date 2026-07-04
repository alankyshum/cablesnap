import React from "react";
import { renderScreen } from "../helpers/render";
import { waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock("expo-router", () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
  },
  useLocalSearchParams: () => mockParams,
}));

const mockToast = {
  success: jest.fn(),
  error: jest.fn(),
};
jest.mock("@/components/ui/bna-toast", () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  useToast: () => mockToast,
}));

const mockCompleteStravaCallback = jest.fn();
jest.mock("@/lib/strava", () => ({
  completeStravaCallback: (...args: unknown[]) => mockCompleteStravaCallback(...args),
  getStravaUserMessage: jest.fn((err) => `User message: ${err?.message || err}`),
  getStravaSupportAction: jest.fn(() => "mock-support-action"),
  APP_DEEP_LINK: "cablesnap://strava-callback",
}));

import StravaCallbackScreen from "../../app/strava-callback";

describe("StravaCallbackScreen Component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
  });

  it("handles successful callback, displays success toast, and redirects to settings", async () => {
    mockParams = { code: "some-auth-code", state: "some-state-uuid" };
    mockCompleteStravaCallback.mockResolvedValueOnce({
      athleteId: 123,
      athleteName: "Jane Doe",
    });

    renderScreen(<StravaCallbackScreen />);

    await waitFor(() => {
      expect(mockCompleteStravaCallback).toHaveBeenCalledWith(
        "cablesnap://strava-callback?code=some-auth-code&state=some-state-uuid"
      );
      expect(mockToast.success).toHaveBeenCalledWith("Connected to Strava!");
      expect(mockReplace).toHaveBeenCalledWith("/(tabs)/settings");
    });
  });

  it("handles failed callback, displays error toast with support action, and redirects to settings", async () => {
    mockParams = { code: "some-auth-code", state: "some-state-uuid" };
    const testError = new Error("state mismatch");
    mockCompleteStravaCallback.mockRejectedValueOnce(testError);

    renderScreen(<StravaCallbackScreen />);

    await waitFor(() => {
      expect(mockCompleteStravaCallback).toHaveBeenCalledWith(
        "cablesnap://strava-callback?code=some-auth-code&state=some-state-uuid"
      );
      expect(mockToast.error).toHaveBeenCalledWith("User message: state mismatch", {
        action: "mock-support-action",
      });
      expect(mockReplace).toHaveBeenCalledWith("/(tabs)/settings");
    });
  });

  it("handles null result callback (no success toast), and redirects to settings", async () => {
    mockParams = { code: "some-auth-code", state: "some-state-uuid" };
    mockCompleteStravaCallback.mockResolvedValueOnce(null);

    renderScreen(<StravaCallbackScreen />);

    await waitFor(() => {
      expect(mockCompleteStravaCallback).toHaveBeenCalledWith(
        "cablesnap://strava-callback?code=some-auth-code&state=some-state-uuid"
      );
      expect(mockToast.success).not.toHaveBeenCalled();
      expect(mockToast.error).not.toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith("/(tabs)/settings");
    });
  });
});
