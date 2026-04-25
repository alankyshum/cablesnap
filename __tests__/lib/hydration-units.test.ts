import { mlToOz, ozToMl, formatVolume, formatTotalOverGoal, MAX_SINGLE_ENTRY_ML, ML_PER_FL_OZ } from '../../lib/hydration-units';

describe('hydration-units', () => {
  it.each([
    [0, 0],
    [29.5735, 1],
    [250, 250 / ML_PER_FL_OZ],
    [2000, 2000 / ML_PER_FL_OZ],
    [5000, 5000 / ML_PER_FL_OZ],
  ])('mlToOz(%p) returns ~%p', (ml, expected) => {
    expect(mlToOz(ml)).toBeCloseTo(expected, 5);
  });

  it.each([
    [10, 10 * ML_PER_FL_OZ],
    [67, 67 * ML_PER_FL_OZ],
  ])('ozToMl(%p) returns ~%p', (oz, expected) => {
    expect(ozToMl(oz)).toBeCloseTo(expected, 5);
  });

  it('mlToOz/ozToMl is round-trip consistent', () => {
    for (const ml of [100, 250, 500, 750, 1000, 2000, MAX_SINGLE_ENTRY_ML]) {
      expect(ozToMl(mlToOz(ml))).toBeCloseTo(ml, 5);
    }
  });

  it('formatVolume returns integer ml with thousand separator and unit', () => {
    expect(formatVolume(2250, 'ml')).toBe('2,250 ml');
    expect(formatVolume(0, 'ml')).toBe('0 ml');
  });

  it('formatVolume returns one-decimal fl oz where useful', () => {
    expect(formatVolume(250, 'fl_oz')).toBe('8.5 fl oz');
    // 67 fl oz exactly → integer display
    expect(formatVolume(67 * ML_PER_FL_OZ, 'fl_oz')).toBe('67 fl oz');
  });

  it('formatTotalOverGoal renders both halves in active unit', () => {
    expect(formatTotalOverGoal(1250, 2000, 'ml')).toBe('1,250 / 2,000 ml');
    expect(formatTotalOverGoal(2250, 2000, 'ml')).toBe('2,250 / 2,000 ml');
    const txt = formatTotalOverGoal(250, 2000, 'fl_oz');
    expect(txt).toMatch(/fl oz$/);
    expect(txt).toContain('/');
  });

  it('exposes MAX_SINGLE_ENTRY_ML = 5000', () => {
    expect(MAX_SINGLE_ENTRY_ML).toBe(5000);
  });
});
