import {
  SHAKE_COOLDOWN_MS,
  SHAKE_THRESHOLD,
  ShakeDetector,
  ShakeLaunchGate,
} from "../../lib/shake-to-report";

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
    expect(gate.begin()).toBe(true);
    expect(gate.begin()).toBe(false);
    gate.reset();
    expect(gate.begin()).toBe(true);
  });
});
