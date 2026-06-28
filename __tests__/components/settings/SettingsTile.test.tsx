/**
 * __tests__/components/settings/SettingsTile.test.tsx
 *
 * BLD-2036 (P2-8, epic BLD-2028) — Motion: Settings tile entrance + reduced
 * motion.
 *
 * Coverage:
 *  - Headless-safe contract: tile title + children render regardless of motion
 *    state (content is NEVER gated on the entrance animation).
 *  - Reduced motion → instant: `tileEntering` resolves to `undefined`, and the
 *    rendered wrapper receives `entering === undefined` (no animation).
 *  - Motion ON → a defined `entering` animation is applied.
 *  - Stagger math: `staggerDelayMs` is order-proportional, clamped at
 *    MAX_STAGGER_STEPS, and safe for index 0 / negative / non-finite input.
 *
 * The reanimated layout builders are opaque under the global mock
 * (__mocks__/react-native-reanimated.js), so motion-on assertions are made on
 * the *decision* (defined vs. undefined `entering`) and the pure stagger helper,
 * not on the builder's internal delay/duration values.
 */
import React from 'react';
import { render } from '@testing-library/react-native';

// Mutable reduced-motion state, flipped per test. Mirrors the established
// per-test hook-mock pattern (e.g. RpeChipStrip.test.tsx).
let mockReduceMotion = false;
jest.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockReduceMotion,
}));

import {
  SettingsTile,
  tileEntering,
  staggerDelayMs,
  STAGGER_STEP_MS,
  MAX_STAGGER_STEPS,
} from '@/components/settings/SettingsTile';
import { Text } from '@/components/ui/text';
import { lightMockColors } from '../../helpers/theme';

const TID = 'settings-tile-test';

function renderTile(extra: Partial<React.ComponentProps<typeof SettingsTile>> = {}) {
  return render(
    <SettingsTile colors={lightMockColors as never} title="Profile" testID={TID} {...extra}>
      <Text>child-content</Text>
    </SettingsTile>,
  );
}

describe('staggerDelayMs (BLD-2036)', () => {
  it('is zero for the first tile', () => {
    expect(staggerDelayMs(0)).toBe(0);
  });

  it('is order-proportional below the cap', () => {
    expect(staggerDelayMs(1)).toBe(STAGGER_STEP_MS);
    expect(staggerDelayMs(3)).toBe(3 * STAGGER_STEP_MS);
  });

  it('clamps at MAX_STAGGER_STEPS so the last tile is never perceptibly slow', () => {
    const capped = MAX_STAGGER_STEPS * STAGGER_STEP_MS;
    expect(staggerDelayMs(MAX_STAGGER_STEPS)).toBe(capped);
    expect(staggerDelayMs(MAX_STAGGER_STEPS + 5)).toBe(capped);
    expect(staggerDelayMs(999)).toBe(capped);
  });

  it('is safe (0) for negative or non-finite index', () => {
    expect(staggerDelayMs(-3)).toBe(0);
    expect(staggerDelayMs(Number.NaN)).toBe(0);
    // Non-finite (Infinity) is treated as "no stagger" rather than the cap —
    // `Number.isFinite(Infinity)` is false, so the guard returns 0. Safe either
    // way: the tile still mounts, just without an added delay.
    expect(staggerDelayMs(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('tileEntering (BLD-2036)', () => {
  it('returns undefined under reduced motion (instant, no animation)', () => {
    expect(tileEntering(0, true)).toBeUndefined();
    expect(tileEntering(5, true)).toBeUndefined();
  });

  it('returns a defined entering animation when motion is enabled', () => {
    expect(tileEntering(0, false)).toBeDefined();
    expect(tileEntering(3, false)).toBeDefined();
  });
});

describe('SettingsTile — headless-safe render (BLD-2036)', () => {
  afterEach(() => {
    mockReduceMotion = false;
  });

  it('renders title + children with motion ENABLED (content not gated on animation)', () => {
    mockReduceMotion = false;
    const { getByText, getByTestId } = renderTile({ index: 2 });
    expect(getByText('Profile')).toBeTruthy();
    expect(getByText('child-content')).toBeTruthy();
    expect(getByTestId(TID)).toBeTruthy();
  });

  it('renders title + children under REDUCED motion (content still present, instant)', () => {
    mockReduceMotion = true;
    const { getByText, getByTestId } = renderTile({ index: 2 });
    expect(getByText('Profile')).toBeTruthy();
    expect(getByText('child-content')).toBeTruthy();
    expect(getByTestId(TID)).toBeTruthy();
  });

  it('passes entering === undefined to the wrapper under reduced motion', () => {
    mockReduceMotion = true;
    const { getByTestId } = renderTile({ index: 4 });
    // The Animated.View wrapper exposes its own `${testID}-entrance` testID.
    const wrapper = getByTestId(`${TID}-entrance`);
    expect(wrapper.props.entering).toBeUndefined();
  });

  it('passes a defined entering to the wrapper when motion is enabled', () => {
    mockReduceMotion = false;
    const { getByTestId } = renderTile({ index: 4 });
    const wrapper = getByTestId(`${TID}-entrance`);
    expect(wrapper.props.entering).toBeDefined();
  });

  it('renders without a title when omitted (child component supplies its own heading)', () => {
    mockReduceMotion = false;
    const { queryByText, getByText } = renderTile({ title: undefined });
    expect(queryByText('Profile')).toBeNull();
    expect(getByText('child-content')).toBeTruthy();
  });
});
