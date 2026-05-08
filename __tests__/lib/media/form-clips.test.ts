/**
 * Unit tests for lib/media/form-clips.ts
 *
 * AC18 (BLD-1092): reconcileOrphans 5-case correctness.
 * AC16: web returns empty arrays / no-ops.
 * Covers: path helpers, recordClip, softDeleteClip, getStorageStats.
 *
 * Uses __mocks__/expo-file-system.js (SDK 55 class-based API).
 */

import { Platform } from "react-native";

// Activate __mocks__/expo-file-system.js
jest.mock("expo-file-system");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const FileSystem = require("expo-file-system") as {
  File: new (...uris: string[]) => { uri: string; exists: boolean; delete(): void; move(dest: object): void; info(): { modificationTime: number | null; size: number } };
  Directory: new (...uris: string[]) => { uri: string; exists: boolean; list(): unknown[]; create(opts?: object): void };
  Paths: { document: { uri: string } };
  __resetState(): void;
  __setFileState(uri: string, state: { exists: boolean; modificationTime?: number }): void;
  __setDirListing(uri: string, entries: unknown[]): void;
  __getFileMoves(): Array<{ from: string; to: string }>;
  __getFileDeletes(): string[];
  __getDirCreates(): string[];
};

import type { SetMediaRow } from "../../../lib/db/form-clips";

// ---- Mock lib/uuid ----
jest.mock("../../../lib/uuid", () => ({
  uuid: jest.fn(() => "test-clip-id"),
}));

// ---- Mock lib/media/backup-exclusion ----
jest.mock("../../../lib/media/backup-exclusion", () => ({
  setExcludedFromBackup: jest.fn(async () => {}),
}));
const mockSetExcludedFromBackup: jest.Mock = jest.requireMock("../../../lib/media/backup-exclusion").setExcludedFromBackup;

// ---- Mock DB layer ----
jest.mock("../../../lib/db/form-clips", () => ({
  insertSetMedia: jest.fn(),
  getClipsForExercise: jest.fn(),
  getClipForSet: jest.fn(),
  softDeleteClip: jest.fn(),
  hardDeleteClip: jest.fn(),
  getAllSetMediaRows: jest.fn(),
  getSetMediaStats: jest.fn(),
}));

// ---- Import after mocks ----
import {
  toRelPath,
  toAbsPath,
  recordClip,
  getClipsForExercise,
  getClipForSet,
  softDeleteClip,
  reconcileOrphans,
  getStorageStats,
} from "../../../lib/media/form-clips";

// Access the mocked DB functions
const DbMock = jest.requireMock("../../../lib/db/form-clips") as {
  insertSetMedia: jest.Mock;
  getClipsForExercise: jest.Mock;
  getClipForSet: jest.Mock;
  softDeleteClip: jest.Mock;
  hardDeleteClip: jest.Mock;
  getAllSetMediaRows: jest.Mock;
  getSetMediaStats: jest.Mock;
};

const DOC = "file:///var/mobile/Documents/";
const ROOT_DIR = `${DOC}form-clips/`;
const EX_DIR = `${ROOT_DIR}e1/`;

function makeRow(overrides: Partial<SetMediaRow> = {}): SetMediaRow {
  return {
    id: "clip1",
    set_id: "s1",
    exercise_id: "e1",
    kind: "video",
    rel_path: "form-clips/e1/clip1.mp4",
    duration_ms: null,
    size_bytes: null,
    width: null,
    height: null,
    pending_delete: 0,
    created_at: Date.now(),
    ...overrides,
  } as SetMediaRow;
}

beforeEach(() => {
  jest.clearAllMocks();
  FileSystem.__resetState();
  (Platform as { OS: string }).OS = "ios";
  // Default: insertSetMedia returns the row
  DbMock.insertSetMedia.mockImplementation(async (params: Record<string, unknown>) => ({
    ...params,
    pending_delete: 0,
  }));
});

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------
describe("path helpers", () => {
  it("toRelPath strips documentDirectory prefix", () => {
    expect(toRelPath(`${DOC}form-clips/ex1/clip1.mp4`)).toBe("form-clips/ex1/clip1.mp4");
  });

  it("toAbsPath prepends documentDirectory", () => {
    expect(toAbsPath("form-clips/ex1/clip1.mp4")).toBe(`${DOC}form-clips/ex1/clip1.mp4`);
  });

  it("toRelPath is idempotent on already-relative paths", () => {
    expect(toRelPath("form-clips/ex1/clip1.mp4")).toBe("form-clips/ex1/clip1.mp4");
  });
});

// ---------------------------------------------------------------------------
// AC16: web returns no-ops / empty arrays
// ---------------------------------------------------------------------------
describe("AC16 — web no-ops", () => {
  beforeEach(() => {
    (Platform as { OS: string }).OS = "web";
  });

  it("getClipsForExercise returns [] on web", async () => {
    expect(await getClipsForExercise("ex1")).toEqual([]);
    expect(DbMock.getClipsForExercise).not.toHaveBeenCalled();
  });

  it("getClipForSet returns null on web", async () => {
    expect(await getClipForSet("set1")).toBeNull();
    expect(DbMock.getClipForSet).not.toHaveBeenCalled();
  });

  it("getStorageStats returns {0,0} on web", async () => {
    expect(await getStorageStats()).toEqual({ totalBytes: 0, count: 0 });
    expect(DbMock.getSetMediaStats).not.toHaveBeenCalled();
  });

  it("recordClip throws on web", async () => {
    await expect(
      recordClip({ setId: "s1", exerciseId: "e1", uri: "file:///tmp/clip.mp4" })
    ).rejects.toThrow();
  });

  it("reconcileOrphans is a no-op on web", async () => {
    await reconcileOrphans();
    expect(DbMock.getAllSetMediaRows).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// recordClip
// ---------------------------------------------------------------------------
describe("recordClip (iOS)", () => {
  it("moves source file to clips directory", async () => {
    await recordClip({ setId: "s1", exerciseId: "e1", uri: "file:///tmp/clip.mp4" });
    const moves = FileSystem.__getFileMoves();
    expect(moves).toHaveLength(1);
    expect(moves[0].from).toBe("file:///tmp/clip.mp4");
    expect(moves[0].to).toContain("form-clips/e1/");
  });

  it("calls setExcludedFromBackup on iOS", async () => {
    await recordClip({ setId: "s1", exerciseId: "e1", uri: "file:///tmp/clip.mp4" });
    expect(mockSetExcludedFromBackup).toHaveBeenCalledTimes(1);
  });

  it("does NOT call setExcludedFromBackup on Android", async () => {
    (Platform as { OS: string }).OS = "android";
    await recordClip({ setId: "s1", exerciseId: "e1", uri: "file:///tmp/clip.mp4" });
    expect(mockSetExcludedFromBackup).not.toHaveBeenCalled();
  });

  it("inserts DB row with correct fields", async () => {
    await recordClip({ setId: "s1", exerciseId: "e1", uri: "file:///tmp/clip.mp4", durationMs: 10000 });
    expect(DbMock.insertSetMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        set_id: "s1",
        exercise_id: "e1",
        kind: "video",
        rel_path: expect.stringContaining("form-clips/e1/"),
        duration_ms: 10000,
      })
    );
  });

  it("stores a relative (not absolute) rel_path in DB", async () => {
    await recordClip({ setId: "s1", exerciseId: "e1", uri: "file:///tmp/clip.mp4" });
    const call = DbMock.insertSetMedia.mock.calls[0][0] as { rel_path: string };
    expect(call.rel_path).not.toContain("file:///var/mobile/Documents/");
  });
});

// ---------------------------------------------------------------------------
// softDeleteClip
// ---------------------------------------------------------------------------
describe("softDeleteClip", () => {
  it("delegates to dbSoftDeleteClip with the clip id", async () => {
    await softDeleteClip("clip1");
    expect(DbMock.softDeleteClip).toHaveBeenCalledWith("clip1");
  });
});

// ---------------------------------------------------------------------------
// reconcileOrphans — AC18
// ---------------------------------------------------------------------------
describe("reconcileOrphans", () => {
  it("AC18(a): row present, file missing → row survives, file NOT unlinked", async () => {
    DbMock.getAllSetMediaRows.mockResolvedValueOnce([makeRow()] as SetMediaRow[]);
    // No file state for clip1.mp4 → file.exists = false
    // Root dir set as existing with one exercise dir
    const exDir = new FileSystem.Directory(ROOT_DIR, "e1");
    const file = new FileSystem.File(EX_DIR, "clip1.mp4");
    FileSystem.__setDirListing(ROOT_DIR, [exDir]);
    FileSystem.__setDirListing(EX_DIR, [file]);
    // file is NOT in __setFileState → file.exists = false → reconciler skips it

    await reconcileOrphans();

    expect(FileSystem.__getFileDeletes()).not.toContain(file.uri);
    expect(DbMock.hardDeleteClip).not.toHaveBeenCalled();
  });

  it("AC18(e): pending_delete=1 row, file missing → ENOENT swallowed, row hard-deleted", async () => {
    DbMock.getAllSetMediaRows.mockResolvedValueOnce([makeRow({ pending_delete: 1 })] as SetMediaRow[]);
    // Root dir does NOT exist → no FS enumeration after pending sweep
    // File does NOT exist (no __setFileState) → f.exists = false, f.delete() not called

    await reconcileOrphans();

    expect(DbMock.hardDeleteClip).toHaveBeenCalledWith("clip1");
  });

  it("AC18(e): pending_delete=1 row, file exists → file deleted + row hard-deleted", async () => {
    DbMock.getAllSetMediaRows.mockResolvedValueOnce([makeRow({ pending_delete: 1 })] as SetMediaRow[]);
    const clipUri = `${DOC}form-clips/e1/clip1.mp4`;
    FileSystem.__setFileState(clipUri, { exists: true });

    await reconcileOrphans();

    expect(FileSystem.__getFileDeletes()).toContain(clipUri);
    expect(DbMock.hardDeleteClip).toHaveBeenCalledWith("clip1");
  });

  it("AC18(b): file present + no DB row + mtime > 30s → orphan unlinked", async () => {
    DbMock.getAllSetMediaRows.mockResolvedValueOnce([] as SetMediaRow[]);
    const oldMtime = Date.now() - 60_000; // 60s ago, well past 30s grace

    const exDir = new FileSystem.Directory(ROOT_DIR, "e1");
    const file = new FileSystem.File(EX_DIR, "clip1.mp4");
    FileSystem.__setFileState(file.uri, { exists: true, modificationTime: oldMtime });
    FileSystem.__setDirListing(ROOT_DIR, [exDir]);
    FileSystem.__setDirListing(EX_DIR, [file]);

    await reconcileOrphans();

    expect(FileSystem.__getFileDeletes()).toContain(file.uri);
  });

  it("AC18(d): concurrent-write race — file within 30s grace NOT unlinked", async () => {
    DbMock.getAllSetMediaRows.mockResolvedValueOnce([] as SetMediaRow[]);
    const recentMtime = Date.now() - 5_000; // only 5s ago

    const exDir = new FileSystem.Directory(ROOT_DIR, "e1");
    const file = new FileSystem.File(EX_DIR, "new-clip.mp4");
    FileSystem.__setFileState(file.uri, { exists: true, modificationTime: recentMtime });
    FileSystem.__setDirListing(ROOT_DIR, [exDir]);
    FileSystem.__setDirListing(EX_DIR, [file]);

    await reconcileOrphans();

    expect(FileSystem.__getFileDeletes()).not.toContain(file.uri);
  });

  it("returns early when root form-clips directory does not exist", async () => {
    DbMock.getAllSetMediaRows.mockResolvedValueOnce([] as SetMediaRow[]);
    // No __setDirListing for ROOT_DIR → root.exists = false

    await reconcileOrphans();

    expect(FileSystem.__getFileDeletes()).toHaveLength(0);
    expect(DbMock.hardDeleteClip).not.toHaveBeenCalled();
  });

  it("skips non-mp4 files (thumbnails) in exercise directories", async () => {
    DbMock.getAllSetMediaRows.mockResolvedValueOnce([] as SetMediaRow[]);
    const exDir = new FileSystem.Directory(ROOT_DIR, "e1");
    const thumbFile = new FileSystem.File(EX_DIR, "clip1.jpg");
    FileSystem.__setFileState(thumbFile.uri, { exists: true, modificationTime: Date.now() - 60_000 });
    FileSystem.__setDirListing(ROOT_DIR, [exDir]);
    FileSystem.__setDirListing(EX_DIR, [thumbFile]);

    await reconcileOrphans();

    expect(FileSystem.__getFileDeletes()).not.toContain(thumbFile.uri);
  });
});

// ---------------------------------------------------------------------------
// getStorageStats
// ---------------------------------------------------------------------------
describe("getStorageStats", () => {
  it("returns count and totalBytes from DB", async () => {
    DbMock.getSetMediaStats.mockResolvedValueOnce({ count: 5, totalBytes: 52428800 });
    expect(await getStorageStats()).toEqual({ count: 5, totalBytes: 52428800 });
  });
});
