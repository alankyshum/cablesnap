// GitHub #963: shake threshold, cooldown, lifecycle, and persisted setting.
jest.mock("../../lib/db/settings", () => ({
  getAppSetting: jest.fn(),
  setAppSetting: jest.fn(),
}));

import {
  canListenForShake,
  getShakeToReportEnabled,
  SHAKE_COOLDOWN_MS,
  SHAKE_THRESHOLD,
  ShakeDetector,
  ShakeLaunchGate,
  setShakeToReportEnabled,
} from "../../lib/shake-to-report";
import { getAppSetting, setAppSetting } from "../../lib/db/settings";

const mockGetAppSetting = getAppSetting as jest.MockedFunction<typeof getAppSetting>;
const mockSetAppSetting = setAppSetting as jest.MockedFunction<typeof setAppSetting>;

describe("ShakeDetector", () => {
  it("requires a delta at or above the threshold", () => {
    const detector = new ShakeDetector();
    expect(detector.add({ x: 0, y: 0, z: 1 }, 0)).toBe(false);
    expect(detector.add({ x: SHAKE_THRESHOLD - 0.01, y: 0, z: 1 }, 100)).toBe(false);
    expect(detector.add({ x: -0.02, y: 0, z: 1 }, 200)).toBe(true);
  });

  it("debounces repeated shakes until the cooldown expires", () => {
    const detector = new ShakeDetector();
    detector.add({ x: 0, y: 0, z: 1 }, 0);
    expect(detector.add({ x: 3, y: 0, z: 1 }, 100)).toBe(true);
    expect(detector.add({ x: 0, y: 0, z: 1 }, 200)).toBe(false);
    expect(detector.add({ x: 3, y: 0, z: 1 }, 100 + SHAKE_COOLDOWN_MS)).toBe(true);
  });
});

describe("ShakeLaunchGate overlay lifecycle", () => {
  it("blocks reentry until the overlay has closed", () => {
    const gate = new ShakeLaunchGate();
    const first = gate.begin();
    expect(first).toBe(1);
    expect(gate.begin()).toBeNull();
    gate.resetAfterFeedbackExit();
    expect(gate.begin()).toBe(2);
  });

  it("ignores cancellation from a stale generation", () => {
    const gate = new ShakeLaunchGate();
    const first = gate.begin()!;
    gate.cancel(first);
    const second = gate.begin()!;
    gate.cancel(first);
    expect(gate.owns(second)).toBe(true);
  });
});

describe("shake listener preference", () => {
  it("defaults on, persists opt-out, and gates web/background/unavailable sensors", async () => {
    mockGetAppSetting.mockResolvedValue(null);
    expect(await getShakeToReportEnabled()).toBe(true);
    await setShakeToReportEnabled(false);
    expect(mockSetAppSetting).toHaveBeenCalledWith("shake_to_report", "0");
    expect(canListenForShake("android", true, true, true)).toBe(true);
    expect(canListenForShake("ios", true, true, true)).toBe(true);
    expect(canListenForShake("web", true, true, true)).toBe(false);
    expect(canListenForShake("android", false, true, true)).toBe(false);
    expect(canListenForShake("android", true, false, true)).toBe(false);
    expect(canListenForShake("android", true, true, false)).toBe(false);
  });
});
