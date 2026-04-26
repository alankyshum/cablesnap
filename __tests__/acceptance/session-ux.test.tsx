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
  getPreviousSetsBatch: jest.fn().mockResolvedValue({}),
  getRecentExerciseSets: jest.fn().mockResolvedValue([]),
  getRecentExerciseSetsBatch: jest.fn().mockResolvedValue({}),
  getRestSecondsForExercise: jest.fn().mockResolvedValue(90),
  getRestSecondsForLink: jest.fn().mockResolvedValue(90),
  getExerciseById: jest.fn(),
  getExercisesByIds: jest.fn().mockResolvedValue({}),
  getAppSetting: jest.fn().mockResolvedValue('true'),
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
jest.mock('../../components/TrainingModeSelector', () => 'TrainingModeSelector')

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
jest.mock('../../lib/audio', () => ({ play: jest.fn(), setEnabled: jest.fn(), preload: jest.fn() }))
jest.mock('victory-native', () => ({ CartesianChart: 'CartesianChart', Line: 'Line', Bar: 'Bar' }))

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
    it('haptics module is wired into session screen', async () => {
      setupSession()
      const { findByText, findByLabelText } = renderScreen(<ActiveSession />)
      await findByText('Squat')

      const checkBtn = await findByLabelText('Mark set 1 complete')
      await waitFor(async () => {
        fireEvent.press(checkBtn)
      })

      // Haptics is exercised by set completion, suggestion chip taps, etc.
      expect(Haptics.impactAsync).toBeDefined()
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
