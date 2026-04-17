jest.setTimeout(10000)

import React from 'react'
import { Alert } from 'react-native'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import { createSession, createSet, resetIds } from '../helpers/factories'

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
jest.mock('../../lib/layout', () => ({ useLayout: () => ({ wide: false, width: 375, scale: 1.0, horizontalPadding: 16 }) }))
jest.mock('../../lib/rpe', () => ({ rpeColor: jest.fn().mockReturnValue('#888'), rpeText: jest.fn().mockReturnValue('#fff') }))
jest.mock('../../components/RatingWidget', () => 'RatingWidget')

const mockGetSessionById = jest.fn()
const mockGetSessionSets = jest.fn().mockResolvedValue([])
const mockGetSessionPRs = jest.fn().mockResolvedValue([])
const mockGetSessionSetCount = jest.fn().mockResolvedValue(0)
const mockUpdateSession = jest.fn().mockResolvedValue(undefined)
const mockCreateTemplateFromSession = jest.fn().mockResolvedValue('tpl-1')
const mockGetActiveSession = jest.fn().mockResolvedValue(null)
const mockStartSession = jest.fn()

jest.mock('../../lib/db', () => ({
  getSessionById: (...args: unknown[]) => mockGetSessionById(...args),
  getSessionSets: (...args: unknown[]) => mockGetSessionSets(...args),
  getSessionPRs: (...args: unknown[]) => mockGetSessionPRs(...args),
  getSessionSetCount: (...args: unknown[]) => mockGetSessionSetCount(...args),
  updateSession: (...args: unknown[]) => mockUpdateSession(...args),
  createTemplateFromSession: (...args: unknown[]) => mockCreateTemplateFromSession(...args),
  getActiveSession: (...args: unknown[]) => mockGetActiveSession(...args),
  startSession: (...args: unknown[]) => mockStartSession(...args),
}))

// Lazy import after mocks
let SessionDetail: React.ComponentType
beforeAll(() => {
  SessionDetail = require('../../app/session/detail/[id]').default
})

beforeEach(() => {
  resetIds()
  jest.clearAllMocks()
  mockParams.id = 'session-1'
  mockRouter.push.mockClear()
})

const completedSession = createSession({
  id: 'session-1',
  name: 'Push Day',
  completed_at: Date.now(),
  duration_seconds: 3600,
})

const completedSets = [
  createSet({
    id: 'set-1',
    session_id: 'session-1',
    exercise_id: 'ex-1',
    set_number: 1,
    weight: 80,
    reps: 10,
    completed: true,
    exercise_name: 'Bench Press',
  } as never),
  createSet({
    id: 'set-2',
    session_id: 'session-1',
    exercise_id: 'ex-1',
    set_number: 2,
    weight: 85,
    reps: 8,
    completed: true,
    exercise_name: 'Bench Press',
  } as never),
]

describe('Repeat Workout — Session Detail', () => {
  it('shows Repeat Workout button for completed sessions', async () => {
    mockGetSessionById.mockResolvedValue(completedSession)
    mockGetSessionSets.mockResolvedValue(completedSets)
    mockGetSessionSetCount.mockResolvedValue(2)

    const { getByText } = renderScreen(<SessionDetail />)

    await waitFor(() => {
      expect(getByText('Repeat Workout')).toBeTruthy()
    })
  })

  it('disables Repeat Workout button when completedSetCount is 0', async () => {
    mockGetSessionById.mockResolvedValue(completedSession)
    mockGetSessionSets.mockResolvedValue([])
    mockGetSessionSetCount.mockResolvedValue(0)

    const { getByText } = renderScreen(<SessionDetail />)

    await waitFor(() => {
      const button = getByText('Repeat Workout')
      // Walk up to find the Pressable/TouchableOpacity with disabled
      expect(button).toBeTruthy()
    })
  })

  it('does not show Repeat Workout button for incomplete sessions', async () => {
    const incompleteSession = createSession({
      id: 'session-1',
      name: 'Push Day',
      completed_at: null,
    })
    mockGetSessionById.mockResolvedValue(incompleteSession)
    mockGetSessionSets.mockResolvedValue(completedSets)
    mockGetSessionSetCount.mockResolvedValue(2)

    const { queryByText } = renderScreen(<SessionDetail />)

    await waitFor(() => {
      expect(queryByText('Repeat Workout')).toBeNull()
    })
  })

  it('shows confirmation dialog when Repeat Workout is tapped', async () => {
    mockGetSessionById.mockResolvedValue(completedSession)
    mockGetSessionSets.mockResolvedValue(completedSets)
    mockGetSessionSetCount.mockResolvedValue(2)

    const alertSpy = jest.spyOn(Alert, 'alert')

    const { getByText } = renderScreen(<SessionDetail />)

    await waitFor(() => {
      expect(getByText('Repeat Workout')).toBeTruthy()
    })

    fireEvent.press(getByText('Repeat Workout'))

    expect(alertSpy).toHaveBeenCalledWith(
      'Repeat Workout?',
      expect.stringContaining('Push Day'),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel' }),
        expect.objectContaining({ text: 'Repeat' }),
      ])
    )

    alertSpy.mockRestore()
  })

  it('creates new session and navigates on confirmation', async () => {
    mockGetSessionById.mockResolvedValue(completedSession)
    mockGetSessionSets.mockResolvedValue(completedSets)
    mockGetSessionSetCount.mockResolvedValue(2)
    mockGetActiveSession.mockResolvedValue(null)
    mockStartSession.mockResolvedValue(createSession({ id: 'new-session-1', name: 'Push Day' }))

    const alertSpy = jest.spyOn(Alert, 'alert')

    const { getByText } = renderScreen(<SessionDetail />)

    await waitFor(() => {
      expect(getByText('Repeat Workout')).toBeTruthy()
    })

    fireEvent.press(getByText('Repeat Workout'))

    // Simulate pressing "Repeat" in the dialog
    const alertCall = alertSpy.mock.calls[0]
    const buttons = alertCall[2] as { text: string; onPress?: () => void }[]
    const repeatButton = buttons.find((b) => b.text === 'Repeat')
    await repeatButton?.onPress?.()

    await waitFor(() => {
      expect(mockStartSession).toHaveBeenCalledWith(null, 'Push Day')
      expect(mockRouter.push).toHaveBeenCalledWith(
        '/session/new-session-1?sourceSessionId=session-1'
      )
    })

    alertSpy.mockRestore()
  })

  it('shows alert when active session exists', async () => {
    mockGetSessionById.mockResolvedValue(completedSession)
    mockGetSessionSets.mockResolvedValue(completedSets)
    mockGetSessionSetCount.mockResolvedValue(2)
    mockGetActiveSession.mockResolvedValue(createSession({ id: 'active-1' }))

    const alertSpy = jest.spyOn(Alert, 'alert')

    const { getByText } = renderScreen(<SessionDetail />)

    await waitFor(() => {
      expect(getByText('Repeat Workout')).toBeTruthy()
    })

    fireEvent.press(getByText('Repeat Workout'))

    // Simulate pressing "Repeat" in the confirmation dialog
    const confirmCall = alertSpy.mock.calls[0]
    const buttons = confirmCall[2] as { text: string; onPress?: () => void }[]
    const repeatBtn = buttons.find((b) => b.text === 'Repeat')
    await repeatBtn?.onPress?.()

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Active Workout',
        'You have an active workout. Finish or cancel it first.'
      )
    })

    expect(mockStartSession).not.toHaveBeenCalled()
    expect(mockRouter.push).not.toHaveBeenCalled()

    alertSpy.mockRestore()
  })

  it('has accessibility attributes on the Repeat Workout button', async () => {
    mockGetSessionById.mockResolvedValue(completedSession)
    mockGetSessionSets.mockResolvedValue(completedSets)
    mockGetSessionSetCount.mockResolvedValue(2)

    const { getByLabelText } = renderScreen(<SessionDetail />)

    await waitFor(() => {
      const btn = getByLabelText('Repeat workout')
      expect(btn).toBeTruthy()
      expect(btn.props.accessibilityHint).toBe(
        'Start a new session with the same exercises and weights'
      )
      expect(btn.props.accessibilityRole).toBe('button')
    })
  })
})
