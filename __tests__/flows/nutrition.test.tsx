jest.setTimeout(10000)

import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import { createFoodEntry, createDailyLog, createMacroTargets, resetIds } from '../helpers/factories'
import type { DailyLog, FoodEntry, MacroTargets } from '../../lib/types'

// --- Mock data ---

const chicken = createFoodEntry({ id: 'food-1', name: 'Chicken Breast', calories: 165, protein: 31, carbs: 0, fat: 3.6 })
const rice = createFoodEntry({ id: 'food-2', name: 'Brown Rice', calories: 215, protein: 5, carbs: 45, fat: 1.8 })
const egg = createFoodEntry({ id: 'food-3', name: 'Eggs', calories: 155, protein: 13, carbs: 1, fat: 11, is_favorite: true })

const logs: DailyLog[] = [
  createDailyLog({ id: 'log-1', food_entry_id: 'food-1', meal: 'lunch', servings: 1, food: chicken }),
  createDailyLog({ id: 'log-2', food_entry_id: 'food-2', meal: 'lunch', servings: 1, food: rice }),
  createDailyLog({ id: 'log-3', food_entry_id: 'food-3', meal: 'breakfast', servings: 2, food: egg }),
]

const targets = createMacroTargets({ calories: 2000, protein: 150, carbs: 250, fat: 65 })
const summary = { calories: 535, protein: 49, carbs: 46, fat: 16.4 }

// --- Mocks ---

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() }

jest.mock('expo-router', () => {
  const RealReact = require('react')
  return {
    router: { push: (...args: unknown[]) => mockRouter.push(...args) },
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
jest.mock('../../lib/layout', () => ({
  useLayout: () => ({ wide: false, width: 375, scale: 1.0 }),
}))
jest.mock('../../lib/errors', () => ({
  logError: jest.fn(),
  generateReport: jest.fn().mockResolvedValue('{}'),
  getRecentErrors: jest.fn().mockResolvedValue([]),
  generateGitHubURL: jest.fn().mockReturnValue('https://github.com'),
}))
jest.mock('../../lib/interactions', () => ({
  log: jest.fn(),
  recent: jest.fn().mockResolvedValue([]),
}))
jest.mock('expo-file-system', () => ({
  File: jest.fn(),
  Paths: { cache: '/cache' },
}))
jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn(),
}))

const mockGetLogs = jest.fn<Promise<DailyLog[]>, [string]>().mockResolvedValue(logs)
const mockGetSummary = jest.fn().mockResolvedValue(summary)
const mockGetTargets = jest.fn<Promise<MacroTargets | null>, []>().mockResolvedValue(targets)
const mockDeleteLog = jest.fn().mockResolvedValue(undefined)
const mockAddLog = jest.fn().mockResolvedValue(undefined)
const mockAddEntry = jest.fn<Promise<FoodEntry>, [string, number, number, number, number, string, boolean]>().mockResolvedValue(chicken)
const mockGetFavorites = jest.fn<Promise<FoodEntry[]>, []>().mockResolvedValue([])

jest.mock('../../lib/db', () => ({
  getDailyLogs: (...args: unknown[]) => mockGetLogs(...(args as [string])),
  getDailySummary: (...args: unknown[]) => mockGetSummary(...args),
  getMacroTargets: (...args: unknown[]) => mockGetTargets(...(args as [])),
  deleteDailyLog: (...args: unknown[]) => mockDeleteLog(...args),
  addDailyLog: (...args: unknown[]) => mockAddLog(...args),
  addFoodEntry: (...args: unknown[]) => mockAddEntry(...(args as [string, number, number, number, number, string, boolean])),
  getFavoriteFoods: (...args: unknown[]) => mockGetFavorites(...(args as [])),
}))

import Nutrition from '../../app/(tabs)/nutrition'

// --- Tests ---

describe('Nutrition Logging', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetIds()
    mockGetLogs.mockResolvedValue(logs)
    mockGetSummary.mockResolvedValue(summary)
    mockGetTargets.mockResolvedValue(targets)
    mockGetFavorites.mockResolvedValue([])
  })

  it('renders macro summary with calorie values', async () => {
    const { findByText } = renderScreen(<Nutrition />)
    // Should show macro labels
    expect(await findByText('Calories')).toBeTruthy()
    expect(await findByText('Protein')).toBeTruthy()
    expect(await findByText('Carbs')).toBeTruthy()
    expect(await findByText('Fat')).toBeTruthy()
  })

  it('displays target ratios for each macro', async () => {
    const { findByText } = renderScreen(<Nutrition />)
    // The format is "value / target" with optional unit
    expect(await findByText('535 / 2000')).toBeTruthy()
    expect(await findByText('49g / 150g')).toBeTruthy()
    expect(await findByText('46g / 250g')).toBeTruthy()
    expect(await findByText('16g / 65g')).toBeTruthy()
  })

  it('shows food log entries', async () => {
    const { findByText } = renderScreen(<Nutrition />)
    expect(await findByText('Chicken Breast')).toBeTruthy()
    expect(await findByText('Brown Rice')).toBeTruthy()
    expect(await findByText('Eggs')).toBeTruthy()
  })

  it('shows date label as Today', async () => {
    const { findByText } = renderScreen(<Nutrition />)
    expect(await findByText('Today')).toBeTruthy()
  })

  it('date navigation buttons have a11y labels', async () => {
    const { findByText, getByLabelText } = renderScreen(<Nutrition />)
    await findByText('Today')
    expect(getByLabelText('Previous day')).toBeTruthy()
    expect(getByLabelText('Next day')).toBeTruthy()
  })

  it('pressing previous day changes date label', async () => {
    const { findByText, getByLabelText, queryByText } = renderScreen(<Nutrition />)
    await findByText('Today')

    fireEvent.press(getByLabelText('Previous day'))

    await waitFor(() => {
      expect(queryByText('Today')).toBeNull()
    })
  })

  it('add food FAB has a11y label and navigates', async () => {
    const { findByText, getByLabelText } = renderScreen(<Nutrition />)
    await findByText('Today')
    const fab = getByLabelText('Add food')
    fireEvent.press(fab)
    expect(mockRouter.push).toHaveBeenCalledWith('/nutrition/add')
  })

  it('edit targets link has a11y label', async () => {
    const { findByLabelText } = renderScreen(<Nutrition />)
    expect(await findByLabelText('Edit macro targets')).toBeTruthy()
  })

  it('delete button has a11y label for each food', async () => {
    const { findByLabelText } = renderScreen(<Nutrition />)
    expect(await findByLabelText('Remove Chicken Breast')).toBeTruthy()
    expect(await findByLabelText('Remove Brown Rice')).toBeTruthy()
    expect(await findByLabelText('Remove Eggs')).toBeTruthy()
  })

  it('shows empty state when no logs', async () => {
    mockGetLogs.mockResolvedValue([])
    const { findByText } = renderScreen(<Nutrition />)
    expect(await findByText(/No food logged yet/)).toBeTruthy()
  })

  it('shows loading state before data loads', () => {
    // While async load() hasn't resolved, no macro card or log entries appear
    mockGetLogs.mockReturnValue(new Promise(() => {}))
    mockGetSummary.mockReturnValue(new Promise(() => {}))
    mockGetTargets.mockReturnValue(new Promise(() => {}))

    const { queryByText } = renderScreen(<Nutrition />)
    // Targets card not rendered yet (null until resolved)
    expect(queryByText('Calories')).toBeNull()
    // No food items visible
    expect(queryByText('Chicken Breast')).toBeNull()
  })

  it('shows meal section headers', async () => {
    const { findByText } = renderScreen(<Nutrition />)
    expect(await findByText('Lunch')).toBeTruthy()
    expect(await findByText('Breakfast')).toBeTruthy()
  })

  it('renders gracefully with empty data from DB', async () => {
    mockGetLogs.mockResolvedValue([])
    mockGetSummary.mockResolvedValue({ calories: 0, protein: 0, carbs: 0, fat: 0 })
    mockGetTargets.mockResolvedValue(null)

    const { findByText, queryByText } = renderScreen(<Nutrition />)
    expect(await findByText(/No food logged yet/)).toBeTruthy()
    // No macro targets card when targets is null
    expect(queryByText('Edit Targets →')).toBeNull()
  })

  it('ErrorBoundary catches render-time errors', async () => {
    const ErrorBoundary = require('../../components/ErrorBoundary').default
    const Broken = () => { throw new Error('render crash') }

    jest.spyOn(console, 'error').mockImplementation(() => {})
    const { findByText } = renderScreen(
      <ErrorBoundary><Broken /></ErrorBoundary>
    )
    expect(await findByText('Something went wrong')).toBeTruthy()
    ;(console.error as jest.Mock).mockRestore()
  })
})
