import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

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

  // Regression guard for BLD-2581: the audit flagged the primary CTA as a
  // "solid coral pill with no visible text label". The a11y-label assertion
  // above passes even when the *visible* label is blank (the accessibility
  // label "Start your first workout" differs from the visible label
  // "Start a workout"), so it could not catch a genuine blanking of the
  // on-pill text. Assert the visible label explicitly.
  it('renders the visible "Start a workout" text on the CTA (BLD-2581)', () => {
    const { getByText } = render(<WorkoutEmptyState />)
    expect(getByText('Start a workout')).toBeTruthy()
  })

  it('has an accessibility label on the container for screen readers', () => {
    const { getByLabelText } = render(<WorkoutEmptyState />)
    expect(getByLabelText('No workouts logged yet')).toBeTruthy()
  })

  it('renders the description with high-contrast styles (BLD-3657)', () => {
    const { getByText } = render(<WorkoutEmptyState />)
    const descriptionText = getByText(/Complete your first workout to see sessions, PRs, and weekly trends here\./i)
    const flattenedStyle = StyleSheet.flatten(descriptionText.props.style)
    expect(flattenedStyle.color).toBe('#000')
    expect(flattenedStyle.opacity).toBe(0.8)
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

  // CVD legibility (BLD-2729): the "Start a workout" CTA uses the `default`
  // button variant whose background is the `primary` color.  Under protanopia
  // and deuteranopia that color shifts to yellow-olive, removing the primary-
  // action hue signal.  A supplemental border in `onSurface` color at ~35%
  // opacity provides a non-hue-dependent affordance cue.
  // This test guards against the border being accidentally stripped.
  it('CTA button carries a non-hue-dependent border style for CVD legibility (BLD-2729)', () => {
    const { getByTestId } = render(<WorkoutEmptyState />)
    const ctaNode = getByTestId('progress-empty-cta')

    // Walk up to find the Pressable/Animated.View that holds the inline style.
    // The testID is on the Pressable's outer element; style is on its children.
    // We check the Pressable itself (which receives the style array).
    const hasBorder = (style: unknown): boolean => {
      if (!style) return false
      const styles = Array.isArray(style) ? style : [style]
      for (const s of styles) {
        if (s && typeof s === 'object') {
          if ('borderWidth' in s && (s as Record<string, unknown>).borderWidth) return true
        }
      }
      return false
    }

    // The Pressable at ctaNode.parent level carries our style array with borderWidth.
    const pressable = ctaNode
    expect(hasBorder(pressable.props.style)).toBe(true)
  })
})
