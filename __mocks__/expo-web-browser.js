// Mock for expo-web-browser - avoids loading Expo native module system in Jest
module.exports = {
  openBrowserAsync: jest.fn().mockResolvedValue({ type: "cancel" }),
  dismissBrowser: jest.fn(),
  maybeCompleteAuthSession: jest.fn(),
  WebBrowserResultType: {
    CANCEL: "cancel",
    DISMISS: "dismiss",
    OPENED: "opened",
  },
};
