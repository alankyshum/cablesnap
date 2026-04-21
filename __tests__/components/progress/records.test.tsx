import React from 'react'
import { render } from '@testing-library/react-native'

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() }

jest.mock('expo-router', () => {
  const RealReact = require('react')
  return {
    useRouter: () => mockRouter,
    useFocusEffect: (cb: () => (() => void) | void) => {
      RealReact.useEffect(() => {
        const cleanup = cb()
        return typeof cleanup === 'function' ? cleanup : undefined
      }, [])
    },
    Stack: { Screen: () => null },
  }
})

jest.mock('../../hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    primary: '#6200ee',
    onSurface: '#000',
    onSurfaceVariant: '#666',
    outlineVariant: '#ccc',
    surface: '#fff',
    background: '#f5f5f5',
    error: '#f00',
  }),
}))

jest.mock('../../lib/format', () => ({
  formatDateShort: () => 'Jan 15',
}))

jest.mock('../../lib/units', () => ({
  toDisplay: (v: number) => v,
  toKg: (v: number) => v,
  KG_TO_LB: 2.20462,
  LB_TO_KG: 0.453592,
}))

jest.mock('../../components/ui/card', () => {
  const { View } = require('react-native')
  return { Card: ({ children, style }: { children: React.ReactNode; style?: object }) => <View style={style}>{children}</View> }
})

jest.mock('../../components/ui/separator', () => {
  const { View } = require('react-native')
  return { Separator: ({ style }: { style?: object }) => <View style={style} /> }
})

jest.mock('../../components/ui/button', () => {
  const { Text: RNText, Pressable } = require('react-native')
  return { Button: ({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) => <Pressable onPress={onPress}><RNText>{children}</RNText></Pressable> }
})

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')

jest.mock('../../lib/db/pr-dashboard', () => ({
  getPRStats: jest.fn().mockResolvedValue({ totalPRs: 5, prsThisMonth: 2 }),
  getRecentPRsWithDelta: jest.fn().mockResolvedValue([
    { exercise_id: 'ex1', name: 'Bench Press', category: 'Push', weight: 100, reps: null, previous_best: 95, date: Date.now(), is_weighted: true },
    { exercise_id: 'ex2', name: 'Pull-ups', category: 'Pull', weight: null, reps: 12, previous_best: 10, date: Date.now() - 86400000, is_weighted: false },
  ]),
  getAllTimeBests: jest.fn().mockResolvedValue([
    { exercise_id: 'ex1', name: 'Bench Press', category: 'Push', max_weight: 100, max_reps: null, best_set_weight: 90, best_set_reps: 5, est_1rm: 105, session_count: 10, is_weighted: true },
    { exercise_id: 'ex2', name: 'Pull-ups', category: 'Pull', max_weight: null, max_reps: 15, best_set_weight: null, best_set_reps: null, est_1rm: null, session_count: 8, is_weighted: false },
  ]),
}))

jest.mock('../../lib/db', () => ({
  getBodySettings: jest.fn().mockResolvedValue({ weight_unit: 'kg', measurement_unit: 'cm' }),
}))

import RecordsPage from '../../app/progress/records'

describe('Records Page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('renders header stats with total PRs and PRs this month', async () => {
    const { findByText } = render(<RecordsPage />)
    expect(await findByText('5')).toBeTruthy()
    expect(await findByText('2')).toBeTruthy()
    expect(await findByText('Total PRs')).toBeTruthy()
    expect(await findByText('PRs This Month')).toBeTruthy()
  })

  test('renders recent PRs section with exercise names', async () => {
    const { findByText } = render(<RecordsPage />)
    expect(await findByText('Recent PRs')).toBeTruthy()
    expect(await findByText('Bench Press')).toBeTruthy()
    expect(await findByText('Pull-ups')).toBeTruthy()
  })

  test('renders all-time bests section with categories', async () => {
    const { findByText } = render(<RecordsPage />)
    expect(await findByText('All-Time Bests')).toBeTruthy()
    expect(await findByText('Push')).toBeTruthy()
    expect(await findByText('Pull')).toBeTruthy()
  })

  test('renders empty state when no data', async () => {
    const prDashboard = require('../../lib/db/pr-dashboard')
    prDashboard.getPRStats.mockResolvedValue({ totalPRs: 0, prsThisMonth: 0 })
    prDashboard.getRecentPRsWithDelta.mockResolvedValue([])
    prDashboard.getAllTimeBests.mockResolvedValue([])

    const { findByText } = render(<RecordsPage />)
    expect(await findByText('No Records Yet')).toBeTruthy()
    expect(await findByText('Complete your first workout to start tracking personal records!')).toBeTruthy()
  })
})
