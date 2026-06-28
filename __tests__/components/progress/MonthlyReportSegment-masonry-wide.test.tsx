/**
 * BLD-2076 — Wide-screen Masonry render test: MonthlyReportSegment (Progress tab)
 * Asserts `monthly-report-masonry` testID renders when atLeastMedium:true
 * and the monthly data has >= 2 sessions (non-empty path).
 */

import React from 'react'
import { waitFor } from '@testing-library/react-native'
import { renderScreen } from '../../helpers/render'

jest.mock('expo-router', () => {
  const RealReact = require('react')
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
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
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }))
jest.mock('lucide-react-native', () => ({
  ChevronLeft: () => null,
  ChevronRight: () => null,
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
    Easing: { bezier: () => (t: number) => t },
    createAnimatedComponent: (c: unknown) => c,
  }
})

// Force medium (wide) layout — atLeastMedium: true
jest.mock('@/lib/layout', () => ({
  useLayout: () => ({
    wide: true,
    width: 768,
    scale: 1.1,
    windowClass: 'medium' as const,
    compact: false,
    medium: true,
    expanded: false,
    atLeastMedium: true,
    horizontalPadding: 24,
  }),
}))

jest.mock('@/hooks/useThemeColors', () => {
  const { lightMockColors } = require('../../helpers/theme')
  return { useThemeColors: () => lightMockColors }
})
jest.mock('@/components/FloatingTabBar', () => ({
  useFloatingTabBarHeight: () => 80,
}))
jest.mock('@/lib/units', () => ({
  toDisplay: (v: number) => v,
  toKg: (v: number) => v,
  KG_TO_LB: 2.20462,
  LB_TO_KG: 0.453592,
}))

// Stub MonthlyReportCards — focus on Masonry container mount, not card internals
jest.mock('@/components/progress/MonthlyReportCards', () => ({
  HeroStatsCard: () => null,
  ConsistencyCard: () => null,
  PRsCard: () => null,
  MuscleBalanceCard: () => null,
  MostImprovedCard: () => null,
  BodyCard: () => null,
  NutritionCard: () => null,
}))
jest.mock('@/components/share/MonthlyShareCard', () => 'MonthlyShareCard')

jest.mock('@/lib/db', () => ({
  getMonthlyReport: jest.fn().mockResolvedValue({
    workouts: {
      sessionCount: 16,
      totalDurationSeconds: 66600,
      totalVolume: 42350,
      previousMonthVolume: 37500,
      previousMonthSessionCount: 13,
    },
    prs: [
      { exerciseId: 'ex1', exerciseName: 'Bench Press', weight: 100 },
    ],
    trainingDays: 22,
    longestStreak: 5,
    muscleDistribution: [{ muscle: 'chest', sets: 18 }],
    mostImproved: null,
    body: null,
    nutrition: null,
  }),
  getBodySettings: jest.fn().mockResolvedValue({ weight_unit: 'kg' }),
}))

import MonthlyReportSegment from '../../../components/progress/MonthlyReportSegment'

describe('Wide-screen Masonry: MonthlyReportSegment — monthly-report-masonry testID (BLD-2076)', () => {
  it('renders monthly-report-masonry on medium (wide) screen with 16 sessions', async () => {
    const { getByTestId } = renderScreen(<MonthlyReportSegment />)

    await waitFor(() => {
      expect(getByTestId('monthly-report-masonry')).toBeTruthy()
    })
  })
})
