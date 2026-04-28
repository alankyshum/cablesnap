import React from 'react'
import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../../helpers/render'

const mockPush = jest.fn()
const mockParams = { weight: '100', unit: 'kg' }
const mockGetBodySettings = jest.fn().mockResolvedValue({ weight_unit: 'kg' })
const mockGetAppSetting = jest.fn().mockResolvedValue(null)
const mockSetAppSetting = jest.fn().mockResolvedValue(undefined)

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  useGlobalSearchParams: () => mockParams,
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require('react')
    useEffect(() => {
      const cleanup = cb()
      if (typeof cleanup === 'function') return cleanup
    }, [cb])
  },
  Link: 'Link',
  Stack: { Screen: 'Screen' },
}))

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}))

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')

jest.mock('../../../lib/db', () => ({
  getBodySettings: (...args: unknown[]) => mockGetBodySettings(...args),
  getAppSetting: (...args: unknown[]) => mockGetAppSetting(...args),
  setAppSetting: (...args: unknown[]) => mockSetAppSetting(...args),
}))

import PlateCalculator from '../../../app/tools/plates'

describe('PlateCalculator screen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetBodySettings.mockResolvedValue({ weight_unit: 'kg' })
    mockGetAppSetting.mockResolvedValue(null)
    mockSetAppSetting.mockResolvedValue(undefined)
  })

  it('renders bar weight selection with kg/lb', async () => {
    const { getByLabelText } = renderScreen(<PlateCalculator />)
    await waitFor(() => {
      expect(getByLabelText('Bar weight selection')).toBeTruthy()
    })
  })

  it('renders target weight input', async () => {
    const { getByLabelText } = renderScreen(<PlateCalculator />)
    await waitFor(() => {
      expect(getByLabelText('Target weight in kilograms')).toBeTruthy()
    })
  })

  it('renders bar weight selection radiogroup', async () => {
    const { getByLabelText } = renderScreen(<PlateCalculator />)
    await waitFor(() => {
      expect(getByLabelText('Bar weight selection')).toBeTruthy()
    })
  })

  it('pre-fills target from search params', async () => {
    const { getByDisplayValue } = renderScreen(<PlateCalculator />)
    await waitFor(() => {
      expect(getByDisplayValue('100')).toBeTruthy()
    })
  })

  it('shows per-side calculation for valid input', async () => {
    const { getByText } = renderScreen(<PlateCalculator />)
    await waitFor(() => {
      expect(getByText(/per side/)).toBeTruthy()
    })
  })

  it('shows total weight confirmation', async () => {
    const { getByText } = renderScreen(<PlateCalculator />)
    await waitFor(() => {
      expect(getByText(/Total:/)).toBeTruthy()
    })
  })

  it('renders barbell diagram with accessibility label', async () => {
    const { getByLabelText } = renderScreen(<PlateCalculator />)
    await waitFor(() => {
      expect(getByLabelText(/Barbell loaded with/)).toBeTruthy()
    })
  })

  it('exports PlateCalculatorContent for embedding', async () => {
    const { PlateCalculatorContent } = require('../../../app/tools/plates')
    expect(typeof PlateCalculatorContent).toBe('function')
  })

  it('shows plate list items for 100kg target with 20kg bar', async () => {
    const { getAllByText } = renderScreen(<PlateCalculator />)
    await waitFor(() => {
      expect(getAllByText(/25kg/).length).toBeGreaterThanOrEqual(1)
      expect(getAllByText(/15kg/).length).toBeGreaterThanOrEqual(1)
    })
  })

  it('loads stored custom bar weight', async () => {
    mockGetAppSetting.mockResolvedValueOnce('17.5')
    const { getByDisplayValue } = renderScreen(<PlateCalculator />)
    await waitFor(() => {
      expect(getByDisplayValue('17.5')).toBeTruthy()
    })
  })

  it('auto-saves preset bar changes', async () => {
    jest.useFakeTimers()
    try {
      const { getByLabelText } = renderScreen(<PlateCalculator />)

      await waitFor(() => {
        expect(getByLabelText('15 kilograms bar')).toBeTruthy()
      })

      fireEvent.press(getByLabelText('15 kilograms bar'))
      await act(async () => {
        jest.advanceTimersByTime(300)
      })

      await waitFor(() => {
        expect(mockSetAppSetting).toHaveBeenCalledWith('plate_calculator_bar_kg', '15')
      })
    } finally {
      jest.useRealTimers()
    }
  })

  it('auto-saves custom bar input changes', async () => {
    jest.useFakeTimers()
    try {
      const { getByLabelText } = renderScreen(<PlateCalculator />)

      await waitFor(() => {
        expect(getByLabelText('Bar weight in kilograms')).toBeTruthy()
      })

      fireEvent.changeText(getByLabelText('Bar weight in kilograms'), '17.5')
      await act(async () => {
        jest.advanceTimersByTime(300)
      })

      await waitFor(() => {
        expect(mockSetAppSetting).toHaveBeenCalledWith('plate_calculator_bar_kg', '17.5')
      })
    } finally {
      jest.useRealTimers()
    }
  })
})
