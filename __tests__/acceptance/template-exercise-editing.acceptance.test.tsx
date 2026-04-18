jest.setTimeout(10000)

import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { Keyboard } from 'react-native'
import { renderScreen } from '../helpers/render'
import { createExercise, createTemplateExercise, resetIds } from '../helpers/factories'
import type { TemplateExercise, WorkoutTemplate } from '../../lib/types'

jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {})

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() }
const mockParams = { id: 'tpl-1' }

jest.mock('expo-router', () => {
  const RealReact = require('react')
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => mockParams,
    usePathname: () => '/template/tpl-1',
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

const mockToast = jest.fn()
jest.mock('../../components/ui/bna-toast', () => {
  const RealReact = require('react')
  return {
    __esModule: true,
    useToast: () => ({ toast: mockToast, success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn(), dismiss: jest.fn(), dismissAll: jest.fn() }),
    ToastProvider: ({ children }: { children: React.ReactNode }) => RealReact.createElement(RealReact.Fragment, null, children),
  }
})
jest.mock('../../lib/layout', () => ({ useLayout: () => ({ wide: false, width: 375, scale: 1.0, horizontalPadding: 16 }) }))
jest.mock('../../lib/errors', () => ({ logError: jest.fn(), generateReport: jest.fn().mockResolvedValue('{}'), getRecentErrors: jest.fn().mockResolvedValue([]), generateGitHubURL: jest.fn().mockReturnValue('https://github.com') }))
jest.mock('../../lib/interactions', () => ({ log: jest.fn(), recent: jest.fn().mockResolvedValue([]) }))
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))

// Mock sheets to avoid Portal issues in test renderer
jest.mock('../../components/ExercisePickerSheet', () => {
  const RealReact = require('react')
  return { __esModule: true, default: ({ visible }: { visible: boolean }) => {
    if (!visible) return null
    return RealReact.createElement('View', { testID: 'exercise-picker-sheet' })
  }}
})

let mockEditSheetProps: { visible: boolean; exercise: TemplateExercise | null; onSave: (...args: unknown[]) => void; onDismiss: () => void } | null = null
jest.mock('../../components/EditExerciseSheet', () => {
  const RealReact = require('react')
  return { __esModule: true, default: (props: { visible: boolean; exercise: TemplateExercise | null; onSave: (...args: unknown[]) => void; onDismiss: () => void }) => {
    mockEditSheetProps = props
    if (!props.visible) return null
    return RealReact.createElement('View', { testID: 'edit-exercise-sheet' },
      RealReact.createElement('View', {
        testID: 'edit-sheet-save',
        accessibilityLabel: 'Save exercise settings',
        accessibilityRole: 'button',
        onPress: () => props.onSave(
          props.exercise?.target_sets ?? 3,
          props.exercise?.target_reps ?? '8-12',
          props.exercise?.rest_seconds ?? 90
        ),
      }),
    )
  }}
})
const mockExercise1 = createExercise({ id: 'ex-1', name: 'Bench Press', category: 'chest' })
const mockExercise2 = createExercise({ id: 'ex-2', name: 'Squat', category: 'legs_glutes' })

const mockTemplateExercises: TemplateExercise[] = [
  createTemplateExercise({ id: 'te-1', template_id: 'tpl-1', exercise_id: 'ex-1', position: 0, target_sets: 4, target_reps: '6-8', rest_seconds: 120, exercise: mockExercise1 }),
  createTemplateExercise({ id: 'te-2', template_id: 'tpl-1', exercise_id: 'ex-2', position: 1, target_sets: 3, target_reps: '10', rest_seconds: 90, exercise: mockExercise2 }),
]

const mockTemplate: WorkoutTemplate & { exercises: TemplateExercise[] } = {
  id: 'tpl-1',
  name: 'Push Day',
  created_at: Date.now(),
  updated_at: Date.now(),
  is_starter: false,
  exercises: mockTemplateExercises,
}

const mockGetTemplateById = jest.fn().mockResolvedValue(mockTemplate)
const mockUpdateTemplateExercise = jest.fn().mockResolvedValue(undefined)

jest.mock('../../lib/db', () => ({
  getTemplateById: (...args: unknown[]) => mockGetTemplateById(...args),
  updateTemplateExercise: (...args: unknown[]) => mockUpdateTemplateExercise(...args),
  addExerciseToTemplate: jest.fn().mockResolvedValue(undefined),
  removeExerciseFromTemplate: jest.fn().mockResolvedValue(undefined),
  reorderTemplateExercises: jest.fn().mockResolvedValue(undefined),
  getTemplateExerciseCount: jest.fn().mockResolvedValue(2),
  createExerciseLink: jest.fn().mockResolvedValue(undefined),
  duplicateTemplate: jest.fn().mockResolvedValue('tpl-2'),
  unlinkExerciseGroup: jest.fn().mockResolvedValue(undefined),
  unlinkSingleExercise: jest.fn().mockResolvedValue(undefined),
  getAppSetting: jest.fn().mockResolvedValue(null),
  getAllExercises: jest.fn().mockResolvedValue([mockExercise1, mockExercise2]),
}))

import EditTemplate from '../../app/template/[id]'

describe('Template Exercise Editing Acceptance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetIds()
    mockGetTemplateById.mockResolvedValue(mockTemplate)
    mockUpdateTemplateExercise.mockResolvedValue(undefined)
    mockEditSheetProps = null
  })

  it('opens edit sheet when tapping an exercise row', async () => {
    const { findByText, findByTestId } = renderScreen(<EditTemplate />)
    const benchText = await findByText('Bench Press')
    // The Pressable parent has the onPress handler - find the closest pressable ancestor
    fireEvent.press(benchText)
    expect(await findByTestId('edit-exercise-sheet')).toBeTruthy()
  })

  it('opens edit sheet when tapping pencil icon', async () => {
    const { findByText, findByTestId, findAllByLabelText } = renderScreen(<EditTemplate />)
    await findByText('Bench Press')
    // Find pencil icon by its accessibility label
    const editBtns = await findAllByLabelText('Edit Bench Press settings')
    fireEvent.press(editBtns[0])
    expect(await findByTestId('edit-exercise-sheet')).toBeTruthy()
  })

  it('calls updateTemplateExercise with correct args on save', async () => {
    const { findByText, findByTestId } = renderScreen(<EditTemplate />)
    const benchText = await findByText('Bench Press')
    fireEvent.press(benchText)

    await findByTestId('edit-exercise-sheet')
    if (mockEditSheetProps) {
      mockEditSheetProps.onSave(5, '3-5', 90)
    }

    await waitFor(() => {
      expect(mockUpdateTemplateExercise).toHaveBeenCalledWith('te-1', 'tpl-1', 5, '3-5', 90)
    })
  })

  it('shows toast on save failure', async () => {
    mockUpdateTemplateExercise.mockRejectedValueOnce(new Error('DB error'))
    const { findByText, findByTestId } = renderScreen(<EditTemplate />)

    const benchText = await findByText('Bench Press')
    fireEvent.press(benchText)

    await findByTestId('edit-exercise-sheet')
    if (mockEditSheetProps) {
      mockEditSheetProps.onSave(4, '6-8', 120)
    }

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith('Failed to update exercise settings')
    })
  })

  it('refetches template data after successful save', async () => {
    const { findByText, findByTestId } = renderScreen(<EditTemplate />)

    await waitFor(() => {
      expect(mockGetTemplateById).toHaveBeenCalledTimes(1)
    })

    const benchText = await findByText('Bench Press')
    fireEvent.press(benchText)

    await findByTestId('edit-exercise-sheet')
    if (mockEditSheetProps) {
      mockEditSheetProps.onSave(4, '6-8', 120)
    }

    await waitFor(() => {
      expect(mockGetTemplateById).toHaveBeenCalledTimes(2)
    })
  })

  it('does not open edit sheet in selection mode', async () => {
    const { findByText, queryByTestId } = renderScreen(<EditTemplate />)
    // Long-press to enter selection mode
    const benchText = await findByText('Bench Press')
    fireEvent(benchText, 'onLongPress')

    // In selection mode, pressing toggles selection — doesn't open edit
    fireEvent.press(benchText)
    expect(queryByTestId('edit-exercise-sheet')).toBeNull()
  })

  it('preserves link_id when editing linked exercises', async () => {
    const mockLinkedExercises: TemplateExercise[] = [
      createTemplateExercise({ id: 'te-1', template_id: 'tpl-1', exercise_id: 'ex-1', position: 0, target_sets: 4, target_reps: '6-8', rest_seconds: 120, link_id: 'link-1', link_label: 'A', exercise: mockExercise1 }),
      createTemplateExercise({ id: 'te-2', template_id: 'tpl-1', exercise_id: 'ex-2', position: 1, target_sets: 3, target_reps: '10', rest_seconds: 90, link_id: 'link-1', link_label: 'A', exercise: mockExercise2 }),
    ]
    mockGetTemplateById.mockResolvedValue({ ...mockTemplate, exercises: mockLinkedExercises })

    const { findByText, findByTestId } = renderScreen(<EditTemplate />)
    const benchText = await findByText('Bench Press')
    fireEvent.press(benchText)

    await findByTestId('edit-exercise-sheet')
    if (mockEditSheetProps) {
      mockEditSheetProps.onSave(5, '3-5', 60)
    }

    await waitFor(() => {
      // Only sets/reps/rest updated, not link_id
      expect(mockUpdateTemplateExercise).toHaveBeenCalledWith('te-1', 'tpl-1', 5, '3-5', 60)
    })
  })
})
