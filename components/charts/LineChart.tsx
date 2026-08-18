import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import Svg, { Line as SvgLine, Text as SvgText } from 'react-native-svg';
import { textWidth, ticks } from './ticks';
import { LineChartRenderer } from './LineChartRenderer';
import { resolveChartPadding } from './lineChartLayout';
import type { AxisConfig, ChartPadding, LineChartProps } from './types';

export { ticks } from './ticks';

function yTickValues(axis: AxisConfig, domain: [number, number]) {
  const wanted = Math.max(1, Math.floor(axis.tickCount ?? 2));
  const [min, max] = domain;
  if (Number.isInteger(min) && Number.isInteger(max) && max - min < wanted) {
    return Array.from({ length: max - min + 1 }, (_, index) => min + index);
  }

  return ticks(wanted, wanted).map((index) => min + ((max - min) * index) / Math.max(1, wanted - 1));
}

function formatAxisLabel(axis: AxisConfig, value: number | string) {
  return axis.formatLabel ? axis.formatLabel(value) : String(value);
}

function resolveDomain(series: LineChartProps['series'], yDomain?: [number, number]) {
  if (yDomain) {
    const [a, b] = yDomain;
    if (a === b) return [a - 0.5, b + 0.5] as [number, number];
    return a < b ? yDomain : [b, a] as [number, number];
  }
  const values = series.flatMap((item) => item.values).filter(Number.isFinite);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  return (min === max ? [min - 0.5, max + 0.5] : [min, max]) as [number, number];
}

function Axis({
  axis,
  axisType,
  labels,
  domain,
  width,
  height,
  padding,
}: {
  axis: AxisConfig;
  axisType: 'x' | 'y';
  labels: string[];
  domain: [number, number];
  width: number;
  height: number;
  padding: Required<ChartPadding>;
}) {
  const innerWidth = Math.max(0, width - padding.left - padding.right);
  const innerHeight = Math.max(0, height - padding.top - padding.bottom);
  const x = (index: number) => padding.left + (labels.length > 1 ? (index / (labels.length - 1)) * innerWidth : innerWidth / 2);
  const y = (value: number) => {
    const [min, max] = domain;
    const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return padding.top + innerHeight * (1 - ratio);
  };
  const indices = axisType === 'x' ? ticks(axis.tickCount, labels.length) : [];
  const yValues = axisType === 'y' ? yTickValues(axis, domain) : [];
  const fontSize = axis.fontSize ?? 10;
  const labelOffset = axis.labelOffset ?? 0;
  const baseline = padding.top + innerHeight;

  return (
    <>
      <SvgLine
        x1={axisType === 'x' ? padding.left : padding.left}
        y1={axisType === 'x' ? baseline : padding.top}
        x2={axisType === 'x' ? padding.left + innerWidth : padding.left}
        y2={axisType === 'x' ? baseline : baseline}
        stroke={axis.lineColor}
      />
      {axisType === 'x'
        ? indices.map((index) => (
            <SvgText
              key={`x-label-${index}`}
              x={Math.max(
                textWidth(formatAxisLabel(axis, labels[index]), fontSize) / 2,
                Math.min(width - textWidth(formatAxisLabel(axis, labels[index]), fontSize) / 2, x(index))
              )}
              y={baseline + labelOffset + fontSize}
              fill={axis.labelColor}
              fontSize={fontSize}
              textAnchor="middle"
            >
              {formatAxisLabel(axis, labels[index])}
            </SvgText>
          ))
        : yValues.map((value, index) => (
            <SvgText
              key={`y-label-${index}`}
              x={padding.left - labelOffset}
              y={Math.max(fontSize, Math.min(height - 2, y(value) + fontSize / 2))}
              fill={axis.labelColor}
              fontSize={fontSize}
              textAnchor="end"
            >
              {formatAxisLabel(axis, value)}
            </SvgText>
          ))}
    </>
  );
}

export function LineChart({
  labels,
  series,
  height,
  width,
  yDomain,
  padding: paddingProp,
  xAxis,
  yAxis,
  testID,
}: LineChartProps) {
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const chartWidth = width ?? measuredWidth;
  const domain = useMemo<[number, number]>(() => resolveDomain(series, yDomain), [series, yDomain]);
  const xFontSize = xAxis?.fontSize ?? 10;
  const yFontSize = yAxis?.fontSize ?? 10;
  const yLabelWidth = yAxis
    ? Math.max(...yTickValues(yAxis, domain).map((value) => textWidth(formatAxisLabel(yAxis, value), yFontSize)), 0)
    : 0;
  const padding = resolveChartPadding(paddingProp, xAxis, yAxis, yLabelWidth, xFontSize);
  const innerWidth = Math.max(0, chartWidth - padding.left - padding.right);
  const innerHeight = Math.max(0, height - padding.top - padding.bottom);
  const x = (index: number) => padding.left + (labels.length > 1 ? (index / (labels.length - 1)) * innerWidth : innerWidth / 2);
  const y = (value: number) => {
    const clamped = Math.max(domain[0], Math.min(domain[1], value));
    return padding.top + innerHeight * (1 - (clamped - domain[0]) / (domain[1] - domain[0]));
  };

  const handleLayout = (event: LayoutChangeEvent) => setMeasuredWidth(event.nativeEvent.layout.width);
  return (
    <View onLayout={width == null ? handleLayout : undefined} style={{ width: width ?? '100%', height }} testID={testID}>
      {chartWidth > 0 && (
        <Svg width={chartWidth} height={height}>
          <LineChartRenderer series={series} x={x} y={y} />
          {xAxis && <Axis axis={xAxis} axisType="x" labels={labels} domain={domain} width={chartWidth} height={height} padding={padding} />}
          {yAxis && <Axis axis={yAxis} axisType="y" labels={labels} domain={domain} width={chartWidth} height={height} padding={padding} />}
        </Svg>
      )}
    </View>
  );
}

export default LineChart;
