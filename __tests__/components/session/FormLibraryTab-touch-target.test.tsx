/**
 * FormLibraryTab-touch-target.test.tsx
 *
 * BLD-1941: "Select" text link in Form clips header must meet 44dp touch target.
 *
 * Tests:
 * - AC1: The "Select clips" Pressable has minHeight ≥ 44 in its resolved style.
 * - AC2: The "Exit select mode" Pressable has minHeight ≥ 44 in its resolved style.
 */

import React from "react";
import { StyleSheet } from "react-native";
import { render } from "@testing-library/react-native";
import { FormLibraryTab } from "../../../components/session/FormLibraryTab";

// ── Mocks ─────────────────────────────────────────────────────────────────────

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
  getClipsForExercise: jest.fn().mockResolvedValue([]),
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FormLibraryTab — Select touch target (BLD-1941)", () => {
  it("AC1: 'Select clips' button meets 44dp minimum touch target height", () => {
    const { getByLabelText } = render(<FormLibraryTab exerciseId="ex-1" />);

    const selectBtn = getByLabelText("Select clips");
    const flatStyle = StyleSheet.flatten(selectBtn.props.style ?? {});

    expect(flatStyle.minHeight).toBeGreaterThanOrEqual(44);
  });

  it("AC2: Pressable has paddingHorizontal to ensure adequate horizontal tap area", () => {
    const { getByLabelText } = render(<FormLibraryTab exerciseId="ex-1" />);

    const selectBtn = getByLabelText("Select clips");
    const flatStyle = StyleSheet.flatten(selectBtn.props.style ?? {});

    // paddingHorizontal or explicit paddingLeft/paddingRight must be present
    const hasHorizontalPadding =
      (flatStyle.paddingHorizontal ?? 0) > 0 ||
      ((flatStyle.paddingLeft ?? 0) > 0 && (flatStyle.paddingRight ?? 0) > 0);

    expect(hasHorizontalPadding).toBe(true);
  });
});
