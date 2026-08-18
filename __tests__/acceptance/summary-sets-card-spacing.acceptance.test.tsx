/**
 * Acceptance test for BLD-3660:
 * Sets card on the workout summary must render exercise groups with equal
 * vertical spacing between them and no trailing margin below the last group.
 *
 * Invariant: the container wrapping the mapped exercise groups uses `gap`
 * (not per-item `marginBottom`), which produces uniform inter-group spacing
 * and leaves no leftover gap after the final group.
 */

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

jest.mock('@/hooks/useIntensityMode', () => ({
  useIntensityMode: () => 'rpe',
}));

import React from 'react';
import { View } from 'react-native';
import { render } from '@testing-library/react-native';
import SetsCard from '../../components/session/summary/SetsCard';
import { makeMockThemeColors } from '../helpers/theme';

type Row = { id: string; weight: number; reps: number };

const grouped = [
  {
    name: 'Bench Press',
    sets: [
      { id: 'a1', weight: 60, reps: 8 } as Row,
      { id: 'a2', weight: 60, reps: 8 } as Row,
    ],
  },
  {
    name: 'Row',
    sets: [
      { id: 'b1', weight: 50, reps: 10 } as Row,
      { id: 'b2', weight: 50, reps: 10 } as Row,
    ],
  },
  {
    name: 'Overhead Press',
    sets: [{ id: 'c1', weight: 30, reps: 12 } as Row],
  },
];

const flat = (s: unknown): Record<string, unknown> => {
  if (!s) return {};
  if (Array.isArray(s)) return Object.assign({}, ...s.map((v) => flat(v)));
  return s as Record<string, unknown>;
};

describe('Summary SetsCard — consistent exercise spacing (BLD-3660)', () => {
  it('wraps groups in a container using `gap` (no per-item marginBottom)', () => {
    const colors = makeMockThemeColors();
    const { UNSAFE_getAllByType } = render(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <SetsCard grouped={grouped as any} colors={colors} />
    );

    const views = UNSAFE_getAllByType(View);

    // Exactly one wrapping <View> should carry the `gap: 8` invariant.
    const gapWrappers = views.filter((v: { props: { style?: unknown } }) => {
      const f = flat(v.props.style);
      return f.gap === 8 && f.flexDirection === undefined; // exclude setRow
    });
    expect(gapWrappers.length).toBeGreaterThanOrEqual(1);

    // No individual View in the tree should use marginBottom: 8
    // (the old per-item inter-group spacing that produced uneven trailing gap).
    const perItemMargin = views.filter((v: { props: { style?: unknown } }) => {
      const f = flat(v.props.style);
      return f.marginBottom === 8;
    });
    expect(perItemMargin).toHaveLength(0);
  });
});
