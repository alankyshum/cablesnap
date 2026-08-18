import { render } from '@testing-library/react-native';
import { Path, Text as SvgText } from 'react-native-svg';
import { BarChart } from '@/components/charts/BarChart';

describe('BarChart', () => {
  const props = {
    labels: ['a', 'b', 'c'],
    color: '#000',
    labelColor: '#6B7280',
    height: 100,
    width: 300,
  };

  it('renders one path per value', () => {
    const { UNSAFE_getAllByType } = render(<BarChart {...props} values={[1, 2, 3]} />);

    expect(UNSAFE_getAllByType(Path)).toHaveLength(3);
  });

  it('uses rounded top geometry when cornerRadius is set', () => {
    const { UNSAFE_getByType } = render(
      <BarChart {...props} values={[1]} cornerRadius={4} />,
    );

    expect(UNSAFE_getByType(Path).props.d).toContain('Q');
  });

  it.each([2, 12])('keeps %i bars inside the plot with clearance', (count) => {
    const { UNSAFE_getAllByType } = render(
      <BarChart {...props} values={Array.from({ length: count }, () => 1)} />,
    );
    const paths = UNSAFE_getAllByType(Path).map((path) => path.props.d as string);
    const edges = paths.map((d) => {
      const move = d.match(/^M ([\d.-]+) /);
      const right = d.match(/H ([\d.-]+) V/);
      return { left: Number(move?.[1]), right: Number(right?.[1]) };
    });
    const slotWidth = props.width / count;

    expect(edges.every(({ left, right }) => left >= 0 && right <= props.width)).toBe(true);
    expect(edges.every(({ left, right }) => right - left < slotWidth)).toBe(true);
    edges.slice(1).forEach((edge, index) => {
      expect(edges[index].right).toBeLessThan(edge.left);
    });
  });

  it('clamps corner radius to the narrower bar width', () => {
    const { UNSAFE_getAllByType } = render(
      <BarChart {...props} values={[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]} cornerRadius={100} />,
    );

    const d = UNSAFE_getAllByType(Path)[0].props.d as string;
    const topLeft = Number(d.match(/^M ([\d.-]+) /)?.[1]);
    const topRight = Number(d.match(/H ([\d.-]+) Q/)?.[1]);

    expect(topLeft).toBeCloseTo(12.5);
    expect(topRight).toBeCloseTo(12.5);
  });

  it('renders no bars for an empty series', () => {
    const { UNSAFE_queryAllByType } = render(<BarChart {...props} values={[]} />);

    expect(UNSAFE_queryAllByType(Path)).toHaveLength(0);
  });

  it('renders an all-zero series as zero-height bars', () => {
    const { UNSAFE_getAllByType } = render(<BarChart {...props} values={[0, 0, 0]} />);

    UNSAFE_getAllByType(Path).forEach((path) => {
      expect(path.props.d).toMatch(/M [\d.-]+ 88 H [\d.-]+ V 88/);
    });
  });

  it('renders mixed positive and negative values on opposite sides of zero', () => {
    const { UNSAFE_getAllByType } = render(<BarChart {...props} values={[2, -1]} />);
    const paths = UNSAFE_getAllByType(Path).map((path) => path.props.d as string);

    expect(paths[0]).toContain('M 15 0');
    expect(paths[0]).toContain('V 58.666666666666664');
    expect(paths[1]).toContain('M 165 58.666666666666664');
    expect(paths[1]).toContain('V 88');
  });

  it('renders an all-negative series below zero', () => {
    const { UNSAFE_getAllByType } = render(<BarChart {...props} values={[-1, -2]} />);
    const paths = UNSAFE_getAllByType(Path).map((path) => path.props.d as string);

    expect(paths[0]).toContain('M 15 0');
    expect(paths[0]).toContain('V 44');
    expect(paths[1]).toContain('M 165 0');
    expect(paths[1]).toContain('V 88');
  });

  it('renders a single value and its x label', () => {
    const { UNSAFE_getByType } = render(<BarChart {...props} values={[1]} />);

    expect(UNSAFE_getByType(Path).props.d).toContain('M 30 0');
    expect(UNSAFE_getByType(Path).props.d).toContain('V 88');
    expect(UNSAFE_getByType(SvgText).props.children).toBe('a');
  });

  it('decimates labels to fit a narrow chart without overlap', () => {
    const labels = ['10/01', '10/02', '10/03', '10/04', '10/05', '10/06', '10/07', '10/08', '10/09', '10/10', '10/11', '10/12'];
    const width = 272;
    const { UNSAFE_getAllByType } = render(
      <BarChart {...props} labels={labels} values={labels.map(() => 1)} width={width} />,
    );
    const rendered = UNSAFE_getAllByType(SvgText);
    const labelWidth = 30;
    const slotWidth = width / labels.length;
    const centers = rendered.map((text) => text.props.x as number);

    expect(rendered.length).toBeLessThan(labels.length);
    expect(rendered[0].props.children).toBe(labels[0]);
    expect(rendered[rendered.length - 1].props.children).toBe(labels[labels.length - 1]);
    centers.slice(1).forEach((center, index) => {
      expect(center - centers[index]).toBeGreaterThanOrEqual(labelWidth);
    });
    expect(slotWidth).toBeLessThan(labelWidth);
  });

  it('renders every label when the chart is wide enough', () => {
    const labels = ['10/01', '10/02', '10/03', '10/04', '10/05', '10/06', '10/07', '10/08', '10/09'];
    const { UNSAFE_getAllByType } = render(
      <BarChart {...props} labels={labels} values={labels.map(() => 1)} width={327} />,
    );

    expect(UNSAFE_getAllByType(SvgText)).toHaveLength(labels.length);
  });

  it('falls back to the first and last labels when no tick count fits', () => {
    const labels = Array.from({ length: 9 }, () => 'x'.repeat(45));
    const { UNSAFE_getAllByType } = render(
      <BarChart {...props} labels={labels} values={labels.map(() => 1)} width={272} />,
    );

    const rendered = UNSAFE_getAllByType(SvgText);
    expect(rendered).toHaveLength(2);
    expect(rendered[0].props.children).toBe(labels[0]);
    expect(rendered[1].props.children).toBe(labels[labels.length - 1]);
  });

  it('rounds negative bars at the free end, not the baseline', () => {
    const { UNSAFE_getByType } = render(<BarChart {...props} values={[-10]} cornerRadius={4} />);
    const path = UNSAFE_getByType(Path).props.d as string;

    expect(path).toContain('Q 270 88 266 88');
    expect(path).not.toContain('Q 300 44');
  });
});
