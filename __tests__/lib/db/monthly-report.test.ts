import { computeLongestDailyStreak } from '../../../lib/format'

jest.mock('../../../lib/db/helpers', () => ({
  getDrizzle: jest.fn(),
  query: jest.fn(),
  queryOne: jest.fn(),
}))

const muscleResults: unknown[] = []

const mockDrizzle = {
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  leftJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  groupBy: jest.fn(() => {
    const p = Promise.resolve(muscleResults) as Promise<unknown[]> & {
      select: jest.Mock; from: jest.Mock; innerJoin: jest.Mock;
      leftJoin: jest.Mock; where: jest.Mock; groupBy: jest.Mock;
      orderBy: jest.Mock; limit: jest.Mock; get: jest.Mock; all: jest.Mock;
    }
    Object.assign(p, mockDrizzle)
    return p
  }),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  get: jest.fn().mockResolvedValue(null),
  all: jest.fn().mockResolvedValue([]),
}

jest.mock('../../../lib/db/helpers', () => ({
  getDrizzle: jest.fn().mockResolvedValue(mockDrizzle),
  query: jest.fn().mockResolvedValue([]),
  queryOne: jest.fn().mockResolvedValue(null),
}))

jest.mock('../../../lib/db/schema', () => ({
  workoutSessions: { id: 'id', started_at: 'started_at', completed_at: 'completed_at', duration_seconds: 'duration_seconds' },
  workoutSets: { id: 'id', session_id: 'session_id', exercise_id: 'exercise_id', weight: 'weight', reps: 'reps', completed: 'completed', set_type: 'set_type' },
  exercises: { id: 'id', name: 'name', primary_muscles: 'primary_muscles' },
  dailyLog: { id: 'id', food_entry_id: 'food_entry_id', date: 'date', servings: 'servings' },
  foodEntries: { id: 'id', calories: 'calories' },
  macroTargets: { calories: 'calories' },
  bodyWeight: { id: 'id', weight: 'weight', date: 'date' },
}))

const helpers = require('../../../lib/db/helpers') as {
  getDrizzle: jest.Mock
  query: jest.Mock
  queryOne: jest.Mock
}

import { getMonthlyReport } from '../../../lib/db/monthly-report'

describe('Monthly Report Data Layer', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    helpers.getDrizzle.mockResolvedValue(mockDrizzle)
    helpers.query.mockResolvedValue([])
    mockDrizzle.get.mockResolvedValue(null)
    mockDrizzle.all.mockResolvedValue([])
  })

  test('monthly session count reflects DB result', async () => {
    const cases: [string, { count: number; total_duration: number }, number][] = [
      ['empty month returns zero session count', { count: 0, total_duration: 0 }, 0],
      ['month with sessions returns correct count', { count: 5, total_duration: 9000 }, 5],
    ]
    for (const [name, sessionResult, expectedCount] of cases) {
      jest.clearAllMocks()
      helpers.getDrizzle.mockResolvedValue(mockDrizzle)
      helpers.query.mockResolvedValue([])
      mockDrizzle.all.mockResolvedValue([])
      mockDrizzle.get
        .mockResolvedValueOnce(sessionResult) // sessions
        .mockResolvedValueOnce({ volume: 0 }) // volume
        .mockResolvedValueOnce({ count: 0 }) // prev sessions
        .mockResolvedValueOnce({ volume: 0 }) // prev volume
        .mockResolvedValueOnce(null) // macro targets (nutrition)

      const result = await getMonthlyReport(2026, 3) // April 2026
      try {
        expect(result.workouts.sessionCount).toBe(expectedCount)
        expect(result.prs).toEqual([])
        expect(result.nutrition).toBeNull()
      } catch (err) {
        throw new Error(`Case "${name}" failed: ${(err as Error).message}`)
      }
    }
  })

  it('computes volume and previous month delta', async () => {
    mockDrizzle.get
      .mockResolvedValueOnce({ count: 4, total_duration: 7200 })
      .mockResolvedValueOnce({ volume: 50000 })
      .mockResolvedValueOnce({ count: 3 })
      .mockResolvedValueOnce({ volume: 40000 })
      .mockResolvedValueOnce(null) // macro targets

    const result = await getMonthlyReport(2026, 3)
    expect(result.workouts.totalVolume).toBe(50000)
    expect(result.workouts.previousMonthVolume).toBe(40000)
    expect(result.workouts.previousMonthSessionCount).toBe(3)
  })

  it('returns PRs when max weight exceeds prior', async () => {
    mockDrizzle.get
      .mockResolvedValueOnce({ count: 3, total_duration: 5400 })
      .mockResolvedValueOnce({ volume: 30000 })
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ volume: 25000 })
      .mockResolvedValueOnce(null) // macro targets

    helpers.query
      // PRs query
      .mockResolvedValueOnce([
        { exercise_id: 'ex1', name: 'Bench Press', month_max: 100, prior_max: 95 },
        { exercise_id: 'ex2', name: 'Squat', month_max: 140, prior_max: null },
      ])
      // Training days query
      .mockResolvedValueOnce([{ d: '2026-04-01' }, { d: '2026-04-03' }])
      // Most improved query
      .mockResolvedValueOnce([])

    const result = await getMonthlyReport(2026, 3)
    expect(result.prs).toHaveLength(2)
    expect(result.prs[0].exerciseName).toBe('Bench Press')
    expect(result.prs[0].weight).toBe(100)
    expect(result.trainingDays).toBe(2)
  })

  it('returns body and nutrition as null when no data', async () => {
    mockDrizzle.get
      .mockResolvedValueOnce({ count: 3, total_duration: 5400 })
      .mockResolvedValueOnce({ volume: 20000 })
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ volume: 18000 })
      .mockResolvedValueOnce(null) // no macro targets

    helpers.query
      .mockResolvedValueOnce([]) // PRs
      .mockResolvedValueOnce([{ d: '2026-04-01' }]) // training days
      .mockResolvedValueOnce([]) // most improved

    const result = await getMonthlyReport(2026, 3)
    expect(result.body).toBeNull()
    expect(result.nutrition).toBeNull()
    expect(result.trainingDays).toBe(1)
    expect(result.longestStreak).toBe(1)
  })

  it('computes training days and longest streak from distinct dates', async () => {
    mockDrizzle.get
      .mockResolvedValueOnce({ count: 5, total_duration: 9000 })
      .mockResolvedValueOnce({ volume: 30000 })
      .mockResolvedValueOnce({ count: 3 })
      .mockResolvedValueOnce({ volume: 25000 })
      .mockResolvedValueOnce(null) // no macro targets

    helpers.query
      .mockResolvedValueOnce([]) // PRs
      .mockResolvedValueOnce([
        { d: '2026-04-01' }, { d: '2026-04-02' }, { d: '2026-04-03' },
        { d: '2026-04-05' }, { d: '2026-04-06' },
      ]) // training days — streak of 3 then 2
      .mockResolvedValueOnce([]) // most improved

    const result = await getMonthlyReport(2026, 3)
    expect(result.trainingDays).toBe(5)
    expect(result.longestStreak).toBe(3)
  })
})

describe('computeLongestDailyStreak', () => {
  it('returns 0 for empty array', () => {
    expect(computeLongestDailyStreak([])).toBe(0)
  })

  it('returns 1 for single date', () => {
    expect(computeLongestDailyStreak(['2026-04-01'])).toBe(1)
  })

  it('computes longest consecutive run', () => {
    expect(computeLongestDailyStreak([
      '2026-04-01', '2026-04-02', '2026-04-03',
      '2026-04-05', '2026-04-06',
    ])).toBe(3)
  })
})
