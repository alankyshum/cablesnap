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
    onSelect: jest.fn(),
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

  it('does NOT show tempo field when eccentric mode is selected (tempo removed)', () => {
    const { queryByPlaceholderText } = renderScreen(
      <TrainingModeSelector {...defaults} selected="eccentric_overload" />
    )
    expect(queryByPlaceholderText(/Tempo/)).toBeNull()
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
})
