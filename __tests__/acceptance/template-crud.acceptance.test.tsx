jest.setTimeout(10000)

import React from 'react'
import { Alert } from 'react-native'
import { fireEvent, waitFor } from '@testing-library/react-native'
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
jest.mock('../../lib/layout', () => ({ useLayout: () => ({ wide: false, width: 375, scale: 1.0 }) }))
jest.mock('../../lib/errors', () => ({ logError: jest.fn(), generateReport: jest.fn().mockResolvedValue('{}'), getRecentErrors: jest.fn().mockResolvedValue([]), generateGitHubURL: jest.fn().mockReturnValue('https://github.com') }))
jest.mock('../../lib/interactions', () => ({ log: jest.fn(), recent: jest.fn().mockResolvedValue([]) }))
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))

const benchPress = createExercise({ id: 'ex-1', name: 'Bench Press', category: 'chest', primary_muscles: ['chest'] })
const squat = createExercise({ id: 'ex-2', name: 'Squat', category: 'legs_glutes', primary_muscles: ['quads'] })

const te1 = createTemplateExercise({
  id: 'te-1',
  template_id: 'tpl-1',
  exercise_id: 'ex-1',
  position: 0,
  target_sets: 3,
  target_reps: '8-12',
  rest_seconds: 90,
  exercise: benchPress,
})
const te2 = createTemplateExercise({
  id: 'te-2',
  template_id: 'tpl-1',
  exercise_id: 'ex-2',
  position: 1,
  target_sets: 4,
  target_reps: '6-8',
  rest_seconds: 120,
  exercise: squat,
})

const templateWithExercises = createWorkoutTemplate({
  id: 'tpl-1',
  name: 'Push Day',
  exercises: [te1, te2],
})

const emptyTemplate = createWorkoutTemplate({
  id: 'tpl-2',
  name: 'Empty Template',
  exercises: [],
})

const mockCreateTemplate = jest.fn()
const mockGetTemplateById = jest.fn()
const mockRemoveExercise = jest.fn()
const mockReorderExercises = jest.fn()
const mockUpdateName = jest.fn()
const mockDuplicate = jest.fn()
const mockCreateExerciseLink = jest.fn()
const mockUnlinkGroup = jest.fn()
const mockUnlinkSingle = jest.fn()

jest.mock('../../lib/db', () => ({
  createTemplate: (...args: unknown[]) => mockCreateTemplate(...args),
  getTemplateById: (...args: unknown[]) => mockGetTemplateById(...args),
  removeExerciseFromTemplate: (...args: unknown[]) => mockRemoveExercise(...args),
  reorderTemplateExercises: (...args: unknown[]) => mockReorderExercises(...args),
  updateTemplateName: (...args: unknown[]) => mockUpdateName(...args),
  duplicateTemplate: (...args: unknown[]) => mockDuplicate(...args),
  createExerciseLink: (...args: unknown[]) => mockCreateExerciseLink(...args),
  unlinkExerciseGroup: (...args: unknown[]) => mockUnlinkGroup(...args),
  unlinkSingleExercise: (...args: unknown[]) => mockUnlinkSingle(...args),
  getAllExercises: jest.fn().mockResolvedValue([]),
}))

import CreateTemplate from '../../app/template/create'
import EditTemplate from '../../app/template/[id]'

describe('Template CRUD Acceptance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetIds()
    mockParams = {}
    jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    mockCreateTemplate.mockResolvedValue(
      createWorkoutTemplate({ id: 'tpl-new', name: 'Push Day', exercises: [] }),
    )
    mockGetTemplateById.mockResolvedValue(templateWithExercises)
    mockRemoveExercise.mockResolvedValue(undefined)
    mockReorderExercises.mockResolvedValue(undefined)
    mockUpdateName.mockResolvedValue(undefined)
    mockDuplicate.mockResolvedValue('tpl-dup')
    mockCreateExerciseLink.mockResolvedValue('link-1')
    mockUnlinkGroup.mockResolvedValue(undefined)
    mockUnlinkSingle.mockResolvedValue(undefined)
  })

  describe('Create Template', () => {
    it('creates a new template when name is entered', async () => {
      const { getByPlaceholderText, getByLabelText } = renderScreen(<CreateTemplate />)

      fireEvent.changeText(getByPlaceholderText('e.g. Push Day, Full Body A'), 'Push Day')
      fireEvent.press(getByLabelText('Create template'))

      await waitFor(() => {
        expect(mockCreateTemplate).toHaveBeenCalledWith('Push Day')
      })
      expect(Alert.alert).toHaveBeenCalledWith(
        'Template Created',
        'Now add exercises to your template.',
      )
    })

    it('shows validation alert for empty name', async () => {
      const { getByLabelText } = renderScreen(<CreateTemplate />)

      fireEvent.press(getByLabelText('Create template'))

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith('Validation', 'Template name is required.')
      })
      expect(mockCreateTemplate).not.toHaveBeenCalled()
    })

    it('shows exercises section after template is created', async () => {
      const { getByPlaceholderText, getByLabelText, findByLabelText, findByText } = renderScreen(<CreateTemplate />)

      fireEvent.changeText(getByPlaceholderText('e.g. Push Day, Full Body A'), 'Push Day')
      fireEvent.press(getByLabelText('Create template'))

      expect(await findByLabelText('Add exercise to template')).toBeTruthy()
      expect(await findByText('No exercises yet. Add some below.')).toBeTruthy()
      expect(await findByLabelText('Done editing template')).toBeTruthy()
    })

    it('removes an exercise from template', async () => {
      mockParams = { templateId: 'tpl-1' }

      const { findByLabelText } = renderScreen(<CreateTemplate />)

      const removeBtn = await findByLabelText('Remove Bench Press')
      fireEvent.press(removeBtn)

      await waitFor(() => {
        expect(mockRemoveExercise).toHaveBeenCalledWith('te-1')
      })
    })

    it('shows validation alert when Done pressed with no exercises', async () => {
      mockParams = { templateId: 'tpl-2' }
      mockGetTemplateById.mockResolvedValue(emptyTemplate)

      const { findByLabelText } = renderScreen(<CreateTemplate />)

      const doneBtn = await findByLabelText('Done editing template')
      fireEvent.press(doneBtn)

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Validation',
          'Add at least 1 exercise to your template.',
        )
      })
      expect(mockRouter.back).not.toHaveBeenCalled()
    })

    it('saves name changes and navigates back on Done', async () => {
      mockParams = { templateId: 'tpl-1' }

      const { findByText, getByPlaceholderText, getByLabelText } = renderScreen(<CreateTemplate />)

      await findByText('Bench Press')

      fireEvent.changeText(getByPlaceholderText('e.g. Push Day, Full Body A'), 'Pull Day')
      fireEvent.press(getByLabelText('Done editing template'))

      await waitFor(() => {
        expect(mockUpdateName).toHaveBeenCalledWith('tpl-1', 'Pull Day')
      })
      expect(mockRouter.back).toHaveBeenCalled()
    })

    it('opens exercise picker on Add Exercise', async () => {
      mockParams = { templateId: 'tpl-1' }

      const { findByLabelText } = renderScreen(<CreateTemplate />)

      const addBtn = await findByLabelText('Add exercise to template')
      fireEvent.press(addBtn)

      const { getAllExercises } = require('../../lib/db')
      await waitFor(() => {
        expect(getAllExercises).toHaveBeenCalled()
      })
    })

    it('shows empty state message when no exercises', async () => {
      mockParams = { templateId: 'tpl-2' }
      mockGetTemplateById.mockResolvedValue(emptyTemplate)

      const { findByText } = renderScreen(<CreateTemplate />)

      expect(await findByText('No exercises yet. Add some below.')).toBeTruthy()
    })
  })

  describe('Edit Template ([id])', () => {
    it('shows exercises on load', async () => {
      mockParams = { id: 'tpl-1' }

      const { findByText } = renderScreen(<EditTemplate />)

      expect(await findByText('Bench Press')).toBeTruthy()
      expect(await findByText('Squat')).toBeTruthy()
      expect(await findByText('Exercises (2)')).toBeTruthy()
    })

    it('Done button calls router.back()', async () => {
      mockParams = { id: 'tpl-1' }

      const { findByLabelText } = renderScreen(<EditTemplate />)

      const doneBtn = await findByLabelText('Done editing template')
      fireEvent.press(doneBtn)

      expect(mockRouter.back).toHaveBeenCalled()
    })
  })
})
