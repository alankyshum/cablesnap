/**
 * BLD-715 — Health Connect toggle permission-denied UX.
 *
 * AC2: tapping toggle requests permission (system dialog or its mock here).
 * AC3: when permission is denied, an inline "permission required" CTA renders
 *      with an "Open Health Connect settings" button that calls the deep link.
 * AC4: error path still surfaces (no silent failure) — toast + inline.
 * AC5: grant + deny mocked paths covered.
 */
import React from "react";
import { Platform } from "react-native";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";

// --- Mocks (must precede component import) ---
jest.mock("@/lib/db", () => ({
  setAppSetting: jest.fn().mockResolvedValue(undefined),
}));

const mockRequestHCPermission = jest.fn();
const mockDisableHC = jest.fn().mockResolvedValue(undefined);
const mockOpenHCSettings = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/health-connect", () => ({
  __esModule: true,
  requestHealthConnectPermission: (...a: unknown[]) => mockRequestHCPermission(...a),
  disableHealthConnect: (...a: unknown[]) => mockDisableHC(...a),
  openHealthConnectSettings: (...a: unknown[]) => mockOpenHCSettings(...a),
}));

jest.mock("@/lib/strava", () => ({
  connectStrava: jest.fn(),
  disconnect: jest.fn(),
  getStravaSupportAction: jest.fn(),
  getStravaUserMessage: jest.fn(),
}));

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
const toastStub = {
  success: mockToastSuccess,
  error: mockToastError,
  info: jest.fn(),
  warn: jest.fn(),
  show: jest.fn(),
  dismiss: jest.fn(),
} as unknown as ReturnType<typeof import("@/components/ui/bna-toast").useToast>;

import IntegrationsCard from "@/components/settings/IntegrationsCard";
import type { ThemeColors } from "@/hooks/useThemeColors";

const mockColors: Partial<ThemeColors> = {
  surface: "#FFFFFF",
  surfaceVariant: "#F3F4F6",
  onSurface: "#111827",
  onSurfaceVariant: "#6B7280",
  errorContainer: "#FEE2E2",
  onErrorContainer: "#7F1D1D",
  error: "#DC2626",
  primary: "#3B82F6",
};

beforeAll(() => {
  Object.defineProperty(Platform, "OS", { configurable: true, get: () => "android" });
});
beforeEach(() => {
  jest.clearAllMocks();
});

function renderCard(overrides: Partial<React.ComponentProps<typeof IntegrationsCard>> = {}) {
  const setHcEnabled = jest.fn();
  const setHcLoading = jest.fn();
  const setHcPermissionDenied = jest.fn();
  const setStravaAthlete = jest.fn();
  const setStravaLoading = jest.fn();
  const utils = render(
    <IntegrationsCard
      colors={mockColors as ThemeColors}
      toast={toastStub}
      stravaAthlete={null}
      setStravaAthlete={setStravaAthlete}
      stravaLoading={false}
      setStravaLoading={setStravaLoading}
      hcEnabled={false}
      setHcEnabled={setHcEnabled}
      hcLoading={false}
      setHcLoading={setHcLoading}
      hcPermissionDenied={false}
      setHcPermissionDenied={setHcPermissionDenied}
      hcSdkStatus="available"
      {...overrides}
    />,
  );
  return { ...utils, setHcEnabled, setHcLoading, setHcPermissionDenied };
}

describe("IntegrationsCard — Health Connect toggle (BLD-715)", () => {
  it("AC2: tapping toggle ON when permission is granted enables HC and clears denied state", async () => {
    mockRequestHCPermission.mockResolvedValueOnce(true);
    const { getByLabelText, setHcEnabled, setHcPermissionDenied } = renderCard();

    const sw = getByLabelText("Sync workouts to Health Connect");
    await act(async () => {
      fireEvent(sw, "valueChange", true);
    });

    await waitFor(() => expect(mockRequestHCPermission).toHaveBeenCalled());
    expect(setHcEnabled).toHaveBeenCalledWith(true);
    expect(setHcPermissionDenied).toHaveBeenCalledWith(false);
    expect(mockToastSuccess).toHaveBeenCalledWith("Health Connect enabled");
  });

  it("AC3: tapping toggle ON when permission is DENIED sets denied state and surfaces toast", async () => {
    mockRequestHCPermission.mockResolvedValueOnce(false);
    const { getByLabelText, setHcEnabled, setHcPermissionDenied } = renderCard();

    const sw = getByLabelText("Sync workouts to Health Connect");
    await act(async () => {
      fireEvent(sw, "valueChange", true);
    });

    await waitFor(() => expect(setHcPermissionDenied).toHaveBeenCalledWith(true));
    expect(setHcEnabled).toHaveBeenCalledWith(false);
    expect(mockToastError).toHaveBeenCalledWith("Health Connect permission denied");
  });

  it("AC3: when hcPermissionDenied is true, inline CTA renders with Open-settings button", () => {
    const { getByTestId, getByLabelText } = renderCard({
      hcPermissionDenied: true,
      hcEnabled: false,
    });

    expect(getByTestId("hc-permission-denied")).toBeTruthy();
    expect(getByLabelText("Open Health Connect settings")).toBeTruthy();
  });

  it("AC3: tapping Open Health Connect settings invokes openHealthConnectSettings deep link", async () => {
    const { getByLabelText } = renderCard({
      hcPermissionDenied: true,
      hcEnabled: false,
    });

    const btn = getByLabelText("Open Health Connect settings");
    await act(async () => {
      fireEvent.press(btn);
    });

    await waitFor(() => expect(mockOpenHCSettings).toHaveBeenCalled());
  });

  it("AC4: when requestPermission throws, denied state is set and error toast surfaces", async () => {
    mockRequestHCPermission.mockRejectedValueOnce(new Error("boom"));
    const { getByLabelText, setHcPermissionDenied } = renderCard();

    const sw = getByLabelText("Sync workouts to Health Connect");
    await act(async () => {
      fireEvent(sw, "valueChange", true);
    });

    await waitFor(() => expect(setHcPermissionDenied).toHaveBeenCalledWith(true));
    expect(mockToastError).toHaveBeenCalledWith("Failed to enable Health Connect");
  });

  it("toggling OFF clears denied state and disables HC", async () => {
    const { getByLabelText, setHcEnabled, setHcPermissionDenied } = renderCard({
      hcEnabled: true,
    });

    const sw = getByLabelText("Sync workouts to Health Connect");
    await act(async () => {
      fireEvent(sw, "valueChange", false);
    });

    await waitFor(() => expect(mockDisableHC).toHaveBeenCalled());
    expect(setHcEnabled).toHaveBeenCalledWith(false);
    expect(setHcPermissionDenied).toHaveBeenCalledWith(false);
  });

  it("persistence failure on granted branch does NOT mark permission denied (techlead nit follow-up)", async () => {
    mockRequestHCPermission.mockResolvedValueOnce(true);
    const dbMod = jest.requireMock("@/lib/db") as { setAppSetting: jest.Mock };
    dbMod.setAppSetting.mockRejectedValueOnce(new Error("db write failed"));
    const { getByLabelText, setHcEnabled, setHcPermissionDenied } = renderCard();

    const sw = getByLabelText("Sync workouts to Health Connect");
    await act(async () => {
      fireEvent(sw, "valueChange", true);
    });

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Failed to enable Health Connect"));
    expect(setHcEnabled).toHaveBeenCalledWith(false);
    // Critical: permission was actually granted; do not surface the misleading CTA
    const deniedCalls = setHcPermissionDenied.mock.calls.filter(([v]) => v === true);
    expect(deniedCalls).toEqual([]);
    // restore default behavior for subsequent tests
    dbMod.setAppSetting.mockResolvedValue(undefined);
  });

  it("inline CTA does NOT render when permission is granted", () => {
    const { queryByTestId } = renderCard({ hcEnabled: true, hcPermissionDenied: false });
    expect(queryByTestId("hc-permission-denied")).toBeNull();
  });
});
