jest.mock('../../lib/db', () => ({
  getSessionById: jest.fn(),
  getSessionSets: jest.fn().mockResolvedValue([]),
  getSourceSessionSets: jest.fn().mockResolvedValue([]),
  getTemplateById: jest.fn().mockResolvedValue(null),
  buildInitialSetsFromTemplate: jest.fn((tpl, sessionId) => {
    if (!tpl?.exercises) return []
    return tpl.exercises.flatMap((te: { exercise_id: string; target_sets: number; link_id?: string | null; position?: number; set_types?: string[] }) =>
      Array.from({ length: te.target_sets }, (_, i) => ({
        sessionId,
        exerciseId: te.exercise_id,
        setNumber: i + 1,
        linkId: te.link_id ?? null,
        round: te.link_id ? i + 1 : null,
        exercisePosition: te.position ?? 0,
        setType: te.set_types?.[i] ?? 'normal',
      }))
    )
  }),
  addSet: jest.fn().mockImplementation(
    (sessionId, exerciseId, setNumber, weight, reps, _restSeconds, durationSeconds) => Promise.resolve({
      id: `set-${exerciseId}-${setNumber}`,
      session_id: sessionId,
      exercise_id: exerciseId,
      set_number: setNumber,
      weight: weight ?? null,
      reps: reps ?? null,
      duration_seconds: durationSeconds ?? null,
      completed: 0,
      attachment: null,
      mount_position: null,
    }),
  ),
  addSetsBatch: jest.fn().mockResolvedValue([]),
  completeSet: jest.fn().mockResolvedValue(undefined),
  uncompleteSet: jest.fn().mockResolvedValue(undefined),
  completeSession: jest.fn().mockResolvedValue(undefined),
  cancelSession: jest.fn().mockResolvedValue(undefined),
  updateSet: jest.fn().mockResolvedValue(undefined),
  updateSetsBatch: jest.fn().mockResolvedValue(undefined),
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
  getSessionDurationPRs: jest.fn().mockResolvedValue([]),
  getSessionWeightIncreases: jest.fn().mockResolvedValue([]),
  getSessionComparison: jest.fn().mockResolvedValue(null),
  updateSession: jest.fn().mockResolvedValue(undefined),
  getSessionSetCount: jest.fn().mockResolvedValue(0),
  getSessionSetCounts: jest.fn().mockResolvedValue({}),
  createTemplateFromSession: jest.fn().mockResolvedValue('new-template-id'),
  buildAchievementContext: jest.fn().mockResolvedValue({
    totalWorkouts: 0,
    workoutDates: [],
    prCount: 0,
    maxSessionVolume: 0,
    lifetimeVolume: 0,
    nutritionDays: [],
    bodyWeightCount: 0,
    progressPhotoCount: 0,
    bodyMeasurementCount: 0,
  }),
  getEarnedAchievementIds: jest.fn().mockResolvedValue(new Set()),
  saveEarnedAchievements: jest.fn().mockResolvedValue(undefined),
  getAllExercises: jest.fn().mockResolvedValue([]),
  swapExerciseInSession: jest.fn().mockResolvedValue([]),
  undoSwapInSession: jest.fn().mockResolvedValue(undefined),
  updateExercisePositions: jest.fn().mockResolvedValue(undefined),
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
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), notificationAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light', Heavy: 'heavy' }, NotificationFeedbackType: { Success: 'success', Warning: 'warning' } }))
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn(), activateKeepAwakeAsync: jest.fn().mockResolvedValue(undefined), deactivateKeepAwake: jest.fn(), deactivateKeepAwakeAsync: jest.fn().mockResolvedValue(undefined) }))
// BLD-753a: use centralized manual mock at lib/__mocks__/audio.ts
jest.mock('../../lib/audio')
jest.mock('victory-native', () => ({ CartesianChart: 'CartesianChart', Line: 'Line', Bar: 'Bar' }))
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (c: unknown) => c },
    useSharedValue: (init: unknown) => ({ value: init }),
    useAnimatedStyle: () => ({}),
    useAnimatedProps: () => ({}),
    useReducedMotion: () => false,
    cancelAnimation: jest.fn(),
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    withDelay: (_d: unknown, v: unknown) => v,
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    Easing: { bezier: () => (t: number) => t },
  }
})

import React from 'react'
import { Alert } from 'react-native'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import { createSession, createSet, createExercise, resetIds } from '../helpers/factories'
import ActiveSession from '../../app/session/[id]'
import Summary from '../../app/session/summary/[id]'

const mockDb = require('../../lib/db') as Record<string, jest.Mock>

const exercise = createExercise({ id: 'ex-1', name: 'Bench Press' })

function makeSessionSets(sessionId: string) {
  return [
    { ...createSet({ id: 'set-1', session_id: sessionId, exercise_id: 'ex-1', set_number: 1, weight: 80, reps: 8, completed: true, completed_at: Date.now() }), exercise_name: 'Bench Press', exercise_deleted: false },
    { ...createSet({ id: 'set-2', session_id: sessionId, exercise_id: 'ex-1', set_number: 2, weight: 80, reps: 8, completed: false }), exercise_name: 'Bench Press', exercise_deleted: false },
    { ...createSet({ id: 'set-3', session_id: sessionId, exercise_id: 'ex-1', set_number: 3, weight: 80, reps: 6, completed: false }), exercise_name: 'Bench Press', exercise_deleted: false },
  ]
}

// eslint-disable-next-line max-lines-per-function
describe('Workout Session Acceptance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetIds()
    delete mockParams.id
    delete mockParams.templateId
    delete mockParams.sourceSessionId
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

  it('loads and displays exercise group after session fetch', async () => {
    const session = createSession({ id: 'sess-1', name: 'Push Day', started_at: Date.now() - 60000 })
    const sets = makeSessionSets('sess-1')
    mockParams.id = 'sess-1'
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(sets)
    mockDb.getExerciseById.mockResolvedValue(exercise)
    mockDb.getExercisesByIds.mockResolvedValue({ 'ex-1': exercise })

    const { findByLabelText } = renderScreen(<ActiveSession />)

    // BLD-783: extend timeout to 5000ms — this test races the effect chain
    // (getSessionById → getSessionSets → getExercisesByIds → groups → GroupCard)
    // under CI parallel-shard load. Default 1000ms is insufficient as the FIRST
    // test of the suite, where there is no warm-up. Sibling tests later in the
    // suite pass with default timeouts. The rendered tree dump on timeout
    // confirms the elements exist; only the timing is the issue.
    expect(
      await findByLabelText('Remove Bench Press', {}, { timeout: 5000 })
    ).toBeTruthy()
  })

  it('calls completeSession when finish workout is confirmed', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert')
    const session = createSession({ id: 'sess-2', name: 'Leg Day', started_at: Date.now() - 120000 })
    const sets = makeSessionSets('sess-2')
    mockParams.id = 'sess-2'
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(sets)
    mockDb.getExerciseById.mockResolvedValue(exercise)
    mockDb.getExercisesByIds.mockResolvedValue({ 'ex-1': exercise })

    const { findByLabelText } = renderScreen(<ActiveSession />)

    const finishBtn = await findByLabelText('Finish workout')
    fireEvent.press(finishBtn)

    expect(alertSpy).toHaveBeenCalledWith(
      'Complete Workout?',
      expect.any(String),
      expect.any(Array),
    )

    const buttons = alertSpy.mock.calls[0][2] as { text?: string; style?: string; onPress?: () => Promise<void> | void }[]
    const completeBtn = buttons.find((b) => b.text === 'OK')
    await completeBtn!.onPress!()

    expect(mockDb.completeSession).toHaveBeenCalledWith('sess-2')

    alertSpy.mockRestore()
  })

  it('calls cancelSession and navigates back on discard', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert')
    const session = createSession({ id: 'sess-3', name: 'Pull Day', started_at: Date.now() - 30000 })
    const sets = makeSessionSets('sess-3')
    mockParams.id = 'sess-3'
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(sets)
    mockDb.getExerciseById.mockResolvedValue(exercise)
    mockDb.getExercisesByIds.mockResolvedValue({ 'ex-1': exercise })

    const { findByLabelText } = renderScreen(<ActiveSession />)

    const cancelBtn = await findByLabelText('Cancel workout')
    fireEvent.press(cancelBtn)

    expect(alertSpy).toHaveBeenCalledWith(
      'Discard Workout?',
      expect.any(String),
      expect.any(Array),
    )

    const buttons = alertSpy.mock.calls[0][2] as { text?: string; style?: string; onPress?: () => Promise<void> | void }[]
    const discardBtn = buttons.find((b) => b.text === 'Delete')
    await discardBtn!.onPress!()

    expect(mockDb.cancelSession).toHaveBeenCalledWith('sess-3')
    expect(mockRouter.back).toHaveBeenCalled()

    alertSpy.mockRestore()
  })

  it('renders summary screen with duration and PR card', async () => {
    const session = createSession({
      id: 'sess-4',
      name: 'Upper Body',
      started_at: Date.now() - 1800000,
      completed_at: Date.now(),
      duration_seconds: 1800,
    })
    const completedSets = [
      { ...createSet({ id: 'set-s1', session_id: 'sess-4', exercise_id: 'ex-1', set_number: 1, weight: 100, reps: 5, completed: true, completed_at: Date.now() }), exercise_name: 'Bench Press' },
      { ...createSet({ id: 'set-s2', session_id: 'sess-4', exercise_id: 'ex-1', set_number: 2, weight: 100, reps: 5, completed: true, completed_at: Date.now() }), exercise_name: 'Bench Press' },
    ]
    mockParams.id = 'sess-4'
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(completedSets)
    mockDb.getSessionPRs.mockResolvedValue([{ exercise_id: 'ex-1', name: 'Bench Press', weight: 100, previous_max: 90 }])

    const { findByText } = renderScreen(<Summary />)

    expect(await findByText('Workout Complete!')).toBeTruthy()
    expect(await findByText('30:00')).toBeTruthy()
    expect(await findByText(/1 New PR/)).toBeTruthy()
  })

  it('navigates home when Done is pressed on summary', async () => {
    const session = createSession({
      id: 'sess-5',
      name: 'Full Body',
      started_at: Date.now() - 900000,
      completed_at: Date.now(),
      duration_seconds: 900,
    })
    mockParams.id = 'sess-5'
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue([])

    const { findByText, getByAccessibilityHint } = renderScreen(<Summary />)

    await findByText('Workout Complete!')

    const doneBtn = getByAccessibilityHint('Return to workouts tab')
    fireEvent.press(doneBtn)

    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)')
  })

  // --- New tests ---

  it('displays multiple exercise names when session has different exercises', async () => {
    const session = createSession({ id: 'sess-multi', name: 'Full Body', started_at: Date.now() - 60000 })
    const squat = createExercise({ id: 'ex-2', name: 'Squat' })
    const sets = [
      { ...createSet({ id: 'set-m1', session_id: 'sess-multi', exercise_id: 'ex-1', set_number: 1, weight: 80, reps: 8, completed: false }), exercise_name: 'Bench Press', exercise_deleted: false },
      { ...createSet({ id: 'set-m2', session_id: 'sess-multi', exercise_id: 'ex-2', set_number: 1, weight: 100, reps: 5, completed: false }), exercise_name: 'Squat', exercise_deleted: false },
    ]
    mockParams.id = 'sess-multi'
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(sets)
    mockDb.getExerciseById.mockImplementation((eid: string) => {
      if (eid === 'ex-1') return Promise.resolve(exercise)
      if (eid === 'ex-2') return Promise.resolve(squat)
      return Promise.resolve(null)
    })
    mockDb.getExercisesByIds.mockResolvedValue({ 'ex-1': exercise, 'ex-2': squat })

    const { findByText } = renderScreen(<ActiveSession />)

    expect(await findByText('Bench Press')).toBeTruthy()
    expect(await findByText('Squat')).toBeTruthy()
  })

  it('shows exercise name with removed suffix for deleted exercises', async () => {
    const session = createSession({ id: 'sess-del', name: 'Old Workout', started_at: Date.now() - 60000 })
    const sets = [
      { ...createSet({ id: 'set-d1', session_id: 'sess-del', exercise_id: 'ex-1', set_number: 1, weight: 60, reps: 10, completed: false }), exercise_name: 'Cable Fly', exercise_deleted: true },
    ]
    mockParams.id = 'sess-del'
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(sets)
    mockDb.getExerciseById.mockResolvedValue(null)

    const { findByText } = renderScreen(<ActiveSession />)

    expect(await findByText('Cable Fly (removed)')).toBeTruthy()
  })

  it('displays previous set data for each set row', async () => {
    const session = createSession({ id: 'sess-prev', name: 'Push Day', started_at: Date.now() - 60000 })
    const sets = makeSessionSets('sess-prev')
    mockParams.id = 'sess-prev'
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(sets)
    mockDb.getExerciseById.mockResolvedValue(exercise)
    mockDb.getExercisesByIds.mockResolvedValue({ 'ex-1': exercise })
    mockDb.getPreviousSets.mockResolvedValue([
      { set_number: 1, weight: 75, reps: 8 },
      { set_number: 2, weight: 75, reps: 7 },
    ])
    mockDb.getPreviousSetsBatch.mockResolvedValue({
      'ex-1': [
        { set_number: 1, weight: 75, reps: 8, completed: true, rpe: null },
        { set_number: 2, weight: 75, reps: 7, completed: true, rpe: null },
      ],
    })

    const { findByText } = renderScreen(<ActiveSession />)

    await findByText('Bench Press')
    expect(await findByText('75×8')).toBeTruthy()
    expect(await findByText('75×7')).toBeTruthy()
  })

  it('calls addSet when Add Set button is pressed', async () => {
    const session = createSession({ id: 'sess-add', name: 'Push Day', started_at: Date.now() - 60000 })
    const sets = makeSessionSets('sess-add')
    mockParams.id = 'sess-add'
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(sets)
    mockDb.getExerciseById.mockResolvedValue(exercise)
    mockDb.getExercisesByIds.mockResolvedValue({ 'ex-1': exercise })

    const { findByLabelText } = renderScreen(<ActiveSession />)

    const addBtn = await findByLabelText('Add set to Bench Press')
    fireEvent.press(addBtn)

    await waitFor(() => {
      expect(mockDb.addSet).toHaveBeenCalledWith('sess-add', 'ex-1', 4, null, null, null, undefined, undefined, 0)
    })
  })

  it('renders checked state for completed sets and unchecked for pending', async () => {
    const session = createSession({ id: 'sess-state', name: 'Push Day', started_at: Date.now() - 60000 })
    const sets = makeSessionSets('sess-state')
    mockParams.id = 'sess-state'
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(sets)
    mockDb.getExerciseById.mockResolvedValue(exercise)
    mockDb.getExercisesByIds.mockResolvedValue({ 'ex-1': exercise })

    const { findByLabelText } = renderScreen(<ActiveSession />)

    const completedCheck = await findByLabelText('Mark set 1 incomplete')
    expect(completedCheck.props.accessibilityState).toEqual({ checked: true })

    const pendingCheck = await findByLabelText('Mark set 2 complete')
    expect(pendingCheck.props.accessibilityState).toEqual({ checked: false })

    const pendingCheck3 = await findByLabelText('Mark set 3 complete')
    expect(pendingCheck3.props.accessibilityState).toEqual({ checked: false })
  })

  it('calls completeSet when uncompleted set checkbox is toggled', async () => {
    const session = createSession({ id: 'sess-chk', name: 'Push Day', started_at: Date.now() - 60000 })
    const sets = makeSessionSets('sess-chk')
    mockParams.id = 'sess-chk'
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(sets)
    mockDb.getExerciseById.mockResolvedValue(exercise)
    mockDb.getExercisesByIds.mockResolvedValue({ 'ex-1': exercise })

    const screen = renderScreen(<ActiveSession />)
    await screen.findByText('Bench Press')

    // Custom Pressable checkbox with accessibility labels
    const unchecked = screen.queryAllByLabelText(/Mark set \d+ complete$/)
    expect(unchecked.length).toBeGreaterThanOrEqual(2)
    fireEvent.press(unchecked[0])

    await waitFor(() => {
      expect(mockDb.completeSet).toHaveBeenCalled()
    })
  })

  it('calls uncompleteSet when completed set checkbox is toggled', async () => {
    const session = createSession({ id: 'sess-unchk', name: 'Push Day', started_at: Date.now() - 60000 })
    const sets = makeSessionSets('sess-unchk')
    mockParams.id = 'sess-unchk'
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(sets)
    mockDb.getExerciseById.mockResolvedValue(exercise)
    mockDb.getExercisesByIds.mockResolvedValue({ 'ex-1': exercise })

    const screen = renderScreen(<ActiveSession />)
    await screen.findByText('Bench Press')

    const checked = screen.queryAllByLabelText(/Mark set \d+ incomplete$/)
    expect(checked.length).toBeGreaterThanOrEqual(1)
    fireEvent.press(checked[0])

    await waitFor(() => {
      expect(mockDb.uncompleteSet).toHaveBeenCalled()
    })
  })

  it('navigates to summary after finishing workout with completed sets', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert')
    const session = createSession({ id: 'sess-nav', name: 'Push Day', started_at: Date.now() - 120000 })
    const sets = makeSessionSets('sess-nav')
    mockParams.id = 'sess-nav'
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(sets)
    mockDb.getExerciseById.mockResolvedValue(exercise)
    mockDb.getExercisesByIds.mockResolvedValue({ 'ex-1': exercise })

    const { findByLabelText } = renderScreen(<ActiveSession />)

    const finishBtn = await findByLabelText('Finish workout')
    fireEvent.press(finishBtn)

    const buttons = alertSpy.mock.calls[0][2] as { text?: string; style?: string; onPress?: () => Promise<void> | void }[]
    const completeBtn = buttons.find((b) => b.text === 'OK')
    await completeBtn!.onPress!()

    expect(mockDb.completeSession).toHaveBeenCalledWith('sess-nav')
    expect(mockRouter.replace).toHaveBeenCalledWith('/session/summary/sess-nav')

    alertSpy.mockRestore()
  })

  it('navigates home after finishing workout with no completed sets', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert')
    const session = createSession({ id: 'sess-empty', name: 'Quick', started_at: Date.now() - 30000 })
    const uncompleted = [
      { ...createSet({ id: 'set-e1', session_id: 'sess-empty', exercise_id: 'ex-1', set_number: 1, weight: null, reps: null, completed: false }), exercise_name: 'Bench Press', exercise_deleted: false },
    ]
    mockParams.id = 'sess-empty'
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(uncompleted)
    mockDb.getExerciseById.mockResolvedValue(exercise)
    mockDb.getExercisesByIds.mockResolvedValue({ 'ex-1': exercise })

    const { findByLabelText } = renderScreen(<ActiveSession />)

    const finishBtn = await findByLabelText('Finish workout')
    fireEvent.press(finishBtn)

    const buttons = alertSpy.mock.calls[0][2] as { text?: string; style?: string; onPress?: () => Promise<void> | void }[]
    const completeBtn = buttons.find((b) => b.text === 'OK')
    await completeBtn!.onPress!()

    expect(mockDb.completeSession).toHaveBeenCalledWith('sess-empty')
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)')

    alertSpy.mockRestore()
  })

  it('cancel confirmation offers Keep Going to dismiss', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert')
    const session = createSession({ id: 'sess-keep', name: 'Push Day', started_at: Date.now() - 30000 })
    const sets = makeSessionSets('sess-keep')
    mockParams.id = 'sess-keep'
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(sets)
    mockDb.getExerciseById.mockResolvedValue(exercise)
    mockDb.getExercisesByIds.mockResolvedValue({ 'ex-1': exercise })

    const { findByLabelText } = renderScreen(<ActiveSession />)

    const cancelBtn = await findByLabelText('Cancel workout')
    fireEvent.press(cancelBtn)

    const buttons = alertSpy.mock.calls[0][2] as { text?: string; style?: string; onPress?: () => Promise<void> | void }[]
    const keepBtn = buttons.find((b) => b.text === 'Cancel')
    expect(keepBtn).toBeDefined()
    expect(keepBtn!.style).toBe('cancel')

    expect(mockDb.cancelSession).not.toHaveBeenCalled()
    expect(mockRouter.back).not.toHaveBeenCalled()

    alertSpy.mockRestore()
  })

  describe('templateId population', () => {
    it('creates sets from template with pre-filled weights and reps from previous session', async () => {
      const session = createSession({ id: 'sess-template', name: 'Push Day', started_at: Date.now() - 60000 })
      mockParams.id = 'sess-template'
      mockParams.templateId = 'tpl-1'
      mockDb.getSessionById.mockResolvedValue(session)

      const createdSets = [
        { ...createSet({ id: 'new-t1', session_id: 'sess-template', exercise_id: 'ex-1', set_number: 1, set_type: 'warmup' }), exercise_name: 'Bench Press', exercise_deleted: false },
        { ...createSet({ id: 'new-t2', session_id: 'sess-template', exercise_id: 'ex-1', set_number: 2, set_type: 'failure' }), exercise_name: 'Bench Press', exercise_deleted: false },
      ]
      mockDb.getSessionSets
        .mockResolvedValueOnce([])
        .mockResolvedValue(createdSets)
      mockDb.getTemplateById.mockResolvedValue({
        id: 'tpl-1',
        exercises: [
          { exercise_id: 'ex-1', target_sets: 2, target_reps: '12,8', set_types: ['warmup', 'failure'], link_id: null, position: 1 },
        ],
      })
      mockDb.addSetsBatch.mockResolvedValue(createdSets)
      mockDb.getPreviousSetsBatch.mockResolvedValue({
        'ex-1': [
          { set_number: 1, weight: 80, reps: 10, duration_seconds: null, completed: true, rpe: null, set_type: 'normal' },
          { set_number: 2, weight: 85, reps: 8, duration_seconds: null, completed: true, rpe: null, set_type: 'failure' },
        ],
      })
      mockDb.getExerciseById.mockResolvedValue(exercise)
      mockDb.getExercisesByIds.mockResolvedValue({ 'ex-1': exercise })

      renderScreen(<ActiveSession />)

      await waitFor(() => {
        expect(mockDb.getTemplateById).toHaveBeenCalledWith('tpl-1')
        expect(mockDb.addSetsBatch).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ exerciseId: 'ex-1', setNumber: 1, setType: 'warmup' }),
            expect.objectContaining({ exerciseId: 'ex-1', setNumber: 2, setType: 'failure' }),
          ])
        )
        expect(mockDb.updateSetsBatch).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ id: 'new-t1', weight: 80, reps: 10 }),
            expect.objectContaining({ id: 'new-t2', weight: 85, reps: 8 }),
          ])
        )
      })
    })

    it('falls back to template target reps when previous session data is missing', async () => {
      const session = createSession({ id: 'sess-template-fallback', name: 'Push Day', started_at: Date.now() - 60000 })
      mockParams.id = 'sess-template-fallback'
      mockParams.templateId = 'tpl-fallback'
      mockDb.getSessionById.mockResolvedValue(session)

      const createdSets = [
        { ...createSet({ id: 'new-f1', session_id: 'sess-template-fallback', exercise_id: 'ex-1', set_number: 1, set_type: 'warmup' }), exercise_name: 'Bench Press', exercise_deleted: false },
        { ...createSet({ id: 'new-f2', session_id: 'sess-template-fallback', exercise_id: 'ex-1', set_number: 2, set_type: 'failure' }), exercise_name: 'Bench Press', exercise_deleted: false },
      ]
      mockDb.getSessionSets
        .mockResolvedValueOnce([])
        .mockResolvedValue(createdSets)
      mockDb.getTemplateById.mockResolvedValue({
        id: 'tpl-fallback',
        exercises: [
          { exercise_id: 'ex-1', target_sets: 2, target_reps: '12,8', set_types: ['warmup', 'failure'], link_id: null, position: 1 },
        ],
      })
      mockDb.addSetsBatch.mockResolvedValue(createdSets)
      mockDb.getPreviousSetsBatch.mockResolvedValue({ 'ex-1': [] })
      mockDb.getExerciseById.mockResolvedValue(exercise)
      mockDb.getExercisesByIds.mockResolvedValue({ 'ex-1': exercise })

      renderScreen(<ActiveSession />)

      await waitFor(() => {
        expect(mockDb.addSetsBatch).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ exerciseId: 'ex-1', setNumber: 1, setType: 'warmup' }),
            expect.objectContaining({ exerciseId: 'ex-1', setNumber: 2, setType: 'failure' }),
          ])
        )
        expect(mockDb.updateSetsBatch).toHaveBeenCalledWith([
          { id: 'new-f1', weight: null, reps: 12 },
          { id: 'new-f2', weight: null, reps: 8 },
        ])
      })
    })
  })

  describe('sourceSessionId population', () => {
    it('creates sets from source session with pre-filled weights and reps', async () => {
      const session = createSession({ id: 'sess-repeat', name: 'Push Day', started_at: Date.now() - 60000 })
      mockParams.id = 'sess-repeat'
      mockParams.sourceSessionId = 'source-1'
      mockDb.getSessionById.mockResolvedValue(session)
      mockDb.getSessionSets.mockResolvedValue([]) // empty — triggers population
      mockDb.getSourceSessionSets.mockResolvedValue([
        { exercise_id: 'ex-1', set_number: 1, weight: 80, reps: 10, link_id: null, tempo: null, exercise_exists: true },
        { exercise_id: 'ex-1', set_number: 2, weight: 85, reps: 8, link_id: null, tempo: null, exercise_exists: true },
      ])
      mockDb.addSetsBatch.mockResolvedValue([
        { ...createSet({ id: 'new-1', session_id: 'sess-repeat', exercise_id: 'ex-1', set_number: 1 }), exercise_name: 'Bench Press', exercise_deleted: false },
        { ...createSet({ id: 'new-2', session_id: 'sess-repeat', exercise_id: 'ex-1', set_number: 2 }), exercise_name: 'Bench Press', exercise_deleted: false },
      ])
      mockDb.getExerciseById.mockResolvedValue(exercise)
    mockDb.getExercisesByIds.mockResolvedValue({ 'ex-1': exercise })

      renderScreen(<ActiveSession />)

      await waitFor(() => {
        expect(mockDb.getSourceSessionSets).toHaveBeenCalledWith('source-1')
        expect(mockDb.addSetsBatch).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ exerciseId: 'ex-1', setNumber: 1 }),
            expect.objectContaining({ exerciseId: 'ex-1', setNumber: 2 }),
          ])
        )
        expect(mockDb.updateSetsBatch).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ id: 'new-1', weight: 80, reps: 10 }),
            expect.objectContaining({ id: 'new-2', weight: 85, reps: 8 }),
          ])
        )
      })
    })

    it('filters out deleted exercises and preserves valid ones', async () => {
      const session = createSession({ id: 'sess-del', name: 'Push Day', started_at: Date.now() - 60000 })
      mockParams.id = 'sess-del'
      mockParams.sourceSessionId = 'source-del'
      mockDb.getSessionById.mockResolvedValue(session)
      mockDb.getSessionSets.mockResolvedValue([])
      mockDb.getSourceSessionSets.mockResolvedValue([
        { exercise_id: 'ex-1', set_number: 1, weight: 80, reps: 10, link_id: null, tempo: null, exercise_exists: true },
        { exercise_id: 'ex-deleted', set_number: 1, weight: 60, reps: 12, link_id: null, tempo: null, exercise_exists: false },
      ])
      mockDb.addSetsBatch.mockResolvedValue([
        { ...createSet({ id: 'new-1', session_id: 'sess-del', exercise_id: 'ex-1', set_number: 1 }), exercise_name: 'Bench Press', exercise_deleted: false },
      ])
      mockDb.getExerciseById.mockResolvedValue(exercise)
    mockDb.getExercisesByIds.mockResolvedValue({ 'ex-1': exercise })

      renderScreen(<ActiveSession />)

      await waitFor(() => {
        expect(mockDb.addSetsBatch).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ exerciseId: 'ex-1' }),
          ])
        )
        // Should NOT include the deleted exercise
        const batchCall = mockDb.addSetsBatch.mock.calls[0][0]
        expect(batchCall.every((s: { exerciseId: string }) => s.exerciseId !== 'ex-deleted')).toBe(true)
      })
    })

    it('remaps link_ids to new UUIDs for supersets', async () => {
      const session = createSession({ id: 'sess-link', name: 'Superset Day', started_at: Date.now() - 60000 })
      mockParams.id = 'sess-link'
      mockParams.sourceSessionId = 'source-link'
      mockDb.getSessionById.mockResolvedValue(session)
      mockDb.getSessionSets.mockResolvedValue([])
      mockDb.getSourceSessionSets.mockResolvedValue([
        { exercise_id: 'ex-1', set_number: 1, weight: 80, reps: 10, link_id: 'old-link-1', tempo: '3-1-2', exercise_exists: true },
        { exercise_id: 'ex-2', set_number: 1, weight: 40, reps: 12, link_id: 'old-link-1', tempo: null, exercise_exists: true },
      ])
      mockDb.addSetsBatch.mockResolvedValue([
        { ...createSet({ id: 'new-1', session_id: 'sess-link', exercise_id: 'ex-1', set_number: 1 }), exercise_name: 'Bench Press', exercise_deleted: false },
        { ...createSet({ id: 'new-2', session_id: 'sess-link', exercise_id: 'ex-2', set_number: 1 }), exercise_name: 'Curls', exercise_deleted: false },
      ])
      mockDb.getExerciseById.mockResolvedValue(exercise)
    mockDb.getExercisesByIds.mockResolvedValue({ 'ex-1': exercise })

      renderScreen(<ActiveSession />)

      await waitFor(() => {
        const batchCall = mockDb.addSetsBatch.mock.calls[0][0] as { linkId: string | null; tempo: string | null }[]
        // Both should have the same NEW link_id (not the old one)
        expect(batchCall[0].linkId).not.toBe('old-link-1')
        expect(batchCall[0].linkId).toBeTruthy()
        expect(batchCall[0].linkId).toBe(batchCall[1].linkId)
        // Tempo should be preserved
        expect(batchCall[0].tempo).toBe('3-1-2')
        expect(batchCall[1].tempo).toBeNull()
      })
    })
  })
})
