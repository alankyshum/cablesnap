jest.setTimeout(10000)

import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import { STARTER_TEMPLATES, STARTER_PROGRAM } from '../../lib/starter-templates'

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

  it('shows recommended Full Body template name', () => {
    const { getByText } = renderScreen(<Recommend />)
    expect(getByText('Full Body')).toBeTruthy()
  })

  it('shows "We Recommend" heading', () => {
    const { getByText } = renderScreen(<Recommend />)
    expect(getByText('We Recommend')).toBeTruthy()
  })

  it('shows Recommended chip', () => {
    const { getByText } = renderScreen(<Recommend />)
    expect(getByText('Recommended')).toBeTruthy()
  })

  it('shows exercise count and duration for Full Body', () => {
    const fullBody = STARTER_TEMPLATES.find(t => t.recommended)!
    const { getByText } = renderScreen(<Recommend />)
    expect(getByText(`${fullBody.exercises.length} exercises`)).toBeTruthy()
    expect(getByText(fullBody.duration)).toBeTruthy()
  })

  it('has Start with Full Body button with correct a11y label', () => {
    const { getByLabelText } = renderScreen(<Recommend />)
    expect(getByLabelText('Start with Full Body')).toBeTruthy()
  })

  it('has skip button with a11y label', () => {
    const { getByLabelText } = renderScreen(<Recommend />)
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

  it('shows PPL program name "Push / Pull / Legs"', () => {
    const { getByText } = renderScreen(<Recommend />)
    expect(getByText(STARTER_PROGRAM.name)).toBeTruthy()
  })

  it('shows PPL program description', () => {
    const { getByText } = renderScreen(<Recommend />)
    expect(getByText(STARTER_PROGRAM.description)).toBeTruthy()
  })

  it('shows day cycle count', () => {
    const { getByText } = renderScreen(<Recommend />)
    expect(getByText(`${STARTER_PROGRAM.days.length}-day cycle`)).toBeTruthy()
  })

  it('shows Program chip', () => {
    const { getByText } = renderScreen(<Recommend />)
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

  it('shows "Browse Our Templates" heading', () => {
    const { getByText } = renderScreen(<Recommend />)
    expect(getByText('Browse Our Templates')).toBeTruthy()
  })

  it('shows at least 3 browse templates with names visible', () => {
    const browse = STARTER_TEMPLATES.slice(0, 3)
    const { getByText } = renderScreen(<Recommend />)
    for (const tpl of browse) {
      expect(getByText(tpl.name)).toBeTruthy()
    }
  })

  it('shows exercise count and difficulty for browse templates', () => {
    const browse = STARTER_TEMPLATES.slice(0, 3)
    const { getAllByText } = renderScreen(<Recommend />)
    // Each browse template shows its info; some may share the same text
    const uniqueTexts = [...new Set(browse.map(tpl => `${tpl.exercises.length} exercises · ${tpl.difficulty}`))]
    for (const text of uniqueTexts) {
      expect(getAllByText(text).length).toBeGreaterThan(0)
    }
  })

  it('has Browse All Templates button with a11y label', () => {
    const { getByLabelText } = renderScreen(<Recommend />)
    expect(getByLabelText('Browse all workout templates')).toBeTruthy()
  })

  it('has skip button', () => {
    const { getByLabelText } = renderScreen(<Recommend />)
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

  it('renders search bar with a11y label', async () => {
    const { getByLabelText } = renderScreen(<PickTemplate />)
    await waitFor(() => {
      expect(getByLabelText('Search templates')).toBeTruthy()
    })
  })

  it('shows all templates in the list', async () => {
    const { getByText } = renderScreen(<PickTemplate />)
    await waitFor(() => {
      for (const tpl of mockTemplates) {
        expect(getByText(tpl.name)).toBeTruthy()
      }
    })
  })

  it('templates are pressable with a11y labels', async () => {
    const { getByLabelText } = renderScreen(<PickTemplate />)
    await waitFor(() => {
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

  it('shows exercise names for the template', async () => {
    const { getByText } = renderScreen(<EditTemplate />)
    await waitFor(() => {
      expect(getByText('Voltra Exercise 039')).toBeTruthy()
    })
  })

  it('shows target sets and reps for exercises', async () => {
    const { getAllByText } = renderScreen(<EditTemplate />)
    const text = `${fullBody.exercises[0].target_sets} × ${fullBody.exercises[0].target_reps} · ${fullBody.exercises[0].rest_seconds}s rest`
    await waitFor(() => {
      expect(getAllByText(text).length).toBeGreaterThan(0)
    })
  })

  it('shows exercise count in header', async () => {
    const { getByText } = renderScreen(<EditTemplate />)
    await waitFor(() => {
      expect(getByText(`Exercises (${fullBody.exercises.length})`)).toBeTruthy()
    })
  })

  it('shows STARTER chip for starter templates', async () => {
    const { getByLabelText } = renderScreen(<EditTemplate />)
    await waitFor(() => {
      expect(getByLabelText('Starter template, read-only. Duplicate to edit.')).toBeTruthy()
    })
  })
})

// --- Template Detail — Founder's Favourite (10 exercises) ---

describe('Template Detail — Founders Favourite (10 exercises)', () => {
  const founders = STARTER_TEMPLATES.find(t => t.name === "Founder's Favourite")!

  beforeEach(() => {
    mockParams = { id: founders.id }
    mockGetTemplateById.mockResolvedValue({
      id: founders.id,
      name: founders.name,
      is_starter: true,
      exercises: founders.exercises.map((e, i) => ({
        id: e.id,
        template_id: founders.id,
        exercise_id: e.exercise_id,
        target_sets: e.target_sets,
        target_reps: e.target_reps,
        rest_seconds: e.rest_seconds,
        sort_order: i,
        link_id: null,
        link_label: null,
        exercise: {
          id: e.exercise_id,
          name: `Cable ${e.exercise_id.replace('voltra-', '#')}`,
          muscle_group: 'test',
          equipment: 'cable',
          deleted_at: null,
        },
      })),
    })
  })

  it('renders all 10 exercises without crash', async () => {
    const { getByText } = renderScreen(<EditTemplate />)
    await waitFor(() => {
      expect(getByText(`Exercises (${founders.exercises.length})`)).toBeTruthy()
    })
    // Verify first and last exercise render
    expect(getByText('Cable #017')).toBeTruthy()
    expect(getByText('Cable #036')).toBeTruthy()
  })

  it('shows correct sets and reps for advanced template', async () => {
    const { getAllByText } = renderScreen(<EditTemplate />)
    const text = `${founders.exercises[0].target_sets} × ${founders.exercises[0].target_reps} · ${founders.exercises[0].rest_seconds}s rest`
    await waitFor(() => {
      expect(getAllByText(text).length).toBeGreaterThan(0)
    })
  })
})

// --- Starter template data verification ---

describe('Starter Template Data Integrity', () => {
  it('has 7 starter templates', () => {
    expect(STARTER_TEMPLATES).toHaveLength(7)
  })

  it('has exactly one recommended template (Full Body)', () => {
    const recommended = STARTER_TEMPLATES.filter(t => t.recommended)
    expect(recommended).toHaveLength(1)
    expect(recommended[0].name).toBe('Full Body')
  })

  it('PPL starter program references valid template IDs', () => {
    const templateIds = STARTER_TEMPLATES.map(t => t.id)
    for (const day of STARTER_PROGRAM.days) {
      expect(templateIds).toContain(day.template_id)
    }
  })

  it('PPL has 3 days: Push, Pull, Legs & Core', () => {
    expect(STARTER_PROGRAM.days).toHaveLength(3)
    expect(STARTER_PROGRAM.days[0].label).toBe('Push')
    expect(STARTER_PROGRAM.days[1].label).toBe('Pull')
    expect(STARTER_PROGRAM.days[2].label).toBe('Legs & Core')
  })

  it('all templates have at least 1 exercise', () => {
    for (const tpl of STARTER_TEMPLATES) {
      expect(tpl.exercises.length).toBeGreaterThan(0)
    }
  })

  it('Founders Favourite has 10 exercises', () => {
    const ff = STARTER_TEMPLATES.find(t => t.name === "Founder's Favourite")
    expect(ff).toBeDefined()
    expect(ff!.exercises).toHaveLength(10)
  })
})
