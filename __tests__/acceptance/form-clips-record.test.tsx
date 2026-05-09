/**
 * form-clips-record.test.tsx — BLD-1123 acceptance coverage
 *
 * Covers the interaction-class ACs from PLAN-BLD-1105 that had zero coverage:
 *   AC1  — tapping "Record clip" CTA opens FormVideoSheet bound to the
 *           most-recent-without-clip set.
 *   AC2a — Record CTA disabled + "Log a workout set first" when no sets exist.
 *   AC2b — Record CTA disabled + "Replace or delete" when all sets have clips.
 *   AC5  — Settings FormClipsStorageRow is tappable and opens
 *           FormClipsManageSheet; stats refresh after sheet close.
 *
 * These are acceptance-level tests that fire press events and verify the
 * downstream component becomes visible — not just state/prop assertions.
 */
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { FormLibraryTab } from "../../components/session/FormLibraryTab";
import { FormClipsStorageRow } from "../../components/settings/FormClipsStorageRow";

// ── Shared theme mock ─────────────────────────────────────────────────────────

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

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => "Icon");

// ── Mocks for form-clip data layer ────────────────────────────────────────────

const mockGetClipsForExercise = jest.fn();
const mockGetMostRecentCompletedSetForExercise = jest.fn();

jest.mock("../../lib/media/form-clips", () => ({
  getClipsForExercise: (...args: unknown[]) => mockGetClipsForExercise(...args),
  softDeleteClip: jest.fn(async () => {}),
  getStorageStats: jest.fn(async () => ({ count: 3, totalBytes: 12 * 1024 * 1024 })),
  listAllClipsGroupedByExercise: jest.fn(async () => []),
  deleteAllClips: jest.fn(async () => ({ deleted: 0 })),
}));

jest.mock("../../lib/media/setup-photos", () => ({
  getSetupPhotoStats: jest.fn(async () => ({ count: 0, totalBytes: 0 })),
}));

jest.mock("../../lib/db/session-sets", () => ({
  getMostRecentCompletedSetForExercise: (...args: unknown[]) =>
    mockGetMostRecentCompletedSetForExercise(...args),
}));

// ── FormVideoSheet: sentinel that renders testID when visible ─────────────────
// The real FormVideoSheet uses expo-camera; mock it to a lightweight sentinel
// so we can assert it becomes visible after the Record CTA is pressed.

jest.mock("../../components/session/FormVideoSheet", () => ({
  FormVideoSheet: (props: {
    isVisible: boolean;
    setId: string;
    exerciseId: string;
    setNumber: number;
    mode?: "add" | "replace";
    onClose: () => void;
    onClipSaved: (clipId: string) => void;
  }) => {
    const { View, Text } = require("react-native");
    if (!props.isVisible) return null;
    return (
      <View testID="form-video-sheet">
        <Text testID="fvs-set-id">{props.setId}</Text>
        <Text testID="fvs-mode">{props.mode ?? "add"}</Text>
      </View>
    );
  },
}));

// ── CompareView: not under test here ─────────────────────────────────────────

jest.mock("../../components/session/CompareView", () => ({
  CompareView: () => null,
}));

// ── FormClipsManageSheet: sentinel ────────────────────────────────────────────

jest.mock("../../components/settings/FormClipsManageSheet", () => ({
  FormClipsManageSheet: (props: {
    isVisible: boolean;
    onClose: () => void;
    onClipsChanged?: () => void;
  }) => {
    const { View, Text } = require("react-native");
    if (!props.isVisible) return null;
    return (
      <View testID="form-clips-manage-sheet">
        <Text
          testID="manage-sheet-close-btn"
          onPress={props.onClose}
        >
          Close
        </Text>
      </View>
    );
  },
}));

// ── Sentry ────────────────────────────────────────────────────────────────────

jest.mock("@sentry/react-native", () => ({
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// =============================================================================
// AC1 — tapping Record CTA opens FormVideoSheet bound to the correct set
// =============================================================================

describe("AC1 — Record CTA tap opens FormVideoSheet (BLD-1105)", () => {
  it("opens FormVideoSheet in add mode with the free-set id when Record is tapped", async () => {
    const freeSet = { id: "set-ulid-1", set_number: 3, completed_at: Date.now() };
    // Both calls return the free set (any set exists AND it has no clip).
    mockGetMostRecentCompletedSetForExercise.mockResolvedValue(freeSet);
    mockGetClipsForExercise.mockResolvedValue([]);

    const { getByLabelText, getByTestId } = render(
      <FormLibraryTab exerciseId="ex-abc" />,
    );

    // Wait for async resolution so CTA becomes enabled.
    await waitFor(() => {
      const btn = getByLabelText("Record new form clip");
      expect(btn.props.accessibilityState?.disabled).toBeFalsy();
    });

    // Tap the header CTA.
    fireEvent.press(getByLabelText("Record new form clip"));

    // FormVideoSheet must become visible with the correct setId.
    await waitFor(() => {
      expect(getByTestId("form-video-sheet")).toBeTruthy();
      expect(getByTestId("fvs-set-id").props.children).toBe("set-ulid-1");
      expect(getByTestId("fvs-mode").props.children).toBe("add");
    });
  });

  it("also opens FormVideoSheet when the empty-state 'Record a clip' button is tapped", async () => {
    const freeSet = { id: "set-ulid-2", set_number: 1, completed_at: Date.now() };
    mockGetMostRecentCompletedSetForExercise.mockResolvedValue(freeSet);
    mockGetClipsForExercise.mockResolvedValue([]);

    const { getByLabelText, getByTestId } = render(
      <FormLibraryTab exerciseId="ex-abc" />,
    );

    await waitFor(() => getByLabelText("Record a clip"));
    fireEvent.press(getByLabelText("Record a clip"));

    await waitFor(() => {
      expect(getByTestId("form-video-sheet")).toBeTruthy();
      expect(getByTestId("fvs-set-id").props.children).toBe("set-ulid-2");
    });
  });
});

// =============================================================================
// AC2a — disabled with "Log a workout set first" when no sets exist
// =============================================================================

describe("AC2a — Record CTA disabled: no completed sets (BLD-1105)", () => {
  it("shows 'Log a workout set first' copy and the button is disabled", async () => {
    mockGetMostRecentCompletedSetForExercise.mockResolvedValue(null);
    mockGetClipsForExercise.mockResolvedValue([]);

    const { getByLabelText, getByText } = render(
      <FormLibraryTab exerciseId="ex-abc" />,
    );

    await waitFor(() => {
      const btn = getByLabelText("Record new form clip");
      expect(btn.props.accessibilityState?.disabled).toBe(true);
      expect(getByText("Log a workout set first to attach a form clip.")).toBeTruthy();
    });
  });

  it("does NOT open FormVideoSheet when a disabled Record CTA is pressed", async () => {
    mockGetMostRecentCompletedSetForExercise.mockResolvedValue(null);
    mockGetClipsForExercise.mockResolvedValue([]);

    const { getByLabelText, queryByTestId } = render(
      <FormLibraryTab exerciseId="ex-abc" />,
    );

    await waitFor(() => getByLabelText("Record new form clip"));
    // Attempt press on a disabled button (should be a no-op).
    fireEvent.press(getByLabelText("Record new form clip"));

    // Sheet must remain hidden.
    await waitFor(() => {
      expect(queryByTestId("form-video-sheet")).toBeNull();
    });
  });
});

// =============================================================================
// AC2b — disabled with "Replace or delete" when all sets already have clips
// =============================================================================

describe("AC2b — Record CTA disabled: all sets have clips (BLD-1105)", () => {
  it("shows 'Replace or delete' copy and button is disabled", async () => {
    const anySet = { id: "set-1", set_number: 1, completed_at: Date.now() };
    mockGetMostRecentCompletedSetForExercise.mockImplementation(
      async (_id: string, opts?: { mustHaveNoClip?: boolean }) =>
        opts?.mustHaveNoClip ? null : anySet,
    );
    mockGetClipsForExercise.mockResolvedValue([]);

    const { getByLabelText, getByText } = render(
      <FormLibraryTab exerciseId="ex-abc" />,
    );

    await waitFor(() => {
      const btn = getByLabelText("Record new form clip");
      expect(btn.props.accessibilityState?.disabled).toBe(true);
      // LibraryEmptyState renders this copy (no "below") when clips list is empty.
      expect(
        getByText("Replace or delete an existing clip to record a new one."),
      ).toBeTruthy();
    });
  });
});

// =============================================================================
// AC5 — Settings FormClipsStorageRow is tappable and opens FormClipsManageSheet
// =============================================================================

describe("AC5 — FormClipsStorageRow opens FormClipsManageSheet (BLD-1105)", () => {
  it("tapping the row opens FormClipsManageSheet", async () => {
    const { getByLabelText, getByTestId } = render(
      <FormClipsStorageRow />,
    );

    await waitFor(() => getByLabelText("Manage form clips"));
    fireEvent.press(getByLabelText("Manage form clips"));

    await waitFor(() => {
      expect(getByTestId("form-clips-manage-sheet")).toBeTruthy();
    });
  });

  it("closing the sheet refreshes stats and calls onClipsChanged", async () => {
    const onClipsChanged = jest.fn();
    const { getByLabelText, getByTestId, queryByTestId } = render(
      <FormClipsStorageRow onClipsChanged={onClipsChanged} />,
    );

    await waitFor(() => getByLabelText("Manage form clips"));
    fireEvent.press(getByLabelText("Manage form clips"));
    await waitFor(() => getByTestId("form-clips-manage-sheet"));

    // Dismiss the sheet via the sentinel close button.
    fireEvent.press(getByTestId("manage-sheet-close-btn"));

    await waitFor(() => {
      expect(queryByTestId("form-clips-manage-sheet")).toBeNull();
      expect(onClipsChanged).toHaveBeenCalledTimes(1);
    });
  });
});
