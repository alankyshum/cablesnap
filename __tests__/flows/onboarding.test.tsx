jest.setTimeout(10000)

import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'

// --- Mocks (must be before component imports) ---

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

// --- Tests ---

describe('Onboarding Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    Object.keys(mockParams).forEach((k) => delete mockParams[k])
  })

  describe('Welcome screen', () => {
    it('renders welcome text and subtitle', () => {
      const { getByText } = renderScreen(<Welcome />)
      expect(getByText('Welcome to FitForge')).toBeTruthy()
      expect(getByText('Your free workout & macro tracker')).toBeTruthy()
    })

    it('renders Get Started button with a11y label', () => {
      const { getByLabelText } = renderScreen(<Welcome />)
      expect(getByLabelText('Get started with FitForge')).toBeTruthy()
    })

    it('pressing Get Started navigates to setup', () => {
      const { getByLabelText } = renderScreen(<Welcome />)
      fireEvent.press(getByLabelText('Get started with FitForge'))
      expect(mockRouter.replace).toHaveBeenCalledWith('/onboarding/setup')
    })

    it('renders without any DB dependency', () => {
      // Welcome screen uses no DB functions — renders purely from props/theme
      const { getByText } = renderScreen(<Welcome />)
      expect(getByText('Welcome to FitForge')).toBeTruthy()
    })
  })

  describe('Setup screen', () => {
    it('renders preference headings', () => {
      const { getByText } = renderScreen(<Setup />)
      expect(getByText('Set Up Your Preferences')).toBeTruthy()
      expect(getByText('Weight Unit')).toBeTruthy()
      expect(getByText('Measurement Unit')).toBeTruthy()
      expect(getByText('Experience Level')).toBeTruthy()
    })

    it('renders unit toggles with a11y labels', () => {
      const { getByLabelText } = renderScreen(<Setup />)
      expect(getByLabelText('Kilograms')).toBeTruthy()
      expect(getByLabelText('Pounds')).toBeTruthy()
      expect(getByLabelText('Centimeters')).toBeTruthy()
      expect(getByLabelText('Inches')).toBeTruthy()
    })

    it('renders experience level cards', () => {
      const { getByLabelText } = renderScreen(<Setup />)
      expect(getByLabelText(/Beginner/)).toBeTruthy()
      expect(getByLabelText(/Intermediate/)).toBeTruthy()
      expect(getByLabelText(/Advanced/)).toBeTruthy()
    })

    it('Continue button is disabled before level selection', () => {
      const { getByLabelText } = renderScreen(<Setup />)
      const btn = getByLabelText('Select an experience level to continue')
      expect(btn).toBeTruthy()
    })

    it('selecting level enables Continue and navigates', () => {
      const { getByLabelText } = renderScreen(<Setup />)
      fireEvent.press(getByLabelText(/Beginner/))
      const btn = getByLabelText('Continue to recommendations')
      expect(btn).toBeTruthy()
      fireEvent.press(btn)
      expect(mockRouter.replace).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/onboarding/recommend',
          params: expect.objectContaining({ level: 'beginner' }),
        })
      )
    })
  })

  describe('Recommend screen (beginner)', () => {
    beforeEach(() => {
      mockParams.weight = 'kg'
      mockParams.measurement = 'cm'
      mockParams.level = 'beginner'
    })

    it('renders We Recommend heading', () => {
      const { getByText } = renderScreen(<Recommend />)
      expect(getByText('We Recommend')).toBeTruthy()
    })

    it('shows Recommended chip', () => {
      const { getByText } = renderScreen(<Recommend />)
      expect(getByText('Recommended')).toBeTruthy()
    })

    it('shows Full Body template name', () => {
      const { getByText } = renderScreen(<Recommend />)
      expect(getByText('Full Body')).toBeTruthy()
    })

    it('Start button saves settings and navigates', async () => {
      const { getByLabelText } = renderScreen(<Recommend />)
      fireEvent.press(getByLabelText(/Start with Full Body/))

      await waitFor(() => {
        expect(getBodySettings).toHaveBeenCalled()
        expect(updateBodySettings).toHaveBeenCalledWith('kg', 'cm', 70, 15)
        expect(setAppSetting).toHaveBeenCalledWith('experience_level', 'beginner')
        expect(setAppSetting).toHaveBeenCalledWith('onboarding_complete', '1')
        expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)')
      })
    })

    it('explore button also completes onboarding', async () => {
      const { getByLabelText } = renderScreen(<Recommend />)
      fireEvent.press(getByLabelText('Skip recommendation and explore on your own'))

      await waitFor(() => {
        expect(setAppSetting).toHaveBeenCalledWith('onboarding_complete', '1')
        expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)')
      })
    })

    it('shows error banner when save fails', async () => {
      (getBodySettings as jest.Mock).mockRejectedValueOnce(new Error('DB error'))

      const { getByLabelText, findByText } = renderScreen(<Recommend />)
      fireEvent.press(getByLabelText(/Start with Full Body/))

      expect(await findByText(/Something went wrong/)).toBeTruthy()
    })
  })

  describe('Recommend screen (intermediate)', () => {
    beforeEach(() => {
      mockParams.weight = 'lb'
      mockParams.measurement = 'in'
      mockParams.level = 'intermediate'
    })

    it('shows program recommendation with Program chip', () => {
      const { getByText } = renderScreen(<Recommend />)
      expect(getByText('Program')).toBeTruthy()
    })

    it('Start activates program and navigates', async () => {
      const { getByLabelText } = renderScreen(<Recommend />)
      // Find the start button
      const btns = getByLabelText(/Start with/)
      fireEvent.press(btns)

      await waitFor(() => {
        expect(activateProgram).toHaveBeenCalled()
        expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)')
      })
    })
  })

  describe('Recommend screen (advanced)', () => {
    beforeEach(() => {
      mockParams.weight = 'kg'
      mockParams.measurement = 'cm'
      mockParams.level = 'advanced'
    })

    it('shows Browse Our Templates heading', () => {
      const { getByText } = renderScreen(<Recommend />)
      expect(getByText('Browse Our Templates')).toBeTruthy()
    })

    it('shows Browse All Templates button with a11y', () => {
      const { getByLabelText } = renderScreen(<Recommend />)
      expect(getByLabelText('Browse all workout templates')).toBeTruthy()
    })
  })

  describe('ErrorBoundary', () => {
    it('catches render errors and shows error screen', async () => {
      const ErrorBoundary = require('../../components/ErrorBoundary').default
      const Broken = () => { throw new Error('onboarding crash') }

      jest.spyOn(console, 'error').mockImplementation(() => {})
      const { findByText } = renderScreen(
        <ErrorBoundary><Broken /></ErrorBoundary>
      )
      expect(await findByText('Something went wrong')).toBeTruthy()
      ;(console.error as jest.Mock).mockRestore()
    })
  })
})
