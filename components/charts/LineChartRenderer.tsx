import React from 'react';
import { Circle, Path } from 'react-native-svg';
import { line } from 'd3-shape';
import { curveFor } from './lineChartHelpers';
import type { LineChartProps } from './types';

type Props = {
  series: LineChartProps['series'];
  x: (index: number) => number;
  y: (value: number) => number;
};

export function LineChartRenderer({ series, x, y }: Props) {
  return (
    <>
      {series.map((item) => {
        const path = item.values.length > 0
          ? line<number>()
            .x((_, index: number) => x(index))
            .y((value: number) => y(value))
            .curve(curveFor(item.curve))(item.values) ?? undefined
          : undefined;
        return (
          <React.Fragment key={item.key}>
            {path && <Path d={path} stroke={item.color} strokeWidth={item.strokeWidth ?? 2} fill="none" />}
            {item.showPoints && item.values.map((value, index) => (
              <Circle key={`${item.key}-point-${index}`} cx={x(index)} cy={y(value)} r={item.pointRadius ?? 5} fill={item.color} />
            ))}
          </React.Fragment>
        );
      })}
    </>
  );
}
