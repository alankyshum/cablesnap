jest.mock('../../lib/db', () => ({
  getSessionById: jest.fn(),
  getSessionSets: jest.fn().mockResolvedValue([]),
  getTemplateById: jest.fn().mockResolvedValue(null),
  addSet: jest.fn(),
  addSetsBatch: jest.fn().mockResolvedValue([]),
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
  deleteSet: jest.fn().mockResolvedValue(undefined),
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
  getAllExercises: jest.fn().mockResolvedValue([]),
  getTemplateExerciseCount: jest.fn().mockResolvedValue(0),
  getTemplateExerciseCounts: jest.fn().mockResolvedValue({}),
  addExerciseToTemplate: jest.fn().mockResolvedValue(undefined),
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
jest.mock('../../components/TrainingModeSelector', () => 'TrainingModeSelector')

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() }
let mockParams: Record<string, string> = {}

let capturedOnPick: ((exercise: { id: string; name: string }) => void) | null = null

jest.mock('../../components/ExercisePickerSheet', () => {
  const RealReact = require('react')
  function MockPickerSheet({ visible, onPick }: { visible: boolean; onPick: (ex: { id: string }) => void; onDismiss: () => void }) {
    RealReact.useEffect(() => {
      if (visible) capturedOnPick = onPick as typeof capturedOnPick
    }, [visible, onPick])
    return visible ? RealReact.createElement('View', { testID: 'exercise-picker-sheet' }) : null
  }
  return { __esModule: true, default: MockPickerSheet }
})

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
      }, [])
    },
    Stack: { Screen: () => null },
    Redirect: () => null,
  }
})

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')
jest.mock('../../lib/layout', () => ({ useLayout: () => ({ wide: false, width: 375, scale: 1.0 }) }))
jest.mock('../../lib/errors', () => ({ logError: jest.fn(), generateReport: jest.fn().mockResolvedValue('{}'), getRecentErrors: jest.fn().mockResolvedValue([]), generateGitHubURL: jest.fn().mockReturnValue('https://github.com') }))
jest.mock('../../lib/interactions', () => ({ log: jest.fn(), recent: jest.fn().mockResolvedValue([]) }))
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), notificationAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light', Heavy: 'heavy' }, NotificationFeedbackType: { Success: 'success', Warning: 'warning' } }))
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: jest.fn().mockResolvedValue(undefined), deactivateKeepAwake: jest.fn() }))
jest.mock('../../lib/audio', () => ({ play: jest.fn(), setEnabled: jest.fn(), preload: jest.fn() }))
jest.mock('../../lib/confirm', () => ({ confirmAction: jest.fn() }))

import React from 'react'
import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import { createSession, createSet, createExercise, resetIds } from '../helpers/factories'

import ActiveSession from '../../app/session/[id]'

const mockDb = require('../../lib/db') as Record<string, jest.Mock>

const benchPress = createExercise({ id: 'ex-1', name: 'Bench Press', category: 'chest', primary_muscles: ['chest'] })
const squat = createExercise({ id: 'ex-2', name: 'Squat', category: 'legs_glutes', primary_muscles: ['quads'] })
const deadlift = createExercise({ id: 'ex-3', name: 'Deadlift', category: 'back', primary_muscles: ['back'] })

function makeSets(sessionId: string, exerciseId: string, exerciseName: string) {
  return [1, 2, 3].map((n) => ({
    ...createSet({
      id: `set-${exerciseId}-${n}`,
      session_id: sessionId,
      exercise_id: exerciseId,
      set_number: n,
      weight: null,
      reps: null,
      completed: false,
    }),
    exercise_name: exerciseName,
    exercise_deleted: false,
  }))
}

describe('Session → Add Exercise Flow', () => {
  const session = createSession({ id: 'sess-1', name: 'Push Day', started_at: Date.now() - 60000 })

  beforeEach(() => {
    jest.clearAllMocks()
    resetIds()
    mockParams = {}
    capturedOnPick = null
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getBodySettings.mockResolvedValue({ weight_unit: 'kg', measurement_unit: 'cm', weight_goal: null, body_fat_goal: null })
    mockDb.getMaxWeightByExercise.mockResolvedValue({})
    mockDb.getPreviousSets.mockResolvedValue([])
    mockDb.getRecentExerciseSets.mockResolvedValue([])
    mockDb.getExerciseById.mockImplementation((id: string) => {
      if (id === 'ex-1') return Promise.resolve(benchPress)
      if (id === 'ex-2') return Promise.resolve(squat)
      if (id === 'ex-3') return Promise.resolve(deadlift)
      return Promise.resolve(null)
    })
    mockDb.getExercisesByIds.mockResolvedValue({ 'ex-1': benchPress, 'ex-2': squat, 'ex-3': deadlift })
    mockDb.getPreviousSetsBatch.mockResolvedValue({})
    mockDb.getRecentExerciseSetsBatch.mockResolvedValue({})
    mockDb.getAppSetting.mockResolvedValue('true')
    mockDb.addSet.mockImplementation((sid: string, eid: string, num: number) =>
      Promise.resolve(createSet({ session_id: sid, exercise_id: eid, set_number: num }))
    )
  })

  it('opens picker sheet inline and shows new exercise as last group within 500ms', async () => {
    const initialSets = makeSets('sess-1', 'ex-1', 'Bench Press')
    mockParams = { id: 'sess-1' }
    mockDb.getSessionSets.mockResolvedValue(initialSets)

    const screen = renderScreen(<ActiveSession />)
    expect(await screen.findByText('Bench Press')).toBeTruthy()

    // Press Add Exercise — opens bottom sheet, not a new page
    fireEvent.press(await screen.findByLabelText('Add exercise to workout'))
    await waitFor(() => expect(screen.getByTestId('exercise-picker-sheet')).toBeTruthy())

    // Simulate picking Squat via the sheet callback
    const updatedSets = [
      ...makeSets('sess-1', 'ex-1', 'Bench Press'),
      ...makeSets('sess-1', 'ex-2', 'Squat'),
    ]
    mockDb.getSessionSets.mockResolvedValue(updatedSets)

    await act(async () => { capturedOnPick!(squat) })

    await waitFor(() => {
      expect(mockDb.addSet).toHaveBeenCalledTimes(3)
      expect(mockDb.addSet).toHaveBeenCalledWith('sess-1', 'ex-2', 1)
      expect(mockDb.addSet).toHaveBeenCalledWith('sess-1', 'ex-2', 2)
      expect(mockDb.addSet).toHaveBeenCalledWith('sess-1', 'ex-2', 3)
    })

    // Both exercises visible within 500ms, Squat last
    expect(await screen.findByText('Bench Press', {}, { timeout: 500 })).toBeTruthy()
    expect(await screen.findByText('Squat', {}, { timeout: 500 })).toBeTruthy()

    await waitFor(() => {
      const addSetBtns = screen.getAllByLabelText(/^Add set to/)
      expect(addSetBtns).toHaveLength(2)
    }, { timeout: 500 })
    const addSetBtns = screen.getAllByLabelText(/^Add set to/)
    expect(addSetBtns[0].props.accessibilityLabel).toBe('Add set to Bench Press')
    expect(addSetBtns[1].props.accessibilityLabel).toBe('Add set to Squat')
  })

  it('adds third exercise via sheet, appears last after existing exercises', async () => {
    const initialSets = [
      ...makeSets('sess-1', 'ex-1', 'Bench Press'),
      ...makeSets('sess-1', 'ex-2', 'Squat'),
    ]
    mockParams = { id: 'sess-1' }
    mockDb.getSessionSets.mockResolvedValue(initialSets)

    const screen = renderScreen(<ActiveSession />)
    expect(await screen.findByText('Bench Press')).toBeTruthy()
    expect(await screen.findByText('Squat')).toBeTruthy()

    fireEvent.press(await screen.findByLabelText('Add exercise to workout'))

    const updatedSets = [
      ...makeSets('sess-1', 'ex-1', 'Bench Press'),
      ...makeSets('sess-1', 'ex-2', 'Squat'),
      ...makeSets('sess-1', 'ex-3', 'Deadlift'),
    ]
    mockDb.getSessionSets.mockResolvedValue(updatedSets)

    await act(async () => { capturedOnPick!(deadlift) })

    await waitFor(() => {
      expect(mockDb.addSet).toHaveBeenCalledWith('sess-1', 'ex-3', 1)
    })

    expect(await screen.findByText('Deadlift', {}, { timeout: 500 })).toBeTruthy()

    await waitFor(() => {
      const addSetBtns = screen.getAllByLabelText(/^Add set to/)
      expect(addSetBtns).toHaveLength(3)
    }, { timeout: 500 })
    const addSetBtns = screen.getAllByLabelText(/^Add set to/)
    expect(addSetBtns[0].props.accessibilityLabel).toBe('Add set to Bench Press')
    expect(addSetBtns[1].props.accessibilityLabel).toBe('Add set to Squat')
    expect(addSetBtns[2].props.accessibilityLabel).toBe('Add set to Deadlift')
  })
})
