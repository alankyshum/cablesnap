import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { AccessibilityInfo } from 'react-native'
import TrainingModeSelector from '../../components/TrainingModeSelector'
import { renderScreen } from '../helpers/render'

const announce = jest.fn()
jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(announce)

describe('TrainingModeSelector', () => {
  const modes = ['weight', 'eccentric_overload', 'band'] as const
  const defaults = {
    modes: [...modes],
    selected: 'weight' as const,
    exercise: 'Cable Curl',
    tempo: '',
    onSelect: jest.fn(),
    onTempoChange: jest.fn(),
    onTempoBlur: jest.fn(),
  }

  beforeEach(() => jest.clearAllMocks())

  it('renders chip for each mode', () => {
    const { getByText } = renderScreen(<TrainingModeSelector {...defaults} />)
    expect(getByText('Standard')).toBeTruthy()
    expect(getByText('Eccentric')).toBeTruthy()
    expect(getByText('Band')).toBeTruthy()
  })

  it('calls onSelect when a chip is pressed', () => {
    const { getByText } = renderScreen(<TrainingModeSelector {...defaults} />)
    fireEvent.press(getByText('Eccentric'))
    expect(defaults.onSelect).toHaveBeenCalledWith('eccentric_overload')
  })

  it('announces mode change for accessibility', () => {
    const { getByText } = renderScreen(<TrainingModeSelector {...defaults} />)
    fireEvent.press(getByText('Band'))
    expect(announce).toHaveBeenCalledWith(
      'Switched to Band mode'
    )
  })

  it('shows long-press description tooltip', async () => {
    const { getByText, queryByText } = renderScreen(<TrainingModeSelector {...defaults} />)
    expect(queryByText(/Normal cable weight/)).toBeNull()
    fireEvent(getByText('Standard'), 'onLongPress')
    await waitFor(() =>
      expect(getByText(/Normal cable weight resistance/)).toBeTruthy()
    )
  })

  it('does NOT show tempo field when mode is not eccentric', () => {
    const { queryByPlaceholderText } = renderScreen(
      <TrainingModeSelector {...defaults} selected="weight" />
    )
    expect(queryByPlaceholderText(/Tempo/)).toBeNull()
  })

  it('shows tempo field when eccentric mode is selected', () => {
    const { getByPlaceholderText, getByText } = renderScreen(
      <TrainingModeSelector {...defaults} selected="eccentric_overload" />
    )
    expect(getByPlaceholderText('Tempo (e.g. 3-1-5-1)')).toBeTruthy()
    expect(getByText(/Eccentric – Pause – Concentric – Pause/)).toBeTruthy()
  })

  it('calls onTempoChange when tempo text changes', () => {
    const { getByPlaceholderText } = renderScreen(
      <TrainingModeSelector {...defaults} selected="eccentric_overload" />
    )
    fireEvent.changeText(getByPlaceholderText('Tempo (e.g. 3-1-5-1)'), '3-1-5-1')
    expect(defaults.onTempoChange).toHaveBeenCalledWith('3-1-5-1')
  })

  it('has radiogroup accessibility role on container', () => {
    const { getByLabelText } = renderScreen(<TrainingModeSelector {...defaults} />)
    expect(getByLabelText('Training mode selector for Cable Curl')).toBeTruthy()
  })

  it('has radio accessibility role on individual chips', () => {
    const { getByLabelText } = renderScreen(<TrainingModeSelector {...defaults} />)
    const chip = getByLabelText('Standard training mode')
    expect(chip.props.accessibilityRole).toBe('radio')
  })

  it('marks selected chip as selected in accessibility state', () => {
    const { getByLabelText } = renderScreen(
      <TrainingModeSelector {...defaults} selected="band" />
    )
    const band = getByLabelText('Band training mode')
    expect(band.props.accessibilityState).toEqual({ selected: true })
    const std = getByLabelText('Standard training mode')
    expect(std.props.accessibilityState).toEqual({ selected: false })
  })

  it('tempo field has accessibility hint', () => {
    const { getByLabelText } = renderScreen(
      <TrainingModeSelector {...defaults} selected="eccentric_overload" />
    )
    const field = getByLabelText(/Tempo notation/)
    expect(field.props.accessibilityHint).toContain('eccentric, pause, concentric, pause')
  })
})
