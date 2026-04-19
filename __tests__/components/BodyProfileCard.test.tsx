jest.setTimeout(10000)

import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  usePathname: () => '/test',
  useFocusEffect: jest.fn(),
  Stack: { Screen: () => null },
  Redirect: () => null,
}))

jest.mock('@react-navigation/native', () => {
  const RealReact = require('react')
  return {
    useFocusEffect: (cb: () => (() => void) | void) => {
      RealReact.useEffect(() => {
        const cleanup = cb()
        return typeof cleanup === 'function' ? cleanup : undefined
      }, [])
    },
  }
})

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')
jest.mock('../../lib/layout', () => ({
  useLayout: () => ({ wide: false, width: 375, scale: 1.0, horizontalPadding: 16 }),
}))

const mockSetAppSetting = jest.fn().mockResolvedValue(undefined)

const SAVED_PROFILE = JSON.stringify({
  birthYear: 1990,
  weight: 75,
  height: 175,
  sex: 'male',
  activityLevel: 'moderately_active',
  goal: 'maintain',
  weightUnit: 'kg',
  heightUnit: 'cm',
})

const mockGetAppSetting = jest.fn().mockImplementation((key: string) => {
  if (key === 'nutrition_profile') return Promise.resolve(SAVED_PROFILE)
  return Promise.resolve(null)
})

jest.mock('../../lib/db', () => ({
  getAppSetting: (...args: unknown[]) => mockGetAppSetting(...args),
  setAppSetting: (...args: unknown[]) => mockSetAppSetting(...args),
  updateMacroTargets: jest.fn().mockResolvedValue(undefined),
  getBodySettings: jest.fn().mockResolvedValue({
    weight_unit: 'kg',
    measurement_unit: 'cm',
    weight_goal: null,
    body_fat_goal: null,
  }),
}))

jest.mock('../../lib/db/body', () => ({
  getBodySettings: jest.fn().mockResolvedValue({
    weight_unit: 'kg',
    measurement_unit: 'cm',
    weight_goal: null,
    body_fat_goal: null,
  }),
  getLatestBodyWeight: jest.fn().mockResolvedValue(null),
}))

jest.mock('../../lib/nutrition-calc', () => ({
  ACTIVITY_LABELS: {
    sedentary: 'Sedentary',
    lightly_active: 'Lightly Active',
    moderately_active: 'Moderately Active',
    very_active: 'Very Active',
    extra_active: 'Extra Active',
  },
  ACTIVITY_DESCRIPTIONS: {
    sedentary: 'Little or no exercise, desk job',
    lightly_active: 'Light exercise 1–3 days/week',
    moderately_active: 'Moderate exercise 3–5 days/week',
    very_active: 'Hard exercise 6–7 days/week',
    extra_active: 'Very hard exercise, physical job',
  },
  GOAL_LABELS: { cut: 'Cut', maintain: 'Maintain', bulk: 'Bulk' },
  calculateFromProfile: jest.fn().mockReturnValue({
    calories: 2200,
    protein: 150,
    carbs: 275,
    fat: 73,
  }),
  migrateProfile: (p: unknown) => p,
}))

import BodyProfileCard from '../../components/BodyProfileCard'

describe('BodyProfileCard dirty-check', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetAppSetting.mockImplementation((key: string) => {
      if (key === 'nutrition_profile') return Promise.resolve(SAVED_PROFILE)
      return Promise.resolve(null)
    })
  })

  it('does not save when segment tapped to same value', async () => {
    const { findByLabelText } = renderScreen(<BodyProfileCard />)

    // Wait for profile to load
    const maleSegment = await findByLabelText('Male')
    // Tap the already-selected "Male" segment
    fireEvent.press(maleSegment)

    // Wait a tick for debounced save
    await new Promise((r) => setTimeout(r, 500))

    // setAppSetting should NOT be called with nutrition_profile
    const profileSaveCalls = mockSetAppSetting.mock.calls.filter(
      (c: unknown[]) => c[0] === 'nutrition_profile'
    )
    expect(profileSaveCalls).toHaveLength(0)
  })

  it('saves when a value actually changes', async () => {
    const { findByLabelText } = renderScreen(<BodyProfileCard />)

    // Wait for profile to load
    await findByLabelText('Male')

    // Change sex to Female
    const femaleSegment = await findByLabelText('Female')
    fireEvent.press(femaleSegment)

    // Wait for debounced save
    await waitFor(() => {
      const profileSaveCalls = mockSetAppSetting.mock.calls.filter(
        (c: unknown[]) => c[0] === 'nutrition_profile'
      )
      expect(profileSaveCalls.length).toBeGreaterThanOrEqual(1)
    })
  })
})
