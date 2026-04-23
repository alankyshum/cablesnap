import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'

jest.mock('expo-router', () => {
  const push = jest.fn()
  return {
    useRouter: () => ({ push }),
    __pushMock: push,
  }
})

jest.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    primary: '#6200ee',
    onPrimary: '#fff',
    onSurface: '#000',
    onSurfaceVariant: '#666',
    outlineVariant: '#ccc',
    surface: '#fff',
    surfaceVariant: '#eee',
    background: '#fff',
    error: '#f00',
    onError: '#fff',
  }),
}))

jest.mock('lucide-react-native', () => ({
  TrendingUp: 'TrendingUp',
}))

import WorkoutEmptyState from '@/components/progress/WorkoutEmptyState'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __pushMock: pushMock } = require('expo-router') as { __pushMock: jest.Mock }

describe('WorkoutEmptyState', () => {
  beforeEach(() => {
    pushMock.mockClear()
  })

  it('renders the headline, description, and CTA button', () => {
    const { getByText, getByLabelText } = render(<WorkoutEmptyState />)
    expect(getByText('Track your progress')).toBeTruthy()
    expect(
      getByText(/Complete your first workout to see sessions, PRs, and weekly trends here\./i),
    ).toBeTruthy()
    expect(getByLabelText('Start your first workout')).toBeTruthy()
  })

  it('has an accessibility label on the container for screen readers', () => {
    const { getByLabelText } = render(<WorkoutEmptyState />)
    expect(getByLabelText('No workouts logged yet')).toBeTruthy()
  })

  it('navigates home when the CTA is tapped with no onStart handler', () => {
    const { getByLabelText } = render(<WorkoutEmptyState />)
    fireEvent.press(getByLabelText('Start your first workout'))
    expect(pushMock).toHaveBeenCalledWith('/')
  })

  it('invokes onStart and does not navigate when handler is provided', () => {
    const onStart = jest.fn()
    const { getByLabelText } = render(<WorkoutEmptyState onStart={onStart} />)
    fireEvent.press(getByLabelText('Start your first workout'))
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(pushMock).not.toHaveBeenCalled()
  })
})
