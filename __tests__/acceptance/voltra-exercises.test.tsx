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

  // ── Data Integrity (consolidated) ────────────────────────

  describe('Voltra Movement Bank data', () => {
    it('contains exactly 56 Voltra exercises', () => {
      expect(voltraExercises).toHaveLength(56)
    })

    it('every Voltra exercise has required core metadata', () => {
      for (const ex of voltraExercises) {
        // equipment + flags
        expect(ex.equipment).toBe('cable')
        expect(ex.is_voltra).toBe(true)
        expect(ex.is_custom).toBe(false)
        // mount position
        expect(ex.mount_position).toBeDefined()
        expect(['high', 'mid', 'low', 'floor']).toContain(ex.mount_position)
        // attachment
        expect(ex.attachment).toBeDefined()
        expect(ex.attachment).toBeTruthy()
        // training modes
        expect(ex.training_modes).toBeDefined()
        expect(ex.training_modes!.length).toBeGreaterThan(0)
        // instructions
        expect(ex.instructions).toBeTruthy()
        expect(ex.instructions.length).toBeGreaterThan(10)
        // ID format
        expect(ex.id).toMatch(/^voltra-\d{3}$/)
      }
    })
  })

  // ── Category Distribution (table-driven) ─────────────────

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

    it.each([
      ['abs_core', 10],
      ['arms', 9],
      ['back', 9],
      ['chest', 9],
      ['legs_glutes', 9],
      ['shoulders', 10],
    ] as const)('category %s has %i exercises', (cat, count) => {
      expect(categoryGroups[cat]).toHaveLength(count)
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

    it.each([
      [
        'abs_core',
        ['Abdominal Crunches', 'Trunk Horizontal Rotations', 'Kneeling Cable Crunch'],
        ['Biceps Curls', 'Wide Grip Lat Pull-down', 'Bench Fly'],
      ],
      [
        'arms',
        ['Biceps Curls', 'Triceps Push-down', 'Hammer Curl'],
        ['Abdominal Crunches'],
      ],
      [
        'back',
        ['Wide Grip Lat Pull-down', 'Seated Cable Row'],
        ['Bench Fly'],
      ],
      [
        'chest',
        ['Bench Fly', 'Crossover Fly', 'Incline Chest Press'],
        ['Abdominal Crunches'],
      ],
      [
        'legs_glutes',
        ['Goblet Squat', 'Hip Extension'],
        ['Abdominal Crunches'],
      ],
      [
        'shoulders',
        ['Face Pulls with External Rotation', 'Lateral Raises Two Arms', 'Cable Overhead Press'],
        ['Abdominal Crunches'],
      ],
    ] as const)('filters Voltra exercises by %s category', async (cat, visible, hidden) => {
      const { findByText, getByText, queryByText } = renderScreen(<Exercises />)

      await findByText('Abdominal Crunches')

      const chipLabel = CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS]
      fireEvent.press(getByText(chipLabel))

      await waitFor(() => {
        for (const name of visible) expect(queryByText(name)).toBeTruthy()
        for (const name of hidden) expect(queryByText(name)).toBeNull()
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
    it('exposes mount position + attachment metadata with human-readable labels', () => {
      // Spot-check on Abdominal Crunches
      const abCrunches = voltraExercises.find((e) => e.name === 'Abdominal Crunches')!
      expect(abCrunches.mount_position).toBeDefined()
      expect(MOUNT_POSITION_LABELS[abCrunches.mount_position!]).toBeTruthy()
      expect(abCrunches.attachment).toBeDefined()
      expect(ATTACHMENT_LABELS[abCrunches.attachment!]).toBeTruthy()

      // All mount positions / attachments used across Voltra have labels
      const mountPositions = new Set(voltraExercises.map((e) => e.mount_position!))
      for (const pos of mountPositions) {
        expect(MOUNT_POSITION_LABELS[pos]).toBeTruthy()
      }
      const attachments = new Set(voltraExercises.map((e) => e.attachment!))
      for (const att of attachments) {
        expect(ATTACHMENT_LABELS[att]).toBeTruthy()
      }

      // Variety
      expect(mountPositions.size).toBeGreaterThanOrEqual(3)
      expect(attachments.size).toBeGreaterThanOrEqual(2)
    })
  })

  // ── Total Count Verification ─────────────────────────────

  describe('correct total count', () => {
    it('seed data combines Voltra + community exercises with unique names and IDs', () => {
      const nonVoltra = allSeeded.filter((e) => !e.is_voltra)
      expect(nonVoltra.length).toBeGreaterThan(0)
      expect(allSeeded.length).toBe(voltraExercises.length + nonVoltra.length)

      const names = voltraExercises.map((e) => e.name)
      expect(new Set(names).size).toBe(names.length)

      const ids = voltraExercises.map((e) => e.id)
      expect(new Set(ids).size).toBe(ids.length)
    })
  })
})
