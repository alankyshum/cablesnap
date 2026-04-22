/**
 * Acceptance test for BLD-509:
 * Android hardware back button on the workout summary screen must route
 * through the same "Done" flow (tabs root) rather than the default
 * behavior, which could navigate back into the live session or lose
 * context.
 */

jest.mock('../../lib/db', () => ({
  getSessionById: jest.fn().mockResolvedValue(null),
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

const mockReplace = jest.fn()
const mockUseFocusEffect = jest.fn((cb: () => void | (() => void)) => {
  // Emulate expo-router/React Navigation: invoke the effect synchronously on
  // focus so tests can observe subscription side-effects.
  cb()
})

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'sess-missing' }),
  usePathname: () => '/session/summary/sess-missing',
  useFocusEffect: (cb: () => void | (() => void)) => mockUseFocusEffect(cb),
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
jest.mock('../../components/MuscleMap', () => {
  const React = require('react')
  return {
    MuscleMap: (props: Record<string, unknown>) =>
      React.createElement('MuscleMap', props),
  }
})

import React from 'react'
import { BackHandler } from 'react-native'
import { renderScreen } from '../helpers/render'
import { resetIds } from '../helpers/factories'
import Summary from '../../app/session/summary/[id]'

describe('Workout Summary — Android hardware back handler (BLD-509)', () => {
  let removeSpy: jest.Mock
  let addSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    resetIds()
    removeSpy = jest.fn()
    addSpy = jest
      .spyOn(BackHandler, 'addEventListener')
      .mockReturnValue({ remove: removeSpy } as unknown as ReturnType<typeof BackHandler.addEventListener>)
  })

  afterEach(() => {
    addSpy.mockRestore()
  })

  it('registers a hardwareBackPress listener on focus', () => {
    renderScreen(<Summary />)
    expect(addSpy).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function))
  })

  it('hardware back routes through the Done flow (replace to tabs root) and intercepts default behavior', () => {
    renderScreen(<Summary />)
    expect(addSpy).toHaveBeenCalled()
    const handler = addSpy.mock.calls[0][1] as () => boolean

    const result = handler()

    // Returning true tells Android we handled the event — no default nav.
    expect(result).toBe(true)
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)')
  })

  it('cleans up the listener when the screen loses focus', () => {
    // The focus-effect callback returns a cleanup function. Our mock invokes
    // the effect eagerly and returns the cleanup; call it to verify removal.
    mockUseFocusEffect.mockImplementationOnce((cb: () => void | (() => void)) => {
      const cleanup = cb()
      if (typeof cleanup === 'function') cleanup()
    })
    renderScreen(<Summary />)
    expect(removeSpy).toHaveBeenCalled()
  })
})
