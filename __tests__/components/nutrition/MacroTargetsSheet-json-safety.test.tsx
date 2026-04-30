/**
 * BLD-895: Verify MacroTargetsSheet handles corrupt nutrition_profile JSON
 * without crashing (SyntaxError: Unexpected end of JSON input).
 */
import React from 'react'
import { waitFor } from '@testing-library/react-native'
import { renderScreen } from '../../helpers/render'

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  usePathname: () => '/test',
  useFocusEffect: jest.fn(),
  Stack: { Screen: () => null },
  Redirect: () => null,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
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
jest.mock('../../../lib/layout', () => ({
  useLayout: () => ({ wide: false, width: 375, scale: 1.0, horizontalPadding: 16 }),
}))

const mockGetMacroTargets = jest.fn().mockResolvedValue({
  calories: 2000, protein: 150, carbs: 250, fat: 65,
})
const mockGetAppSetting = jest.fn()

jest.mock('../../../lib/db', () => ({
  getAppSetting: (...args: unknown[]) => mockGetAppSetting(...args),
  getMacroTargets: (...args: unknown[]) => mockGetMacroTargets(...args),
  updateMacroTargets: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../../lib/nutrition-calc', () => ({
  calculateFromProfile: jest.fn(() => ({
    calories: 2000, protein: 150, carbs: 250, fat: 65,
  })),
  migrateProfile: jest.fn((p: unknown) => p),
}))

import { MacroTargetsSheet } from '../../../components/nutrition/MacroTargetsSheet'

describe('MacroTargetsSheet JSON safety (BLD-895)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('does not crash when nutrition_profile is truncated JSON', async () => {
    mockGetAppSetting.mockResolvedValue('{"birthYear":19')  // truncated

    // Should render without throwing
    renderScreen(
      <MacroTargetsSheet visible={true} onClose={jest.fn()} />
    )

    await waitFor(() => {
      expect(mockGetAppSetting).toHaveBeenCalledWith('nutrition_profile')
    })
  })

  it('does not crash when nutrition_profile is empty string', async () => {
    mockGetAppSetting.mockResolvedValue('')

    renderScreen(
      <MacroTargetsSheet visible={true} onClose={jest.fn()} />
    )

    await waitFor(() => {
      expect(mockGetAppSetting).toHaveBeenCalledWith('nutrition_profile')
    })
  })

  it('parses valid nutrition_profile without error', async () => {
    const { migrateProfile } = require('../../../lib/nutrition-calc')
    const validProfile = { birthYear: 1990, weight: 80, height: 180 }
    mockGetAppSetting.mockResolvedValue(JSON.stringify(validProfile))

    renderScreen(
      <MacroTargetsSheet visible={true} onClose={jest.fn()} />
    )

    await waitFor(() => {
      expect(migrateProfile).toHaveBeenCalledWith(validProfile)
    })
  })
})
