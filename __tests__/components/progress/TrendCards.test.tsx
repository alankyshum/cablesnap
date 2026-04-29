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

import { TrendLineCard, RPETrendCard, RatingTrendCard } from '@/components/progress/TrendCards'

describe('TrendCards', () => {
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
        <RPETrendCard rpeData={[]} chartWidth={300} />
      )
      expect(getByText('Avg RPE per Session (1–10)')).toBeTruthy()
      expect(getByText('Log RPE on your sets to see trends here.')).toBeTruthy()
    })

    test('renders RPE chart with session data', () => {
      const rpeData = [
        { session_id: 's1', started_at: 1000, avg_rpe: 7.5 },
        { session_id: 's2', started_at: 2000, avg_rpe: 8.0 },
      ]
      const { getByText, getByLabelText } = render(
        <RPETrendCard rpeData={rpeData} chartWidth={300} />
      )
      expect(getByText('Avg RPE per Session (1–10)')).toBeTruthy()
      expect(getByLabelText('Avg RPE per Session (1–10): latest value 8.0, 2 sessions')).toBeTruthy()
    })
  })

  describe('RatingTrendCard', () => {
    test('shows rating empty state when no data', () => {
      const { getByText } = render(
        <RatingTrendCard ratingData={[]} chartWidth={300} />
      )
      expect(getByText('Session Ratings (1–5)')).toBeTruthy()
      expect(getByText('Rate your sessions to see trends here.')).toBeTruthy()
    })

    test('renders rating chart with session data', () => {
      const ratingData = [
        { session_id: 's1', started_at: 1000, rating: 4 },
        { session_id: 's2', started_at: 2000, rating: 3 },
        { session_id: 's3', started_at: 3000, rating: 5 },
      ]
      const { getByText, getByLabelText } = render(
        <RatingTrendCard ratingData={ratingData} chartWidth={300} />
      )
      expect(getByText('Session Ratings (1–5)')).toBeTruthy()
      expect(getByLabelText('Session Ratings (1–5): latest value 5.0, 3 sessions')).toBeTruthy()
    })
  })
})
