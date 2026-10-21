// GitHub #963: shake threshold, cooldown, lifecycle gates, and route guard.
jest.mock("../../lib/db", () => ({
  getAppSetting: jest.fn(),
  setAppSetting: jest.fn(),
}));

import {
  canLaunchShakeFeedback,
  canListenForShake,
  ShakeDetector,
  SHAKE_COOLDOWN_MS,
  getShakeToReportEnabled,
  setShakeToReportEnabled,
} from "../../lib/shake-to-report";
import { getAppSetting, setAppSetting } from "../../lib/db";

const mockGetAppSetting = getAppSetting as jest.MockedFunction<typeof getAppSetting>;
const mockSetAppSetting = setAppSetting as jest.MockedFunction<typeof setAppSetting>;

describe("GitHub #963 shake detection", () => {
  it("requires the acceleration threshold and applies cooldown/debounce", () => {
    const detector = new ShakeDetector();
    expect(detector.add({ x: 0, y: 0, z: 1 }, 0)).toBe(false);
    expect(detector.add({ x: 0.2, y: 0.1, z: 1.1 }, 100)).toBe(false);
    expect(detector.add({ x: 3, y: 0, z: 0 }, 200)).toBe(true);
    expect(detector.add({ x: 0, y: 3, z: 0 }, 300)).toBe(false);
    expect(detector.add({ x: 3, y: 0, z: 0 }, 200 + SHAKE_COOLDOWN_MS)).toBe(true);
  });

  it("listens only when native, enabled, foreground, and available", () => {
    expect(canListenForShake("android", true, true, true)).toBe(true);
    expect(canListenForShake("ios", true, true, true)).toBe(true);
    expect(canListenForShake("web", true, true, true)).toBe(false);
    expect(canListenForShake("android", false, true, true)).toBe(false);
    expect(canListenForShake("android", true, false, true)).toBe(false);
    expect(canListenForShake("android", true, true, false)).toBe(false);
  });

  it("does not reopen while feedback is visible or a launch is in progress", () => {
    expect(canLaunchShakeFeedback("/feedback", false)).toBe(false);
    expect(canLaunchShakeFeedback("/session/1", true)).toBe(false);
    expect(canLaunchShakeFeedback("/session/1", false)).toBe(true);
  });

  it("defaults enabled and persists the disabled setting", async () => {
    mockGetAppSetting.mockResolvedValue(null);
    expect(await getShakeToReportEnabled()).toBe(true);
    await setShakeToReportEnabled(false);
    expect(mockSetAppSetting).toHaveBeenCalledWith("shake_to_report", "0");
  });
});
