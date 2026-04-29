/**
 * BLD-788: variant scope filter — data-layer tests.
 *
 * Covers `buildVariantSql` (pure function — exercises every undefined / null /
 * value branch on both dimensions) and `getVariantSetCount` (mocked
 * `queryOne`). Behavioral integration of the filter inside `getExerciseRecords`
 * is covered indirectly through `buildVariantSql`'s SQL output — every
 * variant-aware code path consumes the same fragment.
 */

jest.mock('../../../lib/db/helpers', () => ({
  getDrizzle: jest.fn(),
  query: jest.fn(),
  queryOne: jest.fn(),
}));

const helpers = require('../../../lib/db/helpers') as {
  getDrizzle: jest.Mock;
  query: jest.Mock;
  queryOne: jest.Mock;
};

import { buildVariantSql, getVariantSetCount } from '../../../lib/db/exercise-history';
import type { VariantScope } from '../../../lib/db/exercise-history';

describe('BLD-788 variant scope filter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── buildVariantSql ─────────────────────────────────────────────

  describe('buildVariantSql', () => {
    test.each<[string, VariantScope | undefined, string, (string | null)[]]>([
      ['undefined scope → empty fragment', undefined, '', []],
      ['empty object → empty fragment', {}, '', []],
      [
        'attachment value only → AND ws.attachment = ?',
        { attachment: 'rope' },
        ' AND ws.attachment = ?',
        ['rope'],
      ],
      [
        'attachment NULL → AND ws.attachment IS NULL',
        { attachment: null },
        ' AND ws.attachment IS NULL',
        [],
      ],
      [
        'mount value only → AND ws.mount_position = ?',
        { mount_position: 'high' },
        ' AND ws.mount_position = ?',
        ['high'],
      ],
      [
        'mount NULL → AND ws.mount_position IS NULL',
        { mount_position: null },
        ' AND ws.mount_position IS NULL',
        [],
      ],
      [
        'both values → both ANDed in declaration order',
        { attachment: 'rope', mount_position: 'high' },
        ' AND ws.attachment = ? AND ws.mount_position = ?',
        ['rope', 'high'],
      ],
      [
        'attachment value + mount NULL → mixed predicate',
        { attachment: 'bar', mount_position: null },
        ' AND ws.attachment = ? AND ws.mount_position IS NULL',
        ['bar'],
      ],
      [
        'attachment NULL + mount value → mixed predicate',
        { attachment: null, mount_position: 'low' },
        ' AND ws.attachment IS NULL AND ws.mount_position = ?',
        ['low'],
      ],
    ])('%s', (_label, scope, expectedSql, expectedParams) => {
      const result = buildVariantSql(scope);
      expect(result.sql).toBe(expectedSql);
      expect(result.params).toEqual(expectedParams);
    });

    test('explicit-undefined dimension is treated as no filter', () => {
      const result = buildVariantSql({ attachment: undefined, mount_position: undefined });
      expect(result.sql).toBe('');
      expect(result.params).toEqual([]);
    });
  });

  // ── getVariantSetCount ──────────────────────────────────────────

  describe('getVariantSetCount', () => {
    test('returns row count when present', async () => {
      helpers.queryOne.mockResolvedValueOnce({ n: 12 });
      const n = await getVariantSetCount('ex-123');
      expect(n).toBe(12);
    });

    test('returns 0 when query returns null/undefined', async () => {
      helpers.queryOne.mockResolvedValueOnce(undefined);
      expect(await getVariantSetCount('ex-1')).toBe(0);
    });

    test('returns 0 when n is null', async () => {
      helpers.queryOne.mockResolvedValueOnce({ n: null });
      expect(await getVariantSetCount('ex-1')).toBe(0);
    });

    test('coerces string-numeric SQL output via Number()', async () => {
      helpers.queryOne.mockResolvedValueOnce({ n: '7' as unknown as number });
      expect(await getVariantSetCount('ex-1')).toBe(7);
    });

    test('SQL gates on completed=1, non-warmup, completed_at NOT NULL', async () => {
      helpers.queryOne.mockResolvedValueOnce({ n: 0 });
      await getVariantSetCount('ex-xyz');
      const call = helpers.queryOne.mock.calls[0];
      const sql = call[0] as string;
      const params = call[1] as unknown[];
      expect(sql).toMatch(/ws\.completed\s*=\s*1/);
      expect(sql).toMatch(/ws\.set_type\s*!=\s*'warmup'/);
      expect(sql).toMatch(/wss\.completed_at\s+IS\s+NOT\s+NULL/);
      expect(sql).toMatch(/ws\.attachment\s+IS\s+NOT\s+NULL\s+OR\s+ws\.mount_position\s+IS\s+NOT\s+NULL/);
      expect(params).toEqual(['ex-xyz']);
    });
  });
});
