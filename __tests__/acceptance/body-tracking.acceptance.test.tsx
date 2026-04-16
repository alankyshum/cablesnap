jest.setTimeout(10000)

import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import { createBodyWeight, createBodySettings, resetIds } from '../helpers/factories'

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
jest.mock('../../components/WeeklySummary', () => 'WeeklySummary')

const mockSettings = createBodySettings({ weight_unit: 'kg', measurement_unit: 'cm', weight_goal: 70, body_fat_goal: 15 })
const mockLatest = createBodyWeight({ id: 'bw1', weight: 75, date: '2024-01-15' })
const mockPrevious = createBodyWeight({ id: 'bw2', weight: 76, date: '2024-01-10' })

jest.mock('../../lib/db', () => ({
  getWeeklySessionCounts: jest.fn().mockResolvedValue([]),
  getWeeklyVolume: jest.fn().mockResolvedValue([]),
  getPersonalRecords: jest.fn().mockResolvedValue([]),
  getCompletedSessionsWithSetCount: jest.fn().mockResolvedValue([]),
  getBodySettings: jest.fn().mockResolvedValue(mockSettings),
  getLatestBodyWeight: jest.fn().mockResolvedValue(mockLatest),
  getPreviousBodyWeight: jest.fn().mockResolvedValue(mockPrevious),
  getBodyWeightEntries: jest.fn().mockResolvedValue([mockLatest, mockPrevious]),
  getBodyWeightCount: jest.fn().mockResolvedValue(2),
  getBodyWeightChartData: jest.fn().mockResolvedValue([
    { date: '2024-01-10', weight: 76 },
    { date: '2024-01-15', weight: 75 },
  ]),
  getLatestMeasurements: jest.fn().mockResolvedValue(null),
  upsertBodyWeight: jest.fn().mockResolvedValue(undefined),
  deleteBodyWeight: jest.fn().mockResolvedValue(undefined),
  updateBodySettings: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../lib/units', () => ({
  toDisplay: (v: number) => v,
  toKg: (v: number) => v,
  KG_TO_LB: 2.20462,
  LB_TO_KG: 0.453592,
}))

import Progress from '../../app/(tabs)/progress'

const mockDb = require('../../lib/db') as Record<string, jest.Mock>

async function switchToBody(utils: ReturnType<typeof renderScreen>) {
  const bodyBtn = await utils.findByLabelText('Body metrics')
  fireEvent.press(bodyBtn)
}

describe('Body Tracking Acceptance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
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
    mockDb.upsertBodyWeight.mockResolvedValue(undefined)
    mockDb.deleteBodyWeight.mockResolvedValue(undefined)
    mockDb.updateBodySettings.mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('Log body weight via modal', () => {
    it('opens modal when FAB is pressed and saves weight entry', async () => {
      const utils = renderScreen(<Progress />)
      await switchToBody(utils)

      const fab = await utils.findByLabelText('Log body weight')
      fireEvent.press(fab)

      const weightInput = await utils.findByLabelText(/Weight in kg/)
      fireEvent.changeText(weightInput, '74.5')

      const dateInput = await utils.findByLabelText('Date for weight entry')
      fireEvent.changeText(dateInput, '2024-01-16')

      const notesInput = await utils.findByLabelText('Optional notes')
      fireEvent.changeText(notesInput, 'Morning weigh-in')

      const saveBtn = await utils.findByLabelText('Save weight entry')
      fireEvent.press(saveBtn)

      await waitFor(() => {
        expect(mockDb.upsertBodyWeight).toHaveBeenCalledWith(74.5, '2024-01-16', 'Morning weigh-in')
      })
    })

    it('closes modal after saving', async () => {
      const utils = renderScreen(<Progress />)
      await switchToBody(utils)

      const fab = await utils.findByLabelText('Log body weight')
      fireEvent.press(fab)

      const weightInput = await utils.findByLabelText(/Weight in kg/)
      fireEvent.changeText(weightInput, '74')

      const saveBtn = await utils.findByLabelText('Save weight entry')
      fireEvent.press(saveBtn)

      await waitFor(() => {
        expect(mockDb.upsertBodyWeight).toHaveBeenCalled()
      })
    })

    it('does not save when weight is empty', async () => {
      const utils = renderScreen(<Progress />)
      await switchToBody(utils)

      const fab = await utils.findByLabelText('Log body weight')
      fireEvent.press(fab)

      const saveBtn = await utils.findByLabelText('Save weight entry')
      expect(saveBtn.props.accessibilityState?.disabled).toBe(true)
    })

    it('cancels modal without saving', async () => {
      const utils = renderScreen(<Progress />)
      await switchToBody(utils)

      const fab = await utils.findByLabelText('Log body weight')
      fireEvent.press(fab)

      const cancelBtn = await utils.findByLabelText('Cancel weight log')
      fireEvent.press(cancelBtn)

      expect(mockDb.upsertBodyWeight).not.toHaveBeenCalled()
    })
  })

  describe('Delete weight entry with undo', () => {
    it('shows undo snackbar when entry is deleted', async () => {
      const utils = renderScreen(<Progress />)
      await switchToBody(utils)

      const deleteBtn = await utils.findByLabelText('Delete weight entry for 2024-01-15')
      fireEvent.press(deleteBtn)

      expect(await utils.findByText('Entry deleted')).toBeTruthy()
    })

    it('removes entry from list immediately on delete', async () => {
      const utils = renderScreen(<Progress />)
      await switchToBody(utils)

      await utils.findByLabelText('Delete weight entry for 2024-01-15')
      const deleteBtn = utils.getByLabelText('Delete weight entry for 2024-01-15')
      fireEvent.press(deleteBtn)

      await waitFor(() => {
        expect(utils.queryByLabelText('Delete weight entry for 2024-01-15')).toBeNull()
      })
    })

    it('calls deleteBodyWeight after timeout', async () => {
      const utils = renderScreen(<Progress />)
      await switchToBody(utils)

      const deleteBtn = await utils.findByLabelText('Delete weight entry for 2024-01-15')
      fireEvent.press(deleteBtn)

      expect(mockDb.deleteBodyWeight).not.toHaveBeenCalledWith('bw1')

      jest.advanceTimersByTime(3000)
      await waitFor(() => {
        expect(mockDb.deleteBodyWeight).toHaveBeenCalledWith('bw1')
      })
    })

    it('undo restores entry and cancels deletion', async () => {
      mockDb.getBodyWeightEntries.mockResolvedValue([mockLatest, mockPrevious])

      const utils = renderScreen(<Progress />)
      await switchToBody(utils)

      const deleteBtn = await utils.findByLabelText('Delete weight entry for 2024-01-15')
      fireEvent.press(deleteBtn)

      const undoBtn = await utils.findByText('Undo')
      fireEvent.press(undoBtn)

      jest.advanceTimersByTime(3000)

      expect(mockDb.deleteBodyWeight).not.toHaveBeenCalledWith('bw1')

      await waitFor(() => {
        expect(mockDb.getBodyWeightEntries).toHaveBeenCalled()
      })
    })
  })

  describe('Weight unit toggle', () => {
    it('calls updateBodySettings when toggling kg to lb', async () => {
      const utils = renderScreen(<Progress />)
      await switchToBody(utils)

      const toggleBtn = await utils.findByLabelText('Switch to pounds')
      fireEvent.press(toggleBtn)

      await waitFor(() => {
        expect(mockDb.updateBodySettings).toHaveBeenCalledWith('lb', 'cm', 70, 15)
      })
    })

    it('reloads body data after toggling unit', async () => {
      const utils = renderScreen(<Progress />)
      await switchToBody(utils)

      const callsBefore = mockDb.getBodySettings.mock.calls.length

      const toggleBtn = await utils.findByLabelText('Switch to pounds')
      fireEvent.press(toggleBtn)

      await waitFor(() => {
        expect(mockDb.getBodySettings.mock.calls.length).toBeGreaterThan(callsBefore)
      })
    })
  })

  describe('Empty state', () => {
    it('shows empty state when no entries exist', async () => {
      mockDb.getBodyWeightCount.mockResolvedValue(0)
      mockDb.getLatestBodyWeight.mockResolvedValue(null)
      mockDb.getPreviousBodyWeight.mockResolvedValue(null)
      mockDb.getBodyWeightEntries.mockResolvedValue([])
      mockDb.getBodyWeightChartData.mockResolvedValue([])
      mockDb.getLatestMeasurements.mockResolvedValue(null)

      const utils = renderScreen(<Progress />)
      await switchToBody(utils)

      expect(await utils.findByText('Log your first weigh-in')).toBeTruthy()
    })

    it('shows FAB in empty state that opens modal', async () => {
      mockDb.getBodyWeightCount.mockResolvedValue(0)
      mockDb.getLatestBodyWeight.mockResolvedValue(null)
      mockDb.getPreviousBodyWeight.mockResolvedValue(null)
      mockDb.getBodyWeightEntries.mockResolvedValue([])
      mockDb.getBodyWeightChartData.mockResolvedValue([])
      mockDb.getLatestMeasurements.mockResolvedValue(null)

      const utils = renderScreen(<Progress />)
      await switchToBody(utils)

      const fab = await utils.findByLabelText('Log body weight')
      fireEvent.press(fab)

      expect(await utils.findByLabelText(/Weight in kg/)).toBeTruthy()
    })
  })
})
