jest.setTimeout(10000)

import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'

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
      }, [cb])
    },
    Stack: { Screen: () => null },
    Redirect: () => null,
  }
})

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')
jest.mock('../../lib/layout', () => ({
  useLayout: () => ({ wide: false, width: 375, scale: 1.0, horizontalPadding: 16, atLeastMedium: false }),
}))
jest.mock('../../lib/errors', () => ({
  logError: jest.fn(),
  generateReport: jest.fn().mockResolvedValue('{}'),
  getRecentErrors: jest.fn().mockResolvedValue([]),
  generateGitHubURL: jest.fn().mockReturnValue('https://github.com'),
}))
jest.mock('../../lib/interactions', () => ({ log: jest.fn() }))
jest.mock('expo-file-system', () => ({
  File: jest.fn(),
  Paths: { cache: '/cache' },
}))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))

const mockGetBodySettings = jest.fn().mockResolvedValue({
  weight_unit: 'kg',
  measurement_unit: 'cm',
  weight_goal: 75,
  body_fat_goal: 15,
})
const mockUpdateBodySettings = jest.fn().mockResolvedValue(undefined)
const mockGetLatestMeasurements = jest.fn().mockResolvedValue({
  waist: 80,
  chest: 100,
  hips: 95,
  left_arm: 35,
  right_arm: 35.5,
  left_thigh: 55,
  right_thigh: 55,
  left_calf: 37,
  right_calf: 37,
  neck: 38,
  body_fat: 18,
})
const mockUpsertBodyMeasurements = jest.fn().mockResolvedValue(undefined)

jest.mock('../../lib/db', () => ({
  getBodySettings: (...args: unknown[]) => mockGetBodySettings(...args),
  updateBodySettings: (...args: unknown[]) => mockUpdateBodySettings(...args),
  getLatestMeasurements: (...args: unknown[]) => mockGetLatestMeasurements(...args),
  upsertBodyMeasurements: (...args: unknown[]) => mockUpsertBodyMeasurements(...args),
}))

import Goals from '../../app/body/goals'
import Measurements from '../../app/body/measurements'

describe('Body Measurements Acceptance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetBodySettings.mockResolvedValue({
      weight_unit: 'kg',
      measurement_unit: 'cm',
      weight_goal: 75,
      body_fat_goal: 15,
    })
    mockGetLatestMeasurements.mockResolvedValue({
      waist: 80,
      chest: 100,
      hips: 95,
      left_arm: 35,
      right_arm: 35.5,
      left_thigh: 55,
      right_thigh: 55,
      left_calf: 37,
      right_calf: 37,
      neck: 38,
      body_fat: 18,
    })
  })

  // ── Goals Screen ──────────────────────────────────

  describe('Goals screen', () => {
    it('renders Body Goals heading', async () => {
      const { findByText } = renderScreen(<Goals />)
      expect(await findByText('Body Goals')).toBeTruthy()
    })

    it('shows editable weight goal input with value from db', async () => {
      const { findByLabelText } = renderScreen(<Goals />)
      const input = await findByLabelText('Weight goal in kg')
      await waitFor(() => {
        expect(input.props.value).toBe('75')
      })
    })

    it('shows editable body fat goal input with value from db', async () => {
      const { findByLabelText } = renderScreen(<Goals />)
      const input = await findByLabelText('Body fat percentage goal')
      await waitFor(() => {
        expect(input.props.value).toBe('15')
      })
    })

    it('weight goal input is editable', async () => {
      const { findByLabelText } = renderScreen(<Goals />)
      const input = await findByLabelText('Weight goal in kg')
      await waitFor(() => expect(input.props.value).toBe('75'))
      fireEvent.changeText(input, '80')
      expect(input.props.value).toBe('80')
    })

    it('body fat goal input is editable', async () => {
      const { findByLabelText } = renderScreen(<Goals />)
      const input = await findByLabelText('Body fat percentage goal')
      await waitFor(() => expect(input.props.value).toBe('15'))
      fireEvent.changeText(input, '12')
      expect(input.props.value).toBe('12')
    })

    it('Save button calls updateBodySettings and navigates back', async () => {
      const { findByLabelText } = renderScreen(<Goals />)
      await findByLabelText('Weight goal in kg')

      const saveBtn = await findByLabelText('Save body goals')
      fireEvent.press(saveBtn)

      await waitFor(() => {
        expect(mockUpdateBodySettings).toHaveBeenCalledWith('kg', 'cm', 75, 15)
      })
      await waitFor(() => {
        expect(mockRouter.back).toHaveBeenCalled()
      })
    })

    it('Cancel button navigates back without saving', async () => {
      const { findByLabelText } = renderScreen(<Goals />)
      const cancelBtn = await findByLabelText('Cancel goal editing')
      fireEvent.press(cancelBtn)

      expect(mockRouter.back).toHaveBeenCalled()
      expect(mockUpdateBodySettings).not.toHaveBeenCalled()
    })

    it('displays weight in lb when unit is lb', async () => {
      mockGetBodySettings.mockResolvedValue({
        weight_unit: 'lb',
        measurement_unit: 'in',
        weight_goal: 75,
        body_fat_goal: 15,
      })
      const { findByLabelText } = renderScreen(<Goals />)
      const input = await findByLabelText('Weight goal in lb')
      await waitFor(() => {
        const val = parseFloat(input.props.value)
        // 75 kg * 2.20462 ≈ 165.3
        expect(val).toBeGreaterThan(160)
        expect(val).toBeLessThan(170)
      })
    })

    it('accessible labels are present on all interactive elements', async () => {
      const { findByLabelText } = renderScreen(<Goals />)
      expect(await findByLabelText('Weight goal in kg')).toBeTruthy()
      expect(await findByLabelText('Body fat percentage goal')).toBeTruthy()
      expect(await findByLabelText('Save body goals')).toBeTruthy()
      expect(await findByLabelText('Cancel goal editing')).toBeTruthy()
    })
  })

  // ── Measurements Screen ──────────────────────────────────

  describe('Measurements screen', () => {
    it('renders Log Measurements heading', async () => {
      const { findByText } = renderScreen(<Measurements />)
      expect(await findByText('Log Measurements')).toBeTruthy()
    })

    it('shows date input with today date', async () => {
      const { findByLabelText } = renderScreen(<Measurements />)
      const dateInput = await findByLabelText('Measurement date')
      expect(dateInput.props.value).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('pre-fills measurement fields from latest data', async () => {
      const { findByLabelText } = renderScreen(<Measurements />)
      const waist = await findByLabelText('Waist in cm')
      await waitFor(() => {
        expect(waist.props.value).toBe('80')
      })
      const chest = await findByLabelText('Chest in cm')
      expect(chest.props.value).toBe('100')
    })

    it('all measurement fields are editable', async () => {
      const { findByLabelText } = renderScreen(<Measurements />)
      const waist = await findByLabelText('Waist in cm')
      await waitFor(() => expect(waist.props.value).toBe('80'))
      fireEvent.changeText(waist, '78')
      expect(waist.props.value).toBe('78')
    })

    it('shows body fat percentage input', async () => {
      const { findByLabelText } = renderScreen(<Measurements />)
      const fatInput = await findByLabelText('Body fat percentage')
      await waitFor(() => {
        expect(fatInput.props.value).toBe('18')
      })
    })

    it('shows optional notes input', async () => {
      const { findByLabelText } = renderScreen(<Measurements />)
      expect(await findByLabelText('Optional notes')).toBeTruthy()
    })

    it('Save button calls upsertBodyMeasurements and navigates back', async () => {
      const { findByLabelText } = renderScreen(<Measurements />)
      await findByLabelText('Waist in cm')

      const saveBtn = await findByLabelText('Save measurements')
      fireEvent.press(saveBtn)

      await waitFor(() => {
        expect(mockUpsertBodyMeasurements).toHaveBeenCalled()
      })
      await waitFor(() => {
        expect(mockRouter.back).toHaveBeenCalled()
      })
    })

    it('Cancel button navigates back without saving', async () => {
      const { findByLabelText } = renderScreen(<Measurements />)
      const cancelBtn = await findByLabelText('Cancel measurement log')
      fireEvent.press(cancelBtn)

      expect(mockRouter.back).toHaveBeenCalled()
      expect(mockUpsertBodyMeasurements).not.toHaveBeenCalled()
    })

    it('displays all 10 measurement fields', async () => {
      const { findByLabelText } = renderScreen(<Measurements />)
      const fields = [
        'Waist in cm', 'Chest in cm', 'Hips in cm',
        'Left Arm in cm', 'Right Arm in cm',
        'Left Thigh in cm', 'Right Thigh in cm',
        'Left Calf in cm', 'Right Calf in cm',
        'Neck in cm',
      ]
      for (const label of fields) {
        expect(await findByLabelText(label)).toBeTruthy()
      }
    })

    it('displays measurements in inches when unit is in', async () => {
      mockGetBodySettings.mockResolvedValue({
        weight_unit: 'lb',
        measurement_unit: 'in',
        weight_goal: null,
        body_fat_goal: null,
      })
      mockGetLatestMeasurements.mockResolvedValue({
        waist: 80,
        chest: null,
        hips: null,
        left_arm: null,
        right_arm: null,
        left_thigh: null,
        right_thigh: null,
        left_calf: null,
        right_calf: null,
        neck: null,
        body_fat: null,
      })

      const { findByLabelText } = renderScreen(<Measurements />)
      const waist = await findByLabelText('Waist in in')
      await waitFor(() => {
        const val = parseFloat(waist.props.value)
        // 80 cm * 0.393701 ≈ 31.5
        expect(val).toBeGreaterThan(30)
        expect(val).toBeLessThan(33)
      })
    })

    it('empty state renders with blank fields when no prior measurements', async () => {
      mockGetLatestMeasurements.mockResolvedValue(null)

      const { findByLabelText } = renderScreen(<Measurements />)
      const waist = await findByLabelText('Waist in cm')
      expect(waist.props.value).toBe('')
    })

    it('accessible labels are present on all interactive elements', async () => {
      const { findByLabelText } = renderScreen(<Measurements />)
      expect(await findByLabelText('Measurement date')).toBeTruthy()
      expect(await findByLabelText('Body fat percentage')).toBeTruthy()
      expect(await findByLabelText('Optional notes')).toBeTruthy()
      expect(await findByLabelText('Save measurements')).toBeTruthy()
      expect(await findByLabelText('Cancel measurement log')).toBeTruthy()
    })
  })
})
