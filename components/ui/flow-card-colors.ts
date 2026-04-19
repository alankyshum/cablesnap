import type { Difficulty } from "../../lib/types";
import type { ReadinessBadge } from "../../lib/recovery-readiness";

export const DIFFICULTY_COLORS: Record<Difficulty, { bg: string; fg: string }> = {
  beginner: { bg: "#D1FAE5", fg: "#065F46" },
  intermediate: { bg: "#FEF3C7", fg: "#92400E" },
  advanced: { bg: "#FEE2E2", fg: "#991B1B" },
};

export const READINESS_COLORS: Record<Exclude<ReadinessBadge, "NO_DATA">, { lightBg: string; lightFg: string; darkBg: string; darkFg: string }> = {
  READY: { lightBg: "#D1FAE5", lightFg: "#065F46", darkBg: "#064E3B", darkFg: "#A7F3D0" },
  PARTIAL: { lightBg: "#FEF3C7", lightFg: "#92400E", darkBg: "#5C3D00", darkFg: "#FDE68A" },
  REST: { lightBg: "#FEE2E2", lightFg: "#991B1B", darkBg: "#7F1D1D", darkFg: "#FECACA" },
};
