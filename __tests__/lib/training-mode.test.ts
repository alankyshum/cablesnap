import { TRAINING_MODE_LABELS, VALID_TRAINING_MODES, coerceTrainingMode } from '../../lib/types'
import type { TrainingMode } from '../../lib/types'
import { createSet } from '../helpers/factories'

describe('TrainingMode types and labels', () => {
  const ALL_MODES: TrainingMode[] = [
    'weight', 'band', 'damper',
    'isokinetic', 'isometric', 'custom_curves', 'rowing',
  ]

  it('has labels for every training mode', () => {
    for (const mode of ALL_MODES) {
      expect(TRAINING_MODE_LABELS[mode]).toBeDefined()
      expect(TRAINING_MODE_LABELS[mode].label).toBeTruthy()
      expect(TRAINING_MODE_LABELS[mode].short).toBeTruthy()
      expect(TRAINING_MODE_LABELS[mode].description).toBeTruthy()
    }
  })

  it('short labels are ≤4 characters', () => {
    for (const mode of ALL_MODES) {
      expect(TRAINING_MODE_LABELS[mode].short.length).toBeLessThanOrEqual(4)
    }
  })

  it('eccentric_overload mode has been removed (BLD-622)', () => {
    expect(ALL_MODES).not.toContain('eccentric_overload' as TrainingMode)
    expect((TRAINING_MODE_LABELS as Record<string, unknown>)['eccentric_overload']).toBeUndefined()
  })

  it('WorkoutSet factory defaults training_mode and tempo to null', () => {
    const set = createSet()
    expect(set.training_mode).toBeNull()
    expect(set.tempo).toBeNull()
  })

  it('WorkoutSet can be created with training_mode', () => {
    const set = createSet({ training_mode: 'band', tempo: '3-1-5-1' })
    expect(set.training_mode).toBe('band')
    expect(set.tempo).toBe('3-1-5-1')
  })

  it('legacy sets with null training_mode are valid', () => {
    const set = createSet({ training_mode: null })
    expect(set.training_mode).toBeNull()
  })
})

describe('coerceTrainingMode (BLD-622 read-side guard)', () => {
  it('passes through every valid mode', () => {
    for (const mode of VALID_TRAINING_MODES) {
      expect(coerceTrainingMode(mode)).toBe(mode)
    }
  })

  it('coerces removed eccentric_overload to null', () => {
    expect(coerceTrainingMode('eccentric_overload')).toBeNull()
  })

  it('coerces unknown / bogus strings to null', () => {
    expect(coerceTrainingMode('made_up')).toBeNull()
    expect(coerceTrainingMode('')).toBeNull()
  })

  it('coerces null / undefined / non-strings to null', () => {
    expect(coerceTrainingMode(null)).toBeNull()
    expect(coerceTrainingMode(undefined)).toBeNull()
    expect(coerceTrainingMode(42)).toBeNull()
    expect(coerceTrainingMode({})).toBeNull()
  })
})
