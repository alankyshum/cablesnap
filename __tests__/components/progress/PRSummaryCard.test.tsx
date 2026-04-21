import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'

jest.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    primary: '#6200ee',
    onSurface: '#000',
    onSurfaceVariant: '#666',
    outlineVariant: '#ccc',
    surface: '#fff',
    background: '#fff',
    error: '#f00',
  }),
}))

jest.mock('@/lib/format', () => ({
  formatDateShort: () => 'Jan 15',
}))

jest.mock('@/lib/units', () => ({
  toDisplay: (v: number) => v,
  toKg: (v: number) => v,
  KG_TO_LB: 2.20462,
  LB_TO_KG: 0.453592,
}))

jest.mock('@/components/ui/card', () => {
  const { View } = require('react-native')
  return { Card: ({ children, style }: { children: React.ReactNode; style?: object }) => <View style={style}>{children}</View> }
})

jest.mock('@/components/ui/separator', () => {
  const { View } = require('react-native')
  return { Separator: ({ style }: { style?: object }) => <View style={style} /> }
})

import { PRSummaryCard } from '@/components/progress/PRSummaryCard'
import type { RecentPR, PRStats } from '@/lib/db/pr-dashboard'

describe('PRSummaryCard', () => {
  const mockOnSeeAll = jest.fn()

  const recentPRs: RecentPR[] = [
    { exercise_id: 'ex1', name: 'Bench Press', category: 'Push', weight: 100, reps: null, previous_best: 95, date: Date.now(), is_weighted: true },
    { exercise_id: 'ex2', name: 'Pull-ups', category: 'Pull', weight: null, reps: 12, previous_best: 10, date: Date.now() - 86400000, is_weighted: false },
    { exercise_id: 'ex3', name: 'Squat', category: 'Legs', weight: 140, reps: null, previous_best: 135, date: Date.now() - 172800000, is_weighted: true },
  ]

  const stats: PRStats = { totalPRs: 10, prsThisMonth: 3 }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('renders 3 recent PRs with exercise names', () => {
    const { getByText } = render(
      <PRSummaryCard
        recentPRs={recentPRs}
        stats={stats}
        weightUnit="kg"
        onSeeAll={mockOnSeeAll}
      />
    )
    expect(getByText('Bench Press')).toBeTruthy()
    expect(getByText('Pull-ups')).toBeTruthy()
    expect(getByText('Squat')).toBeTruthy()
  })

  test('shows PRs this month count', () => {
    const { getByText } = render(
      <PRSummaryCard
        recentPRs={recentPRs}
        stats={stats}
        weightUnit="kg"
        onSeeAll={mockOnSeeAll}
      />
    )
    expect(getByText('3 this month')).toBeTruthy()
  })

  test('See All button navigates when pressed', () => {
    const { getByText } = render(
      <PRSummaryCard
        recentPRs={recentPRs}
        stats={stats}
        weightUnit="kg"
        onSeeAll={mockOnSeeAll}
      />
    )
    fireEvent.press(getByText('See All →'))
    expect(mockOnSeeAll).toHaveBeenCalledTimes(1)
  })

  test('shows empty state when no PRs', () => {
    const { getByText } = render(
      <PRSummaryCard
        recentPRs={[]}
        stats={{ totalPRs: 0, prsThisMonth: 0 }}
        weightUnit="kg"
        onSeeAll={mockOnSeeAll}
      />
    )
    expect(getByText('No records yet — start lifting!')).toBeTruthy()
  })

  test('displays weight values with correct unit', () => {
    const { getByText } = render(
      <PRSummaryCard
        recentPRs={recentPRs}
        stats={stats}
        weightUnit="kg"
        onSeeAll={mockOnSeeAll}
      />
    )
    expect(getByText('100 kg')).toBeTruthy()
    expect(getByText('12 reps')).toBeTruthy()
  })
})
