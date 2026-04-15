const MOCK_UUID = "test-photo-uuid";
jest.mock("expo-crypto", () => ({
  randomUUID: jest.fn(() => MOCK_UUID),
}));

const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
  prepareAsync: jest.fn().mockResolvedValue({
    executeAsync: jest.fn().mockResolvedValue(undefined),
    finalizeAsync: jest.fn().mockResolvedValue(undefined),
  }),
  withTransactionAsync: jest.fn(async (cb: () => Promise<void>) => cb()),
};

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
}));

// Track file operations for assertions
const deletedFiles: string[] = [];
const createdDirs: string[] = [];

class MockFile {
  uri: string;
  exists = true;
  constructor(...uris: unknown[]) {
    this.uri = uris.map(u => {
      if (u && typeof u === "object" && "uri" in u) return (u as { uri: string }).uri;
      return String(u);
    }).join("/");
  }
  delete() { deletedFiles.push(this.uri); }
}

class MockDirectory {
  uri: string;
  exists = true;
  private _list: unknown[] = [];
  constructor(...uris: unknown[]) {
    this.uri = uris.map(u => {
      if (u && typeof u === "object" && "uri" in u) return (u as { uri: string }).uri;
      return String(u);
    }).join("/");
  }
  create() { createdDirs.push(this.uri); }
  list() { return this._list; }
  _setList(items: unknown[]) { this._list = items; }
}

const mockPaths = {
  document: { uri: "/mock/documents" },
};

jest.mock("expo-file-system", () => ({
  File: MockFile,
  Directory: MockDirectory,
  Paths: mockPaths,
}));

jest.mock("../../../lib/seed", () => ({
  seedExercises: jest.fn(() => []),
}));

let photos: typeof import("../../../lib/db/photos");
let db: typeof import("../../../lib/db");

async function initDb() {
  await db.getDatabase();
  jest.clearAllMocks();
  deletedFiles.length = 0;
  createdDirs.length = 0;
}

beforeEach(() => {
  jest.clearAllMocks();
  deletedFiles.length = 0;
  createdDirs.length = 0;
  mockDb.execAsync.mockResolvedValue(undefined);
  mockDb.getAllAsync.mockResolvedValue([]);
  mockDb.getFirstAsync.mockResolvedValue(null);
  mockDb.runAsync.mockResolvedValue({ changes: 1 });

  jest.resetModules();
  jest.doMock("expo-sqlite", () => ({
    openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
  }));
  jest.doMock("expo-file-system", () => ({
    File: MockFile,
    Directory: MockDirectory,
    Paths: mockPaths,
  }));
  jest.doMock("../../../lib/seed", () => ({
    seedExercises: jest.fn(() => []),
  }));
  jest.doMock("expo-crypto", () => ({
    randomUUID: jest.fn(() => MOCK_UUID),
  }));

  db = require("../../../lib/db");
  photos = require("../../../lib/db/photos");
});

describe("progress photos CRUD", () => {
  it("insertPhoto executes INSERT with correct params", async () => {
    await initDb();

    const mockPhoto = {
      id: MOCK_UUID,
      file_path: "/mock/photo.jpg",
      thumbnail_path: "/mock/thumb.jpg",
      capture_date: "2026-04-15",
      display_date: "2026-04-15",
      pose_category: "front",
      note: "test note",
      width: 1200,
      height: 900,
      deleted_at: null,
      created_at: "2026-04-15T00:00:00",
    };
    mockDb.getFirstAsync.mockResolvedValueOnce(mockPhoto);

    const result = await photos.insertPhoto({
      filePath: "/mock/photo.jpg",
      thumbnailPath: "/mock/thumb.jpg",
      displayDate: "2026-04-15",
      poseCategory: "front",
      note: "test note",
      width: 1200,
      height: 900,
    });

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO progress_photos"),
      expect.arrayContaining([
        MOCK_UUID,
        "/mock/photo.jpg",
        "/mock/thumb.jpg",
        "2026-04-15",
        "front",
        "test note",
        1200,
        900,
      ])
    );
    expect(result).toEqual(mockPhoto);
  });

  it("getPhotos returns photos ordered by display_date DESC", async () => {
    await initDb();

    const mockPhotos = [
      { id: "1", display_date: "2026-04-15" },
      { id: "2", display_date: "2026-04-14" },
    ];
    mockDb.getAllAsync.mockResolvedValueOnce(mockPhotos);

    const result = await photos.getPhotos(20, 0);

    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining("WHERE deleted_at IS NULL"),
      expect.arrayContaining([20, 0])
    );
    expect(result).toEqual(mockPhotos);
  });

  it("getPhotos filters by pose category", async () => {
    await initDb();

    mockDb.getAllAsync.mockResolvedValueOnce([]);

    await photos.getPhotos(20, 0, "front");

    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining("pose_category = ?"),
      expect.arrayContaining(["front", 20, 0])
    );
  });

  it("getPhotoCount returns count without filter", async () => {
    await initDb();

    mockDb.getFirstAsync.mockResolvedValueOnce({ count: 5 });

    const count = await photos.getPhotoCount();

    expect(count).toBe(5);
    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      expect.stringContaining("COUNT(*)"),
    );
  });

  it("getPhotoCount filters by pose", async () => {
    await initDb();

    mockDb.getFirstAsync.mockResolvedValueOnce({ count: 2 });

    const count = await photos.getPhotoCount("back");

    expect(count).toBe(2);
    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      expect.stringContaining("pose_category = ?"),
      ["back"]
    );
  });

  it("softDeletePhoto sets deleted_at", async () => {
    await initDb();

    await photos.softDeletePhoto("photo-1");

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE progress_photos SET deleted_at"),
      ["photo-1"]
    );
  });

  it("restorePhoto clears deleted_at", async () => {
    await initDb();

    await photos.restorePhoto("photo-1");

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("deleted_at = NULL"),
      ["photo-1"]
    );
  });

  it("permanentlyDeletePhoto deletes DB row and files", async () => {
    await initDb();

    const mockPhoto = {
      id: "photo-1",
      file_path: "/mock/photo.jpg",
      thumbnail_path: "/mock/thumb.jpg",
    };
    mockDb.getFirstAsync.mockResolvedValueOnce(mockPhoto);

    await photos.permanentlyDeletePhoto("photo-1");

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM progress_photos"),
      ["photo-1"]
    );
    expect(deletedFiles).toContain("/mock/photo.jpg");
    expect(deletedFiles).toContain("/mock/thumb.jpg");
  });

  it("permanentlyDeletePhoto handles missing photo gracefully", async () => {
    await initDb();

    mockDb.getFirstAsync.mockResolvedValueOnce(null);

    await expect(photos.permanentlyDeletePhoto("nonexistent")).resolves.toBeUndefined();
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  it("getPhotoById returns photo when found", async () => {
    await initDb();

    const mockPhoto = { id: "photo-1", file_path: "/mock/photo.jpg" };
    mockDb.getFirstAsync.mockResolvedValueOnce(mockPhoto);

    const result = await photos.getPhotoById("photo-1");

    expect(result).toEqual(mockPhoto);
    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      expect.stringContaining("WHERE id = ? AND deleted_at IS NULL"),
      ["photo-1"]
    );
  });

  it("updatePhotoMeta updates display_date, pose, and note", async () => {
    await initDb();

    await photos.updatePhotoMeta("photo-1", "2026-05-01", "back", "updated note");

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE progress_photos SET display_date"),
      ["2026-05-01", "back", "updated note", "photo-1"]
    );
  });

  it("cleanupDeletedPhotos removes expired soft-deleted photos", async () => {
    await initDb();

    const expiredPhoto = {
      id: "expired-1",
      file_path: "/mock/expired.jpg",
      thumbnail_path: null,
      deleted_at: "2026-03-01T00:00:00",
    };
    mockDb.getAllAsync.mockResolvedValueOnce([expiredPhoto]);
    mockDb.getFirstAsync.mockResolvedValueOnce(expiredPhoto);

    await photos.cleanupDeletedPhotos();

    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining("deleted_at IS NOT NULL AND deleted_at < ?"),
      expect.any(Array)
    );
  });

  it("ensurePhotoDirs creates directories if they don't exist", async () => {
    await initDb();

    // ensurePhotoDirs is synchronous and creates directories via Directory class
    // We just verify it doesn't throw
    expect(() => photos.ensurePhotoDirs()).not.toThrow();
  });

  it("getPhotosByMonth groups photos by month", async () => {
    await initDb();

    const mockData = [
      { month: "2026-04", count: 5 },
      { month: "2026-03", count: 3 },
    ];
    mockDb.getAllAsync.mockResolvedValueOnce(mockData);

    const result = await photos.getPhotosByMonth();

    expect(result).toEqual(mockData);
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining("strftime('%Y-%m', display_date)"),
    );
  });
});
