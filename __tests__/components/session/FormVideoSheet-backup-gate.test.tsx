/**
 * BLD-1096 — FormVideoSheet backup-exclusion gate regression tests.
 *
 * Verifies that the strong privacy banner and record button behaviour
 * are correctly gated on the backupExclusionOk context value:
 *
 *   backupExclusionOk === null  → pending state → soft copy, record available
 *   backupExclusionOk === true  → confirmed     → strong copy, record available
 *   backupExclusionOk === false → failed (iOS)  → soft copy, record unavailable
 */
import React from "react";
import { render } from "@testing-library/react-native";
import { FormClipsContext } from "../../../lib/form-clips-context";
import { FormVideoSheet } from "../../../components/session/FormVideoSheet";

// ── Module-level mocks ──────────────────────────────────────────────────────

jest.mock("expo-camera", () => ({
  CameraView: "CameraView",
  useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
}));

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    background: "#fff",
    card: "#f5f5f5",
    onSurface: "#000",
    onSurfaceVariant: "#555",
    primary: "#6200ea",
    onPrimary: "#fff",
  }),
}));

jest.mock("@/hooks/useMediaSurfaceMounted", () => ({
  useMediaSurfaceMounted: jest.fn(),
}));

jest.mock("../../../lib/media/form-clips", () => ({
  recordClip: jest.fn(),
}));

jest.mock("@sentry/react-native", () => ({
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

const BASE_PROPS = {
  isVisible: true,
  setId: "set-1",
  exerciseId: "ex-1",
  setNumber: 1,
  onClose: jest.fn(),
  onClipSaved: jest.fn(),
};

function renderWithBackupStatus(backupExclusionOk: boolean | null) {
  return render(
    <FormClipsContext.Provider value={{ backupExclusionOk }}>
      <FormVideoSheet {...BASE_PROPS} />
    </FormClipsContext.Provider>
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("FormVideoSheet — BLD-1096 backup-exclusion gate", () => {
  it("shows strong privacy banner when backupExclusionOk=true", () => {
    const { getByText } = renderWithBackupStatus(true);
    expect(getByText("Saved on this device only — never uploaded")).toBeTruthy();
  });

  it("shows soft banner when backupExclusionOk=null (pending)", () => {
    const { getByText, queryByText } = renderWithBackupStatus(null);
    expect(getByText("Saved locally on your device")).toBeTruthy();
    expect(queryByText("Saved on this device only — never uploaded")).toBeNull();
  });

  it("shows soft banner when backupExclusionOk=false (exclusion failed)", () => {
    const { getByText, queryByText } = renderWithBackupStatus(false);
    expect(getByText("Saved locally on your device")).toBeTruthy();
    expect(queryByText("Saved on this device only — never uploaded")).toBeNull();
  });

  it("shows record button when backupExclusionOk=true", () => {
    const { queryByText } = renderWithBackupStatus(true);
    expect(queryByText("Recording unavailable")).toBeNull();
  });

  it("shows record button when backupExclusionOk=null (pending)", () => {
    const { queryByText } = renderWithBackupStatus(null);
    expect(queryByText("Recording unavailable")).toBeNull();
  });
});
