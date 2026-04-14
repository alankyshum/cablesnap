// Shared mock setup for native modules used across flow tests.
// Import this file in jest.mock calls or beforeAll blocks.

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
}
