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
  getErrorCount: jest.fn().mockResolvedValue(3),
  clearErrorLog: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../../lib/interactions', () => ({ log: jest.fn() }))
// BLD-753a: use centralized manual mock at lib/__mocks__/audio.ts
jest.mock('../../lib/audio')
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
const mockText = jest.fn().mockResolvedValue('{}')
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({ write: mockWrite, text: mockText, uri: 'file:///test' })),
  Paths: { cache: '/cache' },
}))
jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn().mockResolvedValue({ canceled: true }),
}))

jest.mock('../../lib/db', () => ({
  exportAllData: jest.fn().mockResolvedValue({ version: 7, app_version: '1.0.0', exported_at: '2026-04-15T00:00:00.000Z', data: {}, counts: { exercises: 1, workout_templates: 1 } }),
  importData: jest.fn().mockResolvedValue({ inserted: 5, skipped: 0, perTable: {} }),
  validateBackupFileSize: jest.fn().mockReturnValue(null),
  validateBackupData: jest.fn().mockReturnValue(null),
  getBackupCounts: jest.fn().mockReturnValue({}),
  getBackupCategoryCounts: jest.fn().mockReturnValue({
    workout_templates: 1,
    workout_history: 0,
    exercises: 1,
    nutrition: 0,
    body_metrics: 0,
    programs: 0,
    plate_calculator_settings: 0,
    rest_timer_settings: 0,
    app_preferences: 0,
    achievements: 0,
  }),
  getPresentBackupCategories: jest.fn().mockReturnValue(['workout_templates', 'exercises']),
  BACKUP_CATEGORY_ORDER: ['workout_templates', 'workout_history', 'exercises', 'nutrition', 'body_metrics', 'programs', 'plate_calculator_settings', 'rest_timer_settings', 'app_preferences', 'achievements'],
  BACKUP_CATEGORY_LABELS: {
    workout_templates: 'Workout templates',
    workout_history: 'Workout session history',
    exercises: 'Exercises',
    nutrition: 'Nutrition',
    body_metrics: 'Body metrics',
    programs: 'Programs',
    plate_calculator_settings: 'Plate calculator settings',
    rest_timer_settings: 'Rest timer settings',
    app_preferences: 'App preferences',
    achievements: 'Achievements',
  },
  BACKUP_TABLE_LABELS: {},
  IMPORT_TABLE_ORDER: [],
  getWorkoutCSVData: jest.fn().mockResolvedValue([{ date: '2024-01-15', exercise: 'Bench', set_number: 1, weight: 60, reps: 10, duration_seconds: 1800, notes: '', set_rpe: 8, set_notes: '', link_id: null }]),
  getNutritionCSVData: jest.fn().mockResolvedValue([]),
  getBodyWeightCSVData: jest.fn().mockResolvedValue([]),
  getBodyMeasurementsCSVData: jest.fn().mockResolvedValue([]),
  getCSVCounts: jest.fn().mockResolvedValue({ sessions: 10, entries: 25 }),
  getAppSetting: jest.fn().mockResolvedValue('true'),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
  deleteAppSetting: jest.fn().mockResolvedValue(undefined),
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

const { exportAllData, importData, getWorkoutCSVData, setAppSetting } = require('../../lib/db')
const { shareAsync } = require('expo-sharing')
const { getDocumentAsync } = require('expo-document-picker')

describe('Data Management Acceptance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders settings heading', async () => {
    const { findByText } = renderScreen(<Settings />)

    expect(await findByText('About')).toBeTruthy()
  })

  it('displays CSV counts', async () => {
    const { findByLabelText } = renderScreen(<Settings />)

    expect(await findByLabelText(/10 workout sessions/)).toBeTruthy()
    expect(await findByLabelText(/25 nutrition entries/)).toBeTruthy()
  })

  it('exports all data as JSON after selecting categories', async () => {
    const { findByLabelText, findByText } = renderScreen(<Settings />)

    const btn = await findByLabelText('Export all data as JSON')
    fireEvent.press(btn)

    expect(await findByText('Choose what to export')).toBeTruthy()
    fireEvent.press(await findByLabelText('Export Selected'))

    await waitFor(() => {
      expect(exportAllData).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(shareAsync).toHaveBeenCalled()
    })
  })

  it('exports workouts as CSV', async () => {
    const { findByLabelText } = renderScreen(<Settings />)

    const btn = await findByLabelText('Export workouts as CSV')
    fireEvent.press(btn)

    await waitFor(() => {
      expect(getWorkoutCSVData).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(shareAsync).toHaveBeenCalled()
    })
  })

  it('does not import when document picker is cancelled', async () => {
    getDocumentAsync.mockResolvedValue({ canceled: true })

    const { findByLabelText } = renderScreen(<Settings />)

    const btn = await findByLabelText('Import data')
    fireEvent.press(btn)

    await waitFor(() => {
      expect(getDocumentAsync).toHaveBeenCalled()
    })
    expect(importData).not.toHaveBeenCalled()
  })

  it('opens selective import flow and routes with selected categories', async () => {
    mockText.mockResolvedValue(JSON.stringify({
      version: 7,
      app_version: '1.0.0',
      exported_at: '2026-04-15T00:00:00.000Z',
      data: {
        workout_templates: { workout_templates: [{ id: 't1' }] },
        exercises: { exercises: [{ id: 'e1' }] },
      },
    }))
    getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///import.json', size: 256 }],
    })

    const { findByLabelText, findByText } = renderScreen(<Settings />)

    fireEvent.press(await findByLabelText('Import data'))

    expect(await findByText('Choose what to import')).toBeTruthy()
    fireEvent.press(await findByLabelText('Import Selected'))

    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/settings/import-backup',
        params: expect.objectContaining({
          selectedCategories: 'workout_templates,exercises',
        }),
      })
    })
  })

  it('shows error log count', async () => {
    const { findByLabelText } = renderScreen(<Settings />)

    expect(await findByLabelText('View error log, 3 errors')).toBeTruthy()
  })

  it('navigates to error log', async () => {
    const { findByLabelText } = renderScreen(<Settings />)

    const btn = await findByLabelText('View error log, 3 errors')
    fireEvent.press(btn)

    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith('/errors')
    })
  })

  it('toggles timer sound setting', async () => {
    const { findByLabelText } = renderScreen(<Settings />)

    const toggle = await findByLabelText('Timer Sound')
    expect(toggle).toBeTruthy()

    fireEvent(toggle, 'valueChange', false)

    await waitFor(() => {
      expect(setAppSetting).toHaveBeenCalledWith('timer_sound_enabled', 'false')
    })
  })
})
