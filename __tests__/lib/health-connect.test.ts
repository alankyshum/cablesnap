/**
 * Health Connect integration tests (Phase 49)
 * Tests DB layer (health_connect_sync_log) and core sync logic.
 */

// Mock DB helpers
const mockExecute = jest.fn().mockResolvedValue(undefined);
const mockQuery = jest.fn().mockResolvedValue([]);
const mockQueryOne = jest.fn().mockResolvedValue(null);

jest.mock("../../lib/db/helpers", () => ({
  execute: (...args: unknown[]) => mockExecute(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
}));

jest.mock("../../lib/uuid", () => ({
  uuid: () => "test-uuid-1234",
}));

import {
  createHCSyncLogEntry,
  markHCSyncSuccess,
  markHCSyncFailed,
  markHCSyncPermanentlyFailed,
  getHCPendingOrFailedSyncs,
  getHCSyncLogForSession,
  markAllHCPendingAsFailed,
} from "../../lib/db/health-connect";

describe("Health Connect DB functions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("createHCSyncLogEntry inserts a pending entry with INSERT OR IGNORE", async () => {
    const id = await createHCSyncLogEntry("session-abc");
    expect(id).toBe("test-uuid-1234");
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT OR IGNORE INTO health_connect_sync_log"),
      expect.arrayContaining(["test-uuid-1234", "session-abc"])
    );
  });

  it("markHCSyncSuccess updates status and stores record ID", async () => {
    await markHCSyncSuccess("session-abc", "hc-record-id");
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'synced'"),
      expect.arrayContaining(["hc-record-id", "session-abc"])
    );
  });

  it("markHCSyncSuccess handles undefined record ID", async () => {
    await markHCSyncSuccess("session-abc");
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'synced'"),
      expect.arrayContaining([null, "session-abc"])
    );
  });

  it("markHCSyncFailed increments retry_count", async () => {
    await markHCSyncFailed("session-abc", "Network error");
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("retry_count = retry_count + 1"),
      ["Network error", "session-abc"]
    );
  });

  it("markHCSyncPermanentlyFailed sets status and optional reason", async () => {
    await markHCSyncPermanentlyFailed("session-abc", "Max retries exceeded");
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("permanently_failed"),
      ["Max retries exceeded", "session-abc"]
    );
  });

  it("markAllHCPendingAsFailed marks all pending/failed entries", async () => {
    await markAllHCPendingAsFailed("User disabled Health Connect");
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("WHERE status IN ('pending', 'failed')"),
      ["User disabled Health Connect"]
    );
  });

  it("getHCPendingOrFailedSyncs queries pending and failed entries", async () => {
    mockQuery.mockResolvedValueOnce([
      { id: "1", session_id: "s1", status: "pending", retry_count: 0 },
      { id: "2", session_id: "s2", status: "failed", retry_count: 1 },
    ]);
    const result = await getHCPendingOrFailedSyncs();
    expect(result).toHaveLength(2);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("status IN ('pending', 'failed')"),
    );
  });

  it("getHCSyncLogForSession returns entry for session", async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: "1",
      session_id: "s1",
      status: "synced",
    });
    const result = await getHCSyncLogForSession("s1");
    expect(result?.status).toBe("synced");
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining("WHERE session_id = ?"),
      ["s1"]
    );
  });
});

describe("Health Connect settings integration", () => {
  it("settings.tsx imports AccessibilityInfo for a11y announcements", async () => {
    // Structural test: verify AccessibilityInfo is imported
    const fs = require("fs");
    const source = fs.readFileSync("app/(tabs)/settings.tsx", "utf8");
    expect(source).toContain("AccessibilityInfo");
    expect(source).toContain('accessibilityRole="switch"');
    expect(source).toContain('accessibilityLabel="Sync workouts to Health Connect"');
  });

  it("settings.tsx uses dynamic import for health-connect module", () => {
    const fs = require("fs");
    const source = fs.readFileSync("app/(tabs)/settings.tsx", "utf8");
    // All HC imports must be dynamic (no static import of health-connect)
    expect(source).not.toMatch(/^import.*from.*["'].*health-connect["']/m);
    expect(source).toContain('await import("../../lib/health-connect")');
  });

  it("settings.tsx hides HC UI on non-Android platforms", () => {
    const fs = require("fs");
    const source = fs.readFileSync("app/(tabs)/settings.tsx", "utf8");
    expect(source).toContain('Platform.OS === "android"');
    expect(source).toContain('hcSdkStatus !== "unavailable"');
  });

  it("settings.tsx shows install/update button for needs_install/needs_update", () => {
    const fs = require("fs");
    const source = fs.readFileSync("app/(tabs)/settings.tsx", "utf8");
    expect(source).toContain("openHealthConnectPlayStore");
    expect(source).toContain('"Install Health Connect from Play Store"');
    expect(source).toContain('"Update Health Connect"');
  });

  it("settings.tsx has ≥48dp touch target for install/update button", () => {
    const fs = require("fs");
    const source = fs.readFileSync("app/(tabs)/settings.tsx", "utf8");
    expect(source).toContain("minHeight: 48");
  });
});

describe("Health Connect session sync integration", () => {
  it("session/[id].tsx uses dynamic import for HC sync", () => {
    const fs = require("fs");
    const source = fs.readFileSync("app/session/[id].tsx", "utf8");
    expect(source).toContain('await import("../../lib/health-connect")');
    expect(source).toContain("syncToHealthConnect");
    // HC sync must be Android-gated
    expect(source).toContain('Platform.OS === "android"');
  });

  it("session/[id].tsx HC sync is silent (no toast on success or failure)", () => {
    const fs = require("fs");
    const source = fs.readFileSync("app/session/[id].tsx", "utf8");
    // Find the HC sync block and verify no setSnackbar calls in it
    const hcBlock = source.match(
      /Health Connect sync[\s\S]*?catch\s*\{[\s\S]*?\}/
    );
    expect(hcBlock).toBeTruthy();
    const hcCode = hcBlock![0];
    expect(hcCode).not.toContain("setSnackbar");
  });
});

describe("Health Connect startup reconciliation", () => {
  it("_layout.tsx calls reconcileHealthConnectQueue on Android startup", () => {
    const fs = require("fs");
    const source = fs.readFileSync("app/_layout.tsx", "utf8");
    expect(source).toContain("reconcileHealthConnectQueue");
    expect(source).toContain('Platform.OS === "android"');
    // Must use dynamic import
    expect(source).toContain('import("../lib/health-connect")');
  });
});

describe("Health Connect lib module", () => {
  it("lib/health-connect.ts uses dynamic import for native module", () => {
    const fs = require("fs");
    const source = fs.readFileSync("lib/health-connect.ts", "utf8");
    // Must NOT have static import of react-native-health-connect
    expect(source).not.toMatch(/^import.*from.*["']react-native-health-connect["']/m);
    // Must use dynamic import
    expect(source).toContain('import("react-native-health-connect")');
  });

  it("lib/health-connect.ts includes clientRecordId for deduplication", () => {
    const fs = require("fs");
    const source = fs.readFileSync("lib/health-connect.ts", "utf8");
    expect(source).toContain("clientRecordId");
    expect(source).toContain("fitforge-");
  });

  it("lib/health-connect.ts calls ensureInitialized before API calls", () => {
    const fs = require("fs");
    const source = fs.readFileSync("lib/health-connect.ts", "utf8");
    expect(source).toContain("ensureInitialized");
    // ensureInitialized should call initialize()
    expect(source).toContain("await initialize()");
  });

  it("lib/health-connect.ts has MAX_RETRIES = 3", () => {
    const fs = require("fs");
    const source = fs.readFileSync("lib/health-connect.ts", "utf8");
    expect(source).toContain("MAX_RETRIES = 3");
  });

  it("lib/health-connect.ts marks 0 completed sets as permanently_failed", () => {
    const fs = require("fs");
    const source = fs.readFileSync("lib/health-connect.ts", "utf8");
    expect(source).toContain('"No completed sets"');
  });
});

describe("Health Connect DB schema", () => {
  it("helpers.ts includes health_connect_sync_log table migration", () => {
    const fs = require("fs");
    const source = fs.readFileSync("lib/db/helpers.ts", "utf8");
    expect(source).toContain("health_connect_sync_log");
    expect(source).toContain("health_connect_record_id");
    expect(source).toContain("idx_hc_sync_log_status");
  });
});

describe("Expo config plugins", () => {
  it("app.config.ts includes expo-build-properties and expo-health-connect", () => {
    const fs = require("fs");
    const source = fs.readFileSync("app.config.ts", "utf8");
    expect(source).toContain("expo-build-properties");
    expect(source).toContain("minSdkVersion: 26");
    expect(source).toContain("expo-health-connect");
    expect(source).toContain("WRITE_EXERCISE");
  });
});
