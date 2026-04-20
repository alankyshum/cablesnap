import React from 'react'
import { render } from '@testing-library/react-native'

jest.mock('@/hooks/useColor', () => ({
  useColor: () => '#000000',
}))

import { Input, GroupedInputItem } from '../../components/ui/input'

describe('Input label truncation fix (BLD-421)', () => {
  it('renders full label text without truncation props', () => {
    const { getByText } = render(<Input label="Exercise Name" />)
    const label = getByText('Exercise Name')
    expect(label).toBeTruthy()
    // numberOfLines should NOT be set (no truncation)
    expect(label.props.numberOfLines).toBeUndefined()
  })

  it('renders long label text without truncation in GroupedInputItem', () => {
    const { getByText } = render(
      <GroupedInputItem label="Primary Muscle Group Target" />
    )
    const label = getByText('Primary Muscle Group Target')
    expect(label).toBeTruthy()
    expect(label.props.numberOfLines).toBeUndefined()
  })

  it('renders textarea label without truncation', () => {
    const { getByText } = render(
      <Input type="textarea" label="Exercise Notes" />
    )
    const label = getByText('Exercise Notes')
    expect(label).toBeTruthy()
    expect(label.props.numberOfLines).toBeUndefined()
  })

  it('renders without label when none provided', () => {
    const { queryByText } = render(<Input placeholder="Enter value" />)
    expect(queryByText('Exercise Name')).toBeNull()
  })
})
