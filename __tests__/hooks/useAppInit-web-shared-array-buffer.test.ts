/**
 * BLD-565 regression-lock: when the web runtime lacks SharedArrayBuffer
 * or is not cross-origin isolated, useAppInit must short-circuit
 * BEFORE calling getDatabase() so drizzle-orm/expo-sqlite's sync API
 * never throws `ReferenceError: SharedArrayBuffer is not defined`.
 *
 * This test locks the integration-level behaviour (vs. the unit tests
 * in __tests__/lib/web-support.test.ts, which only cover the detector).
 */

import { renderHook, waitFor } from "@testing-library/react-native";

const mockHideAsync = jest.fn();
const mockGetDatabase = jest.fn();
const mockIsMemoryFallback = jest.fn((...args: unknown[]): boolean => { void args; return false; });
const mockIsOnboardingComplete = jest.fn(async (...args: unknown[]): Promise<boolean> => { void args; return true; });
const mockSetupGlobalHandler = jest.fn();
const mockDetectWebSharedMemorySupport = jest.fn();

jest.mock("react-native", () => ({
  Platform: { OS: "web" },
}));

jest.mock("expo-splash-screen", () => ({
  hideAsync: (...args: unknown[]) => mockHideAsync(...args),
}));

jest.mock("../../lib/db", () => ({
  getDatabase: (...args: unknown[]) => mockGetDatabase(...args),
  isMemoryFallback: (...args: unknown[]) => mockIsMemoryFallback(...args),
  isOnboardingComplete: (...args: unknown[]) => mockIsOnboardingComplete(...args),
}));

jest.mock("../../lib/errors", () => ({
  setupGlobalHandler: (...args: unknown[]) => mockSetupGlobalHandler(...args),
}));

jest.mock("../../lib/web-support", () => ({
  detectWebSharedMemorySupport: (...args: unknown[]) =>
    mockDetectWebSharedMemorySupport(...args),
  WEB_UNSUPPORTED_MESSAGE: "MOCK_WEB_UNSUPPORTED_MESSAGE",
}));

describe("useAppInit — BLD-565 web SharedArrayBuffer short-circuit", () => {
  beforeEach(() => {
    mockHideAsync.mockReset();
    mockGetDatabase.mockReset();
    mockGetDatabase.mockResolvedValue(undefined);
    mockIsMemoryFallback.mockReset().mockReturnValue(false);
    mockIsOnboardingComplete.mockReset().mockResolvedValue(true);
    mockDetectWebSharedMemorySupport.mockReset();
  });

  it("short-circuits DB init when SharedArrayBuffer is missing", () => {
    mockDetectWebSharedMemorySupport.mockReturnValue({
      supported: false,
      reason: "missing_shared_array_buffer",
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useAppInit } = require("../../hooks/useAppInit");
    const { result } = renderHook(() => useAppInit());

    expect(mockGetDatabase).not.toHaveBeenCalled();
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe("MOCK_WEB_UNSUPPORTED_MESSAGE");
    expect(result.current.ready).toBe(true);
    expect(result.current.webUnsupported).toBe(true);
  });

  it("short-circuits DB init when page is not cross-origin isolated", () => {
    mockDetectWebSharedMemorySupport.mockReturnValue({
      supported: false,
      reason: "not_cross_origin_isolated",
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useAppInit } = require("../../hooks/useAppInit");
    const { result } = renderHook(() => useAppInit());

    expect(mockGetDatabase).not.toHaveBeenCalled();
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe("MOCK_WEB_UNSUPPORTED_MESSAGE");
    expect(result.current.webUnsupported).toBe(true);
  });

  it("proceeds with DB init when web capability check passes", async () => {
    mockDetectWebSharedMemorySupport.mockReturnValue({ supported: true });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useAppInit } = require("../../hooks/useAppInit");
    const { result } = renderHook(() => useAppInit());

    // Wait for the async DB-init chain + setState calls to settle so
    // this test validates post-microtask behaviour (and doesn't emit
    // act(...) warnings from pending updates).
    await waitFor(() => {
      expect(mockGetDatabase).toHaveBeenCalledTimes(1);
      expect(result.current.ready).toBe(true);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.webUnsupported).toBe(false);
    // hideAsync is called once after successful init (not the
    // short-circuit path, which also fires hideAsync immediately).
    expect(mockHideAsync).toHaveBeenCalledTimes(1);
  });
});
