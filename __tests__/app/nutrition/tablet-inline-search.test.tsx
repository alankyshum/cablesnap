import React from 'react'
import '@testing-library/react-native'
import { renderScreen } from '../../helpers/render'
import { createFoodEntry, createDailyLog, createMacroTargets, resetIds } from '../../helpers/factories'
import type { DailyLog } from '../../../lib/types'

jest.mock('expo-router', () => {
  const RealReact = require('react')
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), setParams: jest.fn() },
    useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
    useLocalSearchParams: () => ({}),
    useFocusEffect: (cb: () => (() => void) | void) => {
      RealReact.useEffect(() => {
        const cleanup = cb()
        return typeof cleanup === 'function' ? cleanup : undefined
      }, [])
    },
    Stack: { Screen: () => null },
  }
})

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')
jest.mock('../../../lib/errors', () => ({ logError: jest.fn(), generateReport: jest.fn().mockResolvedValue('{}'), getRecentErrors: jest.fn().mockResolvedValue([]), generateGitHubURL: jest.fn().mockReturnValue('https://github.com') }))
jest.mock('../../../lib/interactions', () => ({ log: jest.fn(), recent: jest.fn().mockResolvedValue([]) }))
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))

const chicken = createFoodEntry({ id: 'f1', name: 'Chicken Breast', calories: 165, protein: 31, carbs: 0, fat: 3.6 })
const logs: DailyLog[] = [
  createDailyLog({ id: 'dl1', food_entry_id: 'f1', meal: 'lunch', servings: 1, food: chicken }),
]
const targets = createMacroTargets({ calories: 2000, protein: 150, carbs: 250, fat: 65 })

const mockGetDailyLogs = jest.fn().mockResolvedValue(logs)
const mockGetDailySummary = jest.fn().mockResolvedValue({ calories: 165, protein: 31, carbs: 0, fat: 3.6 })
const mockGetMacroTargets = jest.fn().mockResolvedValue(targets)
const mockDeleteDailyLog = jest.fn().mockResolvedValue(undefined)
const mockAddDailyLog = jest.fn().mockResolvedValue(undefined)

jest.mock('../../../lib/db', () => ({
  getDailyLogs: (...args: unknown[]) => mockGetDailyLogs(...args),
  getDailySummary: (...args: unknown[]) => mockGetDailySummary(...args),
  getMacroTargets: (...args: unknown[]) => mockGetMacroTargets(...args),
  deleteDailyLog: (...args: unknown[]) => mockDeleteDailyLog(...args),
  addDailyLog: (...args: unknown[]) => mockAddDailyLog(...args),
  getDailyTotalMl: jest.fn().mockResolvedValue(0),
  getWaterLogsForDate: jest.fn().mockResolvedValue([]),
  addWaterLog: jest.fn(),
  deleteWaterLog: jest.fn(),
  updateWaterLog: jest.fn(),
  getAppSetting: jest.fn().mockResolvedValue(null),
}))

jest.mock('../../../components/InlineFoodSearch', () => {
  const RealReact = require('react')
  return {
    __esModule: true,
    default: (props: { dateKey: string }) => {
      const { View, Text } = require('react-native')
      return RealReact.createElement(View, { testID: 'inline-food-search' },
        RealReact.createElement(Text, {}, `InlineFoodSearch:${props.dateKey}`)
      )
    },
  }
})

// Tablet layout — atLeastMedium: true
jest.mock('../../../lib/layout', () => ({
  useLayout: () => ({ wide: true, atLeastMedium: true, width: 800, horizontalPadding: 16, scale: 1.0 }),
}))

import Nutrition from '../../../app/(tabs)/nutrition'

describe('Nutrition Tab — Tablet Layout', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetIds()
  })

  it('does not render InlineFoodSearch inline — uses BottomSheet instead', async () => {
    const { queryByTestId, findByText } = renderScreen(<Nutrition />)

    // InlineFoodSearch should NOT be visible by default (it's in a closed BottomSheet)
    expect(queryByTestId('inline-food-search')).toBeNull()

    // Food log entries should still display
    expect(await findByText('Chicken Breast')).toBeTruthy()
    expect(await findByText('Lunch')).toBeTruthy()
  })

  it('does not render FAB on any layout', async () => {
    const { findByText, queryByLabelText } = renderScreen(<Nutrition />)

    await findByText('Chicken Breast')

    // FAB has been removed — add food is via header "+" button
    expect(queryByLabelText('Add food')).toBeNull()
    expect(queryByLabelText('Close add food')).toBeNull()
  })
})
