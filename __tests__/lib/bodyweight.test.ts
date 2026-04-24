// BLD-541: Unit tests for bodyweight modifier helpers
import {
  modeOfModifier,
  normalizeModifier,
  formatBodyweightLoad,
  accessibilityLabelForModifier,
  resolveEffectiveLoad,
  formatBodyweightPRDelta,
  UNICODE_MINUS,
} from '../../lib/bodyweight';

describe('bodyweight helpers', () => {
  it('UNICODE_MINUS is U+2212 not ASCII hyphen', () => {
    expect(UNICODE_MINUS).toBe('\u2212');
    expect(UNICODE_MINUS).not.toBe('-');
  });

  it.each([
    [null, 'bodyweight', 'BW', 'Bodyweight only, no modifier'],
    [undefined, 'bodyweight', 'BW', 'Bodyweight only, no modifier'],
    [0, 'bodyweight', 'BW', 'Bodyweight only, no modifier'],
    [-0, 'bodyweight', 'BW', 'Bodyweight only, no modifier'],
    [15, 'added', '+15 kg', 'Weighted, plus 15 kilograms'],
    [0.5, 'added', '+0.5 kg', 'Weighted, plus 0.5 kilograms'],
    [-20, 'assisted', `Assist ${UNICODE_MINUS}20 kg`, 'Assisted, minus 20 kilograms'],
    [-37.5, 'assisted', `Assist ${UNICODE_MINUS}37.5 kg`, 'Assisted, minus 37.5 kilograms'],
  ] as const)(
    'mode/format/a11y for modifier=%s',
    (input, mode, label, a11y) => {
      expect(modeOfModifier(input as number | null | undefined)).toBe(mode);
      expect(formatBodyweightLoad(input as number | null | undefined)).toBe(label);
      expect(accessibilityLabelForModifier(input as number | null | undefined)).toBe(a11y);
      // Screen reader label never contains U+2212 or the word "hyphen"
      expect(a11y).not.toContain(UNICODE_MINUS);
      expect(a11y.toLowerCase()).not.toContain('hyphen');
    }
  );

  it.each([
    [null, null],
    [undefined, null],
    [0, null],
    [-0, null],
    [Number.NaN, null],
    [Number.POSITIVE_INFINITY, null],
    [Number.NEGATIVE_INFINITY, null],
    [15, 15],
    [-20, -20],
  ] as const)('normalizeModifier(%s) = %s', (input, expected) => {
    expect(normalizeModifier(input as number | null | undefined)).toBe(expected);
  });

  it('formatBodyweightLoad respects lb unit', () => {
    const lbStr = formatBodyweightLoad(10, 'lb');
    expect(lbStr).toMatch(/^\+\d+(\.\d+)? lb$/);
    const negLb = formatBodyweightLoad(-10, 'lb');
    expect(negLb).toContain(UNICODE_MINUS);
    expect(negLb).toContain('lb');
    expect(negLb).toMatch(/^Assist/);
    expect(accessibilityLabelForModifier(10, 'lb')).toMatch(/pounds$/);
  });

  it.each([
    // [modifierKg, userBodyweightKg, expected]
    [15, null, null],
    [15, 0, null],
    [null, null, null],
    [15, 75, 90],
    [-20, 75, 55],
    [-80, 75, 0],  // fully-deloaded floors at 0
    [null, 75, 75],
  ] as const)(
    'resolveEffectiveLoad(%s kg modifier, %s kg bw) = %s',
    (mod, bw, expected) => {
      expect(resolveEffectiveLoad(mod, bw)).toBe(expected);
    }
  );

  it.each([
    // [prev, curr, expectedSubstring]
    [null, 20, 'First weighted: +20 kg'],
    [null, -25, `First weighted: Assist ${UNICODE_MINUS}25 kg`],
    [10, 15, '+5 kg'],
    [-30, -15, 'Assistance reduced by 15 kg'],
  ] as const)('formatBodyweightPRDelta(prev=%s, curr=%s) = %s', (prev, curr, expected) => {
    expect(formatBodyweightPRDelta(prev, curr)).toBe(expected);
  });

  it('formatBodyweightPRDelta: sign-crossing uses mode-label framing', () => {
    const s = formatBodyweightPRDelta(-5, 5);
    expect(s).toContain('From');
    expect(s).toContain('\u2192'); // arrow →
    expect(s).toContain(`Assist ${UNICODE_MINUS}5 kg`);
    expect(s).toContain('+5 kg');
  });

  it('formatBodyweightPRDelta returns empty when current normalizes to null', () => {
    expect(formatBodyweightPRDelta(null, 0)).toBe('');
  });
});
