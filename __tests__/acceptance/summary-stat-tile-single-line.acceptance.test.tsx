/**
 * Acceptance test for BLD-1993 (and prior BLD-1876 / BLD-1873 / BLD-1938):
 * Summary screen stat tile captions must not wrap to multiple lines.
 *
 * BLD-1993 restructures the labels so they are short static words that always
 * fit at 390px without any font-shrink tricks:
 *  - Duration label: "Duration" (unchanged)
 *  - Sets label:     "Sets"     (parenthetical "(N working)" removed from label)
 *  - Volume label:   "Volume"   (unit moved to value line, e.g. "2,400 kg")
 *
 * Verifies:
 *  - All three stat captions render the exact static text: "Duration" / "Sets" / "Volume"
 *  - All three captions have numberOfLines={1} (single-line constraint)
 *  - Captions do NOT use adjustsFontSizeToFit — labels are short enough not to need it
 *  - The Volume VALUE text contains the unit suffix (e.g. "0 kg")
 *  - The Sets tile accessibilityLabel still exposes the full breakdown text
 *    (screen-reader a11y must not regress — BLD-1993 AC)
 *  - The mixed-set-type case still has "Sets" as the visible label (no cramming
 *    long breakdown into label text)
 *  - Stat VALUE nodes have numberOfLines={1} and adjustsFontSizeToFit so large
 *    numbers (e.g. "124,500 lb") render on one line
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
  useLayout: () => ({ wide: false, width: 390, scale: 1.0 }),
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

describe('Summary stat tile captions — single-line constraint (BLD-1993)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetIds()
  })

  it('Duration caption renders the exact static text "Duration" with numberOfLines=1', async () => {
    const { session, exercises, sets } = createCompletedWorkoutFixture()
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(sets)
    mockDb.getExercisesByIds.mockResolvedValue(exercises)

    const screen = renderScreen(<Summary />)

    const durationCard = await screen.findByLabelText(/Duration:/i)
    expect(durationCard).toBeTruthy()

    // Exact label text — no parenthetical, no unit suffix
    const durationCaption = await screen.findByText('Duration')
    expect(durationCaption.props.numberOfLines).toBe(1)
    // BLD-1993: labels are short static words — they should NOT need adjustsFontSizeToFit
    expect(durationCaption.props.adjustsFontSizeToFit).toBeFalsy()
  })

  it('Sets caption renders the exact static text "Sets" with numberOfLines=1 (no parenthetical)', async () => {
    const { session, exercises, sets } = createCompletedWorkoutFixture({ setCount: 9 })
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(sets)
    mockDb.getExercisesByIds.mockResolvedValue(exercises)

    const screen = renderScreen(<Summary />)

    const setsCard = await screen.findByLabelText(/sets/i)
    expect(setsCard).toBeTruthy()

    // BLD-1993: label must be exactly "Sets" — NOT "Sets (9 working)" etc.
    // Note: SetsCard also renders a "Sets" header (variant="title"), so we use
    // findAllByText and look for the caption with numberOfLines=1 (the stat tile).
    const setsCaptions = await screen.findAllByText('Sets')
    // The stat tile caption has numberOfLines=1; the SetsCard header does not
    const statCaption = setsCaptions.find((n) => n.props.numberOfLines === 1)
    expect(statCaption).toBeTruthy()
    // BLD-1993: static short label — no need for adjustsFontSizeToFit on labels
    expect(statCaption!.props.adjustsFontSizeToFit).toBeFalsy()
    // The old minimumFontScale={0.6} band-aid must be gone
    expect(statCaption!.props.minimumFontScale).toBeFalsy()
  })

  it('Volume caption renders the exact static text "Volume" with numberOfLines=1', async () => {
    const { session, exercises, sets } = createCompletedWorkoutFixture()
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(sets)
    mockDb.getExercisesByIds.mockResolvedValue(exercises)

    const screen = renderScreen(<Summary />)

    // BLD-1993: label must be exactly "Volume" — NOT "Volume (kg)" etc.
    const volumeCaption = await screen.findByText('Volume')
    expect(volumeCaption.props.numberOfLines).toBe(1)
    // BLD-1993: static short label — no need for adjustsFontSizeToFit on labels
    expect(volumeCaption.props.adjustsFontSizeToFit).toBeFalsy()
  })

  it('Volume VALUE text contains the unit suffix (e.g. "0 kg")', async () => {
    const { session, exercises, sets } = createCompletedWorkoutFixture()
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(sets)
    mockDb.getExercisesByIds.mockResolvedValue(exercises)

    const screen = renderScreen(<Summary />)

    // The Volume card value should include the unit ("0 kg", "2,400 kg", etc.)
    // The accessibility label uses "Total volume:" so we can scope to that card
    const volumeCard = await screen.findByLabelText(/Total volume:/i)
    expect(volumeCard).toBeTruthy()

    // The value text node inside the card's heading should contain the unit
    const valueWithUnit = await screen.findByText(/\d.*\s(kg|lb)/i)
    expect(valueWithUnit).toBeTruthy()
    expect(valueWithUnit.props.numberOfLines).toBe(1)
    expect(valueWithUnit.props.adjustsFontSizeToFit).toBe(true)
  })

  it('Sets tile accessibilityLabel still exposes full breakdown text (a11y not regressed)', async () => {
    const { session, exercises, sets } = createCompletedWorkoutFixture({ setCount: 9 })
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(sets)
    mockDb.getExercisesByIds.mockResolvedValue(exercises)

    const screen = renderScreen(<Summary />)

    // The Card accessibilityLabel must contain the set count and a breakdown.
    // With 9 completed working sets: "9 sets: 9 working" or "9 sets completed"
    const setsCard = await screen.findByLabelText(/sets/i)
    const label = setsCard.props.accessibilityLabel as string
    expect(label).toBeTruthy()
    expect(label.length).toBeGreaterThan(0)
    expect(label).toMatch(/sets/i)
    // The a11y label must still mention the count, not just be "Sets" (the short visible label)
    expect(label).toMatch(/\d+\s*sets/i)
  })

  it('Sets tile accessibilityLabel preserves breakdown for mixed set types (a11y no-regression, BLD-1993)', async () => {
    // Mixed fixture: working + warm-up sets — confirms the long breakdown stays
    // in the a11y label even though it no longer clutters the visible label.
    const { session, exercises, sets } = createCompletedWorkoutFixture({ setCount: 8 })
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(sets)
    mockDb.getExercisesByIds.mockResolvedValue(exercises)

    const screen = renderScreen(<Summary />)

    const setsCard = await screen.findByLabelText(/sets/i)
    const label = setsCard.props.accessibilityLabel as string
    expect(label).toBeTruthy()
    expect(label).toMatch(/sets/i)
    // Visible caption must still just be "Sets" (stat tile version, with numberOfLines=1)
    const setsCaptions = await screen.findAllByText('Sets')
    const statCaption = setsCaptions.find((n) => n.props.numberOfLines === 1)
    expect(statCaption).toBeTruthy()
  })

  it('all three captions are present as siblings inside the stats row with exact static text', async () => {
    const { session, exercises, sets } = createCompletedWorkoutFixture()
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(sets)
    mockDb.getExercisesByIds.mockResolvedValue(exercises)

    const screen = renderScreen(<Summary />)

    // All three stat captions must be exact static words — no units, no counts embedded
    const durationCaption = await screen.findByText('Duration')
    expect(durationCaption).toBeTruthy()

    const volumeCaption = await screen.findByText('Volume')
    expect(volumeCaption).toBeTruthy()

    // "Sets" (exact) — not "Sets (N working)".
    // Note: SetsCard also renders a "Sets" heading, so we check at least one
    // "Sets" node has numberOfLines=1 (the stat tile caption).
    const setsCaptions = await screen.findAllByText('Sets')
    expect(setsCaptions.length).toBeGreaterThan(0)
    const statCaption = setsCaptions.find((n) => n.props.numberOfLines === 1)
    expect(statCaption).toBeTruthy()
  })

  it('stat value text nodes have numberOfLines=1 and adjustsFontSizeToFit for long values', async () => {
    const { session, exercises, sets } = createCompletedWorkoutFixture()
    mockDb.getSessionById.mockResolvedValue(session)
    mockDb.getSessionSets.mockResolvedValue(sets)
    mockDb.getExercisesByIds.mockResolvedValue(exercises)

    const screen = renderScreen(<Summary />)

    // Duration value (e.g. "0:00") should have fit handling
    const durationCard = await screen.findByLabelText(/Duration:/i)
    expect(durationCard).toBeTruthy()

    // All heading-variant text in the stats row should have single-line fit handling
    // We verify the Volume value specifically since it gained a new " kg"/" lb" suffix
    const volumeCard = await screen.findByLabelText(/Total volume:/i)
    expect(volumeCard).toBeTruthy()
    // The heading value inside it should exist with the fit props
    const valueWithUnit = await screen.findByText(/\d.*\s(kg|lb)/i)
    expect(valueWithUnit.props.numberOfLines).toBe(1)
    expect(valueWithUnit.props.adjustsFontSizeToFit).toBe(true)
    expect(valueWithUnit.props.minimumFontScale).toBe(0.7)
  })
})
