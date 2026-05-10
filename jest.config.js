// BLD-844: Force NODE_ENV=test before any module loads. React 19 only exposes
// `React.act` (and `react-test-renderer`'s `act`) when process.env.NODE_ENV ===
// 'test' at the moment the `react` module is first required — the export is
// gated in react/index.js for production-bundle size. Jest auto-sets NODE_ENV
// to 'test' only if the variable is not already set in the parent environment.
// CI/harness/IDE contexts that pre-set NODE_ENV (e.g. 'production',
// 'development', or unset+inherited) bypass that auto-set, leaving React.act
// undefined. @testing-library/react-native@13.x captures
// `typeof React.act === 'function' ? React.act : reactTestRenderer.act` at
// module-load time; with both undefined every render() throws
// "TypeError: actImplementation is not a function".
//
// Setting NODE_ENV here in jest.config.js is the earliest jest-controlled hook
// — it runs before jest-expo resolves React, before setupFiles run, and before
// any test file loads `@testing-library/react-native`. The npm test script
// already does `cross-env NODE_ENV=test`, but this guard covers direct `jest`,
// `npx jest`, IDE runners, and CI flows that bypass the npm script.
//
// See `.learnings/INDEX.md` (BLD-844) for the full timeline and next-bump
// guidance when React/RN are upgraded again.
process.env.NODE_ENV = 'test';

module.exports = {
  preset: 'jest-expo',
  testTimeout: 10000,
  // BLD-918: Jest defaults to cpus−1 workers. Use all available parallelism
  // (os.availableParallelism() already respects cgroup CPU limits).
  maxWorkers: '100%',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|react-native-reanimated|react-native-gesture-handler|victory-native|react-native-safe-area-context|@gorhom/bottom-sheet)'
  ],
  moduleNameMapper: {
    'react-native-reanimated': '<rootDir>/__mocks__/react-native-reanimated.js',
  },
  testPathIgnorePatterns: ['/node_modules/', '__tests__/helpers/', '__tests__/fixtures/', '/e2e/'],
  globalSetup: './jest.global-setup.js',
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
