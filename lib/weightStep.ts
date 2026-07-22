export function getValidSteps(unit: 'kg' | 'lb'): number[] {
  return unit === 'lb' ? [1, 2.5, 5, 10] : [0.5, 1.25, 2.5, 5];
}

export function defaultStep(unit: 'kg' | 'lb'): number {
  return unit === 'lb' ? 5 : 2.5;
}

export function resolveStep(raw: string | null | undefined, unit: 'kg' | 'lb'): number {
  const def = defaultStep(unit);
  if (raw === null || raw === undefined) {
    return def;
  }
  const trimmed = raw.trim();
  if (trimmed === '') {
    return def;
  }
  const parsed = parseFloat(trimmed);
  if (isNaN(parsed) || parsed <= 0) {
    return def;
  }
  const valid = getValidSteps(unit);
  if (valid.includes(parsed)) {
    return parsed;
  }
  return def;
}
