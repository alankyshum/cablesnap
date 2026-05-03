// Mock for expo-sharing — avoids loading native ExpoSharing module in Jest.
// Tests that need to assert sharing calls should mock this module directly.
module.exports = {
  __esModule: true,
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
  getSharedPayloads: jest.fn(() => []),
  getResolvedSharedPayloadsAsync: jest.fn(async () => []),
  clearSharedPayloads: jest.fn(),
  useIncomingShare: jest.fn(() => ({ isLoading: false, data: null })),
};
