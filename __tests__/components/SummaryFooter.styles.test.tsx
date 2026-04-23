/**
 * BLD-508: Lock style contract for SummaryFooter share preview modal.
 * - shareCardWrapper must NOT contain `transformOrigin` (invalid in RN).
 * - previewContainer `maxHeight` must be a number (not a percentage string).
 * - previewOverlay / previewActions must use the `scrim` design tokens.
 */

import React from 'react'
import { StyleSheet, Dimensions } from 'react-native'
import { render } from '@testing-library/react-native'
import SummaryFooter from '../../components/session/summary/SummaryFooter'
import { scrim } from '../../constants/design-tokens'

jest.mock('../../components/ShareCard', () => {
  const React = require('react')
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) =>
      React.createElement('ShareCard', props),
  }
})

function makeProps(overrides: Partial<React.ComponentProps<typeof SummaryFooter>> = {}) {
  return {
    colors: {
      surface: '#fff',
      surfaceVariant: '#eee',
      onSurface: '#000',
      onSurfaceDisabled: '#888',
      outline: '#ccc',
      primary: '#0af',
    } as unknown as React.ComponentProps<typeof SummaryFooter>['colors'],
    session: { completed_at: 1700000000, name: 'Test workout' },
    completedSetCount: 5,
    templateModalVisible: false,
    setTemplateModalVisible: jest.fn(),
    templateName: '',
    setTemplateName: jest.fn(),
    saving: false,
    handleSaveAsTemplate: jest.fn(),
    onDone: jest.fn(),
    onViewDetails: jest.fn(),
    onSharePress: jest.fn(),
    previewVisible: true,
    setPreviewVisible: jest.fn(),
    imageLoading: false,
    setImageLoading: jest.fn(),
    shareCardRef: { current: null },
    handleCaptureAndShare: jest.fn(),
    shareCardDate: '2026-01-01',
    duration: '1h',
    completedCount: 5,
    volumeDisplay: '1000',
    unit: 'kg' as const,
    rating: 4,
    shareCardPrs: [],
    shareCardExercises: [],
    ...overrides,
  }
}

describe('SummaryFooter — share preview style contract (BLD-508)', () => {
  it('does not set transformOrigin on share card wrapper', () => {
    const screen = render(<SummaryFooter {...makeProps()} />)
    const wrapper = screen.getByTestId('summary-share-card-wrapper')
    const flat = StyleSheet.flatten(wrapper.props.style) ?? {}
    expect(flat).not.toHaveProperty('transformOrigin')
  })

  it('uses a numeric maxHeight on preview container (not percentage string)', () => {
    const screen = render(<SummaryFooter {...makeProps()} />)
    const container = screen.getByTestId('summary-preview-container')
    const flat = StyleSheet.flatten(container.props.style) ?? {}
    expect(typeof flat.maxHeight).toBe('number')
    const expected = Dimensions.get('window').height * 0.85
    expect(flat.maxHeight).toBeCloseTo(expected, 5)
  })

  it('preview overlay uses the heavy scrim token', () => {
    const screen = render(<SummaryFooter {...makeProps()} />)
    const overlay = screen.getByTestId('summary-preview-overlay')
    const flat = StyleSheet.flatten(overlay.props.style) ?? {}
    expect(flat.backgroundColor).toBe(scrim.heavy)
  })

  it('preview actions bar uses the light scrim token', () => {
    const screen = render(<SummaryFooter {...makeProps()} />)
    const actions = screen.getByTestId('summary-preview-actions')
    const flat = StyleSheet.flatten(actions.props.style) ?? {}
    expect(flat.backgroundColor).toBe(scrim.light)
  })
})
