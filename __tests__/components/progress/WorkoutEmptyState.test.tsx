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
    onPrimary: '#ffffff',
    onSurface: '#000000',
    onSurfaceVariant: '#666666',
    outlineVariant: '#cccccc',
    surface: '#ffffff',
    surfaceVariant: '#eeeeee',
    background: '#ffffff',
    error: '#ff0000',
    onError: '#ffffff',
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

  // CVD contrast fix (BLD-3657): description text must use onSurface-based
  // color (not onSurfaceVariant) to pass WCAG-AA >= 4.5:1 contrast under
  // tritanopia and other CVD modes.
  it('description text style uses onSurface-derived color, not onSurfaceVariant (BLD-3657)', () => {
    const { getByText } = render(<WorkoutEmptyState />)
    const desc = getByText(
      /Complete your first workout to see sessions, PRs, and weekly trends here\./i,
    )

    // Flatten the full style array on the RNText node (Text wraps it as [getTextStyle(), style])
    const flatStyles = Array.isArray(desc.props.style)
      ? (desc.props.style as unknown[]).flat(Infinity)
      : [desc.props.style]

    // React Native last-wins: find the last explicit color override in the style array
    const colorStyle = [...flatStyles].reverse().find(
      (s: unknown) =>
        s && typeof s === 'object' && 'color' in (s as Record<string, unknown>),
    ) as Record<string, unknown> | undefined

    expect(colorStyle).toBeDefined()
    const color = colorStyle!.color as string

    // Must be onSurface (#000000) with CC alpha suffix (~80% opacity)
    expect(color).toBe('#000000CC')
    // Must NOT be the low-contrast onSurfaceVariant color
    expect(color).not.toBe('#666666')
    expect(color).not.toContain('#666666')
  })

  // Contrast-ratio guard (BLD-3657): onSurface (#000000) at CC (~80%) opacity
  // blended over background (#ffffff) must clear WCAG-AA (>= 4.5:1).
  it('onSurface at 80% opacity over background has contrast ratio >= 4.5:1 (BLD-3657)', () => {
    const hexToRgb = (hex: string) => ({
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    })

    const blendChannel = (fg: number, bg: number, alpha: number) =>
      Math.round(fg * alpha + bg * (1 - alpha))

    const toLinear = (c: number): number => {
      const s = c / 255
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }

    const luminance = (r: number, g: number, b: number) =>
      0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)

    const onSurface = '#000000' // light-theme value from mock
    const background = '#ffffff'
    const alpha = 0xcc / 0xff // CC = ~0.8

    const fg = hexToRgb(onSurface)
    const bg = hexToRgb(background)

    const blended = {
      r: blendChannel(fg.r, bg.r, alpha),
      g: blendChannel(fg.g, bg.g, alpha),
      b: blendChannel(fg.b, bg.b, alpha),
    }

    const l1 = luminance(blended.r, blended.g, blended.b)
    const l2 = luminance(bg.r, bg.g, bg.b)
    const lighter = Math.max(l1, l2)
    const darker = Math.min(l1, l2)
    const contrastRatio = (lighter + 0.05) / (darker + 0.05)

    expect(contrastRatio).toBeGreaterThanOrEqual(4.5)
  })
})
