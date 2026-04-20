import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import type { MuscleGroup } from '../../lib/types'

const mockGetMuscleVolumeForWeek = jest.fn()
const mockGetMuscleVolumeTrend = jest.fn()

jest.mock('../../lib/db', () => ({
  getMuscleVolumeForWeek: (...a: unknown[]) => mockGetMuscleVolumeForWeek(...a),
  getMuscleVolumeTrend: (...a: unknown[]) => mockGetMuscleVolumeTrend(...a),
}))

jest.mock('../../lib/db/settings', () => ({
  getAppSetting: jest.fn().mockResolvedValue(null),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('expo-router', () => {
  const RealReact = require('react')
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
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
  useLayout: () => ({ wide: false, width: 375, scale: 1.0, atLeastMedium: false }),
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
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))
jest.mock('victory-native', () => ({
  CartesianChart: 'CartesianChart',
  Line: 'Line',
  Bar: 'Bar',
}))

import MuscleVolumeSegment from '../../components/MuscleVolumeSegment'

type VolumeRow = { muscle: MuscleGroup; sets: number; exercises: number }
type TrendRow = { week: string; sets: number }

const sampleData: VolumeRow[] = [
  { muscle: 'chest', sets: 15, exercises: 3 },
  { muscle: 'back', sets: 18, exercises: 4 },
  { muscle: 'shoulders', sets: 12, exercises: 2 },
  { muscle: 'biceps', sets: 6, exercises: 2 },
  { muscle: 'triceps', sets: 8, exercises: 2 },
]

const sampleTrend: TrendRow[] = [
  { week: 'W1', sets: 10 },
  { week: 'W2', sets: 12 },
  { week: 'W3', sets: 14 },
  { week: 'W4', sets: 15 },
]

beforeEach(() => {
  jest.clearAllMocks()
  mockGetMuscleVolumeForWeek.mockResolvedValue(sampleData)
  mockGetMuscleVolumeTrend.mockResolvedValue(sampleTrend)
})

// --- Rendering ---

describe('MuscleVolumeSegment — Rendering', () => {
  it('shows "Sets per Muscle Group" heading when data is present', async () => {
    const { findByText } = renderScreen(<MuscleVolumeSegment />)
    expect(await findByText('Sets per Muscle Group')).toBeTruthy()
  })

  it('renders all muscle groups from data', async () => {
    const { findAllByText } = renderScreen(<MuscleVolumeSegment />)
    // Muscle names appear in both bar chart and list view
    expect((await findAllByText('Chest')).length).toBeGreaterThan(0)
    expect((await findAllByText('Back')).length).toBeGreaterThan(0)
    expect((await findAllByText('Shoulders')).length).toBeGreaterThan(0)
    expect((await findAllByText('Biceps')).length).toBeGreaterThan(0)
    expect((await findAllByText('Triceps')).length).toBeGreaterThan(0)
  })

  it('shows weekly set counts for each muscle group', async () => {
    const { findAllByLabelText } = renderScreen(<MuscleVolumeSegment />)
    expect((await findAllByLabelText(/Chest: 15 sets/)).length).toBeGreaterThan(0)
    expect((await findAllByLabelText(/Back: 18 sets/)).length).toBeGreaterThan(0)
    expect((await findAllByLabelText(/Shoulders: 12 sets/)).length).toBeGreaterThan(0)
  })

  it('shows exercise count in list row a11y labels', async () => {
    const { findByLabelText } = renderScreen(<MuscleVolumeSegment />)
    expect(await findByLabelText('Chest: 15 sets from 3 exercises')).toBeTruthy()
    expect(await findByLabelText('Back: 18 sets from 4 exercises')).toBeTruthy()
  })

  it('shows MEV landmark value when muscle is selected', async () => {
    const { findByText } = renderScreen(<MuscleVolumeSegment />)
    // First muscle (chest) is auto-selected, MEV label shows for selected muscle
    expect(await findByText(/MEV: \d+/)).toBeTruthy()
  })
})

// --- Week Navigation ---

describe('MuscleVolumeSegment — Week Navigation', () => {
  it('shows "This Week" for current week', async () => {
    const { findByText } = renderScreen(<MuscleVolumeSegment />)
    expect(await findByText('This Week')).toBeTruthy()
  })

  it('has previous week navigation button', async () => {
    const { findByLabelText } = renderScreen(<MuscleVolumeSegment />)
    expect(await findByLabelText('Previous week')).toBeTruthy()
  })

  it('pressing previous week navigates to prior week', async () => {
    const { findByLabelText, findByText, queryByText } = renderScreen(<MuscleVolumeSegment />)
    expect(await findByText('This Week')).toBeTruthy()

    const prevBtn = await findByLabelText('Previous week')
    fireEvent.press(prevBtn)

    // After pressing previous, "Today" button should appear and "This Week" should disappear
    await waitFor(() => {
      expect(queryByText('This Week')).toBeNull()
    })
    expect(await findByLabelText('Go to current week')).toBeTruthy()
  })
})

// --- Muscle Selection ---

describe('MuscleVolumeSegment — Muscle Selection', () => {
  it('selecting a muscle group loads its trend', async () => {
    const { findByLabelText } = renderScreen(<MuscleVolumeSegment />)
    const backRow = await findByLabelText('Back: 18 sets from 4 exercises')
    fireEvent.press(backRow)

    await waitFor(() => {
      expect(mockGetMuscleVolumeTrend).toHaveBeenCalledWith('back', 8)
    })
  })

  it('shows trend title with selected muscle name', async () => {
    const { findByText } = renderScreen(<MuscleVolumeSegment />)
    // First muscle (chest) is auto-selected
    expect(await findByText('Chest — 8 Week Trend')).toBeTruthy()
  })

  it('changes trend title when different muscle is selected', async () => {
    const { findByLabelText, findByText } = renderScreen(<MuscleVolumeSegment />)
    const backRow = await findByLabelText('Back: 18 sets from 4 exercises')
    fireEvent.press(backRow)

    await waitFor(async () => {
      expect(await findByText('Back — 8 Week Trend')).toBeTruthy()
    })
  })
})

// --- Empty State ---

describe('MuscleVolumeSegment — Empty State', () => {
  it('shows empty message when no workouts this week', async () => {
    mockGetMuscleVolumeForWeek.mockResolvedValue([])
    const { findByText } = renderScreen(<MuscleVolumeSegment />)
    expect(await findByText('No workouts this week. Complete a session to see muscle volume.')).toBeTruthy()
  })
})

// --- Loading State ---

describe('MuscleVolumeSegment — Loading', () => {
  it('shows loading indicator initially', () => {
    mockGetMuscleVolumeForWeek.mockImplementation(
      () => new Promise(() => {}) // never resolves
    )
    const { getByLabelText } = renderScreen(<MuscleVolumeSegment />)
    expect(getByLabelText('Loading muscle volume data')).toBeTruthy()
  })
})

// --- Error State ---

describe('MuscleVolumeSegment — Error', () => {
  it('shows error message and retry button on load failure', async () => {
    mockGetMuscleVolumeForWeek.mockRejectedValue(new Error('DB error'))
    const { findByText, findByLabelText } = renderScreen(<MuscleVolumeSegment />)
    expect(await findByText('DB error')).toBeTruthy()
    expect(await findByLabelText('Retry loading muscle volume data')).toBeTruthy()
  })

  it('retry button reloads data', async () => {
    mockGetMuscleVolumeForWeek.mockRejectedValueOnce(new Error('DB error'))
    mockGetMuscleVolumeForWeek.mockResolvedValueOnce(sampleData)
    mockGetMuscleVolumeTrend.mockResolvedValue(sampleTrend)

    const { findByLabelText, findByText } = renderScreen(<MuscleVolumeSegment />)
    const retryBtn = await findByLabelText('Retry loading muscle volume data')
    fireEvent.press(retryBtn)

    await waitFor(() => {
      expect(mockGetMuscleVolumeForWeek).toHaveBeenCalledTimes(2)
    })
    expect(await findByText('Sets per Muscle Group')).toBeTruthy()
  })
})
