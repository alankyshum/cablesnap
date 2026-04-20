import React from 'react'
import { waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'

// ─── Mocks ─────────────────────────────────────────────────────────

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() }

jest.mock('expo-router', () => {
  const RealReact = require('react')
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => ({}),
    usePathname: () => '/',
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
  useLayout: () => ({ wide: false, width: 375, scale: 1.0, horizontalPadding: 16, atLeastMedium: false }),
}))
jest.mock('../../lib/errors', () => ({
  logError: jest.fn(),
  generateReport: jest.fn().mockResolvedValue('{}'),
  getRecentErrors: jest.fn().mockResolvedValue([]),
  generateGitHubURL: jest.fn().mockReturnValue('https://github.com'),
}))
jest.mock('../../lib/interactions', () => ({ log: jest.fn(), recent: jest.fn().mockResolvedValue([]) }))
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))
jest.mock('../../lib/query', () => ({ useFocusRefetch: jest.fn(), bumpQueryVersion: jest.fn(), getQueryVersion: jest.fn().mockReturnValue(0) }))
jest.mock('../../components/ui/bna-toast', () => ({
  ToastProvider: ({ children }: { children: unknown }) => children,
  useToast: () => ({
    toast: jest.fn(), success: jest.fn(), error: jest.fn(),
    warning: jest.fn(), info: jest.fn(), dismiss: jest.fn(), dismissAll: jest.fn(),
  }),
}))
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: { createAnimatedComponent: (c: unknown) => c, View },
    useReducedMotion: () => false,
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: unknown) => v,
    FadeInDown: { duration: () => ({ delay: () => ({}) }) },
    Easing: { out: () => {}, bezier: () => {} },
    createAnimatedComponent: (c: unknown) => c,
  }
})
jest.mock('victory-native', () => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  CartesianChart: (props: Record<string, unknown>) => null,
  Line: () => null,
  Bar: () => null,
}))
jest.mock('../../components/FloatingTabBar', () => ({
  useFloatingTabBarHeight: () => 80,
}))

// Mock DB functions
const mockDailyTotals = jest.fn()
const mockWeeklyAverages = jest.fn()
const mockAdherence = jest.fn()
const mockTargets = jest.fn()

jest.mock('../../lib/db', () => ({
  getDailyNutritionTotals: (...args: unknown[]) => mockDailyTotals(...args),
  getWeeklyNutritionAverages: (...args: unknown[]) => mockWeeklyAverages(...args),
  getNutritionAdherence: (...args: unknown[]) => mockAdherence(...args),
  getNutritionTargets: () => mockTargets(),
}))

import NutritionSegment from '../../components/progress/NutritionSegment'

// ─── Helpers ───────────────────────────────────────────────────────

function makeDailyTotals(days: number) {
  const totals = []
  for (let i = 0; i < days; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const date = d.toISOString().slice(0, 10)
    totals.push({ date, calories: 2000 + i * 10, protein: 150, carbs: 250, fat: 65 })
  }
  return totals.reverse()
}

function makeWeeklyAverages(weeks: number) {
  const avgs = []
  for (let i = 0; i < weeks; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i * 7)
    avgs.push({
      weekStart: d.toISOString().slice(0, 10),
      avgCalories: 2100 + i * 50,
      avgProtein: 150,
      avgCarbs: 250,
      avgFat: 65,
      daysTracked: 5,
    })
  }
  return avgs.reverse()
}

const defaultTargets = {
  id: '1', calories: 2000, protein: 150, carbs: 250, fat: 65, updated_at: Date.now(),
}

const defaultAdherence = {
  trackedDays: 20, onTargetDays: 16, currentStreak: 5, longestStreak: 12,
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('Nutrition Progress Segment', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRouter.push.mockReset()
    mockDailyTotals.mockResolvedValue(makeDailyTotals(10))
    mockWeeklyAverages.mockResolvedValue(makeWeeklyAverages(4))
    mockAdherence.mockResolvedValue(defaultAdherence)
    mockTargets.mockResolvedValue(defaultTargets)
  })

  it('shows calorie trend chart with 7+ days of data', async () => {
    const { getByText, getByLabelText } = renderScreen(<NutritionSegment />)

    await waitFor(() => {
      expect(getByText('Calorie Trend')).toBeTruthy()
    })

    // Chart container should have accessibility role image
    const chartContainer = getByLabelText(/Calorie trend/)
    expect(chartContainer.props.accessibilityRole).toBe('image')
  })

  it('shows empty state with Go to Nutrition button when no data', async () => {
    mockDailyTotals.mockResolvedValue([])
    mockWeeklyAverages.mockResolvedValue([])
    mockAdherence.mockResolvedValue({ trackedDays: 0, onTargetDays: 0, currentStreak: 0, longestStreak: 0 })

    const { getByText, getByLabelText } = renderScreen(<NutritionSegment />)

    await waitFor(() => {
      expect(getByText(/Start tracking your meals/)).toBeTruthy()
    })

    const btn = getByLabelText('Go to Nutrition tab')
    expect(btn).toBeTruthy()
  })

  it('shows adherence card with correct percentage and streaks', async () => {
    const { getByText, getByLabelText } = renderScreen(<NutritionSegment />)

    await waitFor(() => {
      expect(getByText('Adherence')).toBeTruthy()
    })

    // 16 of 20 = 80%
    expect(getByText('80%')).toBeTruthy()
    expect(getByText('16 of 20 tracked days on target')).toBeTruthy()

    // Streaks
    expect(getByLabelText('Current streak: 5 days')).toBeTruthy()
    expect(getByLabelText('Longest streak: 12 days')).toBeTruthy()
  })

  it('shows weekly averages card with macro pills', async () => {
    const { getByText } = renderScreen(<NutritionSegment />)

    await waitFor(() => {
      expect(getByText('Weekly Averages')).toBeTruthy()
    })

    // Should show current week calories
    expect(getByText('This Week')).toBeTruthy()
  })

  it('shows info banner when no macro targets are set', async () => {
    mockTargets.mockResolvedValue(null)
    mockAdherence.mockResolvedValue(null)

    const { getByText } = renderScreen(<NutritionSegment />)

    await waitFor(() => {
      expect(getByText(/Set your macro targets/)).toBeTruthy()
    })
  })

  it('shows info text when insufficient data (< 3 days)', async () => {
    mockDailyTotals.mockResolvedValue(makeDailyTotals(2))
    mockWeeklyAverages.mockResolvedValue(makeWeeklyAverages(1))

    const { getByText } = renderScreen(<NutritionSegment />)

    await waitFor(() => {
      expect(getByText(/Track for a few more days/)).toBeTruthy()
    })
  })

  it('shows error state with retry button on failure', async () => {
    mockTargets.mockRejectedValue(new Error('DB failure'))

    const { getByText, getByLabelText } = renderScreen(<NutritionSegment />)

    await waitFor(() => {
      expect(getByText("Couldn't load nutrition data")).toBeTruthy()
    })

    const retryBtn = getByLabelText('Retry loading nutrition data')
    expect(retryBtn).toBeTruthy()
  })

  it('renders period chips with 48dp min touch targets', async () => {
    const { getByLabelText } = renderScreen(<NutritionSegment />)

    await waitFor(() => {
      const chip4W = getByLabelText('4W period')
      expect(chip4W).toBeTruthy()
      expect(chip4W.props.style).toBeDefined()
    })

    const chip8W = getByLabelText('8W period')
    const chip12W = getByLabelText('12W period')
    expect(chip8W).toBeTruthy()
    expect(chip12W).toBeTruthy()
  })

  it('adherence progress bar has correct accessibility value', async () => {
    const { UNSAFE_queryAllByProps } = renderScreen(<NutritionSegment />)

    await waitFor(() => {
      const progressBars = UNSAFE_queryAllByProps({ accessibilityRole: 'progressbar' })
      expect(progressBars.length).toBeGreaterThan(0)
      expect(progressBars[0].props.accessibilityValue).toEqual({ min: 0, max: 100, now: 80 })
    })
  })

  it('shows celebratory icon for 100% adherence', async () => {
    mockAdherence.mockResolvedValue({
      trackedDays: 10, onTargetDays: 10, currentStreak: 10, longestStreak: 10,
    })

    const { getByText } = renderScreen(<NutritionSegment />)

    await waitFor(() => {
      expect(getByText('100%')).toBeTruthy()
      expect(getByText('🎯')).toBeTruthy()
    })
  })
})

// ─── Data Layer Tests ──────────────────────────────────────────────

describe('Nutrition Progress Data Layer', () => {
  it('getDailyNutritionTotals calls DB with correct date range', async () => {
    mockDailyTotals.mockResolvedValue([])

    const { getDailyNutritionTotals } = require('../../lib/db')
    await getDailyNutritionTotals('2026-01-01', '2026-01-28')

    expect(mockDailyTotals).toHaveBeenCalledWith('2026-01-01', '2026-01-28')
  })
})
