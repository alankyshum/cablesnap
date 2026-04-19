import React from "react";
import { renderHook, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Track focus callbacks to simulate focus events
let mockFocusCallbacks: (() => void)[] = [];
jest.mock("expo-router", () => ({
  useFocusEffect: (cb: () => void) => {
    const RealReact = require("react");
    RealReact.useEffect(() => {
      mockFocusCallbacks.push(cb);
      return () => {
        mockFocusCallbacks = mockFocusCallbacks.filter((fn: () => void) => fn !== cb);
      };
    }, [cb]);
  },
}));

import { bumpQueryVersion, getQueryVersion, useFocusRefetch } from "../../lib/query";

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    qc,
    Wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  };
}

function simulateFocus() {
  mockFocusCallbacks.forEach((cb) => cb());
}

describe("bumpQueryVersion / getQueryVersion", () => {
  it("starts at 0 for unknown keys", () => {
    expect(getQueryVersion("unknown-key-xyz")).toBe(0);
  });

  it("increments version on bump", () => {
    const key = "test-bump-" + Date.now();
    expect(getQueryVersion(key)).toBe(0);
    bumpQueryVersion(key);
    expect(getQueryVersion(key)).toBe(1);
    bumpQueryVersion(key);
    expect(getQueryVersion(key)).toBe(2);
  });
});

describe("useFocusRefetch", () => {
  beforeEach(() => {
    mockFocusCallbacks = [];
  });

  it("invalidates on first focus (backward compat)", () => {
    const { qc, Wrapper } = createWrapper();
    const invalidateSpy = jest.spyOn(qc, "invalidateQueries");

    renderHook(() => useFocusRefetch(["test-first-focus"]), { wrapper: Wrapper });
    act(() => simulateFocus());

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["test-first-focus"] });
    invalidateSpy.mockRestore();
  });

  it("skips invalidation on subsequent focus without version bump", () => {
    const { qc, Wrapper } = createWrapper();
    const invalidateSpy = jest.spyOn(qc, "invalidateQueries");

    renderHook(() => useFocusRefetch(["test-skip"]), { wrapper: Wrapper });

    // First focus — should invalidate
    act(() => simulateFocus());
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    invalidateSpy.mockClear();

    // Second focus without bump — should NOT invalidate
    act(() => simulateFocus());
    expect(invalidateSpy).not.toHaveBeenCalled();

    invalidateSpy.mockRestore();
  });

  it("invalidates on subsequent focus after version bump", () => {
    const key = "test-bump-refetch-" + Date.now();
    const { qc, Wrapper } = createWrapper();
    const invalidateSpy = jest.spyOn(qc, "invalidateQueries");

    renderHook(() => useFocusRefetch([key]), { wrapper: Wrapper });

    // First focus
    act(() => simulateFocus());
    invalidateSpy.mockClear();

    // Bump and refocus — should invalidate
    bumpQueryVersion(key);
    act(() => simulateFocus());
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [key] });

    invalidateSpy.mockRestore();
  });

  it("handles global invalidation (no keys) with version tracking", () => {
    const { qc, Wrapper } = createWrapper();
    const invalidateSpy = jest.spyOn(qc, "invalidateQueries");

    renderHook(() => useFocusRefetch(), { wrapper: Wrapper });

    // First focus — always invalidates
    act(() => simulateFocus());
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    invalidateSpy.mockClear();

    // Second focus without bump — should NOT invalidate
    act(() => simulateFocus());
    expect(invalidateSpy).not.toHaveBeenCalled();

    // Bump global version and refocus
    bumpQueryVersion("__global__");
    act(() => simulateFocus());
    expect(invalidateSpy).toHaveBeenCalledTimes(1);

    invalidateSpy.mockRestore();
  });
});
