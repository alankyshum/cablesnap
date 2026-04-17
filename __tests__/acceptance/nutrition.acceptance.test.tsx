jest.setTimeout(10000)

import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import { createFoodEntry, createDailyLog, createMacroTargets, resetIds } from '../helpers/factories'
import type { DailyLog } from '../../lib/types'

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() }

jest.mock('expo-router', () => {
  const RealReact = require('react')
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
    useRouter: () => mockRouter,
    useLocalSearchParams: () => ({}),
    usePathname: () => '/test',
    useFocusEffect: (cb: () => (() => void) | void) => {
      RealReact.useEffect(() => {
        const cleanup = cb()
        return typeof cleanup === 'function' ? cleanup : undefined
      }, [])
    },
    Stack: { Screen: () => null },
    Redirect: () => null,
  }
})

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')
jest.mock('../../lib/layout', () => ({ useLayout: () => ({ wide: false, width: 375, scale: 1.0 }) }))
jest.mock('../../lib/errors', () => ({ logError: jest.fn(), generateReport: jest.fn().mockResolvedValue('{}'), getRecentErrors: jest.fn().mockResolvedValue([]), generateGitHubURL: jest.fn().mockReturnValue('https://github.com') }))
jest.mock('../../lib/interactions', () => ({ log: jest.fn(), recent: jest.fn().mockResolvedValue([]) }))
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))

const chicken = createFoodEntry({ id: 'f1', name: 'Chicken Breast', calories: 165, protein: 31, carbs: 0, fat: 3.6 })
const rice = createFoodEntry({ id: 'f2', name: 'Brown Rice', calories: 216, protein: 5, carbs: 45, fat: 1.8 })

const logs: DailyLog[] = [
  createDailyLog({ id: 'dl1', food_entry_id: 'f1', meal: 'lunch', servings: 1, food: chicken }),
  createDailyLog({ id: 'dl2', food_entry_id: 'f2', meal: 'dinner', servings: 1, food: rice }),
]

const targets = createMacroTargets({ calories: 2000, protein: 150, carbs: 250, fat: 65 })

const mockGetDailyLogs = jest.fn().mockResolvedValue(logs)
const mockGetDailySummary = jest.fn().mockResolvedValue({ calories: 381, protein: 36, carbs: 45, fat: 5.4 })
const mockGetMacroTargets = jest.fn().mockResolvedValue(targets)
const mockDeleteDailyLog = jest.fn().mockResolvedValue(undefined)
const mockAddDailyLog = jest.fn().mockResolvedValue(undefined)
const mockAddFoodEntry = jest.fn().mockResolvedValue(chicken)
const mockGetFavoriteFoods = jest.fn().mockResolvedValue([])

jest.mock('../../lib/db', () => ({
  getDailyLogs: (...args: unknown[]) => mockGetDailyLogs(...args),
  getDailySummary: (...args: unknown[]) => mockGetDailySummary(...args),
  getMacroTargets: (...args: unknown[]) => mockGetMacroTargets(...args),
  deleteDailyLog: (...args: unknown[]) => mockDeleteDailyLog(...args),
  addDailyLog: (...args: unknown[]) => mockAddDailyLog(...args),
  addFoodEntry: (...args: unknown[]) => mockAddFoodEntry(...args),
  getFavoriteFoods: (...args: unknown[]) => mockGetFavoriteFoods(...args),
}))

jest.mock('../../components/InlineFoodSearch', () => {
  const RealReact = require('react')
  return {
    __esModule: true,
    default: () => {
      const { View, Text } = require('react-native')
      return RealReact.createElement(View, { testID: 'inline-food-search' },
        RealReact.createElement(Text, {}, 'Inline Food Search')
      )
    },
  }
})

import Nutrition from '../../app/(tabs)/nutrition'

const { router: mockGlobalRouter } = require('expo-router')

describe('Nutrition Tracking Acceptance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetIds()
    mockGetDailyLogs.mockResolvedValue(logs)
    mockGetDailySummary.mockResolvedValue({ calories: 381, protein: 36, carbs: 45, fat: 5.4 })
    mockGetMacroTargets.mockResolvedValue(targets)
  })

  it('shows macro summary with targets', async () => {
    const { findByText } = renderScreen(<Nutrition />)

    expect(await findByText('Calories')).toBeTruthy()
    expect(await findByText('Protein')).toBeTruthy()
    expect(await findByText('Carbs')).toBeTruthy()
    expect(await findByText('Fat')).toBeTruthy()
    expect(await findByText(/2000/)).toBeTruthy()
    expect(await findByText(/150/)).toBeTruthy()
  })

  it('shows food entries grouped by meal', async () => {
    const { findByText } = renderScreen(<Nutrition />)

    expect(await findByText('Lunch')).toBeTruthy()
    expect(await findByText('Chicken Breast')).toBeTruthy()
    expect(await findByText('Dinner')).toBeTruthy()
    expect(await findByText('Brown Rice')).toBeTruthy()
  })

  it('navigates to edit targets on link press', async () => {
    const { findByLabelText } = renderScreen(<Nutrition />)

    const link = await findByLabelText('Edit macro targets')
    fireEvent.press(link)

    expect(mockGlobalRouter.push).toHaveBeenCalledWith('/nutrition/targets')
  })

  it('deletes a food entry', async () => {
    const { findByLabelText } = renderScreen(<Nutrition />)

    const removeBtn = await findByLabelText('Remove Chicken Breast')
    fireEvent.press(removeBtn)

    await waitFor(() => {
      expect(mockDeleteDailyLog).toHaveBeenCalledWith('dl1')
    })
  })

  it('shows empty state when no food logged', async () => {
    mockGetDailyLogs.mockResolvedValue([])

    const { findByText } = renderScreen(<Nutrition />)

    expect(await findByText(/No food logged yet\./)).toBeTruthy()
    expect(await findByText(/Tap \+ to add your first meal\./)).toBeTruthy()
  })

  it('toggles inline search card via FAB', async () => {
    const { findByLabelText, queryByTestId } = renderScreen(<Nutrition />)

    const fab = await findByLabelText('Add food')
    expect(queryByTestId('inline-food-search')).toBeNull()

    fireEvent.press(fab)
    await waitFor(() => {
      expect(queryByTestId('inline-food-search')).toBeTruthy()
    })
  })

  it('shows Today label for current date', async () => {
    const { findByText } = renderScreen(<Nutrition />)
    expect(await findByText('Today')).toBeTruthy()
  })
})
