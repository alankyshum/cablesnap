// Mock for expo-auth-session - avoids loading Expo native module system in Jest
module.exports = {
  makeRedirectUri: jest.fn(() => "fitforge://strava-callback"),
  AuthRequest: jest.fn().mockImplementation(() => ({
    promptAsync: jest.fn().mockResolvedValue({ type: "cancel" }),
    codeVerifier: "mock-code-verifier",
  })),
  ResponseType: {
    Code: "code",
    Token: "token",
  },
  maybeCompleteAuthSession: jest.fn(),
};
