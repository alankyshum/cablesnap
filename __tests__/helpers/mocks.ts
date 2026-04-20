export function setupNativeMocks() {
  jest.mock('expo-haptics', () => ({
    impactAsync: jest.fn(),
    ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  }))

  jest.mock('expo-keep-awake', () => ({
    useKeepAwake: jest.fn(),
    activateKeepAwake: jest.fn(),
    deactivateKeepAwake: jest.fn(),
  }))

  jest.mock('expo-sharing', () => ({
    shareAsync: jest.fn(),
    isAvailableAsync: jest.fn().mockResolvedValue(true),
  }))

  jest.mock('expo-splash-screen', () => ({
    preventAutoHideAsync: jest.fn(),
    hideAsync: jest.fn(),
  }))

  jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')

  jest.mock('expo-file-system', () => ({
    File: jest.fn(),
    Paths: { cache: '/cache' },
  }))

  jest.mock('expo-document-picker', () => ({
    getDocumentAsync: jest.fn().mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///test.csv', name: 'test.csv', mimeType: 'text/csv' }],
    }),
  }))

  jest.mock('expo-constants', () => ({
    default: {
      expoConfig: { name: 'CableSnap', version: '1.0.0' },
      executionEnvironment: 'storeClient',
    },
  }))
}

export function setupFlowMocks() {
  setupNativeMocks()

  jest.mock('../../lib/layout', () => ({
    useLayout: () => ({ wide: false, width: 375, scale: 1.0 }),
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
}

export function createMockRouter() {
  return {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(true),
    setParams: jest.fn(),
  }
}

export function mockExpoRouter(router: ReturnType<typeof createMockRouter>, params: Record<string, string> = {}) {
  jest.mock('expo-router', () => ({
    useRouter: () => router,
    useLocalSearchParams: () => params,
    useGlobalSearchParams: () => params,
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
}
