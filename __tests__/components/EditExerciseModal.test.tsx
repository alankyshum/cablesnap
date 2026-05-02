import React from 'react'
import { fireEvent } from '@testing-library/react-native'
import { Keyboard } from 'react-native'
import EditExerciseModal from '../../components/EditExerciseModal'
import { renderScreen } from '../helpers/render'
import type { TemplateExercise } from '../../lib/types'

jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {})

const baseExercise: TemplateExercise = {
  id: 'te-1',
  template_id: 'tpl-1',
  exercise_id: 'ex-1',
  position: 0,
  target_sets: 4,
  target_reps: '6-8',
  rest_seconds: 120,
  link_id: null,
  link_label: '',
  target_duration_seconds: null,
  set_types: ['warmup', 'normal', 'dropset', 'failure'],
  exercise: { id: 'ex-1', name: 'Bench Press', category: 'chest', primary_muscles: ['chest'], secondary_muscles: ['triceps'], equipment: 'barbell', instructions: '', difficulty: 'intermediate', is_custom: false, deleted_at: null } as TemplateExercise['exercise'],
}

describe('EditExerciseModal', () => {
  const onSave = jest.fn()
  const onDismiss = jest.fn()

  beforeEach(() => jest.clearAllMocks())

  it('renders nothing visible when not visible', () => {
    const { queryByText } = renderScreen(
      <EditExerciseModal visible={false} exercise={baseExercise} onSave={onSave} onDismiss={onDismiss} />
    )
    // RN Modal in test renderer does not mount children when visible=false
    expect(queryByText('Bench Press')).toBeNull()
  })

  it('renders pre-filled values when visible', () => {
    const { getByDisplayValue, getByText, getByLabelText } = renderScreen(
      <EditExerciseModal visible={true} exercise={baseExercise} onSave={onSave} onDismiss={onDismiss} />
    )
    expect(getByText('Bench Press')).toBeTruthy()
    expect(getByDisplayValue('4')).toBeTruthy()
    expect(getByDisplayValue('6-8')).toBeTruthy()
    expect(getByDisplayValue('120')).toBeTruthy()
    expect(getByLabelText('Set 1 type: Warm-up')).toBeTruthy()
    expect(getByLabelText('Set 4 type: Failure')).toBeTruthy()
  })

  it('uses default fallbacks when exercise has null values', () => {
    const nullExercise = {
      ...baseExercise,
      target_sets: null as unknown as number,
      target_reps: null as unknown as string,
      rest_seconds: null as unknown as number,
    }
    const { getByDisplayValue } = renderScreen(
      <EditExerciseModal visible={true} exercise={nullExercise} onSave={onSave} onDismiss={onDismiss} />
    )
    expect(getByDisplayValue('3')).toBeTruthy()
    expect(getByDisplayValue('8-12')).toBeTruthy()
    expect(getByDisplayValue('90')).toBeTruthy()
  })

  it('uses defaults when exercise is null', () => {
    const { getByDisplayValue } = renderScreen(
      <EditExerciseModal visible={true} exercise={null} onSave={onSave} onDismiss={onDismiss} />
    )
    expect(getByDisplayValue('3')).toBeTruthy()
    expect(getByDisplayValue('8-12')).toBeTruthy()
    expect(getByDisplayValue('90')).toBeTruthy()
  })

  it('calls onSave with parsed values and dismisses keyboard', () => {
    const { getByLabelText } = renderScreen(
      <EditExerciseModal visible={true} exercise={baseExercise} onSave={onSave} onDismiss={onDismiss} />
    )
    fireEvent.press(getByLabelText('Save exercise settings'))
    expect(Keyboard.dismiss).toHaveBeenCalled()
    expect(onSave).toHaveBeenCalledWith(4, '6-8', 120, ['warmup', 'normal', 'dropset', 'failure'])
  })

  it('cycles set type chips before saving', () => {
    const { getByLabelText } = renderScreen(
      <EditExerciseModal visible={true} exercise={baseExercise} onSave={onSave} onDismiss={onDismiss} />
    )
    fireEvent.press(getByLabelText('Set 2 type: Normal'))
    fireEvent.press(getByLabelText('Save exercise settings'))
    expect(onSave).toHaveBeenCalledWith(4, '6-8', 120, ['warmup', 'warmup', 'dropset', 'failure'])
  })

  it('calls onDismiss when Cancel is pressed', () => {
    const { getByLabelText } = renderScreen(
      <EditExerciseModal visible={true} exercise={baseExercise} onSave={onSave} onDismiss={onDismiss} />
    )
    fireEvent.press(getByLabelText('Cancel editing'))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('calls onDismiss when backdrop is pressed', () => {
    const { getByLabelText } = renderScreen(
      <EditExerciseModal visible={true} exercise={baseExercise} onSave={onSave} onDismiss={onDismiss} />
    )
    fireEvent.press(getByLabelText('Close edit exercise modal'))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('disables Save when sets is 0', () => {
    const { getByLabelText } = renderScreen(
      <EditExerciseModal visible={true} exercise={baseExercise} onSave={onSave} onDismiss={onDismiss} />
    )
    fireEvent.changeText(getByLabelText('Target sets'), '0')
    fireEvent.press(getByLabelText('Save exercise settings'))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('disables Save when reps is empty', () => {
    const { getByLabelText } = renderScreen(
      <EditExerciseModal visible={true} exercise={baseExercise} onSave={onSave} onDismiss={onDismiss} />
    )
    fireEvent.changeText(getByLabelText('Target reps'), '')
    fireEvent.press(getByLabelText('Save exercise settings'))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('disables Save when rest is negative', () => {
    const { getByLabelText } = renderScreen(
      <EditExerciseModal visible={true} exercise={baseExercise} onSave={onSave} onDismiss={onDismiss} />
    )
    fireEvent.changeText(getByLabelText('Rest time in seconds'), '-1')
    fireEvent.press(getByLabelText('Save exercise settings'))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('allows rest of 0 seconds', () => {
    const { getByLabelText } = renderScreen(
      <EditExerciseModal visible={true} exercise={baseExercise} onSave={onSave} onDismiss={onDismiss} />
    )
    fireEvent.changeText(getByLabelText('Rest time in seconds'), '0')
    fireEvent.press(getByLabelText('Save exercise settings'))
    expect(onSave).toHaveBeenCalledWith(4, '6-8', 0, ['warmup', 'normal', 'dropset', 'failure'])
  })

  it('allows AMRAP as reps value', () => {
    const { getByLabelText } = renderScreen(
      <EditExerciseModal visible={true} exercise={baseExercise} onSave={onSave} onDismiss={onDismiss} />
    )
    fireEvent.changeText(getByLabelText('Target reps'), 'AMRAP')
    fireEvent.press(getByLabelText('Save exercise settings'))
    expect(onSave).toHaveBeenCalledWith(4, 'AMRAP', 120, ['warmup', 'normal', 'dropset', 'failure'])
  })

  it('has accessibilityViewIsModal on the modal card', () => {
    const { getByLabelText } = renderScreen(
      <EditExerciseModal visible={true} exercise={baseExercise} onSave={onSave} onDismiss={onDismiss} />
    )
    const saveBtn = getByLabelText('Save exercise settings')
    let node: { props?: Record<string, unknown>; parent?: unknown } = saveBtn
    let found = false
    while (node.parent) {
      if (node.props?.accessibilityViewIsModal === true) {
        found = true
        break
      }
      node = node.parent as typeof node
    }
    expect(found).toBe(true)
  })

  it('renders inside a centered Modal (not bottom-anchored sheet)', () => {
    const { UNSAFE_getByType } = renderScreen(
      <EditExerciseModal visible={true} exercise={baseExercise} onSave={onSave} onDismiss={onDismiss} />
    )
    // Asserts our card uses RN Modal with onRequestClose for Android back-button support
    const RN = require('react-native')
    const modal = UNSAFE_getByType(RN.Modal)
    expect(modal.props.transparent).toBe(true)
    expect(modal.props.animationType).toBe('fade')
    expect(typeof modal.props.onRequestClose).toBe('function')
  })
})
