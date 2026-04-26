import React from 'react'
import { Text, View } from 'react-native'
import { renderScreen } from '../../helpers/render'

// BLD-667: behavioral test for the route-local ErrorBoundary that wraps
// app/session/summary/[id].tsx (added in BLD-660). Verifies:
//   1. When the inner Summary throws on mount, the shared ErrorBoundary
//      fallback renders (not a white screen).
//   2. console.error is called (so future Sentry wiring has a hook).
//   3. The boundary is route-local — a sibling route mounted alongside
//      keeps rendering.

jest.mock('expo-router', () => {
  const RealReact = require('react')
  return {
    Stack: { Screen: () => null },
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
    useLocalSearchParams: () => ({ id: 'session-1' }),
    usePathname: () => '/session/summary/session-1',
    useFocusEffect: (cb: () => (() => void) | void) => {
      RealReact.useEffect(() => {
        const cleanup = cb()
        return typeof cleanup === 'function' ? cleanup : undefined
      }, [])
    },
  }
})

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')
jest.mock('lucide-react-native', () => {
  const dummy = () => null
  return new Proxy({}, { get: () => dummy })
})
jest.mock('../../../lib/layout', () => ({
  useLayout: () => ({ wide: false, width: 390, scale: 1.0, horizontalPadding: 16 }),
}))
jest.mock('../../../lib/interactions', () => ({
  log: jest.fn(),
  recent: jest.fn().mockResolvedValue([]),
}))
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))

const mockLogError = jest.fn()
jest.mock('../../../lib/errors', () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
  generateReport: jest.fn().mockResolvedValue('{}'),
  getRecentErrors: jest.fn().mockResolvedValue([]),
  generateGitHubURL: jest.fn().mockReturnValue('https://github.com'),
}))

// Force the inner Summary to throw on mount by making the data hook explode.
// This simulates the BLD-660 class of failure (e.g. expo-sqlite-web
// length-prefix truncation crashing the data layer for this route).
jest.mock('../../../hooks/useSummaryData', () => ({
  useSummaryData: () => {
    throw new Error('Simulated Summary data crash (BLD-667)')
  },
}))
jest.mock('../../../hooks/useSummaryActions', () => ({
  useSummaryActions: () => ({}),
}))

import SummaryRoute from '../../../app/session/summary/[id]'

describe('Summary route ErrorBoundary (BLD-667)', () => {
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    // React logs caught render errors via console.error. Spy (not silence the
    // assertion target) but mute the noisy stack so test output stays clean.
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('catches Summary mount crash with route-local fallback, fires console.error/logError, and leaves sibling routes intact', () => {
    // Mimic a navigator where the Summary route is one of several siblings.
    // If the boundary were global, the throw would unmount the whole tree
    // and "Other route content" would disappear. Because it's route-local,
    // the sibling stays visible.
    const screen = renderScreen(
      <View>
        <SummaryRoute />
        <View>
          <Text>Other route content</Text>
        </View>
      </View>
    )

    // 1. Shared ErrorBoundary fallback renders (not a white screen).
    //    Heading + action buttons prove it's the shared boundary from
    //    components/ErrorBoundary.tsx and not some placeholder.
    expect(screen.getByText('Something went wrong')).toBeTruthy()
    expect(screen.getByLabelText('Restart app')).toBeTruthy()
    expect(screen.getByLabelText('Share crash report')).toBeTruthy()

    // 2. console.error fires (Sentry hook surface) and logError is invoked
    //    with fatal:true, confirming componentDidCatch wiring.
    expect(consoleErrorSpy).toHaveBeenCalled()
    expect(mockLogError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Simulated Summary data crash') }),
      expect.objectContaining({ fatal: true })
    )

    // 3. Boundary is route-local: sibling content rendered next to the
    //    SummaryRoute keeps rendering despite the inner crash.
    expect(screen.getByText('Other route content')).toBeTruthy()
  })
})
