import { useLayout } from "../lib/layout";

/**
 * Responsive chart width for muscle-volume cards.
 *
 * - Phone (single column): explicit pixel width so victory-native has stable
 *   bounds during the initial layout pass. Width math:
 *     layout.width
 *     − 32 (card marginHorizontal: 16 × 2)
 *     − 36 (Card padding: 18 × 2 from components/ui/card.tsx)
 *     = layout.width − 68
 *
 * - Tablet (atLeastMedium, two columns inside flowRow with gap: 12):
 *   `undefined` lets the chart auto-size via flex:1, which handles split-screen,
 *   portrait iPad, and very wide displays gracefully without overflow.
 */
export function useMuscleVolumeChartWidth(): number | undefined {
  const layout = useLayout();
  return layout.atLeastMedium ? undefined : layout.width - 68;
}
