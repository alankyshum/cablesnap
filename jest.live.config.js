// Configuration for the opt-in OpenRouter integration suite.  This deliberately
// does not load jest.setup.js: that file (and the normal config) mocks the AI
// transport, provider, catalog, and expo/fetch.
process.env.NODE_ENV = 'test';

module.exports = {
  preset: 'jest-expo',
  setupFiles: ['./jest.live.setup.js'],
  testMatch: ['**/__tests__/integration/**/*.test.ts'],
  testTimeout: 120000,
  maxWorkers: 1,
  transform: { '\\.[jt]sx?$|\\.mjs$': 'babel-jest' },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@lingui|@formatjs|@messageformat)',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  // Keep the live transport and catalog native. Only the key vault is mocked by
  // the test itself, so the production code has no environment-variable path.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};
