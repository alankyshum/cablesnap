import React from 'react'
import { waitFor, fireEvent } from '@testing-library/react-native'
import { renderScreen } from '../../helpers/render'

const mockPush = jest.fn()

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useGlobalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require('react')
    useEffect(() => {
      const cleanup = cb()
      if (typeof cleanup === 'function') return cleanup
    }, [cb])
  },
  Link: 'Link',
  Stack: { Screen: 'Screen' },
}))

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}))

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')

const mockGetCableExercises = jest.fn()
const mockGetAvailableAttachments = jest.fn()

jest.mock('../../../lib/db/cable-finder', () => ({
  getCableExercises: (...args: unknown[]) => mockGetCableExercises(...args),
  getAvailableAttachments: (...args: unknown[]) => mockGetAvailableAttachments(...args),
}))

import CableSetupFinder from '../../../app/tools/cable-finder'

const makeCableExercise = (overrides: Record<string, unknown> = {}) => ({
  id: 'ex-1',
  name: 'Cable Curl',
  category: 'arms',
  primary_muscles: ['biceps'],
  secondary_muscles: ['forearms'],
  equipment: 'cable',
  instructions: '',
  difficulty: 'beginner',
  is_custom: false,
  mount_position: 'low',
  attachment: 'handle',
  ...overrides,
})

describe('CableSetupFinder screen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetAvailableAttachments.mockResolvedValue(['handle', 'rope', 'bar'])
    mockGetCableExercises.mockResolvedValue([
      makeCableExercise({ id: 'ex-1', name: 'Cable Curl', primary_muscles: ['biceps'] }),
      makeCableExercise({ id: 'ex-2', name: 'Cable Fly', primary_muscles: ['chest'], mount_position: 'mid' }),
    ])
  })

  it('renders filter chips, exercise results grouped by muscle, and navigates on tap', async () => {
    const { getByLabelText, getByText } = renderScreen(<CableSetupFinder />)

    // Mount position chips
    await waitFor(() => {
      expect(getByLabelText('Mount position: High')).toBeTruthy()
      expect(getByLabelText('Mount position: Mid')).toBeTruthy()
      expect(getByLabelText('Mount position: Low')).toBeTruthy()
      expect(getByLabelText('Mount position: Floor')).toBeTruthy()
    })

    // Dynamic attachment chips
    expect(getByLabelText('Attachment: Handle')).toBeTruthy()
    expect(getByLabelText('Attachment: Rope')).toBeTruthy()
    expect(getByLabelText('Attachment: Bar')).toBeTruthy()

    // Grouped results
    expect(getByText('Cable Curl')).toBeTruthy()
    expect(getByText('Cable Fly')).toBeTruthy()
    expect(getByText('Biceps')).toBeTruthy()
    expect(getByText('Chest')).toBeTruthy()

    // Navigation on tap
    fireEvent.press(getByText('Cable Curl'))
    expect(mockPush).toHaveBeenCalledWith('/exercise/ex-1')
  })

  it('toggles mount filter and re-queries, deselect resets to null', async () => {
    const { getByLabelText } = renderScreen(<CableSetupFinder />)
    await waitFor(() => expect(getByLabelText('Mount position: Low')).toBeTruthy())

    // Select
    fireEvent.press(getByLabelText('Mount position: Low'))
    await waitFor(() => {
      const call = mockGetCableExercises.mock.calls[mockGetCableExercises.mock.calls.length - 1]
      expect(call[0].mountPosition).toBe('low')
    })

    // Deselect
    fireEvent.press(getByLabelText('Mount position: Low'))
    await waitFor(() => {
      const call = mockGetCableExercises.mock.calls[mockGetCableExercises.mock.calls.length - 1]
      expect(call[0].mountPosition).toBeNull()
    })
  })

  it('shows empty state when no exercises match and hides attachment chips when none available', async () => {
    mockGetCableExercises.mockResolvedValue([])
    mockGetAvailableAttachments.mockResolvedValue([])

    const { getByText, queryByLabelText } = renderScreen(<CableSetupFinder />)

    await waitFor(() => {
      expect(getByText(/No exercises match this setup/)).toBeTruthy()
    })
    expect(queryByLabelText('Attachment: Handle')).toBeNull()
  })
})
