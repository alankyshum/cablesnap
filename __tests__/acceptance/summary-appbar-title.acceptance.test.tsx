/**
 * Acceptance test for BLD-731 (supersedes BLD-684's app-bar contract):
 *
 * BLD-684 originally fixed a duplication where both the app-bar title
 * and the hero h1 rendered the literal string "Workout Complete!". The
 * fix at the time was to set the app-bar title to `session.name`. That
 * created a NEW duplication (BLD-731): the workout name now appeared
 * twice — once in the app bar and once in the hero subtitle.
 *
 * BLD-731 supersedes BLD-684's app-bar contract: the canonical surface
 * for the workout name is the hero subtitle, and the app bar shows the
 * static label "Summary" for ALL sessions (including blank names).
 *
 * Renders app/session/summary/[id].tsx with a completed-workout fixture
 * and asserts:
 *  - The app-bar Stack.Screen `title` is the literal string "Summary",
 *    independent of session.name.
 *  - The app-bar title is NEVER equal to the hero subtitle text (no
 *    duplication of the workout name across surfaces) — preserves the
 *    de-duplication intent of BLD-684.
 *  - The hero subtitle still renders session.name (canonical surface).
 *  - When session.name is missing/blank, the app bar still shows
 *    "Summary" (regression guard).
 */

const mockStackScreenSpy = jest.fn()

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
  Stack: {
    Screen: (props: { options?: { title?: string } }) => {
      mockStackScreenSpy(props)
      return null
    },
  },
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
jest.mock('../../components/MuscleMap', () => {
  const React = require('react')
  return {
    MuscleMap: (props: Record<string, unknown>) =>
      React.createElement('MuscleMap', props),
  }
})

import React from 'react'
import { renderScreen } from '../helpers/render'
import { resetIds } from '../helpers/factories'
import { createCompletedWorkoutFixture } from '../fixtures/completedWorkoutSummary'
import Summary from '../../app/session/summary/[id]'

const mockDb = require('../../lib/db') as Record<string, jest.Mock>

function lastTitle(): string | undefined {
  for (let i = mockStackScreenSpy.mock.calls.length - 1; i >= 0; i--) {
    const props = mockStackScreenSpy.mock.calls[i][0] as { options?: { title?: string } }
    if (props?.options && 'title' in props.options) return props.options.title
  }
  return undefined
}

describe('Workout Summary — app-bar title (BLD-731 supersedes BLD-684)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockStackScreenSpy.mockClear()
    resetIds()
  })

  it('app-bar title is the literal "Summary", not the hero "Workout Complete!" string', async () => {
    const { session, exercises, sets } = createCompletedWorkoutFixture()
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(sets)
    mockDb.getExercisesByIds.mockResolvedValue(exercises)

    const screen = renderScreen(<Summary />)

    // Wait for the loaded screen (hero renders after session resolves).
    await screen.findByText('Workout Complete!')

    const title = lastTitle()
    expect(title).toBe('Summary')
    expect(title).not.toBe('Workout Complete!')
  })

  it.each([
    ['short label', 'Push'],
    ['long label', 'Upper Body Hypertrophy Day'],
    ['typical label', 'Upper Body'],
  ])('app-bar title is "Summary" and does not duplicate the hero subtitle — %s (%s)', async (_label, name) => {
    const { session, exercises, sets } = createCompletedWorkoutFixture()
    mockDb.getSessionById.mockResolvedValue({ ...session, name })
    mockDb.getSessionSets.mockResolvedValue(sets)
    mockDb.getExercisesByIds.mockResolvedValue(exercises)

    const screen = renderScreen(<Summary />)
    await screen.findByText('Workout Complete!')

    const appBarTitle = lastTitle()
    // App bar always shows the literal "Summary" — the canonical surface
    // for the workout name is the hero subtitle.
    expect(appBarTitle).toBe('Summary')
    // De-duplication intent (preserved from BLD-684): app bar title must
    // NEVER equal the workout name rendered in the hero.
    expect(appBarTitle).not.toBe(name)
    // Hero subtitle remains the canonical surface for the workout name.
    await screen.findByText(name)
  })

  it('falls back to "Summary" when the session has no name (regression guard)', async () => {
    const { session, exercises, sets } = createCompletedWorkoutFixture()
    const namelessSession = { ...session, name: '   ' }
    mockDb.getSessionById.mockResolvedValue(namelessSession)
    mockDb.getSessionSets.mockResolvedValue(sets)
    mockDb.getExercisesByIds.mockResolvedValue(exercises)

    const screen = renderScreen(<Summary />)
    await screen.findByText('Workout Complete!')

    expect(lastTitle()).toBe('Summary')
  })
})
