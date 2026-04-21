/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAppSetting, setAppSetting } from "../../lib/db/settings";
import { exportAllData } from "../../lib/db/import-export";

// ---- Mocks ----

const mockFiles: Map<string, { uri: string; size: number; exists: boolean; content: string }> = new Map();
const mockDirExists = jest.fn(() => true);
const mockDirCreate = jest.fn();
const mockDirList = jest.fn(() => {
  return Array.from(mockFiles.values())
    .filter((f) => f.exists)
    .map((f) => ({
      uri: f.uri,
      size: f.size,
      exists: f.exists,
      delete: jest.fn(() => { f.exists = false; }),
    }));
});

jest.mock("expo-file-system", () => ({
  File: jest.fn().mockImplementation((...args: string[]) => {
    const uri = args.join("/");
    const existing = mockFiles.get(uri);
    if (existing) return {
      uri,
      size: existing.size,
      exists: existing.exists,
      delete: jest.fn(() => { existing.exists = false; }),
      write: jest.fn(async (content: string) => {
        existing.content = content;
        existing.size = content.length;
      }),
      text: jest.fn(async () => existing.content),
    };
    const entry = { uri, size: 0, exists: false, content: "" };
    mockFiles.set(uri, entry);
    return {
      uri,
      get size() { return entry.size; },
      get exists() { return entry.exists; },
      delete: jest.fn(() => { entry.exists = false; }),
      write: jest.fn(async (content: string) => {
        entry.content = content;
        entry.size = content.length;
        entry.exists = true;
      }),
      text: jest.fn(async () => entry.content),
    };
  }),
  Directory: jest.fn().mockImplementation((...args: string[]) => ({
    uri: args.join("/"),
    get exists() { return mockDirExists(); },
    create: mockDirCreate,
    list: mockDirList,
  })),
  Paths: {
    document: "/doc",
  },
}));

jest.mock("../../lib/db/settings", () => ({
  getAppSetting: jest.fn(),
  setAppSetting: jest.fn(),
}));

jest.mock("../../lib/db/import-export", () => ({
  exportAllData: jest.fn(),
}));

const mockGetAppSetting = getAppSetting as jest.Mock;
const mockSetAppSetting = setAppSetting as jest.Mock;
const mockExportAllData = exportAllData as jest.Mock;

// ---- Helpers ----

function addMockFile(filename: string, size: number) {
  const uri = `/doc/backups/${filename}`;
  mockFiles.set(uri, { uri, size, exists: true, content: "{}" });
}

function clearMockFiles() {
  mockFiles.clear();
}

// ---- Tests ----

describe("lib/backup", () => {
  // Use require to avoid dynamic import issues in Jest
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const backup = require("../../lib/backup");

  beforeEach(() => {
    jest.clearAllMocks();
    clearMockFiles();
    mockDirExists.mockReturnValue(true);
    mockGetAppSetting.mockResolvedValue(null);
    mockSetAppSetting.mockResolvedValue(undefined);
    mockExportAllData.mockResolvedValue({
      version: 6,
      app_version: "1.0.0",
      exported_at: new Date().toISOString(),
      data: {},
      counts: {},
    });
  });

  describe("isAutoBackupEnabled", () => {
    it("defaults to true when no setting exists", async () => {
      mockGetAppSetting.mockResolvedValue(null);
      expect(await backup.isAutoBackupEnabled()).toBe(true);
    });

    it("returns true when setting is 'true'", async () => {
      mockGetAppSetting.mockResolvedValue("true");
      expect(await backup.isAutoBackupEnabled()).toBe(true);
    });

    it("returns false when setting is 'false'", async () => {
      mockGetAppSetting.mockResolvedValue("false");
      expect(await backup.isAutoBackupEnabled()).toBe(false);
    });
  });

  describe("getBackupRetention", () => {
    it("defaults to 5 when no setting exists", async () => {
      mockGetAppSetting.mockResolvedValue(null);
      expect(await backup.getBackupRetention()).toBe(5);
    });

    it("reads retention from setting", async () => {
      mockGetAppSetting.mockResolvedValue("10");
      expect(await backup.getBackupRetention()).toBe(10);
    });
  });

  describe("getBackupFiles", () => {
    it("returns empty array when directory does not exist", async () => {
      mockDirExists.mockReturnValue(false);
      const files = await backup.getBackupFiles();
      expect(files).toEqual([]);
    });

    it("returns files sorted newest-first by date from filename", async () => {
      addMockFile("cablesnap-2026-04-19-120000-000.json", 100);
      addMockFile("cablesnap-2026-04-21-080000-000.json", 200);
      addMockFile("cablesnap-2026-04-20-150000-000.json", 150);

      const files = await backup.getBackupFiles();
      expect(files).toHaveLength(3);
      expect(files[0].filename).toBe("cablesnap-2026-04-21-080000-000.json");
      expect(files[1].filename).toBe("cablesnap-2026-04-20-150000-000.json");
      expect(files[2].filename).toBe("cablesnap-2026-04-19-120000-000.json");
    });

    it("includes human-readable size labels", async () => {
      addMockFile("cablesnap-2026-04-20-120000-000.json", 1024 * 142);
      const files = await backup.getBackupFiles();
      expect(files[0].sizeLabel).toBe("142 KB");
    });
  });

  describe("pruneOldBackups — sort-order correctness (QD TEST-01)", () => {
    it("deletes oldest files when count exceeds keep limit", async () => {
      // Create 7 files with distinct dates
      addMockFile("cablesnap-2026-04-15-100000-000.json", 100); // oldest
      addMockFile("cablesnap-2026-04-16-100000-000.json", 100);
      addMockFile("cablesnap-2026-04-17-100000-000.json", 100);
      addMockFile("cablesnap-2026-04-18-100000-000.json", 100);
      addMockFile("cablesnap-2026-04-19-100000-000.json", 100);
      addMockFile("cablesnap-2026-04-20-100000-000.json", 100);
      addMockFile("cablesnap-2026-04-21-100000-000.json", 100); // newest

      const deleted = await backup.pruneOldBackups(5);
      expect(deleted).toBe(2);

      // Verify the OLDEST two are deleted, not the newest
      const remaining = await backup.getBackupFiles();
      const remainingNames = remaining.map((f: { filename: string }) => f.filename);
      expect(remainingNames).not.toContain("cablesnap-2026-04-15-100000-000.json");
      expect(remainingNames).not.toContain("cablesnap-2026-04-16-100000-000.json");
      expect(remainingNames).toContain("cablesnap-2026-04-21-100000-000.json");
      expect(remainingNames).toContain("cablesnap-2026-04-20-100000-000.json");
    });

    it("does nothing when file count is within limit", async () => {
      addMockFile("cablesnap-2026-04-20-100000-000.json", 100);
      addMockFile("cablesnap-2026-04-21-100000-000.json", 100);
      const deleted = await backup.pruneOldBackups(5);
      expect(deleted).toBe(0);
    });
  });

  describe("performAutoBackup", () => {
    it("writes backup file and updates last_backup_at", async () => {
      mockGetAppSetting.mockImplementation((key: string) => {
        if (key === "auto_backup_retention") return Promise.resolve("5");
        return Promise.resolve(null);
      });

      const result = await backup.performAutoBackup();
      expect(result.success).toBe(true);
      expect(result.path).toBeDefined();
      expect(mockExportAllData).toHaveBeenCalledTimes(1);
      expect(mockSetAppSetting).toHaveBeenCalledWith("last_backup_at", expect.any(String));
    });

    it("creates backup directory if it doesn't exist", async () => {
      mockDirExists.mockReturnValue(false);
      const result = await backup.performAutoBackup();
      expect(result.success).toBe(true);
      expect(mockDirCreate).toHaveBeenCalled();
    });

    it("returns error on failure without throwing", async () => {
      mockExportAllData.mockRejectedValue(new Error("DB locked"));
      const result = await backup.performAutoBackup();
      expect(result.success).toBe(false);
      expect(result.error).toBe("DB locked");
    });
  });

  describe("deleteBackup", () => {
    it("removes the specified file", async () => {
      addMockFile("cablesnap-2026-04-20-120000-000.json", 100);
      await backup.deleteBackup("cablesnap-2026-04-20-120000-000.json");
      const file = mockFiles.get("/doc/backups/cablesnap-2026-04-20-120000-000.json");
      expect(file?.exists).toBe(false);
    });
  });
});
