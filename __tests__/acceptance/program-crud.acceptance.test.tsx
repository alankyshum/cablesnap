import React from 'react'
import { Alert } from 'react-native'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import { createProgram, createProgramDay, resetIds } from '../helpers/factories'
import type { ProgramDay } from '../../lib/types'

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
      }, [cb])
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

const mockCreateProgram = jest.fn()
const mockGetProgramById = jest.fn().mockResolvedValue(null)
const mockGetProgramDays = jest.fn().mockResolvedValue([])
const mockUpdateProgram = jest.fn().mockResolvedValue(undefined)
const mockRemoveProgramDay = jest.fn().mockResolvedValue(undefined)
const mockReorderProgramDays = jest.fn().mockResolvedValue(undefined)

jest.mock('../../lib/programs', () => ({
  createProgram: (...args: unknown[]) => mockCreateProgram(...args),
  getProgramById: (...args: unknown[]) => mockGetProgramById(...args),
  getProgramDays: (...args: unknown[]) => mockGetProgramDays(...args),
  updateProgram: (...args: unknown[]) => mockUpdateProgram(...args),
  removeProgramDay: (...args: unknown[]) => mockRemoveProgramDay(...args),
  reorderProgramDays: (...args: unknown[]) => mockReorderProgramDays(...args),
}))

import CreateProgramScreen from '../../app/program/create'

describe('Program CRUD Acceptance', () => {
  const program = createProgram({ id: 'p-1', name: 'PPL Split', description: '3-day split' })

  beforeEach(() => {
    jest.clearAllMocks()
    resetIds()
    Object.keys(mockParams).forEach((k) => delete mockParams[k])
    mockCreateProgram.mockResolvedValue(program)
    mockGetProgramById.mockResolvedValue(null)
    mockGetProgramDays.mockResolvedValue([])
  })

  it('creates a new program with name and description', async () => {
    const screen = renderScreen(<CreateProgramScreen />)

    fireEvent.changeText(screen.getByLabelText('Program name'), 'PPL Split')
    fireEvent.changeText(screen.getByLabelText('Program description'), '3-day split')
    fireEvent.press(screen.getByLabelText('Create program'))

    await waitFor(() => {
      expect(mockCreateProgram).toHaveBeenCalledWith('PPL Split', '3-day split')
    })
  })

  it('shows validation alert when name is empty', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert')

    const screen = renderScreen(<CreateProgramScreen />)

    fireEvent.press(screen.getByLabelText('Create program'))

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Validation', 'Program name is required.')
    })
    expect(mockCreateProgram).not.toHaveBeenCalled()
  })

  it('shows days and Add Day button after program created', async () => {
    const days: ProgramDay[] = [
      createProgramDay({ id: 'd-1', program_id: 'p-1', label: 'Push', position: 0 }),
      createProgramDay({ id: 'd-2', program_id: 'p-1', label: 'Pull', position: 1 }),
    ]
    mockCreateProgram.mockResolvedValue(program)
    mockGetProgramDays.mockResolvedValue(days)

    const screen = renderScreen(<CreateProgramScreen />)

    fireEvent.changeText(screen.getByLabelText('Program name'), 'PPL Split')
    fireEvent.press(screen.getByLabelText('Create program'))

    await waitFor(() => {
      expect(screen.getByLabelText('Add workout day from template')).toBeTruthy()
    })

    await waitFor(() => {
      expect(screen.getByText(/Day 1: Push/)).toBeTruthy()
      expect(screen.getByText(/Day 2: Pull/)).toBeTruthy()
    })
  })

  it('removes a day from the program', async () => {
    const days: ProgramDay[] = [
      createProgramDay({ id: 'd-1', program_id: 'p-1', label: 'Push', position: 0 }),
      createProgramDay({ id: 'd-2', program_id: 'p-1', label: 'Pull', position: 1 }),
    ]
    mockCreateProgram.mockResolvedValue(program)
    mockGetProgramDays.mockResolvedValue(days)

    const screen = renderScreen(<CreateProgramScreen />)

    fireEvent.changeText(screen.getByLabelText('Program name'), 'PPL Split')
    fireEvent.press(screen.getByLabelText('Create program'))

    await waitFor(() => {
      expect(screen.getByLabelText('Remove Push')).toBeTruthy()
    })

    mockGetProgramDays.mockResolvedValue([days[1]])
    fireEvent.press(screen.getByLabelText('Remove Push'))

    await waitFor(() => {
      expect(mockRemoveProgramDay).toHaveBeenCalledWith('d-1')
    })
  })

  it('Done button validates at least 1 day', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert')
    mockCreateProgram.mockResolvedValue(program)
    mockGetProgramDays.mockResolvedValue([])

    const screen = renderScreen(<CreateProgramScreen />)

    fireEvent.changeText(screen.getByLabelText('Program name'), 'PPL Split')
    fireEvent.press(screen.getByLabelText('Create program'))

    await waitFor(() => {
      expect(screen.getByLabelText('Done editing program')).toBeTruthy()
    })

    fireEvent.press(screen.getByLabelText('Done editing program'))

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Validation', 'Add at least 1 workout day.')
    })
    expect(mockUpdateProgram).not.toHaveBeenCalled()
  })

  it('Add Day button navigates to pick-template', async () => {
    mockCreateProgram.mockResolvedValue(program)

    const screen = renderScreen(<CreateProgramScreen />)

    fireEvent.changeText(screen.getByLabelText('Program name'), 'PPL Split')
    fireEvent.press(screen.getByLabelText('Create program'))

    await waitFor(() => {
      expect(screen.getByLabelText('Add workout day from template')).toBeTruthy()
    })

    fireEvent.press(screen.getByLabelText('Add workout day from template'))

    expect(mockRouter.push).toHaveBeenCalledWith(`/program/pick-template?programId=${program.id}`)
  })

  it('hydrates existing program from programId param', async () => {
    const existing = createProgram({ id: 'existing-1', name: 'Existing Program', description: 'desc' })
    const days: ProgramDay[] = [
      createProgramDay({ id: 'd-1', program_id: 'existing-1', label: 'Leg Day', position: 0 }),
    ]
    mockGetProgramById.mockResolvedValue(existing)
    mockGetProgramDays.mockResolvedValue(days)
    mockParams.programId = 'existing-1'

    const screen = renderScreen(<CreateProgramScreen />)

    await waitFor(() => {
      expect(mockGetProgramById).toHaveBeenCalledWith('existing-1')
    })

    await waitFor(() => {
      expect(screen.getByText(/Day 1: Leg Day/)).toBeTruthy()
      expect(screen.getByLabelText('Done editing program')).toBeTruthy()
    })
  })

  it('Done calls updateProgram and router.back()', async () => {
    const existing = createProgram({ id: 'existing-1', name: 'Existing Program', description: 'desc' })
    const days: ProgramDay[] = [
      createProgramDay({ id: 'd-1', program_id: 'existing-1', label: 'Leg Day', position: 0 }),
    ]
    mockGetProgramById.mockResolvedValue(existing)
    mockGetProgramDays.mockResolvedValue(days)
    mockParams.programId = 'existing-1'

    const screen = renderScreen(<CreateProgramScreen />)

    await waitFor(() => {
      expect(screen.getByLabelText('Done editing program')).toBeTruthy()
    })

    fireEvent.press(screen.getByLabelText('Done editing program'))

    await waitFor(() => {
      expect(mockUpdateProgram).toHaveBeenCalledWith('existing-1', 'Existing Program', 'desc')
      expect(mockRouter.back).toHaveBeenCalled()
    })
  })
})
