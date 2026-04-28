// BLD-763: Force NODE_ENV=test regardless of parent shell.
//
// React 19 only exports `React.act` from the development build
// (`react/cjs/react.development.js`); the production build omits it, and
// `react-test-renderer` captures `var act = React.act` at module-load time.
// If `NODE_ENV` is `production` when jest spawns its workers (which can
// happen when the parent shell exports it — common in agent/CI harness
// containers), `act` is permanently `undefined` inside the test runtime
// and `@testing-library/react-native`'s render() throws
// "TypeError: actImplementation is not a function" on every render() call.
//
// Jest only auto-sets NODE_ENV=test when it is null
// (see `jest-cli/bin/jest.js`), so we have to force it ourselves here.
// This must run before any test file or preset requires `react` /
// `react-test-renderer`.
process.env.NODE_ENV = 'test';

module.exports = {
  preset: 'jest-expo',
  testTimeout: 10000,
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|react-native-reanimated|react-native-gesture-handler|victory-native|react-native-safe-area-context|@gorhom/bottom-sheet)'
  ],
  moduleNameMapper: {
    'react-native-reanimated': '<rootDir>/__mocks__/react-native-reanimated.js',
  },
  testPathIgnorePatterns: ['/node_modules/', '__tests__/helpers/', '__tests__/fixtures/', '/e2e/'],
  setupFiles: ['./jest.setup.js'],
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**'
  ],
};
