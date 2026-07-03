/**
 * FormLibraryTab-selection-dot.test.tsx
 *
 * BLD-2724: Selection indicator dots on clip cards must be legible against
 * any card background.
 *
 * The unselected dot was previously a transparent circle (only a white border),
 * making it invisible against the light surfaceVariant card background.
 *
 * Tests:
 * - AC1: checkOverlay unselected state has a non-transparent fill color.
 * - AC2: checkOverlay size is at least 20×20px.
 */

import React from "react";
import { StyleSheet } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
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
  id: "clip-a",
  set_id: "set-a",
  exercise_id: "ex-1",
  rel_path: "form-clips/ex-1/clip-a.mp4",
  kind: "video",
  created_at: Date.now() - 7200000,
  duration_ms: 5000,
  size_bytes: 1000000,
  width: 1080,
  height: 1920,
  pending_delete: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetClipsForExercise.mockResolvedValue([MOCK_CLIP]);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FormLibraryTab — selection dot legibility (BLD-2724)", () => {
  it("AC1: checkOverlay unselected state has a non-transparent dark fill", async () => {
    const { getByLabelText } = render(<FormLibraryTab exerciseId="ex-1" />);

    // Wait for clip to load and "Select" button to appear
    await waitFor(() => getByLabelText("Select clips"), { timeout: 5000 });

    // Enter select mode
    fireEvent.press(getByLabelText("Select clips"));

    // Clip button should now render with ", not selected" suffix
    await waitFor(() => getByLabelText(/Clip from .*, not selected/), { timeout: 3000 });

    const clipBtn = getByLabelText(/Clip from .*, not selected/);
    const children = clipBtn.children as Array<{ props?: { style?: unknown } }>;

    // The checkOverlay is the last child of the Pressable (it has borderRadius+borderColor)
    let foundDot: { props?: { style?: unknown } } | null = null;
    for (const child of children) {
      const flat = StyleSheet.flatten(child.props?.style ?? {}) as Record<string, unknown>;
      if (flat.borderRadius && flat.borderColor) {
        foundDot = child;
        break;
      }
    }

    expect(foundDot).not.toBeNull();
    if (!foundDot) return;

    const flat = StyleSheet.flatten(foundDot.props?.style ?? {}) as Record<string, unknown>;
    const bg = flat.backgroundColor as string | undefined;

    // BLD-2724: unselected dot must have a visible fill (not transparent)
    expect(bg).toBeDefined();
    expect(bg).not.toBe("transparent");
    expect(bg).not.toBe("rgba(0,0,0,0)");
  });

  it("AC2: checkOverlay has width and height of at least 20px", async () => {
    const { getByLabelText } = render(<FormLibraryTab exerciseId="ex-1" />);

    await waitFor(() => getByLabelText("Select clips"), { timeout: 5000 });
    fireEvent.press(getByLabelText("Select clips"));
    await waitFor(() => getByLabelText(/Clip from .*, not selected/), { timeout: 3000 });

    const clipBtn = getByLabelText(/Clip from .*, not selected/);
    const children = clipBtn.children as Array<{ props?: { style?: unknown } }>;

    let foundDot: { props?: { style?: unknown } } | null = null;
    for (const child of children) {
      const flat = StyleSheet.flatten(child.props?.style ?? {}) as Record<string, unknown>;
      if (flat.borderRadius && flat.borderColor) {
        foundDot = child;
        break;
      }
    }

    expect(foundDot).not.toBeNull();
    if (!foundDot) return;

    const flat = StyleSheet.flatten(foundDot.props?.style ?? {}) as Record<string, unknown>;
    expect(flat.width as number).toBeGreaterThanOrEqual(20);
    expect(flat.height as number).toBeGreaterThanOrEqual(20);
  });
});
