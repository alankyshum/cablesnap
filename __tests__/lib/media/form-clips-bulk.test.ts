/**
 * form-clips-bulk.test.ts
 *
 * BLD-1105 AC7: deleteAllClips — hard-delete loop.
 *
 * Tests:
 * 1. N=3 rows + N files: deleteAllClips() removes all DB rows + files;
 *    getStorageStats() returns {count:0, bytes:0}.
 * 2. ENOENT tolerance: pre-delete one file; no throw; all DB rows removed.
 */

jest.mock("expo-file-system");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const FileSystem = require("expo-file-system") as {
  File: new (...uris: string[]) => { uri: string; exists: boolean; delete(): void; move(dest: object): void; info(): { modificationTime: number | null; size: number } };
  Directory: new (...uris: string[]) => { uri: string; exists: boolean; list(): unknown[]; create(opts?: object): void };
  Paths: { document: { uri: string } };
  __resetState(): void;
  __setFileState(uri: string, state: { exists: boolean; modificationTime?: number }): void;
  __getFileDeletes(): string[];
};

jest.mock("../../../lib/uuid", () => ({
  uuid: jest.fn(() => "x"),
}));

jest.mock("../../../lib/media/backup-exclusion", () => ({
  setExcludedFromBackup: jest.fn(async () => {}),
}));

const mockHardDeleteClip = jest.fn(async () => {});
const mockGetAllLiveRows = jest.fn();
const mockGetSetMediaStats = jest.fn();

jest.mock("../../../lib/db/form-clips", () => ({
  hardDeleteClip: (...args: Parameters<typeof mockHardDeleteClip>) => mockHardDeleteClip(...args),
  getAllLiveSetMediaWithExerciseName: (...args: unknown[]) => mockGetAllLiveRows(...args),
  getSetMediaStats: (...args: unknown[]) => mockGetSetMediaStats(...args),
  insertSetMedia: jest.fn(),
  getAllSetMediaRows: jest.fn(async () => []),
  softDeleteClip: jest.fn(),
  deleteClipsForSet: jest.fn(),
  deleteSetMediaForSession: jest.fn(async () => []),
  getClipsForExercise: jest.fn(async () => []),
  getClipForSet: jest.fn(async () => null),
}));

jest.mock("../../../lib/db/helpers", () => ({
  getDrizzle: jest.fn(),
  withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()),
  getDatabase: jest.fn(),
}));

import { Platform } from "react-native";
import { deleteAllClips, getStorageStats } from "../../../lib/media/form-clips";
import type { SetMediaRow } from "../../../lib/db/form-clips";

const DOC = "file:///var/mobile/Documents/";

function makeRow(id: string, exerciseId = "ex-1"): SetMediaRow & { exercise_name: string | null } {
  return {
    id,
    set_id: `set-${id}`,
    exercise_id: exerciseId,
    kind: "video",
    rel_path: `form-clips/${exerciseId}/${id}.mp4`,
    duration_ms: null,
    size_bytes: 1024,
    width: null,
    height: null,
    pending_delete: 0,
    created_at: Date.now(),
    exercise_name: "Squat",
  } as SetMediaRow & { exercise_name: string | null };
}

beforeEach(() => {
  jest.clearAllMocks();
  FileSystem.__resetState();
  (Platform as { OS: string }).OS = "ios";
});

describe("deleteAllClips (AC7)", () => {
  it("deletes all DB rows and files; getStorageStats returns {count:0, bytes:0}", async () => {
    const rows = [makeRow("c1"), makeRow("c2"), makeRow("c3")];
    // Set all files as existing.
    for (const r of rows) {
      FileSystem.__setFileState(`${DOC}${r.rel_path}`, { exists: true });
    }
    mockGetAllLiveRows.mockResolvedValue(rows);
    mockGetSetMediaStats.mockResolvedValue({ count: 0, totalBytes: 0 });

    const result = await deleteAllClips();
    expect(result.deleted).toBe(3);

    // hardDeleteClip called for each row.
    expect(mockHardDeleteClip).toHaveBeenCalledTimes(3);
    expect(mockHardDeleteClip).toHaveBeenCalledWith("c1");
    expect(mockHardDeleteClip).toHaveBeenCalledWith("c2");
    expect(mockHardDeleteClip).toHaveBeenCalledWith("c3");

    // Files deleted.
    const deletes = FileSystem.__getFileDeletes();
    expect(deletes).toEqual(
      expect.arrayContaining([
        `${DOC}form-clips/ex-1/c1.mp4`,
        `${DOC}form-clips/ex-1/c2.mp4`,
        `${DOC}form-clips/ex-1/c3.mp4`,
      ])
    );

    // getStorageStats returns zeros after deletion.
    const stats = await getStorageStats();
    expect(stats.count).toBe(0);
    expect(stats.totalBytes).toBe(0);
  });

  it("ENOENT tolerance: pre-deleted file doesn't throw; all DB rows removed", async () => {
    const rows = [makeRow("c1"), makeRow("c2"), makeRow("c3")];
    // c1's file is already missing.
    FileSystem.__setFileState(`${DOC}form-clips/ex-1/c1.mp4`, { exists: false });
    FileSystem.__setFileState(`${DOC}form-clips/ex-1/c2.mp4`, { exists: true });
    FileSystem.__setFileState(`${DOC}form-clips/ex-1/c3.mp4`, { exists: true });

    mockGetAllLiveRows.mockResolvedValue(rows);
    mockGetSetMediaStats.mockResolvedValue({ count: 0, totalBytes: 0 });

    // Should not throw.
    await expect(deleteAllClips()).resolves.toEqual({ deleted: 3 });

    // All DB rows removed regardless of file existence.
    expect(mockHardDeleteClip).toHaveBeenCalledTimes(3);
  });

  it("returns {deleted:0} when no clips exist", async () => {
    mockGetAllLiveRows.mockResolvedValue([]);
    const result = await deleteAllClips();
    expect(result.deleted).toBe(0);
    expect(mockHardDeleteClip).not.toHaveBeenCalled();
  });

  it("is a no-op on web", async () => {
    (Platform as { OS: string }).OS = "web";
    const result = await deleteAllClips();
    expect(result.deleted).toBe(0);
    expect(mockGetAllLiveRows).not.toHaveBeenCalled();
  });
});
