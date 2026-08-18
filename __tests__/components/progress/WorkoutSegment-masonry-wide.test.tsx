/**
 * BLD-2076 — Wide-screen Masonry render test: WorkoutSegment (Progress tab)
 * Exercises the expanded (3-col) path — atLeastMedium:true + expanded:true.
 * Asserts `workout-progress-masonry` testID renders.
 */

import React from 'react'
import { render, waitFor } from '@testing-library/react-native'

jest.mock('expo-router', () => {
  const RealReact = require('react')
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
    useLocalSearchParams: () => ({}),
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
jest.mock('expo-localization', () => ({
  getCalendars: () => [{ firstWeekday: 1 }],
}))
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (c: unknown) => c },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => false,
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    withDelay: (_d: unknown, v: unknown) => v,
    cancelAnimation: () => {},
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    Easing: { out: () => {}, bezier: () => {} },
    createAnimatedComponent: (c: unknown) => c,
  }
})
// Force expanded (3-col) layout — exercises the 3-column Masonry path
jest.mock('@/lib/layout', () => ({
  useLayout: () => ({
    wide: true,
    width: 1200,
    scale: 1.1,
    windowClass: 'expanded' as const,
    compact: false,
    medium: false,
    expanded: true,
    atLeastMedium: true,
    horizontalPadding: 32,
  }),
}))

jest.mock('@/components/FloatingTabBar', () => ({
  useFloatingTabBarHeight: () => 80,
}))

jest.mock('@/hooks/useThemeColors', () => {
  const { lightMockColors } = require('../../helpers/theme')
  return { useThemeColors: () => lightMockColors }
})

jest.mock('@/lib/errors', () => ({ logError: jest.fn() }))
jest.mock('@/lib/interactions', () => ({ log: jest.fn() }))

// Stub heavy child components to keep test focused on the Masonry branch
jest.mock('@/components/progress/WorkoutCards', () => ({
  WorkoutChartCard: 'WorkoutChartCard',
  SessionsByGymCard: 'SessionsByGymCard',
  SessionsCard: 'SessionsCard',
}))
jest.mock('@/components/progress/PRSummaryCard', () => ({
  PRSummaryCard: 'PRSummaryCard',
}))
jest.mock('@/components/progress/TrendCards', () => ({
  RPETrendCard: 'RPETrendCard',
  RatingTrendCard: 'RatingTrendCard',
}))
jest.mock('@/components/progress/StrengthLevelsCard', () => 'StrengthLevelsCard')
jest.mock('@/components/progress/ActiveGoalsCard', () => 'ActiveGoalsCard')
jest.mock('@/components/progress/WorkoutEmptyState', () => 'WorkoutEmptyState')
jest.mock('@/components/progress/CalendarView', () => 'CalendarView')
jest.mock('@/components/WeeklySummary', () => 'WeeklySummary')

jest.mock('@/lib/db/pr-dashboard', () => ({
  getPRStats: jest.fn().mockResolvedValue({ totalPRs: 0, prsThisMonth: 0 }),
  getRecentPRsWithDelta: jest.fn().mockResolvedValue([]),
}))

jest.mock('@/lib/db', () => ({
  getWeeklySessionCounts: jest.fn().mockResolvedValue([
    { week: '2026-W26', count: 4 },
    { week: '2026-W25', count: 3 },
  ]),
  getWeeklyVolume: jest.fn().mockResolvedValue([
    { week: '2026-W26', volume: 5000 },
    { week: '2026-W25', volume: 4500 },
  ]),
  getCompletedSessionsWithSetCount: jest.fn().mockResolvedValue([
    { id: 's1', name: 'Push Day', started_at: Date.now(), duration_seconds: 3600, set_count: 5 },
    { id: 's2', name: 'Pull Day', started_at: Date.now() - 86400000, duration_seconds: 2400, set_count: 6 },
  ]),
  getBodySettings: jest.fn().mockResolvedValue({ weight_unit: 'kg' }),
  getActiveGymCount: jest.fn().mockResolvedValue(0),
  getGymProfiles: jest.fn().mockResolvedValue([]),
  getSessionsByGym: jest.fn().mockResolvedValue([]),
}))

import WorkoutSegment from '@/components/progress/WorkoutSegment'

describe('Wide-screen Masonry: WorkoutSegment — workout-progress-masonry testID, expanded 3-col (BLD-2076)', () => {
  it('renders workout-progress-masonry on expanded (3-col) wide screen', async () => {
    const { getByTestId } = render(<WorkoutSegment />)

    await waitFor(() => {
      expect(getByTestId('workout-progress-masonry')).toBeTruthy()
    })
  })
})
