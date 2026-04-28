import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import { STARTER_TEMPLATES, STARTER_PROGRAMS } from '../../lib/starter-templates'

const STARTER_PROGRAM = STARTER_PROGRAMS[0]

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() }
let mockParams: Record<string, string> = {}

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

const mockSetAppSetting = jest.fn().mockResolvedValue(undefined)
const mockUpdateBodySettings = jest.fn().mockResolvedValue(undefined)
const mockGetBodySettings = jest.fn().mockResolvedValue({ weight_goal: 70, body_fat_goal: 15 })
const mockGetTemplates = jest.fn().mockResolvedValue([])
const mockGetTemplateById = jest.fn().mockResolvedValue(null)
const mockGetTemplateExerciseCount = jest.fn().mockResolvedValue(0)
const mockDuplicateTemplate = jest.fn().mockResolvedValue('dup-1')
const mockRemoveExerciseFromTemplate = jest.fn().mockResolvedValue(undefined)
const mockReorderTemplateExercises = jest.fn().mockResolvedValue(undefined)
const mockAddExerciseToTemplate = jest.fn().mockResolvedValue(undefined)
const mockCreateExerciseLink = jest.fn().mockResolvedValue('link-1')
const mockUnlinkExerciseGroup = jest.fn().mockResolvedValue(undefined)
const mockUnlinkSingleExercise = jest.fn().mockResolvedValue(undefined)

jest.mock('../../lib/db', () => ({
  setAppSetting: (...a: unknown[]) => mockSetAppSetting(...a),
  updateBodySettings: (...a: unknown[]) => mockUpdateBodySettings(...a),
  getBodySettings: (...a: unknown[]) => mockGetBodySettings(...a),
  getTemplates: (...a: unknown[]) => mockGetTemplates(...a),
  getTemplateById: (...a: unknown[]) => mockGetTemplateById(...a),
  getTemplateExerciseCount: (...a: unknown[]) => mockGetTemplateExerciseCount(...a),
  duplicateTemplate: (...a: unknown[]) => mockDuplicateTemplate(...a),
  removeExerciseFromTemplate: (...a: unknown[]) => mockRemoveExerciseFromTemplate(...a),
  reorderTemplateExercises: (...a: unknown[]) => mockReorderTemplateExercises(...a),
  addExerciseToTemplate: (...a: unknown[]) => mockAddExerciseToTemplate(...a),
  createExerciseLink: (...a: unknown[]) => mockCreateExerciseLink(...a),
  unlinkExerciseGroup: (...a: unknown[]) => mockUnlinkExerciseGroup(...a),
  unlinkSingleExercise: (...a: unknown[]) => mockUnlinkSingleExercise(...a),
}))

const mockActivateProgram = jest.fn().mockResolvedValue(undefined)
jest.mock('../../lib/programs', () => ({
  activateProgram: (...a: unknown[]) => mockActivateProgram(...a),
  addProgramDay: jest.fn().mockResolvedValue(undefined),
  getProgramDayCount: jest.fn().mockResolvedValue(0),
}))

jest.mock('../../lib/rpe', () => ({
  rpeColor: jest.fn().mockReturnValue('#888'),
  rpeText: jest.fn().mockReturnValue('#fff'),
}))

import Recommend from '../../app/onboarding/recommend'
import PickTemplate from '../../app/program/pick-template'
import EditTemplate from '../../app/template/[id]'

beforeEach(() => {
  jest.clearAllMocks()
  mockParams = {}
  mockRouter.push.mockClear()
  mockRouter.replace.mockClear()
  mockRouter.back.mockClear()
})

// --- Recommend Screen (Beginner) ---

describe('Recommend Screen — Beginner', () => {
  beforeEach(() => {
    mockParams = { level: 'beginner', weight: 'kg', measurement: 'cm' }
  })

  it('renders Full Body recommendation with heading, chip, exercise count, duration, and skip', () => {
    const fullBody = STARTER_TEMPLATES.find(t => t.recommended)!
    const { getByText, getByLabelText } = renderScreen(<Recommend />)
    expect(getByText('Full Body')).toBeTruthy()
    expect(getByText('We Recommend')).toBeTruthy()
    expect(getByText('Recommended')).toBeTruthy()
    expect(getByText(`${fullBody.exercises.length} exercises`)).toBeTruthy()
    expect(getByText(fullBody.duration)).toBeTruthy()
    expect(getByLabelText('Start with Full Body')).toBeTruthy()
    expect(getByLabelText('Skip recommendation and explore on your own')).toBeTruthy()
  })

  it('pressing Start with Full Body calls setAppSetting and navigates', async () => {
    const { getByLabelText } = renderScreen(<Recommend />)
    fireEvent.press(getByLabelText('Start with Full Body'))

    await waitFor(() => {
      expect(mockSetAppSetting).toHaveBeenCalledWith('onboarding_complete', '1')
      expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)')
    })
  })
})

// --- Recommend Screen (Intermediate) ---

describe('Recommend Screen — Intermediate', () => {
  beforeEach(() => {
    mockParams = { level: 'intermediate', weight: 'kg', measurement: 'cm' }
  })

  it('renders PPL program with name, description, day cycle, and Program chip', () => {
    const { getByText } = renderScreen(<Recommend />)
    expect(getByText(STARTER_PROGRAM.name)).toBeTruthy()
    expect(getByText(STARTER_PROGRAM.description)).toBeTruthy()
    expect(getByText(`${STARTER_PROGRAM.days.length}-day cycle`)).toBeTruthy()
    expect(getByText('Program')).toBeTruthy()
  })

  it('pressing Start activates program and navigates', async () => {
    const { getByLabelText } = renderScreen(<Recommend />)
    fireEvent.press(getByLabelText(`Start with ${STARTER_PROGRAM.name}`))

    await waitFor(() => {
      expect(mockActivateProgram).toHaveBeenCalledWith(STARTER_PROGRAM.id)
      expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)')
    })
  })
})

// --- Recommend Screen (Advanced) ---

describe('Recommend Screen — Advanced', () => {
  beforeEach(() => {
    mockParams = { level: 'advanced', weight: 'kg', measurement: 'cm' }
  })

  it('renders Browse Templates view with heading, template names, info, browse-all, and skip', () => {
    const browse = STARTER_TEMPLATES.slice(0, 3)
    const { getByText, getAllByText, getByLabelText } = renderScreen(<Recommend />)
    expect(getByText('Browse Our Templates')).toBeTruthy()
    for (const tpl of browse) {
      expect(getByText(tpl.name)).toBeTruthy()
    }
    const uniqueTexts = [...new Set(browse.map(tpl => `${tpl.exercises.length} exercises · ${tpl.difficulty}`))]
    for (const text of uniqueTexts) {
      expect(getAllByText(text).length).toBeGreaterThan(0)
    }
    expect(getByLabelText('Browse all workout templates')).toBeTruthy()
    expect(getByLabelText('Skip and explore on your own')).toBeTruthy()
  })

  it('pressing Browse All Templates saves settings and navigates', async () => {
    const { getByLabelText } = renderScreen(<Recommend />)
    fireEvent.press(getByLabelText('Browse all workout templates'))

    await waitFor(() => {
      expect(mockSetAppSetting).toHaveBeenCalledWith('onboarding_complete', '1')
      expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)')
    })
  })
})

// --- Template Picker Screen ---

describe('Pick Template Screen', () => {
  const mockTemplates = [
    { id: 'tpl-1', name: 'Full Body', created_at: Date.now() },
    { id: 'tpl-2', name: 'Upper Push', created_at: Date.now() },
    { id: 'tpl-3', name: 'Lower & Core', created_at: Date.now() },
  ]

  beforeEach(() => {
    mockParams = { programId: 'prog-1' }
    mockGetTemplates.mockResolvedValue(mockTemplates)
  })

  it('renders search bar, all templates, and per-template a11y labels', async () => {
    const { getByText, getByLabelText } = renderScreen(<PickTemplate />)
    await waitFor(() => {
      expect(getByLabelText('Search templates')).toBeTruthy()
      for (const tpl of mockTemplates) {
        expect(getByText(tpl.name)).toBeTruthy()
      }
      expect(getByLabelText('Select template: Full Body')).toBeTruthy()
      expect(getByLabelText('Select template: Upper Push')).toBeTruthy()
    })
  })

  it('search filters templates by name', async () => {
    const { getByLabelText, queryByText, getByText } = renderScreen(<PickTemplate />)
    await waitFor(() => {
      expect(getByText('Full Body')).toBeTruthy()
    })
    fireEvent.changeText(getByLabelText('Search templates'), 'Upper')
    await waitFor(() => {
      expect(getByText('Upper Push')).toBeTruthy()
      expect(queryByText('Full Body')).toBeNull()
      expect(queryByText('Lower & Core')).toBeNull()
    })
  })
})

// --- Template Detail Screen (starter) ---

describe('Template Detail — Starter Template', () => {
  const fullBody = STARTER_TEMPLATES[0]

  beforeEach(() => {
    mockParams = { id: fullBody.id }
    mockGetTemplateById.mockResolvedValue({
      id: fullBody.id,
      name: fullBody.name,
      is_starter: true,
      exercises: fullBody.exercises.map(e => ({
        id: e.id,
        template_id: fullBody.id,
        exercise_id: e.exercise_id,
        target_sets: e.target_sets,
        target_reps: e.target_reps,
        rest_seconds: e.rest_seconds,
        sort_order: 0,
        link_id: null,
        link_label: null,
        exercise: {
          id: e.exercise_id,
          name: e.exercise_id.replace('voltra-', 'Voltra Exercise '),
          muscle_group: 'test',
          equipment: 'cable',
          deleted_at: null,
        },
      })),
    })
  })

  it('renders exercise list, sets/reps, exercise count header, and STARTER chip', async () => {
    const { getByText, getAllByText, getByLabelText } = renderScreen(<EditTemplate />)
    const setsRepsText = `${fullBody.exercises[0].target_sets} × ${fullBody.exercises[0].target_reps} · ${fullBody.exercises[0].rest_seconds}s rest`
    await waitFor(() => {
      expect(getByText('Voltra Exercise 039')).toBeTruthy()
      expect(getAllByText(setsRepsText).length).toBeGreaterThan(0)
      expect(getByText(`Exercises (${fullBody.exercises.length})`)).toBeTruthy()
      expect(getByLabelText('Starter template, read-only. Duplicate to edit.')).toBeTruthy()
    })
  })
})

// --- Template Detail — Founder's Favourite (2-day program) ---

describe('Template Detail — Founders Favourite Day A (5 exercises)', () => {
  const dayA = STARTER_TEMPLATES.find(t => t.id === 'starter-tpl-7a')!

  beforeEach(() => {
    mockParams = { id: dayA.id }
    mockGetTemplateById.mockResolvedValue({
      id: dayA.id,
      name: dayA.name,
      is_starter: true,
      exercises: dayA.exercises.map((e, i) => ({
        id: e.id,
        template_id: dayA.id,
        exercise_id: e.exercise_id,
        target_sets: e.target_sets,
        target_reps: e.target_reps,
        rest_seconds: e.rest_seconds,
        sort_order: i,
        link_id: null,
        link_label: null,
        exercise: {
          id: e.exercise_id,
          name: `Exercise ${e.exercise_id}`,
          muscle_group: 'test',
          equipment: 'cable',
          deleted_at: null,
        },
      })),
    })
  })

  it('renders all 5 exercises with correct sets and reps', async () => {
    const { getByText, getAllByText } = renderScreen(<EditTemplate />)
    const text = `${dayA.exercises[0].target_sets} × ${dayA.exercises[0].target_reps} · ${dayA.exercises[0].rest_seconds}s rest`
    await waitFor(() => {
      expect(getByText(`Exercises (${dayA.exercises.length})`)).toBeTruthy()
      expect(getAllByText(text).length).toBeGreaterThan(0)
    })
  })
})

// --- Starter template data verification ---

describe('Starter Template Data Integrity', () => {
  it('has exactly one recommended template (Full Body) and all templates have exercises', () => {
    expect(STARTER_TEMPLATES.length).toBeGreaterThanOrEqual(8)
    const recommended = STARTER_TEMPLATES.filter(t => t.recommended)
    expect(recommended).toHaveLength(1)
    expect(recommended[0].name).toBe('Full Body')
    for (const tpl of STARTER_TEMPLATES) {
      expect(tpl.exercises.length).toBeGreaterThan(0)
    }
  })

  it('starter programs reference valid template IDs and PPL has Push/Pull/Legs days', () => {
    const templateIds = STARTER_TEMPLATES.map(t => t.id)
    for (const prog of STARTER_PROGRAMS) {
      for (const day of prog.days) {
        expect(templateIds).toContain(day.template_id)
      }
    }
    const ppl = STARTER_PROGRAMS.find(p => p.id === 'starter-prog-1')!
    expect(ppl.days).toHaveLength(3)
    expect(ppl.days[0].label).toBe('Push')
    expect(ppl.days[1].label).toBe('Pull')
    expect(ppl.days[2].label).toBe('Legs & Core')
  })
})
