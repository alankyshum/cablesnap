import React from "react";
import { act, render } from "@testing-library/react-native";

const mockPush = jest.fn();
let mockPathname = "/settings";
let mockSensorListener: ((sample: { x: number; y: number; z: number }) => void) | undefined;
const mockRemoveSensor = jest.fn();
const mockRemoveAppState = jest.fn();
const mockCapture = jest.fn();
const mockSetPending = jest.fn();

jest.mock("expo-router", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush }),
}));
jest.mock("expo-sensors", () => ({
  Accelerometer: {
    isAvailableAsync: jest.fn().mockResolvedValue(true),
    setUpdateInterval: jest.fn(),
    addListener: jest.fn((listener) => {
      mockSensorListener = listener;
      return { remove: mockRemoveSensor };
    }),
  },
}));
jest.mock("../../lib/feedback-screenshot", () => ({
  captureFeedbackScreenshot: () => mockCapture(),
  setPendingFeedbackScreenshot: (value: unknown) => mockSetPending(value),
}));
jest.mock("react-native/Libraries/AppState/AppState", () => ({
  __esModule: true,
  default: {
    currentState: "active",
    addEventListener: jest.fn(() => ({ remove: mockRemoveAppState })),
  },
}));

import { ShakeToReportBridge } from "../../components/ShakeToReportBridge";

describe("ShakeToReportBridge", () => {
  beforeEach(() => {
    mockPathname = "/settings";
    mockSensorListener = undefined;
    mockPush.mockReset();
    mockRemoveSensor.mockReset();
    mockRemoveAppState.mockReset();
    mockCapture.mockReset();
    mockSetPending.mockReset();
    Object.defineProperty(require("react-native").Platform, "OS", { value: "android", configurable: true });
  });

  it("captures before navigation, blocks reentry, and cleans subscriptions", async () => {
    let resolveCapture: (uri: string) => void = () => undefined;
    mockCapture.mockReturnValue(new Promise<string>((resolve) => { resolveCapture = resolve; }));
    const view = render(<ShakeToReportBridge />);
    await act(async () => {});

    act(() => {
      mockSensorListener?.({ x: 0, y: 0, z: 1 });
      mockSensorListener?.({ x: 3, y: 0, z: 1 });
      mockSensorListener?.({ x: 0, y: 0, z: 1 });
    });
    expect(mockCapture).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();

    await act(async () => { resolveCapture("file:///cache/screen.png"); });
    expect(mockSetPending).toHaveBeenCalledWith({ status: "ready", uri: "file:///cache/screen.png" });
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/feedback", params: { source: "shake", type: "bug" } });

    view.unmount();
    expect(mockRemoveSensor).toHaveBeenCalled();
    expect(mockRemoveAppState).toHaveBeenCalled();
  });

  it("opens feedback after a nonblocking capture failure", async () => {
    mockCapture.mockRejectedValue(new Error("capture failed"));
    render(<ShakeToReportBridge />);
    await act(async () => {});
    await act(async () => {
      mockSensorListener?.({ x: 0, y: 0, z: 1 });
      mockSensorListener?.({ x: 3, y: 0, z: 1 });
    });
    expect(mockSetPending).toHaveBeenCalledWith({ status: "failed", uri: null });
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});
