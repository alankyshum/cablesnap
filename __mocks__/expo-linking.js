// Mock for expo-linking — avoids loading Expo native module system in Jest.
// Tests control behaviour via:
//   Linking.addEventListener.mockImplementation(cb => { ... })
//   Linking.getInitialURL.mockResolvedValue(url)
const listeners = {};

module.exports = {
  addEventListener: jest.fn((event, handler) => {
    listeners[event] = listeners[event] ?? [];
    listeners[event].push(handler);
    return { remove: jest.fn(() => {
      const idx = (listeners[event] ?? []).indexOf(handler);
      if (idx !== -1) listeners[event].splice(idx, 1);
    })};
  }),
  getInitialURL: jest.fn().mockResolvedValue(null),
  openURL: jest.fn().mockResolvedValue(undefined),
  // Test helper: fire a url event to all current listeners
  __simulateUrl: (url) => {
    (listeners["url"] ?? []).forEach(h => h({ url }));
  },
  // Reset state between tests
  __reset: () => {
    Object.keys(listeners).forEach(k => delete listeners[k]);
  },
};
