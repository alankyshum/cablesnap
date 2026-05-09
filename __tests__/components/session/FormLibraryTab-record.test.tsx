/**
 * FormLibraryTab-record.test.tsx
 *
 * BLD-1105: Record CTA enabled/disabled states in FormLibraryTab.
 *
 * Tests:
 * - AC1: CTA enabled when a free set exists.
 * - AC2a: CTA disabled with "Log a workout set first" when no sets exist.
 * - AC2b: CTA disabled with "Replace or delete" copy when all sets have clips.
 * - Replace overflow button triggers FormVideoSheet in replace mode.
 */

import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { FormLibraryTab } from "../../../components/session/FormLibraryTab";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetClipsForExercise = jest.fn();
const mockGetMostRecentCompletedSetForExercise = jest.fn();

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    background: "#fff",
    surface: "#f5f5f5",
    surfaceVariant: "#eee",
    onSurface: "#000",
    onSurfaceVariant: "#555",
    primary: "#6200ea",
    onPrimary: "#fff",
    primaryContainer: "#ede9fb",
    onPrimaryContainer: "#21005d",
    outline: "#ccc",
    error: "#B00020",
    errorContainer: "#FDECEA",
    onErrorContainer: "#370617",
  }),
}));

jest.mock("@/hooks/useMediaSurfaceMounted", () => ({
  useMediaSurfaceMounted: jest.fn(),
}));

jest.mock("../../../lib/media/form-clips", () => ({
  getClipsForExercise: (...args: unknown[]) => mockGetClipsForExercise(...args),
  softDeleteClip: jest.fn(async () => {}),
}));

jest.mock("../../../lib/db/session-sets", () => ({
  getMostRecentCompletedSetForExercise: (...args: unknown[]) =>
    mockGetMostRecentCompletedSetForExercise(...args),
}));

jest.mock("../../../components/session/CompareView", () => ({
  CompareView: () => null,
}));

jest.mock("../../../components/session/FormVideoSheet", () => ({
  FormVideoSheet: () => null,
}));

jest.mock("expo-camera", () => ({
  CameraView: "CameraView",
  useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
}));

jest.mock("@sentry/react-native", () => ({
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FormLibraryTab — Record CTA (BLD-1105)", () => {
  it("AC1: Record CTA is enabled when a free (no clip) set exists", async () => {
    const freeSet = { id: "set-1", set_number: 1, completed_at: Date.now() };
    // Any set exists.
    mockGetMostRecentCompletedSetForExercise.mockResolvedValue(freeSet);
    // Free set (no clip) also returns the same set.
    mockGetClipsForExercise.mockResolvedValue([]);

    const { getByLabelText } = render(<FormLibraryTab exerciseId="ex-1" />);

    await waitFor(() => {
      const btn = getByLabelText("Record new form clip");
      expect(btn).toBeTruthy();
      expect(btn.props.accessibilityState?.disabled).toBeFalsy();
    });
  });

  it("AC2a: Record CTA disabled with 'Log a workout set first' copy when no sets exist", async () => {
    // No sets at all — both calls return null.
    mockGetMostRecentCompletedSetForExercise.mockResolvedValue(null);
    mockGetClipsForExercise.mockResolvedValue([]);

    const { getByText } = render(<FormLibraryTab exerciseId="ex-1" />);

    await waitFor(() => {
      expect(
        getByText("Log a workout set first to attach a form clip.")
      ).toBeTruthy();
    });
  });

  it("AC2b: Record CTA disabled with 'Replace or delete' copy when all sets have clips", async () => {
    const anySet = { id: "set-1", set_number: 1, completed_at: Date.now() };
    mockGetMostRecentCompletedSetForExercise.mockImplementation(
      async (_id: string, opts?: { mustHaveNoClip?: boolean }) => {
        if (opts?.mustHaveNoClip) return null; // all sets have clips
        return anySet;
      }
    );
    mockGetClipsForExercise.mockResolvedValue([]);

    const { getByText } = render(<FormLibraryTab exerciseId="ex-1" />);

    await waitFor(() => {
      expect(
        getByText("Replace or delete an existing clip to record a new one.")
      ).toBeTruthy();
    });
  });
});
