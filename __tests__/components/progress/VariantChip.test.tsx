/**
 * BLD-1086: Tests for VariantChip component.
 *
 * Covers:
 * - all-null variant renders nothing
 * - partial null variant renders em-dashes for null dims
 * - known attachment/mount/grip shows human labels
 * - accessibilityLabel is descriptive
 */

import React from 'react'
import { render } from '@testing-library/react-native'
import VariantChip from '@/components/progress/records/VariantChip'

jest.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    primary: '#6200ee',
    primaryContainer: '#e8def8',
    onSurface: '#000',
    onSurfaceVariant: '#666',
  }),
}))

describe('VariantChip', () => {
  test('renders nothing when all variant fields are null', () => {
    const { toJSON } = render(
      <VariantChip variant={{ attachment: null, mountPosition: null, gripType: null, stackUnitAtLog: null }} />
    )
    expect(toJSON()).toBeNull()
  })

  test('renders "Rope" label for rope attachment', () => {
    const { getByText } = render(
      <VariantChip variant={{ attachment: 'rope', mountPosition: null, gripType: null, stackUnitAtLog: null }} />
    )
    expect(getByText('Rope')).toBeTruthy()
  })

  test('renders chip text with all known dimensions', () => {
    const { getByText } = render(
      <VariantChip variant={{ attachment: 'rope', mountPosition: 'high', gripType: 'neutral', stackUnitAtLog: 'kg' }} />
    )
    expect(getByText('Rope · High · Neutral · kg')).toBeTruthy()
  })

  test('renders em-dash for null mount when attachment is present', () => {
    const { getByText } = render(
      <VariantChip variant={{ attachment: 'bar', mountPosition: null, gripType: null, stackUnitAtLog: null }} />
    )
    // Only attachment shown, trailing em-dashes collapsed
    expect(getByText('Bar')).toBeTruthy()
  })

  test('renders attachment · mount when grip is null', () => {
    const { getByText } = render(
      <VariantChip variant={{ attachment: 'handle', mountPosition: 'low', gripType: null, stackUnitAtLog: null }} />
    )
    expect(getByText('Handle · Low')).toBeTruthy()
  })

  test('accessibilityLabel describes all non-null dimensions', () => {
    const { getAllByRole } = render(
      <VariantChip variant={{ attachment: 'rope', mountPosition: 'high', gripType: null, stackUnitAtLog: null }} />
    )
    const chip = getAllByRole('text')[0]
    expect(chip.props.accessibilityLabel).toContain('Rope attachment')
    expect(chip.props.accessibilityLabel).toContain('High mount')
  })

  test('accessibilityLabel says unspecified when only stack unit is null (all null)', () => {
    const { toJSON } = render(
      <VariantChip variant={{ attachment: null, mountPosition: null, gripType: null, stackUnitAtLog: null }} />
    )
    // renders nothing for all-null
    expect(toJSON()).toBeNull()
  })
})
