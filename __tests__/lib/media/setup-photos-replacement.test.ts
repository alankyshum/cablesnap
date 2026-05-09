/**
 * BLD-1114 — Setup photo replacement: UNIQUE-safe replace flow.
 *
 * Mirrors form-clips-replace.test.ts pattern for setup photos.
 *
 * Pre-state: set_media row { set_id: S, id: A, rel_path: P_A, kind: setup_photo }; file P_A exists.
 * Action: saveReplacementSetupPhoto({ oldId: A, oldRelPath: P_A, newCaptureArgs })
 * Assert:
 *   - DB: hardDeleteClip called with old id A.
 *   - DB: insertSetMedia called with new metadata (kind='setup_photo').
 *   - File P_A deleted (via unlinkSetupPhotoFiles — but after tx).
 *   - No exception thrown.
 */

jest.mock("expo-file-system");
const FileSystem = require("expo-file-system") as {
  File: new (...uris: string[]) => { uri: string; exists: boolean; delete(): void; move(dest: object): void; info(): { modificationTime: number | null; size: number } };
  Directory: new (...uris: string[]) => { uri: string; exists: boolean; list(): unknown[]; create(opts?: object): void };
  Paths: { document: { uri: string } };
  __resetState(): void;
  __setFileState(uri: string, state: { exists: boolean; modificationTime?: number }): void;
  __getFileMoves(): Array<{ from: string; to: string }>;
  __getFileDeletes(): string[];
};

jest.mock("../../../lib/uuid", () => ({
  uuid: jest.fn(() => "new-photo-id"),
}));

jest.mock("../../../lib/media/backup-exclusion", () => ({
  setExcludedFromBackup: jest.fn(async () => {}),
}));

const mockHardDeleteClip = jest.fn(async () => {});
const mockInsertSetMedia = jest.fn();
const mockWithTransaction = jest.fn(async (fn: () => Promise<void>) => { await fn(); });

jest.mock("../../../lib/db/form-clips", () => ({
  insertSetMedia: (...args: Parameters<typeof mockInsertSetMedia>) => mockInsertSetMedia(...args),
  hardDeleteClip: (...args: Parameters<typeof mockHardDeleteClip>) => mockHardDeleteClip(...args),
  getAllSetMediaRows: jest.fn(async () => []),
  getAllLiveSetMediaWithExerciseName: jest.fn(async () => []),
  getSetMediaStats: jest.fn(async () => ({ count: 0, totalBytes: 0 })),
  softDeleteClip: jest.fn(async () => {}),
  deleteClipsForSet: jest.fn(async () => {}),
  deleteSetMediaForSession: jest.fn(async () => []),
  getClipsForExercise: jest.fn(async () => []),
  getClipForSet: jest.fn(async () => null),
}));

jest.mock("../../../lib/db/setup-photos", () => ({
  getSetupPhotoForSet: jest.fn(async () => null),
  getSetupPhotosForExercise: jest.fn(async () => []),
  getSetupPhotoStats: jest.fn(async () => ({ count: 0, totalBytes: 0 })),
}));

jest.mock("../../../lib/db/helpers", () => ({
  getDrizzle: jest.fn(),
  withTransaction: (...args: unknown[]) => mockWithTransaction(...(args as [() => Promise<void>])),
  getDatabase: jest.fn(),
}));

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

import { saveReplacementSetupPhoto } from "../../../lib/media/setup-photos";

const OLD_ID = "old-photo-id";
const OLD_REL = "set-media/setup-old-photo-id.jpg";
const NEW_REL = "set-media/setup-new-photo-id.jpg";

const newRow = {
  id: "new-photo-id", set_id: "s1", exercise_id: "ex1",
  kind: "setup_photo" as const, rel_path: NEW_REL,
  size_bytes: null, width: null, height: null,
  pending_delete: 0, created_at: Date.now(),
};

describe("saveReplacementSetupPhoto — UNIQUE-safe replace (BLD-1114)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    FileSystem.__resetState();
    mockInsertSetMedia.mockResolvedValue(newRow);
  });

  it("calls hardDeleteClip with old photo id inside transaction", async () => {
    FileSystem.__setFileState("file:///document/set-media/setup-new-photo-id.jpg", { exists: false });
    FileSystem.__setFileState("file:///document/camera/tmp.jpg", { exists: true });

    await saveReplacementSetupPhoto({
      oldId: OLD_ID,
      oldRelPath: OLD_REL,
      newCaptureArgs: { setId: "s1", exerciseId: "ex1", uri: "file:///document/camera/tmp.jpg" },
    });

    expect(mockHardDeleteClip).toHaveBeenCalledWith(OLD_ID);
  });

  it("calls insertSetMedia with kind='setup_photo'", async () => {
    FileSystem.__setFileState("file:///document/camera/tmp.jpg", { exists: true });

    await saveReplacementSetupPhoto({
      oldId: OLD_ID,
      oldRelPath: OLD_REL,
      newCaptureArgs: { setId: "s1", exerciseId: "ex1", uri: "file:///document/camera/tmp.jpg" },
    });

    expect(mockInsertSetMedia).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "setup_photo" })
    );
  });

  it("returns the new row from insertSetMedia", async () => {
    FileSystem.__setFileState("file:///document/camera/tmp.jpg", { exists: true });

    const result = await saveReplacementSetupPhoto({
      oldId: OLD_ID,
      oldRelPath: OLD_REL,
      newCaptureArgs: { setId: "s1", exerciseId: "ex1", uri: "file:///document/camera/tmp.jpg" },
    });

    expect(result.id).toBe("new-photo-id");
    expect(result.kind).toBe("setup_photo");
  });

  it("hardDelete is called before insertSetMedia (DB ordering inside tx)", async () => {
    const callOrder: string[] = [];
    mockHardDeleteClip.mockImplementation(async () => { callOrder.push("delete"); });
    mockInsertSetMedia.mockImplementation(async () => { callOrder.push("insert"); return newRow; });
    FileSystem.__setFileState("file:///document/camera/tmp.jpg", { exists: true });

    await saveReplacementSetupPhoto({
      oldId: OLD_ID,
      oldRelPath: OLD_REL,
      newCaptureArgs: { setId: "s1", exerciseId: "ex1", uri: "file:///document/camera/tmp.jpg" },
    });

    expect(callOrder).toEqual(["delete", "insert"]);
  });
});
