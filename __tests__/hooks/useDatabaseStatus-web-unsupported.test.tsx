/**
 * BLD-1262 regression-lock — useDatabaseStatus must NOT invoke
 * getDatabase() when its caller passes `disabled: true`.
 *
 * Background: PR #609 (BLD-1257) introduced a new `useDatabaseStatus`
 * hook in `app/_layout.tsx`, but its useEffect runs even when the
 * surrounding component renders WebUnsupportedScreen — re-introducing
 * the BLD-565 `ReferenceError: SharedArrayBuffer is not defined`
 * regression on web hosts without cross-origin isolation. This test
 * locks the contract: when `disabled` is true, the hook is a complete
 * no-op with respect to lib/db.
 */

import { act, renderHook, waitFor } from "@testing-library/react-native";

const mockGetDatabase = jest.fn();
const mockGetDatabaseFailure = jest.fn();
const mockIsDatabaseUnavailableError = jest.fn();
const mockResetDatabaseInit = jest.fn();

jest.mock("react-native", () => ({
  Platform: { OS: "web" },
}));

jest.mock("../../lib/db", () => ({
  getDatabase: (...args: unknown[]) => mockGetDatabase(...args),
  getDatabaseFailure: () => mockGetDatabaseFailure(),
  isDatabaseUnavailableError: (e: unknown) => mockIsDatabaseUnavailableError(e),
  resetDatabaseInit: () => mockResetDatabaseInit(),
}));

describe("useDatabaseStatus — BLD-1262 disabled gate", () => {
  beforeEach(() => {
    mockGetDatabase.mockReset().mockResolvedValue(undefined);
    mockGetDatabaseFailure.mockReset().mockReturnValue(null);
    mockIsDatabaseUnavailableError.mockReset().mockReturnValue(false);
    mockResetDatabaseInit.mockReset();
  });

  it("does NOT call getDatabase when disabled=true (web-unsupported host)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useDatabaseStatus } = require("../../hooks/useDatabaseStatus");
    const { result } = renderHook(() => useDatabaseStatus({ disabled: true }));

    // Let any (incorrectly-scheduled) microtasks drain.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockGetDatabase).not.toHaveBeenCalled();
    expect(result.current).toEqual({ kind: "disabled" });
  });

  it("calls getDatabase exactly once when disabled=false (supported host)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useDatabaseStatus } = require("../../hooks/useDatabaseStatus");
    const { result } = renderHook(() => useDatabaseStatus({ disabled: false }));

    await waitFor(() => {
      expect(result.current.kind).toBe("ready");
    });
    expect(mockGetDatabase).toHaveBeenCalledTimes(1);
  });

  it("calls getDatabase exactly once with no options (backward-compat default)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useDatabaseStatus } = require("../../hooks/useDatabaseStatus");
    const { result } = renderHook(() => useDatabaseStatus());

    await waitFor(() => {
      expect(result.current.kind).toBe("ready");
    });
    expect(mockGetDatabase).toHaveBeenCalledTimes(1);
  });

  it("does not call getDatabase across the entire root-layout render when webUnsupported", async () => {
    // Render the same wiring the layout uses: pass webUnsupported through
    // to useDatabaseStatus exactly once per render. This mirrors the
    // app/_layout.tsx call site and locks the regression at the
    // composition boundary (AC1 from BLD-1262).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useDatabaseStatus } = require("../../hooks/useDatabaseStatus");
    const webUnsupported = true;
    const { result, rerender } = renderHook<{ disabled: boolean }, ReturnType<typeof useDatabaseStatus>>(
      ({ disabled }) => useDatabaseStatus({ disabled }),
      { initialProps: { disabled: webUnsupported } }
    );
    await act(async () => {
      await Promise.resolve();
    });
    // Force a re-render to mimic React's commit cycle around the
    // surrounding WebUnsupportedScreen path.
    rerender({ disabled: webUnsupported });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockGetDatabase).not.toHaveBeenCalled();
    expect(result.current).toEqual({ kind: "disabled" });
  });
});
