jest.setTimeout(10000)

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
  updateSetTrainingMode: jest.fn().mockResolvedValue(undefined),
  updateSetTempo: jest.fn().mockResolvedValue(undefined),
  getBodySettings: jest.fn().mockResolvedValue({ weight_unit: 'kg', measurement_unit: 'cm', weight_goal: null, body_fat_goal: null }),
  getMaxWeightByExercise: jest.fn().mockResolvedValue({}),
  getPreviousSets: jest.fn().mockResolvedValue([]),
  getRecentExerciseSets: jest.fn().mockResolvedValue([]),
  getRestSecondsForExercise: jest.fn().mockResolvedValue(90),
  getRestSecondsForLink: jest.fn().mockResolvedValue(90),
  getExerciseById: jest.fn(),
  getAppSetting: jest.fn().mockResolvedValue('true'),
  getSessionPRs: jest.fn().mockResolvedValue([]),
  getSessionRepPRs: jest.fn().mockResolvedValue([]),
  getSessionWeightIncreases: jest.fn().mockResolvedValue([]),
  getSessionComparison: jest.fn().mockResolvedValue(null),
}))

jest.mock('../../lib/programs', () => ({
  getSessionProgramDayId: jest.fn().mockResolvedValue(null),
  getProgramDayById: jest.fn().mockResolvedValue(null),
  advanceProgram: jest.fn().mockResolvedValue({ wrapped: false }),
}))

jest.mock('../../lib/rm', () => ({ suggest: jest.fn().mockReturnValue(null) }))
jest.mock('../../lib/rpe', () => ({ rpeColor: jest.fn().mockReturnValue('#888'), rpeText: jest.fn().mockReturnValue('#fff') }))
jest.mock('../../lib/units', () => ({ toDisplay: (v: number) => v, toKg: (v: number) => v, KG_TO_LB: 2.20462, LB_TO_KG: 0.453592 }))
jest.mock('../../components/TrainingModeSelector', () => 'TrainingModeSelector')

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() }
const mockParams: Record<string, string> = {}

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  usePathname: () => '/test',
  useFocusEffect: jest.fn(),
  Stack: { Screen: ({ options }: any) => null },
  Redirect: () => null,
}))
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')
jest.mock('../../lib/layout', () => ({ useLayout: () => ({ wide: false, width: 375, scale: 1.0 }) }))
jest.mock('../../lib/errors', () => ({ logError: jest.fn(), generateReport: jest.fn().mockResolvedValue('{}'), getRecentErrors: jest.fn().mockResolvedValue([]), generateGitHubURL: jest.fn().mockReturnValue('https://github.com') }))
jest.mock('../../lib/interactions', () => ({ log: jest.fn(), recent: jest.fn().mockResolvedValue([]) }))
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), notificationAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light', Heavy: 'heavy' }, NotificationFeedbackType: { Success: 'success', Warning: 'warning' } }))
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }))
jest.mock('../../lib/audio', () => ({ play: jest.fn(), setEnabled: jest.fn() }))
jest.mock('react-native-chart-kit', () => ({ LineChart: 'LineChart', BarChart: 'BarChart' }))

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

describe('Workout Session Acceptance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetIds()
    delete mockParams.id
    delete mockParams.templateId
    mockDb.getSessionSets.mockResolvedValue([])
    mockDb.getSessionById.mockResolvedValue(null)
    mockDb.getExerciseById.mockResolvedValue(null)
    mockDb.getBodySettings.mockResolvedValue({ weight_unit: 'kg', measurement_unit: 'cm', weight_goal: null, body_fat_goal: null })
    mockDb.getMaxWeightByExercise.mockResolvedValue({})
    mockDb.getPreviousSets.mockResolvedValue([])
    mockDb.getRecentExerciseSets.mockResolvedValue([])
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

    const { findByText } = renderScreen(<ActiveSession />)

    expect(await findByText('Bench Press')).toBeTruthy()
  })

  it('calls completeSession when finish workout is confirmed', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert')
    const session = createSession({ id: 'sess-2', name: 'Leg Day', started_at: Date.now() - 120000 })
    const sets = makeSessionSets('sess-2')
    mockParams.id = 'sess-2'
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(sets)
    mockDb.getExerciseById.mockResolvedValue(exercise)

    const { findByLabelText } = renderScreen(<ActiveSession />)

    const finishBtn = await findByLabelText('Finish workout')
    fireEvent.press(finishBtn)

    expect(alertSpy).toHaveBeenCalledWith(
      'Complete Workout?',
      expect.any(String),
      expect.any(Array),
    )

    const buttons = alertSpy.mock.calls[0][2] as any[]
    const completeBtn = buttons.find((b: any) => b.text === 'Complete')
    await completeBtn.onPress()

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

    const { findByLabelText } = renderScreen(<ActiveSession />)

    const cancelBtn = await findByLabelText('Cancel workout')
    fireEvent.press(cancelBtn)

    expect(alertSpy).toHaveBeenCalledWith(
      'Discard Workout?',
      expect.any(String),
      expect.any(Array),
    )

    const buttons = alertSpy.mock.calls[0][2] as any[]
    const discardBtn = buttons.find((b: any) => b.text === 'Discard')
    await discardBtn.onPress()

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
})
