import React from 'react'
import { render } from '@testing-library/react-native'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')
jest.mock('react-native-reanimated', () => {
  const { View: RNView } = require('react-native')
  return {
    __esModule: true,
    default: {
      View: RNView,
      Text: require('react-native').Text,
      createAnimatedComponent: (c: unknown) => c,
    },
    useSharedValue: (v: number) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: number) => v,
    useReducedMotion: () => false,
    Easing: { bezier: () => (t: number) => t },
  }
})

import MonthlyShareCard from '../../../components/share/MonthlyShareCard'

describe('MonthlyShareCard', () => {
  const defaultProps = {
    monthLabel: 'April 2026',
    sessionCount: 16,
    volume: '42,350',
    unit: 'kg',
    prCount: 3,
    longestStreak: 5,
  }

  it('renders month label and stats', () => {
    const { getByText } = render(<MonthlyShareCard {...defaultProps} />)
    expect(getByText('April 2026')).toBeTruthy()
    expect(getByText('16')).toBeTruthy()
    expect(getByText('42,350')).toBeTruthy()
    expect(getByText('3')).toBeTruthy()
    expect(getByText('5d')).toBeTruthy()
  })

  it('displays CableSnap branding', () => {
    const { getByText } = render(<MonthlyShareCard {...defaultProps} />)
    expect(getByText('CableSnap')).toBeTruthy()
    expect(getByText('cablesnap.app')).toBeTruthy()
  })

  it('has accessibility labels on stat blocks', () => {
    const { getByLabelText } = render(<MonthlyShareCard {...defaultProps} />)
    expect(getByLabelText('Workouts: 16')).toBeTruthy()
    expect(getByLabelText('PRs: 3')).toBeTruthy()
    expect(getByLabelText('Monthly report for April 2026')).toBeTruthy()
  })
})
