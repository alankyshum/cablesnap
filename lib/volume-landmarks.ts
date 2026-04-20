/**
 * Evidence-based per-muscle volume landmarks (MEV / MRV).
 * Sources: Dr. Mike Israetel / Renaissance Periodization hypertrophy guidelines, rounded.
 */
import type { MuscleGroup } from "./types";

export type VolumeLandmarks = { mev: number; mrv: number };

export const DEFAULT_LANDMARKS: Record<MuscleGroup, VolumeLandmarks> = {
  chest:      { mev: 10, mrv: 22 },
  back:       { mev: 10, mrv: 25 },
  shoulders:  { mev: 8,  mrv: 22 },
  biceps:     { mev: 8,  mrv: 22 },
  triceps:    { mev: 6,  mrv: 18 },
  quads:      { mev: 8,  mrv: 20 },
  hamstrings: { mev: 6,  mrv: 16 },
  glutes:     { mev: 4,  mrv: 16 },
  calves:     { mev: 8,  mrv: 16 },
  core:       { mev: 6,  mrv: 16 },
  forearms:   { mev: 4,  mrv: 14 },
  traps:      { mev: 6,  mrv: 18 },
  lats:       { mev: 10, mrv: 25 },
  full_body:  { mev: 10, mrv: 20 },
};

export const VOLUME_LANDMARKS_SETTING_KEY = "volume_landmarks_custom";

/**
 * Merge user overrides with defaults. Unknown keys silently ignored.
 */
export function mergeWithDefaults(
  custom: Partial<Record<string, VolumeLandmarks>> | null
): Record<MuscleGroup, VolumeLandmarks> {
  if (!custom) return { ...DEFAULT_LANDMARKS };
  const merged = { ...DEFAULT_LANDMARKS };
  for (const key of Object.keys(custom)) {
    if (key in merged) {
      merged[key as MuscleGroup] = custom[key]!;
    }
  }
  return merged;
}

/**
 * Safely parse stored custom landmarks. Returns null on malformed JSON.
 */
export function parseCustomLandmarks(
  raw: string | null
): Partial<Record<string, VolumeLandmarks>> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Determine volume status for a muscle based on its set count and landmarks.
 */
export type VolumeStatus = "below_mev" | "optimal" | "above_mrv";

export function getVolumeStatus(
  sets: number,
  landmarks: VolumeLandmarks
): VolumeStatus {
  if (sets < landmarks.mev) return "below_mev";
  if (sets > landmarks.mrv) return "above_mrv";
  return "optimal";
}

export function getVolumeStatusLabel(status: VolumeStatus): string {
  switch (status) {
    case "below_mev":
      return "below MEV";
    case "optimal":
      return "in optimal range";
    case "above_mrv":
      return "above MRV";
  }
}
