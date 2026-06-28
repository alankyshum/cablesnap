/**
 * BLD-2076 — Wide-screen Masonry render test: BodySegment (Progress tab)
 * Asserts `body-segment-masonry` testID renders when atLeastMedium:true.
 */

import React from 'react'
import { waitFor } from '@testing-library/react-native'
import { renderScreen } from '../../helpers/render'

jest.mock('expo-router', () => {
  const RealReact = require('react')
  return {
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
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (c: unknown) => c },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => false,
    withTiming: (v: unknown) => v,
    cancelAnimation: () => {},
    createAnimatedComponent: (c: unknown) => c,
    Easing: { bezier: () => (t: number) => t, out: () => (t: number) => t },
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
jest.mock('@/components/ui/fab', () => ({
  FAB: 'FAB',
}))
jest.mock('@/components/ui/bna-toast', () => ({
  ToastProvider: ({ children }: { children: unknown }) => children,
  useToast: () => ({
    toast: jest.fn(), success: jest.fn(), error: jest.fn(),
    warning: jest.fn(), info: jest.fn(), dismiss: jest.fn(), dismissAll: jest.fn(),
  }),
}))

// Stub BodyCards children — test only verifies the Masonry container mounts
jest.mock('@/components/progress/BodyCards', () => ({
  WeightCard: () => null,
  GoalsCard: () => null,
  ChartCard: () => null,
  SingleEntryCard: () => null,
  MeasurementsCard: () => null,
  ProgressPhotosCard: () => null,
}))
jest.mock('@/components/progress/WeightLogModal', () => 'WeightLogModal')

// Body data — return at least 1 weight entry so BodySegment renders full UI
jest.mock('@/lib/db', () => ({
  getBodySettings: jest.fn().mockResolvedValue({
    weight_unit: 'kg', height_cm: 175, weight_goal: null, body_fat_goal: null,
  }),
  getLatestBodyWeight: jest.fn().mockResolvedValue({
    id: 'bw1', weight: 80, date: '2026-06-01', notes: null,
  }),
  getPreviousBodyWeight: jest.fn().mockResolvedValue(null),
  getBodyWeightEntries: jest.fn().mockResolvedValue([
    { id: 'bw1', weight: 80, date: '2026-06-01', notes: null },
  ]),
  getBodyWeightCount: jest.fn().mockResolvedValue(1),
  getBodyWeightChartData: jest.fn().mockResolvedValue([
    { date: '2026-06-01', weight: 80 },
    { date: '2026-06-10', weight: 79.5 },
  ]),
  getLatestMeasurements: jest.fn().mockResolvedValue(null),
  upsertBodyWeight: jest.fn().mockResolvedValue(undefined),
  deleteBodyWeight: jest.fn().mockResolvedValue(undefined),
  updateBodySettings: jest.fn().mockResolvedValue(undefined),
}))

import BodySegment from '../../../components/progress/BodySegment'

describe('Wide-screen Masonry: BodySegment — body-segment-masonry testID (BLD-2076)', () => {
  it('renders body-segment-masonry on medium (wide) screen', async () => {
    const { getByTestId } = renderScreen(<BodySegment />)

    await waitFor(() => {
      expect(getByTestId('body-segment-masonry')).toBeTruthy()
    })
  })
})
