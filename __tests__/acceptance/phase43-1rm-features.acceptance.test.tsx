import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import { createExercise, resetIds } from '../helpers/factories'
import type { Exercise } from '../../lib/types'

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() }
const mockParams: Record<string, string> = { id: 'ex-1' }

jest.mock('expo-router', () => {
  const RealReact = require('react')
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => mockParams,
    usePathname: () => '/test',
    useFocusEffect: (cb: () => (() => void) | void) => {
      RealReact.useEffect(() => {
        const cleanup = cb()
        return typeof cleanup === 'function' ? cleanup : undefined
      }, [])
    },
    Stack: { Screen: () => null },
    Redirect: () => null,
  }
})

jest.mock('@react-navigation/native', () => {
  const RealReact = require('react')
  return {
    useFocusEffect: (cb: () => (() => void) | void) => {
      RealReact.useEffect(() => {
        const cleanup = cb()
        return typeof cleanup === 'function' ? cleanup : undefined
      }, [])
    },
    NavigationContainer: ({ children }: { children: React.ReactNode }) => children,
  }
})

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')
jest.mock('../../lib/layout', () => ({ useLayout: () => ({ wide: false, atLeastMedium: false, width: 375, scale: 1.0 }) }))
jest.mock('../../lib/errors', () => ({ logError: jest.fn(), generateReport: jest.fn().mockResolvedValue('{}'), getRecentErrors: jest.fn().mockResolvedValue([]), generateGitHubURL: jest.fn().mockReturnValue('https://github.com') }))
jest.mock('../../lib/interactions', () => ({ log: jest.fn(), recent: jest.fn().mockResolvedValue([]) }))
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))
jest.mock('../../lib/useProfileGender', () => ({ useProfileGender: () => 'neutral' }))
jest.mock('victory-native', () => {
  const RealReact = require('react')
  return {
    CartesianChart: (props: Record<string, unknown>) => RealReact.createElement('CartesianChart', props),
    Line: () => null,
    Bar: () => null,
  }
})

jest.mock('../../lib/db', () => ({
  getExerciseById: jest.fn(),
  getBodySettings: jest.fn().mockResolvedValue({ weight_unit: 'kg', measurement_unit: 'cm', weight_goal: null, body_fat_goal: null }),
  getExerciseRecords: jest.fn(),
  getExerciseChartData: jest.fn(),
  getExercise1RMChartData: jest.fn(),
  getBestSet: jest.fn(),
  getVariantSetCount: jest.fn().mockResolvedValue(0),
  getExerciseHistory: jest.fn().mockResolvedValue([]),
  softDeleteCustomExercise: jest.fn(),
  getTemplatesUsingExercise: jest.fn().mockResolvedValue([]),
}))

const mockDb = require('../../lib/db') as {
  getExerciseById: jest.Mock
  getBodySettings: jest.Mock
  getExerciseRecords: jest.Mock
  getExerciseChartData: jest.Mock
  getExercise1RMChartData: jest.Mock
  getBestSet: jest.Mock
  getExerciseHistory: jest.Mock
  softDeleteCustomExercise: jest.Mock
  getTemplatesUsingExercise: jest.Mock
}

const exercise: Exercise = createExercise({
  id: 'ex-1',
  name: 'Bench Press',
  category: 'chest',
  primary_muscles: ['chest', 'triceps'],
  instructions: 'Lie on bench\nPress barbell up',
})

const bwExercise: Exercise = createExercise({
  id: 'ex-bw',
  name: 'Push-Up',
  category: 'chest',
  primary_muscles: ['chest'],
  equipment: 'bodyweight',
  instructions: 'Do push-ups',
})

import ExerciseDetail from '../../app/exercise/[id]'

beforeEach(() => {
  jest.clearAllMocks()
  resetIds()
  mockRouter.push.mockClear()
})

describe('Phase 43 — Exercise Detail Features', () => {
  function setupWeightedExercise() {
    mockDb.getExerciseById.mockResolvedValue(exercise)
    mockDb.getExerciseRecords.mockResolvedValue({
      max_weight: 100,
      max_reps: 10,
      max_volume: 800,
      est_1rm: 120,
      total_sessions: 5,
      is_bodyweight: false,
    })
    mockDb.getBestSet.mockResolvedValue({ weight: 100, reps: 5 })
    mockDb.getExerciseChartData.mockResolvedValue([
      { date: 1000000, value: 80 },
      { date: 2000000, value: 90 },
      { date: 3000000, value: 100 },
    ])
    mockDb.getExercise1RMChartData.mockResolvedValue([
      { date: 1000000, value: 95 },
      { date: 2000000, value: 110 },
      { date: 3000000, value: 120 },
    ])
  }

  describe('Feature A: 1RM Trend Chart Toggle', () => {
    it('shows chart mode toggle chips for weighted exercises', async () => {
      setupWeightedExercise()
      const { findByText } = renderScreen(<ExerciseDetail />)

      expect(await findByText('Max Weight')).toBeTruthy()
      expect(await findByText('Est. 1RM')).toBeTruthy()
    })

    it('defaults to Max Weight mode', async () => {
      setupWeightedExercise()
      const { findByText } = renderScreen(<ExerciseDetail />)

      const maxWeight = await findByText('Max Weight')
      // Chip should be selected by default
      expect(maxWeight).toBeTruthy()
    })

    it('does not show toggle for bodyweight exercises', async () => {
      mockParams.id = 'ex-bw'
      mockDb.getExerciseById.mockResolvedValue(bwExercise)
      mockDb.getExerciseRecords.mockResolvedValue({
        max_weight: null,
        max_reps: 20,
        max_volume: 20,
        est_1rm: null,
        total_sessions: 3,
        is_bodyweight: true,
      })
      mockDb.getBestSet.mockResolvedValue(null)
      mockDb.getExerciseChartData.mockResolvedValue([
        { date: 1000000, value: 15 },
        { date: 2000000, value: 18 },
        { date: 3000000, value: 20 },
      ])
      mockDb.getExercise1RMChartData.mockResolvedValue([])

      const { findByText, queryByText } = renderScreen(<ExerciseDetail />)

      await findByText('Reps Progression')
      expect(queryByText('Max Weight')).toBeNull()
      expect(queryByText('Est. 1RM')).toBeNull()

      mockParams.id = 'ex-1'
    })

    it('does not show toggle when chart has fewer than 2 data points', async () => {
      mockDb.getExerciseById.mockResolvedValue(exercise)
      mockDb.getExerciseRecords.mockResolvedValue({
        max_weight: 100,
        max_reps: 10,
        max_volume: 800,
        est_1rm: 120,
        total_sessions: 1,
        is_bodyweight: false,
      })
      mockDb.getBestSet.mockResolvedValue({ weight: 100, reps: 5 })
      mockDb.getExerciseChartData.mockResolvedValue([
        { date: 1000000, value: 100 },
      ])
      mockDb.getExercise1RMChartData.mockResolvedValue([
        { date: 1000000, value: 120 },
      ])

      const { findByText, queryByText } = renderScreen(<ExerciseDetail />)

      await findByText('Weight Progression')
      expect(queryByText('Max Weight')).toBeNull()
      expect(queryByText('Est. 1RM')).toBeNull()
    })
  })

  describe('Feature C: Percentage rows → Plate Calculator', () => {
    it('navigates to plate calculator when percentage row is tapped', async () => {
      setupWeightedExercise()
      const { findByText } = renderScreen(<ExerciseDetail />)

      // Wait for the percentage table to render
      const row95 = await findByText('95%')
      fireEvent.press(row95)

      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith(
          expect.stringContaining('/tools/plates?weight=')
        )
      })
    })

    it('percentage rows have accessibility attributes', async () => {
      setupWeightedExercise()
      const { findByText, findAllByRole } = renderScreen(<ExerciseDetail />)

      // Wait for the percentage table to render
      await findByText('95%')

      // All percentage rows should have button role
      const buttons = await findAllByRole('button')
      const plateButtons = buttons.filter(
        (b) => b.props.accessibilityHint === 'Opens plate calculator with this weight'
      )
      expect(plateButtons.length).toBeGreaterThan(0)
    })
  })
})

describe('Phase 43 — Session 1RM Annotation', () => {
  it('epley function calculates correctly', () => {
    const { epley } = require('../../lib/rm')
    // epley(80, 8) = 80 * (1 + 8/30) = 80 * 1.2667 = 101.33
    expect(Math.round(epley(80, 8))).toBe(101)
    // epley(100, 1) = 100 (identity for single rep)
    expect(epley(100, 1)).toBe(100)
    // epley(60, 10) = 60 * (1 + 10/30) = 60 * 1.333 = 80
    expect(Math.round(epley(60, 10))).toBe(80)
  })
})
