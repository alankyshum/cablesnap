import React from 'react'
import { waitFor } from '@testing-library/react-native'
import { renderScreen } from '../../helpers/render'

const mockPush = jest.fn()
const mockParams = { weight: '100', unit: 'kg' }

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  useGlobalSearchParams: () => mockParams,
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require('react')
    useEffect(() => {
      const cleanup = cb()
      if (typeof cleanup === 'function') return cleanup
    }, [])
  },
  Link: 'Link',
  Stack: { Screen: 'Screen' },
}))

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}))

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')

jest.mock('../../../lib/db', () => ({
  getBodySettings: jest.fn().mockResolvedValue({ weight_unit: 'kg' }),
}))

import PlateCalculator from '../../../app/tools/plates'

describe('PlateCalculator screen', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders unit toggle with kg/lb', async () => {
    const { getByLabelText } = renderScreen(<PlateCalculator />)
    await waitFor(() => {
      expect(getByLabelText('Unit system')).toBeTruthy()
    })
  })

  it('renders target weight input', async () => {
    const { getByLabelText } = renderScreen(<PlateCalculator />)
    await waitFor(() => {
      expect(getByLabelText('Target weight in kilograms')).toBeTruthy()
    })
  })

  it('renders bar weight selection radiogroup', async () => {
    const { getByLabelText } = renderScreen(<PlateCalculator />)
    await waitFor(() => {
      expect(getByLabelText('Bar weight selection')).toBeTruthy()
    })
  })

  it('pre-fills target from search params', async () => {
    const { getByDisplayValue } = renderScreen(<PlateCalculator />)
    await waitFor(() => {
      expect(getByDisplayValue('100')).toBeTruthy()
    })
  })

  it('shows per-side calculation for valid input', async () => {
    const { getByText } = renderScreen(<PlateCalculator />)
    await waitFor(() => {
      expect(getByText(/per side/)).toBeTruthy()
    })
  })

  it('shows total weight confirmation', async () => {
    const { getByText } = renderScreen(<PlateCalculator />)
    await waitFor(() => {
      expect(getByText(/Total:/)).toBeTruthy()
    })
  })

  it('renders barbell diagram with accessibility label', async () => {
    const { getByLabelText } = renderScreen(<PlateCalculator />)
    await waitFor(() => {
      expect(getByLabelText(/Barbell loaded with/)).toBeTruthy()
    })
  })

  it('uses FlashList for plate list (no ScrollView anti-pattern)', async () => {
    const fs = require('fs')
    const path = require('path')
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../app/tools/plates.tsx'),
      'utf-8'
    )
    expect(src).not.toMatch(/import\s*\{[^}]*ScrollView[^}]*\}\s*from\s*["']react-native["']/)
    expect(src).toMatch(/import\s*\{[^}]*FlashList[^}]*\}\s*from\s*["']@shopify\/flash-list["']/)
  })

  it('shows plate list items for 100kg target with 20kg bar', async () => {
    const { getAllByText } = renderScreen(<PlateCalculator />)
    await waitFor(() => {
      // 100kg - 20kg bar = 80kg / 2 = 40kg per side
      // Greedy: 1x25 + 1x15 = 40kg
      expect(getAllByText(/25kg/).length).toBeGreaterThanOrEqual(1)
      expect(getAllByText(/15kg/).length).toBeGreaterThanOrEqual(1)
    })
  })
})
