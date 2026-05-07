/**
 * PR Dashboard data layer tests.
 *
 * Tests getPRStats, getRecentPRsWithDelta, getAllTimeBests using mocked DB helpers.
 * Uses test.each for budget-efficient parameterized assertions.
 */

jest.mock('../../../lib/db/helpers', () => ({
  getDrizzle: jest.fn(),
  query: jest.fn(),
  queryOne: jest.fn(),
}))

// BLD-1086: showVariantPrs() calls getAppSetting which uses getDrizzle — mock to return "0" (variant off) by default
jest.mock('../../../lib/db/settings', () => ({
  getAppSetting: jest.fn().mockResolvedValue('0'),
}))

const helpers = require('../../../lib/db/helpers') as {
  getDrizzle: jest.Mock
  query: jest.Mock
  queryOne: jest.Mock
}

import { getPRStats, getRecentPRsWithDelta, getAllTimeBests } from '../../../lib/db/pr-dashboard'

describe('PR Dashboard Data Layer', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    helpers.query.mockResolvedValue([])
  })

  // ── getPRStats ──────────────────────────────────────────────────

  test('getPRStats aggregates weight + rep PRs', async () => {
    const cases: [string, unknown[], unknown[], { totalPRs: number; prsThisMonth: number }][] = [
      [
        'no data returns zeros',
        [{ total: 0, this_month: 0 }],
        [{ total: 0, this_month: 0 }],
        { totalPRs: 0, prsThisMonth: 0 },
      ],
      [
        'weight PRs only',
        [{ total: 5, this_month: 2 }],
        [{ total: 0, this_month: 0 }],
        { totalPRs: 5, prsThisMonth: 2 },
      ],
      [
        'rep PRs only (bodyweight exercises)',
        [{ total: 0, this_month: 0 }],
        [{ total: 3, this_month: 1 }],
        { totalPRs: 3, prsThisMonth: 1 },
      ],
      [
        'combined weight + rep PRs',
        [{ total: 5, this_month: 2 }],
        [{ total: 3, this_month: 1 }],
        { totalPRs: 8, prsThisMonth: 3 },
      ],
      [
        'null this_month treated as zero',
        [{ total: 2, this_month: null }],
        [{ total: 1, this_month: null }],
        { totalPRs: 3, prsThisMonth: 0 },
      ],
    ]

    for (const [name, weightResult, repResult, expected] of cases) {
      jest.clearAllMocks()
      helpers.query.mockResolvedValue([])
      helpers.query
        .mockResolvedValueOnce(weightResult)
        .mockResolvedValueOnce(repResult)

      const result = await getPRStats()
      try {
        expect(result).toEqual(expected)
        expect(helpers.query).toHaveBeenCalledTimes(2)
      } catch (err) {
        throw new Error(`Case "${name}" failed: ${(err as Error).message}`)
      }
    }
  })

  // ── getRecentPRsWithDelta ───────────────────────────────────────

  test('getRecentPRsWithDelta merges weight + rep PRs sorted by date', async () => {
    const now = Date.now()
    const earlier = now - 86400000

    helpers.query
      .mockResolvedValueOnce([
        { exercise_id: 'ex1', name: 'Bench Press', category: 'Push', weight: 100, previous_best: 95, date: now },
      ])
      .mockResolvedValueOnce([
        { exercise_id: 'ex2', name: 'Pull-ups', category: 'Pull', reps: 12, previous_best: 10, date: earlier },
      ])

    const result = await getRecentPRsWithDelta(20)

    expect(result).toHaveLength(2)
    // Most recent first (weight PR)
    expect(result[0]).toMatchObject({
      exercise_id: 'ex1',
      name: 'Bench Press',
      is_weighted: true,
      weight: 100,
      previous_best: 95,
    })
    // Older (rep PR)
    expect(result[1]).toMatchObject({
      exercise_id: 'ex2',
      name: 'Pull-ups',
      is_weighted: false,
      reps: 12,
      previous_best: 10,
    })
  })

  test('getRecentPRsWithDelta respects limit', async () => {
    const now = Date.now()
    helpers.query
      .mockResolvedValueOnce([
        { exercise_id: 'ex1', name: 'Bench', category: 'Push', weight: 100, previous_best: 95, date: now },
        { exercise_id: 'ex2', name: 'Squat', category: 'Legs', weight: 140, previous_best: 135, date: now - 1000 },
        { exercise_id: 'ex3', name: 'OHP', category: 'Push', weight: 60, previous_best: 55, date: now - 2000 },
      ])
      .mockResolvedValueOnce([])

    const result = await getRecentPRsWithDelta(2)
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('Bench')
    expect(result[1].name).toBe('Squat')
  })

  test('getRecentPRsWithDelta returns empty when no PRs', async () => {
    helpers.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const result = await getRecentPRsWithDelta()
    expect(result).toEqual([])
  })

  // ── getAllTimeBests ──────────────────────────────────────────────

  test('getAllTimeBests computes e1RM from best single set', async () => {
    helpers.query
      .mockResolvedValueOnce([
        {
          exercise_id: 'ex1',
          name: 'Bench Press',
          category: 'Push',
          max_weight: 100,
          best_set_weight: 90,
          best_set_reps: 5,
          session_count: 10,
        },
      ])
      .mockResolvedValueOnce([]) // no bodyweight

    const result = await getAllTimeBests()
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      exercise_id: 'ex1',
      name: 'Bench Press',
      category: 'Push',
      max_weight: 100,
      is_weighted: true,
      session_count: 10,
    })
    // e1RM from epley(90, 5) = 90 * (1 + 5/30) = 90 * 1.1667 = 105
    expect(result[0].est_1rm).toBeCloseTo(105, 0)
  })

  test('getAllTimeBests includes bodyweight exercises', async () => {
    helpers.query
      .mockResolvedValueOnce([]) // no weighted
      .mockResolvedValueOnce([
        {
          exercise_id: 'ex2',
          name: 'Pull-ups',
          category: 'Pull',
          max_reps: 15,
          session_count: 8,
        },
      ])

    const result = await getAllTimeBests()
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      exercise_id: 'ex2',
      name: 'Pull-ups',
      is_weighted: false,
      max_reps: 15,
      est_1rm: null,
    })
  })

  test('getAllTimeBests groups weighted and bodyweight, sorted by category', async () => {
    helpers.query
      .mockResolvedValueOnce([
        { exercise_id: 'ex1', name: 'Bench Press', category: 'Push', max_weight: 100, best_set_weight: 90, best_set_reps: 5, session_count: 10 },
        { exercise_id: 'ex3', name: 'Squat', category: 'Legs', max_weight: 140, best_set_weight: 120, best_set_reps: 3, session_count: 15 },
      ])
      .mockResolvedValueOnce([
        { exercise_id: 'ex2', name: 'Pull-ups', category: 'Pull', max_reps: 15, session_count: 8 },
      ])

    const result = await getAllTimeBests()
    expect(result).toHaveLength(3)
    // Sorted by category: Legs, Pull, Push
    expect(result[0].category).toBe('Legs')
    expect(result[1].category).toBe('Pull')
    expect(result[2].category).toBe('Push')
  })

  test('getAllTimeBests skips bodyweight exercise if it appears in weighted results', async () => {
    // Same exercise_id in both weighted and bodyweight queries
    helpers.query
      .mockResolvedValueOnce([
        { exercise_id: 'ex1', name: 'Dips', category: 'Push', max_weight: 20, best_set_weight: 20, best_set_reps: 8, session_count: 5 },
      ])
      .mockResolvedValueOnce([
        { exercise_id: 'ex1', name: 'Dips', category: 'Push', max_reps: 15, session_count: 5 },
      ])

    const result = await getAllTimeBests()
    // Should only appear once as weighted
    expect(result).toHaveLength(1)
    expect(result[0].is_weighted).toBe(true)
  })

  test('getAllTimeBests returns empty for no data', async () => {
    helpers.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const result = await getAllTimeBests()
    expect(result).toEqual([])
  })
})

// ── BLD-1086: Variant PR tests ──────────────────────────────────────────────

describe('BLD-1086 Variant PRs', () => {
  const settingsMock = require('../../../lib/db/settings') as { getAppSetting: jest.Mock }

  beforeEach(() => {
    jest.clearAllMocks()
    helpers.query.mockResolvedValue([])
    // Enable variant PRs by default in this suite
    settingsMock.getAppSetting.mockResolvedValue(null)
  })

  test('getRecentPRsWithDelta: kill-switch (show_variant_prs=0) falls back to exercise-level queries only', async () => {
    settingsMock.getAppSetting.mockResolvedValue('0')

    const now = Date.now()
    helpers.query
      .mockResolvedValueOnce([
        { exercise_id: 'ex1', name: 'Cable Fly', category: 'Push', weight: 50, previous_best: 45, date: now },
      ])
      .mockResolvedValueOnce([])

    const result = await getRecentPRsWithDelta(20)
    // Should make only 2 queries (weighted + rep), no cable variant query
    expect(helpers.query).toHaveBeenCalledTimes(2)
    expect(result).toHaveLength(1)
    expect(result[0].exercise_id).toBe('ex1')
    // No variants on kill-switch path
    expect(result[0].variants).toBeUndefined()
  })

  test('getRecentPRsWithDelta: variant mode makes 3 queries (non-cable weight, cable variant, rep)', async () => {
    const now = Date.now()
    helpers.query
      .mockResolvedValueOnce([
        // Non-cable weight PR
        { exercise_id: 'ex-bench', name: 'Bench Press', category: 'Push', weight: 100, previous_best: 95, date: now },
      ])
      .mockResolvedValueOnce([
        // Cable variant PR (2nd query)
        {
          exercise_id: 'ex-cable',
          name: 'Cable Fly',
          category: 'Push',
          weight: 50,
          previous_best: 45,
          date: now - 1000,
          attachment: 'rope',
          mount_position: 'high',
          grip_type: null,
          stack_unit_at_log: null,
        },
      ])
      .mockResolvedValueOnce([])  // rep PRs

    const result = await getRecentPRsWithDelta(20)
    expect(helpers.query).toHaveBeenCalledTimes(3)
    expect(result).toHaveLength(2)
    // Cable variant PR is second (older)
    const cablePR = result.find((r) => r.exercise_id === 'ex-cable')
    expect(cablePR).toBeDefined()
    expect(cablePR?.variants).toBeDefined()
    expect(cablePR?.variants).toHaveLength(1)
    expect(cablePR?.variants?.[0].attachment).toBe('rope')
    expect(cablePR?.variants?.[0].mountPosition).toBe('high')
  })

  test('getRecentPRsWithDelta: cable PR with all-null variant has variants array with null fields', async () => {
    const now = Date.now()
    helpers.query
      .mockResolvedValueOnce([])  // non-cable weight
      .mockResolvedValueOnce([
        {
          exercise_id: 'ex-cable',
          name: 'Cable Row',
          category: 'Pull',
          weight: 80,
          previous_best: 75,
          date: now,
          attachment: null,
          mount_position: null,
          grip_type: null,
          stack_unit_at_log: null,
        },
      ])
      .mockResolvedValueOnce([])  // rep PRs

    const result = await getRecentPRsWithDelta(20)
    expect(result).toHaveLength(1)
    const v = result[0].variants?.[0]
    expect(v?.attachment).toBeNull()
    expect(v?.mountPosition).toBeNull()
    expect(v?.gripType).toBeNull()
    expect(v?.stackUnitAtLog).toBeNull()
  })

  test('getAllTimeBests: cable exercises get variants attached when variant mode enabled', async () => {
    const benchId = 'ex-bench'
    const cableId = 'ex-cable'

    helpers.query
      .mockResolvedValueOnce([
        { exercise_id: benchId, name: 'Bench Press', category: 'Push', max_weight: 100, best_set_weight: 100, best_set_reps: 5, session_count: 10 },
        { exercise_id: cableId, name: 'Cable Fly', category: 'Push', max_weight: 50, best_set_weight: 50, best_set_reps: 12, session_count: 5 },
      ])
      .mockResolvedValueOnce([])  // bodyweight
      .mockResolvedValueOnce([])  // getWeightedBodyweightPRs
      .mockResolvedValueOnce([{ id: cableId }])  // getCableExerciseIds returns cable exercise (rows with {id})
      .mockResolvedValueOnce([
        // bestPerVariant results for cable exercise
        { attachment: 'rope', mount_position: 'high', grip_type: null, stack_unit_at_log: null, max_weight: 50, best_reps: 12, achieved_at: 1700000000000, session_count: 3 },
        { attachment: 'bar', mount_position: 'low', grip_type: null, stack_unit_at_log: null, max_weight: 45, best_reps: 15, achieved_at: 1699999999000, session_count: 2 },
      ])

    const result = await getAllTimeBests()
    const cable = result.find((r) => r.exercise_id === cableId)
    expect(cable?.variants).toBeDefined()
    expect(cable?.variants).toHaveLength(2)
    expect(cable?.variants?.[0].attachment).toBe('rope')

    // Non-cable exercise should have no variants
    const bench = result.find((r) => r.exercise_id === benchId)
    expect(bench?.variants).toBeUndefined()
  })
})
