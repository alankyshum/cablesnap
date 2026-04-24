// Global mock for expo-audio — native modules are unavailable under Jest.
// Tests that need to assert audio calls should mock `@/lib/audio` (the
// wrapper) directly; this mock only prevents "undefined reading prototype"
// when expo-audio's native bridge is loaded at require time.
const mockPlayer = {
  play: jest.fn(),
  pause: jest.fn(),
  seekTo: jest.fn(),
  release: jest.fn(),
  remove: jest.fn(),
};

module.exports = {
  __esModule: true,
  createAudioPlayer: jest.fn(() => mockPlayer),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
  useAudioPlayer: jest.fn(() => mockPlayer),
  AudioModule: {},
};
