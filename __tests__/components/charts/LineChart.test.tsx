import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Circle, Path, Svg, Text as SvgText } from 'react-native-svg';
import LineChart, { ticks } from '@/components/charts/LineChart';

const base = { labels: ['A', 'B', 'C'], height: 100, width: 300 };

function paths(tree: ReturnType<typeof render>) {
  return tree.UNSAFE_getAllByType(Path);
}

describe('LineChart', () => {
  it('keeps the tick for a single-label series', () => {
    expect(ticks(5, 1)).toEqual([0]);
  });

  it('renders one, two, and three series', () => {
    expect(paths(render(<LineChart {...base} series={[{ key: 'a', values: [1, 2, 3], color: 'red' }]} />))).toHaveLength(1);
    expect(paths(render(<LineChart {...base} series={[
      { key: 'a', values: [1, 2, 3], color: 'red' },
      { key: 'b', values: [3, 2, 1], color: 'blue' },
    ]} />))).toHaveLength(2);
    expect(paths(render(<LineChart {...base} series={[
      { key: 'a', values: [1, 2, 3], color: 'red' },
      { key: 'b', values: [3, 2, 1], color: 'blue' },
      { key: 'c', values: [2, 2, 2], color: 'green' },
    ]} />))).toHaveLength(3);
  });

  it('uses distinct d3 paths for each curve', () => {
    const curves = ['linear', 'natural', 'monotoneX'] as const;
    const ds = curves.map((curve) => paths(render(
      <LineChart {...base} series={[{ key: curve, values: [1, 4, 2], color: 'red', curve }]} />
    ))[0].props.d);
    expect(new Set(ds).size).toBe(3);
  });

  it('clamps values to a fixed yDomain', () => {
    const path = paths(render(
      <LineChart {...base} yDomain={[0, 10]} series={[{ key: 'a', values: [-5, 5, 15], color: 'red', curve: 'linear' }]} />
    ))[0].props.d as string;
    expect(path).toContain('0,100');
    expect(path).toContain('150,50');
  });

  it('draws a point for a single value', () => {
    const tree = render(<LineChart labels={['A']} height={100} width={300} series={[{ key: 'a', values: [4], color: 'red', showPoints: true }]} />);
    expect(tree.UNSAFE_getAllByType(Circle)).toHaveLength(1);
  });

  it('formats axis labels', () => {
    const tree = render(
      <LineChart
        {...base}
        xAxis={{ labelColor: 'black', lineColor: 'black', tickCount: 2, formatLabel: (value) => `x:${value}` }}
        yAxis={{ labelColor: 'black', lineColor: 'black', tickCount: 4, formatLabel: (value) => `y:${Number(value).toFixed(0)}` }}
        series={[{ key: 'a', values: [1, 3, 5], color: 'red' }]}
      />
    );
    const labels = tree.UNSAFE_getAllByType(SvgText).map((text) => text.props.children);
    expect(labels).toEqual(expect.arrayContaining(['x:A', 'x:C', 'y:1', 'y:2', 'y:4', 'y:5']));
  });

  it('deduplicates ticks for a small integer domain', () => {
    const tree = render(
      <LineChart
        {...base}
        yDomain={[0, 2]}
        yAxis={{ labelColor: 'black', lineColor: 'black', tickCount: 4, formatLabel: (value) => String(Math.round(Number(value))) }}
        series={[{ key: 'a', values: [0, 1, 2], color: 'red' }]}
      />
    );
    const labels = tree.UNSAFE_getAllByType(SvgText).map((text) => text.props.children);
    expect(labels).toEqual(['0', '1', '2']);
  });

  it('emits in-bounds glyph boxes for both axes', () => {
    const width = 120;
    const height = 80;
    const tree = render(
      <LineChart
        labels={['A', 'B', 'C']}
        height={height}
        width={width}
        padding={{ left: 0, right: 0, top: 0, bottom: 0 }}
        xAxis={{ labelColor: 'black', lineColor: 'black', tickCount: 3 }}
        yAxis={{ labelColor: 'black', lineColor: 'black', tickCount: 2 }}
        series={[{ key: 'a', values: [0, 10, 20], color: 'red' }]}
      />
    );
    const labels = tree.UNSAFE_getAllByType(SvgText);
    expect(labels).toHaveLength(5);
    labels.forEach((label) => {
      expect(label.props.x).toBeGreaterThanOrEqual(0);
      expect(label.props.x).toBeLessThanOrEqual(width);
      expect(label.props.y - label.props.fontSize).toBeGreaterThanOrEqual(0);
      expect(label.props.y).toBeLessThanOrEqual(height);
    });
  });

  it('emits in-bounds glyph boxes for a y-axis without an x-axis', () => {
    const height = 100;
    const tree = render(
      <LineChart
        labels={['A', 'B', 'C']}
        height={height}
        width={120}
        padding={{ left: 0, right: 0, top: 0, bottom: 0 }}
        yAxis={{ labelColor: 'black', lineColor: 'black', tickCount: 2 }}
        series={[{ key: 'a', values: [0, 10, 20], color: 'red' }]}
      />
    );
    const labels = tree.UNSAFE_getAllByType(SvgText);
    expect(labels).toHaveLength(2);
    labels.forEach((label) => {
      expect(label.props.y - label.props.fontSize).toBeGreaterThanOrEqual(0);
      expect(label.props.y).toBeLessThanOrEqual(height);
    });
  });

  it('renders no Svg until an optional width is measured', () => {
    const tree = render(<LineChart testID="line-chart" labels={['A', 'B']} height={100} series={[{ key: 'a', values: [1, 2], color: 'red' }]} />);
    expect(tree.UNSAFE_queryAllByType(Svg)).toHaveLength(0);
    fireEvent(tree.getByTestId('line-chart'), 'layout', { nativeEvent: { layout: { width: 0 } } });
    expect(tree.UNSAFE_queryAllByType(Svg)).toHaveLength(0);
  });
});
