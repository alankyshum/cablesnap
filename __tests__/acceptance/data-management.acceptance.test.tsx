import React from 'react'
import { Alert } from 'react-native'
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
  exportAllData: jest.fn().mockResolvedValue({ version: 3, app_version: '1.0.0', exported_at: '2026-04-15T00:00:00.000Z', data: { exercises: [{ id: '1' }], workout_templates: [], workout_sessions: [], workout_sets: [] }, counts: { exercises: 1 } }),
  importData: jest.fn().mockResolvedValue({ inserted: 5, skipped: 0, perTable: {} }),
  estimateExportSize: jest.fn().mockResolvedValue({ bytes: 1024, label: '1 KB' }),
  validateBackupFileSize: jest.fn().mockReturnValue(null),
  validateBackupData: jest.fn().mockReturnValue(null),
  getBackupCounts: jest.fn().mockReturnValue({}),
  BACKUP_TABLE_LABELS: {},
  IMPORT_TABLE_ORDER: [],
  getWorkoutCSVData: jest.fn().mockResolvedValue([{ date: '2024-01-15', exercise: 'Bench', set_number: 1, weight: 60, reps: 10, duration_seconds: 1800, notes: '', set_rpe: 8, set_notes: '', link_id: null }]),
  getNutritionCSVData: jest.fn().mockResolvedValue([]),
  getBodyWeightCSVData: jest.fn().mockResolvedValue([]),
  getBodyMeasurementsCSVData: jest.fn().mockResolvedValue([]),
  getCSVCounts: jest.fn().mockResolvedValue({ sessions: 10, entries: 25 }),
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

const { exportAllData, importData, getWorkoutCSVData, setAppSetting, estimateExportSize } = require('../../lib/db')
const { shareAsync } = require('expo-sharing')
const { getDocumentAsync } = require('expo-document-picker')

// Spy on Alert.alert to auto-confirm
const alertSpy = jest.spyOn(Alert, 'alert')

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

  it('exports all data as JSON', async () => {
    // Auto-press "Export" in the confirmation alert
    alertSpy.mockImplementation((_title, _message, buttons) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exportBtn = buttons?.find((b: any) => b.text === 'Export')
      if (exportBtn?.onPress) exportBtn.onPress()
    })

    const { findByLabelText } = renderScreen(<Settings />)

    const btn = await findByLabelText('Export all data as JSON')
    fireEvent.press(btn)

    await waitFor(() => {
      expect(estimateExportSize).toHaveBeenCalled()
    })
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
