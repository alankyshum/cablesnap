import { useState } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import { BarChartRenderer } from './BarChartRenderer';
import { BAR_LABEL_FONT_SIZE } from './ticks';
import type { BarChartProps } from './types';

export function BarChart({
  labels,
  values,
  color,
  height,
  width,
  cornerRadius = 0,
  labelColor,
  padding = {},
  testID,
}: BarChartProps) {
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const chartWidth = width ?? measuredWidth;
  const left = padding.left ?? 0;
  const right = padding.right ?? 0;
  const top = padding.top ?? 0;
  const labelFontSize = BAR_LABEL_FONT_SIZE;
  const labelSpace = labels.length > 0 ? labelFontSize + 2 : 0;
  const bottom = (padding.bottom ?? 0) + labelSpace;
  const innerWidth = Math.max(0, chartWidth - left - right);
  const innerHeight = Math.max(0, height - top - bottom);
  const onLayout = (event: LayoutChangeEvent) => {
    if (width === undefined) {
      setMeasuredWidth(event.nativeEvent.layout.width);
    }
  };

  return (
    <View
      testID={testID}
      style={{ width: width ?? '100%', height }}
      onLayout={width === undefined ? onLayout : undefined}
    >
      {chartWidth > 0 && innerWidth > 0 && innerHeight > 0 && <BarChartRenderer labels={labels} values={values} color={color} height={height}
        chartWidth={chartWidth} cornerRadius={cornerRadius} labelColor={labelColor} left={left} right={right}
        top={top} bottom={bottom} labelBottom={padding.bottom ?? 0} />}
    </View>
  );
}
