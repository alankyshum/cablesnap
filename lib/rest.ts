// Pure, synchronous rest-timer resolver for the Intelligent Rest Timer (BLD-531).
// Inputs come from lib/db (set state + template base + exercise equipment).
// Output is a deterministic RestBreakdown consumed by useRestTimer + RestBreakdownSheet.
// This module performs NO I/O — keep it pure so tests are trivial and the formula
// is auditable from a single file.

import type { SetType } from "./types";

export type ExerciseCategory = "bodyweight" | "cable" | "standard";

export type RestInputs = {
  baseRestSeconds: number;
  setType: SetType;
  rpe: number | null;
  category: ExerciseCategory;
};

export type RestFactor = {
  label: string;
  multiplier: number;
  deltaSeconds: number;
};

export type RestBreakdown = {
  totalSeconds: number;
  baseSeconds: number;
  factors: RestFactor[];
  isDefault: boolean;
  reasonShort: string;
  reasonAccessible: string;
};

const MIN_REST_SECONDS = 10;
const MAX_REST_SECONDS = 360;
const FALLBACK_BASE_SECONDS = 60;
const ROUND_STEP = 5;

// v1 constants — frozen by rest-constants.test.ts.
export const REST_MULTIPLIERS = {
  setType: {
    normal: 1.0,
    warmup: 0.3,
    dropset: 0.1,
    failure: 1.3,
  } satisfies Record<SetType, number>,
  // RPE buckets: keyed by ceiling comparisons (see resolveRpeFactor).
  rpe: {
    low: 0.8, // rpe <= 6
    midOrNull: 1.0, // rpe null or 7–8
    high: 1.15, // 8.5 <= rpe <= 9 (strict < 9.5)
    veryHigh: 1.3, // rpe >= 9.5
  },
  category: {
    standard: 1.0,
    cable: 0.8,
    bodyweight: 0.85,
  } satisfies Record<ExerciseCategory, number>,
} as const;

export function categorize(equipment: string): ExerciseCategory {
  if (equipment === "bodyweight") return "bodyweight";
  if (equipment === "cable") return "cable";
  return "standard";
}

function roundToStep(value: number): number {
  return Math.round(value / ROUND_STEP) * ROUND_STEP;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

type RpeBucket = "low" | "midOrNull" | "high" | "veryHigh";

function rpeBucket(rpe: number | null): RpeBucket {
  if (rpe == null) return "midOrNull";
  if (rpe <= 6) return "low";
  if (rpe >= 9.5) return "veryHigh";
  if (rpe >= 8.5) return "high";
  return "midOrNull";
}

function rpeLabelShort(bucket: RpeBucket, rpe: number | null): string {
  if (bucket === "veryHigh") return "Heavy · RPE 9";
  if (bucket === "high") return "RPE 9";
  if (bucket === "low") return `RPE ${Math.min(6, Math.round(rpe ?? 6))}`;
  return "";
}

function rpeLabelAccessible(bucket: RpeBucket, rpe: number | null): string {
  if (bucket === "veryHigh") return "Heavy set, RPE 9";
  if (bucket === "high") return "RPE 9";
  if (bucket === "low") return `RPE ${Math.min(6, Math.round(rpe ?? 6))}`;
  return "";
}

export function resolveRestSeconds(inputs: RestInputs): RestBreakdown {
  const baseSeconds =
    inputs.baseRestSeconds > 0 ? inputs.baseRestSeconds : FALLBACK_BASE_SECONDS;

  const setTypeMult = REST_MULTIPLIERS.setType[inputs.setType];
  const bucket = rpeBucket(inputs.rpe);
  const rpeMult = REST_MULTIPLIERS.rpe[bucket];
  const catMult = REST_MULTIPLIERS.category[inputs.category];

  const rawProduct = baseSeconds * setTypeMult * rpeMult * catMult;
  const totalSeconds = clamp(
    roundToStep(rawProduct),
    MIN_REST_SECONDS,
    MAX_REST_SECONDS,
  );

  // Factors are additive for the breakdown sheet: each delta is relative to
  // applying this factor after the previous ones (left-fold), so Σdelta === total − base.
  const factors: RestFactor[] = [];
  let running = baseSeconds;

  const pushFactor = (label: string, multiplier: number) => {
    const nextRunning = running * multiplier;
    const deltaSeconds = Math.round(nextRunning - running);
    factors.push({ label, multiplier, deltaSeconds });
    running = nextRunning;
  };

  if (setTypeMult !== 1.0) {
    pushFactor(
      inputs.setType === "warmup"
        ? "Warmup"
        : inputs.setType === "dropset"
          ? "Drop-set"
          : "Failure",
      setTypeMult,
    );
  }
  if (rpeMult !== 1.0) {
    pushFactor(rpeLabelShort(bucket, inputs.rpe), rpeMult);
  }
  if (catMult !== 1.0) {
    pushFactor(
      inputs.category === "cable"
        ? "Cable"
        : inputs.category === "bodyweight"
          ? "Bodyweight"
          : "Standard",
      catMult,
    );
  }

  const isDefault = factors.every((f) => f.multiplier === 1.0) && factors.length === 0;

  // reasonShort priority: setType ≠ normal → RPE ≠ mid → category ≠ standard
  let reasonShort = "";
  let reasonAccessible = "";
  if (!isDefault) {
    if (inputs.setType === "dropset") {
      reasonShort = "Drop-set";
      reasonAccessible = "Drop-set";
    } else if (inputs.setType === "warmup") {
      reasonShort = "Warmup";
      reasonAccessible = "Warmup set";
    } else if (inputs.setType === "failure") {
      reasonShort = "Failure";
      reasonAccessible = "Failure set";
    } else if (bucket === "veryHigh") {
      reasonShort = rpeLabelShort(bucket, inputs.rpe);
      reasonAccessible = rpeLabelAccessible(bucket, inputs.rpe);
    } else if (bucket === "high") {
      reasonShort = rpeLabelShort(bucket, inputs.rpe);
      reasonAccessible = rpeLabelAccessible(bucket, inputs.rpe);
    } else if (bucket === "low") {
      reasonShort = rpeLabelShort(bucket, inputs.rpe);
      reasonAccessible = rpeLabelAccessible(bucket, inputs.rpe);
    } else if (inputs.category === "cable") {
      reasonShort = "Cable";
      reasonAccessible = "Cable exercise";
    } else if (inputs.category === "bodyweight") {
      reasonShort = "Bodyweight";
      reasonAccessible = "Bodyweight exercise";
    }
  }

  return {
    totalSeconds,
    baseSeconds,
    factors,
    isDefault,
    reasonShort,
    reasonAccessible,
  };
}

/** Synthetic breakdown for the legacy / manual-override path. Keeps UI code branch-free. */
export function defaultBreakdown(totalSeconds: number): RestBreakdown {
  const clamped = clamp(
    Math.max(0, Math.round(totalSeconds)),
    0,
    MAX_REST_SECONDS,
  );
  return {
    totalSeconds: clamped,
    baseSeconds: clamped,
    factors: [],
    isDefault: true,
    reasonShort: "",
    reasonAccessible: "",
  };
}
