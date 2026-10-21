import { getAppSetting, setAppSetting } from "@/lib/db/settings";

export const SHAKE_TO_REPORT_KEY = "shake_to_report";
export const SHAKE_THRESHOLD = 2.4;
export const SHAKE_COOLDOWN_MS = 2500;

export type AccelerometerSample = { x: number; y: number; z: number };
type SettingListener = (enabled: boolean) => void;
const settingListeners = new Set<SettingListener>();

export function canListenForShake(platform: string, enabled: boolean, foreground: boolean, available: boolean): boolean {
  return platform !== "web" && enabled && foreground && available;
}

export async function getShakeToReportEnabled(): Promise<boolean> {
  return (await getAppSetting(SHAKE_TO_REPORT_KEY)) !== "0";
}

export async function setShakeToReportEnabled(enabled: boolean): Promise<void> {
  await setAppSetting(SHAKE_TO_REPORT_KEY, enabled ? "1" : "0");
  settingListeners.forEach((listener) => listener(enabled));
}

export function subscribeShakeToReport(listener: SettingListener): () => void {
  settingListeners.add(listener);
  return () => settingListeners.delete(listener);
}

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
  private activeToken: number | null = null;
  private generation = 0;

  begin(): number | null {
    if (this.activeToken !== null) return null;
    this.generation += 1;
    this.activeToken = this.generation;
    return this.activeToken;
  }

  owns(token: number): boolean {
    return this.activeToken === token;
  }

  cancel(token: number): void {
    if (this.activeToken === token) this.activeToken = null;
  }

  resetAfterFeedbackExit(): void {
    this.activeToken = null;
  }
}
