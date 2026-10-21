import { getAppSetting, setAppSetting } from "./db";

export const SHAKE_TO_REPORT_KEY = "shake_to_report";
export const SHAKE_THRESHOLD = 2.4;
export const SHAKE_COOLDOWN_MS = 3000;

type Sample = { x: number; y: number; z: number };
type Listener = (enabled: boolean) => void;
const listeners = new Set<Listener>();

export function canListenForShake(platform: string, enabled: boolean, foreground: boolean, available: boolean): boolean {
  return platform !== "web" && enabled && foreground && available;
}

export function canLaunchShakeFeedback(pathname: string, launching: boolean): boolean {
  return pathname !== "/feedback" && !launching;
}

export async function getShakeToReportEnabled(): Promise<boolean> {
  return (await getAppSetting(SHAKE_TO_REPORT_KEY)) !== "0";
}

export async function setShakeToReportEnabled(enabled: boolean): Promise<void> {
  await setAppSetting(SHAKE_TO_REPORT_KEY, enabled ? "1" : "0");
  listeners.forEach((listener) => listener(enabled));
}

export function subscribeShakeToReport(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export class ShakeDetector {
  private previous: Sample | null = null;
  private lastShake = -Infinity;

  add(sample: Sample, now: number): boolean {
    const previous = this.previous;
    this.previous = sample;
    if (!previous) return false;
    const delta = Math.hypot(
      sample.x - previous.x,
      sample.y - previous.y,
      sample.z - previous.z,
    );
    if (delta < SHAKE_THRESHOLD || now - this.lastShake < SHAKE_COOLDOWN_MS) return false;
    this.lastShake = now;
    return true;
  }
}
