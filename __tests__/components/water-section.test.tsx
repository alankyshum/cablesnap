import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderScreen } from '../helpers/render';
import { WaterSection } from '../../components/nutrition/WaterSection';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

jest.mock('@/components/ui/progress', () => {
  const RealReact = require('react');
  return {
    Progress: ({ value }: { value: number }) =>
      RealReact.createElement('Progress', { testID: 'water-progress', value }),
  };
});

const baseColors = {
  primary: '#1976d2',
  onSurface: '#000',
  onSurfaceVariant: '#666',
};

function setup(overrides: Partial<React.ComponentProps<typeof WaterSection>> = {}) {
  const onPresetPress = jest.fn();
  const onCustomPress = jest.fn();
  const utils = renderScreen(
    <WaterSection
      totalMl={overrides.totalMl ?? 0}
      goalMl={overrides.goalMl ?? 2000}
      unit={overrides.unit ?? 'ml'}
      presetsMl={overrides.presetsMl ?? [250, 500, 750]}
      colors={overrides.colors ?? baseColors}
      onPresetPress={overrides.onPresetPress ?? onPresetPress}
      onCustomPress={overrides.onCustomPress ?? onCustomPress}
    />
  );
  return { ...utils, onPresetPress, onCustomPress };
}

describe('WaterSection', () => {
  it('renders header total/goal in ml and a 0%-filled bar by default', () => {
    const { getByText, getByTestId } = setup({ totalMl: 0, goalMl: 2000 });
    expect(getByText('0 / 2,000 ml')).toBeTruthy();
    expect(getByTestId('water-progress').props.value).toBe(0);
  });

  it('caps progress bar at 100% when total exceeds goal but text still reflects actual sum', () => {
    const { getByText, getByTestId } = setup({ totalMl: 2250, goalMl: 2000 });
    expect(getByText('2,250 / 2,000 ml')).toBeTruthy();
    expect(getByTestId('water-progress').props.value).toBe(100);
  });

  it('invokes onPresetPress with the preset ml value when a chip is tapped', () => {
    const { getByLabelText, onPresetPress } = setup();
    fireEvent.press(getByLabelText('Log 250 ml of water'));
    expect(onPresetPress).toHaveBeenCalledWith(250);
  });

  it('renders fl_oz unit labels when unit is fl_oz', () => {
    const { getByLabelText } = setup({ unit: 'fl_oz' });
    // 250ml ≈ 8.5 fl oz
    expect(getByLabelText('Log 8.5 fl oz of water')).toBeTruthy();
  });

  it('exposes accessibilityRole="progressbar" on the bar wrapper', () => {
    const { UNSAFE_getAllByProps } = setup({ totalMl: 500, goalMl: 2000 });
    const bars = UNSAFE_getAllByProps({ accessibilityRole: 'progressbar' });
    expect(bars.length).toBeGreaterThan(0);
  });

  it('reports actual (uncapped) totalMl in accessibilityValue.now even when over goal', () => {
    const { UNSAFE_getAllByProps } = setup({ totalMl: 2250, goalMl: 2000 });
    const bars = UNSAFE_getAllByProps({ accessibilityRole: 'progressbar' });
    expect(bars.length).toBeGreaterThan(0);
    expect(bars[0].props.accessibilityValue.now).toBe(2250);
    expect(bars[0].props.accessibilityValue.max).toBe(2000);
  });

  it('opens custom sheet via onCustomPress', () => {
    const { getByLabelText, onCustomPress } = setup();
    fireEvent.press(getByLabelText('Log custom amount of water'));
    expect(onCustomPress).toHaveBeenCalled();
  });

  // BLD-4090: chip row must vertically center-align chips when they wrap,
  // so preset + custom chips of differing intrinsic heights stay aligned.
  it('vertically centers water quick-add chips (BLD-4090)', () => {
    const { getByLabelText } = setup();
    const chip = getByLabelText('Log 250 ml of water');
    // Walk up until we find the flex-wrap row that contains this chip.
    const flatten = (s: unknown): Record<string, unknown> => {
      if (!s) return {};
      if (Array.isArray(s)) return Object.assign({}, ...s.map(flatten));
      return s as Record<string, unknown>;
    };
    let node: { props?: { style?: unknown }; parent?: unknown } | null = chip.parent as unknown as
      | { props?: { style?: unknown }; parent?: unknown }
      | null;
    let rowStyle: Record<string, unknown> | null = null;
    while (node) {
      const st = flatten(node.props?.style);
      if (st.flexWrap === 'wrap' && st.flexDirection === 'row') {
        rowStyle = st;
        break;
      }
      node = (node.parent ?? null) as typeof node;
    }
    expect(rowStyle).toBeTruthy();
    expect(rowStyle!.alignItems).toBe('center');
  });
});
