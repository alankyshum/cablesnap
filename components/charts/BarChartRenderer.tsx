import Svg, { Path, Text as SvgText } from 'react-native-svg';
import { BAR_LABEL_FONT_SIZE, textWidth, ticks } from './ticks';

function barPath(x: number, start: number, width: number, end: number, radius: number): string {
  const top = Math.min(start, end);
  const bottom = Math.max(start, end);
  const height = bottom - top;
  if (radius <= 0 || height <= 0) return `M ${x} ${top} H ${x + width} V ${bottom} H ${x} Z`;

  const r = Math.min(radius, width / 2, height / 2);
  if (end > start) {
    return [
      `M ${x} ${top}`, `H ${x + width}`, `V ${bottom - r}`,
      `Q ${x + width} ${bottom} ${x + width - r} ${bottom}`,
      `H ${x + r}`, `Q ${x} ${bottom} ${x} ${bottom - r}`, `V ${top}`, 'Z',
    ].join(' ');
  }
  return [
    `M ${x + r} ${top}`, `H ${x + width - r}`,
    `Q ${x + width} ${top} ${x + width} ${top + r}`,
    `V ${bottom}`, `H ${x}`, `V ${top + r}`,
    `Q ${x} ${top} ${x + r} ${top}`, 'Z',
  ].join(' ');
}

function labelIndices(labels: string[], valueCount: number, innerWidth: number, slotWidth: number) {
  const fontSize = BAR_LABEL_FONT_SIZE;
  const maxLabelWidth = labels.slice(0, valueCount).reduce(
    (maximumWidth, label) => Math.max(maximumWidth, textWidth(label, fontSize)), 0,
  );
  let indices = ticks(valueCount, valueCount);
  if (maxLabelWidth > 0 && valueCount > 1) {
    const maximumTickCount = Math.min(valueCount, Math.max(2, Math.floor(innerWidth / maxLabelWidth)));
    for (let count = maximumTickCount; count >= 2; count -= 1) {
      const candidate = ticks(count, valueCount);
      if (candidate.every((index, candidateIndex) => candidateIndex === 0
        || (index - candidate[candidateIndex - 1]) * slotWidth >= maxLabelWidth)) {
        indices = candidate;
        return indices;
      }
    }
    indices = ticks(2, valueCount);
  }
  return indices;
}

type BarChartRendererProps = {
  labels: string[];
  values: number[];
  color: string;
  height: number;
  chartWidth: number;
  cornerRadius: number;
  labelColor?: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  labelBottom: number;
};

export function BarChartRenderer({
  labels, values, color, height, chartWidth, cornerRadius, labelColor, left, right, top, bottom, labelBottom,
}: BarChartRendererProps) {
  const innerWidth = Math.max(0, chartWidth - left - right);
  const innerHeight = Math.max(0, height - top - bottom);
  const slotWidth = values.length > 0 ? innerWidth / values.length : 0;
  const barWidth = slotWidth * 0.8;
  const barInset = (slotWidth - barWidth) / 2;
  const labelIndicesToRender = labelIndices(labels, values.length, innerWidth, slotWidth);
  const minimum = values.length > 0 ? Math.min(...values) : 0;
  const maximum = values.length > 0 ? Math.max(...values) : 0;
  const domainMinimum = Math.min(0, minimum);
  const domainMaximum = Math.max(0, maximum);
  const domainSpan = domainMaximum - domainMinimum;
  const baseline = domainSpan === 0 ? top + innerHeight : top + (domainMaximum / domainSpan) * innerHeight;
  const labelFontSize = BAR_LABEL_FONT_SIZE;

  return (
    <Svg width={chartWidth} height={height}>
      {values.map((value, index) => {
        const barExtent = domainSpan === 0 ? 0 : (Math.abs(value) / domainSpan) * innerHeight;
        const end = value >= 0 ? baseline - barExtent : baseline + barExtent;
        return <Path key={index} d={barPath(left + index * slotWidth + barInset, baseline, barWidth, end, cornerRadius)} fill={color} />;
      })}
      {labelIndicesToRender.map((index) => {
        const label = labels[index];
        if (label === undefined) return null;
        const center = left + index * slotWidth + slotWidth / 2;
        const labelWidth = textWidth(label, labelFontSize);
        return (
          <SvgText key={`x-label-${index}`} x={Math.max(labelWidth / 2, Math.min(chartWidth - labelWidth / 2, center))}
             y={height - labelBottom - 2} fill={labelColor} fontSize={labelFontSize} textAnchor="middle">
            {label}
          </SvgText>
        );
      })}
    </Svg>
  );
}
