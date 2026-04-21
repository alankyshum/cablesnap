import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../../helpers/render'
import { createBodySettings, resetIds } from '../../helpers/factories'

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() }

jest.mock('expo-router', () => {
  const RealReact = require('react')
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => ({}),
    usePathname: () => '/test',
    useFocusEffect: (cb: () => (() => void) | void) => {
      RealReact.useEffect(() => {
        const cleanup = cb()
        return typeof cleanup === 'function' ? cleanup : undefined
      }, [cb])
    },
    Stack: { Screen: () => null },
    Redirect: () => null,
  }
})

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')
jest.mock('../../../lib/layout', () => ({
  useLayout: () => ({
    wide: false,
    width: 375,
    scale: 1.0,
    windowClass: 'compact' as const,
    compact: true,
    medium: false,
    expanded: false,
    atLeastMedium: false,
    horizontalPadding: 16,
  }),
}))
jest.mock('../../../lib/errors', () => ({ logError: jest.fn() }))
jest.mock('../../../lib/interactions', () => ({ log: jest.fn() }))
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))
jest.mock('victory-native', () => ({ CartesianChart: 'CartesianChart', Line: 'Line', Bar: 'Bar' }))
jest.mock('../../../components/MuscleVolumeSegment', () => 'MuscleVolumeSegment')
jest.mock('react-native-reanimated', () => {
  const { View: RNView } = require('react-native')
  return {
    __esModule: true,
    default: {
      View: RNView,
      Text: require('react-native').Text,
      createAnimatedComponent: (c: unknown) => c,
    },
    useSharedValue: (v: number) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: number) => v,
    withSpring: (v: number) => v,
    withSequence: (...args: number[]) => args[args.length - 1],
    withDelay: (_d: number, v: number) => v,
    useReducedMotion: () => false,
    Easing: { bezier: () => (t: number) => t },
  }
})

const mockSettings = createBodySettings({
  weight_unit: 'kg',
  measurement_unit: 'cm',
  weight_goal: 70,
  body_fat_goal: 15,
})

const mockMonthlyData = {
  workouts: {
    sessionCount: 16,
    totalDurationSeconds: 66600,
    totalVolume: 42350,
    previousMonthVolume: 37500,
    previousMonthSessionCount: 13,
  },
  prs: [
    { exerciseId: 'ex1', exerciseName: 'Bench Press', weight: 100 },
    { exerciseId: 'ex2', exerciseName: 'Squat', weight: 140 },
  ],
  trainingDays: 22,
  longestStreak: 5,
  muscleDistribution: [
    { muscle: 'chest', sets: 18 },
    { muscle: 'back', sets: 22 },
  ],
  mostImproved: { exerciseId: 'ex3', exerciseName: 'Overhead Press', percentChange: 8 },
  body: { startWeight: 82.0, endWeight: 81.5 },
  nutrition: { daysTracked: 26, daysOnTarget: 18 },
}

jest.mock('../../../lib/db/body', () => ({
  getBodySettings: jest.fn().mockResolvedValue({ unit: 'kg', height_cm: 175 }),
  getLatestBodyWeight: jest.fn().mockResolvedValue(null),
  getPreviousBodyWeight: jest.fn().mockResolvedValue(null),
  getBodyWeightEntries: jest.fn().mockResolvedValue([]),
  getBodyWeightCount: jest.fn().mockResolvedValue(0),
  getBodyWeightChartData: jest.fn().mockResolvedValue([]),
  getLatestMeasurements: jest.fn().mockResolvedValue(null),
  upsertBodyWeight: jest.fn().mockResolvedValue(undefined),
  deleteBodyWeight: jest.fn().mockResolvedValue(undefined),
  updateBodySettings: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../../../lib/db/calendar', () => ({
  getCalendarDays: jest.fn().mockResolvedValue([]),
  getCalendarDayDetail: jest.fn().mockResolvedValue(null),
  getActiveProgram: jest.fn().mockResolvedValue(null),
}))
jest.mock('../../../lib/db', () => ({
  getWeeklySessionCounts: jest.fn().mockResolvedValue([]),
  getWeeklyVolume: jest.fn().mockResolvedValue([]),
  getPersonalRecords: jest.fn().mockResolvedValue([]),
  getCompletedSessionsWithSetCount: jest.fn().mockResolvedValue([]),
  getBodySettings: jest.fn().mockResolvedValue(mockSettings),
  getLatestBodyWeight: jest.fn().mockResolvedValue(null),
  getPreviousBodyWeight: jest.fn().mockResolvedValue(null),
  getBodyWeightEntries: jest.fn().mockResolvedValue([]),
  getBodyWeightCount: jest.fn().mockResolvedValue(0),
  getBodyWeightChartData: jest.fn().mockResolvedValue([]),
  getLatestMeasurements: jest.fn().mockResolvedValue(null),
  upsertBodyWeight: jest.fn().mockResolvedValue(undefined),
  deleteBodyWeight: jest.fn().mockResolvedValue(undefined),
  updateBodySettings: jest.fn().mockResolvedValue(undefined),
  getWeeklySummary: jest.fn().mockResolvedValue({
    workouts: { sessionCount: 0, totalDurationSeconds: 0, totalVolume: 0, previousWeekVolume: null, previousWeekSessionCount: null, hasBodyweightOnly: false, scheduledCount: null },
    prs: [], nutrition: null, body: null, streak: 0,
  }),
  getMonthlyReport: jest.fn().mockResolvedValue(mockMonthlyData),
}))

jest.mock('../../../lib/units', () => ({
  toDisplay: (v: number) => v,
  toKg: (v: number) => v,
  KG_TO_LB: 2.20462,
  LB_TO_KG: 0.453592,
}))

import Progress from '../../../app/(tabs)/progress'

const mockDb = require('../../../lib/db') as Record<string, jest.Mock>

describe('Monthly Report Segment', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetIds()
    mockDb.getMonthlyReport.mockResolvedValue(mockMonthlyData)
    mockDb.getBodySettings.mockResolvedValue(mockSettings)
  })

  it('renders monthly report with key stats when selecting Monthly tab', async () => {
    const utils = renderScreen(<Progress />)
    fireEvent.press(utils.getByText('Monthly'))
    await waitFor(() => {
      expect(utils.getAllByText('16').length).toBeGreaterThan(0)
    })
    expect(utils.getByText('Bench Press')).toBeTruthy()
  })

  it('shows empty state when fewer than 2 sessions', async () => {
    mockDb.getMonthlyReport.mockResolvedValue({
      ...mockMonthlyData,
      workouts: { ...mockMonthlyData.workouts, sessionCount: 1, totalVolume: 0, totalDurationSeconds: 0, previousMonthVolume: null, previousMonthSessionCount: null },
      prs: [],
      trainingDays: 1,
      longestStreak: 1,
      muscleDistribution: [],
      mostImproved: null,
      body: null,
      nutrition: null,
    })
    const utils = renderScreen(<Progress />)
    fireEvent.press(utils.getByText('Monthly'))
    await waitFor(() => {
      expect(utils.getByText('Just getting started!')).toBeTruthy()
    })
  })

  it('hides PR section when no PRs in month', async () => {
    mockDb.getMonthlyReport.mockResolvedValue({
      ...mockMonthlyData,
      prs: [],
    })
    const utils = renderScreen(<Progress />)
    fireEvent.press(utils.getByText('Monthly'))
    await waitFor(() => {
      expect(utils.getAllByText('16').length).toBeGreaterThan(0)
    })
    expect(utils.queryByText('PRs This Month')).toBeNull()
  })

  it('navigates between months', async () => {
    const utils = renderScreen(<Progress />)
    fireEvent.press(utils.getByText('Monthly'))
    await waitFor(() => {
      expect(utils.getAllByText('16').length).toBeGreaterThan(0)
    })
    const prevBtn = utils.getByLabelText('Previous month')
    fireEvent.press(prevBtn)
    await waitFor(() => {
      expect(mockDb.getMonthlyReport).toHaveBeenCalledTimes(2)
    })
  })
})
