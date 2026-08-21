/* eslint-env jest */
const { i18n } = require("@lingui/core");
i18n.loadAndActivate({ locale: "en-US", messages: {} });

// Keep Lingui's context-based macros usable from the default Testing Library
// render path. Tests that need a different provider can still pass `wrapper`;
// the default wrapper supplies the app's shared i18n instance.
jest.mock('@testing-library/react-native', () => {
  const actual = jest.requireActual('@testing-library/react-native');
  const { TestI18nProvider } = require('./__tests__/helpers/i18n');

  return {
    ...actual,
    render: (component, options = {}) =>
      actual.render(component, {
        ...options,
        wrapper: options.wrapper || TestI18nProvider,
      }),
    renderHook: (callback, options = {}) =>
      actual.renderHook(callback, {
        ...options,
        wrapper: options.wrapper || TestI18nProvider,
      }),
  };
});
// We rely on moduleNameMapper in jest.config.js to intercept
// react-native-reanimated and react-native-worklets before they load native code.

// BLD-2701: Global mock for useIntensityMode to avoid QueryClientProvider requirements
// in all existing tests that render components which now call this hook.
// Individual tests that need to test mode-aware behaviour can override this mock.
jest.mock('./hooks/useIntensityMode', () => ({
  useIntensityMode: () => 'rpe',
  invalidateIntensityMode: jest.fn(),
}));

// Patch VirtualizedList to render all items in tests (no virtualization).
// FlashList rendered everything; FlatList virtualizes by default (initialNumToRender=10),
// breaking findByText assertions for items beyond the first 10.
jest.mock(
  '@react-native/virtualized-lists/Lists/VirtualizedListProps',
  () => {
    const actual = jest.requireActual(
      '@react-native/virtualized-lists/Lists/VirtualizedListProps'
    );
    return {
      ...actual,
      initialNumToRenderOrDefault: (n) => n ?? 200,
      maxToRenderPerBatchOrDefault: (n) => n ?? 200,
    };
  }
);

if (typeof window !== 'undefined' && !window.dispatchEvent) {
  window.dispatchEvent = () => {};
}

// Mock react-native-safe-area-context for tests (was previously provided by PaperProvider)
jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 0, bottom: 0, left: 0, right: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };
  return {
    SafeAreaProvider: ({ children }) => children,
    SafeAreaView: ({ children }) => children,
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
    SafeAreaInsetsContext: {
      Consumer: ({ children }) => children(insets),
    },
    initialWindowMetrics: { insets, frame },
  };
});
