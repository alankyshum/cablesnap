/**
 * Unit tests for lib/media/backup-exclusion.ts (via the form-clips-backup module)
 *
 * Tests the platform-gating logic: on iOS the native module is invoked;
 * on Android / web all functions are no-ops returning safe defaults.
 */

import { Platform } from "react-native";

// ---- Mocks ----

const mockSetExcludedFromBackup = jest.fn(async () => {});
const mockReadBackupExclusion = jest.fn(async (): Promise<boolean> => true);
const mockExcludeFormClipsFromBackup = jest.fn(async (): Promise<{ ok: boolean; path: string }> => ({
  ok: true,
  path: "/var/mobile/Documents/form-clips",
}));

// Mock the native module resolution
jest.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: jest.fn(() => ({
    setExcludedFromBackup: mockSetExcludedFromBackup,
    readBackupExclusion: mockReadBackupExclusion,
    excludeFormClipsFromBackup: mockExcludeFormClipsFromBackup,
  })),
}));

// Import after mocks
import {
  setExcludedFromBackup,
  readBackupExclusion,
  excludeFormClipsFromBackup,
} from "../../../modules/form-clips-backup/src/index";

describe("backup-exclusion — iOS", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as { OS: string }).OS = "ios";
  });

  it("setExcludedFromBackup delegates to native module on iOS", async () => {
    await setExcludedFromBackup("file:///var/mobile/Documents/form-clips/ex1/clip1.mp4");
    expect(mockSetExcludedFromBackup).toHaveBeenCalledWith(
      "file:///var/mobile/Documents/form-clips/ex1/clip1.mp4"
    );
  });

  it("readBackupExclusion returns true when native module says true", async () => {
    mockReadBackupExclusion.mockResolvedValueOnce(true);
    const result = await readBackupExclusion("file:///var/mobile/Documents/form-clips/");
    expect(result).toBe(true);
    expect(mockReadBackupExclusion).toHaveBeenCalledWith(
      "file:///var/mobile/Documents/form-clips/"
    );
  });

  it("readBackupExclusion returns false when native module says false", async () => {
    mockReadBackupExclusion.mockResolvedValueOnce(false);
    const result = await readBackupExclusion("file:///var/mobile/Documents/form-clips/");
    expect(result).toBe(false);
  });

  it("excludeFormClipsFromBackup returns {ok, path} from native module on iOS", async () => {
    const result = await excludeFormClipsFromBackup();
    expect(result.ok).toBe(true);
    expect(result.path).toBe("/var/mobile/Documents/form-clips");
    expect(mockExcludeFormClipsFromBackup).toHaveBeenCalledTimes(1);
  });
});

describe("backup-exclusion — Android (no-op)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as { OS: string }).OS = "android";
  });

  it("setExcludedFromBackup is a no-op on Android", async () => {
    await setExcludedFromBackup("file:///data/user/0/com.persoack.cablesnap/files/form-clips/clip.mp4");
    expect(mockSetExcludedFromBackup).not.toHaveBeenCalled();
  });

  it("readBackupExclusion returns false on Android without calling native", async () => {
    const result = await readBackupExclusion("file:///data/user/0/com.persoack.cablesnap/files/form-clips/");
    expect(result).toBe(false);
    expect(mockReadBackupExclusion).not.toHaveBeenCalled();
  });

  it("excludeFormClipsFromBackup returns {ok: true, path: ''} on Android without calling native", async () => {
    const result = await excludeFormClipsFromBackup();
    expect(result).toEqual({ ok: true, path: "" });
    expect(mockExcludeFormClipsFromBackup).not.toHaveBeenCalled();
  });
});

describe("backup-exclusion — web (no-op)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as { OS: string }).OS = "web";
  });

  it("all functions are no-ops on web", async () => {
    await setExcludedFromBackup("file:///anything");
    const excl = await readBackupExclusion("file:///anything");
    const boot = await excludeFormClipsFromBackup();

    expect(mockSetExcludedFromBackup).not.toHaveBeenCalled();
    expect(mockReadBackupExclusion).not.toHaveBeenCalled();
    expect(mockExcludeFormClipsFromBackup).not.toHaveBeenCalled();
    expect(excl).toBe(false);
    expect(boot).toEqual({ ok: true, path: "" });
  });
});
