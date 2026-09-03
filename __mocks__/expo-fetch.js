// Mock expo/fetch without loading Expo's native module implementation.
// Delegating at call time keeps tests' global.fetch spies and response controls meaningful.
module.exports = {
  fetch: (...args) => global.fetch(...args),
};
