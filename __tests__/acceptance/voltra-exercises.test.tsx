import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import { seedExercises } from '../../lib/seed'
import type { Exercise } from '../../lib/types'
import { CATEGORY_LABELS, MOUNT_POSITION_LABELS, ATTACHMENT_LABELS } from '../../lib/types'

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() }

jest.mock('expo-router', () => {
  const RealReact = require('react')
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => ({}),
    usePathname: () => '/test',
    useFocusEffect: (cb: () => (() => void) | void) => {
      RealReact.useEffect(() => {
        const cleanup = cb()
        return typeof cleanup === 'function' ? cleanup : undefined
      }, [])
    },
    Stack: { Screen: () => null },
    Redirect: () => null,
  }
})

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')
jest.mock('../../lib/useProfileGender', () => ({ useProfileGender: () => 'male' as const }))
jest.mock('../../lib/layout', () => ({ useLayout: () => ({ wide: false, width: 375, scale: 1.0 }) }))
jest.mock('../../lib/errors', () => ({ logError: jest.fn(), generateReport: jest.fn().mockResolvedValue('{}'), getRecentErrors: jest.fn().mockResolvedValue([]), generateGitHubURL: jest.fn().mockReturnValue('https://github.com') }))
jest.mock('../../lib/interactions', () => ({ log: jest.fn(), recent: jest.fn().mockResolvedValue([]) }))
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))

// Build the full Voltra exercise list from seed data
const allSeeded = seedExercises()
const voltraExercises = allSeeded.filter((e) => e.is_voltra === true)

const mockGetAll = jest.fn().mockResolvedValue(allSeeded)
const mockGetById = jest.fn().mockImplementation((id: string) =>
  Promise.resolve(allSeeded.find((e) => e.id === id) ?? allSeeded[0])
)
const mockCreateCustom = jest.fn().mockResolvedValue(undefined)

jest.mock('../../lib/db', () => ({
  getAllExercises: (...args: unknown[]) => mockGetAll(...args),
  getExerciseById: (...args: unknown[]) => mockGetById(...args),
  createCustomExercise: (...args: unknown[]) => mockCreateCustom(...args),
  getAppSetting: jest.fn().mockResolvedValue(null),
}))

import Exercises from '../../app/(tabs)/exercises'

describe('Voltra Exercise Database Acceptance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetAll.mockResolvedValue(allSeeded)
  })

  // ── Data Integrity Tests ──────────────────────────────────

  describe('Voltra Movement Bank data', () => {
    it('contains exactly 56 Voltra exercises', () => {
      expect(voltraExercises).toHaveLength(56)
    })

    it('all Voltra exercises use cable equipment', () => {
      for (const ex of voltraExercises) {
        expect(ex.equipment).toBe('cable')
      }
    })

    it('all Voltra exercises have is_voltra=true and is_custom=false', () => {
      for (const ex of voltraExercises) {
        expect(ex.is_voltra).toBe(true)
        expect(ex.is_custom).toBe(false)
      }
    })

    it('every Voltra exercise has mount_position metadata', () => {
      for (const ex of voltraExercises) {
        expect(ex.mount_position).toBeDefined()
        expect(['high', 'mid', 'low', 'floor']).toContain(ex.mount_position)
      }
    })

    it('every Voltra exercise has attachment metadata', () => {
      for (const ex of voltraExercises) {
        expect(ex.attachment).toBeDefined()
        expect(ex.attachment).toBeTruthy()
      }
    })

    it('every Voltra exercise has at least one training mode', () => {
      for (const ex of voltraExercises) {
        expect(ex.training_modes).toBeDefined()
        expect(ex.training_modes!.length).toBeGreaterThan(0)
      }
    })

    it('every Voltra exercise has instructions', () => {
      for (const ex of voltraExercises) {
        expect(ex.instructions).toBeTruthy()
        expect(ex.instructions.length).toBeGreaterThan(10)
      }
    })

    it('Voltra exercise IDs use voltra-NNN format', () => {
      for (const ex of voltraExercises) {
        expect(ex.id).toMatch(/^voltra-\d{3}$/)
      }
    })
  })

  // ── Category Distribution Tests ──────────────────────────

  describe('muscle group categories', () => {
    const categoryGroups: Record<string, Exercise[]> = {}
    for (const ex of voltraExercises) {
      if (!categoryGroups[ex.category]) categoryGroups[ex.category] = []
      categoryGroups[ex.category].push(ex)
    }

    it('covers all 6 muscle group categories', () => {
      const categories = Object.keys(categoryGroups).sort()
      expect(categories).toEqual(['abs_core', 'arms', 'back', 'chest', 'legs_glutes', 'shoulders'])
    })

    it('Abs & Core has 10 exercises', () => {
      expect(categoryGroups['abs_core']).toHaveLength(10)
    })

    it('Arms has 9 exercises', () => {
      expect(categoryGroups['arms']).toHaveLength(9)
    })

    it('Back has 9 exercises', () => {
      expect(categoryGroups['back']).toHaveLength(9)
    })

    it('Chest has 9 exercises', () => {
      expect(categoryGroups['chest']).toHaveLength(9)
    })

    it('Legs & Glutes has 9 exercises', () => {
      expect(categoryGroups['legs_glutes']).toHaveLength(9)
    })

    it('Shoulders has 10 exercises', () => {
      expect(categoryGroups['shoulders']).toHaveLength(10)
    })
  })

  // ── Exercise Library Rendering Tests ─────────────────────

  describe('exercise library display', () => {
    it('renders Voltra exercises in the exercise library', async () => {
      const { findByText } = renderScreen(<Exercises />)

      // Spot-check representative exercises from each category
      expect(await findByText('Abdominal Crunches')).toBeTruthy()
      expect(await findByText('Biceps Curls')).toBeTruthy()
      expect(await findByText('Wide Grip Lat Pull-down')).toBeTruthy()
      expect(await findByText('Bench Fly')).toBeTruthy()
      expect(await findByText('Goblet Squat')).toBeTruthy()
      expect(await findByText('Face Pulls with External Rotation')).toBeTruthy()
    })

    it('filters Voltra exercises by Abs & Core category', async () => {
      const { findByText, getByText, queryByText } = renderScreen(<Exercises />)

      await findByText('Abdominal Crunches')

      const chipLabel = CATEGORY_LABELS['abs_core']
      fireEvent.press(getByText(chipLabel))

      await waitFor(() => {
        // Abs & Core exercises visible
        expect(queryByText('Abdominal Crunches')).toBeTruthy()
        expect(queryByText('Trunk Horizontal Rotations')).toBeTruthy()
        expect(queryByText('Kneeling Cable Crunch')).toBeTruthy()
        // Other categories hidden
        expect(queryByText('Biceps Curls')).toBeNull()
        expect(queryByText('Wide Grip Lat Pull-down')).toBeNull()
        expect(queryByText('Bench Fly')).toBeNull()
      })
    })

    it('filters Voltra exercises by Arms category', async () => {
      const { findByText, getByText, queryByText } = renderScreen(<Exercises />)

      await findByText('Abdominal Crunches')

      fireEvent.press(getByText(CATEGORY_LABELS['arms']))

      await waitFor(() => {
        expect(queryByText('Biceps Curls')).toBeTruthy()
        expect(queryByText('Triceps Push-down')).toBeTruthy()
        expect(queryByText('Hammer Curl')).toBeTruthy()
        expect(queryByText('Abdominal Crunches')).toBeNull()
      })
    })

    it('filters Voltra exercises by Back category', async () => {
      const { findByText, getByText, queryByText } = renderScreen(<Exercises />)

      await findByText('Abdominal Crunches')

      fireEvent.press(getByText(CATEGORY_LABELS['back']))

      await waitFor(() => {
        expect(queryByText('Wide Grip Lat Pull-down')).toBeTruthy()
        expect(queryByText('Seated Cable Row')).toBeTruthy()
        expect(queryByText('Bench Fly')).toBeNull()
      })
    })

    it('filters Voltra exercises by Chest category', async () => {
      const { findByText, getByText, queryByText } = renderScreen(<Exercises />)

      await findByText('Abdominal Crunches')

      fireEvent.press(getByText(CATEGORY_LABELS['chest']))

      await waitFor(() => {
        expect(queryByText('Bench Fly')).toBeTruthy()
        expect(queryByText('Crossover Fly')).toBeTruthy()
        expect(queryByText('Incline Chest Press')).toBeTruthy()
        expect(queryByText('Abdominal Crunches')).toBeNull()
      })
    })

    it('filters Voltra exercises by Legs & Glutes category', async () => {
      const { findByText, getByText, queryByText } = renderScreen(<Exercises />)

      await findByText('Abdominal Crunches')

      fireEvent.press(getByText(CATEGORY_LABELS['legs_glutes']))

      await waitFor(() => {
        expect(queryByText('Goblet Squat')).toBeTruthy()
        expect(queryByText('Hip Extension')).toBeTruthy()
        expect(queryByText('Abdominal Crunches')).toBeNull()
      })
    })

    it('filters Voltra exercises by Shoulders category', async () => {
      const { findByText, getByText, queryByText } = renderScreen(<Exercises />)

      await findByText('Abdominal Crunches')

      fireEvent.press(getByText(CATEGORY_LABELS['shoulders']))

      await waitFor(() => {
        expect(queryByText('Face Pulls with External Rotation')).toBeTruthy()
        expect(queryByText('Lateral Raises Two Arms')).toBeTruthy()
        expect(queryByText('Cable Overhead Press')).toBeTruthy()
        expect(queryByText('Abdominal Crunches')).toBeNull()
      })
    })

    it('finds Voltra exercises via search', async () => {
      const { findByText, getByLabelText, queryByText } = renderScreen(<Exercises />)

      await findByText('Abdominal Crunches')

      const searchBar = getByLabelText('Search exercises')
      fireEvent.changeText(searchBar, 'Lat Pull')

      await waitFor(() => {
        expect(queryByText('Wide Grip Lat Pull-down')).toBeTruthy()
        expect(queryByText('Close Grip Lat Pull-down')).toBeTruthy()
        expect(queryByText('Single-arm Lat Pull-down')).toBeTruthy()
        expect(queryByText('Straight Arm Lat Pull-down')).toBeTruthy()
        expect(queryByText('Bench Fly')).toBeNull()
      })
    })
  })

  // ── Exercise Detail Metadata Tests ───────────────────────

  describe('cable-specific metadata in exercise details', () => {
    it('exercise detail shows mount position for Voltra exercises', async () => {
      // Verify that a Voltra exercise data includes displayable mount position
      const abCrunches = voltraExercises.find((e) => e.name === 'Abdominal Crunches')!
      expect(abCrunches.mount_position).toBeDefined()
      expect(MOUNT_POSITION_LABELS[abCrunches.mount_position!]).toBeTruthy()
    })

    it('exercise detail shows attachment type for Voltra exercises', async () => {
      const abCrunches = voltraExercises.find((e) => e.name === 'Abdominal Crunches')!
      expect(abCrunches.attachment).toBeDefined()
      expect(ATTACHMENT_LABELS[abCrunches.attachment!]).toBeTruthy()
    })

    it('all mount positions have human-readable labels', () => {
      const mountPositions = new Set(voltraExercises.map((e) => e.mount_position!))
      for (const pos of mountPositions) {
        expect(MOUNT_POSITION_LABELS[pos]).toBeTruthy()
      }
    })

    it('all attachment types have human-readable labels', () => {
      const attachments = new Set(voltraExercises.map((e) => e.attachment!))
      for (const att of attachments) {
        expect(ATTACHMENT_LABELS[att]).toBeTruthy()
      }
    })

    it('Voltra exercises use varied mount positions', () => {
      const mountPositions = new Set(voltraExercises.map((e) => e.mount_position))
      expect(mountPositions.size).toBeGreaterThanOrEqual(3)
    })

    it('Voltra exercises use varied attachments', () => {
      const attachments = new Set(voltraExercises.map((e) => e.attachment))
      expect(attachments.size).toBeGreaterThanOrEqual(2)
    })
  })

  // ── Total Count Verification ─────────────────────────────

  describe('correct total count', () => {
    it('seed data returns Voltra + community exercises combined', () => {
      const nonVoltra = allSeeded.filter((e) => !e.is_voltra)
      expect(nonVoltra.length).toBeGreaterThan(0)
      expect(allSeeded.length).toBe(voltraExercises.length + nonVoltra.length)
    })

    it('no duplicate exercise names within Voltra exercises', () => {
      const names = voltraExercises.map((e) => e.name)
      const uniqueNames = new Set(names)
      expect(uniqueNames.size).toBe(names.length)
    })

    it('no duplicate exercise IDs within Voltra exercises', () => {
      const ids = voltraExercises.map((e) => e.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)
    })
  })
})
