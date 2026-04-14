jest.setTimeout(10000)

import React from 'react'
import { Alert } from 'react-native'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import { createWorkoutTemplate, resetIds } from '../helpers/factories'

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() }

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({}),
  usePathname: () => '/test',
  useFocusEffect: jest.fn(),
  Stack: { Screen: () => null },
  Redirect: () => null,
}))

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')
jest.mock('../../lib/errors', () => ({ logError: jest.fn() }))
jest.mock('../../lib/interactions', () => ({ log: jest.fn() }))
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))

const pushTemplate = createWorkoutTemplate({ id: 'tpl-1', name: 'Push Day' })
const pullTemplate = createWorkoutTemplate({ id: 'tpl-2', name: 'Pull Day' })

const mockGetSchedule = jest.fn().mockResolvedValue([
  { day_of_week: 0, template_id: 'tpl-1', template_name: 'Push Day', exercise_count: 5 },
  { day_of_week: 2, template_id: 'tpl-2', template_name: 'Pull Day', exercise_count: 4 },
])
const mockGetTemplates = jest.fn().mockResolvedValue([pushTemplate, pullTemplate])
const mockSetScheduleDay = jest.fn().mockResolvedValue(undefined)
const mockClearSchedule = jest.fn().mockResolvedValue(undefined)

jest.mock('../../lib/db', () => ({
  getSchedule: (...args: unknown[]) => mockGetSchedule(...args),
  getTemplates: (...args: unknown[]) => mockGetTemplates(...args),
  setScheduleDay: (...args: unknown[]) => mockSetScheduleDay(...args),
  clearSchedule: (...args: unknown[]) => mockClearSchedule(...args),
}))

import Schedule from '../../app/schedule/index'

describe('Weekly Schedule Acceptance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetIds()
    mockGetSchedule.mockResolvedValue([
      { day_of_week: 0, template_id: 'tpl-1', template_name: 'Push Day', exercise_count: 5 },
      { day_of_week: 2, template_id: 'tpl-2', template_name: 'Pull Day', exercise_count: 4 },
    ])
    mockGetTemplates.mockResolvedValue([pushTemplate, pullTemplate])
    mockSetScheduleDay.mockResolvedValue(undefined)
    mockClearSchedule.mockResolvedValue(undefined)
  })

  it('shows assigned templates on correct days', async () => {
    const screen = renderScreen(<Schedule />)

    await waitFor(() => {
      expect(screen.getByLabelText('Mon: Push Day')).toBeTruthy()
      expect(screen.getByLabelText('Wed: Pull Day')).toBeTruthy()
    })
  })

  it('shows rest day for unassigned days', async () => {
    const screen = renderScreen(<Schedule />)

    await waitFor(() => {
      expect(screen.getByLabelText('Tue: Rest day')).toBeTruthy()
      expect(screen.getByLabelText('Thu: Rest day')).toBeTruthy()
      expect(screen.getByLabelText('Fri: Rest day')).toBeTruthy()
      expect(screen.getByLabelText('Sat: Rest day')).toBeTruthy()
      expect(screen.getByLabelText('Sun: Rest day')).toBeTruthy()
    })
  })

  it('clear schedule button triggers confirmation and clears', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert')

    const screen = renderScreen(<Schedule />)

    await waitFor(() => {
      expect(screen.getByLabelText('Clear entire schedule')).toBeTruthy()
    })

    fireEvent.press(screen.getByLabelText('Clear entire schedule'))

    expect(alertSpy).toHaveBeenCalledWith(
      'Clear Schedule',
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Clear', style: 'destructive' }),
      ])
    )

    const destructiveAction = alertSpy.mock.calls[0][2]!.find(
      (btn: any) => btn.style === 'destructive'
    )
    await destructiveAction!.onPress!()

    expect(mockClearSchedule).toHaveBeenCalled()
    alertSpy.mockRestore()
  })

  it('renders all day labels', async () => {
    const screen = renderScreen(<Schedule />)

    await waitFor(() => {
      for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
        expect(screen.getByText(day)).toBeTruthy()
      }
    })
  })

  it('shows empty state when no templates exist', async () => {
    mockGetTemplates.mockResolvedValue([])
    mockGetSchedule.mockResolvedValue([])

    const screen = renderScreen(<Schedule />)

    await waitFor(() => {
      expect(screen.getByText(/create a template first/i)).toBeTruthy()
    })
  })
})
