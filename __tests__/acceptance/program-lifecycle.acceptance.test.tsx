jest.setTimeout(10000)

import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import { createProgram, createProgramDay, createSession, resetIds } from '../helpers/factories'


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
jest.mock('../../lib/layout', () => ({ useLayout: () => ({ wide: false, width: 375, scale: 1.0 }) }))
jest.mock('../../lib/errors', () => ({ logError: jest.fn(), generateReport: jest.fn().mockResolvedValue('{}'), getRecentErrors: jest.fn().mockResolvedValue([]), generateGitHubURL: jest.fn().mockReturnValue('https://github.com') }))
jest.mock('../../lib/interactions', () => ({ log: jest.fn(), recent: jest.fn().mockResolvedValue([]) }))
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))
jest.mock('../../lib/rpe', () => ({ rpeColor: jest.fn().mockReturnValue('#888'), rpeText: jest.fn().mockReturnValue('#fff') }))
jest.mock('../../lib/starter-templates', () => ({ STARTER_TEMPLATES: [] }))
jest.mock('../../lib/db/settings', () => ({
  getAppSetting: jest.fn().mockResolvedValue(null),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('react-native-body-highlighter', () => {
  const { View } = require('react-native')
  return { __esModule: true, default: () => <View /> }
})

const mockGetTemplates = jest.fn().mockResolvedValue([])
const mockGetActiveSession = jest.fn().mockResolvedValue(null)
const mockGetAllCompletedSessionWeeks = jest.fn().mockResolvedValue([])
const mockGetRecentPRs = jest.fn().mockResolvedValue([])
const mockGetRecentSessions = jest.fn().mockResolvedValue([])
const mockGetSessionAvgRPE = jest.fn().mockResolvedValue(null)
const mockGetSessionSetCount = jest.fn().mockResolvedValue(0)
const mockGetTemplateExerciseCount = jest.fn().mockResolvedValue(0)
const mockStartSession = jest.fn().mockResolvedValue(createSession({ id: 'qs-1' }))
const mockGetTodaySchedule = jest.fn().mockResolvedValue(null)
const mockIsTodayCompleted = jest.fn().mockResolvedValue(false)
const mockGetWeekAdherence = jest.fn().mockResolvedValue([])
const mockDeleteTemplate = jest.fn().mockResolvedValue(undefined)
const mockDuplicateTemplate = jest.fn().mockResolvedValue('dup-1')
const mockDuplicateProgram = jest.fn().mockResolvedValue('dup-p1')

jest.mock('../../lib/db', () => ({
  getTemplates: (...args: unknown[]) => mockGetTemplates(...args),
  getActiveSession: (...args: unknown[]) => mockGetActiveSession(...args),
  getAllCompletedSessionWeeks: (...args: unknown[]) => mockGetAllCompletedSessionWeeks(...args),
  getRecentPRs: (...args: unknown[]) => mockGetRecentPRs(...args),
  getRecentSessions: (...args: unknown[]) => mockGetRecentSessions(...args),
  getSessionAvgRPE: (...args: unknown[]) => mockGetSessionAvgRPE(...args),
  getSessionAvgRPEs: jest.fn().mockResolvedValue({}),
  getSessionSetCount: (...args: unknown[]) => mockGetSessionSetCount(...args),
  getSessionSetCounts: jest.fn().mockResolvedValue({}),
  getTemplateExerciseCount: (...args: unknown[]) => mockGetTemplateExerciseCount(...args),
  getTemplateExerciseCounts: jest.fn().mockResolvedValue({}),
  startSession: (...args: unknown[]) => mockStartSession(...args),
  getTodaySchedule: (...args: unknown[]) => mockGetTodaySchedule(...args),
  isTodayCompleted: (...args: unknown[]) => mockIsTodayCompleted(...args),
  getWeekAdherence: (...args: unknown[]) => mockGetWeekAdherence(...args),
  getMuscleRecoveryStatus: jest.fn().mockResolvedValue([]),
  deleteTemplate: (...args: unknown[]) => mockDeleteTemplate(...args),
  duplicateTemplate: (...args: unknown[]) => mockDuplicateTemplate(...args),
  duplicateProgram: (...args: unknown[]) => mockDuplicateProgram(...args),
}))

const mockGetNextWorkout = jest.fn().mockResolvedValue(null)
const mockGetProgramsFromLib = jest.fn().mockResolvedValue([])
const mockGetProgramDayCountFromLib = jest.fn().mockResolvedValue(0)
const mockGetProgramDayCountsFromLib = jest.fn().mockResolvedValue({})
const mockSoftDeleteProgram = jest.fn().mockResolvedValue(undefined)

jest.mock('../../lib/programs', () => ({
  getNextWorkout: (...args: unknown[]) => mockGetNextWorkout(...args),
  getPrograms: (...args: unknown[]) => mockGetProgramsFromLib(...args),
  getProgramDayCount: (...args: unknown[]) => mockGetProgramDayCountFromLib(...args),
  getProgramDayCounts: (...args: unknown[]) => mockGetProgramDayCountsFromLib(...args),
  softDeleteProgram: (...args: unknown[]) => mockSoftDeleteProgram(...args),
}))

import Workouts from '../../app/(tabs)/index'

describe('Program Lifecycle Acceptance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetIds()
    Object.keys(mockParams).forEach((k) => delete mockParams[k])
    mockGetTemplates.mockResolvedValue([])
    mockGetProgramsFromLib.mockResolvedValue([])
    mockGetProgramDayCountFromLib.mockResolvedValue(0)
    mockGetProgramDayCountsFromLib.mockResolvedValue({})
    mockGetActiveSession.mockResolvedValue(null)
    mockGetAllCompletedSessionWeeks.mockResolvedValue([])
    mockGetRecentPRs.mockResolvedValue([])
    mockGetRecentSessions.mockResolvedValue([])
    mockGetNextWorkout.mockResolvedValue(null)
    mockGetTodaySchedule.mockResolvedValue(null)
    mockIsTodayCompleted.mockResolvedValue(false)
    mockGetWeekAdherence.mockResolvedValue([])
    mockStartSession.mockResolvedValue(createSession({ id: 'qs-1' }))
  })

  it('shows Programs section after switching segment', async () => {
    const screen = renderScreen(<Workouts />)
    await waitFor(() => expect(mockGetTemplates).toHaveBeenCalled())

    fireEvent.press(screen.getByLabelText('Programs tab'))

    await waitFor(() => {
      const matches = screen.getAllByText('Programs')
      expect(matches.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('navigates to create program on button press', async () => {
    const screen = renderScreen(<Workouts />)
    await waitFor(() => expect(mockGetTemplates).toHaveBeenCalled())

    fireEvent.press(screen.getByLabelText('Programs tab'))

    await waitFor(() => {
      expect(screen.getByLabelText('Create new program')).toBeTruthy()
    })

    fireEvent.press(screen.getByLabelText('Create new program'))
    expect(mockRouter.push).toHaveBeenCalledWith('/program/create')
  })

  it('shows program cards with name and day count', async () => {
    mockGetProgramsFromLib.mockResolvedValue([createProgram({ id: 'p1', name: 'PPL Split' })])
    mockGetProgramDayCountFromLib.mockResolvedValue(3)
    mockGetProgramDayCountsFromLib.mockResolvedValue({ 'p1': 3 })

    const screen = renderScreen(<Workouts />)
    await waitFor(() => expect(mockGetProgramsFromLib).toHaveBeenCalled())

    fireEvent.press(screen.getByLabelText('Programs tab'))

    await waitFor(() => {
      expect(screen.getByText('PPL Split')).toBeTruthy()
      expect(screen.getByText(/3 days/)).toBeTruthy()
    })
  })

  it('shows active program indicator', async () => {
    mockGetProgramsFromLib.mockResolvedValue([createProgram({ id: 'p1', name: 'PPL', is_active: true })])

    const screen = renderScreen(<Workouts />)
    await waitFor(() => expect(mockGetProgramsFromLib).toHaveBeenCalled())

    fireEvent.press(screen.getByLabelText('Programs tab'))

    await waitFor(() => {
      expect(screen.getByText(/ACTIVE/)).toBeTruthy()
    })
  })

  it('shows next workout banner', async () => {
    mockGetNextWorkout.mockResolvedValue({
      program: createProgram({ name: 'My PPL' }),
      day: createProgramDay({ label: 'Push Day', template_id: 't1', template_name: 'Push' }),
    })
    mockGetWeekAdherence.mockResolvedValue([])

    const screen = renderScreen(<Workouts />)

    await waitFor(() => {
      expect(screen.getByText(/Next:/)).toBeTruthy()
      expect(screen.getByText(/Push Day/)).toBeTruthy()
    })
  })

  it('quick start creates session and navigates', async () => {
    const session = createSession({ id: 'qs-1' })
    mockStartSession.mockResolvedValue(session)

    const screen = renderScreen(<Workouts />)
    await waitFor(() => expect(mockGetTemplates).toHaveBeenCalled())

    expect(screen.getByLabelText('Quick start workout')).toBeTruthy()

    fireEvent.press(screen.getByLabelText('Quick start workout'))

    await waitFor(() => {
      expect(mockStartSession).toHaveBeenCalledWith(null, 'Quick Workout')
      expect(mockRouter.push).toHaveBeenCalledWith('/session/qs-1')
    })
  })
})
