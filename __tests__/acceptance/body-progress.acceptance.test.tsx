jest.setTimeout(10000)

import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import { createBodyWeight, createBodySettings, resetIds } from '../helpers/factories'
import type { BodyWeight, BodySettings } from '../../lib/types'

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
jest.mock('../../lib/layout', () => ({ useLayout: () => ({ wide: false, width: 375, scale: 1.0 }) }))
jest.mock('../../lib/errors', () => ({ logError: jest.fn() }))
jest.mock('../../lib/interactions', () => ({ log: jest.fn() }))
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))
jest.mock('victory-native', () => ({ CartesianChart: 'CartesianChart', Line: 'Line', Bar: 'Bar' }))
jest.mock('../../components/MuscleVolumeSegment', () => 'MuscleVolumeSegment')

const mockSettings = createBodySettings({ weight_unit: 'kg', measurement_unit: 'cm', weight_goal: 70, body_fat_goal: 15 })
const mockLatest = createBodyWeight({ id: 'bw1', weight: 75, date: '2024-01-15' })
const mockPrevious = createBodyWeight({ id: 'bw2', weight: 76, date: '2024-01-10' })

jest.mock('../../lib/db', () => ({
  getWeeklySessionCounts: jest.fn().mockResolvedValue([{ week: '2024-W02', count: 3 }]),
  getWeeklyVolume: jest.fn().mockResolvedValue([{ week: '2024-W02', volume: 5000 }]),
  getPersonalRecords: jest.fn().mockResolvedValue([{ exercise_id: 'ex1', name: 'Bench Press', max_weight: 100 }]),
  getCompletedSessionsWithSetCount: jest.fn().mockResolvedValue([]),
  getBodySettings: jest.fn().mockResolvedValue(mockSettings),
  getLatestBodyWeight: jest.fn().mockResolvedValue(mockLatest),
  getPreviousBodyWeight: jest.fn().mockResolvedValue(mockPrevious),
  getBodyWeightEntries: jest.fn().mockResolvedValue([mockLatest, mockPrevious]),
  getBodyWeightCount: jest.fn().mockResolvedValue(2),
  getBodyWeightChartData: jest.fn().mockResolvedValue([{ date: '2024-01-10', weight: 76 }, { date: '2024-01-15', weight: 75 }]),
  getLatestMeasurements: jest.fn().mockResolvedValue(null),
  upsertBodyWeight: jest.fn().mockResolvedValue(undefined),
  deleteBodyWeight: jest.fn().mockResolvedValue(undefined),
  updateBodySettings: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../lib/units', () => ({ toDisplay: (v: number) => v, toKg: (v: number) => v, KG_TO_LB: 2.20462, LB_TO_KG: 0.453592 }))

import Progress from '../../app/(tabs)/progress'

const mockDb = require('../../lib/db') as Record<string, jest.Mock>

async function switchToBody(utils: ReturnType<typeof renderScreen>) {
  const bodyBtn = await utils.findByLabelText('Body metrics')
  fireEvent.press(bodyBtn)
}

describe('Body Progress Acceptance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetIds()
    mockDb.getBodySettings.mockResolvedValue(mockSettings)
    mockDb.getLatestBodyWeight.mockResolvedValue(mockLatest)
    mockDb.getPreviousBodyWeight.mockResolvedValue(mockPrevious)
    mockDb.getBodyWeightEntries.mockResolvedValue([mockLatest, mockPrevious])
    mockDb.getBodyWeightCount.mockResolvedValue(2)
    mockDb.getBodyWeightChartData.mockResolvedValue([
      { date: '2024-01-10', weight: 76 },
      { date: '2024-01-15', weight: 75 },
    ])
    mockDb.getLatestMeasurements.mockResolvedValue(null)
    mockDb.getPersonalRecords.mockResolvedValue([{ exercise_id: 'ex1', name: 'Bench Press', max_weight: 100 }])
    mockDb.getWeeklySessionCounts.mockResolvedValue([{ week: '2024-W02', count: 3 }])
    mockDb.getWeeklyVolume.mockResolvedValue([{ week: '2024-W02', volume: 5000 }])
    mockDb.getCompletedSessionsWithSetCount.mockResolvedValue([])
  })

  it('renders personal records on workouts segment', async () => {
    const utils = renderScreen(<Progress />)
    expect(await utils.findByText('Bench Press')).toBeTruthy()
  })

  it('switches to body segment and shows body content', async () => {
    const utils = renderScreen(<Progress />)
    await switchToBody(utils)
    const matches = await waitFor(() => utils.getAllByText(/75/))
    expect(matches.length).toBeGreaterThan(0)
  })

  it('displays current weight on body segment', async () => {
    const utils = renderScreen(<Progress />)
    await switchToBody(utils)
    expect(await utils.findByLabelText(/Current weight 75/)).toBeTruthy()
  })

  it('shows weight goal on body segment', async () => {
    const utils = renderScreen(<Progress />)
    await switchToBody(utils)
    expect(await utils.findByText(/70/)).toBeTruthy()
  })

  it('navigates to body goals when edit is pressed', async () => {
    const utils = renderScreen(<Progress />)
    await switchToBody(utils)
    const editBtn = await utils.findByLabelText('Edit body goals')
    fireEvent.press(editBtn)
    expect(mockRouter.push).toHaveBeenCalledWith('/body/goals')
  })

  it('navigates to measurements when button is pressed', async () => {
    const utils = renderScreen(<Progress />)
    await switchToBody(utils)
    const measBtn = await utils.findByLabelText('Log body measurements')
    fireEvent.press(measBtn)
    expect(mockRouter.push).toHaveBeenCalledWith('/body/measurements')
  })
})
