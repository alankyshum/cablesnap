/* eslint-env jest */
// Jest auto-mock for @sentry/react-native — the real module pulls in the
// RNSentry native host which is not available under node. Tests that
// assert on breadcrumb/exception behaviour can still override this with
// jest.mock(...) calls in the test file.
module.exports = {
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  init: jest.fn(),
  wrap: (c) => c,
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
};
