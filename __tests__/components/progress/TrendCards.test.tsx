import React from 'react'
import { render } from '@testing-library/react-native'

jest.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    primary: '#6200ee',
    secondary: '#03dac6',
    tertiary: '#bb86fc',
    onSurface: '#000',
    onSurfaceVariant: '#666',
    surface: '#fff',
  }),
}))

jest.mock('@/components/ui/card', () => {
  const { View } = require('react-native')
  return { Card: ({ children, style }: { children: React.ReactNode; style?: object }) => <View style={style}>{children}</View> }
})

jest.mock('victory-native', () => {
  const { View } = require('react-native')
  return {
    CartesianChart: ({ children }: { children: (args: { points: { y: [] } }) => React.ReactNode }) => (
      <View>{typeof children === 'function' ? children({ points: { y: [] } }) : children}</View>
    ),
    Line: () => null,
    Scatter: () => null,
  }
})

jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => cb(),
}))

const mockGetRecentSessionRPEs = jest.fn().mockResolvedValue([])
const mockGetRecentSessionRatings = jest.fn().mockResolvedValue([])

jest.mock('@/lib/db/e1rm-trends', () => ({
  getRecentSessionRPEs: (...args: unknown[]) => mockGetRecentSessionRPEs(...args),
  getRecentSessionRatings: (...args: unknown[]) => mockGetRecentSessionRatings(...args),
}))

import { TrendLineCard, RPETrendCard, RatingTrendCard } from '@/components/progress/TrendCards'

describe('TrendCards', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetRecentSessionRPEs.mockResolvedValue([])
    mockGetRecentSessionRatings.mockResolvedValue([])
  })

  describe('TrendLineCard', () => {
    test('shows empty state message when data is empty', () => {
      const { getByText } = render(
        <TrendLineCard
          title="Test Chart"
          data={[]}
          yDomain={[1, 10]}
          lineColor="#000"
          emptyMessage="No data yet."
          chartWidth={300}
        />
      )
      expect(getByText('Test Chart')).toBeTruthy()
      expect(getByText('No data yet.')).toBeTruthy()
    })

    test('renders chart with title and accessibility label when data exists', () => {
      const data = [
        { x: 0, y: 5.0 },
        { x: 1, y: 7.5 },
        { x: 2, y: 6.2 },
      ]
      const { getByText, getByLabelText } = render(
        <TrendLineCard
          title="Avg RPE"
          data={data}
          yDomain={[1, 10]}
          lineColor="#000"
          emptyMessage="No data."
          chartWidth={300}
        />
      )
      expect(getByText('Avg RPE')).toBeTruthy()
      expect(getByLabelText('Avg RPE: latest value 6.2, 3 sessions')).toBeTruthy()
    })

    test('single data point accessibility label uses singular "session"', () => {
      const { getByLabelText } = render(
        <TrendLineCard
          title="Rating"
          data={[{ x: 0, y: 4.0 }]}
          yDomain={[1, 5]}
          lineColor="#000"
          emptyMessage="No data."
          chartWidth={300}
        />
      )
      expect(getByLabelText('Rating: latest value 4.0, 1 session')).toBeTruthy()
    })
  })

  describe('RPETrendCard', () => {
    test('shows RPE empty state when no data', () => {
      const { getByText } = render(
        <RPETrendCard chartWidth={300} />
      )
      expect(getByText('Avg RPE per Session (1–10)')).toBeTruthy()
      expect(getByText('Log RPE on your sets to see trends here.')).toBeTruthy()
      expect(mockGetRecentSessionRPEs).toHaveBeenCalled()
    })

    test('fetches RPE data on focus', () => {
      render(<RPETrendCard chartWidth={300} />)
      expect(mockGetRecentSessionRPEs).toHaveBeenCalledTimes(1)
    })
  })

  describe('RatingTrendCard', () => {
    test('shows rating empty state when no data', () => {
      const { getByText } = render(
        <RatingTrendCard chartWidth={300} />
      )
      expect(getByText('Session Ratings (1–5)')).toBeTruthy()
      expect(getByText('Rate your sessions to see trends here.')).toBeTruthy()
      expect(mockGetRecentSessionRatings).toHaveBeenCalled()
    })

    test('fetches rating data on focus', () => {
      render(<RatingTrendCard chartWidth={300} />)
      expect(mockGetRecentSessionRatings).toHaveBeenCalledTimes(1)
    })
  })
})
