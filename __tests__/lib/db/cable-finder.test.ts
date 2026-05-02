/**
 * Cable Finder data layer tests (BLD-875).
 *
 * Tests getCableExercises and getAvailableAttachments using mocked DB helpers.
 * Uses test.each for budget-efficient parameterized assertions.
 */

jest.mock('../../../lib/db/helpers', () => ({
  getDrizzle: jest.fn(),
  query: jest.fn(),
  queryOne: jest.fn(),
}));

const helpers = require('../../../lib/db/helpers') as {
  query: jest.Mock;
};

import { getCableExercises, getAvailableAttachments } from '../../../lib/db/cable-finder';

const makeCableRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'ex-1',
  name: 'Cable Curl',
  category: 'arms',
  primary_muscles: '["biceps"]',
  secondary_muscles: '["forearms"]',
  equipment: 'cable',
  instructions: 'Curl the cable',
  difficulty: 'beginner',
  is_custom: 0,
  deleted_at: null,
  mount_position: 'low',
  attachment: 'handle',
  training_modes: null,
  is_voltra: 0,
  start_image_uri: null,
  end_image_uri: null,
  progression_group: null,
  progression_order: null,
  ...overrides,
});

describe('Cable Finder Data Layer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    helpers.query.mockResolvedValue([]);
  });

  test('getCableExercises maps rows and verifies SQL targets cable equipment', async () => {
    helpers.query.mockResolvedValue([
      makeCableRow({ id: 'ex-1', name: 'Cable Curl', mount_position: 'low' }),
      makeCableRow({ id: 'ex-2', name: 'Cable Fly', mount_position: 'mid', primary_muscles: '["chest"]' }),
    ]);

    const result = await getCableExercises({ mountPosition: null, attachment: null });

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Cable Curl');
    expect(result[0].primary_muscles).toEqual(['biceps']);
    expect(result[0].mount_position).toBe('low');
    expect(result[1].primary_muscles).toEqual(['chest']);

    const [sql, params] = helpers.query.mock.calls[0];
    expect(sql).toContain("equipment = 'cable'");
    expect(params).toEqual([null, null, null, null]);
  });

  test.each([
    ['mount only', { mountPosition: 'high' as const, attachment: null }, ['high', 'high', null, null]],
    ['attachment only', { mountPosition: null, attachment: 'rope' as const }, [null, null, 'rope', 'rope']],
    ['both filters', { mountPosition: 'low' as const, attachment: 'bar' as const }, ['low', 'low', 'bar', 'bar']],
    ['no filters', { mountPosition: null, attachment: null }, [null, null, null, null]],
  ])('getCableExercises passes correct params for %s', async (_label, filters, expectedParams) => {
    await getCableExercises(filters);
    const [, params] = helpers.query.mock.calls[0];
    expect(params).toEqual(expectedParams);
  });

  test('getAvailableAttachments returns distinct values and verifies SQL', async () => {
    helpers.query.mockResolvedValue([
      { attachment: 'handle' },
      { attachment: 'rope' },
      { attachment: 'bar' },
    ]);

    const result = await getAvailableAttachments();
    expect(result).toEqual(['handle', 'rope', 'bar']);

    const [sql] = helpers.query.mock.calls[0];
    expect(sql).toContain("equipment = 'cable'");
    expect(sql).toContain('attachment IS NOT NULL');
    expect(sql).toContain('deleted_at IS NULL');
  });

  test('getAvailableAttachments returns empty array when no cable exercises', async () => {
    const result = await getAvailableAttachments();
    expect(result).toEqual([]);
  });
});
