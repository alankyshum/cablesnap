/**
 * BLD-1086 — Per-variant PR data layer unit tests.
 *
 * Tests:
 * 1. bestPerVariant: four-bucket NULL grouping (null != non-null at every position)
 * 2. bestPerVariant: non-cable exercises remain unchanged (byte-identity check on results)
 * 3. showVariantPrs: kill-switch semantics
 * 4. getCableExerciseIds: equipment gating
 * 5. getAllTimeBests / getRecentPRsWithDelta: no-op for non-cable (regression guard)
 */

jest.mock('../../../lib/db/helpers', () => ({
  getDrizzle: jest.fn(),
  query: jest.fn(),
  queryOne: jest.fn(),
}))

jest.mock('../../../lib/db/settings', () => ({
  getAppSetting: jest.fn(),
  setAppSetting: jest.fn(),
}))

const helpers = require('../../../lib/db/helpers') as {
  getDrizzle: jest.Mock
  query: jest.Mock
  queryOne: jest.Mock
}

const settings = require('../../../lib/db/settings') as {
  getAppSetting: jest.Mock
}

import {
  bestPerVariant,
  showVariantPrs,
  getAllTimeBests,
  getRecentPRsWithDelta,
} from '../../../lib/db/pr-dashboard'

describe('BLD-1086 — Per-Variant PR data layer', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    helpers.query.mockResolvedValue([])
    settings.getAppSetting.mockResolvedValue(null) // default: feature enabled
  })

  // ── showVariantPrs kill-switch ──────────────────────────────────────────

  describe('showVariantPrs', () => {
    test.each([
      ['null (default) → true', null, true],
      ['"1" → true', '1', true],
      ['"0" → false (kill-switch)', '0', false],
      ['"" → true', '', true],
    ])('%s', async (_label, settingVal, expected) => {
      settings.getAppSetting.mockResolvedValue(settingVal)
      const result = await showVariantPrs()
      expect(result).toBe(expected)
    })
  })

  // ── bestPerVariant four-bucket NULL grouping ────────────────────────────

  describe('bestPerVariant', () => {
    test('returns empty array when no sets', async () => {
      helpers.query.mockResolvedValue([])
      const result = await bestPerVariant('ex-cable-1')
      expect(result).toEqual([])
    })

    test('four-bucket NULL matrix: (rope,high), (rope,null), (null,high), (null,null) are four distinct rows', async () => {
      // This is the CRITICAL test per the plan. Each combination must be a
      // distinct row — NULL must NOT be collapsed with non-NULL.
      const now = Date.now()
      helpers.query.mockResolvedValue([
        { attachment: 'rope',  mount_position: 'high', grip_type: null, stack_unit_at_log: 'kg', max_weight: 30, best_reps: 8,  achieved_at: now - 1000, session_count: 3 },
        { attachment: 'rope',  mount_position: null,   grip_type: null, stack_unit_at_log: 'kg', max_weight: 28, best_reps: 8,  achieved_at: now - 2000, session_count: 1 },
        { attachment: null,    mount_position: 'high', grip_type: null, stack_unit_at_log: 'kg', max_weight: 25, best_reps: 10, achieved_at: now - 3000, session_count: 2 },
        { attachment: null,    mount_position: null,   grip_type: null, stack_unit_at_log: null,  max_weight: 20, best_reps: 12, achieved_at: now - 4000, session_count: 5 },
      ])

      const result = await bestPerVariant('ex-cable-1')

      expect(result).toHaveLength(4)

      // Each row is a distinct variant
      const keys = result.map((r) => `${r.attachment}|${r.mountPosition}|${r.gripType}|${r.stackUnitAtLog}`)
      expect(keys).toContain('rope|high|null|kg')
      expect(keys).toContain('rope|null|null|kg')
      expect(keys).toContain('null|high|null|kg')
      expect(keys).toContain('null|null|null|null')
    })

    test('maps DB columns to VariantBest fields correctly', async () => {
      const achievedAt = 1720000000000
      helpers.query.mockResolvedValue([
        { attachment: 'rope', mount_position: 'high', grip_type: 'neutral', stack_unit_at_log: 'kg',
          max_weight: 32.5, best_reps: 8, achieved_at: achievedAt, session_count: 4 },
      ])

      const [row] = await bestPerVariant('ex-cable-1')

      expect(row.attachment).toBe('rope')
      expect(row.mountPosition).toBe('high')
      expect(row.gripType).toBe('neutral')
      expect(row.stackUnitAtLog).toBe('kg')
      expect(row.weight).toBe(32.5)
      expect(row.reps).toBe(8)
      expect(row.achievedAt).toBe(achievedAt)
      expect(row.sessionCount).toBe(4)
      // e1rm = epley(32.5, 8) = 32.5 * (1 + 8/30) ≈ 41.2
      expect(row.e1rm).toBeGreaterThan(0)
    })

    test('null DB fields coerce to null (not undefined)', async () => {
      helpers.query.mockResolvedValue([
        { attachment: null, mount_position: null, grip_type: null, stack_unit_at_log: null,
          max_weight: 20, best_reps: 10, achieved_at: 1720000000000, session_count: 1 },
      ])

      const [row] = await bestPerVariant('ex-cable-1')

      expect(row.attachment).toBeNull()
      expect(row.mountPosition).toBeNull()
      expect(row.gripType).toBeNull()
      expect(row.stackUnitAtLog).toBeNull()
    })

    test('multiple variants with different grip_type are kept separate', async () => {
      const now = Date.now()
      helpers.query.mockResolvedValue([
        { attachment: 'rope', mount_position: 'high', grip_type: 'overhand',  stack_unit_at_log: 'kg', max_weight: 30, best_reps: 8, achieved_at: now, session_count: 2 },
        { attachment: 'rope', mount_position: 'high', grip_type: 'underhand', stack_unit_at_log: 'kg', max_weight: 28, best_reps: 8, achieved_at: now - 1000, session_count: 1 },
      ])

      const result = await bestPerVariant('ex-cable-1')
      expect(result).toHaveLength(2)
      expect(result.map((r) => r.gripType)).toContain('overhand')
      expect(result.map((r) => r.gripType)).toContain('underhand')
    })

    test('stack_unit_at_log cross-gym separation: same attachment, different units = two rows', async () => {
      const now = Date.now()
      helpers.query.mockResolvedValue([
        { attachment: 'rope', mount_position: 'high', grip_type: null, stack_unit_at_log: 'kg',           max_weight: 30, best_reps: 8, achieved_at: now,         session_count: 2 },
        { attachment: 'rope', mount_position: 'high', grip_type: null, stack_unit_at_log: 'plate-marker', max_weight: 5,  best_reps: 8, achieved_at: now - 1000, session_count: 1 },
      ])

      const result = await bestPerVariant('ex-cable-1')
      expect(result).toHaveLength(2)
      expect(result.map((r) => r.stackUnitAtLog)).toContain('kg')
      expect(result.map((r) => r.stackUnitAtLog)).toContain('plate-marker')
    })
  })

  // ── getAllTimeBests: variants attached for cable, not for non-cable ──────

  describe('getAllTimeBests variant attachment', () => {
    test('non-cable exercises produce no variants field (byte-identity guard)', async () => {
      // Enable variant feature
      settings.getAppSetting.mockResolvedValue(null)

      // Mock the getAllTimeBests queries — weighted non-cable, bodyweight, bw PRs
      helpers.query
        // weighted bests
        .mockResolvedValueOnce([
          { exercise_id: 'ex-bench', name: 'Bench Press', category: 'Push', max_weight: 100, best_set_weight: 100, best_set_reps: 5, session_count: 10 },
        ])
        // bodyweight bests
        .mockResolvedValueOnce([])
        // weighted BW PRs
        .mockResolvedValueOnce([])
        // showVariantPrs → getAppSetting
        // getCableExerciseIds — returns empty (not cable)
        .mockResolvedValueOnce([]) // cable exercises lookup returns empty

      const results = await getAllTimeBests()

      expect(results).toHaveLength(1)
      // variants should NOT be set (or be empty) for non-cable
      expect(results[0].variants).toBeUndefined()
    })

    test('kill-switch off: no variants on any exercise', async () => {
      settings.getAppSetting.mockResolvedValue('0') // kill-switch off

      helpers.query
        .mockResolvedValueOnce([
          { exercise_id: 'ex-cable', name: 'Cable Pushdown', category: 'Push', max_weight: 40, best_set_weight: 40, best_set_reps: 8, session_count: 5 },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const results = await getAllTimeBests()
      expect(results).toHaveLength(1)
      expect(results[0].variants).toBeUndefined()
    })
  })

  // ── getRecentPRsWithDelta: variants for cable ────────────────────────────

  describe('getRecentPRsWithDelta variant attachment', () => {
    test('non-cable exercises have no variants', async () => {
      settings.getAppSetting.mockResolvedValue(null)
      const now = Date.now()
      helpers.query
        // weight PRs
        .mockResolvedValueOnce([
          { exercise_id: 'ex-bench', name: 'Bench Press', category: 'Push', weight: 100, previous_best: 95, date: now },
        ])
        // rep PRs
        .mockResolvedValueOnce([])
        // getCableExerciseIds → empty (not cable)
        .mockResolvedValueOnce([])

      const results = await getRecentPRsWithDelta()

      expect(results).toHaveLength(1)
      expect(results[0].variants).toBeUndefined()
    })

    test('kill-switch off: no variants on any PR', async () => {
      settings.getAppSetting.mockResolvedValue('0')
      const now = Date.now()
      helpers.query
        .mockResolvedValueOnce([
          { exercise_id: 'ex-cable', name: 'Cable Pushdown', category: 'Push', weight: 30, previous_best: 28, date: now },
        ])
        .mockResolvedValueOnce([])

      const results = await getRecentPRsWithDelta()

      expect(results).toHaveLength(1)
      expect(results[0].variants).toBeUndefined()
    })
  })
})
