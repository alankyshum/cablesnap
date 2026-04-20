import {
  DEFAULT_LANDMARKS,
  mergeWithDefaults,
  parseCustomLandmarks,
  getVolumeStatus,
  getVolumeStatusLabel,
} from '../../lib/volume-landmarks'
import type { VolumeLandmarks } from '../../lib/volume-landmarks'

describe('volume-landmarks — defaults', () => {
  it('provides landmarks for all 14 muscle groups', () => {
    const keys = Object.keys(DEFAULT_LANDMARKS)
    expect(keys).toHaveLength(14)
    expect(keys).toContain('chest')
    expect(keys).toContain('full_body')
  })

  it('all defaults have MEV < MRV', () => {
    for (const lm of Object.values(DEFAULT_LANDMARKS)) {
      expect(lm.mev).toBeLessThan(lm.mrv)
    }
  })
})

describe('volume-landmarks — mergeWithDefaults', () => {
  it('returns defaults when custom is null', () => {
    const result = mergeWithDefaults(null)
    expect(result).toEqual(DEFAULT_LANDMARKS)
  })

  it('overrides specific muscle when custom provided', () => {
    const custom: Partial<Record<string, VolumeLandmarks>> = {
      chest: { mev: 12, mrv: 24 },
    }
    const result = mergeWithDefaults(custom)
    expect(result.chest).toEqual({ mev: 12, mrv: 24 })
    expect(result.back).toEqual(DEFAULT_LANDMARKS.back)
  })

  it('ignores unknown keys in custom', () => {
    const custom = { nonexistent_muscle: { mev: 5, mrv: 10 } }
    const result = mergeWithDefaults(custom)
    expect(result).toEqual(DEFAULT_LANDMARKS)
    expect((result as Record<string, unknown>)['nonexistent_muscle']).toBeUndefined()
  })
})

describe('volume-landmarks — parseCustomLandmarks', () => {
  it('returns null for null input', () => {
    expect(parseCustomLandmarks(null)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseCustomLandmarks('')).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseCustomLandmarks('{{invalid')).toBeNull()
  })

  it('returns null for array JSON', () => {
    expect(parseCustomLandmarks('[1,2,3]')).toBeNull()
  })

  it('returns null for primitive JSON', () => {
    expect(parseCustomLandmarks('"hello"')).toBeNull()
  })

  it('parses valid JSON object', () => {
    const input = JSON.stringify({ chest: { mev: 12, mrv: 24 } })
    const result = parseCustomLandmarks(input)
    expect(result).toEqual({ chest: { mev: 12, mrv: 24 } })
  })
})

describe('volume-landmarks — getVolumeStatus', () => {
  const lm: VolumeLandmarks = { mev: 10, mrv: 20 }

  it.each([
    [0, 'below_mev'],
    [5, 'below_mev'],
    [9, 'below_mev'],
    [10, 'optimal'],
    [15, 'optimal'],
    [20, 'optimal'],
    [21, 'above_mrv'],
    [50, 'above_mrv'],
  ] as const)('classifies %d sets as %s', (sets, expected) => {
    expect(getVolumeStatus(sets, lm)).toBe(expected)
  })
})

describe('volume-landmarks — getVolumeStatusLabel', () => {
  it('maps statuses to human-readable labels', () => {
    expect(getVolumeStatusLabel('below_mev')).toBe('below MEV')
    expect(getVolumeStatusLabel('optimal')).toBe('in optimal range')
    expect(getVolumeStatusLabel('above_mrv')).toBe('above MRV')
  })
})

describe('volume-landmarks — stepper constraints', () => {
  it('allows MEV = MRV (narrow zone)', () => {
    const lm: VolumeLandmarks = { mev: 12, mrv: 12 }
    expect(getVolumeStatus(12, lm)).toBe('optimal')
    expect(getVolumeStatus(11, lm)).toBe('below_mev')
    expect(getVolumeStatus(13, lm)).toBe('above_mrv')
  })

  it('getVolumeStatus handles MEV=0 correctly', () => {
    const lm: VolumeLandmarks = { mev: 0, mrv: 10 }
    expect(getVolumeStatus(0, lm)).toBe('optimal')
  })
})

describe('volume-landmarks — maxSets dynamic calculation', () => {
  it('maxSets uses max MRV, not flat 20', () => {
    const merged = mergeWithDefaults(null)
    const allMrvValues = Object.values(merged).map((l) => l.mrv)
    const maxMrv = Math.max(...allMrvValues)
    // back and lats have MRV=25, so maxSets floor should be 25
    expect(maxMrv).toBe(25)
    expect(maxMrv).toBeGreaterThan(20)
  })
})
