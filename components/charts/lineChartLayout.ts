import type { AxisConfig, ChartPadding } from './types';

const DEFAULT_PADDING: Required<ChartPadding> = { left: 0, right: 0, top: 0, bottom: 0 };

export function resolveChartPadding(
  paddingProp: ChartPadding | undefined,
  xAxis: AxisConfig | undefined,
  yAxis: AxisConfig | undefined,
  yLabelWidth: number,
  xFontSize: number,
): Required<ChartPadding> {
  return {
    ...DEFAULT_PADDING,
    ...paddingProp,
    left: (paddingProp?.left ?? DEFAULT_PADDING.left) + (yAxis ? yLabelWidth + (yAxis.labelOffset ?? 0) + 2 : 0),
    bottom: (paddingProp?.bottom ?? DEFAULT_PADDING.bottom) + (xAxis ? xFontSize + (xAxis.labelOffset ?? 0) + 2 : 0),
  };
}
