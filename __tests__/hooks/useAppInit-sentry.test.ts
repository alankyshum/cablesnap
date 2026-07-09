import { renderHook, waitFor } from "@testing-library/react-native";
import * as Sentry from "@sentry/react-native";
import { getOrCreateAnonUserId } from "../../lib/anon-user";

const mockHideAsync = jest.fn();
const mockGetDatabase = jest.fn();
const mockIsMemoryFallback = jest.fn(() => false);
const mockIsOnboardingComplete = jest.fn(async () => true);
const mockSetupGlobalHandler = jest.fn();
const mockDetectWebSharedMemorySupport = jest.fn();

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

jest.mock("expo-splash-screen", () => ({
  hideAsync: () => mockHideAsync(),
}));

jest.mock("../../lib/db", () => ({
  getDatabase: () => mockGetDatabase(),
  isMemoryFallback: () => mockIsMemoryFallback(),
  isOnboardingComplete: () => mockIsOnboardingComplete(),
}));

jest.mock("../../lib/errors", () => ({
  setupGlobalHandler: () => mockSetupGlobalHandler(),
}));

jest.mock("../../lib/web-support", () => ({
  detectWebSharedMemorySupport: () => mockDetectWebSharedMemorySupport(),
  WEB_UNSUPPORTED_MESSAGE: "MOCK_WEB_UNSUPPORTED_MESSAGE",
}));

jest.mock("@sentry/react-native", () => ({
  setUser: jest.fn(),
}));

jest.mock("../../lib/anon-user", () => ({
  getOrCreateAnonUserId: jest.fn(),
}));

// Mock other non-blocking imports inside useAppInit
jest.mock("../../lib/media/backup-exclusion", () => ({
  excludeFormClipsFromBackup: jest.fn().mockResolvedValue({ ok: true }),
}));

describe("useAppInit Sentry user setup integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDatabase.mockResolvedValue(undefined);
    (getOrCreateAnonUserId as jest.Mock).mockResolvedValue("test-anon-id-1234");
  });

  it("calls getOrCreateAnonUserId and Sentry.setUser after getDatabase resolves", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useAppInit } = require("../../hooks/useAppInit");
    renderHook(() => useAppInit());

    await waitFor(() => {
      expect(mockGetDatabase).toHaveBeenCalledTimes(1);
    });

    expect(getOrCreateAnonUserId).toHaveBeenCalledTimes(1);
    expect(Sentry.setUser).toHaveBeenCalledWith({ id: "test-anon-id-1234" });
  });
});
