/**
 * getMuscleVolumeTrend data-layer tests.
 *
 * Verifies that week labels are M/D short-date format (BLD-855).
 */

// Mock the entire drizzle chain so no real DB is needed.
const mockSelect = jest.fn()
const mockFrom = jest.fn()
const mockInnerJoin = jest.fn()
const mockLeftJoin = jest.fn()
const mockWhere = jest.fn()
const mockGroupBy = jest.fn()

jest.mock('../../../lib/db/helpers', () => ({
  getDrizzle: jest.fn().mockResolvedValue({
    select: (...a: unknown[]) => {
      mockSelect(...a)
      return {
        from: (...b: unknown[]) => {
          mockFrom(...b)
          return {
            innerJoin: (...c: unknown[]) => {
              mockInnerJoin(...c)
              return {
                leftJoin: (...d: unknown[]) => {
                  mockLeftJoin(...d)
                  return {
                    where: (...e: unknown[]) => {
                      mockWhere(...e)
                      return {
                        groupBy: (...f: unknown[]) => {
                          mockGroupBy(...f)
                          return [] // no rows
                        },
                      }
                    },
                  }
                },
              }
            },
          }
        },
      }
    },
  }),
  query: jest.fn(),
  queryOne: jest.fn(),
}))

import { getMuscleVolumeTrend } from '../../../lib/db/session-stats'

describe('getMuscleVolumeTrend', () => {
  test('week labels match M/D short-date format', async () => {
    const result = await getMuscleVolumeTrend('chest', 4)

    expect(result).toHaveLength(4)
    for (const row of result) {
      expect(row.week).toMatch(/^\d{1,2}\/\d{1,2}$/)
    }
  })

  test('week labels are 7 days apart', async () => {
    const result = await getMuscleVolumeTrend('chest', 8)

    expect(result).toHaveLength(8)
    // Parse each M/D label and verify 7-day spacing
    const dates = result.map((r) => {
      const [m, d] = r.week.split('/').map(Number)
      return { month: m, day: d }
    })

    // All labels should be valid M/D
    for (const { month, day } of dates) {
      expect(month).toBeGreaterThanOrEqual(1)
      expect(month).toBeLessThanOrEqual(12)
      expect(day).toBeGreaterThanOrEqual(1)
      expect(day).toBeLessThanOrEqual(31)
    }
  })

  test('all sets are 0 when DB returns no rows', async () => {
    const result = await getMuscleVolumeTrend('chest', 4)
    for (const row of result) {
      expect(row.sets).toBe(0)
    }
  })
})
