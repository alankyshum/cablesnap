/**
 * FormClipsStorageRow.test.tsx
 *
 * BLD-1105: FormClipsStorageRow → tappable card that opens FormClipsManageSheet.
 *
 * Tests:
 * - Renders with stats loaded from getStorageStats.
 * - Tapping opens FormClipsManageSheet.
 * - onClipsChanged fired after sheet close refreshes stats.
 */

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { FormClipsStorageRow } from "../../../components/settings/FormClipsStorageRow";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetStorageStats = jest.fn();
const mockOnClipsChanged = jest.fn();

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    background: "#fff",
    surface: "#f5f5f5",
    surfaceVariant: "#eee",
    onSurface: "#000",
    onSurfaceVariant: "#555",
    primary: "#6200ea",
    onPrimary: "#fff",
    outline: "#ccc",
    error: "#B00020",
    errorContainer: "#FDECEA",
    onErrorContainer: "#370617",
    primaryContainer: "#ede9fb",
    onPrimaryContainer: "#21005d",
  }),
}));

jest.mock("../../../lib/media/form-clips", () => ({
  getStorageStats: (...args: unknown[]) => mockGetStorageStats(...args),
  listAllClipsGroupedByExercise: jest.fn(async () => []),
  deleteAllClips: jest.fn(async () => ({ deleted: 0 })),
  softDeleteClip: jest.fn(async () => {}),
}));

jest.mock("../../../lib/media/setup-photos", () => ({
  getSetupPhotoStats: jest.fn(async () => ({ count: 0, totalBytes: 0 })),
}));

// Mock the manage sheet to render a sentinel and capture onClose.
let capturedOnClose: (() => void) | undefined;
jest.mock("../../../components/settings/FormClipsManageSheet", () => ({
  FormClipsManageSheet: (props: { isVisible: boolean; onClose: () => void; onClipsChanged?: () => void }) => {
    capturedOnClose = props.onClose;
    if (!props.isVisible) return null;
    const { Text } = require("react-native");
    return <Text testID="manage-sheet">ManageSheet</Text>;
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  capturedOnClose = undefined;
  mockGetStorageStats.mockResolvedValue({ totalBytes: 12 * 1024 * 1024, count: 8 });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FormClipsStorageRow (BLD-1105)", () => {
  it("renders stats and chevron after loading", async () => {
    const { getByText } = render(<FormClipsStorageRow />);
    await waitFor(() => {
      expect(getByText(/12\.0 MB across 8 clips/)).toBeTruthy();
    });
  });

  it("tapping opens FormClipsManageSheet", async () => {
    const { getByLabelText, getByTestId } = render(<FormClipsStorageRow />);
    await waitFor(() => {
      expect(getByLabelText("Manage form clips")).toBeTruthy();
    });
    fireEvent.press(getByLabelText("Manage form clips"));
    await waitFor(() => {
      expect(getByTestId("manage-sheet")).toBeTruthy();
    });
  });

  it("closing sheet refreshes stats and calls onClipsChanged", async () => {
    const { getByLabelText } = render(
      <FormClipsStorageRow onClipsChanged={mockOnClipsChanged} />
    );
    await waitFor(() => {
      expect(getByLabelText("Manage form clips")).toBeTruthy();
    });

    // Open sheet.
    fireEvent.press(getByLabelText("Manage form clips"));

    // Simulate sheet close.
    mockGetStorageStats.mockResolvedValueOnce({ totalBytes: 0, count: 0 });
    capturedOnClose?.();

    await waitFor(() => {
      expect(mockGetStorageStats).toHaveBeenCalledTimes(2); // initial + refresh
    });
    expect(mockOnClipsChanged).toHaveBeenCalled();
  });
});
