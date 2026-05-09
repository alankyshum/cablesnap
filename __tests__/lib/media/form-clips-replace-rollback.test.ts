/**
 * form-clips-replace-rollback.test.ts
 *
 * BLD-1105 AC3: Replace rollback path.
 *
 * When insertSetMedia throws inside the transaction, the caller should:
 *   - Re-throw the error.
 *   - Eagerly unlink the NEW file (P_B) in the catch handler.
 *   - Leave the prior DB row (A) intact (withTransaction rolls back).
 *   - Leave the old file (P_A) on disk.
 */

jest.mock("expo-file-system");
// eslint-disable-next-line @typescript-eslint/no-var-requires
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
  uuid: jest.fn(() => "new-clip-id"),
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

jest.mock("../../../lib/db/helpers", () => ({
  getDrizzle: jest.fn(),
  withTransaction: (...args: unknown[]) => mockWithTransaction(...(args as [() => Promise<void>])),
  getDatabase: jest.fn(),
}));

import { Platform } from "react-native";
import { saveReplacementClip } from "../../../lib/media/form-clips";

const DOC = "file:///var/mobile/Documents/";

beforeEach(() => {
  jest.clearAllMocks();
  FileSystem.__resetState();
  (Platform as { OS: string }).OS = "ios";
});

describe("saveReplacementClip — rollback path (AC3)", () => {
  it("re-throws when insertSetMedia throws; eagerly unlinks new file; old file preserved", async () => {
    const oldRelPath = "form-clips/ex-1/clip-A.mp4";
    const oldAbsPath = `${DOC}${oldRelPath}`;
    const newAbsPath = `${DOC}form-clips/ex-1/new-clip-id.mp4`;

    // Old file exists.
    FileSystem.__setFileState(oldAbsPath, { exists: true });
    // Source temp exists.
    FileSystem.__setFileState("file:///tmp/recording.mp4", { exists: true });
    // New destination will exist after move.
    FileSystem.__setFileState(newAbsPath, { exists: true });

    const insertError = new Error("SQLITE_CONSTRAINT_UNIQUE");
    mockInsertSetMedia.mockRejectedValueOnce(insertError);

    // withTransaction runs fn(), which throws — re-throw to caller.
    mockWithTransaction.mockImplementationOnce(async (fn: () => Promise<void>) => {
      await fn();
    });

    await expect(
      saveReplacementClip({
        oldId: "clip-A",
        oldRelPath,
        newClipArgs: {
          setId: "set-S",
          exerciseId: "ex-1",
          uri: "file:///tmp/recording.mp4",
        },
      })
    ).rejects.toThrow("SQLITE_CONSTRAINT_UNIQUE");

    // New file eagerly unlinked by catch handler.
    const deletes = FileSystem.__getFileDeletes();
    expect(deletes.some((d) => d.includes("new-clip-id.mp4"))).toBe(true);

    // Old file NOT deleted (prior clip preserved — tx rolled back).
    expect(deletes.some((d) => d === oldAbsPath)).toBe(false);
  });

  it("re-throws and unlinks new file when withTransaction itself throws", async () => {
    const oldRelPath = "form-clips/ex-1/clip-A.mp4";
    const newAbsPath = `${DOC}form-clips/ex-1/new-clip-id.mp4`;

    FileSystem.__setFileState("file:///tmp/recording.mp4", { exists: true });
    FileSystem.__setFileState(newAbsPath, { exists: true });

    const txError = new Error("database is locked");
    mockWithTransaction.mockRejectedValueOnce(txError);

    await expect(
      saveReplacementClip({
        oldId: "clip-A",
        oldRelPath,
        newClipArgs: {
          setId: "set-S",
          exerciseId: "ex-1",
          uri: "file:///tmp/recording.mp4",
        },
      })
    ).rejects.toThrow("database is locked");

    const deletes = FileSystem.__getFileDeletes();
    expect(deletes.some((d) => d.includes("new-clip-id.mp4"))).toBe(true);
  });
});
