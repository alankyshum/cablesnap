/**
 * Acceptance test for BLD-480 / BLD-482:
 * Workout summary muscle heatmap must not be height-cropped.
 *
 * Renders app/session/summary/[id].tsx with a completed-workout fixture
 * and asserts:
 *  - MusclesWorkedCard renders with correct accessibility label
 *  - The muscle map container has no `maxHeight` constraint
 *  - MuscleMap is rendered with the aggregated primary/secondary muscles
 */

jest.mock('../../lib/db', () => ({
  getSessionById: jest.fn(),
  getSessionSets: jest.fn().mockResolvedValue([]),
  getBodySettings: jest.fn().mockResolvedValue({
    weight_unit: 'kg',
    measurement_unit: 'cm',
    sex: 'male',
    weight_goal: null,
    body_fat_goal: null,
  }),
  getSessionPRs: jest.fn().mockResolvedValue([]),
  getSessionRepPRs: jest.fn().mockResolvedValue([]),
  getSessionDurationPRs: jest.fn().mockResolvedValue([]),
  getSessionWeightIncreases: jest.fn().mockResolvedValue([]),
  getSessionComparison: jest.fn().mockResolvedValue(null),
  getSessionSetCount: jest.fn().mockResolvedValue(0),
  getExercisesByIds: jest.fn().mockResolvedValue({}),
  buildAchievementContext: jest.fn().mockResolvedValue({}),
  getEarnedAchievementIds: jest.fn().mockResolvedValue([]),
  saveEarnedAchievements: jest.fn().mockResolvedValue(undefined),
  updateSession: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'sess-completed' }),
  usePathname: () => '/session/summary/sess-completed',
  useFocusEffect: jest.fn(),
  Stack: { Screen: () => null },
  Redirect: () => null,
}))

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')
jest.mock('../../lib/layout', () => ({
  useLayout: () => ({ wide: false, width: 375, scale: 1.0 }),
}))
jest.mock('../../lib/errors', () => ({
  logError: jest.fn(),
  generateReport: jest.fn().mockResolvedValue('{}'),
  getRecentErrors: jest.fn().mockResolvedValue([]),
  generateGitHubURL: jest.fn().mockReturnValue('https://github.com'),
}))
jest.mock('../../lib/interactions', () => ({
  log: jest.fn(),
  recent: jest.fn().mockResolvedValue([]),
}))
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}))
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))
jest.mock('../../lib/units', () => ({
  toDisplay: (v: number) => v,
  toKg: (v: number) => v,
  KG_TO_LB: 2.20462,
  LB_TO_KG: 0.453592,
}))
jest.mock('victory-native', () => ({
  CartesianChart: 'CartesianChart',
  Line: 'Line',
  Bar: 'Bar',
}))

jest.mock('../../lib/useProfileGender', () => ({
  useProfileGender: () => 'male',
}))

// Render MuscleMap as a plain host component so tree inspection works and we
// can assert the primary/secondary muscles passed to it.
jest.mock('../../components/MuscleMap', () => {
  const React = require('react')
  return {
    MuscleMap: (props: Record<string, unknown>) =>
      React.createElement('MuscleMap', props),
  }
})

import React from 'react'
import { StyleSheet } from 'react-native'
import { renderScreen } from '../helpers/render'
import { resetIds } from '../helpers/factories'
import { createCompletedWorkoutFixture } from '../fixtures/completedWorkoutSummary'
import Summary from '../../app/session/summary/[id]'

const mockDb = require('../../lib/db') as Record<string, jest.Mock>

describe('Workout Summary — muscle heatmap sizing (BLD-480)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetIds()
  })

  it('renders MusclesWorkedCard without a maxHeight cap on the map container', async () => {
    const { session, exercises, sets } = createCompletedWorkoutFixture()
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(sets)
    mockDb.getExercisesByIds.mockResolvedValue(exercises)

    const screen = renderScreen(<Summary />)

    // Muscles card rendered with accessibility label covering chest + accessories
    const card = await screen.findByLabelText(/Muscles worked:.*Chest/i)
    expect(card).toBeTruthy()

    // Map container is present and has no maxHeight style
    const mapContainer = await screen.findByTestId('muscles-worked-map-container')
    const flattened = StyleSheet.flatten(mapContainer.props.style) ?? {}
    expect(flattened).not.toHaveProperty('maxHeight')

    // MuscleMap receives aggregated primary/secondary muscles
    const muscleMap = screen.UNSAFE_getByType('MuscleMap' as unknown as React.ComponentType)
    expect(muscleMap.props.primary).toEqual(expect.arrayContaining(['chest']))
    expect(muscleMap.props.secondary).toEqual(
      expect.arrayContaining(['shoulders', 'triceps']),
    )
  })

  it('accessibility label includes human-readable muscle names', async () => {
    const { session, exercises, sets } = createCompletedWorkoutFixture()
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(sets)
    mockDb.getExercisesByIds.mockResolvedValue(exercises)

    const screen = renderScreen(<Summary />)

    const card = await screen.findByLabelText(/Muscles worked:/i)
    const label = card.props.accessibilityLabel as string
    expect(label).toMatch(/Chest/i)
    expect(label).toMatch(/Shoulders|Triceps/i)
  })
})
