/**
 * BLD-2030: Lock the style contract for the Card `variant` prop.
 *
 * Three surface treatments must stay stable because the declutter epic
 * (BLD-2028) and downstream tickets opt Settings tiles into `outline`:
 *
 * - `elevated` (DEFAULT, omitted prop) — drop shadow + elevation, opaque `card`
 *   bg. Backwards-compatible with the ~95 existing call sites.
 * - `outline` — 1px `border` hairline, NO shadow / NO elevation.
 * - `ghost`   — `muted` surface tint, NO border, NO shadow / NO elevation.
 *
 * Shared invariants for every variant: full-width tile, `radii.lg` (12) radius,
 * `spacing.base` (16) padding.
 *
 * Tests resolve to the light theme (default `themeMode: "system"` →
 * `useColorScheme()` → light), so colors are asserted against `Colors.light`.
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { Card } from '../../../components/ui/card';
import { radii, spacing } from '../../../constants/design-tokens';
import { Colors } from '../../../theme/colors';

function flattenCardStyle(testID: string, element: React.ReactElement) {
  const screen = render(element);
  const node = screen.getByTestId(testID);
  return StyleSheet.flatten(node.props.style) ?? {};
}

describe('Card variant style contract (BLD-2030)', () => {
  describe('shared invariants (all variants)', () => {
    it.each(['elevated', 'outline', 'ghost'] as const)(
      '%s uses radii.lg radius and spacing.base padding, full width',
      (variant) => {
        const flat = flattenCardStyle(
          `card-${variant}`,
          <Card variant={variant} testID={`card-${variant}`}>
            {null}
          </Card>
        );
        expect(flat.borderRadius).toBe(radii.lg);
        expect(flat.padding).toBe(spacing.base);
        expect(flat.width).toBe('100%');
      }
    );
  });

  describe('elevated (default)', () => {
    it('omitting the prop renders identically to variant="elevated"', () => {
      const omitted = flattenCardStyle(
        'card-omitted',
        <Card testID="card-omitted">{null}</Card>
      );
      const explicit = flattenCardStyle(
        'card-explicit',
        <Card variant="elevated" testID="card-explicit">
          {null}
        </Card>
      );
      expect(omitted).toEqual(explicit);
    });

    it('renders a drop shadow + elevation on the opaque card surface', () => {
      const flat = flattenCardStyle(
        'card-elevated',
        <Card variant="elevated" testID="card-elevated">
          {null}
        </Card>
      );
      expect(flat.backgroundColor).toBe(Colors.light.card);
      expect(flat.shadowColor).toBe(Colors.light.foreground);
      expect(flat.shadowOpacity).toBeCloseTo(0.05, 5);
      expect(flat.shadowRadius).toBe(3);
      expect(flat.elevation).toBe(2);
      // No border edge on the default treatment.
      expect(flat.borderWidth).toBeUndefined();
    });
  });

  describe('outline', () => {
    it('renders a 1px border in the border token color', () => {
      const flat = flattenCardStyle(
        'card-outline',
        <Card variant="outline" testID="card-outline">
          {null}
        </Card>
      );
      expect(flat.backgroundColor).toBe(Colors.light.card);
      expect(flat.borderWidth).toBe(1);
      expect(flat.borderColor).toBe(Colors.light.border);
    });

    it('has no shadow and no elevation', () => {
      const flat = flattenCardStyle(
        'card-outline-noshadow',
        <Card variant="outline" testID="card-outline-noshadow">
          {null}
        </Card>
      );
      expect(flat.shadowOpacity).toBe(0);
      expect(flat.shadowRadius).toBe(0);
      expect(flat.elevation).toBe(0);
    });
  });

  describe('ghost', () => {
    it('renders the muted surface tint with no border', () => {
      const flat = flattenCardStyle(
        'card-ghost',
        <Card variant="ghost" testID="card-ghost">
          {null}
        </Card>
      );
      expect(flat.backgroundColor).toBe(Colors.light.muted);
      expect(flat.borderWidth).toBeUndefined();
    });

    it('has no shadow and no elevation', () => {
      const flat = flattenCardStyle(
        'card-ghost-noshadow',
        <Card variant="ghost" testID="card-ghost-noshadow">
          {null}
        </Card>
      );
      expect(flat.shadowOpacity).toBe(0);
      expect(flat.shadowRadius).toBe(0);
      expect(flat.elevation).toBe(0);
    });
  });

  describe('call-site style override', () => {
    it('applies the caller style after the variant base (override wins)', () => {
      const flat = flattenCardStyle(
        'card-override',
        <Card
          variant="outline"
          testID="card-override"
          style={{ backgroundColor: '#123456', padding: 4 }}
        >
          {null}
        </Card>
      );
      // Caller overrides bg + padding…
      expect(flat.backgroundColor).toBe('#123456');
      expect(flat.padding).toBe(4);
      // …but the variant's border treatment is preserved.
      expect(flat.borderWidth).toBe(1);
      expect(flat.borderColor).toBe(Colors.light.border);
    });
  });
});
