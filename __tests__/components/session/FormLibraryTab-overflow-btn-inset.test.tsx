/**
 * FormLibraryTab-overflow-btn-inset.test.tsx
 *
 * BLD-4550: Ellipsis (overflow) menu button must sit 8px from the top and
 * right card edges, consistent with the sibling checkOverlay affordance.
 *
 * Tests:
 * - AC1: overflowBtn style has top === 8 (inset from card top edge).
 * - AC2: overflowBtn style has right === 8 (inset from card right edge).
 */

import React from "react";
import { StyleSheet } from "react-native";
import { render, waitFor } from "@testing-library/react-native";
import { FormLibraryTab } from "../../../components/session/FormLibraryTab";
import type { SetMediaRow } from "../../../lib/db/form-clips";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetClipsForExercise = jest.fn();

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
  getMostRecentCompletedSetForExercise: jest.fn().mockResolvedValue(null),
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

const MOCK_CLIP: SetMediaRow = {
  id: "clip-b",
  set_id: "set-b",
  exercise_id: "ex-1",
  rel_path: "form-clips/ex-1/clip-b.mp4",
  kind: "video",
  created_at: Date.now() - 3600000,
  duration_ms: 4000,
  size_bytes: 800000,
  width: 1080,
  height: 1920,
  pending_delete: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetClipsForExercise.mockResolvedValue([MOCK_CLIP]);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FormLibraryTab — overflow button inset (BLD-4550)", () => {
  it("AC1: overflow button top inset is 8px from card edge", async () => {
    const { getByLabelText } = render(<FormLibraryTab exerciseId="ex-1" />);

    // Wait for clip to load — overflow button only appears once clip renders
    const overflowBtn = await waitFor(
      () => getByLabelText(/More options for clip from/),
      { timeout: 5000 },
    );

    const flatStyle = StyleSheet.flatten(overflowBtn.props.style ?? {});
    expect(flatStyle.top).toBe(8);
  });

  it("AC2: overflow button right inset is 8px from card edge", async () => {
    const { getByLabelText } = render(<FormLibraryTab exerciseId="ex-1" />);

    const overflowBtn = await waitFor(
      () => getByLabelText(/More options for clip from/),
      { timeout: 5000 },
    );

    const flatStyle = StyleSheet.flatten(overflowBtn.props.style ?? {});
    expect(flatStyle.right).toBe(8);
  });
});
