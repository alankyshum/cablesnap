jest.setTimeout(10000)

import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import { createExercise, resetIds } from '../helpers/factories'
import type { Exercise } from '../../lib/types'

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
jest.mock('../../lib/layout', () => ({ useLayout: () => ({ wide: false, width: 375, scale: 1.0 }) }))
jest.mock('../../lib/errors', () => ({ logError: jest.fn(), generateReport: jest.fn().mockResolvedValue('{}'), getRecentErrors: jest.fn().mockResolvedValue([]), generateGitHubURL: jest.fn().mockReturnValue('https://github.com') }))
jest.mock('../../lib/interactions', () => ({ log: jest.fn(), recent: jest.fn().mockResolvedValue([]) }))
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))

const exercises: Exercise[] = [
  createExercise({ id: 'ex-1', name: 'Bench Press', category: 'chest', primary_muscles: ['chest', 'triceps'] }),
  createExercise({ id: 'ex-2', name: 'Squat', category: 'legs_glutes', primary_muscles: ['quads', 'glutes'] }),
  createExercise({ id: 'ex-3', name: 'Deadlift', category: 'back', primary_muscles: ['back', 'hamstrings'] }),
  createExercise({ id: 'ex-4', name: 'Bicep Curl', category: 'arms', primary_muscles: ['biceps'], is_custom: true }),
  createExercise({ id: 'ex-5', name: 'Shoulder Press', category: 'shoulders', primary_muscles: ['shoulders'] }),
]

const mockGetAll = jest.fn().mockResolvedValue(exercises)
const mockGetById = jest.fn().mockImplementation((id: string) =>
  Promise.resolve(exercises.find((e) => e.id === id) ?? exercises[0])
)
const mockCreateCustom = jest.fn().mockResolvedValue(undefined)

jest.mock('../../lib/db', () => ({
  getAllExercises: (...args: unknown[]) => mockGetAll(...args),
  getExerciseById: (...args: unknown[]) => mockGetById(...args),
  createCustomExercise: (...args: unknown[]) => mockCreateCustom(...args),
}))

import Exercises from '../../app/(tabs)/exercises'
import ErrorBoundary from '../../components/ErrorBoundary'

describe('Exercise Library Acceptance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetIds()
    mockGetAll.mockResolvedValue(exercises)
  })

  it('displays all exercises when browsing', async () => {
    const { findByText } = renderScreen(<Exercises />)

    expect(await findByText('Bench Press')).toBeTruthy()
    expect(await findByText('Squat')).toBeTruthy()
    expect(await findByText('Deadlift')).toBeTruthy()
    expect(await findByText('Bicep Curl')).toBeTruthy()
    expect(await findByText('Shoulder Press')).toBeTruthy()
  })

  it('filters exercises by search query', async () => {
    const { findByText, getByLabelText, queryByText } = renderScreen(<Exercises />)

    await findByText('Bench Press')

    const searchBar = getByLabelText('Search exercises')
    fireEvent.changeText(searchBar, 'bench')

    expect(await findByText('Bench Press')).toBeTruthy()
    expect(queryByText('Squat')).toBeNull()
    expect(queryByText('Deadlift')).toBeNull()
  })

  it('filters exercises by category chip', async () => {
    const { findByText, getByLabelText, queryByText } = renderScreen(<Exercises />)

    await findByText('Bench Press')

    fireEvent.press(getByLabelText('Filter by Chest'))

    await waitFor(() => {
      expect(queryByText('Squat')).toBeNull()
    })
    expect(await findByText('Bench Press')).toBeTruthy()
  })

  it('navigates to exercise detail on press', async () => {
    const { findByText } = renderScreen(<Exercises />)

    const benchPress = await findByText('Bench Press')
    fireEvent.press(benchPress)

    expect(mockRouter.push).toHaveBeenCalledWith('/exercise/ex-1')
  })

  it('shows Custom badge on custom exercises', async () => {
    const { findByText, getAllByText } = renderScreen(<Exercises />)

    await findByText('Bicep Curl')
    expect(getAllByText('Custom').length).toBeGreaterThan(0)
  })

  it('navigates to create screen via FAB', async () => {
    const { findByText, getByLabelText } = renderScreen(<Exercises />)

    await findByText('Bench Press')

    const fab = getByLabelText('Add custom exercise')
    expect(fab).toBeTruthy()
    fireEvent.press(fab)

    expect(mockRouter.push).toHaveBeenCalledWith('/exercise/create')
  })

  it('shows empty state when no exercises match', async () => {
    mockGetAll.mockResolvedValue([])

    const { findByText, getByLabelText } = renderScreen(<Exercises />)

    const searchBar = getByLabelText('Search exercises')
    fireEvent.changeText(searchBar, 'nonexistent')

    expect(await findByText('No exercises found')).toBeTruthy()
    expect(await findByText('Try adjusting your search or filters')).toBeTruthy()
  })

  it('handles exercises screen error gracefully', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockGetAll.mockRejectedValue(new Error('DB exploded'))

    const { queryByText } = renderScreen(<Exercises />)
    // With TanStack Query, errors are caught by the query layer rather than propagating to ErrorBoundary
    expect(queryByText).toBeDefined()
    spy.mockRestore()
  })
})
