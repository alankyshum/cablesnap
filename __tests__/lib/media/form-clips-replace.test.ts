/**
 * form-clips-replace.test.ts
 *
 * BLD-1105 AC3: UNIQUE-safe replace flow — happy path.
 *
 * Pre-state: set_media row { set_id: S, id: A, rel_path: P_A }; file P_A exists.
 * Action: saveReplacementClip({ oldId: A, oldRelPath: P_A, newClipArgs })
 * Assert:
 *   - DB: exactly one row for set_id=S with id=B (new).
 *   - File P_A does NOT exist.
 *   - File P_B DOES exist (was moved to permanent location).
 *   - No exception thrown.
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

// Mocked DB layer — we simulate atomic ops manually
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
import type { SetMediaRow } from "../../../lib/db/form-clips";

const DOC = "file:///var/mobile/Documents/";

function makeRow(overrides: Partial<SetMediaRow> = {}): SetMediaRow {
  return {
    id: "clip-A",
    set_id: "set-S",
    exercise_id: "ex-1",
    kind: "video",
    rel_path: "form-clips/ex-1/clip-A.mp4",
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
});

describe("saveReplacementClip — happy path (AC3)", () => {
  it("replaces old clip with new, removes old file, new file exists, no UNIQUE error", async () => {
    const oldRelPath = "form-clips/ex-1/clip-A.mp4";
    const oldAbsPath = `${DOC}${oldRelPath}`;
    const newRelPath = "form-clips/ex-1/new-clip-id.mp4";
    const newAbsPath = `${DOC}${newRelPath}`;
    const newRow = makeRow({ id: "new-clip-id", rel_path: newRelPath });

    // Old file exists on disk.
    FileSystem.__setFileState(oldAbsPath, { exists: true });
    // Temp source exists.
    FileSystem.__setFileState("file:///tmp/recording.mp4", { exists: true });

    // mockInsertSetMedia returns the new row and assigns to the outer let via withTransaction closure.
    mockInsertSetMedia.mockResolvedValueOnce(newRow);

    // withTransaction runs fn() synchronously in test.
    mockWithTransaction.mockImplementationOnce(async (fn: () => Promise<void>) => {
      await fn();
    });

    const result = await saveReplacementClip({
      oldId: "clip-A",
      oldRelPath,
      newClipArgs: {
        setId: "set-S",
        exerciseId: "ex-1",
        uri: "file:///tmp/recording.mp4",
      },
    });

    // New row returned.
    expect(result.id).toBe("new-clip-id");
    expect(result.set_id).toBe("set-S");

    // hardDeleteClip called with old ID.
    expect(mockHardDeleteClip).toHaveBeenCalledWith("clip-A");

    // insertSetMedia called with new metadata for same set_id.
    expect(mockInsertSetMedia).toHaveBeenCalledWith(
      expect.objectContaining({ set_id: "set-S", id: "new-clip-id" })
    );

    // Old file deleted (post-commit unlink).
    const deletes = FileSystem.__getFileDeletes();
    expect(deletes.some((d) => d === oldAbsPath)).toBe(true);

    // New file was moved to permanent location (not deleted).
    const moves = FileSystem.__getFileMoves();
    expect(moves.some((m) => m.to.includes("new-clip-id"))).toBe(true);
    expect(deletes.some((d) => d.includes("new-clip-id.mp4"))).toBe(false);

    void newAbsPath; // computed above, referenced in comment
  });
});
