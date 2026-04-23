// Theme-token-driven severity colors for FlowCard difficulty / readiness badges.
// Colors are sourced from Colors.{light,dark}.{successSubtle,warningSubtle,dangerSubtle}
// and their *Foreground variants — NO raw hex literals live in this file.
//
// For React components, prefer the `useDifficultyBadgeColors()` /
// `useReadinessBadgeColors()` hooks. For non-React callers (utilities, tests),
// use the mode-accepting selectors `getDifficultyBadgeColors(mode)` /
// `getReadinessBadgeColors(mode)`.

import type { Difficulty } from "../../lib/types";
import type { ReadinessBadge } from "../../lib/recovery-readiness";
import { Colors } from "@/theme/colors";
import { useColorScheme } from "@/hooks/useColorScheme";

type ColorMode = "light" | "dark";
type BadgePair = { bg: string; fg: string };

function resolveMode(mode: ColorMode | null | undefined): ColorMode {
  return mode === "dark" ? "dark" : "light";
}

export function getDifficultyBadgeColors(
  mode: ColorMode | null | undefined,
): Record<Difficulty, BadgePair> {
  const c = Colors[resolveMode(mode)];
  return {
    beginner: { bg: c.successSubtle, fg: c.successSubtleForeground },
    intermediate: { bg: c.warningSubtle, fg: c.warningSubtleForeground },
    advanced: { bg: c.dangerSubtle, fg: c.dangerSubtleForeground },
  };
}

export function getReadinessBadgeColors(
  mode: ColorMode | null | undefined,
): Record<Exclude<ReadinessBadge, "NO_DATA">, BadgePair> {
  const c = Colors[resolveMode(mode)];
  return {
    READY: { bg: c.successSubtle, fg: c.successSubtleForeground },
    PARTIAL: { bg: c.warningSubtle, fg: c.warningSubtleForeground },
    REST: { bg: c.dangerSubtle, fg: c.dangerSubtleForeground },
  };
}

export function useDifficultyBadgeColors(): Record<Difficulty, BadgePair> {
  const scheme = useColorScheme();
  return getDifficultyBadgeColors(scheme === "dark" ? "dark" : "light");
}

export function useReadinessBadgeColors(): Record<
  Exclude<ReadinessBadge, "NO_DATA">,
  BadgePair
> {
  const scheme = useColorScheme();
  return getReadinessBadgeColors(scheme === "dark" ? "dark" : "light");
}
