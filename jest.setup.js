// We rely on moduleNameMapper in jest.config.js to intercept
// react-native-reanimated and react-native-worklets before they load native code.

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
