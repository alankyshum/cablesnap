jest.setTimeout(10000)

import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() }
const mockParams: Record<string, string> = {}

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  usePathname: () => '/test',
  useFocusEffect: jest.fn(),
  Stack: { Screen: () => null },
  Redirect: () => null,
}))

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')

jest.mock('../../lib/db', () => ({
  setAppSetting: jest.fn().mockResolvedValue(undefined),
  updateBodySettings: jest.fn().mockResolvedValue(undefined),
  getBodySettings: jest.fn().mockResolvedValue({ weight_goal: 70, body_fat_goal: 15 }),
}))

jest.mock('../../lib/programs', () => ({
  activateProgram: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../lib/errors', () => ({
  logError: jest.fn(),
  generateReport: jest.fn().mockResolvedValue('{}'),
  getRecentErrors: jest.fn().mockResolvedValue([]),
  generateGitHubURL: jest.fn().mockReturnValue('https://github.com'),
}))
jest.mock('../../lib/interactions', () => ({
  log: jest.fn(),
  recent: jest.fn().mockResolvedValue([]),
}))
jest.mock('expo-file-system', () => ({
  File: jest.fn(),
  Paths: { cache: '/cache' },
}))
jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn(),
}))

import Welcome from '../../app/onboarding/welcome'
import Setup from '../../app/onboarding/setup'
import Recommend from '../../app/onboarding/recommend'
import { setAppSetting, updateBodySettings, getBodySettings } from '../../lib/db'
import { activateProgram } from '../../lib/programs'

describe('Onboarding Acceptance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    Object.keys(mockParams).forEach((k) => delete mockParams[k])
  })

  describe('Full beginner flow', () => {
    it('Welcome -> Setup -> Recommend -> saves settings and navigates', async () => {
      const welcome = renderScreen(<Welcome />)
      fireEvent.press(welcome.getByLabelText('Get started with FitForge'))
      expect(mockRouter.replace).toHaveBeenCalledWith('/onboarding/setup')

      welcome.unmount()
      const setup = renderScreen(<Setup />)

      fireEvent.press(setup.getByLabelText('Kilograms'))
      fireEvent.press(setup.getByLabelText('Centimeters'))
      fireEvent.press(setup.getByLabelText(/Beginner/))

      const continueBtn = setup.getByLabelText('Continue to recommendations')
      fireEvent.press(continueBtn)
      expect(mockRouter.replace).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/onboarding/recommend',
          params: expect.objectContaining({ weight: 'kg', measurement: 'cm', level: 'beginner' }),
        })
      )

      setup.unmount()
      mockParams.weight = 'kg'
      mockParams.measurement = 'cm'
      mockParams.level = 'beginner'

      const rec = renderScreen(<Recommend />)
      expect(rec.getByText('We Recommend')).toBeTruthy()
      expect(rec.getByText('Recommended')).toBeTruthy()
      expect(rec.getByText('Full Body')).toBeTruthy()

      fireEvent.press(rec.getByLabelText(/Start with Full Body/))

      await waitFor(() => {
        expect(getBodySettings).toHaveBeenCalled()
        expect(updateBodySettings).toHaveBeenCalledWith('kg', 'cm', 70, 15)
        expect(setAppSetting).toHaveBeenCalledWith('experience_level', 'beginner')
        expect(setAppSetting).toHaveBeenCalledWith('onboarding_complete', '1')
        expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)')
      })
    })
  })

  describe('Full intermediate flow', () => {
    it('Setup -> Recommend -> activates program and navigates', async () => {
      const setup = renderScreen(<Setup />)

      fireEvent.press(setup.getByLabelText('Pounds'))
      fireEvent.press(setup.getByLabelText('Inches'))
      fireEvent.press(setup.getByLabelText(/Intermediate/))

      const continueBtn = setup.getByLabelText('Continue to recommendations')
      fireEvent.press(continueBtn)
      expect(mockRouter.replace).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/onboarding/recommend',
          params: expect.objectContaining({ weight: 'lb', measurement: 'in', level: 'intermediate' }),
        })
      )

      setup.unmount()
      mockParams.weight = 'lb'
      mockParams.measurement = 'in'
      mockParams.level = 'intermediate'

      const rec = renderScreen(<Recommend />)
      expect(rec.getByText('Program')).toBeTruthy()

      fireEvent.press(rec.getByLabelText(/Start with/))

      await waitFor(() => {
        expect(activateProgram).toHaveBeenCalled()
        expect(setAppSetting).toHaveBeenCalledWith('experience_level', 'intermediate')
        expect(setAppSetting).toHaveBeenCalledWith('onboarding_complete', '1')
        expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)')
      })
    })
  })

  describe('Advanced flow', () => {
    it('shows Browse Our Templates and navigates on button press', async () => {
      mockParams.weight = 'kg'
      mockParams.measurement = 'cm'
      mockParams.level = 'advanced'

      const rec = renderScreen(<Recommend />)
      expect(rec.getByText('Browse Our Templates')).toBeTruthy()

      fireEvent.press(rec.getByLabelText('Browse all workout templates'))

      await waitFor(() => {
        expect(setAppSetting).toHaveBeenCalledWith('experience_level', 'advanced')
        expect(setAppSetting).toHaveBeenCalledWith('onboarding_complete', '1')
        expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)')
      })
    })
  })

  describe('Skip flow', () => {
    it('beginner skip completes onboarding and navigates', async () => {
      mockParams.weight = 'kg'
      mockParams.measurement = 'cm'
      mockParams.level = 'beginner'

      const rec = renderScreen(<Recommend />)
      fireEvent.press(rec.getByLabelText('Skip recommendation and explore on your own'))

      await waitFor(() => {
        expect(setAppSetting).toHaveBeenCalledWith('onboarding_complete', '1')
        expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)')
      })
    })
  })

  describe('Error handling', () => {
    it('shows error banner when getBodySettings rejects', async () => {
      ;(getBodySettings as jest.Mock).mockRejectedValueOnce(new Error('DB error'))

      mockParams.weight = 'kg'
      mockParams.measurement = 'cm'
      mockParams.level = 'beginner'

      const rec = renderScreen(<Recommend />)
      fireEvent.press(rec.getByLabelText(/Start with Full Body/))

      expect(await rec.findByText(/Something went wrong/)).toBeTruthy()
    })
  })

  describe('Continue button disabled state', () => {
    it('has disabled label before selecting a level', () => {
      const setup = renderScreen(<Setup />)
      expect(setup.getByLabelText('Select an experience level to continue')).toBeTruthy()
    })
  })

  describe('Unit selection buttons', () => {
    it('renders all four unit toggle buttons with correct a11y labels', () => {
      const setup = renderScreen(<Setup />)
      expect(setup.getByLabelText('Kilograms')).toBeTruthy()
      expect(setup.getByLabelText('Pounds')).toBeTruthy()
      expect(setup.getByLabelText('Centimeters')).toBeTruthy()
      expect(setup.getByLabelText('Inches')).toBeTruthy()
    })
  })
})
