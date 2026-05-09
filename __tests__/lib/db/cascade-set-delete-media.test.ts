/**
 * BLD-1114 — cascadeDeleteClipsForSets kind dispatch correctness.
 *
 * When a set has both a video clip AND a setup photo, cascade delete must:
 *   - call unlinkSetupPhotoFiles for kind='setup_photo' rows
 *   - call deleteClip (which calls unlinkClipFiles) for kind='video' rows
 *   - NOT call unlinkClipFiles on setup_photo rows
 *   - NOT call unlinkSetupPhotoFiles on video rows
 */

jest.mock("expo-file-system");
const FileSystem = require("expo-file-system") as {
  File: new (...uris: string[]) => { uri: string; exists: boolean; delete(): void; move(dest: object): void; info(): { modificationTime: number | null; size: number } };
  Directory: new (...uris: string[]) => { uri: string; exists: boolean; list(): unknown[]; create(opts?: object): void };
  Paths: { document: { uri: string } };
  __resetState(): void;
  __setFileState(uri: string, state: { exists: boolean; modificationTime?: number }): void;
  __getFileDeletes(): string[];
};

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

jest.mock("../../../lib/db/form-clips", () => ({
  hardDeleteClip: jest.fn(async () => {}),
  deleteClipsForSet: jest.fn(async () => {}),
  deleteSetMediaForSession: jest.fn(async () => []),
  getAllSetMediaRows: jest.fn(async () => []),
  softDeleteClip: jest.fn(async () => {}),
  getClipForSet: jest.fn(async () => null),
  getClipsForExercise: jest.fn(async () => []),
  insertSetMedia: jest.fn(),
  getSetMediaStats: jest.fn(async () => ({ count: 0, totalBytes: 0 })),
  getAllLiveSetMediaWithExerciseName: jest.fn(async () => []),
}));

jest.mock("../../../lib/media/setup-photos", () => ({
  unlinkSetupPhotoFiles: jest.fn(async () => {}),
  getSetupPhotoForSet: jest.fn(async () => null),
  getSetupPhotoStats: jest.fn(async () => ({ count: 0, totalBytes: 0 })),
  captureSetupPhoto: jest.fn(),
  saveReplacementSetupPhoto: jest.fn(),
}));

jest.mock("../../../lib/media/backup-exclusion", () => ({
  setExcludedFromBackup: jest.fn(async () => {}),
}));

import { cascadeDeleteClipsForSets, cascadeDeleteClipsForSession } from "../../../lib/media/form-clips";
import type { SetMediaRow } from "../../../lib/db/form-clips";
import * as FormClipsDb from "../../../lib/db/form-clips";
import * as SetupPhotosMedia from "../../../lib/media/setup-photos";

const mockHardDeleteClip = jest.mocked(FormClipsDb.hardDeleteClip);
const mockDeleteClipsForSet = jest.mocked(FormClipsDb.deleteClipsForSet);
const mockDeleteSetMediaForSession = jest.mocked(FormClipsDb.deleteSetMediaForSession);
const mockGetAllSetMediaRows = jest.mocked(FormClipsDb.getAllSetMediaRows);
const mockUnlinkSetupPhotoFiles = jest.mocked(SetupPhotosMedia.unlinkSetupPhotoFiles);

function makeRow(over: Partial<SetMediaRow>): SetMediaRow {
  return {
    id: "m1", set_id: "s1", exercise_id: "ex1",
    kind: "video", rel_path: "set-media/clips/ex1/c1.mp4",
    pending_delete: 0, created_at: 1700000001,
    size_bytes: null, width: null, height: null, duration_ms: null,
    ...over,
  };
}

describe("cascadeDeleteClipsForSets — kind dispatch (BLD-1114)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    FileSystem.__resetState();
  });

  it("calls unlinkSetupPhotoFiles for setup_photo rows", async () => {
    const row = makeRow({ id: "p1", kind: "setup_photo", rel_path: "set-media/setup-p1.jpg" });
    mockGetAllSetMediaRows.mockResolvedValue([row]);
    mockDeleteClipsForSet.mockResolvedValue(undefined);

    await cascadeDeleteClipsForSets(["s1"]);

    expect(mockUnlinkSetupPhotoFiles).toHaveBeenCalledWith("set-media/setup-p1.jpg");
    expect(mockHardDeleteClip).toHaveBeenCalledWith("p1");
  });

  it("does NOT call unlinkSetupPhotoFiles for video rows", async () => {
    const row = makeRow({ id: "c1", kind: "video", rel_path: "set-media/clips/ex1/c1.mp4" });
    mockGetAllSetMediaRows.mockResolvedValue([row]);
    mockDeleteClipsForSet.mockResolvedValue(undefined);
    FileSystem.__setFileState("file:///document/set-media/clips/ex1/c1.mp4", { exists: true });

    await cascadeDeleteClipsForSets(["s1"]);

    expect(mockUnlinkSetupPhotoFiles).not.toHaveBeenCalled();
  });

  it("handles mixed kinds in same set — dispatches each to correct unlink", async () => {
    const videoRow = makeRow({ id: "c1", kind: "video", rel_path: "set-media/clips/ex1/c1.mp4" });
    const photoRow = makeRow({ id: "p1", kind: "setup_photo", rel_path: "set-media/setup-p1.jpg" });
    mockGetAllSetMediaRows.mockResolvedValue([videoRow, photoRow]);
    mockDeleteClipsForSet.mockResolvedValue(undefined);

    await cascadeDeleteClipsForSets(["s1"]);

    expect(mockUnlinkSetupPhotoFiles).toHaveBeenCalledWith("set-media/setup-p1.jpg");
    expect(mockUnlinkSetupPhotoFiles).toHaveBeenCalledTimes(1);
  });

  it("no-ops for empty setIds array", async () => {
    await cascadeDeleteClipsForSets([]);
    expect(mockGetAllSetMediaRows).not.toHaveBeenCalled();
    expect(mockUnlinkSetupPhotoFiles).not.toHaveBeenCalled();
  });
});

describe("cascadeDeleteClipsForSession — kind dispatch (BLD-1114)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    FileSystem.__resetState();
  });

  it("calls unlinkSetupPhotoFiles for setup_photo rows from session", async () => {
    const photoRow = makeRow({ id: "p1", kind: "setup_photo", rel_path: "set-media/setup-p1.jpg" });
    mockDeleteSetMediaForSession.mockResolvedValue([photoRow]);

    await cascadeDeleteClipsForSession("sess1");

    expect(mockUnlinkSetupPhotoFiles).toHaveBeenCalledWith("set-media/setup-p1.jpg");
  });

  it("does NOT call unlinkSetupPhotoFiles for video rows from session", async () => {
    const videoRow = makeRow({ id: "c1", kind: "video", rel_path: "set-media/clips/ex1/c1.mp4" });
    mockDeleteSetMediaForSession.mockResolvedValue([videoRow]);
    FileSystem.__setFileState("file:///document/set-media/clips/ex1/c1.mp4", { exists: false });

    await cascadeDeleteClipsForSession("sess1");

    expect(mockUnlinkSetupPhotoFiles).not.toHaveBeenCalled();
  });
});
