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
jest.mock('../../lib/layout', () => ({
  useLayout: () => ({ wide: false, width: 375, scale: 1.0, horizontalPadding: 16 }),
}))
jest.mock('../../lib/errors', () => ({
  logError: jest.fn(),
  getErrorCount: jest.fn().mockResolvedValue(2),
  clearErrorLog: jest.fn().mockResolvedValue(undefined),
  generateReport: jest.fn().mockResolvedValue('{}'),
  getRecentErrors: jest.fn().mockResolvedValue([]),
  generateGitHubURL: jest.fn().mockReturnValue('https://github.com'),
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
  scheduleReminders: jest.fn().mockResolvedValue(3),
  cancelAll: jest.fn().mockResolvedValue(undefined),
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

const mockUpdateBodySettings = jest.fn().mockResolvedValue(undefined)
const mockSetAppSetting = jest.fn().mockResolvedValue(undefined)
const mockGetAppSetting = jest.fn().mockResolvedValue('true')
const mockGetBodySettings = jest.fn().mockResolvedValue({
  weight_unit: 'kg',
  measurement_unit: 'cm',
  weight_goal: null,
  body_fat_goal: null,
})

jest.mock('../../lib/db', () => ({
  exportAllData: jest.fn().mockResolvedValue({ version: 7, app_version: '1.0.0', exported_at: '2026-04-15T00:00:00.000Z', data: {}, counts: {} }),
  importData: jest.fn().mockResolvedValue({ inserted: 0, skipped: 0, perTable: {} }),
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
  getWorkoutCSVData: jest.fn().mockResolvedValue([]),
  getNutritionCSVData: jest.fn().mockResolvedValue([]),
  getBodyWeightCSVData: jest.fn().mockResolvedValue([]),
  getBodyMeasurementsCSVData: jest.fn().mockResolvedValue([]),
  getCSVCounts: jest.fn().mockResolvedValue({ sessions: 5, entries: 12 }),
  getAppSetting: (...args: unknown[]) => mockGetAppSetting(...args),
  setAppSetting: (...args: unknown[]) => mockSetAppSetting(...args),
  deleteAppSetting: jest.fn().mockResolvedValue(undefined),
  getSchedule: jest.fn().mockResolvedValue([{ day: 1 }, { day: 3 }, { day: 5 }]),
  getBodySettings: (...args: unknown[]) => mockGetBodySettings(...args),
  updateBodySettings: (...args: unknown[]) => mockUpdateBodySettings(...args),
  getStravaConnection: jest.fn().mockResolvedValue(null),
}))

jest.mock('../../lib/strava', () => ({
  connectStrava: jest.fn().mockResolvedValue(null),
  disconnect: jest.fn().mockResolvedValue(undefined),
}))

import Settings, { SETTINGS_SCROLL_EXTRA_BOTTOM } from '../../app/(tabs)/settings'
import { FLOATING_TAB_BAR_HEIGHT } from '../../components/FloatingTabBar'
import { spacing } from '../../constants/design-tokens'

const { setEnabled: mockSetAudioEnabled } = require('../../lib/audio')
const { requestPermission, scheduleReminders, cancelAll } = require('../../lib/notifications')

describe('Settings Screen Acceptance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetBodySettings.mockResolvedValue({
      weight_unit: 'kg',
      measurement_unit: 'cm',
      weight_goal: null,
      body_fat_goal: null,
    })
    mockGetAppSetting.mockResolvedValue('true')
  })

  // ── Screen Structure & About ──────────────────────────────────

  it('renders all section titles, app name/version, and open-source description', async () => {
    const { findByText } = renderScreen(<Settings />)
    expect(await findByText('Units')).toBeTruthy()
    expect(await findByText('Preferences')).toBeTruthy()
    expect(await findByText('Data Management')).toBeTruthy()
    expect(await findByText('Feedback & Reports')).toBeTruthy()
    expect(await findByText('About')).toBeTruthy()
    expect(await findByText(/CableSnap v/)).toBeTruthy()
    expect(await findByText(/Free & open-source workout tracker/)).toBeTruthy()
  })

  // ── BLD-2090: All 9 tiles use SettingsTile (visual consistency) ──────────────────────────────────

  it('renders all 9 SettingsTile testIDs — Integrations and Feedback wrapped as peers (BLD-2090)', async () => {
    const { findByTestId } = renderScreen(<Settings />)
    // Verify all 9 tiles render via SettingsTile (consistent padding/heading)
    expect(await findByTestId('settings-tile-profile')).toBeTruthy()
    expect(await findByTestId('settings-tile-units-appearance')).toBeTruthy()
    expect(await findByTestId('settings-tile-training')).toBeTruthy()
    expect(await findByTestId('settings-tile-notifications')).toBeTruthy()
    expect(await findByTestId('settings-tile-coaching')).toBeTruthy()
    expect(await findByTestId('settings-tile-integrations')).toBeTruthy()
    expect(await findByTestId('settings-tile-data-backup')).toBeTruthy()
    expect(await findByTestId('settings-tile-feedback')).toBeTruthy()
    expect(await findByTestId('settings-tile-about')).toBeTruthy()
  })

  it('Integrations tile renders its title heading via SettingsTile (BLD-2090)', async () => {
    const { findByText } = renderScreen(<Settings />)
    expect(await findByText('Integrations')).toBeTruthy()
  })

  // ── Unit Toggles (Weight kg/lb) ──────────────────────────────────

  it('shows weight unit toggle defaulting to kg with both options visible', async () => {
    const { findByText } = renderScreen(<Settings />)
    expect(await findByText('Weight')).toBeTruthy()
    expect(await findByText('kg')).toBeTruthy()
    expect(await findByText('lb')).toBeTruthy()
  })

  it('weight unit toggle calls updateBodySettings when lb is pressed', async () => {
    const { findByText } = renderScreen(<Settings />)
    await findByText('Units')

    const lbButton = await findByText('lb')
    fireEvent.press(lbButton)

    await waitFor(() => {
      expect(mockUpdateBodySettings).toHaveBeenCalledWith('lb', 'cm', null, null)
    })
  })

  it('weight unit toggle calls updateBodySettings when kg is pressed after switching to lb', async () => {
    mockGetBodySettings.mockResolvedValue({
      weight_unit: 'lb',
      measurement_unit: 'cm',
      weight_goal: null,
      body_fat_goal: null,
    })

    const { findByText } = renderScreen(<Settings />)
    await findByText('Units')

    const kgButton = await findByText('kg')
    fireEvent.press(kgButton)

    await waitFor(() => {
      expect(mockUpdateBodySettings).toHaveBeenCalledWith('kg', 'cm', null, null)
    })
  })

  // ── Unit Toggles (Measurements cm/in) ──────────────────────────────────

  it('shows measurement unit toggle defaulting to cm and updates when in is pressed', async () => {
    const { findAllByText, findByText } = renderScreen(<Settings />)
    const matches = await findAllByText('Measurements')
    expect(matches.length).toBeGreaterThanOrEqual(1)
    expect(await findByText('cm')).toBeTruthy()
    expect(await findByText('in')).toBeTruthy()

    const inButton = await findByText('in')
    fireEvent.press(inButton)

    await waitFor(() => {
      expect(mockUpdateBodySettings).toHaveBeenCalledWith('kg', 'in', null, null)
    })
  })

  // ── Timer Sound Toggle ──────────────────────────────────

  it('Timer Sound switch renders, has accessible label, and saves setting on toggle off', async () => {
    const { findByLabelText } = renderScreen(<Settings />)
    const toggle = await findByLabelText('Timer Sound')
    expect(toggle).toBeTruthy()

    fireEvent(toggle, 'valueChange', false)

    await waitFor(() => {
      expect(mockSetAudioEnabled).toHaveBeenCalledWith('timer', false)
    })
    await waitFor(() => {
      expect(mockSetAppSetting).toHaveBeenCalledWith('timer_sound_enabled', 'false')
    })
  })

  it('Timer Sound switch saves setting on toggle on (starting from off)', async () => {
    mockGetAppSetting.mockResolvedValue('false')

    const { findByLabelText } = renderScreen(<Settings />)
    const toggle = await findByLabelText('Timer Sound')

    fireEvent(toggle, 'valueChange', true)

    await waitFor(() => {
      expect(mockSetAudioEnabled).toHaveBeenCalledWith('timer', true)
    })
    await waitFor(() => {
      expect(mockSetAppSetting).toHaveBeenCalledWith('timer_sound_enabled', 'true')
    })
  })

  // ── Workout Reminders Toggle ──────────────────────────────────

  it('Workout Reminders switch renders, has accessible label, and enables reminders when toggled on', async () => {
    // Start with reminders off
    mockGetAppSetting.mockImplementation((key: string) => {
      if (key === 'reminders_enabled') return Promise.resolve('false')
      if (key === 'timer_sound_enabled') return Promise.resolve('true')
      return Promise.resolve(null)
    })

    const { findByLabelText } = renderScreen(<Settings />)
    const toggle = await findByLabelText('Workout Reminders')
    expect(toggle).toBeTruthy()

    fireEvent(toggle, 'valueChange', true)

    await waitFor(() => {
      expect(requestPermission).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(scheduleReminders).toHaveBeenCalled()
    })
  })

  it('Workout Reminders switch disables reminders when toggled off', async () => {
    // Start with reminders on
    mockGetAppSetting.mockImplementation((key: string) => {
      if (key === 'reminders_enabled') return Promise.resolve('true')
      if (key === 'timer_sound_enabled') return Promise.resolve('true')
      return Promise.resolve(null)
    })

    const { findByLabelText } = renderScreen(<Settings />)
    const toggle = await findByLabelText('Workout Reminders')

    fireEvent(toggle, 'valueChange', false)

    await waitFor(() => {
      expect(cancelAll).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(mockSetAppSetting).toHaveBeenCalledWith('reminders_enabled', 'false')
    })
  })

  it('shows schedule-required snack and persistent error hint when no workout days scheduled', async () => {
    const { getSchedule } = require('../../lib/db')
    getSchedule.mockResolvedValue([])

    mockGetAppSetting.mockImplementation((key: string) => {
      if (key === 'reminders_enabled') return Promise.resolve('false')
      if (key === 'timer_sound_enabled') return Promise.resolve('true')
      return Promise.resolve(null)
    })

    const { findByLabelText, findByText } = renderScreen(<Settings />)

    // Persistent schedule hint visible up-front
    expect(await findByText(/No workout days scheduled/)).toBeTruthy()

    const toggle = await findByLabelText('Workout Reminders')
    fireEvent(toggle, 'valueChange', true)

    await waitFor(() => {
      expect(requestPermission).not.toHaveBeenCalled()
    })
    expect(await findByText(/No workout schedule set/)).toBeTruthy()
  })

  it('shows permission-denied snack when permission is denied on toggle', async () => {
    const { getSchedule } = require('../../lib/db')
    getSchedule.mockResolvedValue([{ day: 1 }, { day: 3 }, { day: 5 }])
    requestPermission.mockResolvedValue(false)

    mockGetAppSetting.mockImplementation((key: string) => {
      if (key === 'reminders_enabled') return Promise.resolve('false')
      if (key === 'timer_sound_enabled') return Promise.resolve('true')
      return Promise.resolve(null)
    })

    const { findByLabelText, findByText } = renderScreen(<Settings />)
    const toggle = await findByLabelText('Workout Reminders')

    fireEvent(toggle, 'valueChange', true)

    await waitFor(() => {
      expect(requestPermission).toHaveBeenCalled()
    })
    expect(await findByText(/Notifications blocked/)).toBeTruthy()
  })

  // ── Export/Import & CSV ──────────────────────────────────

  it('Export All and Import buttons are pressable with accessible labels', async () => {
    const { findByLabelText } = renderScreen(<Settings />)
    const exportBtn = await findByLabelText('Export all data as JSON')
    expect(exportBtn).toBeTruthy()
    fireEvent.press(exportBtn)
    // Pressing triggers the export — just verify it doesn't crash

    const importBtn = await findByLabelText('Import data')
    expect(importBtn).toBeTruthy()
    fireEvent.press(importBtn)
  })

  it('Export All button opens the selective export sheet', async () => {
    const { findByLabelText, findByText } = renderScreen(<Settings />)
    const btn = await findByLabelText('Export all data as JSON')
    expect(btn).toBeTruthy()
    fireEvent.press(btn)
    expect(await findByText('Choose what to export')).toBeTruthy()
    expect(await findByText('Workout templates')).toBeTruthy()
  })

  it('CSV export buttons and date range selector buttons have accessible labels', async () => {
    const { findByLabelText } = renderScreen(<Settings />)
    expect(await findByLabelText('Export workouts as CSV')).toBeTruthy()
    expect(await findByLabelText('Export nutrition as CSV')).toBeTruthy()
    expect(await findByLabelText('Export body weight as CSV')).toBeTruthy()
    expect(await findByLabelText('Export body measurements as CSV')).toBeTruthy()
    expect(await findByLabelText('Date range 7 days')).toBeTruthy()
    expect(await findByLabelText('Date range 30 days')).toBeTruthy()
    expect(await findByLabelText('Date range 90 days')).toBeTruthy()
    expect(await findByLabelText('Date range All')).toBeTruthy()
  })

  // ── Feedback & Reports ──────────────────────────────────

  it.each([
    { label: 'Report a bug', expected: { pathname: '/feedback', params: { type: 'bug' } } },
    { label: 'Request a feature', expected: { pathname: '/feedback', params: { type: 'feature' } } },
  ])('$label button navigates to feedback screen with correct params', async ({ label, expected }) => {
    const { findByLabelText } = renderScreen(<Settings />)
    const btn = await findByLabelText(label)
    fireEvent.press(btn)

    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith(expect.objectContaining(expected))
    })
  })

  it('Error log button shows count, renders as single text node, and navigates on press', async () => {
    const { findByLabelText, findByText } = renderScreen(<Settings />)

    // Renders count as single text node (no View-wrapped text)
    expect(await findByText('Errors (2)')).toBeTruthy()

    const btn = await findByLabelText(/View error log/)
    fireEvent.press(btn)

    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith('/errors')
    })
  })

  // ── Accessibility ──────────────────────────────────

  it('all switches have accessibilityRole="switch" and accessibilityHint text', async () => {
    const { findByLabelText } = renderScreen(<Settings />)
    const timerSound = await findByLabelText('Timer Sound')
    const remindersToggle = await findByLabelText('Workout Reminders')

    expect(timerSound.props.accessibilityRole).toBe('switch')
    expect(remindersToggle.props.accessibilityRole).toBe('switch')
    expect(timerSound.props.accessibilityHint).toBeTruthy()
    expect(remindersToggle.props.accessibilityHint).toBeTruthy()
  })

  // ── Scroll padding rhythm (BLD-1106 regression + BLD-2034 tokenization) ──────

  it('ScrollView contentContainerStyle is a flat object with paddingBottom === FLOATING_TAB_BAR_HEIGHT + SETTINGS_SCROLL_EXTRA_BOTTOM', () => {
    const { getByTestId } = renderScreen(<Settings />)
    const scroll = getByTestId('settings-scroll-view')
    // contentContainerStyle must be a single flat object — no style-array merge ambiguity.
    // useSafeAreaInsets returns { bottom: 0 } in test env, so tabBarHeight = FLOATING_TAB_BAR_HEIGHT.
    // BLD-2034 (epic BLD-2028 P1-6): the extra clearance is now derived from spacing
    // tokens (spacing.xxl * 5 = 160), not a bare magic number ("no stray magic numbers").
    // The 160 clearance is preserved unchanged from the prior literal and must stay >= 96:
    // git history shows it was raised 48 -> 96 -> 160 because the absolutely-positioned
    // floating tab bar still overlapped / blocked interaction on the bottom cards
    // (BMC/thanks.dev badges, About) on Z Fold6 and Android gesture-nav where insets.bottom
    // reports 0 (BLD-1106 -> BLD-1124, GitHub #533). This assertion guards that regression.
    const style = scroll.props.contentContainerStyle
    expect(style).not.toBeInstanceOf(Array)
    // Inset is a spacing-token expression, not an ad-hoc literal, and preserves the
    // validated foldable clearance.
    expect(SETTINGS_SCROLL_EXTRA_BOTTOM).toBe(spacing.xxl * 5)
    expect(SETTINGS_SCROLL_EXTRA_BOTTOM).toBeGreaterThanOrEqual(96)
    expect(style.paddingBottom).toBe(FLOATING_TAB_BAR_HEIGHT + SETTINGS_SCROLL_EXTRA_BOTTOM)
  })
})
