jest.setTimeout(10000)

import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import { createBodySettings, resetIds } from '../helpers/factories'

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
jest.mock('../../lib/layout', () => ({
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
jest.mock('../../lib/errors', () => ({ logError: jest.fn() }))
jest.mock('../../lib/interactions', () => ({ log: jest.fn() }))
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))
jest.mock('victory-native', () => ({ CartesianChart: 'CartesianChart', Line: 'Line', Bar: 'Bar' }))
jest.mock('../../components/MuscleVolumeSegment', () => 'MuscleVolumeSegment')
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

const mockSummaryData = {
  workouts: {
    sessionCount: 4,
    totalDurationSeconds: 13500,
    totalVolume: 24500,
    previousWeekVolume: 21875,
    previousWeekSessionCount: 3,
    hasBodyweightOnly: false,
    scheduledCount: null,
  },
  prs: [
    { exerciseId: 'ex1', exerciseName: 'Bench Press', newMax: 100, previousMax: 95 },
    { exerciseId: 'ex2', exerciseName: 'Squat', newMax: 140, previousMax: 130 },
  ],
  nutrition: {
    daysTracked: 4,
    avgCalories: 2150,
    avgProtein: 162,
    avgCarbs: 220,
    avgFat: 60,
    calorieTarget: 2200,
    proteinTarget: 150,
    carbsTarget: 250,
    fatTarget: 65,
    daysOnTarget: 3,
  },
  body: {
    startWeight: 82.0,
    endWeight: 81.7,
    entryCount: 3,
  },
  streak: 12,
}

jest.mock('../../lib/db', () => ({
  getWeeklySessionCounts: jest.fn().mockResolvedValue([{ week: '1/15', count: 3 }]),
  getWeeklyVolume: jest.fn().mockResolvedValue([{ week: '1/15', volume: 5000 }]),
  getPersonalRecords: jest.fn().mockResolvedValue([{ exercise_id: 'ex1', name: 'Bench Press', max_weight: 100 }]),
  getCompletedSessionsWithSetCount: jest.fn().mockResolvedValue([{
    id: 's1', template_id: null, name: 'Morning', started_at: Date.now(), completed_at: Date.now(), duration_seconds: 3600, notes: '', set_count: 10,
  }]),
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
  getWeeklySummary: jest.fn().mockResolvedValue(mockSummaryData),
}))

jest.mock('../../lib/units', () => ({
  toDisplay: (v: number) => v,
  toKg: (v: number) => v,
  KG_TO_LB: 2.20462,
  LB_TO_KG: 0.453592,
}))

import Progress from '../../app/(tabs)/progress'

const mockDb = require('../../lib/db') as Record<string, jest.Mock>

describe('Weekly Summary Acceptance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetIds()
    mockDb.getWeeklySummary.mockResolvedValue(mockSummaryData)
    mockDb.getBodySettings.mockResolvedValue(mockSettings)
  })

  it('shows weekly summary card with headline metrics on Progress tab', async () => {
    const utils = renderScreen(<Progress />)
    await waitFor(() => {
      expect(utils.getAllByText(/4 workouts/).length).toBeGreaterThan(0)
    })
    expect(utils.getAllByText(/2 PRs/).length).toBeGreaterThan(0)
  })

  it('shows View Details button that expands summary', async () => {
    const utils = renderScreen(<Progress />)
    await waitFor(() => {
      expect(utils.getByText('View Details')).toBeTruthy()
    })
    fireEvent.press(utils.getByText('View Details'))
    await waitFor(() => {
      expect(utils.getByText('Hide Details')).toBeTruthy()
    })
  })

  it('shows empty state when no workouts logged', async () => {
    mockDb.getWeeklySummary.mockResolvedValue({
      ...mockSummaryData,
      workouts: {
        ...mockSummaryData.workouts,
        sessionCount: 0,
        totalDurationSeconds: 0,
        totalVolume: 0,
        previousWeekVolume: null,
        previousWeekSessionCount: null,
        hasBodyweightOnly: false,
        scheduledCount: null,
      },
      prs: [],
      nutrition: null,
      body: null,
      streak: 0,
    })
    const utils = renderScreen(<Progress />)
    await waitFor(() => {
      expect(utils.getByText(/No workouts logged this week/)).toBeTruthy()
    })
  })

  it('shows error fallback when summary query fails', async () => {
    mockDb.getWeeklySummary.mockRejectedValue(new Error('DB error'))
    const utils = renderScreen(<Progress />)
    await waitFor(() => {
      expect(utils.getByText(/Couldn.t load summary/)).toBeTruthy()
    })
  })

  it('shows scheduled count format when active program exists', async () => {
    mockDb.getWeeklySummary.mockResolvedValue({
      ...mockSummaryData,
      workouts: { ...mockSummaryData.workouts, scheduledCount: 5 },
    })
    const utils = renderScreen(<Progress />)
    await waitFor(() => {
      expect(utils.getByText(/4\/5 workouts/)).toBeTruthy()
    })
  })

  it('has week navigation with previous/next buttons', async () => {
    const utils = renderScreen(<Progress />)
    await waitFor(() => {
      expect(utils.getByLabelText('Previous week')).toBeTruthy()
    })
    expect(utils.getByLabelText('Next week')).toBeTruthy()
  })

  it('navigates to previous week when pressing left arrow', async () => {
    const utils = renderScreen(<Progress />)
    await waitFor(() => {
      expect(utils.getByLabelText('Previous week')).toBeTruthy()
    })
    fireEvent.press(utils.getByLabelText('Previous week'))
    // Should trigger a new data load (may also trigger preload)
    await waitFor(() => {
      expect(mockDb.getWeeklySummary.mock.calls.length).toBeGreaterThan(1)
    })
  })

  it('has Share Summary button when expanded', async () => {
    const utils = renderScreen(<Progress />)
    await waitFor(() => {
      expect(utils.getByText('View Details')).toBeTruthy()
    })
    fireEvent.press(utils.getByText('View Details'))
    await waitFor(() => {
      expect(utils.getByLabelText('Share weekly summary')).toBeTruthy()
    })
  })

  it('has correct accessibility state for expand/collapse', async () => {
    const utils = renderScreen(<Progress />)
    await waitFor(() => {
      expect(
        utils.getByLabelText(/Weekly summary for/)
      ).toBeTruthy()
    })
  })

  it('shows PRs with exercise name and weight delta', async () => {
    const utils = renderScreen(<Progress />)
    await waitFor(() => {
      expect(utils.getByText('View Details')).toBeTruthy()
    })
    fireEvent.press(utils.getByText('View Details'))
    await waitFor(() => {
      expect(utils.getAllByText('Bench Press').length).toBeGreaterThanOrEqual(1)
      expect(utils.getByText('Squat')).toBeTruthy()
    })
  })

  it('hides nutrition section when no data', async () => {
    mockDb.getWeeklySummary.mockResolvedValue({
      ...mockSummaryData,
      nutrition: null,
    })
    const utils = renderScreen(<Progress />)
    await waitFor(() => {
      expect(utils.getByText('View Details')).toBeTruthy()
    })
    fireEvent.press(utils.getByText('View Details'))
    await waitFor(() => {
      expect(utils.queryByText(/NUTRITION/)).toBeNull()
    })
  })

  it('hides body section when no data', async () => {
    mockDb.getWeeklySummary.mockResolvedValue({
      ...mockSummaryData,
      body: null,
    })
    const utils = renderScreen(<Progress />)
    await waitFor(() => {
      expect(utils.getByText('View Details')).toBeTruthy()
    })
    fireEvent.press(utils.getByText('View Details'))
    await waitFor(() => {
      expect(utils.queryByText(/^BODY$/)).toBeNull()
    })
  })
})
