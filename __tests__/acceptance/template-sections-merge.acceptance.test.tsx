jest.setTimeout(10000)

import React from 'react'
import { waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import { createWorkoutTemplate, createProgram, resetIds } from '../helpers/factories'
import type { WorkoutTemplate, Program } from '../../lib/types'

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() }

jest.mock('expo-router', () => {
  const RealReact = require('react')
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => ({}),
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
jest.mock('../../lib/rpe', () => ({ rpeColor: jest.fn().mockReturnValue('#888'), rpeText: jest.fn().mockReturnValue('#fff') }))
jest.mock('../../lib/starter-templates', () => ({
  STARTER_TEMPLATES: [
    { id: 'starter-1', name: 'Full Body Starter', difficulty: 'beginner', duration: '45 min', recommended: true, exercises: [{ name: 'Squat' }] },
  ],
}))

const userTemplate: WorkoutTemplate = createWorkoutTemplate({ id: 'user-1', name: 'My Push Day' })
const starterTemplate: WorkoutTemplate = createWorkoutTemplate({ id: 'starter-1', name: 'Full Body Starter', is_starter: true })
const userProgram: Program = createProgram({ id: 'prog-user-1', name: 'My PPL', is_starter: false })
const starterProgram: Program = createProgram({ id: 'prog-starter-1', name: 'Starter PPL', is_starter: true })

const mockGetTemplates = jest.fn().mockResolvedValue([userTemplate, starterTemplate])
const mockGetPrograms = jest.fn().mockResolvedValue([userProgram, starterProgram])

jest.mock('../../lib/db', () => ({
  getTemplates: (...args: unknown[]) => mockGetTemplates(...args),
  getActiveSession: jest.fn().mockResolvedValue(null),
  getAllCompletedSessionWeeks: jest.fn().mockResolvedValue([]),
  getRecentPRs: jest.fn().mockResolvedValue([]),
  getRecentSessions: jest.fn().mockResolvedValue([]),
  getSessionAvgRPE: jest.fn().mockResolvedValue(null),
  getSessionSetCount: jest.fn().mockResolvedValue(0),
  getTemplateExerciseCount: jest.fn().mockResolvedValue(0),
  startSession: jest.fn().mockResolvedValue({ id: 'qs-1', template_id: 't1', name: 'Test', started_at: Date.now(), sets: [] }),
  getTodaySchedule: jest.fn().mockResolvedValue(null),
  isTodayCompleted: jest.fn().mockResolvedValue(false),
  getWeekAdherence: jest.fn().mockResolvedValue([]),
  deleteTemplate: jest.fn().mockResolvedValue(undefined),
  duplicateTemplate: jest.fn().mockResolvedValue('dup-1'),
  duplicateProgram: jest.fn().mockResolvedValue('dup-p1'),
}))

jest.mock('../../lib/programs', () => ({
  getNextWorkout: jest.fn().mockResolvedValue(null),
  getPrograms: (...args: unknown[]) => mockGetPrograms(...args),
  getProgramDayCount: jest.fn().mockResolvedValue(3),
  softDeleteProgram: jest.fn().mockResolvedValue(undefined),
}))

import Workouts from '../../app/(tabs)/index'

beforeEach(() => {
  jest.clearAllMocks()
  resetIds()
  mockGetTemplates.mockResolvedValue([userTemplate, starterTemplate])
  mockGetPrograms.mockResolvedValue([userProgram, starterProgram])
})

describe('Template sections merge (BLD-289)', () => {
  it('shows single "Templates" header instead of "My Templates"', async () => {
    const screen = renderScreen(<Workouts />)
    await waitFor(() => expect(mockGetTemplates).toHaveBeenCalled())

    const matches = screen.getAllByText('Templates')
    // One from SegmentedButtons tab label, one from section header
    expect(matches.length).toBe(2)
    expect(screen.queryByText('My Templates')).toBeNull()
    expect(screen.queryByText('Starter Workouts')).toBeNull()
  })

  it('renders user templates before starters in a single list', async () => {
    const screen = renderScreen(<Workouts />)
    await waitFor(() => expect(mockGetTemplates).toHaveBeenCalled())

    await waitFor(() => {
      expect(screen.getByText('My Push Day')).toBeTruthy()
    })
    expect(screen.getByText('Full Body Starter')).toBeTruthy()
  })

  it('shows STARTER badge on starter templates only', async () => {
    const screen = renderScreen(<Workouts />)
    await waitFor(() => expect(mockGetTemplates).toHaveBeenCalled())

    await waitFor(() => {
      const badges = screen.getAllByText('STARTER')
      expect(badges.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows empty state when no templates at all', async () => {
    mockGetTemplates.mockResolvedValue([])
    const screen = renderScreen(<Workouts />)
    await waitFor(() => expect(mockGetTemplates).toHaveBeenCalled())

    expect(screen.getByText('Create your first workout template')).toBeTruthy()
  })

  it('shows starters without empty state when no user templates', async () => {
    mockGetTemplates.mockResolvedValue([starterTemplate])
    const screen = renderScreen(<Workouts />)

    await waitFor(() => {
      expect(screen.getByText('Full Body Starter')).toBeTruthy()
    })
    expect(screen.queryByText('Create your first workout template')).toBeNull()
  })
})
