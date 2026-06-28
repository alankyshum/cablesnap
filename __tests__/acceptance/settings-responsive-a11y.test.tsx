/**
 * __tests__/acceptance/settings-responsive-a11y.test.tsx
 *
 * BLD-2037 (P2-9, epic BLD-2028) — responsive + a11y regression tests for the
 * Settings masonry redesign (P0-1/P0-3/P0-4, now on main).
 *
 * The existing __tests__/acceptance/settings.test.tsx pins Settings to a single
 * compact width and exercises behavior of switches/buttons. This suite adds the
 * coverage the declutter epic's final phase calls for, asserted against the live
 * Settings screen:
 *
 *   AC: snapshot masonry at compact/medium/expanded  → column structure at 3 widths
 *   AC: tab/focus order matches reading order across  → source order preserved across
 *       columns                                          masonry columns
 *   AC: touch targets >=48px on all rows              → every redesign row (link rows
 *                                                        + version row) on the screen
 *
 * Structural (not pixel) assertions are used deliberately: RN-jest has no real
 * layout engine and the epic bans reveal-gating / headless-blank patterns, so we
 * encode the responsive contract via the Masonry column testIDs and source order
 * — deterministic and headless-safe. A pixel snapshot belongs in the Playwright
 * e2e surface, not here.
 */
import React from 'react'
import { StyleSheet } from 'react-native'
import { waitFor, within } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
// Derive the expected column distribution from the REAL masonry algorithm
// rather than hardcoding an i,i+3,i+6 split — keeps this suite in lockstep with
// distributeIntoColumns (mirrors __tests__/components/ui/Masonry.test.tsx).
import { distributeIntoColumns } from '../../components/ui/Masonry'

// ── Mutable layout mock — compact/medium/expanded presets (mirrors the
//    masonry-wide-screen suite). The jest babel-hoist rule requires the
//    factory-referenced variable to be "mock"-prefixed. ──
type LayoutReturn = {
  wide: boolean
  width: number
  scale: number
  windowClass: 'compact' | 'medium' | 'expanded'
  compact: boolean
  medium: boolean
  expanded: boolean
  atLeastMedium: boolean
  horizontalPadding: number
}

const mockCompactLayout: LayoutReturn = {
  wide: false, width: 390, scale: 1.0,
  windowClass: 'compact', compact: true, medium: false, expanded: false,
  atLeastMedium: false, horizontalPadding: 16,
}
const mockMediumLayout: LayoutReturn = {
  wide: true, width: 768, scale: 1.0,
  windowClass: 'medium', compact: false, medium: true, expanded: false,
  atLeastMedium: true, horizontalPadding: 24,
}
const mockExpandedLayout: LayoutReturn = {
  wide: true, width: 1200, scale: 1.0,
  windowClass: 'expanded', compact: false, medium: false, expanded: true,
  atLeastMedium: true, horizontalPadding: 32,
}

let mockLayoutReturn: LayoutReturn = { ...mockCompactLayout }

jest.mock('../../lib/layout', () => ({ useLayout: () => mockLayoutReturn }))
jest.mock('@/lib/layout', () => ({ useLayout: () => mockLayoutReturn }))

// ── expo-router ──
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

// ── app infra mocks (same surface as acceptance/settings.test.tsx) ──
jest.mock('../../lib/errors', () => ({
  logError: jest.fn(),
  getErrorCount: jest.fn().mockResolvedValue(2),
  clearErrorLog: jest.fn().mockResolvedValue(undefined),
  generateReport: jest.fn().mockResolvedValue('{}'),
  getRecentErrors: jest.fn().mockResolvedValue([]),
  generateGitHubURL: jest.fn().mockReturnValue('https://github.com'),
}))
jest.mock('../../lib/interactions', () => ({ log: jest.fn() }))
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
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({ write: jest.fn().mockResolvedValue(undefined), uri: 'file:///test' })),
  Paths: { cache: '/cache' },
}))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn().mockResolvedValue(undefined) }))
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn().mockResolvedValue({ canceled: true }) }))

jest.mock('../../lib/db', () => ({
  exportAllData: jest.fn().mockResolvedValue({ version: 7, app_version: '1.0.0', exported_at: '2026-04-15T00:00:00.000Z', data: {}, counts: {} }),
  importData: jest.fn().mockResolvedValue({ inserted: 0, skipped: 0, perTable: {} }),
  validateBackupFileSize: jest.fn().mockReturnValue(null),
  validateBackupData: jest.fn().mockReturnValue(null),
  getBackupCounts: jest.fn().mockReturnValue({}),
  getBackupCategoryCounts: jest.fn().mockReturnValue({}),
  getPresentBackupCategories: jest.fn().mockReturnValue(['workout_templates', 'exercises']),
  BACKUP_CATEGORY_ORDER: ['workout_templates', 'workout_history', 'exercises', 'nutrition', 'body_metrics', 'programs', 'plate_calculator_settings', 'rest_timer_settings', 'app_preferences', 'achievements'],
  BACKUP_CATEGORY_LABELS: {},
  BACKUP_TABLE_LABELS: {},
  IMPORT_TABLE_ORDER: [],
  getWorkoutCSVData: jest.fn().mockResolvedValue([]),
  getNutritionCSVData: jest.fn().mockResolvedValue([]),
  getBodyWeightCSVData: jest.fn().mockResolvedValue([]),
  getBodyMeasurementsCSVData: jest.fn().mockResolvedValue([]),
  getCSVCounts: jest.fn().mockResolvedValue({ sessions: 5, entries: 12 }),
  getAppSetting: jest.fn().mockResolvedValue('true'),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
  deleteAppSetting: jest.fn().mockResolvedValue(undefined),
  getSchedule: jest.fn().mockResolvedValue([{ day: 1 }, { day: 3 }, { day: 5 }]),
  getBodySettings: jest.fn().mockResolvedValue({ weight_unit: 'kg', measurement_unit: 'cm', weight_goal: null, body_fat_goal: null }),
  updateBodySettings: jest.fn().mockResolvedValue(undefined),
  getStravaConnection: jest.fn().mockResolvedValue(null),
}))
jest.mock('../../lib/db/macro-coach-settings', () => ({
  getEnabled: jest.fn().mockResolvedValue(false),
}))
jest.mock('../../lib/strava', () => ({
  connectStrava: jest.fn().mockResolvedValue(null),
  disconnect: jest.fn().mockResolvedValue(undefined),
}))

import Settings from '../../app/(tabs)/settings'

const MASONRY = 'settings-masonry'

/**
 * Source order of the Settings masonry tiles wrapped in <SettingsTile> on
 * `main` (= this PR's base). Used to assert that the visual column distribution
 * preserves reading/source order.
 *
 * NOTE: Integrations & Feedback render as bare <IntegrationsCard>/<FeedbackCard>
 * here (no settings-tile-* testID). Wrapping them as 2 additional tiles is the
 * scope of BLD-2090/2091 (PR #658); their tile coverage lands once #658 merges.
 * This suite deliberately validates only the 7 real tiles so it has no
 * merge-order dependency on #658.
 */
const TILE_ORDER = [
  'settings-tile-profile',
  'settings-tile-units-appearance',
  'settings-tile-training',
  'settings-tile-notifications',
  'settings-tile-coaching',
  'settings-tile-data-backup',
  'settings-tile-about',
]

/** Flatten an RNTL node's style (array / Pressable-callback result / object). */
function flatStyle(style: unknown): Record<string, unknown> {
  return (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>
}

beforeEach(() => {
  jest.clearAllMocks()
  mockLayoutReturn = { ...mockCompactLayout }
})

// ─────────────────────────────────────────────────────────────────────────────
// Responsive structure — masonry columns at compact / medium / expanded
// ─────────────────────────────────────────────────────────────────────────────

describe('Settings masonry — responsive column structure (BLD-2037 P2-9)', () => {
  it('compact (390): single-column fast path — masonry present, no -col-N wrappers', async () => {
    mockLayoutReturn = { ...mockCompactLayout }
    const { getByTestId, queryByTestId } = renderScreen(<Settings />)
    await waitFor(() => expect(getByTestId(MASONRY)).toBeTruthy())
    expect(queryByTestId(`${MASONRY}-col-0`)).toBeNull()
    expect(queryByTestId(`${MASONRY}-col-1`)).toBeNull()
  })

  it('medium (768): renders exactly 2 columns', async () => {
    mockLayoutReturn = { ...mockMediumLayout }
    const { getByTestId, queryByTestId } = renderScreen(<Settings />)
    await waitFor(() => expect(getByTestId(`${MASONRY}-col-0`)).toBeTruthy())
    expect(getByTestId(`${MASONRY}-col-1`)).toBeTruthy()
    expect(queryByTestId(`${MASONRY}-col-2`)).toBeNull()
  })

  it('expanded (1200): renders exactly 3 columns', async () => {
    mockLayoutReturn = { ...mockExpandedLayout }
    const { getByTestId, queryByTestId } = renderScreen(<Settings />)
    await waitFor(() => expect(getByTestId(`${MASONRY}-col-0`)).toBeTruthy())
    expect(getByTestId(`${MASONRY}-col-1`)).toBeTruthy()
    expect(getByTestId(`${MASONRY}-col-2`)).toBeTruthy()
    expect(queryByTestId(`${MASONRY}-col-3`)).toBeNull()
  })

  it('renders all 7 themed tiles at every width with no onLayout fired (headless-safe, no reveal-gating)', async () => {
    for (const layout of [mockCompactLayout, mockMediumLayout, mockExpandedLayout]) {
      mockLayoutReturn = { ...layout }
      const { getByTestId, unmount } = renderScreen(<Settings />)
      // No fireEvent(..., 'layout') — assert full render with zero measurement.
      await waitFor(() => expect(getByTestId('settings-tile-profile')).toBeTruthy())
      for (const id of TILE_ORDER) expect(getByTestId(id)).toBeTruthy()
      unmount()
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Reading / focus order preserved across columns (a11y)
// ─────────────────────────────────────────────────────────────────────────────

describe('Settings masonry — reading order across columns (BLD-2037 P2-9)', () => {
  /**
   * Read the tile testIDs present in a column subtree, in tree (= source) order.
   * Tiles are nested (each tile contains rows with their own testIDs), so we
   * filter to the known top-level tile IDs only.
   */
  function tilesInColumn(col: ReturnType<ReturnType<typeof within>['getAllByTestId']>[number] | unknown): string[] {
    const node = col as Parameters<typeof within>[0]
    return within(node)
      .queryAllByTestId(/^settings-tile-/)
      .map((n) => String(n.props.testID))
      .filter((id) => TILE_ORDER.includes(id))
  }

  it('expanded: each column lists its tiles in ascending source order, and columns concatenate back to source order (focus order intact)', async () => {
    mockLayoutReturn = { ...mockExpandedLayout }
    const { getByTestId } = renderScreen(<Settings />)
    await waitFor(() => expect(getByTestId(`${MASONRY}-col-0`)).toBeTruthy())

    const cols = [0, 1, 2].map((i) => tilesInColumn(getByTestId(`${MASONRY}-col-${i}`)))

    // 1. Every column preserves ascending source order (a11y: visual column
    //    placement never reverses reading order within a column).
    const rank = (id: string) => TILE_ORDER.indexOf(id)
    for (const col of cols) {
      const ranks = col.map(rank)
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    }

    // 2. All 7 tiles are distributed exactly once across the 3 columns.
    const flat = cols.flat()
    expect(flat.slice().sort()).toEqual([...TILE_ORDER].slice().sort())

    // 3. Tier-1 (headless: onLayout never fires → equal weights) distribution.
    //    Derive the expected per-column arrays from the SAME algorithm the
    //    screen uses (distributeIntoColumns, shortest-col-first → round-robin)
    //    instead of hardcoding the split.
    //
    //    CRITICAL: the Masonry receives all 9 settings.tsx children in source
    //    order — the 7 SettingsTile tiles PLUS the 2 bare cards Integrations
    //    (source idx 5) and Feedback (source idx 7), which carry no
    //    settings-tile-* testID. Those bare cards still occupy column slots and
    //    shift the tiles, so we must distribute the full 9-child sequence and
    //    only THEN filter to the visible tile IDs (matching what tilesInColumn
    //    reads back). Modeling only the 7 tiles would mis-predict the columns.
    //    The 2 bare cards become real tiles in BLD-2090/2091 (PR #658).
    const MASONRY_CHILDREN_IN_SOURCE_ORDER = [
      'settings-tile-profile',
      'settings-tile-units-appearance',
      'settings-tile-training',
      'settings-tile-notifications',
      'settings-tile-coaching',
      'bare-integrations-card', // no settings-tile-* testID (BLD-2090/2091)
      'settings-tile-data-backup',
      'bare-feedback-card', // no settings-tile-* testID (BLD-2090/2091)
      'settings-tile-about',
    ]
    // Zero weights model the unmeasured first-paint case
    // (mirrors __tests__/components/ui/Masonry.test.tsx).
    const expectedCols = distributeIntoColumns(
      MASONRY_CHILDREN_IN_SOURCE_ORDER,
      3,
      MASONRY_CHILDREN_IN_SOURCE_ORDER.map(() => 0),
    ).map((col) => col.filter((id) => TILE_ORDER.includes(id)))
    expect(cols).toEqual(expectedCols)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Touch targets >=48px on the redesign's rows (a11y)
// ─────────────────────────────────────────────────────────────────────────────

describe('Settings masonry — touch targets >=48px on rows (BLD-2037 P2-9)', () => {
  it('every SettingsLinkRow on the screen has minHeight >= 48', async () => {
    mockLayoutReturn = { ...mockCompactLayout }
    const { getByTestId, findByLabelText } = renderScreen(<Settings />)
    await waitFor(() => expect(getByTestId(MASONRY)).toBeTruthy())

    // The three link rows added by the redesign (Training x2, Coaching x1),
    // located by their accessibility labels.
    const labels = [
      'Open gym profiles settings',
      'Open advanced set types help',
      'Open Adaptive Macro Coach settings',
    ]
    for (const label of labels) {
      const row = await findByLabelText(label)
      expect(row.props.accessibilityRole).toBe('button')
      const style = flatStyle(row.props.style)
      expect(style.minHeight as number).toBeGreaterThanOrEqual(48)
    }
  })

  it('the About version row has minHeight >= 48 and is an accessible button', async () => {
    mockLayoutReturn = { ...mockCompactLayout }
    const { getByTestId } = renderScreen(<Settings />)
    const versionRow = await waitFor(() => getByTestId('settings-version-row'))
    expect(versionRow.props.accessibilityRole).toBe('button')
    const style = flatStyle(versionRow.props.style)
    expect(style.minHeight as number).toBeGreaterThanOrEqual(48)
  })
})
