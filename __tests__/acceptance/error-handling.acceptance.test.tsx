jest.setTimeout(10000)

import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import { createErrorEntry, resetIds } from '../helpers/factories'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')
jest.mock('../../lib/layout', () => ({ useLayout: () => ({ wide: false, width: 375, scale: 1.0 }) }))
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))

// Mock @react-navigation/native for errors.tsx
const mockSetOptions = jest.fn()
jest.mock('@react-navigation/native', () => {
  const RealReact = require('react')
  return {
    useNavigation: () => ({ setOptions: mockSetOptions }),
    useFocusEffect: (cb: () => (() => void) | void) => {
      RealReact.useEffect(() => {
        const cleanup = cb()
        return typeof cleanup === 'function' ? cleanup : undefined
      }, [])
    },
  }
})

const fatalError = createErrorEntry({
  id: 'err-1',
  message: 'NullPointerException in WorkoutSession',
  stack: 'at WorkoutSession.render (session.tsx:42)',
  fatal: true,
  timestamp: Date.now() - 60000,
})

const nonFatalError = createErrorEntry({
  id: 'err-2',
  message: 'Network request failed',
  stack: 'at fetch (network.ts:10)',
  fatal: false,
  timestamp: Date.now() - 120000,
})

const mockGetRecentErrors = jest.fn().mockResolvedValue([fatalError, nonFatalError])
const mockClearErrorLog = jest.fn().mockResolvedValue(undefined)
const mockLogError = jest.fn()
const mockGenerateReport = jest.fn().mockResolvedValue('{}')
const mockGenerateGitHubURL = jest.fn().mockReturnValue('https://github.com')

jest.mock('../../lib/errors', () => ({
  getRecentErrors: (...args: any[]) => mockGetRecentErrors(...args),
  clearErrorLog: (...args: any[]) => mockClearErrorLog(...args),
  logError: (...args: any[]) => mockLogError(...args),
  generateReport: (...args: any[]) => mockGenerateReport(...args),
  generateGitHubURL: (...args: any[]) => mockGenerateGitHubURL(...args),
}))

jest.mock('../../lib/interactions', () => ({
  log: jest.fn(),
  recent: jest.fn().mockResolvedValue([]),
}))

import Errors from '../../app/errors'
import ErrorBoundary from '../../components/ErrorBoundary'

describe('Error Handling Acceptance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetIds()
    mockGetRecentErrors.mockResolvedValue([fatalError, nonFatalError])
    mockClearErrorLog.mockResolvedValue(undefined)
  })

  describe('Error Log Screen', () => {
    it('displays error entries with messages', async () => {
      const screen = renderScreen(<Errors />)
      await waitFor(() => {
        expect(screen.getByLabelText(/NullPointerException/)).toBeTruthy()
        expect(screen.getByLabelText(/Network request failed/)).toBeTruthy()
      })
    })

    it('shows FATAL chip on fatal errors', async () => {
      const screen = renderScreen(<Errors />)
      await waitFor(() => {
        expect(screen.getByText('FATAL')).toBeTruthy()
      })
    })

    it('error cards have accessible labels with message and timestamp', async () => {
      const screen = renderScreen(<Errors />)
      await waitFor(() => {
        const card = screen.getByLabelText(/NullPointerException.*fatal/)
        expect(card).toBeTruthy()
      })
    })

    it('error cards have button role', async () => {
      const screen = renderScreen(<Errors />)
      await waitFor(() => {
        const card = screen.getByLabelText(/NullPointerException/)
        expect(card.props.accessibilityRole || card.props.role).toBe('button')
      })
    })

    it('expands error details on card press', async () => {
      const screen = renderScreen(<Errors />)
      await waitFor(() => {
        expect(screen.getByLabelText(/NullPointerException/)).toBeTruthy()
      })

      fireEvent.press(screen.getByLabelText(/NullPointerException/))

      await waitFor(() => {
        expect(screen.getByText(/WorkoutSession\.render/)).toBeTruthy()
      })
    })

    it('shows empty state when no errors', async () => {
      mockGetRecentErrors.mockResolvedValue([])

      const screen = renderScreen(<Errors />)
      await waitFor(() => {
        expect(screen.getByText('No errors recorded')).toBeTruthy()
      })
    })

    it('sets header right with Clear All button', async () => {
      renderScreen(<Errors />)
      await waitFor(() => {
        expect(mockSetOptions).toHaveBeenCalled()
      })
    })
  })

  describe('ErrorBoundary', () => {
    const ThrowingComponent = () => {
      throw new Error('Test crash in render')
    }

    it('catches render errors and shows fallback UI', () => {
      const screen = renderScreen(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      )

      expect(screen.getByText('Something went wrong')).toBeTruthy()
    })

    it('shows Show Details button with accessible label', () => {
      const screen = renderScreen(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      )

      expect(screen.getByLabelText('Show error details')).toBeTruthy()
    })

    it('expands error details on Show Details press', () => {
      const screen = renderScreen(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      )

      fireEvent.press(screen.getByLabelText('Show error details'))
      expect(screen.getByText(/Test crash in render/)).toBeTruthy()
      expect(screen.getByLabelText('Hide error details')).toBeTruthy()
    })

    it('shows Restart button with accessible label', () => {
      const screen = renderScreen(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      )

      expect(screen.getByLabelText('Restart app')).toBeTruthy()
    })

    it('restarts app (re-renders children) on Restart press', () => {
      const screen = renderScreen(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      )

      expect(screen.getByText('Something went wrong')).toBeTruthy()
      fireEvent.press(screen.getByLabelText('Restart app'))

      // After restart, ErrorBoundary clears state and tries children again.
      // ThrowingComponent throws again, so fallback reappears.
      expect(screen.getByText('Something went wrong')).toBeTruthy()
    })

    it('shows Share Crash Report button with accessible label', () => {
      const screen = renderScreen(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      )

      expect(screen.getByLabelText('Share crash report')).toBeTruthy()
    })

    it('shows Report on GitHub button with accessible label', () => {
      const screen = renderScreen(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      )

      expect(screen.getByLabelText('Report crash on GitHub')).toBeTruthy()
    })

    it('renders children normally when no error', () => {
      const screen = renderScreen(
        <ErrorBoundary>
          <>{/* No error */}</>
        </ErrorBoundary>
      )

      expect(screen.queryByText('Something went wrong')).toBeNull()
    })

    it('logs error via logError', () => {
      renderScreen(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      )

      expect(mockLogError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Test crash in render' }),
        expect.objectContaining({ fatal: true })
      )
    })
  })
})
