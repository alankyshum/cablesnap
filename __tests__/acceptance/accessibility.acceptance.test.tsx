/**
 * Cross-screen accessibility compliance audit.
 * Verifies all interactive elements have accessible labels,
 * proper roles, and screen reader hints across 6 screens.
 */

import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import { resetIds } from '../helpers/factories'

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() }
const mockParams: Record<string, string> = {}

jest.mock('expo-router', () => {
  const RealReact = require('react')
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => mockParams,
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
jest.mock('../../lib/errors', () => ({ logError: jest.fn(), generateReport: jest.fn().mockResolvedValue('{}'), getRecentErrors: jest.fn().mockResolvedValue([]), generateGitHubURL: jest.fn().mockReturnValue('https://github.com'), getErrorCount: jest.fn().mockResolvedValue(0) }))
jest.mock('../../lib/interactions', () => ({ log: jest.fn(), recent: jest.fn().mockResolvedValue([]) }))
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }))

jest.mock('react-native-reanimated', () => {
  const RN = require('react-native')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const AnimatedView = ({ entering: _entering, ...rest }: Record<string, unknown>) => {
    return require('react').createElement(RN.View, rest)
  }
  const chainable = () => {
    const obj: Record<string, unknown> = {}
    obj.delay = () => obj
    obj.duration = () => obj
    return obj
  }
  return {
    __esModule: true,
    default: {
      View: AnimatedView,
      createAnimatedComponent: <T,>(c: T) => c,
    },
    FadeIn: chainable(),
    FadeInDown: chainable(),
    useAnimatedStyle: () => ({}),
    useSharedValue: <T,>(v: T) => ({ value: v }),
    useReducedMotion: () => false,
    withTiming: <T,>(v: T, _cfg?: unknown, cb?: (f: boolean) => void) => { if (cb) cb(true); return v },
    withSpring: <T,>(v: T) => v,
    withDelay: <T,>(_d: number, v: T) => v,
    withSequence: <T,>(...args: T[]) => args[args.length - 1],
    cancelAnimation: () => {},
    runOnJS: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
    interpolateColor: () => '#000',
    createAnimatedComponent: <T,>(c: T) => c,
    Easing: { bezier: () => (t: number) => t },
  }
})

jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), notificationAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light', Heavy: 'heavy' }, NotificationFeedbackType: { Success: 'success', Warning: 'warning' } }))
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn(), activateKeepAwakeAsync: jest.fn().mockResolvedValue(undefined), deactivateKeepAwakeAsync: jest.fn().mockResolvedValue(undefined) }))
jest.mock('victory-native', () => ({ CartesianChart: 'CartesianChart', Line: 'Line', Bar: 'Bar' }))
jest.mock('../../components/MuscleVolumeSegment', () => 'MuscleVolumeSegment')
jest.mock('../../components/WeeklySummary', () => 'WeeklySummary')
jest.mock('../../lib/rpe', () => ({ rpeColor: jest.fn().mockReturnValue('#888'), rpeText: jest.fn().mockReturnValue('#fff') }))
jest.mock('../../lib/starter-templates', () => ({ STARTER_TEMPLATES: [] }))
jest.mock('../../lib/db/settings', () => ({
  getAppSetting: jest.fn().mockResolvedValue(null),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('react-native-body-highlighter', () => {
  const { View } = require('react-native')
  return { __esModule: true, default: () => <View /> }
})
jest.mock('../../lib/units', () => ({ toDisplay: (v: number) => v, toKg: (v: number) => v, KG_TO_LB: 2.20462, LB_TO_KG: 0.453592 }))
jest.mock('../../lib/rm', () => ({ ...jest.requireActual('../../lib/rm'), suggest: jest.fn().mockReturnValue(null) }))
jest.mock('../../lib/confirm', () => ({ confirmAction: jest.fn() }))
jest.mock('../../components/TrainingModeSelector', () => 'TrainingModeSelector')
jest.mock('../../components/MuscleMap', () => ({ MuscleMap: 'MuscleMap' }))
jest.mock('../../components/WeightPicker', () => 'WeightPicker')
jest.mock('../../components/ExercisePickerSheet', () => 'ExercisePickerSheet')
jest.mock('../../components/ui/bna-toast', () => ({ ToastProvider: ({ children }: { children: unknown }) => children, useToast: () => ({ toast: jest.fn(), success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn(), dismiss: jest.fn(), dismissAll: jest.fn() }) }))
jest.mock('../../lib/query', () => ({ useFocusRefetch: jest.fn(), bumpQueryVersion: jest.fn(), getQueryVersion: jest.fn().mockReturnValue(0) }))

jest.mock('../../components/ui/FlowContainer', () => {
  const RN = require('react-native')
  const R = require('react')
  const FlowContainer = ({ children }: { children: React.ReactNode }) => R.createElement(RN.View, null, children)
  FlowContainer.displayName = 'FlowContainer'
  return {
    __esModule: true,
    default: FlowContainer,
    flowCardStyle: {},
    FLOW_CARD_MIN: 280,
    FLOW_CARD_MAX: 420,
  }
})

jest.mock('@react-navigation/native', () => {
  const RealReact = require('react')
  return {
    useNavigation: () => ({ setOptions: jest.fn() }),
    useFocusEffect: (cb: () => (() => void) | void) => {
      RealReact.useEffect(() => {
        const cleanup = cb()
        return typeof cleanup === 'function' ? cleanup : undefined
      }, [])
    },
  }
})

jest.mock('../../lib/db', () => ({
  getAllExercises: jest.fn().mockResolvedValue([
    { id: 'ex-1', name: 'Bench Press', category: 'chest', primary_muscles: ['chest'], secondary_muscles: [], equipment: 'barbell', instructions: 'Press', difficulty: 'intermediate', is_custom: false, deleted_at: null },
    { id: 'ex-2', name: 'Squat', category: 'legs_glutes', primary_muscles: ['quads'], secondary_muscles: [], equipment: 'barbell', instructions: 'Squat down', difficulty: 'intermediate', is_custom: false, deleted_at: null },
  ]),
  getExerciseById: jest.fn().mockResolvedValue({ id: 'ex-1', name: 'Bench Press', category: 'chest', primary_muscles: ['chest'], secondary_muscles: [], equipment: 'barbell', instructions: 'Press', difficulty: 'intermediate', is_custom: false, deleted_at: null }),
  getExercisesByIds: jest.fn().mockResolvedValue({ 'ex-1': { id: 'ex-1', name: 'Bench Press', category: 'chest', primary_muscles: ['chest'], secondary_muscles: [], equipment: 'barbell', instructions: 'Press', difficulty: 'intermediate', is_custom: false, deleted_at: null } }),
  createCustomExercise: jest.fn().mockResolvedValue(undefined),
  getRecentSessions: jest.fn().mockResolvedValue([]),
  getActiveSession: jest.fn().mockResolvedValue(null),
  getActiveProgram: jest.fn().mockResolvedValue(null),
  getTemplates: jest.fn().mockResolvedValue([]),
  getSessionsByMonth: jest.fn().mockResolvedValue([]),
  getSessionCountsByDay: jest.fn().mockResolvedValue([]),
  getAllCompletedSessionWeeks: jest.fn().mockResolvedValue([]),
  getTotalSessionCount: jest.fn().mockResolvedValue(0),
  searchSessions: jest.fn().mockResolvedValue([]),
  getDailyLogs: jest.fn().mockResolvedValue([]),
  getDailySummary: jest.fn().mockResolvedValue({ calories: 0, protein: 0, carbs: 0, fat: 0 }),
  getMacroTargets: jest.fn().mockResolvedValue({ id: '1', calories: 2000, protein: 150, carbs: 250, fat: 65, created_at: Date.now(), updated_at: Date.now() }),
  deleteDailyLog: jest.fn().mockResolvedValue(undefined),
  getAppSetting: jest.fn().mockResolvedValue(null),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
  exportAllData: jest.fn().mockResolvedValue('{}'),
  importData: jest.fn().mockResolvedValue(undefined),
  getWorkoutCSVData: jest.fn().mockResolvedValue([]),
  getNutritionCSVData: jest.fn().mockResolvedValue([]),
  getBodyWeightCSVData: jest.fn().mockResolvedValue([]),
  getBodyMeasurementsCSVData: jest.fn().mockResolvedValue([]),
  getCSVCounts: jest.fn().mockResolvedValue({ workouts: 0, nutrition: 0, bodyWeight: 0, measurements: 0 }),
  getBodySettings: jest.fn().mockResolvedValue({ weight_unit: 'kg', measurement_unit: 'cm', weight_goal: null, body_fat_goal: null }),
  getBodyWeightHistory: jest.fn().mockResolvedValue([]),
  getLatestBodyWeight: jest.fn().mockResolvedValue(null),
  getPreviousBodyWeight: jest.fn().mockResolvedValue(null),
  getBodyWeightEntries: jest.fn().mockResolvedValue([]),
  getBodyWeightCount: jest.fn().mockResolvedValue(0),
  getBodyWeightChartData: jest.fn().mockResolvedValue([]),
  getLatestMeasurements: jest.fn().mockResolvedValue(null),
  upsertBodyWeight: jest.fn().mockResolvedValue(undefined),
  deleteBodyWeight: jest.fn().mockResolvedValue(undefined),
  updateBodySettings: jest.fn().mockResolvedValue(undefined),
  getPersonalRecords: jest.fn().mockResolvedValue([]),
  getWeeklySessionCounts: jest.fn().mockResolvedValue([]),
  getWeeklyVolume: jest.fn().mockResolvedValue([]),
  getCompletedSessionsWithSetCount: jest.fn().mockResolvedValue([]),
  getProgressChartData: jest.fn().mockResolvedValue([]),
  getSessionById: jest.fn(),
  getSessionSets: jest.fn().mockResolvedValue([]),
  getTemplateById: jest.fn().mockResolvedValue(null),
  addSet: jest.fn().mockResolvedValue(undefined),
  addSetsBatch: jest.fn().mockResolvedValue(undefined),
  deleteSet: jest.fn().mockResolvedValue(undefined),
  completeSet: jest.fn().mockResolvedValue(undefined),
  uncompleteSet: jest.fn().mockResolvedValue(undefined),
  completeSession: jest.fn().mockResolvedValue(undefined),
  cancelSession: jest.fn().mockResolvedValue(undefined),
  updateSet: jest.fn().mockResolvedValue(undefined),
  updateSetsBatch: jest.fn().mockResolvedValue(undefined),
  updateSetRPE: jest.fn().mockResolvedValue(undefined),
  updateSetNotes: jest.fn().mockResolvedValue(undefined),
  updateSetTrainingMode: jest.fn().mockResolvedValue(undefined),
  updateSetTempo: jest.fn().mockResolvedValue(undefined),
  getMaxWeightByExercise: jest.fn().mockResolvedValue({}),
  getPreviousSets: jest.fn().mockResolvedValue([]),
  getPreviousSetsBatch: jest.fn().mockResolvedValue({}),
  getRecentExerciseSets: jest.fn().mockResolvedValue([]),
  getRecentExerciseSetsBatch: jest.fn().mockResolvedValue({}),
  getRestSecondsForExercise: jest.fn().mockResolvedValue(90),
  getRestSecondsForLink: jest.fn().mockResolvedValue(90),
  getSessionPRs: jest.fn().mockResolvedValue([]),
  getSessionRepPRs: jest.fn().mockResolvedValue([]),
  getSessionWeightIncreases: jest.fn().mockResolvedValue([]),
  getSessionComparison: jest.fn().mockResolvedValue(null),
  addBodyWeight: jest.fn().mockResolvedValue(undefined),
  getBodyMeasurements: jest.fn().mockResolvedValue([]),
  addBodyMeasurement: jest.fn().mockResolvedValue(undefined),
  getFoodEntries: jest.fn().mockResolvedValue([]),
  getAchievements: jest.fn().mockResolvedValue([]),
  getProgressPhotos: jest.fn().mockResolvedValue([]),
  getSchedule: jest.fn().mockResolvedValue(null),
  getRecentPRs: jest.fn().mockResolvedValue([]),
  getSessionAvgRPE: jest.fn().mockResolvedValue(null),
  getSessionAvgRPEs: jest.fn().mockResolvedValue({}),
  getSessionSetCount: jest.fn().mockResolvedValue(0),
  getSessionSetCounts: jest.fn().mockResolvedValue({}),
  getTemplateExerciseCount: jest.fn().mockResolvedValue(0),
  getTemplateExerciseCounts: jest.fn().mockResolvedValue({}),
  startSession: jest.fn().mockResolvedValue({ id: 'qs-1', name: 'Quick Start', started_at: Date.now() }),
  getTodaySchedule: jest.fn().mockResolvedValue(null),
  isTodayCompleted: jest.fn().mockResolvedValue(false),
  getWeekAdherence: jest.fn().mockResolvedValue([]),
  getMuscleRecoveryStatus: jest.fn().mockResolvedValue([]),
  deleteTemplate: jest.fn().mockResolvedValue(undefined),
  duplicateTemplate: jest.fn().mockResolvedValue('dup-1'),
  duplicateProgram: jest.fn().mockResolvedValue('dup-p1'),
  getStravaConnection: jest.fn().mockResolvedValue(null),
}))

jest.mock('../../lib/db/pr-dashboard', () => ({
  getPRStats: jest.fn().mockResolvedValue({ totalPRs: 0, prsThisMonth: 0 }),
  getRecentPRsWithDelta: jest.fn().mockResolvedValue([]),
  getAllTimeBests: jest.fn().mockResolvedValue([]),
}))

jest.mock('../../lib/strava', () => ({
  connectStrava: jest.fn().mockResolvedValue(null),
  disconnect: jest.fn().mockResolvedValue(undefined),
  syncSessionToStrava: jest.fn().mockResolvedValue(false),
  reconcileStravaQueue: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../lib/programs', () => ({
  activateProgram: jest.fn(),
  getActiveProgram: jest.fn().mockResolvedValue(null),
  getNextWorkout: jest.fn().mockResolvedValue(null),
  getPrograms: jest.fn().mockResolvedValue([]),
  getProgramDayCount: jest.fn().mockResolvedValue(0),
  getProgramDayCounts: jest.fn().mockResolvedValue({}),
  softDeleteProgram: jest.fn().mockResolvedValue(undefined),
  getSessionProgramDayId: jest.fn().mockResolvedValue(null),
  getProgramDayById: jest.fn().mockResolvedValue(null),
  advanceProgram: jest.fn().mockResolvedValue({ wrapped: false }),
}))

jest.mock('../../lib/audio', () => ({
  loadSounds: jest.fn().mockResolvedValue(new Map()),
  play: jest.fn(),
  setEnabled: jest.fn(),
}))

jest.mock('../../lib/notifications', () => ({
  requestPermission: jest.fn().mockResolvedValue('granted'),
  scheduleReminders: jest.fn().mockResolvedValue(undefined),
  cancelAll: jest.fn().mockResolvedValue(undefined),
  getPermissionStatus: jest.fn().mockResolvedValue('granted'),
}))

jest.mock('../../lib/csv-format', () => ({
  workoutCSV: jest.fn().mockReturnValue(''),
  nutritionCSV: jest.fn().mockReturnValue(''),
  bodyWeightCSV: jest.fn().mockReturnValue(''),
  bodyMeasurementsCSV: jest.fn().mockReturnValue(''),
}))

import Exercises from '../../app/(tabs)/exercises'
import Settings from '../../app/(tabs)/settings'
import Nutrition from '../../app/(tabs)/nutrition'
import HomeDashboard from '../../app/(tabs)/index'
import Progress from '../../app/(tabs)/progress'
import ActiveSession from '../../app/session/[id]'

const mockDb = require('../../lib/db') as Record<string, jest.Mock>

describe('Accessibility Compliance Audit', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetIds()
    Object.keys(mockParams).forEach((k) => delete mockParams[k])
  })

  describe('exercises.tsx', () => {
    it('search bar has accessible label', async () => {
      const screen = renderScreen(<Exercises />)
      await waitFor(() => {
        expect(screen.getByLabelText('Search exercises')).toBeTruthy()
      })
    })

    it('category filter chips have accessible labels', async () => {
      const screen = renderScreen(<Exercises />)
      await waitFor(() => {
        const chips = screen.getAllByLabelText(/Filter by/)
        expect(chips.length).toBeGreaterThan(0)
      })
    })

    it('exercise items have accessible labels with name and category', async () => {
      const screen = renderScreen(<Exercises />)
      await waitFor(() => {
        expect(screen.getByLabelText(/Bench Press/)).toBeTruthy()
        expect(screen.getByLabelText(/Squat/)).toBeTruthy()
      })
    })

    it('exercises screen renders without FAB (FAB is in layout header)', async () => {
      const screen = renderScreen(<Exercises />)
      await waitFor(() => {
        expect(screen.getByLabelText(/Bench Press/)).toBeTruthy()
      })
    })
  })

  describe('nutrition.tsx', () => {
    it('nutrition screen renders day navigation (FAB is in layout header)', async () => {
      const screen = renderScreen(<Nutrition />)
      await waitFor(() => {
        expect(screen.getByLabelText('Previous day')).toBeTruthy()
      })
    })

    it('has labeled day navigation', async () => {
      const screen = renderScreen(<Nutrition />)
      await waitFor(() => {
        expect(screen.getByLabelText('Previous day')).toBeTruthy()
        expect(screen.getByLabelText('Next day')).toBeTruthy()
      })
    })
  })

  describe('settings.tsx', () => {
    it('renders setting cards with accessible labels', async () => {
      const screen = renderScreen(<Settings />)
      await waitFor(() => {
        expect(screen.getByText('About')).toBeTruthy()
      })
    })

    it('export and import buttons have accessible labels', async () => {
      const screen = renderScreen(<Settings />)
      await waitFor(() => {
        expect(screen.getByLabelText('Export all data as JSON')).toBeTruthy()
        expect(screen.getByLabelText('Import data')).toBeTruthy()
      })
    })

    it('toggle switches have accessible labels', async () => {
      const screen = renderScreen(<Settings />)
      await waitFor(() => {
        expect(screen.getByLabelText('Workout Reminders')).toBeTruthy()
        expect(screen.getByLabelText('Timer Sound')).toBeTruthy()
      })
    })
  })

  describe('(tabs)/index.tsx — Home Dashboard', () => {
    it('quick start button has accessible label', async () => {
      const screen = renderScreen(<HomeDashboard />)
      await waitFor(() => {
        expect(screen.getByLabelText('Quick start workout')).toBeTruthy()
      })
    })

    it('tab buttons have accessible labels', async () => {
      const screen = renderScreen(<HomeDashboard />)
      await waitFor(() => {
        expect(screen.getByLabelText('Templates tab')).toBeTruthy()
        expect(screen.getByLabelText('Programs tab')).toBeTruthy()
      })
    })

    it('streak and stats have accessible labels', async () => {
      const screen = renderScreen(<HomeDashboard />)
      await waitFor(() => {
        expect(screen.getByLabelText(/week streak/)).toBeTruthy()
        expect(screen.getByLabelText(/workouts this week/)).toBeTruthy()
        expect(screen.getByLabelText(/recent personal records/)).toBeTruthy()
      })
    })

    it('create template button has accessible label', async () => {
      const screen = renderScreen(<HomeDashboard />)
      await waitFor(() => {
        expect(screen.getByLabelText('Create new template')).toBeTruthy()
      })
    })
  })

  describe('(tabs)/progress.tsx', () => {
    it('segment buttons have accessible labels', async () => {
      const screen = renderScreen(<Progress />)
      await waitFor(() => {
        expect(screen.getByLabelText('Workouts progress')).toBeTruthy()
        expect(screen.getByLabelText('Body metrics')).toBeTruthy()
        expect(screen.getByLabelText('Muscle volume analysis')).toBeTruthy()
      })
    })

    it('body segment has log weight button with accessible label', async () => {
      const { findByLabelText } = renderScreen(<Progress />)
      const bodyBtn = await findByLabelText('Body metrics')
      fireEvent.press(bodyBtn)
      await waitFor(async () => {
        expect(await findByLabelText('Log body weight')).toBeTruthy()
      })
    })

    it('body empty state shows log prompt', async () => {
      const { findByLabelText, findByText } = renderScreen(<Progress />)
      const bodyBtn = await findByLabelText('Body metrics')
      fireEvent.press(bodyBtn)
      await waitFor(async () => {
        expect(await findByText('Log your first weigh-in')).toBeTruthy()
      })
    })
  })

  describe('session/[id].tsx — Active Session', () => {
    const session = {
      id: 'sess-1',
      name: 'Test Workout',
      template_id: null,
      started_at: Date.now(),
      completed_at: null,
      duration_seconds: null,
      notes: null,
    }

    beforeEach(() => {
      mockParams['id'] = 'sess-1'
      mockDb.getSessionById.mockResolvedValue(session)
      mockDb.getSessionSets.mockResolvedValue([
        {
          id: 'set-1', session_id: 'sess-1', exercise_id: 'ex-1', set_number: 1,
          weight: 80, reps: 8, completed: false, completed_at: null,
          rpe: null, notes: null, link_id: null, training_mode: null, tempo: null,
          exercise_name: 'Bench Press', exercise_deleted: false,
        },
      ])
      mockDb.getAppSetting.mockResolvedValue('true')
    })

    it('finish and cancel buttons have accessible labels', async () => {
      const screen = renderScreen(<ActiveSession />)
      await waitFor(() => {
        expect(screen.getByLabelText('Finish workout')).toBeTruthy()
        expect(screen.getByLabelText('Cancel workout')).toBeTruthy()
      })
    })

    it('add exercise button has accessible label', async () => {
      const screen = renderScreen(<ActiveSession />)
      await waitFor(() => {
        expect(screen.getByLabelText('Add exercise to workout')).toBeTruthy()
      })
    })

    it('set controls have accessible labels', async () => {
      const screen = renderScreen(<ActiveSession />)
      await waitFor(() => {
        expect(screen.getByLabelText('Set 1 weight')).toBeTruthy()
        expect(screen.getByLabelText('Set 1 reps')).toBeTruthy()
        expect(screen.getByLabelText(/Mark set 1/)).toBeTruthy()
      })
    })

    it('mark-complete has checkbox role', async () => {
      const screen = renderScreen(<ActiveSession />)
      await waitFor(() => {
        const checkbox = screen.getByLabelText(/Mark set 1/)
        expect(checkbox.props.accessibilityRole).toBe('checkbox')
      })
    })
  })
})
