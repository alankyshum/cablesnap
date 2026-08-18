/**
 * BLD-2076 — Wide-screen Masonry render test: NutritionSegment (Progress tab)
 * Asserts `nutrition-progress-masonry` testID renders when atLeastMedium:true.
 */

import React from 'react'
import { waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'

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
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))
jest.mock('../../components/FloatingTabBar', () => ({
  useFloatingTabBarHeight: () => 80,
}))
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
    default: { View, createAnimatedComponent: (c: unknown) => c },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => false,
    withTiming: (v: unknown) => v,
    FadeInDown: { duration: () => ({ delay: () => ({}) }) },
    Easing: { out: () => {}, bezier: () => {} },
    createAnimatedComponent: (c: unknown) => c,
  }
})
// Force medium (wide) layout — atLeastMedium: true
jest.mock('../../lib/layout', () => ({
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

// Stub NutritionCards — focus on the Masonry container, not card internals
jest.mock('../../components/progress/NutritionCards', () => ({
  CalorieTrendCard: () => null,
  WeeklyAveragesCard: () => null,
  AdherenceCard: () => null,
  MacroTrendCard: () => null,
}))

// Supply enough data so the error/loading/empty branches are bypassed
jest.mock('../../lib/db', () => ({
  getDailyNutritionTotals: jest.fn().mockResolvedValue([
    { date: '2026-06-20', calories: 2000, protein: 150, carbs: 250, fat: 65 },
    { date: '2026-06-21', calories: 1900, protein: 145, carbs: 240, fat: 60 },
    { date: '2026-06-22', calories: 2100, protein: 155, carbs: 260, fat: 68 },
    { date: '2026-06-23', calories: 2050, protein: 152, carbs: 255, fat: 66 },
  ]),
  getWeeklyNutritionAverages: jest.fn().mockResolvedValue([
    {
      weekStart: '2026-06-16',
      avgCalories: 2000, avgProtein: 150, avgCarbs: 250, avgFat: 65,
      daysTracked: 5,
    },
  ]),
  getNutritionAdherence: jest.fn().mockResolvedValue({
    trackedDays: 10, onTargetDays: 8, currentStreak: 3, longestStreak: 7,
  }),
  getNutritionTargets: jest.fn().mockResolvedValue({
    id: '1', calories: 2000, protein: 150, carbs: 250, fat: 65, updated_at: Date.now(),
  }),
}))

import NutritionSegment from '../../components/progress/NutritionSegment'

describe('Wide-screen Masonry: NutritionSegment — nutrition-progress-masonry testID (BLD-2076)', () => {
  it('renders nutrition-progress-masonry on medium (wide) screen', async () => {
    const { getByTestId } = renderScreen(<NutritionSegment />)

    await waitFor(() => {
      expect(getByTestId('nutrition-progress-masonry')).toBeTruthy()
    })
  })
})
