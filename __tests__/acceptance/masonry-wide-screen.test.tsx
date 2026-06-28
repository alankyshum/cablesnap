/**
 * BLD-2076 — Wide-screen Masonry render tests for PR #654 (BLD-2033)
 *
 * Asserts that the Masonry container (surface-specific testID) mounts on the
 * wide path and is absent on compact. Covers all 5 surfaces added in BLD-2033:
 *
 *   1. app/(tabs)/index.tsx                    → home-masonry
 *   2. components/progress/WorkoutSegment.tsx  → workout-progress-masonry (+ 3-col)
 *   3. components/progress/BodySegment.tsx     → body-segment-masonry
 *   4. components/progress/NutritionSegment.tsx → nutrition-progress-masonry
 *   5. components/progress/MonthlyReportSegment → monthly-report-masonry
 */

import React from 'react'
import { waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'

// ── Mutable layout mock — override layoutReturn in beforeEach per describe ──
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

// Jest babel-hoist rule: variables referenced in jest.mock factories must be
// prefixed with "mock" (case-insensitive). Hence "mockLayoutReturn".
let mockLayoutReturn: LayoutReturn = {
  wide: false, width: 375, scale: 1.0,
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

const mockCompactLayout: LayoutReturn = {
  wide: false, width: 390, scale: 1.0,
  windowClass: 'compact', compact: true, medium: false, expanded: false,
  atLeastMedium: false, horizontalPadding: 16,
}

// Layout mocks — these are hoisted so the factory must read from the mutable var
jest.mock('../../lib/layout', () => ({
  useLayout: () => mockLayoutReturn,
}))
jest.mock('@/lib/layout', () => ({
  useLayout: () => mockLayoutReturn,
}))

// ── expo-router ──────────────────────────────────────────────────────────────
jest.mock('expo-router', () => {
  const RealReact = require('react')
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
    useLocalSearchParams: () => ({}),
    usePathname: () => '/',
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

// ── Icon + device/platform stubs ─────────────────────────────────────────────
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}))
jest.mock('expo-localization', () => ({ getCalendars: () => [{ firstWeekday: 1 }] }))
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }))
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }))

// ── Animations / reanimated ──────────────────────────────────────────────────
jest.mock('react-native-reanimated', () => {
  const { View: RNView } = require('react-native')
  return {
    __esModule: true,
    default: {
      View: RNView,
      Text: require('react-native').Text,
      createAnimatedComponent: (c: unknown) => c,
    },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    withSequence: (...args: unknown[]) => args[args.length - 1],
    withDelay: (_d: unknown, v: unknown) => v,
    useReducedMotion: () => false,
    FadeInDown: { duration: () => ({ delay: () => ({}) }) },
    FadeIn: { duration: () => ({ delay: () => undefined }) },
    FadeOut: { duration: () => undefined },
    Easing: { out: () => {}, bezier: () => (t: unknown) => t },
    createAnimatedComponent: (c: unknown) => c,
    runOnJS: (fn: (...a: unknown[]) => unknown) => fn,
  }
})
jest.mock('react-native-body-highlighter', () => {
  const { View } = require('react-native')
  return { __esModule: true, default: () => <View /> }
})

// ── charting ─────────────────────────────────────────────────────────────────
jest.mock('victory-native', () => ({
  CartesianChart: 'CartesianChart',
  Line: 'Line',
  Bar: 'Bar',
}))

// ── app infra ─────────────────────────────────────────────────────────────────
jest.mock('../../lib/errors', () => ({
  logError: jest.fn(),
  generateReport: jest.fn().mockResolvedValue('{}'),
  getRecentErrors: jest.fn().mockResolvedValue([]),
  generateGitHubURL: jest.fn().mockReturnValue('https://github.com'),
}))
jest.mock('../../lib/interactions', () => ({ log: jest.fn(), recent: jest.fn().mockResolvedValue([]) }))
jest.mock('../../lib/units', () => ({
  toDisplay: (v: number) => v,
  toKg: (v: number) => v,
  KG_TO_LB: 2.20462,
  LB_TO_KG: 0.453592,
}))
jest.mock('../../lib/query', () => ({
  useFocusRefetch: jest.fn(),
  bumpQueryVersion: jest.fn(),
  getQueryVersion: jest.fn().mockReturnValue(0),
}))
jest.mock('../../lib/rpe', () => ({ rpeColor: () => '#4CAF50', rpeText: () => '#fff' }))
jest.mock('../../lib/starter-templates', () => ({ STARTER_TEMPLATES: [] }))

// ── components infra ─────────────────────────────────────────────────────────
jest.mock('../../components/FloatingTabBar', () => ({
  useFloatingTabBarHeight: () => 64,
}))
jest.mock('../../components/MuscleVolumeSegment', () => 'MuscleVolumeSegment')
jest.mock('../../components/ui/bna-toast', () => ({
  ToastProvider: ({ children }: { children: unknown }) => children,
  useToast: () => ({
    toast: jest.fn(), success: jest.fn(), error: jest.fn(),
    warning: jest.fn(), info: jest.fn(), dismiss: jest.fn(), dismissAll: jest.fn(),
  }),
}))
// WeeklySummary imports from @/lib/db (alias path) which is a separate Jest module
// target from ../../lib/db — stub the whole component to avoid seeding errors.
jest.mock('../../components/WeeklySummary', () => 'WeeklySummary')
// WorkoutSegment child cards — stub so only the Masonry container matters
jest.mock('../../components/progress/WorkoutCards', () => ({
  WorkoutChartCard: 'WorkoutChartCard',
  SessionsByGymCard: 'SessionsByGymCard',
  SessionsCard: 'SessionsCard',
}))
jest.mock('../../components/progress/PRSummaryCard', () => ({ PRSummaryCard: 'PRSummaryCard' }))
jest.mock('../../components/progress/TrendCards', () => ({
  RPETrendCard: 'RPETrendCard',
  RatingTrendCard: 'RatingTrendCard',
}))
jest.mock('../../components/progress/StrengthLevelsCard', () => 'StrengthLevelsCard')
jest.mock('../../components/progress/ActiveGoalsCard', () => 'ActiveGoalsCard')
jest.mock('../../components/progress/WorkoutEmptyState', () => 'WorkoutEmptyState')
jest.mock('../../components/progress/CalendarView', () => 'CalendarView')

// ── theme ─────────────────────────────────────────────────────────────────────
jest.mock('@/hooks/useThemeColors', () => {
  const { lightMockColors } = require('../helpers/theme')
  return { useThemeColors: () => lightMockColors }
})

// ── db/settings ──────────────────────────────────────────────────────────────
jest.mock('../../lib/db/settings', () => ({
  getAppSetting: jest.fn().mockResolvedValue(null),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
  deleteAppSetting: jest.fn().mockResolvedValue(undefined),
  isOnboardingComplete: jest.fn().mockResolvedValue(true),
  getSchedule: jest.fn().mockResolvedValue([]),
  getTodaySchedule: jest.fn().mockResolvedValue(null),
  isTodayCompleted: jest.fn().mockResolvedValue(false),
  getWeekAdherence: jest.fn().mockResolvedValue([]),
  getWeeklyCompletedCount: jest.fn().mockResolvedValue(0),
  insertInteraction: jest.fn().mockResolvedValue(undefined),
  getInteractions: jest.fn().mockResolvedValue([]),
  clearInteractions: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../../lib/db/body', () => ({
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
jest.mock('../../lib/db/calendar', () => ({
  getCalendarDays: jest.fn().mockResolvedValue([]),
  getCalendarDayDetail: jest.fn().mockResolvedValue(null),
  getActiveProgram: jest.fn().mockResolvedValue(null),
}))
jest.mock('../../lib/db/pr-dashboard', () => ({
  getPRStats: jest.fn().mockResolvedValue({ totalPRs: 0, prsThisMonth: 0 }),
  getRecentPRsWithDelta: jest.fn().mockResolvedValue([]),
}))

// ── main db ───────────────────────────────────────────────────────────────────
const mockMonthlyData = {
  workouts: {
    sessionCount: 16, totalDurationSeconds: 66600,
    totalVolume: 42350, previousMonthVolume: 37500, previousMonthSessionCount: 13,
  },
  prs: [{ exerciseId: 'ex1', exerciseName: 'Bench Press', weight: 100 }],
  trainingDays: 22, longestStreak: 5,
  muscleDistribution: [{ muscle: 'chest', sets: 18 }],
  mostImproved: { exerciseId: 'ex3', exerciseName: 'Overhead Press', percentChange: 8 },
  body: { startWeight: 82.0, endWeight: 81.5 },
  nutrition: { daysTracked: 26, daysOnTarget: 18 },
}

jest.mock('../../lib/db', () => ({
  // home tab
  getTemplates: jest.fn().mockResolvedValue([]),
  getRecentSessions: jest.fn().mockResolvedValue([]),
  getActiveSession: jest.fn().mockResolvedValue(null),
  getAllCompletedSessionWeeks: jest.fn().mockResolvedValue([]),
  getRecentPRs: jest.fn().mockResolvedValue([]),
  startSession: jest.fn().mockResolvedValue({ id: 'session-new' }),
  getTemplateExerciseCounts: jest.fn().mockResolvedValue({}),
  getTemplatePrimaryMuscles: jest.fn().mockResolvedValue({}),
  getSessionSetCounts: jest.fn().mockResolvedValue({}),
  getSessionAvgRPEs: jest.fn().mockResolvedValue({}),
  getTemplateDurationEstimates: jest.fn().mockResolvedValue({}),
  getTodaySchedule: jest.fn().mockResolvedValue(null),
  isTodayCompleted: jest.fn().mockResolvedValue(false),
  getWeekAdherence: jest.fn().mockResolvedValue([]),
  getMuscleRecoveryStatus: jest.fn().mockResolvedValue([]),
  getWeeklyVolume: jest.fn().mockResolvedValue([]),
  getE1RMTrends: jest.fn().mockResolvedValue([]),
  getTotalSessionCount: jest.fn().mockResolvedValue(0),
  getWeeklyE1RMTrends: jest.fn().mockResolvedValue([]),
  getRecentSessionRPEs: jest.fn().mockResolvedValue([]),
  getRecentSessionRatings: jest.fn().mockResolvedValue([]),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
  getWeeklyCompletedCount: jest.fn().mockResolvedValue(0),
  getActiveGoals: jest.fn().mockResolvedValue([]),
  getCurrentBestWeight: jest.fn().mockResolvedValue(null),
  getCurrentBestReps: jest.fn().mockResolvedValue(null),
  getExerciseById: jest.fn().mockResolvedValue(null),
  getCurrentBestWeightsByExercise: jest.fn().mockResolvedValue({}),
  getCurrentBestRepsByExercise: jest.fn().mockResolvedValue({}),
  getExercisesByIds: jest.fn().mockResolvedValue([]),
  getWeeklyWorkouts: jest.fn().mockResolvedValue({
    totalVolume: 0, previousWeekVolume: null,
    totalDurationSeconds: 0, sessionCount: 0,
  }),
  getBodySettings: jest.fn().mockResolvedValue({ weight_unit: 'kg', measurement_unit: 'cm' }),
  getAppSetting: jest.fn().mockResolvedValue(null),
  getTodayQuickAddSummary: jest.fn().mockResolvedValue([]),
  // progress tab — WorkoutSegment: return 2 sessions so `empty` guard is bypassed
  getWeeklySessionCounts: jest.fn().mockResolvedValue([
    { week: '2026-W25', count: 4 },
    { week: '2026-W26', count: 3 },
  ]),
  getCompletedSessionsWithSetCount: jest.fn().mockResolvedValue([
    { id: 's1', name: 'Push Day', started_at: Date.now() - 86400000, duration_seconds: 3600, set_count: 5 },
    { id: 's2', name: 'Pull Day', started_at: Date.now() - 172800000, duration_seconds: 2700, set_count: 6 },
  ]),
  getPersonalRecords: jest.fn().mockResolvedValue([]),
  // BodySegment: count>0 so the "Log your first weigh-in" empty state is bypassed
  getLatestBodyWeight: jest.fn().mockResolvedValue({ id: 'bw1', weight: 80, date: '2026-06-20', notes: null }),
  getPreviousBodyWeight: jest.fn().mockResolvedValue(null),
  getBodyWeightEntries: jest.fn().mockResolvedValue([
    { id: 'bw1', weight: 80, date: '2026-06-20', notes: null },
    { id: 'bw2', weight: 79.5, date: '2026-06-14', notes: null },
  ]),
  getBodyWeightCount: jest.fn().mockResolvedValue(2),
  getBodyWeightChartData: jest.fn().mockResolvedValue([
    { date: '2026-06-14', weight: 79.5 },
    { date: '2026-06-20', weight: 80 },
  ]),
  getLatestMeasurements: jest.fn().mockResolvedValue(null),
  upsertBodyWeight: jest.fn().mockResolvedValue(undefined),
  deleteBodyWeight: jest.fn().mockResolvedValue(undefined),
  updateBodySettings: jest.fn().mockResolvedValue(undefined),
  getWeeklySummary: jest.fn().mockResolvedValue({
    workouts: { sessionCount: 0, totalDurationSeconds: 0, totalVolume: 0, previousWeekVolume: null, previousWeekSessionCount: null, hasBodyweightOnly: false, scheduledCount: null },
    prs: [], nutrition: null, body: null, streak: 0,
  }),
  getMonthlyReport: jest.fn().mockResolvedValue(mockMonthlyData),
  getActiveGymCount: jest.fn().mockResolvedValue(0),
  getGymProfiles: jest.fn().mockResolvedValue([]),
  getSessionsByGym: jest.fn().mockResolvedValue([]),
  // NutritionSegment: >=1 entry so the "Start tracking" empty state is bypassed
  getDailyNutritionTotals: jest.fn().mockResolvedValue([
    { date: '2026-06-22', calories: 1950, protein: 145, carbs: 240, fat: 62 },
    { date: '2026-06-23', calories: 2050, protein: 155, carbs: 258, fat: 67 },
    { date: '2026-06-24', calories: 2000, protein: 150, carbs: 250, fat: 65 },
    { date: '2026-06-25', calories: 1900, protein: 142, carbs: 238, fat: 60 },
  ]),
  getWeeklyNutritionAverages: jest.fn().mockResolvedValue([
    { weekStart: '2026-06-16', avgCalories: 2000, avgProtein: 150, avgCarbs: 250, avgFat: 65, daysTracked: 5 },
  ]),
  getNutritionAdherence: jest.fn().mockResolvedValue({ trackedDays: 10, onTargetDays: 7, currentStreak: 2, longestStreak: 5 }),
  getNutritionTargets: jest.fn().mockResolvedValue({ id: '1', calories: 2000, protein: 150, carbs: 250, fat: 65, updated_at: Date.now() }),
}))

jest.mock('../../lib/programs', () => ({
  getPrograms: jest.fn().mockResolvedValue([]),
  getNextWorkout: jest.fn().mockResolvedValue(null),
  getProgramDayCounts: jest.fn().mockResolvedValue({}),
  softDeleteProgram: jest.fn().mockResolvedValue(undefined),
  duplicateProgram: jest.fn().mockResolvedValue('dup-1'),
}))

// ── Component imports (after all mocks) ──────────────────────────────────────
import Dashboard from '../../app/(tabs)/index'
import WorkoutSegment from '../../components/progress/WorkoutSegment'
import BodySegment from '../../components/progress/BodySegment'
import NutritionSegment from '../../components/progress/NutritionSegment'
import MonthlyReportSegment from '../../components/progress/MonthlyReportSegment'

// ────────────────────────────────────────────────────────────────────────────
// 1. Home tab — home-masonry
// ────────────────────────────────────────────────────────────────────────────

describe('BLD-2076 — home-masonry (app/(tabs)/index.tsx)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockLayoutReturn = { ...mockMediumLayout }
  })

  it('renders home-masonry container on medium screen (atLeastMedium:true)', async () => {
    const { getByTestId } = renderScreen(<Dashboard />)
    await waitFor(() => {
      expect(getByTestId('home-masonry')).toBeTruthy()
    })
  })

  it('does NOT render home-masonry on compact screen (atLeastMedium:false)', async () => {
    mockLayoutReturn = { ...mockCompactLayout }
    const { queryByTestId } = renderScreen(<Dashboard />)
    await waitFor(() => {
      expect(queryByTestId('home-masonry')).toBeNull()
    })
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 2. WorkoutSegment — workout-progress-masonry (medium + expanded/3-col)
// ────────────────────────────────────────────────────────────────────────────

describe('BLD-2076 — workout-progress-masonry (WorkoutSegment)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockLayoutReturn = { ...mockMediumLayout }
    // Seed non-empty session + frequency data so the Masonry path renders
    // (empty check: `sessions.length === 0 && freq.length === 0` shows empty state)
    const mockDb = require('../../lib/db') as Record<string, jest.Mock>
    mockDb.getCompletedSessionsWithSetCount.mockResolvedValue([
      { id: 'sess1', date: '2026-06-20', durationSeconds: 3600, setCounts: 5, gymId: null, gymName: null },
    ])
    mockDb.getWeeklySessionCounts.mockResolvedValue([
      { week: '2026-06-15', count: 4 },
      { week: '2026-06-22', count: 3 },
    ])
    mockDb.getBodySettings.mockResolvedValue({ weight_unit: 'kg', measurement_unit: 'cm' })
  })

  it('renders workout-progress-masonry on medium screen (atLeastMedium:true)', async () => {
    const { getByTestId } = renderScreen(<WorkoutSegment />)
    await waitFor(() => {
      expect(getByTestId('workout-progress-masonry')).toBeTruthy()
    })
  })

  it('renders workout-progress-masonry on expanded screen (3-col path, expanded:true)', async () => {
    mockLayoutReturn = { ...mockExpandedLayout }
    const { getByTestId } = renderScreen(<WorkoutSegment />)
    await waitFor(() => {
      expect(getByTestId('workout-progress-masonry')).toBeTruthy()
    })
  })

  it('does NOT render workout-progress-masonry on compact screen', async () => {
    mockLayoutReturn = { ...mockCompactLayout }
    const { queryByTestId } = renderScreen(<WorkoutSegment />)
    await waitFor(() => {
      expect(queryByTestId('workout-progress-masonry')).toBeNull()
    })
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 3. BodySegment — body-segment-masonry
// ────────────────────────────────────────────────────────────────────────────

describe('BLD-2076 — body-segment-masonry (BodySegment)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockLayoutReturn = { ...mockMediumLayout }
    // Seed body weight data so BodySegment skips the "Log your first weigh-in" empty state
    // (empty check: `total === 0 && !measurements`)
    const mockDb = require('../../lib/db') as Record<string, jest.Mock>
    mockDb.getBodyWeightCount.mockResolvedValue(3)
    mockDb.getLatestBodyWeight.mockResolvedValue({
      id: 'bw1', date: '2026-06-20', weight_kg: 80.5, notes: null,
    })
    mockDb.getPreviousBodyWeight.mockResolvedValue(null)
    mockDb.getBodyWeightEntries.mockResolvedValue([
      { id: 'bw1', date: '2026-06-20', weight_kg: 80.5, notes: null },
    ])
    mockDb.getBodyWeightChartData.mockResolvedValue([
      { date: '2026-06-20', weight: 80.5 },
      { date: '2026-06-21', weight: 80.3 },
    ])
    mockDb.getBodySettings.mockResolvedValue({ weight_unit: 'kg', height_cm: 175, measurement_unit: 'cm' })
  })

  it('renders body-segment-masonry on medium screen (atLeastMedium:true)', async () => {
    const { getByTestId } = renderScreen(<BodySegment />)
    await waitFor(() => {
      expect(getByTestId('body-segment-masonry')).toBeTruthy()
    })
  })

  it('does NOT render body-segment-masonry on compact screen', async () => {
    mockLayoutReturn = { ...mockCompactLayout }
    const { queryByTestId } = renderScreen(<BodySegment />)
    await waitFor(() => {
      expect(queryByTestId('body-segment-masonry')).toBeNull()
    })
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 4. NutritionSegment — nutrition-progress-masonry
// ────────────────────────────────────────────────────────────────────────────

describe('BLD-2076 — nutrition-progress-masonry (NutritionSegment)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockLayoutReturn = { ...mockMediumLayout }
    // Seed nutrition data so NutritionSegment skips the "no data" empty state
    // (empty check: `dailyTotals.length === 0`)
    const mockDb = require('../../lib/db') as Record<string, jest.Mock>
    const dailyTotals = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-06-${String(21 + i).padStart(2, '0')}`,
      calories: 1800 + i * 50,
      protein: 120 + i * 5,
      carbs: 200 + i * 10,
      fat: 60 + i * 3,
    }))
    mockDb.getDailyNutritionTotals.mockResolvedValue(dailyTotals)
    mockDb.getWeeklyNutritionAverages.mockResolvedValue([
      { week: '2026-06-22', calories: 1850, protein: 125, carbs: 210, fat: 63 },
    ])
    mockDb.getNutritionTargets.mockResolvedValue({ calories: 2000, protein: 150, carbs: 250, fat: 65 })
  })

  it('renders nutrition-progress-masonry on medium screen (atLeastMedium:true)', async () => {
    const { getByTestId } = renderScreen(<NutritionSegment />)
    await waitFor(() => {
      expect(getByTestId('nutrition-progress-masonry')).toBeTruthy()
    })
  })

  it('does NOT render nutrition-progress-masonry on compact screen', async () => {
    mockLayoutReturn = { ...mockCompactLayout }
    const { queryByTestId } = renderScreen(<NutritionSegment />)
    await waitFor(() => {
      expect(queryByTestId('nutrition-progress-masonry')).toBeNull()
    })
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 5. MonthlyReportSegment — monthly-report-masonry
// ────────────────────────────────────────────────────────────────────────────

describe('BLD-2076 — monthly-report-masonry (MonthlyReportSegment)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockLayoutReturn = { ...mockMediumLayout }
    // Ensure monthly report returns enough data for the masonry path to render
    const mockDb = require('../../lib/db') as Record<string, jest.Mock>
    mockDb.getMonthlyReport.mockResolvedValue(mockMonthlyData)
  })

  it('renders monthly-report-masonry on medium screen (atLeastMedium:true)', async () => {
    const { getByTestId } = renderScreen(<MonthlyReportSegment />)
    await waitFor(() => {
      expect(getByTestId('monthly-report-masonry')).toBeTruthy()
    })
  })

  it('does NOT render monthly-report-masonry on compact screen', async () => {
    mockLayoutReturn = { ...mockCompactLayout }
    const { queryByTestId } = renderScreen(<MonthlyReportSegment />)
    await waitFor(() => {
      expect(queryByTestId('monthly-report-masonry')).toBeNull()
    })
  })
})
