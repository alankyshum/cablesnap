jest.setTimeout(10000)

import React from 'react'
import { Alert } from 'react-native'
import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import { createWorkoutTemplate, createTemplateExercise, createExercise, resetIds } from '../helpers/factories'

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() }
let mockParams: Record<string, string> = {}

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
jest.mock('../../components/ui/bna-toast', () => {
  const RealReact = require('react')
  return {
    __esModule: true,
    useToast: () => ({ toast: jest.fn(), success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn(), dismiss: jest.fn(), dismissAll: jest.fn() }),
    ToastProvider: ({ children }: { children: React.ReactNode }) => RealReact.createElement(RealReact.Fragment, null, children),
  }
})
jest.mock('../../lib/layout', () => ({ useLayout: () => ({ wide: false, width: 375, scale: 1.0 }) }))
jest.mock('../../lib/errors', () => ({ logError: jest.fn(), generateReport: jest.fn().mockResolvedValue('{}'), getRecentErrors: jest.fn().mockResolvedValue([]), generateGitHubURL: jest.fn().mockReturnValue('https://github.com') }))
jest.mock('../../lib/interactions', () => ({ log: jest.fn(), recent: jest.fn().mockResolvedValue([]) }))
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))

let capturedOnPick: ((exercise: { id: string; name: string }) => void) | null = null

jest.mock('../../components/ExercisePickerSheet', () => {
  const RealReact = require('react')
  function MockPickerSheet({ visible, onPick }: { visible: boolean; onPick: (ex: { id: string }) => void; onDismiss: () => void }) {
    RealReact.useEffect(() => {
      if (visible) capturedOnPick = onPick as typeof capturedOnPick
    }, [visible, onPick])
    return visible ? RealReact.createElement('View', { testID: 'exercise-picker-sheet' }) : null
  }
  return { __esModule: true, default: MockPickerSheet }
})

const benchPress = createExercise({ id: 'ex-1', name: 'Bench Press', category: 'chest', primary_muscles: ['chest'] })
const squat = createExercise({ id: 'ex-2', name: 'Squat', category: 'legs_glutes', primary_muscles: ['quads'] })

const mockCreateTemplate = jest.fn()
const mockGetTemplateById = jest.fn()
const mockGetAllExercises = jest.fn()
const mockGetTemplateExerciseCount = jest.fn()
const mockAddExerciseToTemplate = jest.fn()
const mockRemoveExercise = jest.fn()
const mockReorderExercises = jest.fn()
const mockUpdateName = jest.fn()

jest.mock('../../lib/db', () => ({
  createTemplate: (...args: unknown[]) => mockCreateTemplate(...args),
  getTemplateById: (...args: unknown[]) => mockGetTemplateById(...args),
  getAllExercises: (...args: unknown[]) => mockGetAllExercises(...args),
  getTemplateExerciseCount: (...args: unknown[]) => mockGetTemplateExerciseCount(...args),
  addExerciseToTemplate: (...args: unknown[]) => mockAddExerciseToTemplate(...args),
  removeExerciseFromTemplate: (...args: unknown[]) => mockRemoveExercise(...args),
  reorderTemplateExercises: (...args: unknown[]) => mockReorderExercises(...args),
  updateTemplateName: (...args: unknown[]) => mockUpdateName(...args),
}))

import CreateTemplate from '../../app/template/create'

describe('Template → Add Exercise Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetIds()
    mockParams = {}
    capturedOnPick = null
    jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    mockGetAllExercises.mockResolvedValue([benchPress, squat])
    mockGetTemplateExerciseCount.mockResolvedValue(0)
    mockAddExerciseToTemplate.mockResolvedValue(undefined)
  })

  it('creates template, picks an exercise via sheet, and shows it within 500ms', async () => {
    const emptyTemplate = createWorkoutTemplate({ id: 'tpl-new', name: 'Push Day', exercises: [] })
    const te = createTemplateExercise({
      id: 'te-1',
      template_id: 'tpl-new',
      exercise_id: 'ex-1',
      position: 0,
      exercise: benchPress,
    })
    const templateWithExercise = createWorkoutTemplate({
      id: 'tpl-new',
      name: 'Push Day',
      exercises: [te],
    })

    mockCreateTemplate.mockResolvedValue(emptyTemplate)
    mockGetTemplateById.mockResolvedValue(emptyTemplate)

    const { getByPlaceholderText, getByLabelText, findByLabelText, findByText, getByTestId } = renderScreen(<CreateTemplate />)

    fireEvent.changeText(getByPlaceholderText('Template Name'), 'Push Day')
    fireEvent.press(getByLabelText('Create template'))

    await waitFor(() => {
      expect(mockCreateTemplate).toHaveBeenCalledWith('Push Day')
    })

    // Press Add Exercise — opens the bottom sheet (no navigation)
    const addBtn = await findByLabelText('Add exercise to template')
    fireEvent.press(addBtn)

    await waitFor(() => {
      expect(getByTestId('exercise-picker-sheet')).toBeTruthy()
    })

    // Simulate picking Bench Press via the sheet's onPick callback
    mockGetTemplateById.mockResolvedValue(templateWithExercise)
    await act(async () => {
      capturedOnPick!(benchPress)
    })

    await waitFor(() => {
      expect(mockAddExerciseToTemplate).toHaveBeenCalledWith('tpl-new', 'ex-1', 0)
    })

    // Sheet should dismiss and exercise should appear
    expect(await findByText('Bench Press', {}, { timeout: 500 })).toBeTruthy()
    expect(await findByText('Exercises (1)', {}, { timeout: 500 })).toBeTruthy()
  })

  it('adds multiple exercises via sheet and all appear within 500ms', async () => {
    const te1 = createTemplateExercise({
      id: 'te-1', template_id: 'tpl-new', exercise_id: 'ex-1', position: 0, exercise: benchPress,
    })
    const te2 = createTemplateExercise({
      id: 'te-2', template_id: 'tpl-new', exercise_id: 'ex-2', position: 1, exercise: squat,
    })
    const templateAfterFirst = createWorkoutTemplate({ id: 'tpl-new', name: 'Full Body', exercises: [te1] })
    const templateAfterSecond = createWorkoutTemplate({ id: 'tpl-new', name: 'Full Body', exercises: [te1, te2] })

    const emptyTemplate = createWorkoutTemplate({ id: 'tpl-new', name: 'Full Body', exercises: [] })
    mockParams = { templateId: 'tpl-new' }
    mockGetTemplateById.mockResolvedValue(emptyTemplate)

    const screen = renderScreen(<CreateTemplate />)
    await screen.findByText('No exercises yet. Add some below.')

    // Add first exercise
    fireEvent.press(await screen.findByLabelText('Add exercise to template'))
    await waitFor(() => expect(screen.getByTestId('exercise-picker-sheet')).toBeTruthy())

    mockGetTemplateById.mockResolvedValue(templateAfterFirst)
    mockGetTemplateExerciseCount.mockResolvedValue(0)
    await act(async () => { capturedOnPick!(benchPress) })

    await waitFor(() => {
      expect(mockAddExerciseToTemplate).toHaveBeenCalledWith('tpl-new', 'ex-1', 0)
    })
    expect(await screen.findByText('Bench Press', {}, { timeout: 500 })).toBeTruthy()

    // Add second exercise
    jest.clearAllMocks()
    mockGetTemplateById.mockResolvedValue(templateAfterFirst)
    mockGetTemplateExerciseCount.mockResolvedValue(1)
    mockAddExerciseToTemplate.mockResolvedValue(undefined)

    fireEvent.press(await screen.findByLabelText('Add exercise to template'))

    mockGetTemplateById.mockResolvedValue(templateAfterSecond)
    await act(async () => { capturedOnPick!(squat) })

    await waitFor(() => {
      expect(mockAddExerciseToTemplate).toHaveBeenCalledWith('tpl-new', 'ex-2', 1)
    })

    expect(await screen.findByText('Bench Press', {}, { timeout: 500 })).toBeTruthy()
    expect(await screen.findByText('Squat', {}, { timeout: 500 })).toBeTruthy()
    expect(await screen.findByText('Exercises (2)', {}, { timeout: 500 })).toBeTruthy()

    // Verify ordering: Squat is last
    const names = screen.getAllByText(/^(Bench Press|Squat)$/)
    expect(names).toHaveLength(2)
    expect(names[0]).toHaveTextContent('Bench Press')
    expect(names[1]).toHaveTextContent('Squat')
  })
})
