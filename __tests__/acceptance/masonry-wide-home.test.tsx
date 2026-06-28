/**
 * BLD-2076 — Wide-screen Masonry render test: Home (Workouts) tab
 * Asserts `home-masonry` testID renders when useLayout returns atLeastMedium:true.
 */

import React from 'react'
import { waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'

// ─── Shared mocks ────────────────────────────────────────────────────────────

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

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')
jest.mock('../../lib/errors', () => ({
  logError: jest.fn(),
  generateReport: jest.fn().mockResolvedValue('{}'),
  getRecentErrors: jest.fn().mockResolvedValue([]),
  generateGitHubURL: jest.fn().mockReturnValue('https://github.com'),
}))
jest.mock('../../lib/interactions', () => ({ log: jest.fn() }))
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))
jest.mock('../../components/FloatingTabBar', () => ({
  useFloatingTabBarHeight: () => 80,
}))
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (c: unknown) => c },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => false,
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    withDelay: (_d: unknown, v: unknown) => v,
    withSequence: (...args: unknown[]) => args[args.length - 1],
    cancelAnimation: () => {},
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    FadeInDown: { duration: () => ({ delay: () => ({}) }) },
    Easing: { out: () => {}, bezier: () => {} },
    createAnimatedComponent: (c: unknown) => c,
  }
})
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}))
jest.mock('expo-localization', () => ({
  getCalendars: () => [{ firstWeekday: 1 }],
}))
jest.mock('../../components/ui/bna-toast', () => ({
  ToastProvider: ({ children }: { children: unknown }) => children,
  useToast: () => ({
    toast: jest.fn(), success: jest.fn(), error: jest.fn(),
    warning: jest.fn(), info: jest.fn(), dismiss: jest.fn(), dismissAll: jest.fn(),
  }),
}))

// Force wide / medium layout — atLeastMedium: true
jest.mock('../../lib/layout', () => ({
  useLayout: () => ({
    wide: true,
    width: 768,
    scale: 1.1,
    windowClass: 'medium' as const,
    compact: false,
    medium: true,
    expanded: false,
    atLeastMedium: true,
    horizontalPadding: 24,
  }),
}))

jest.mock('../../lib/query', () => ({
  useFocusRefetch: jest.fn(),
  bumpQueryVersion: jest.fn(),
  getQueryVersion: jest.fn().mockReturnValue(0),
}))

jest.mock('../../hooks/useHomeActions', () => ({
  useHomeActions: () => ({
    info: jest.fn(),
    starterMeta: {},
    quickStart: jest.fn(),
    startFromTemplate: jest.fn(),
    confirmDelete: jest.fn(),
    confirmDeleteProgram: jest.fn(),
    showTemplateOptions: jest.fn(),
    showProgramOptions: jest.fn(),
    importTemplates: jest.fn(),
    exportTemplate: jest.fn(),
  }),
}))

jest.mock('../../lib/db/day-session', () => ({
  getTodayQuickAddSummary: jest.fn().mockResolvedValue([]),
  listRecentQuickAddExercises: jest.fn().mockResolvedValue([]),
  insertDaySessionSet: jest.fn().mockResolvedValue(undefined),
  deleteDaySessionSet: jest.fn().mockResolvedValue(undefined),
  getDaySessionById: jest.fn().mockResolvedValue(null),
}))

// Stub out heavy child components that render no relevant UI here
jest.mock('../../components/home/QuickAddFab', () => 'QuickAddFab')
jest.mock('../../components/home/QuickAddSheet', () => 'QuickAddSheet')
jest.mock('../../components/home/HomeBanners', () => 'HomeBanners')
jest.mock('../../components/home/AdherenceBar', () => 'AdherenceBar')
jest.mock('../../components/home/StatsRow', () => 'StatsRow')
jest.mock('../../components/home/InsightCard', () => 'InsightCard')
jest.mock('../../components/home/DeloadNudgeCard', () => 'DeloadNudgeCard')
jest.mock('../../components/home/RecoveryHeatmap', () => ({
  RecoveryHeatmap: () => null,
}))
jest.mock('../../components/home/TemplatesList', () => ({
  TemplatesList: () => null,
}))
jest.mock('../../components/home/ProgramsList', () => ({
  ProgramsList: () => null,
}))
jest.mock('../../components/home/WeeklySummaryCard', () => 'WeeklySummaryCard')
jest.mock('../../components/home/RecentWorkoutsList', () => 'RecentWorkoutsList')
jest.mock('../../components/home/TodaysGtgCard', () => 'TodaysGtgCard')
jest.mock('../../components/ErrorBoundary', () => ({
  __esModule: true,
  default: ({ children }: { children: unknown }) => children,
}))
jest.mock('../../lib/db', () => ({
  startSession: jest.fn().mockResolvedValue({ id: 'new-sess' }),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
  getAppSetting: jest.fn().mockResolvedValue(null),
  getTemplates: jest.fn().mockResolvedValue([]),
  getRecentSessions: jest.fn().mockResolvedValue([]),
  getActiveSession: jest.fn().mockResolvedValue(null),
  getAllCompletedSessionWeeks: jest.fn().mockResolvedValue([]),
  getRecentPRs: jest.fn().mockResolvedValue([]),
  getTemplateExerciseCounts: jest.fn().mockResolvedValue({}),
  getSessionSetCounts: jest.fn().mockResolvedValue({}),
  getSessionAvgRPEs: jest.fn().mockResolvedValue({}),
  getTemplatePrimaryMuscles: jest.fn().mockResolvedValue({}),
  getTodaySchedule: jest.fn().mockResolvedValue(null),
  isTodayCompleted: jest.fn().mockResolvedValue(false),
  getWeekAdherence: jest.fn().mockResolvedValue([]),
  getMuscleRecoveryStatus: jest.fn().mockResolvedValue([]),
  getWeeklyVolume: jest.fn().mockResolvedValue([]),
  getE1RMTrends: jest.fn().mockResolvedValue([]),
  getTotalSessionCount: jest.fn().mockResolvedValue(5),
  getWeeklyE1RMTrends: jest.fn().mockResolvedValue([]),
  getRecentSessionRPEs: jest.fn().mockResolvedValue([]),
  getRecentSessionRatings: jest.fn().mockResolvedValue([]),
  getTemplateDurationEstimates: jest.fn().mockResolvedValue({}),
  getWeeklyCompletedCount: jest.fn().mockResolvedValue(0),
  getActiveGoals: jest.fn().mockResolvedValue([]),
  getExercisesByIds: jest.fn().mockResolvedValue({}),
  getCurrentBestWeightsByExercise: jest.fn().mockResolvedValue({}),
  getCurrentBestRepsByExercise: jest.fn().mockResolvedValue({}),
  getWeeklyWorkouts: jest.fn().mockResolvedValue({
    totalVolume: 1000,
    previousWeekVolume: 900,
    totalDurationSeconds: 3600,
    sessionCount: 3,
  }),
  getBodySettings: jest.fn().mockResolvedValue({ weight_unit: 'kg' }),
}))
jest.mock('../../lib/programs', () => ({
  getPrograms: jest.fn().mockResolvedValue([]),
  getNextWorkout: jest.fn().mockResolvedValue(null),
  getProgramDayCounts: jest.fn().mockResolvedValue({}),
}))
jest.mock('../../lib/db/settings', () => ({
  getAppSetting: jest.fn().mockResolvedValue(null),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../../lib/starter-templates', () => ({ STARTER_TEMPLATES: [] }))

import Workouts from '../../app/(tabs)/index'

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Wide-screen Masonry: Home (Workouts) tab — home-masonry testID (BLD-2076)', () => {
  it('renders home-masonry container when atLeastMedium is true (medium layout)', async () => {
    const { getByTestId } = renderScreen(<Workouts />)

    await waitFor(() => {
      expect(getByTestId('home-masonry')).toBeTruthy()
    })
  })
})
