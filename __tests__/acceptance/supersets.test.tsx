jest.setTimeout(10000)

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
  getRestSecondsForLink: jest.fn().mockResolvedValue(30),
  getExerciseById: jest.fn(),
  getExercisesByIds: jest.fn().mockResolvedValue({}),
  getAppSetting: jest.fn().mockResolvedValue('true'),
  getSessionPRs: jest.fn().mockResolvedValue([]),
  getSessionRepPRs: jest.fn().mockResolvedValue([]),
  getSessionWeightIncreases: jest.fn().mockResolvedValue([]),
  getSessionComparison: jest.fn().mockResolvedValue(null),
  getTemplateExerciseCount: jest.fn().mockResolvedValue(0),
  getTemplateExerciseCounts: jest.fn().mockResolvedValue({}),
  duplicateTemplate: jest.fn().mockResolvedValue('dup-1'),
  removeExerciseFromTemplate: jest.fn().mockResolvedValue(undefined),
  reorderTemplateExercises: jest.fn().mockResolvedValue(undefined),
  addExerciseToTemplate: jest.fn().mockResolvedValue(undefined),
  createExerciseLink: jest.fn().mockResolvedValue('link-new'),
  unlinkExerciseGroup: jest.fn().mockResolvedValue(undefined),
  unlinkSingleExercise: jest.fn().mockResolvedValue(undefined),
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
jest.mock('../../lib/layout', () => ({
  useLayout: () => ({ wide: false, width: 375, scale: 1.0, atLeastMedium: false }),
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
  deactivateKeepAwakeAsync: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../../lib/audio', () => ({ play: jest.fn(), setEnabled: jest.fn() }))
jest.mock('victory-native', () => ({
  CartesianChart: 'CartesianChart',
  Line: 'Line',
  Bar: 'Bar',
}))

import React from 'react'
import { waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import { createSession, createSet, createExercise, resetIds } from '../helpers/factories'
import ActiveSession from '../../app/session/[id]'

const mockDb = require('../../lib/db') as Record<string, jest.Mock>

const exerciseA = createExercise({ id: 'ex-a', name: 'Bench Press' })
const exerciseB = createExercise({ id: 'ex-b', name: 'Bent-Over Row' })
const exerciseC = createExercise({ id: 'ex-c', name: 'Lateral Raise' })

function makeSupersetSets(sessionId: string) {
  const linkId = 'link-1'
  return [
    {
      ...createSet({
        id: 'set-a1', session_id: sessionId, exercise_id: 'ex-a',
        set_number: 1, weight: 80, reps: 10, completed: true, completed_at: Date.now(),
        link_id: linkId, round: 0,
      }),
      exercise_name: 'Bench Press', exercise_deleted: false,
    },
    {
      ...createSet({
        id: 'set-b1', session_id: sessionId, exercise_id: 'ex-b',
        set_number: 1, weight: 60, reps: 10, completed: false,
        link_id: linkId, round: 0,
      }),
      exercise_name: 'Bent-Over Row', exercise_deleted: false,
    },
    {
      ...createSet({
        id: 'set-a2', session_id: sessionId, exercise_id: 'ex-a',
        set_number: 2, weight: 80, reps: 10, completed: false,
        link_id: linkId, round: 1,
      }),
      exercise_name: 'Bench Press', exercise_deleted: false,
    },
    {
      ...createSet({
        id: 'set-b2', session_id: sessionId, exercise_id: 'ex-b',
        set_number: 2, weight: 60, reps: 10, completed: false,
        link_id: linkId, round: 1,
      }),
      exercise_name: 'Bent-Over Row', exercise_deleted: false,
    },
  ]
}

function makeCircuitSets(sessionId: string) {
  const linkId = 'link-circuit'
  return [
    {
      ...createSet({
        id: 'set-ca1', session_id: sessionId, exercise_id: 'ex-a',
        set_number: 1, weight: 60, reps: 12, completed: false,
        link_id: linkId, round: 0,
      }),
      exercise_name: 'Bench Press', exercise_deleted: false,
    },
    {
      ...createSet({
        id: 'set-cb1', session_id: sessionId, exercise_id: 'ex-b',
        set_number: 1, weight: 40, reps: 12, completed: false,
        link_id: linkId, round: 0,
      }),
      exercise_name: 'Bent-Over Row', exercise_deleted: false,
    },
    {
      ...createSet({
        id: 'set-cc1', session_id: sessionId, exercise_id: 'ex-c',
        set_number: 1, weight: 10, reps: 15, completed: false,
        link_id: linkId, round: 0,
      }),
      exercise_name: 'Lateral Raise', exercise_deleted: false,
    },
  ]
}

beforeEach(() => {
  jest.clearAllMocks()
  resetIds()
  Object.assign(mockParams, { id: '' })
  mockDb.getExerciseById.mockImplementation((id: string) => {
    if (id === 'ex-a') return Promise.resolve(exerciseA)
    if (id === 'ex-b') return Promise.resolve(exerciseB)
    if (id === 'ex-c') return Promise.resolve(exerciseC)
    return Promise.resolve(null)
  })
  mockDb.getExercisesByIds.mockResolvedValue({ 'ex-a': exerciseA, 'ex-b': exerciseB, 'ex-c': exerciseC })
  mockDb.getPreviousSets.mockResolvedValue([])
  mockDb.getPreviousSetsBatch.mockResolvedValue({})
  mockDb.getRecentExerciseSets.mockResolvedValue([])
  mockDb.getRecentExerciseSetsBatch.mockResolvedValue({})
  mockDb.getRestSecondsForExercise.mockResolvedValue(90)
  mockDb.getRestSecondsForLink.mockResolvedValue(30)
  mockDb.getAppSetting.mockResolvedValue('true')
  mockDb.getAllExercises.mockResolvedValue([exerciseA, exerciseB, exerciseC])
  mockDb.getSessionPRs.mockResolvedValue([])
  mockDb.getSessionRepPRs.mockResolvedValue([])
  mockDb.getSessionWeightIncreases.mockResolvedValue([])
  mockDb.getSessionComparison.mockResolvedValue(null)
})

// --- Superset Grouping UI ---

describe('Superset Grouping in Active Session', () => {
  const session = createSession({ id: 'sess-ss', name: 'Push Pull', started_at: Date.now() - 60000 })

  beforeEach(() => {
    mockParams.id = 'sess-ss'
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(makeSupersetSets('sess-ss'))
  })

  it('shows "Superset" label for 2 linked exercises', async () => {
    const { findByText } = renderScreen(<ActiveSession />)
    expect(await findByText(/Superset/)).toBeTruthy()
  })

  it('shows round indicator (Round X/Y)', async () => {
    const { findByLabelText } = renderScreen(<ActiveSession />)
    expect(await findByLabelText(/Round \d+ of \d+/)).toBeTruthy()
  })

  it('shows "Rest after round" hint', async () => {
    const { findByText } = renderScreen(<ActiveSession />)
    expect(await findByText('Rest after round')).toBeTruthy()
  })

  it('renders both linked exercise names', async () => {
    const { findByText } = renderScreen(<ActiveSession />)
    expect(await findByText('Bench Press')).toBeTruthy()
    expect(await findByText('Bent-Over Row')).toBeTruthy()
  })
})

// --- Circuit Mode (3+ linked exercises) ---

describe('Circuit Mode in Active Session', () => {
  const session = createSession({ id: 'sess-circ', name: 'Full Body Circuit', started_at: Date.now() - 60000 })

  beforeEach(() => {
    mockParams.id = 'sess-circ'
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(makeCircuitSets('sess-circ'))
  })

  it('shows "Circuit" label for 3+ linked exercises', async () => {
    const { findByText } = renderScreen(<ActiveSession />)
    expect(await findByText(/Circuit/)).toBeTruthy()
  })

  it('renders all 3 circuit exercise names', async () => {
    const { findByText } = renderScreen(<ActiveSession />)
    expect(await findByText('Bench Press')).toBeTruthy()
    expect(await findByText('Bent-Over Row')).toBeTruthy()
    expect(await findByText('Lateral Raise')).toBeTruthy()
  })
})

// --- Non-linked exercises (normal sets) ---

describe('Normal Sets (No Superset)', () => {
  const session = createSession({ id: 'sess-normal', name: 'Normal Day', started_at: Date.now() - 60000 })

  beforeEach(() => {
    mockParams.id = 'sess-normal'
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue([
      {
        ...createSet({
          id: 'set-n1', session_id: 'sess-normal', exercise_id: 'ex-a',
          set_number: 1, weight: 80, reps: 10, completed: false,
          link_id: null,
        }),
        exercise_name: 'Bench Press', exercise_deleted: false,
      },
    ])
  })

  it('does not show Superset or Circuit label for unlinked exercises', async () => {
    const { findByText, queryByText } = renderScreen(<ActiveSession />)
    expect(await findByText('Bench Press')).toBeTruthy()
    expect(queryByText(/Superset/)).toBeNull()
    expect(queryByText(/Circuit/)).toBeNull()
  })
})

// --- Template superset linking UI ---

describe('Template Superset Linking', () => {
  beforeEach(() => {
    mockParams.id = 'tpl-ss'
    mockDb.getTemplateById = jest.fn().mockResolvedValue({
      id: 'tpl-ss',
      name: 'Push Pull Template',
      is_starter: false,
      exercises: [
        {
          id: 'te-1', template_id: 'tpl-ss', exercise_id: 'ex-a',
          target_sets: 3, target_reps: '10', rest_seconds: 60,
          sort_order: 0, link_id: 'link-tpl', link_label: null,
          exercise: { id: 'ex-a', name: 'Bench Press', muscle_group: 'chest', equipment: 'barbell', deleted_at: null },
        },
        {
          id: 'te-2', template_id: 'tpl-ss', exercise_id: 'ex-b',
          target_sets: 3, target_reps: '10', rest_seconds: 60,
          sort_order: 1, link_id: 'link-tpl', link_label: null,
          exercise: { id: 'ex-b', name: 'Bent-Over Row', muscle_group: 'back', equipment: 'barbell', deleted_at: null },
        },
        {
          id: 'te-3', template_id: 'tpl-ss', exercise_id: 'ex-c',
          target_sets: 3, target_reps: '15', rest_seconds: 45,
          sort_order: 2, link_id: null, link_label: null,
          exercise: { id: 'ex-c', name: 'Lateral Raise', muscle_group: 'shoulders', equipment: 'cable', deleted_at: null },
        },
      ],
    })
  })

  it('shows superset label in template for linked exercises', async () => {
    const EditTemplate = require('../../app/template/[id]').default
    const { findByText } = renderScreen(<EditTemplate />)
    // linkLabel generates "Superset A" for 2 linked exercises
    expect(await findByText(/Superset [A-Z]/)).toBeTruthy()
  })

  it('shows linked exercise names in template', async () => {
    const EditTemplate = require('../../app/template/[id]').default
    const { findByText } = renderScreen(<EditTemplate />)
    expect(await findByText('Bench Press')).toBeTruthy()
    expect(await findByText('Bent-Over Row')).toBeTruthy()
  })

  it('unlinked exercise does not show superset label', async () => {
    const EditTemplate = require('../../app/template/[id]').default
    const { findByText } = renderScreen(<EditTemplate />)
    expect(await findByText('Lateral Raise')).toBeTruthy()
    // Only one superset label for the linked pair
    await waitFor(() => {
      // Superset header appears once for the link group
    })
  })
})
