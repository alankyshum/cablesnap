jest.mock('../../lib/db', () => ({
  getSessionById: jest.fn(),
  getSessionSets: jest.fn().mockResolvedValue([]),
  getTemplateById: jest.fn().mockResolvedValue(null),
  addSet: jest.fn().mockResolvedValue(undefined),
  addSetsBatch: jest.fn().mockResolvedValue(undefined),
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
  getSessionPRs: jest.fn().mockResolvedValue([]),
  getSessionRepPRs: jest.fn().mockResolvedValue([]),
  getSessionWeightIncreases: jest.fn().mockResolvedValue([]),
  getSessionComparison: jest.fn().mockResolvedValue(null),
  updateSession: jest.fn().mockResolvedValue(undefined),
  getSessionSetCount: jest.fn().mockResolvedValue(0),
  getSessionSetCounts: jest.fn().mockResolvedValue({}),
  createTemplateFromSession: jest.fn().mockResolvedValue('new-template-id'),
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
jest.mock('../../lib/rpe', () => ({
  rpeColor: jest.fn().mockReturnValue('#888'),
  rpeText: jest.fn().mockReturnValue('#fff'),
}))
jest.mock('../../lib/units', () => ({
  toDisplay: (v: number) => v,
  toKg: (v: number) => v,
  KG_TO_LB: 2.20462,
  LB_TO_KG: 0.453592,
}))
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
jest.mock('../../lib/layout', () => ({
  useLayout: () => ({ wide: false, width: 375, scale: 1.0 }),
}))
jest.mock('../../lib/errors', () => ({
  logError: jest.fn(),
  generateReport: jest.fn().mockResolvedValue('{}'),
  getRecentErrors: jest.fn().mockResolvedValue([]),
  generateGitHubURL: jest.fn().mockReturnValue('https://github.com'),
}))
jest.mock('../../lib/interactions', () => ({
  log: jest.fn(),
  recent: jest.fn().mockResolvedValue([]),
}))
jest.mock('expo-file-system', () => ({
  File: jest.fn(),
  Paths: { cache: '/cache' },
}))
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
jest.mock('victory-native', () => ({
  CartesianChart: 'CartesianChart',
  Line: 'Line',
  Bar: 'Bar',
}))
jest.mock('../../lib/format', () => ({
  formatDuration: jest.fn().mockReturnValue('30:00'),
  formatDateShort: jest.fn().mockReturnValue('Apr 15'),
}))

import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import { createSession, createSet, createExercise, resetIds } from '../helpers/factories'
import ActiveSession from '../../app/session/[id]'
import SessionDetail from '../../app/session/detail/[id]'

const mockDb = require('../../lib/db') as Record<string, jest.Mock>

const exercise = createExercise({ id: 'ex-1', name: 'Bench Press' })

function makeSessionSets(sessionId: string, opts?: { rpe?: number | null; notes?: string }) {
  return [
    {
      ...createSet({
        id: 'set-1',
        session_id: sessionId,
        exercise_id: 'ex-1',
        set_number: 1,
        weight: 80,
        reps: 8,
        completed: true,
        completed_at: Date.now(),
        rpe: opts?.rpe ?? null,
        notes: opts?.notes ?? '',
      }),
      exercise_name: 'Bench Press',
      exercise_deleted: false,
    },
    {
      ...createSet({
        id: 'set-2',
        session_id: sessionId,
        exercise_id: 'ex-1',
        set_number: 2,
        weight: 80,
        reps: 8,
        completed: false,
        rpe: null,
        notes: '',
      }),
      exercise_name: 'Bench Press',
      exercise_deleted: false,
    },
  ]
}

beforeEach(() => {
  jest.clearAllMocks()
  resetIds()
  Object.assign(mockParams, { id: '' })
  mockDb.getExerciseById.mockResolvedValue(exercise)
  mockDb.getExercisesByIds.mockResolvedValue({ 'ex-1': exercise })
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

// --- RPE Selector in Active Session ---

describe('RPE Selector in Active Session', () => {
  const session = createSession({ id: 'sess-rpe', name: 'Push Day', started_at: Date.now() - 60000 })

  beforeEach(() => {
    mockParams.id = 'sess-rpe'
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(makeSessionSets('sess-rpe'))
  })

  it('renders RPE chips with a11y labels', async () => {
    const { findByLabelText } = renderScreen(<ActiveSession />)
    // RPE chips should render with accessible labels for each value
    expect(await findByLabelText(/RPE 6/)).toBeTruthy()
    expect(await findByLabelText(/RPE 7/)).toBeTruthy()
    expect(await findByLabelText(/RPE 8/)).toBeTruthy()
    expect(await findByLabelText(/RPE 9/)).toBeTruthy()
    expect(await findByLabelText(/RPE 10/)).toBeTruthy()
  })

  it('RPE chip is pressable and calls updateSetRPE', async () => {
    const { findAllByLabelText } = renderScreen(<ActiveSession />)

    const rpe8Chips = await findAllByLabelText(/RPE 8/)
    fireEvent.press(rpe8Chips[0])

    await waitFor(() => {
      expect(mockDb.updateSetRPE).toHaveBeenCalledWith('set-1', 8)
    })
  })

  it('renders RPE radio group with a11y role', async () => {
    const { findByLabelText } = renderScreen(<ActiveSession />)
    expect(await findByLabelText('Rate of perceived exertion')).toBeTruthy()
  })
})

// --- Notes Field in Active Session ---

describe('Notes Field in Active Session', () => {
  const session = createSession({ id: 'sess-notes', name: 'Pull Day', started_at: Date.now() - 60000 })

  beforeEach(() => {
    mockParams.id = 'sess-notes'
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(makeSessionSets('sess-notes'))
  })

  it('renders exercise-level notes button with a11y label', async () => {
    const { findAllByLabelText } = renderScreen(<ActiveSession />)
    const noteButtons = await findAllByLabelText('Bench Press notes')
    expect(noteButtons.length).toBeGreaterThan(0)
  })

  it('pressing notes button shows notes input', async () => {
    const { findAllByLabelText, getByPlaceholderText } = renderScreen(<ActiveSession />)
    const noteButtons = await findAllByLabelText('Bench Press notes')
    fireEvent.press(noteButtons[0])

    await waitFor(() => {
      expect(getByPlaceholderText('Add exercise notes...')).toBeTruthy()
    })
  })

  it('typing in notes field and blurring calls updateSetNotes', async () => {
    const { findAllByLabelText, getByPlaceholderText } = renderScreen(<ActiveSession />)
    const noteButtons = await findAllByLabelText('Bench Press notes')
    fireEvent.press(noteButtons[0])

    const input = await waitFor(() => getByPlaceholderText('Add exercise notes...'))
    fireEvent.changeText(input, 'Felt strong today')
    fireEvent(input, 'blur')

    await waitFor(() => {
      expect(mockDb.updateSetNotes).toHaveBeenCalledWith('set-1', 'Felt strong today')
    })
  })
})

// --- RPE Display in Session Detail (History View) ---

describe('RPE Display in Session Detail', () => {
  const session = createSession({
    id: 'sess-detail-rpe',
    name: 'Upper Body',
    started_at: Date.now() - 3600000,
    completed_at: Date.now(),
    duration_seconds: 3600,
  })

  beforeEach(() => {
    mockParams.id = 'sess-detail-rpe'
    mockDb.getSessionById.mockResolvedValue(session)
  })

  it('shows RPE badge for completed sets with RPE value', async () => {
    mockDb.getSessionSets.mockResolvedValue(
      makeSessionSets('sess-detail-rpe', { rpe: 8 })
    )

    const { findByText } = renderScreen(<SessionDetail />)
    expect(await findByText('RPE 8')).toBeTruthy()
  })

  it('does not show RPE badge when RPE is null', async () => {
    mockDb.getSessionSets.mockResolvedValue(
      makeSessionSets('sess-detail-rpe', { rpe: null })
    )

    const { findByText, queryByText } = renderScreen(<SessionDetail />)
    // Wait for session to load
    expect(await findByText('Bench Press')).toBeTruthy()
    // No RPE badge should appear
    expect(queryByText(/RPE \d/)).toBeNull()
  })
})

// --- Notes Display in Session Detail ---

describe('Notes Display in Session Detail', () => {
  const session = createSession({
    id: 'sess-detail-notes',
    name: 'Leg Day',
    started_at: Date.now() - 3600000,
    completed_at: Date.now(),
    duration_seconds: 3600,
  })

  beforeEach(() => {
    mockParams.id = 'sess-detail-notes'
    mockDb.getSessionById.mockResolvedValue(session)
  })

  it('shows notes text for sets with notes', async () => {
    mockDb.getSessionSets.mockResolvedValue(
      makeSessionSets('sess-detail-notes', { notes: 'Grip felt off' })
    )

    const { findByText } = renderScreen(<SessionDetail />)
    expect(await findByText('Grip felt off')).toBeTruthy()
  })

  it('does not show notes when notes is empty', async () => {
    mockDb.getSessionSets.mockResolvedValue(
      makeSessionSets('sess-detail-notes', { notes: '' })
    )

    const { findByText, queryByText } = renderScreen(<SessionDetail />)
    expect(await findByText('Bench Press')).toBeTruthy()
    expect(queryByText('Grip felt off')).toBeNull()
  })
})

// --- RPE and Notes Together ---

describe('RPE and Notes Combined', () => {
  const session = createSession({ id: 'sess-combo', name: 'Full Body', started_at: Date.now() - 60000 })

  beforeEach(() => {
    mockParams.id = 'sess-combo'
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(
      makeSessionSets('sess-combo', { rpe: 9, notes: 'Hard set' })
    )
  })

  it('shows both RPE badge and notes in session detail', async () => {
    const { findByText } = renderScreen(<SessionDetail />)
    expect(await findByText('RPE 9')).toBeTruthy()
    expect(await findByText('Hard set')).toBeTruthy()
  })
})

// --- Swapped From Label in Session Detail ---

describe('Swapped From Label in Session Detail', () => {
  const session = createSession({
    id: 'sess-swap-detail',
    name: 'Chest Day',
    started_at: Date.now() - 3600000,
    completed_at: Date.now(),
    duration_seconds: 3600,
  })

  beforeEach(() => {
    mockParams.id = 'sess-swap-detail'
    mockDb.getSessionById.mockResolvedValue(session)
  })

  it('shows "Swapped from" label when exercise was substituted', async () => {
    mockDb.getSessionSets.mockResolvedValue([
      {
        ...createSet({
          id: 'set-swap-1',
          session_id: 'sess-swap-detail',
          exercise_id: 'ex-new',
          set_number: 1,
          weight: 60,
          reps: 10,
          completed: true,
          completed_at: Date.now(),
          swapped_from_exercise_id: 'ex-original',
        }),
        exercise_name: 'Dumbbell Press',
        exercise_deleted: false,
        swapped_from_name: 'Bench Press',
      },
    ])

    const { findByText } = renderScreen(<SessionDetail />)
    expect(await findByText('Swapped from Bench Press')).toBeTruthy()
  })

  it('does not show "Swapped from" label for non-substituted exercises', async () => {
    mockDb.getSessionSets.mockResolvedValue([
      {
        ...createSet({
          id: 'set-noswap-1',
          session_id: 'sess-swap-detail',
          exercise_id: 'ex-1',
          set_number: 1,
          weight: 80,
          reps: 8,
          completed: true,
          completed_at: Date.now(),
        }),
        exercise_name: 'Bench Press',
        exercise_deleted: false,
      },
    ])

    const { findByText, queryByText } = renderScreen(<SessionDetail />)
    expect(await findByText('Bench Press')).toBeTruthy()
    expect(queryByText(/Swapped from/)).toBeNull()
  })
})
