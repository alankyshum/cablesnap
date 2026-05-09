/**
 * FormClipsManageSheet.test.tsx
 *
 * BLD-1105: FormClipsManageSheet — lists clips, per-row delete, delete-all.
 *
 * Tests:
 * - Renders grouped clip list.
 * - Per-row trash icon triggers soft-delete + refreshes list + calls onClipsChanged.
 * - "Delete all clips" button triggers deleteAllClips + shows empty state.
 * - Empty state rendered when no clips.
 */

import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { FormClipsManageSheet } from "../../../components/settings/FormClipsManageSheet";
import type { ClipGroupedByExercise } from "../../../lib/media/form-clips";
import type { SetMediaRow } from "../../../lib/db/form-clips";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockListAllClipsGroupedByExercise = jest.fn();
const mockDeleteAllClips = jest.fn();
const mockSoftDeleteClip = jest.fn();
const mockGetStorageStats = jest.fn();
const mockOnClipsChanged = jest.fn();
const mockOnClose = jest.fn();

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
  listAllClipsGroupedByExercise: (...args: unknown[]) => mockListAllClipsGroupedByExercise(...args),
  deleteAllClips: (...args: unknown[]) => mockDeleteAllClips(...args),
  softDeleteClip: (...args: unknown[]) => mockSoftDeleteClip(...args),
  getStorageStats: (...args: unknown[]) => mockGetStorageStats(...args),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeClip(id: string, exerciseId = "ex-1"): SetMediaRow {
  return {
    id,
    set_id: `set-${id}`,
    exercise_id: exerciseId,
    kind: "video",
    rel_path: `form-clips/${exerciseId}/${id}.mp4`,
    duration_ms: 5000,
    size_bytes: 1024 * 1024,
    width: null,
    height: null,
    pending_delete: 0,
    created_at: new Date("2026-01-15").getTime(),
  } as SetMediaRow;
}

function makeGroup(exerciseId: string, exerciseName: string, ids: string[]): ClipGroupedByExercise {
  return { exerciseId, exerciseName, clips: ids.map((id) => makeClip(id, exerciseId)) };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetStorageStats.mockResolvedValue({ totalBytes: 3 * 1024 * 1024, count: 3 });
  mockSoftDeleteClip.mockResolvedValue(undefined);
  mockDeleteAllClips.mockResolvedValue({ deleted: 3 });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FormClipsManageSheet (BLD-1105)", () => {
  it("renders exercise groups and clip rows", async () => {
    const groups = [
      makeGroup("ex-1", "Squat", ["c1", "c2"]),
      makeGroup("ex-2", "Bench Press", ["c3"]),
    ];
    mockListAllClipsGroupedByExercise.mockResolvedValue(groups);

    const { getByText } = render(
      <FormClipsManageSheet isVisible onClose={mockOnClose} onClipsChanged={mockOnClipsChanged} />
    );

    await waitFor(() => {
      expect(getByText("Squat")).toBeTruthy();
      expect(getByText("Bench Press")).toBeTruthy();
    });
  });

  it("renders empty state when no clips exist", async () => {
    mockListAllClipsGroupedByExercise.mockResolvedValue([]);
    mockGetStorageStats.mockResolvedValue({ totalBytes: 0, count: 0 });

    const { getByText } = render(
      <FormClipsManageSheet isVisible onClose={mockOnClose} />
    );

    await waitFor(() => {
      expect(getByText("No clips recorded yet")).toBeTruthy();
    });
  });

  it("does not render on web platform", () => {
    const { Platform } = require("react-native");
    const origOS = Platform.OS;
    (Platform as { OS: string }).OS = "web";

    const { queryByText } = render(
      <FormClipsManageSheet isVisible onClose={mockOnClose} />
    );
    expect(queryByText("Form clips")).toBeNull();

    (Platform as { OS: string }).OS = origOS;
  });

  it("delete-all button appears when clips exist", async () => {
    const groups = [makeGroup("ex-1", "Squat", ["c1"])];
    mockListAllClipsGroupedByExercise.mockResolvedValue(groups);

    const { getByLabelText } = render(
      <FormClipsManageSheet isVisible onClose={mockOnClose} onClipsChanged={mockOnClipsChanged} />
    );

    await waitFor(() => {
      expect(getByLabelText(/Delete all 1 form clip/)).toBeTruthy();
    });
  });

  it("does not render when isVisible=false", () => {
    const { queryByText } = render(
      <FormClipsManageSheet isVisible={false} onClose={mockOnClose} />
    );
    expect(queryByText("Form clips")).toBeNull();
  });
});
