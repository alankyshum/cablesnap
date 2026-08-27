/* eslint-env jest */
const { i18n } = require("@lingui/core");
const mockReact = require("react");
const { QueryClient: mockQueryClient, QueryClientProvider: mockQueryClientProvider } = require("@tanstack/react-query");
i18n.loadAndActivate({ locale: "en-US", messages: {} });

jest.mock("@kesha-antonov/react-native-chat", () => {
  const mockReact = require("react");
  const { TextInput, Text, View } = require("react-native");
  const MockChat = jest.fn(({ messages = [], onSend, renderChatEmpty, renderSend, renderCustomView, renderMessageText, textInputProps, labels }) => {
    const [text, setText] = mockReact.useState("");
    return mockReact.createElement(View, null,
      messages.length ? messages.map((message) => mockReact.createElement(View, { key: String(message._id) }, message.text ? (renderMessageText ? renderMessageText({ currentMessage: message, position: message.user?._id === 1 ? "right" : "left" }) : mockReact.createElement(Text, null, message.text)) : null, renderCustomView?.({ currentMessage: message })) ) : renderChatEmpty?.(),
      mockReact.createElement(TextInput, { placeholder: labels?.placeholder || "Ask your AI Coach anything...", value: text, onChangeText: setText, ...textInputProps }),
      renderSend?.({ text, onSend: (items) => { setText(""); onSend?.(items); } }),
    );
  });
  return {
    Chat: MockChat,
    BasicMarkdown: ({ text }) => mockReact.createElement(Text, null, text),
    useStreamingMessages: ({ initialMessages = [] } = {}) => {
      const [messages, setMessages] = mockReact.useState(initialMessages);
      const [isStreaming, setStreaming] = mockReact.useState(false);
      const active = mockReact.useRef(null);
      const append = (items) => setMessages((current) => [...current, ...(Array.isArray(items) ? items : [items])]);
      const startStream = (message) => {
        const controller = new AbortController();
        const id = message._id || `stream-${Date.now()}`;
        setMessages((current) => [...current, { ...message, _id: id, streaming: true }]);
        setStreaming(true);
        active.current = { controller, id };
        controller.signal.onabort = () => {
          setMessages((current) => current.map((item) => item._id === id ? { ...item, streaming: false } : item));
          setStreaming(false);
          active.current = null;
        };
        return {
          id,
          signal: controller.signal,
          push: (chunk) => setMessages((current) => current.map((item) => item._id === id ? { ...item, text: item.text + chunk } : item)),
          set: () => {},
          done: (patch = {}) => {
            setMessages((current) => current.map((item) => item._id === id ? { ...item, ...patch, streaming: false } : item));
            setStreaming(false);
            active.current = null;
          }
        };
      };
      return { messages, setMessages, append, startStream, isStreaming, stop: () => { active.current?.controller.abort(); setStreaming(false); } };
    },
  };
});

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
         wrapper: options.wrapper || (({ children }) => mockReact.createElement(mockQueryClientProvider, { client: new mockQueryClient() }, mockReact.createElement(TestI18nProvider, null, children))),
      }),
     renderHook: (callback, options = {}) =>
       actual.renderHook(callback, {
         ...options,
         wrapper: options.wrapper || (({ children }) => mockReact.createElement(mockQueryClientProvider, { client: new mockQueryClient() }, mockReact.createElement(TestI18nProvider, null, children))),
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
