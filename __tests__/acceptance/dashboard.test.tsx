import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import {
  createSession,
  createWorkoutTemplate,
  createProgram,
  resetIds,
} from '../helpers/factories'

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() }

jest.mock('expo-router', () => {
  const RealReact = require('react')
  return {
    useRouter: () => mockRouter,
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
jest.mock('../../lib/layout', () => ({
  useLayout: () => ({ wide: false, width: 375, scale: 1.0, horizontalPadding: 16 }),
}))
jest.mock('../../lib/errors', () => ({
  logError: jest.fn(),
  generateReport: jest.fn().mockResolvedValue('{}'),
  getRecentErrors: jest.fn().mockResolvedValue([]),
  generateGitHubURL: jest.fn().mockReturnValue('https://github.com'),
}))
jest.mock('../../lib/interactions', () => ({ log: jest.fn(), recent: jest.fn().mockResolvedValue([]) }))
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))
jest.mock('../../lib/query', () => ({ useFocusRefetch: jest.fn(), bumpQueryVersion: jest.fn(), getQueryVersion: jest.fn().mockReturnValue(0) }))
jest.mock('../../components/ui/bna-toast', () => ({
  ToastProvider: ({ children }: { children: unknown }) => children,
  useToast: () => ({ toast: jest.fn(), success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn(), dismiss: jest.fn(), dismissAll: jest.fn() }),
}))
jest.mock('../../components/ui/FlowContainer', () => {
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    flowCardStyle: {},
  }
})
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (c: unknown) => c },
    FadeInDown: { delay: () => ({ duration: () => undefined }) },
    FadeIn: { duration: () => ({ delay: () => undefined }) },
    FadeOut: { duration: () => undefined },
    SlideInDown: { duration: () => undefined },
    SlideOutDown: { duration: () => undefined },
    Easing: { bezier: () => (t: number) => t },
    useSharedValue: (init: unknown) => ({ value: init }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    withDelay: (_d: unknown, v: unknown) => v,
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  }
})
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}))

// -- Data fixtures --
const tpl1 = createWorkoutTemplate({ id: 'tpl-1', name: 'Push Day' })
const tpl2 = createWorkoutTemplate({ id: 'tpl-2', name: 'Pull Day' })
const session1 = createSession({
  id: 's1',
  name: 'Morning Push',
  started_at: Date.now() - 86400000,
  completed_at: Date.now() - 86400000 + 3600000,
  duration_seconds: 3600,
})
const session2 = createSession({
  id: 's2',
  name: 'Evening Pull',
  started_at: Date.now() - 172800000,
  completed_at: Date.now() - 172800000 + 2700000,
  duration_seconds: 2700,
})
const activeSession = createSession({
  id: 'active-1',
  name: 'Current Workout',
  started_at: Date.now(),
  completed_at: null,
})
const program1 = createProgram({
  id: 'prog-1',
  name: 'Push Pull Legs',
  is_active: true,
})

// -- Mock DB functions --
const mockGetTemplates = jest.fn().mockResolvedValue([tpl1, tpl2])
const mockGetRecentSessions = jest.fn().mockResolvedValue([session1, session2])
const mockGetActiveSession = jest.fn().mockResolvedValue(null)
const mockGetAllCompletedSessionWeeks = jest.fn().mockResolvedValue([
  Date.now() - 86400000,
  Date.now() - 172800000,
  Date.now() - 259200000,
])
const mockGetRecentPRs = jest.fn().mockResolvedValue([
  { exercise: 'Bench Press', weight: 100, reps: 5 },
  { exercise: 'Squat', weight: 140, reps: 3 },
])
const mockStartSession = jest.fn().mockResolvedValue({ id: 'new-session' })
const mockGetTemplateExerciseCount = jest.fn().mockResolvedValue(5)
const mockGetSessionSetCount = jest.fn().mockResolvedValue(12)
const mockGetSessionAvgRPE = jest.fn().mockResolvedValue(7.5)
const mockDeleteTemplate = jest.fn().mockResolvedValue(undefined)
const mockDuplicateTemplate = jest.fn().mockResolvedValue('dup-1')
const mockDuplicateProgram = jest.fn().mockResolvedValue('dup-prog-1')
const mockGetTodaySchedule = jest.fn().mockResolvedValue(null)
const mockIsTodayCompleted = jest.fn().mockResolvedValue(false)
const mockGetWeekAdherence = jest.fn().mockResolvedValue([])

jest.mock('../../lib/db', () => ({
  getTemplates: (...args: unknown[]) => mockGetTemplates(...args),
  getRecentSessions: (...args: unknown[]) => mockGetRecentSessions(...args),
  getActiveSession: (...args: unknown[]) => mockGetActiveSession(...args),
  getAllCompletedSessionWeeks: (...args: unknown[]) => mockGetAllCompletedSessionWeeks(...args),
  getRecentPRs: (...args: unknown[]) => mockGetRecentPRs(...args),
  startSession: (...args: unknown[]) => mockStartSession(...args),
  getTemplateExerciseCount: (...args: unknown[]) => mockGetTemplateExerciseCount(...args),
  getTemplateExerciseCounts: jest.fn().mockResolvedValue({}),
  getTemplatePrimaryMuscles: jest.fn().mockResolvedValue({}),
  getSessionSetCount: (...args: unknown[]) => mockGetSessionSetCount(...args),
  getSessionSetCounts: jest.fn().mockResolvedValue({}),
  getSessionAvgRPE: (...args: unknown[]) => mockGetSessionAvgRPE(...args),
  getSessionAvgRPEs: jest.fn().mockResolvedValue({}),
  deleteTemplate: (...args: unknown[]) => mockDeleteTemplate(...args),
  duplicateTemplate: (...args: unknown[]) => mockDuplicateTemplate(...args),
  duplicateProgram: (...args: unknown[]) => mockDuplicateProgram(...args),
  getTodaySchedule: (...args: unknown[]) => mockGetTodaySchedule(...args),
  isTodayCompleted: (...args: unknown[]) => mockIsTodayCompleted(...args),
  getWeekAdherence: (...args: unknown[]) => mockGetWeekAdherence(...args),
  getMuscleRecoveryStatus: jest.fn().mockResolvedValue([]),
  getWeeklyVolume: jest.fn().mockResolvedValue([]),
  getE1RMTrends: jest.fn().mockResolvedValue([]),
  getTotalSessionCount: jest.fn().mockResolvedValue(0),
  getWeeklyE1RMTrends: jest.fn().mockResolvedValue([]),
  getRecentSessionRPEs: jest.fn().mockResolvedValue([]),
  getRecentSessionRatings: jest.fn().mockResolvedValue([]),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
  getTemplateDurationEstimates: jest.fn().mockResolvedValue({}),
  getWeeklyCompletedCount: jest.fn().mockResolvedValue(0),
  getActiveGoals: jest.fn().mockResolvedValue([]),
  getCurrentBestWeight: jest.fn().mockResolvedValue(null),
  getCurrentBestReps: jest.fn().mockResolvedValue(null),
  getExerciseById: jest.fn().mockResolvedValue(null),
  getWeeklyWorkouts: jest.fn().mockResolvedValue({ totalVolume: 0, previousWeekVolume: null, totalDurationSeconds: 0, sessionCount: 0 }),
  getBodySettings: jest.fn().mockResolvedValue(null),
  getAppSetting: jest.fn().mockResolvedValue(null),
}))

const mockGetPrograms = jest.fn().mockResolvedValue([program1])
const mockGetNextWorkout = jest.fn().mockResolvedValue(null)
const mockGetProgramDayCount = jest.fn().mockResolvedValue(3)
const mockSoftDeleteProgram = jest.fn().mockResolvedValue(undefined)

jest.mock('../../lib/programs', () => ({
  getPrograms: (...args: unknown[]) => mockGetPrograms(...args),
  getNextWorkout: (...args: unknown[]) => mockGetNextWorkout(...args),
  getProgramDayCount: (...args: unknown[]) => mockGetProgramDayCount(...args),
  getProgramDayCounts: jest.fn().mockResolvedValue({}),
  softDeleteProgram: (...args: unknown[]) => mockSoftDeleteProgram(...args),
  duplicateProgram: (...args: unknown[]) => mockDuplicateProgram(...args),
}))

jest.mock('../../lib/rpe', () => ({
  rpeColor: () => '#4CAF50',
  rpeText: () => '#fff',
}))
jest.mock('../../lib/starter-templates', () => ({
  STARTER_TEMPLATES: [],
}))
jest.mock('../../lib/db/settings', () => ({
  getAppSetting: jest.fn().mockResolvedValue(null),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('react-native-body-highlighter', () => {
  const { View } = require('react-native')
  return { __esModule: true, default: () => <View /> }
})

import Dashboard from '../../app/(tabs)/index'

// eslint-disable-next-line max-lines-per-function
describe('Dashboard Acceptance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetIds()
    // Reset to defaults
    mockGetTemplates.mockResolvedValue([tpl1, tpl2])
    mockGetRecentSessions.mockResolvedValue([session1, session2])
    mockGetActiveSession.mockResolvedValue(null)
    mockGetAllCompletedSessionWeeks.mockResolvedValue([Date.now()])
    mockGetRecentPRs.mockResolvedValue([
      { exercise: 'Bench Press', weight: 100, reps: 5 },
      { exercise: 'Squat', weight: 140, reps: 3 },
    ])
    mockGetPrograms.mockResolvedValue([program1])
    mockGetNextWorkout.mockResolvedValue(null)
    mockGetTodaySchedule.mockResolvedValue(null)
    mockIsTodayCompleted.mockResolvedValue(false)
    mockGetWeekAdherence.mockResolvedValue([])
  })

  describe('Stats summary displays', () => {
    it('shows streak, weekly workouts, and PR count', async () => {
      const { getByLabelText } = renderScreen(<Dashboard />)

      await waitFor(() => {
        expect(getByLabelText(/week streak/)).toBeTruthy()
        expect(getByLabelText(/workouts this week/)).toBeTruthy()
        expect(getByLabelText(/recent personal records/)).toBeTruthy()
      })
    })

    it('shows PR count from data', async () => {
      mockGetRecentPRs.mockResolvedValue([
        { exercise: 'Bench Press', weight: 100, reps: 5 },
        { exercise: 'Squat', weight: 140, reps: 3 },
        { exercise: 'Deadlift', weight: 180, reps: 1 },
      ])
      const { getByLabelText } = renderScreen(<Dashboard />)

      await waitFor(() => {
        expect(getByLabelText('3 recent personal records')).toBeTruthy()
      })
    })
  })

  describe('Recent workouts list', () => {
    it('shows recent workout sessions', async () => {
      const { getByLabelText } = renderScreen(<Dashboard />)

      await waitFor(() => {
        expect(getByLabelText(/View workout: Morning Push/)).toBeTruthy()
        expect(getByLabelText(/View workout: Evening Pull/)).toBeTruthy()
      })
    })

    it('shows empty state for new users with no workouts', async () => {
      mockGetRecentSessions.mockResolvedValue([])
      const { getByText } = renderScreen(<Dashboard />)

      await waitFor(() => {
        expect(getByText(/No workouts yet/)).toBeTruthy()
      })
    })

    it('navigates to workout detail on press', async () => {
      const { getByLabelText } = renderScreen(<Dashboard />)

      await waitFor(() => {
        expect(getByLabelText(/View workout: Morning Push/)).toBeTruthy()
      })

      fireEvent.press(getByLabelText(/View workout: Morning Push/))
      expect(mockRouter.push).toHaveBeenCalledWith('/session/detail/s1')
    })

    it('shows view all history button when sessions exist', async () => {
      const { getByLabelText } = renderScreen(<Dashboard />)

      await waitFor(() => {
        expect(getByLabelText('View all workout history')).toBeTruthy()
      })

      fireEvent.press(getByLabelText('View all workout history'))
      expect(mockRouter.push).toHaveBeenCalledWith('/history')
    })
  })

  describe('Quick-start buttons', () => {
    it('quick start button is pressable and starts a session', async () => {
      const { getByLabelText } = renderScreen(<Dashboard />)

      await waitFor(() => {
        expect(getByLabelText('Quick start workout')).toBeTruthy()
      })

      fireEvent.press(getByLabelText('Quick start workout'))

      await waitFor(() => {
        expect(mockStartSession).toHaveBeenCalledWith(null, 'Quick Workout')
        expect(mockRouter.push).toHaveBeenCalledWith('/session/new-session')
      })
    })
  })

  describe('Active session banner', () => {
    it('shows resume banner when there is an active session', async () => {
      mockGetActiveSession.mockResolvedValue(activeSession)

      const { getByLabelText } = renderScreen(<Dashboard />)

      await waitFor(() => {
        expect(getByLabelText('Resume active workout: Current Workout')).toBeTruthy()
      })
    })

    it('navigates to active session on press', async () => {
      mockGetActiveSession.mockResolvedValue(activeSession)

      const { getByLabelText } = renderScreen(<Dashboard />)

      await waitFor(() => {
        expect(getByLabelText('Resume active workout: Current Workout')).toBeTruthy()
      })

      fireEvent.press(getByLabelText('Resume active workout: Current Workout'))
      expect(mockRouter.push).toHaveBeenCalledWith('/session/active-1')
    })

    it('does not show resume banner when no active session', async () => {
      mockGetActiveSession.mockResolvedValue(null)

      const { queryByLabelText } = renderScreen(<Dashboard />)

      await waitFor(() => {
        expect(queryByLabelText(/Resume active workout/)).toBeNull()
      })
    })
  })

  describe('Navigation to major sections', () => {
    it('create template navigates to template creation', async () => {
      const { getByLabelText } = renderScreen(<Dashboard />)

      await waitFor(() => {
        expect(getByLabelText('Create new template')).toBeTruthy()
      })

      fireEvent.press(getByLabelText('Create new template'))
      expect(mockRouter.push).toHaveBeenCalledWith('/template/create')
    })

    it('template card navigates to start workout', async () => {
      const { getByLabelText } = renderScreen(<Dashboard />)

      await waitFor(() => {
        expect(getByLabelText(/Start workout from template: Push Day/)).toBeTruthy()
      })

      fireEvent.press(getByLabelText(/Start workout from template: Push Day/))

      await waitFor(() => {
        expect(mockStartSession).toHaveBeenCalledWith('tpl-1', 'Push Day')
      })
    })
  })

  describe('Empty state for new users', () => {
    it('shows empty template state when no templates or starters exist', async () => {
      mockGetTemplates.mockResolvedValue([])

      const { getByText, getByLabelText } = renderScreen(<Dashboard />)

      await waitFor(() => {
        expect(getByText('Create your first workout template')).toBeTruthy()
        expect(getByLabelText('Create your first template')).toBeTruthy()
      })
    })

    it('shows empty sessions state when no workouts', async () => {
      mockGetRecentSessions.mockResolvedValue([])

      const { getByText } = renderScreen(<Dashboard />)

      await waitFor(() => {
        expect(getByText(/No workouts yet/)).toBeTruthy()
      })
    })

    it('shows zeros in stats for new users', async () => {
      mockGetAllCompletedSessionWeeks.mockResolvedValue([])
      mockGetRecentPRs.mockResolvedValue([])
      mockGetWeekAdherence.mockResolvedValue([])

      const { getByLabelText } = renderScreen(<Dashboard />)

      await waitFor(() => {
        expect(getByLabelText('0 recent personal records')).toBeTruthy()
        expect(getByLabelText(/0 workouts this week/)).toBeTruthy()
      })
    })
  })

  describe('Accessible labels present', () => {
    it('quick start button has accessibility label', async () => {
      const { getByLabelText } = renderScreen(<Dashboard />)

      await waitFor(() => {
        expect(getByLabelText('Quick start workout')).toBeTruthy()
      })
    })

    it('stat cards have accessibility labels', async () => {
      const { getByLabelText } = renderScreen(<Dashboard />)

      await waitFor(() => {
        expect(getByLabelText(/week streak/)).toBeTruthy()
        expect(getByLabelText(/workouts this week/)).toBeTruthy()
        expect(getByLabelText(/recent personal records/)).toBeTruthy()
      })
    })

    it('template cards have accessibility labels and roles', async () => {
      const { getByLabelText } = renderScreen(<Dashboard />)

      await waitFor(() => {
        const card = getByLabelText(/Start workout from template: Push Day/)
        expect(card).toBeTruthy()
        expect(card.props.accessibilityRole).toBe('button')
      })
    })

    it('session cards have accessibility labels and roles', async () => {
      const { getByLabelText } = renderScreen(<Dashboard />)

      await waitFor(() => {
        const card = getByLabelText(/View workout: Morning Push/)
        expect(card).toBeTruthy()
        expect(card.props.accessibilityRole).toBe('button')
      })
    })

    it('segmented buttons have accessibility labels', async () => {
      const { getByLabelText } = renderScreen(<Dashboard />)

      await waitFor(() => {
        expect(getByLabelText('Templates tab')).toBeTruthy()
        expect(getByLabelText('Programs tab')).toBeTruthy()
      })
    })
  })

  describe('Today schedule card', () => {
    it('shows today schedule when schedule exists', async () => {
      mockGetTodaySchedule.mockResolvedValue({
        template_id: 'tpl-1',
        template_name: 'Push Day',
        exercise_count: 5,
      })

      const { getByLabelText } = renderScreen(<Dashboard />)

      await waitFor(() => {
        expect(getByLabelText(/Today's workout: Push Day/)).toBeTruthy()
      })
    })

    it('shows completed state when today is done', async () => {
      mockGetTodaySchedule.mockResolvedValue({
        template_id: 'tpl-1',
        template_name: 'Push Day',
        exercise_count: 5,
      })
      mockIsTodayCompleted.mockResolvedValue(true)

      const { getByLabelText } = renderScreen(<Dashboard />)

      await waitFor(() => {
        expect(getByLabelText(/Completed: Push Day/)).toBeTruthy()
      })
    })
  })

  describe('Segment switching with nextWorkout (BLD-277)', () => {
    const nextWorkoutFixture = {
      program: { id: 'prog-1', name: 'Push Pull Legs' },
      day: { id: 'day-1', template_id: 'tpl-1', template_name: 'Push Day', label: 'Day 1' },
    }

    it('defaults to programs when nextWorkout exists', async () => {
      mockGetNextWorkout.mockResolvedValue(nextWorkoutFixture)

      const { getByLabelText, queryByLabelText } = renderScreen(<Dashboard />)

      await waitFor(() => {
        expect(getByLabelText('Create new program')).toBeTruthy()
      })
      expect(queryByLabelText('Create new template')).toBeNull()
    })

    it('allows switching to templates when nextWorkout exists', async () => {
      mockGetNextWorkout.mockResolvedValue(nextWorkoutFixture)

      const { getByLabelText } = renderScreen(<Dashboard />)

      await waitFor(() => {
        expect(getByLabelText('Create new program')).toBeTruthy()
      })

      fireEvent.press(getByLabelText('Templates tab'))

      await waitFor(() => {
        expect(getByLabelText('Create new template')).toBeTruthy()
      })
    })

    it('defaults to templates when no nextWorkout', async () => {
      mockGetNextWorkout.mockResolvedValue(null)

      const { getByLabelText } = renderScreen(<Dashboard />)

      await waitFor(() => {
        expect(getByLabelText('Create new template')).toBeTruthy()
      })
    })

    it('can freely switch segments with active program', async () => {
      mockGetNextWorkout.mockResolvedValue(nextWorkoutFixture)

      const { getByLabelText } = renderScreen(<Dashboard />)

      await waitFor(() => {
        expect(getByLabelText('Create new program')).toBeTruthy()
      })

      fireEvent.press(getByLabelText('Templates tab'))
      await waitFor(() => {
        expect(getByLabelText('Create new template')).toBeTruthy()
      })

      fireEvent.press(getByLabelText('Programs tab'))
      await waitFor(() => {
        expect(getByLabelText('Create new program')).toBeTruthy()
      })
    })
  })
})
