export const SHAKE_THRESHOLD = 2.4;
export const SHAKE_COOLDOWN_MS = 2500;

export type AccelerometerSample = { x: number; y: number; z: number };

/** Detects a sharp change in acceleration while suppressing repeat launches. */
export class ShakeDetector {
  private previous: AccelerometerSample | null = null;
  private lastShakeAt = -Infinity;

  add(sample: AccelerometerSample, now: number): boolean {
    const previous = this.previous;
    this.previous = sample;
    if (!previous) return false;

    const delta = Math.hypot(
      sample.x - previous.x,
      sample.y - previous.y,
      sample.z - previous.z,
    );
    if (delta < SHAKE_THRESHOLD || now - this.lastShakeAt < SHAKE_COOLDOWN_MS) {
      return false;
    }
    this.lastShakeAt = now;
    return true;
  }
}

/** Keeps async capture/navigation from opening more than one feedback modal. */
export class ShakeLaunchGate {
  private active = false;

  begin(): boolean {
    if (this.active) return false;
    this.active = true;
    return true;
  }

  reset(): void {
    this.active = false;
  }
}
