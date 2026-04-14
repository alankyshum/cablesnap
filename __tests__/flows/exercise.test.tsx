jest.setTimeout(10000)

import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import { createExercise, resetIds } from '../helpers/factories'
import type { Exercise } from '../../lib/types'

// --- Mocks ---

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
jest.mock('../../lib/layout', () => ({
  useLayout: () => ({ wide: false, width: 375, scale: 1.0 }),
}))
jest.mock('../../lib/errors', () => ({
  logError: jest.fn(),
  generateReport: jest.fn().mockResolvedValue('{}'),
  getRecentErrors: jest.fn().mockResolvedValue([]),
  generateGitHubURL: jest.fn().mockReturnValue('https://github.com'),
}))
jest.mock('../../lib/interactions', () => ({
  log: jest.fn(),
  recent: jest.fn().mockResolvedValue([]),
}))
jest.mock('expo-file-system', () => ({
  File: jest.fn(),
  Paths: { cache: '/cache' },
}))
jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn(),
}))

const exercises: Exercise[] = [
  createExercise({ id: 'ex-1', name: 'Bench Press', category: 'chest', primary_muscles: ['chest', 'triceps'] }),
  createExercise({ id: 'ex-2', name: 'Squat', category: 'legs_glutes', primary_muscles: ['quads', 'glutes'] }),
  createExercise({ id: 'ex-3', name: 'Deadlift', category: 'back', primary_muscles: ['back', 'hamstrings'] }),
  createExercise({ id: 'ex-4', name: 'Bicep Curl', category: 'arms', primary_muscles: ['biceps'], is_custom: true }),
  createExercise({ id: 'ex-5', name: 'Shoulder Press', category: 'shoulders', primary_muscles: ['shoulders'] }),
  createExercise({ id: 'ex-6', name: 'Plank', category: 'abs_core', primary_muscles: ['core'] }),
  createExercise({ id: 'ex-7', name: 'Lat Pulldown', category: 'back', primary_muscles: ['lats'] }),
  createExercise({ id: 'ex-8', name: 'Cable Fly', category: 'chest', primary_muscles: ['chest'] }),
  createExercise({ id: 'ex-9', name: 'Leg Press', category: 'legs_glutes', primary_muscles: ['quads'] }),
  createExercise({ id: 'ex-10', name: 'Lateral Raise', category: 'shoulders', primary_muscles: ['shoulders'] }),
]

const mockGetAll = jest.fn().mockResolvedValue(exercises)
const mockGetById = jest.fn().mockImplementation((id: string) =>
  Promise.resolve(exercises.find((e) => e.id === id) ?? exercises[0])
)

jest.mock('../../lib/db', () => ({
  getAllExercises: (...args: unknown[]) => mockGetAll(...args),
  getExerciseById: (...args: unknown[]) => mockGetById(...args),
}))

import Exercises from '../../app/(tabs)/exercises'

// --- Tests ---

describe('Exercise Browser', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetIds()
    mockGetAll.mockResolvedValue(exercises)
  })

  it('renders exercise list after loading', async () => {
    const { findByText } = renderScreen(<Exercises />)
    expect(await findByText('Bench Press')).toBeTruthy()
    expect(await findByText('Squat')).toBeTruthy()
    expect(await findByText('Deadlift')).toBeTruthy()
  })

  it('shows search bar with a11y label', async () => {
    const { findByText, getByLabelText } = renderScreen(<Exercises />)
    await findByText('Bench Press')
    expect(getByLabelText('Search exercises')).toBeTruthy()
  })

  it('search filters exercises by name', async () => {
    const { findByText, getByLabelText, queryByText } = renderScreen(<Exercises />)
    await findByText('Bench Press')

    const search = getByLabelText('Search exercises')
    fireEvent.changeText(search, 'bench')

    await waitFor(() => {
      expect(queryByText('Bench Press')).toBeTruthy()
      expect(queryByText('Squat')).toBeNull()
      expect(queryByText('Deadlift')).toBeNull()
    })
  })

  it('category filter buttons filter the list', async () => {
    const { findByText, getByLabelText, queryByText } = renderScreen(<Exercises />)
    await findByText('Bench Press')

    fireEvent.press(getByLabelText('Filter by Chest'))

    await waitFor(() => {
      expect(queryByText('Bench Press')).toBeTruthy()
      expect(queryByText('Cable Fly')).toBeTruthy()
      expect(queryByText('Squat')).toBeNull()
      expect(queryByText('Deadlift')).toBeNull()
    })
  })

  it('tapping exercise navigates to exercise detail', async () => {
    const { findByText } = renderScreen(<Exercises />)
    const item = await findByText('Bench Press')
    fireEvent.press(item)
    expect(mockRouter.push).toHaveBeenCalledWith('/exercise/ex-1')
  })

  it('shows empty state when no exercises match filter', async () => {
    const { findByText, getByLabelText } = renderScreen(<Exercises />)
    await findByText('Bench Press')

    fireEvent.changeText(getByLabelText('Search exercises'), 'zzzznonexistent')

    expect(await findByText('No exercises found')).toBeTruthy()
    expect(await findByText('Try adjusting your search or filters')).toBeTruthy()
  })

  it('shows loading state initially (no empty message)', () => {
    // While loading=true, the empty component returns null
    mockGetAll.mockReturnValue(new Promise(() => {})) // never resolves
    const { queryByText } = renderScreen(<Exercises />)
    expect(queryByText('No exercises found')).toBeNull()
  })

  it('shows Custom badge on custom exercises', async () => {
    const { findByText, getAllByText } = renderScreen(<Exercises />)
    await findByText('Bicep Curl')
    expect(getAllByText('Custom').length).toBeGreaterThan(0)
  })

  it('FAB has add custom exercise a11y label', async () => {
    const { findByText, getByLabelText } = renderScreen(<Exercises />)
    await findByText('Bench Press')
    expect(getByLabelText('Add custom exercise')).toBeTruthy()
  })

  it('handles getAllExercises throwing error via ErrorBoundary', async () => {
    mockGetAll.mockImplementation(() => {
      throw new Error('DB error')
    })
    const ErrorBoundary = require('../../components/ErrorBoundary').default

    // Mock ErrorBoundary's dependencies
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const { findByText } = renderScreen(
      <ErrorBoundary><Exercises /></ErrorBoundary>
    )
    expect(await findByText('Something went wrong')).toBeTruthy()
    ;(console.error as jest.Mock).mockRestore()
  })
})
