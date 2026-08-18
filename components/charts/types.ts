/** Supported interpolation modes for line series. */
export type CurveType = 'linear' | 'natural' | 'monotoneX';

export type ChartSeries = {
  key: string;
  values: number[];
  color: string;
  strokeWidth?: number;
  curve?: CurveType;
  showPoints?: boolean;
  pointRadius?: number;
};

export type AxisConfig = {
  tickCount?: number;
  labelColor: string;
  lineColor: string;
  labelOffset?: number;
  fontSize?: number;
  formatLabel?: (v: number | string) => string;
};

export type ChartPadding = {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
};

/**
 * Chart coordinates use index-based x positions: 0..n-1 mapped across the
 * inner width. Y values use a linear min/max across all series unless
 * yDomain is supplied. This contract intentionally does not use d3-scale.
 */
export type LineChartProps = {
  labels: string[];
  series: ChartSeries[];
  height: number;
  width?: number;
  yDomain?: [number, number];
  padding?: ChartPadding;
  xAxis?: AxisConfig;
  yAxis?: AxisConfig;
  testID?: string;
};

export type BarChartProps = {
  labels: string[];
  values: number[];
  color: string;
  height: number;
  width?: number;
  cornerRadius?: number;
  labelColor: string;
  padding?: ChartPadding;
  testID?: string;
};
