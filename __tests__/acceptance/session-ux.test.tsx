jest.mock('../../lib/db', () => ({
  getSessionById: jest.fn(),
  getSessionSets: jest.fn().mockResolvedValue([]),
  getTemplateById: jest.fn().mockResolvedValue(null),
  addSet: jest.fn().mockResolvedValue(undefined),
  completeSet: jest.fn().mockResolvedValue(undefined),
  uncompleteSet: jest.fn().mockResolvedValue(undefined),
  completeSession: jest.fn().mockResolvedValue(undefined),
  cancelSession: jest.fn().mockResolvedValue(undefined),
  updateSet: jest.fn().mockResolvedValue(undefined),
  updateSetRPE: jest.fn().mockResolvedValue(undefined),
  updateSetNotes: jest.fn().mockResolvedValue(undefined),
  updateSetTempo: jest.fn().mockResolvedValue(undefined),
  getBodySettings: jest.fn().mockResolvedValue({ weight_unit: 'kg', measurement_unit: 'cm', weight_goal: null, body_fat_goal: null }),
  getMaxWeightByExercise: jest.fn().mockResolvedValue({}),
  getPreviousSets: jest.fn().mockResolvedValue([]),
  getPreviousSetsBatch: jest.fn().mockResolvedValue({}),
  getRecentExerciseSets: jest.fn().mockResolvedValue([]),
  getRecentExerciseSetsBatch: jest.fn().mockResolvedValue({}),
  getRestSecondsForExercise: jest.fn().mockResolvedValue(90),
  getRestSecondsForLink: jest.fn().mockResolvedValue(90),
  getExerciseById: jest.fn(),
  getExercisesByIds: jest.fn().mockResolvedValue({}),
  getAppSetting: jest.fn().mockResolvedValue('true'),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
  getSessionPRs: jest.fn().mockResolvedValue([]),
  getSessionRepPRs: jest.fn().mockResolvedValue([]),
  getSessionWeightIncreases: jest.fn().mockResolvedValue([]),
  getSessionComparison: jest.fn().mockResolvedValue(null),
  deleteSet: jest.fn().mockResolvedValue(undefined),
  getAllExercises: jest.fn().mockResolvedValue([]),
  swapExerciseInSession: jest.fn().mockResolvedValue([]),
  undoSwapInSession: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../lib/programs', () => ({
  getSessionProgramDayId: jest.fn().mockResolvedValue(null),
  getProgramDayById: jest.fn().mockResolvedValue(null),
  advanceProgram: jest.fn().mockResolvedValue({ wrapped: false }),
}))

jest.mock('../../lib/rm', () => ({ ...jest.requireActual('../../lib/rm'), suggest: jest.fn().mockReturnValue(null) }))
jest.mock('../../lib/rpe', () => ({ rpeColor: jest.fn().mockReturnValue('#888'), rpeText: jest.fn().mockReturnValue('#fff') }))
jest.mock('../../lib/units', () => ({ toDisplay: (v: number) => v, toKg: (v: number) => v, KG_TO_LB: 2.20462, LB_TO_KG: 0.453592 }))

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() }
const mockParams: Record<string, string> = {}

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  usePathname: () => '/test',
  useFocusEffect: jest.fn(),
  Stack: { Screen: () => null },
  Redirect: () => null,
}))
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')
jest.mock('../../lib/layout', () => ({ useLayout: () => ({ wide: false, width: 375, scale: 1.0 }) }))
jest.mock('../../lib/errors', () => ({ logError: jest.fn(), generateReport: jest.fn().mockResolvedValue('{}'), getRecentErrors: jest.fn().mockResolvedValue([]), generateGitHubURL: jest.fn().mockReturnValue('https://github.com') }))
jest.mock('../../lib/interactions', () => ({ log: jest.fn(), recent: jest.fn().mockResolvedValue([]) }))
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'undetermined' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  scheduleNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  SchedulableTriggerInputTypes: { WEEKLY: 'weekly', TIME_INTERVAL: 'timeInterval' },
}))
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}))
jest.mock('expo-keep-awake', () => ({
  useKeepAwake: jest.fn(),
  activateKeepAwakeAsync: jest.fn().mockResolvedValue(undefined),
  deactivateKeepAwake: jest.fn(),
  deactivateKeepAwakeAsync: jest.fn().mockResolvedValue(undefined),
}))
// BLD-753a: use centralized manual mock at lib/__mocks__/audio.ts
jest.mock('../../lib/audio')
jest.mock('victory-native', () => ({ CartesianChart: 'CartesianChart', Line: 'Line', Bar: 'Bar' }))
jest.mock('react-native-reanimated', () => {
  const React = require('react')
  const noop = () => {}
  const noopValue = (v: unknown) => ({ value: v })
  const AnimatedView = React.forwardRef((props: unknown, ref: unknown) => React.createElement('View', { ...(props as object), ref }))
  AnimatedView.displayName = 'AnimatedView'
  const AnimatedText = React.forwardRef((props: unknown, ref: unknown) => React.createElement('Text', { ...(props as object), ref }))
  AnimatedText.displayName = 'AnimatedText'
  const createAnimatedComponent = (Component: React.ComponentType<unknown>) => {
    const AnimatedComponent = React.forwardRef((props: unknown, ref: unknown) => React.createElement(Component, { ...(props as object), ref }))
    AnimatedComponent.displayName = `Animated(${Component.displayName || Component.name || 'Component'})`
    return AnimatedComponent
  }
  return {
    __esModule: true,
    default: {
      View: AnimatedView,
      Text: AnimatedText,
      createAnimatedComponent,
    },
    useSharedValue: noopValue,
    useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
    useAnimatedStyle: (fn: () => unknown) => fn(),
    useAnimatedProps: (fn: () => unknown) => fn(),
    useAnimatedScrollHandler: () => noop,
    useAnimatedGestureHandler: () => noop,
    useAnimatedRef: () => ({ current: null }),
    useAnimatedReaction: noop,
    useReducedMotion: () => false,
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    withDecay: (v: unknown) => v,
    withDelay: (_delay: unknown, v: unknown) => v,
    withSequence: (...args: unknown[]) => args[args.length - 1],
    withRepeat: (v: unknown) => v,
    cancelAnimation: noop,
    Easing: { bezier: () => noop, out: noop, in: noop, inOut: noop },
    interpolate: (v: unknown) => v,
    interpolateColor: (_value: unknown, _inputRange: unknown, outputRange: unknown[]) => outputRange[0],
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    runOnUI: (fn: (...args: unknown[]) => unknown) => fn,
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    createAnimatedComponent,
    measure: () => ({ x: 0, y: 0, width: 0, height: 0, pageX: 0, pageY: 0 }),
    scrollTo: noop,
    setGestureState: noop,
    makeMutable: noopValue,
    SharedValue: {},
    ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
    getRelativeCoords: () => ({ x: 0, y: 0 }),
    enableLayoutAnimations: noop,
    configureLayoutAnimations: noop,
  }
})

import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import { createSession, createSet, createExercise, resetIds } from '../helpers/factories'
import ActiveSession from '../../app/session/[id]'
import * as Haptics from 'expo-haptics'
import { activateKeepAwakeAsync } from 'expo-keep-awake'

const mockDb = require('../../lib/db') as Record<string, jest.Mock>

const exercise = createExercise({ id: 'ex-1', name: 'Squat' })

function makeSessionSets(sessionId: string) {
  return [
    { ...createSet({ id: 'set-1', session_id: sessionId, exercise_id: 'ex-1', set_number: 1, weight: 100, reps: 5, completed: false }), exercise_name: 'Squat', exercise_deleted: false },
    { ...createSet({ id: 'set-2', session_id: sessionId, exercise_id: 'ex-1', set_number: 2, weight: 100, reps: 5, completed: false }), exercise_name: 'Squat', exercise_deleted: false },
    { ...createSet({ id: 'set-3', session_id: sessionId, exercise_id: 'ex-1', set_number: 3, weight: 100, reps: 5, completed: false }), exercise_name: 'Squat', exercise_deleted: false },
  ]
}

function setupSession() {
  const session = createSession({ id: 'sess-ux', name: 'Leg Day', started_at: Date.now() - 60000 })
  const sets = makeSessionSets('sess-ux')
  mockParams.id = 'sess-ux'
  mockDb.getSessionById.mockResolvedValue(session)
  mockDb.getSessionSets.mockResolvedValue(sets)
  mockDb.getExerciseById.mockResolvedValue(exercise)
  mockDb.getExercisesByIds.mockResolvedValue({ 'ex-1': exercise })
  return { session, sets }
}

describe('Session UX Acceptance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetIds()
    jest.useFakeTimers()
    delete mockParams.id
    delete mockParams.templateId
    mockDb.getSessionSets.mockResolvedValue([])
    mockDb.getSessionById.mockResolvedValue(null)
    mockDb.getExerciseById.mockResolvedValue(null)
    mockDb.getExercisesByIds.mockResolvedValue({})
    mockDb.getBodySettings.mockResolvedValue({ weight_unit: 'kg', measurement_unit: 'cm', weight_goal: null, body_fat_goal: null })
    mockDb.getMaxWeightByExercise.mockResolvedValue({})
    mockDb.getPreviousSets.mockResolvedValue([])
    mockDb.getPreviousSetsBatch.mockResolvedValue({})
    mockDb.getRecentExerciseSets.mockResolvedValue([])
    mockDb.getRecentExerciseSetsBatch.mockResolvedValue({})
    mockDb.getRestSecondsForExercise.mockResolvedValue(90)
    mockDb.getAppSetting.mockResolvedValue('true')
    mockDb.getSessionPRs.mockResolvedValue([])
    mockDb.getSessionRepPRs.mockResolvedValue([])
    mockDb.getSessionWeightIncreases.mockResolvedValue([])
    mockDb.getSessionComparison.mockResolvedValue(null)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('Keep-Awake', () => {
    it('activates keep-awake when session loads', async () => {
      setupSession()
      const { findByText } = renderScreen(<ActiveSession />)
      await findByText('Squat')
      expect(activateKeepAwakeAsync).toHaveBeenCalled()
    })
  })

  describe('Haptic Feedback', () => {
    it('fires haptic impact when a set is completed', async () => {
      setupSession()
      const { findByText, findByLabelText } = renderScreen(<ActiveSession />)
      await findByText('Squat')
      ;(Haptics.impactAsync as jest.Mock).mockClear()

      const checkBtn = await findByLabelText('Mark set 1 complete')
      await waitFor(async () => {
        fireEvent.press(checkBtn)
      })

      await waitFor(() => {
        expect(Haptics.impactAsync).toHaveBeenCalled()
      })
    })
  })

  describe('Rest Timer', () => {
    it('rest timer skip button no longer in list (moved to header)', async () => {
      setupSession()
      mockDb.getRestSecondsForExercise.mockResolvedValue(60)

      const { findByText, findByLabelText, queryByLabelText } = renderScreen(<ActiveSession />)
      await findByText('Squat')

      // Complete a set to trigger rest timer
      const checkBtn = await findByLabelText('Mark set 1 complete')
      fireEvent.press(checkBtn)

      // Wait for state to settle
      await findByText('Squat')

      // Old "Skip rest timer" banner button no longer exists in list content
      expect(queryByLabelText('Skip rest timer')).toBeNull()
    })
  })

  describe('Session restore hydration', () => {
    it('hydrates persisted weight and reps after remount', async () => {
      setupSession()

      const first = renderScreen(<ActiveSession />)
      await first.findByText('Squat')
      expect(await first.findByLabelText('Set 1 weight, 100 kilograms')).toBeTruthy()
      expect(await first.findByLabelText('Set 1 reps, 5')).toBeTruthy()

      first.unmount()

      setupSession()
      const second = renderScreen(<ActiveSession />)
      await second.findByText('Squat')
      expect(await second.findByLabelText('Set 1 weight, 100 kilograms')).toBeTruthy()
      expect(await second.findByLabelText('Set 1 reps, 5')).toBeTruthy()
    })
  })

  describe('Exercise-level notes (BLD-275)', () => {
    it('does NOT render a per-set notes button', async () => {
      setupSession()
      const { findByText, queryAllByLabelText } = renderScreen(<ActiveSession />)
      await findByText('Squat')
      const setNotesButtons = queryAllByLabelText('Set notes')
      expect(setNotesButtons.length).toBe(0)
    })

    it('renders an exercise-level notes button in the header', async () => {
      setupSession()
      const { findByText, findByLabelText } = renderScreen(<ActiveSession />)
      await findByText('Squat')
      const notesBtn = await findByLabelText('Squat notes')
      expect(notesBtn).toBeTruthy()
    })

    it('renders delete button per set row', async () => {
      setupSession()
      const { findByText, getAllByLabelText } = renderScreen(<ActiveSession />)
      await findByText('Squat')
      const deleteButtons = getAllByLabelText(/Delete set/)
      expect(deleteButtons.length).toBe(3)
    })
  })
})
