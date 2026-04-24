import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() }

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({}),
  usePathname: () => '/test',
  useFocusEffect: jest.fn(),
  Stack: { Screen: () => null },
  Redirect: () => null,
}))

jest.mock('@react-navigation/native', () => {
  const RealReact = require('react')
  return {
    useFocusEffect: (cb: () => (() => void) | void) => {
      RealReact.useEffect(() => {
        const cleanup = cb()
        return typeof cleanup === 'function' ? cleanup : undefined
      }, [])
    },
  }
})

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')
jest.mock('../../lib/errors', () => ({
  logError: jest.fn(),
  getErrorCount: jest.fn().mockResolvedValue(0),
  clearErrorLog: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../../lib/interactions', () => ({ log: jest.fn() }))
jest.mock('../../lib/audio', () => ({ play: jest.fn(), setEnabled: jest.fn(), preload: jest.fn() }))
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'undetermined' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  scheduleNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
}))
jest.mock('../../lib/notifications', () => ({
  requestPermission: jest.fn().mockResolvedValue(true),
  scheduleReminders: jest.fn().mockResolvedValue(undefined),
  cancelReminders: jest.fn().mockResolvedValue(undefined),
  getScheduledReminders: jest.fn().mockResolvedValue([]),
  getPermissionStatus: jest.fn().mockResolvedValue('granted'),
  setupHandler: jest.fn(),
  handleResponse: jest.fn(),
}))

const mockWrite = jest.fn().mockResolvedValue(undefined)
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({ write: mockWrite, uri: 'file:///test' })),
  Paths: { cache: '/cache' },
}))
jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn().mockResolvedValue({ canceled: true }),
}))

jest.mock('../../lib/db', () => ({
  exportAllData: jest.fn().mockResolvedValue({ version: 1, exercises: [], templates: [], sessions: [], sets: [] }),
  importData: jest.fn().mockResolvedValue({ inserted: 0 }),
  getWorkoutCSVData: jest.fn().mockResolvedValue([
    { date: '2024-01-15', exercise: 'Bench Press', set_number: 1, weight: 80, reps: 8, duration_seconds: 2400, notes: '', set_rpe: 8, set_notes: '', link_id: null },
  ]),
  getNutritionCSVData: jest.fn().mockResolvedValue([
    { date: '2024-01-15', meal: 'Lunch', food: 'Chicken Breast', servings: 1, calories: 280, protein: 53, carbs: 0, fat: 6 },
  ]),
  getBodyWeightCSVData: jest.fn().mockResolvedValue([
    { date: '2024-01-15', weight: 75.5, notes: '' },
  ]),
  getBodyMeasurementsCSVData: jest.fn().mockResolvedValue([
    { date: '2024-01-15', chest: 100, waist: 80, hips: 95, bicep_left: 35, bicep_right: 35.5 },
  ]),
  getCSVCounts: jest.fn().mockResolvedValue({ sessions: 5, entries: 12 }),
  getAppSetting: jest.fn().mockResolvedValue('true'),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
  getSchedule: jest.fn().mockResolvedValue([]),
  getTemplates: jest.fn().mockResolvedValue([]),
  getBodySettings: jest.fn().mockResolvedValue({ weight_unit: 'kg', measurement_unit: 'cm', weight_goal: null, body_fat_goal: null }),
  getStravaConnection: jest.fn().mockResolvedValue(null),
}))

jest.mock('../../lib/strava', () => ({
  connectStrava: jest.fn().mockResolvedValue(null),
  disconnect: jest.fn().mockResolvedValue(undefined),
}))

import Settings from '../../app/(tabs)/settings'

const {
  getWorkoutCSVData,
  getNutritionCSVData,
  getBodyWeightCSVData,
  getBodyMeasurementsCSVData,
} = require('../../lib/db')
const { shareAsync } = require('expo-sharing')

describe('CSV Export Acceptance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Re-set default mock implementations after clearAllMocks
    getWorkoutCSVData.mockResolvedValue([
      { date: '2024-01-15', exercise: 'Bench Press', set_number: 1, weight: 80, reps: 8, duration_seconds: 2400, notes: '', set_rpe: 8, set_notes: '', link_id: null },
    ])
    getNutritionCSVData.mockResolvedValue([
      { date: '2024-01-15', meal: 'Lunch', food: 'Chicken Breast', servings: 1, calories: 280, protein: 53, carbs: 0, fat: 6 },
    ])
    getBodyWeightCSVData.mockResolvedValue([
      { date: '2024-01-15', weight: 75.5, notes: '' },
    ])
    getBodyMeasurementsCSVData.mockResolvedValue([
      { date: '2024-01-15', chest: 100, waist: 80, hips: 95, bicep_left: 35, bicep_right: 35.5 },
    ])
  })

  // --- Export buttons are visible ---

  it('shows all four CSV export buttons', async () => {
    const { findByLabelText } = renderScreen(<Settings />)

    expect(await findByLabelText('Export workouts as CSV')).toBeTruthy()
    expect(await findByLabelText('Export nutrition as CSV')).toBeTruthy()
    expect(await findByLabelText('Export body weight as CSV')).toBeTruthy()
    expect(await findByLabelText('Export body measurements as CSV')).toBeTruthy()
  })

  // --- Export triggers correct function calls ---

  it('exports workouts as CSV and shares the file', async () => {
    const { findByLabelText } = renderScreen(<Settings />)

    const btn = await findByLabelText('Export workouts as CSV')
    fireEvent.press(btn)

    await waitFor(() => {
      expect(getWorkoutCSVData).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(mockWrite).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(shareAsync).toHaveBeenCalledWith(
        'file:///test',
        expect.objectContaining({ mimeType: 'text/csv' })
      )
    })
  })

  it('exports nutrition as CSV and shares the file', async () => {
    const { findByLabelText } = renderScreen(<Settings />)

    const btn = await findByLabelText('Export nutrition as CSV')
    fireEvent.press(btn)

    await waitFor(() => {
      expect(getNutritionCSVData).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(shareAsync).toHaveBeenCalledWith(
        'file:///test',
        expect.objectContaining({ mimeType: 'text/csv' })
      )
    })
  })

  it('exports body weight as CSV and shares the file', async () => {
    const { findByLabelText } = renderScreen(<Settings />)

    const btn = await findByLabelText('Export body weight as CSV')
    fireEvent.press(btn)

    await waitFor(() => {
      expect(getBodyWeightCSVData).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(shareAsync).toHaveBeenCalledWith(
        'file:///test',
        expect.objectContaining({ mimeType: 'text/csv' })
      )
    })
  })

  it('exports body measurements as CSV and shares the file', async () => {
    const { findByLabelText } = renderScreen(<Settings />)

    const btn = await findByLabelText('Export body measurements as CSV')
    fireEvent.press(btn)

    await waitFor(() => {
      expect(getBodyMeasurementsCSVData).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(shareAsync).toHaveBeenCalledWith(
        'file:///test',
        expect.objectContaining({ mimeType: 'text/csv' })
      )
    })
  })

  // --- Empty data shows snackbar feedback ---

  it('shows "No data to export" when workout data is empty', async () => {
    getWorkoutCSVData.mockResolvedValue([])

    const { findByLabelText, findByText } = renderScreen(<Settings />)

    const btn = await findByLabelText('Export workouts as CSV')
    fireEvent.press(btn)

    expect(await findByText('No data to export')).toBeTruthy()
    expect(shareAsync).not.toHaveBeenCalled()
  })

  it('shows "No data to export" when nutrition data is empty', async () => {
    getNutritionCSVData.mockResolvedValue([])

    const { findByLabelText, findByText } = renderScreen(<Settings />)

    const btn = await findByLabelText('Export nutrition as CSV')
    fireEvent.press(btn)

    expect(await findByText('No data to export')).toBeTruthy()
    expect(shareAsync).not.toHaveBeenCalled()
  })

  it('shows "No data to export" when body weight data is empty', async () => {
    getBodyWeightCSVData.mockResolvedValue([])

    const { findByLabelText, findByText } = renderScreen(<Settings />)

    const btn = await findByLabelText('Export body weight as CSV')
    fireEvent.press(btn)

    expect(await findByText('No data to export')).toBeTruthy()
    expect(shareAsync).not.toHaveBeenCalled()
  })

  it('shows "No data to export" when body measurements data is empty', async () => {
    getBodyMeasurementsCSVData.mockResolvedValue([])

    const { findByLabelText, findByText } = renderScreen(<Settings />)

    const btn = await findByLabelText('Export body measurements as CSV')
    fireEvent.press(btn)

    expect(await findByText('No data to export')).toBeTruthy()
    expect(shareAsync).not.toHaveBeenCalled()
  })

  // --- Error handling ---

  it('shows "Export failed" when workout CSV export throws', async () => {
    getWorkoutCSVData.mockRejectedValue(new Error('DB read error'))

    const { findByLabelText, findByText } = renderScreen(<Settings />)

    const btn = await findByLabelText('Export workouts as CSV')
    fireEvent.press(btn)

    expect(await findByText('Export failed')).toBeTruthy()
    expect(shareAsync).not.toHaveBeenCalled()
  })

  it('shows "Export failed" when nutrition CSV export throws', async () => {
    getNutritionCSVData.mockRejectedValue(new Error('DB read error'))

    const { findByLabelText, findByText } = renderScreen(<Settings />)

    const btn = await findByLabelText('Export nutrition as CSV')
    fireEvent.press(btn)

    expect(await findByText('Export failed')).toBeTruthy()
    expect(shareAsync).not.toHaveBeenCalled()
  })

  it('shows "Export failed" when sharing fails', async () => {
    shareAsync.mockRejectedValue(new Error('Share cancelled'))

    const { findByLabelText, findByText } = renderScreen(<Settings />)

    const btn = await findByLabelText('Export workouts as CSV')
    fireEvent.press(btn)

    expect(await findByText('Export failed')).toBeTruthy()
  })

  // --- CSV counts display ---

  it('displays CSV counts for sessions and nutrition entries', async () => {
    const { findByLabelText } = renderScreen(<Settings />)

    expect(await findByLabelText(/5 workout sessions/)).toBeTruthy()
    expect(await findByLabelText(/12 nutrition entries/)).toBeTruthy()
  })
})
