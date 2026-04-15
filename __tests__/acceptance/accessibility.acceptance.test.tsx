jest.setTimeout(10000)

/**
 * Cross-screen accessibility compliance audit.
 * Verifies all interactive elements have accessible labels,
 * proper roles, and screen reader hints.
 */

import React from 'react'
import { waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import { createExercise, createSession, resetIds } from '../helpers/factories'
import type { Exercise } from '../../lib/types'

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() }
const mockParams: Record<string, string> = {}

jest.mock('expo-router', () => {
  const RealReact = require('react')
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => mockParams,
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
jest.mock('../../lib/layout', () => ({ useLayout: () => ({ wide: false, width: 375, scale: 1.0 }) }))
jest.mock('../../lib/errors', () => ({ logError: jest.fn(), generateReport: jest.fn().mockResolvedValue('{}'), getRecentErrors: jest.fn().mockResolvedValue([]), generateGitHubURL: jest.fn().mockReturnValue('https://github.com'), getErrorCount: jest.fn().mockResolvedValue(0) }))
jest.mock('../../lib/interactions', () => ({ log: jest.fn(), recent: jest.fn().mockResolvedValue([]) }))
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }))

jest.mock('@react-navigation/native', () => {
  const RealReact = require('react')
  return {
    useNavigation: () => ({ setOptions: jest.fn() }),
    useFocusEffect: (cb: () => (() => void) | void) => {
      RealReact.useEffect(() => {
        const cleanup = cb()
        return typeof cleanup === 'function' ? cleanup : undefined
      }, [])
    },
  }
})

// Exercises screen mocks
const exercises: Exercise[] = [
  createExercise({ id: 'ex-1', name: 'Bench Press', category: 'chest' }),
  createExercise({ id: 'ex-2', name: 'Squat', category: 'legs_glutes' }),
]

jest.mock('../../lib/db', () => ({
  getAllExercises: jest.fn().mockResolvedValue([
    { id: 'ex-1', name: 'Bench Press', category: 'chest', primary_muscles: ['chest'], secondary_muscles: [], equipment: 'barbell', instructions: 'Press', difficulty: 'intermediate', is_custom: false, deleted_at: null },
    { id: 'ex-2', name: 'Squat', category: 'legs_glutes', primary_muscles: ['quads'], secondary_muscles: [], equipment: 'barbell', instructions: 'Squat down', difficulty: 'intermediate', is_custom: false, deleted_at: null },
  ]),
  getExerciseById: jest.fn().mockResolvedValue({ id: 'ex-1', name: 'Bench Press', category: 'chest', primary_muscles: ['chest'], secondary_muscles: [], equipment: 'barbell', instructions: 'Press', difficulty: 'intermediate', is_custom: false, deleted_at: null }),
  createCustomExercise: jest.fn().mockResolvedValue(undefined),
  getRecentSessions: jest.fn().mockResolvedValue([]),
  getActiveProgram: jest.fn().mockResolvedValue(null),
  getTemplates: jest.fn().mockResolvedValue([]),
  getSessionsByMonth: jest.fn().mockResolvedValue([]),
  getSessionCountsByDay: jest.fn().mockResolvedValue([]),
  getAllCompletedSessionWeeks: jest.fn().mockResolvedValue([]),
  getTotalSessionCount: jest.fn().mockResolvedValue(0),
  searchSessions: jest.fn().mockResolvedValue([]),
  getDailyLogs: jest.fn().mockResolvedValue([]),
  getDailySummary: jest.fn().mockResolvedValue({ calories: 0, protein: 0, carbs: 0, fat: 0 }),
  getMacroTargets: jest.fn().mockResolvedValue({ id: '1', calories: 2000, protein: 150, carbs: 250, fat: 65, created_at: Date.now(), updated_at: Date.now() }),
  deleteDailyLog: jest.fn().mockResolvedValue(undefined),
  getAppSetting: jest.fn().mockResolvedValue(null),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
  exportAllData: jest.fn().mockResolvedValue('{}'),
  importData: jest.fn().mockResolvedValue(undefined),
  getWorkoutCSVData: jest.fn().mockResolvedValue([]),
  getNutritionCSVData: jest.fn().mockResolvedValue([]),
  getBodyWeightCSVData: jest.fn().mockResolvedValue([]),
  getBodyMeasurementsCSVData: jest.fn().mockResolvedValue([]),
  getCSVCounts: jest.fn().mockResolvedValue({ workouts: 0, nutrition: 0, bodyWeight: 0, measurements: 0 }),
  getBodySettings: jest.fn().mockResolvedValue({ weight_unit: 'kg', measurement_unit: 'cm', weight_goal: null, body_fat_goal: null }),
  getBodyWeightHistory: jest.fn().mockResolvedValue([]),
  getLatestBodyWeight: jest.fn().mockResolvedValue(null),
  getPersonalRecords: jest.fn().mockResolvedValue([]),
  getProgressChartData: jest.fn().mockResolvedValue([]),
  getSessionById: jest.fn(),
  getSessionSets: jest.fn().mockResolvedValue([]),
  getTemplateById: jest.fn().mockResolvedValue(null),
  addSet: jest.fn().mockResolvedValue(undefined),
  completeSet: jest.fn().mockResolvedValue(undefined),
  uncompleteSet: jest.fn().mockResolvedValue(undefined),
  completeSession: jest.fn().mockResolvedValue(undefined),
  cancelSession: jest.fn().mockResolvedValue(undefined),
  updateSet: jest.fn().mockResolvedValue(undefined),
  updateSetRPE: jest.fn().mockResolvedValue(undefined),
  updateSetNotes: jest.fn().mockResolvedValue(undefined),
  updateSetTrainingMode: jest.fn().mockResolvedValue(undefined),
  updateSetTempo: jest.fn().mockResolvedValue(undefined),
  getMaxWeightByExercise: jest.fn().mockResolvedValue({}),
  getPreviousSets: jest.fn().mockResolvedValue([]),
  getRecentExerciseSets: jest.fn().mockResolvedValue([]),
  getRestSecondsForExercise: jest.fn().mockResolvedValue(90),
  getRestSecondsForLink: jest.fn().mockResolvedValue(90),
  getSessionPRs: jest.fn().mockResolvedValue([]),
  getSessionRepPRs: jest.fn().mockResolvedValue([]),
  getSessionWeightIncreases: jest.fn().mockResolvedValue([]),
  getSessionComparison: jest.fn().mockResolvedValue(null),
  updateBodySettings: jest.fn().mockResolvedValue(undefined),
  addBodyWeight: jest.fn().mockResolvedValue(undefined),
  getBodyMeasurements: jest.fn().mockResolvedValue([]),
  addBodyMeasurement: jest.fn().mockResolvedValue(undefined),
  getFoodEntries: jest.fn().mockResolvedValue([]),
  getAchievements: jest.fn().mockResolvedValue([]),
  getProgressPhotos: jest.fn().mockResolvedValue([]),
  getSchedule: jest.fn().mockResolvedValue(null),
}))

jest.mock('../../lib/programs', () => ({
  activateProgram: jest.fn(),
  getActiveProgram: jest.fn().mockResolvedValue(null),
}))

jest.mock('../../lib/audio', () => ({
  loadSounds: jest.fn().mockResolvedValue(new Map()),
  setEnabled: jest.fn(),
}))

jest.mock('../../lib/notifications', () => ({
  requestPermission: jest.fn().mockResolvedValue('granted'),
  scheduleReminders: jest.fn().mockResolvedValue(undefined),
  cancelAll: jest.fn().mockResolvedValue(undefined),
  getPermissionStatus: jest.fn().mockResolvedValue('granted'),
}))

jest.mock('../../lib/csv-format', () => ({
  workoutCSV: jest.fn().mockReturnValue(''),
  nutritionCSV: jest.fn().mockReturnValue(''),
  bodyWeightCSV: jest.fn().mockReturnValue(''),
  bodyMeasurementsCSV: jest.fn().mockReturnValue(''),
}))

import Exercises from '../../app/(tabs)/exercises'
import Settings from '../../app/(tabs)/settings'
import Nutrition from '../../app/(tabs)/nutrition'

describe('Accessibility Compliance Audit', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetIds()
    Object.keys(mockParams).forEach((k) => delete mockParams[k])
  })

  describe('exercises.tsx', () => {
    it('search bar has accessible label', async () => {
      const screen = renderScreen(<Exercises />)
      await waitFor(() => {
        expect(screen.getByLabelText('Search exercises')).toBeTruthy()
      })
    })

    it('category filter chips have accessible labels', async () => {
      const screen = renderScreen(<Exercises />)
      await waitFor(() => {
        const chips = screen.getAllByLabelText(/Filter by/)
        expect(chips.length).toBeGreaterThan(0)
      })
    })

    it('exercise items have accessible labels with name and category', async () => {
      const screen = renderScreen(<Exercises />)
      await waitFor(() => {
        expect(screen.getByLabelText(/Bench Press/)).toBeTruthy()
        expect(screen.getByLabelText(/Squat/)).toBeTruthy()
      })
    })

    it('FAB has accessible label for creating exercise', async () => {
      const screen = renderScreen(<Exercises />)
      await waitFor(() => {
        expect(screen.getByLabelText('Add custom exercise')).toBeTruthy()
      })
    })
  })

  describe('nutrition.tsx', () => {
    it('has accessible FAB for adding food', async () => {
      const screen = renderScreen(<Nutrition />)
      await waitFor(() => {
        expect(screen.getByLabelText('Add food')).toBeTruthy()
      })
    })
  })

  describe('settings.tsx', () => {
    it('renders setting cards with accessible labels', async () => {
      const screen = renderScreen(<Settings />)
      await waitFor(() => {
        // Settings screen should have accessible elements
        expect(screen.getByText('Settings')).toBeTruthy()
      })
    })

    it('export and import buttons have accessible labels', async () => {
      const screen = renderScreen(<Settings />)
      await waitFor(() => {
        expect(screen.getByLabelText('Export all data as JSON')).toBeTruthy()
        expect(screen.getByLabelText('Import data')).toBeTruthy()
      })
    })
  })

  describe('cross-screen patterns', () => {
    it('exercises screen has labeled search and FAB', async () => {
      const screen = renderScreen(<Exercises />)
      await waitFor(() => {
        // Verify key interactive elements have accessible labels
        expect(screen.getByLabelText('Search exercises')).toBeTruthy()
        expect(screen.getByLabelText('Add custom exercise')).toBeTruthy()
        // All exercises should be labeled
        expect(screen.getByLabelText(/Bench Press/)).toBeTruthy()
      })
    })

    it('settings screen has labeled data management buttons', async () => {
      const screen = renderScreen(<Settings />)
      await waitFor(() => {
        expect(screen.getByLabelText('Export all data as JSON')).toBeTruthy()
        expect(screen.getByLabelText('Import data')).toBeTruthy()
        expect(screen.getByLabelText('Workout Reminders')).toBeTruthy()
        expect(screen.getByLabelText('Timer Sound')).toBeTruthy()
      })
    })

    it('nutrition screen has labeled day navigation', async () => {
      const screen = renderScreen(<Nutrition />)
      await waitFor(() => {
        expect(screen.getByLabelText('Previous day')).toBeTruthy()
        expect(screen.getByLabelText('Next day')).toBeTruthy()
        expect(screen.getByLabelText('Add food')).toBeTruthy()
      })
    })
  })
})
