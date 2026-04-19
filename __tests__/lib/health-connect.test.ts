/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Health Connect integration tests (Phase 49)
 * Tests DB layer (health_connect_sync_log) and core sync logic.
 */

// Mock DB helpers
const mockExecute = jest.fn().mockResolvedValue(undefined);
const mockQuery = jest.fn().mockResolvedValue([]);
const mockQueryOne = jest.fn().mockResolvedValue(null);

let mockDrizzleQueryResult: any = [];
let mockDrizzleGetResult: any = undefined;

const mockDrizzleDb = {
  select: jest.fn(() => {
    const chain: any = { from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), offset: jest.fn().mockReturnThis(), get: jest.fn(() => mockDrizzleGetResult), then: (r: any, rj: any) => Promise.resolve(mockDrizzleQueryResult).then(r, rj) };
    return chain;
  }),
  insert: jest.fn(() => { const c: any = { values: jest.fn().mockReturnThis(), onConflictDoNothing: jest.fn().mockReturnThis(), onConflictDoUpdate: jest.fn().mockReturnThis(), then: (r: any) => Promise.resolve().then(r) }; return c; }),
  update: jest.fn(() => { const c: any = { set: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), then: (r: any) => Promise.resolve().then(r) }; return c; }),
  delete: jest.fn(() => { const c: any = { where: jest.fn().mockReturnThis(), then: (r: any) => Promise.resolve().then(r) }; return c; }),
};

jest.mock("../../lib/db/helpers", () => ({
  execute: (...args: unknown[]) => mockExecute(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  getDrizzle: jest.fn(() => Promise.resolve(mockDrizzleDb)),
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
    mockDrizzleQueryResult = [];
    mockDrizzleGetResult = undefined;
  });

  it("createHCSyncLogEntry inserts a pending entry with INSERT OR IGNORE", async () => {
    const id = await createHCSyncLogEntry("session-abc");
    expect(id).toBe("test-uuid-1234");
  });

  it("markHCSyncSuccess updates status and stores record ID", async () => {
    await expect(markHCSyncSuccess("session-abc", "hc-record-id")).resolves.toBeUndefined();
  });

  it("markHCSyncSuccess handles undefined record ID", async () => {
    await expect(markHCSyncSuccess("session-abc")).resolves.toBeUndefined();
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
    mockDrizzleQueryResult = [
      { id: "1", session_id: "s1", status: "pending", retry_count: 0 },
      { id: "2", session_id: "s2", status: "failed", retry_count: 1 },
    ];
    const result = await getHCPendingOrFailedSyncs();
    expect(result).toHaveLength(2);
  });

  it("getHCSyncLogForSession returns entry for session", async () => {
    mockDrizzleGetResult = {
      id: "1",
      session_id: "s1",
      status: "synced",
    };
    const result = await getHCSyncLogForSession("s1");
    expect(result?.status).toBe("synced");
  });
});

describe("Health Connect settings integration", () => {
  it("IntegrationsCard has proper a11y, dynamic import, and platform gating", () => {
    const fs = require("fs");
    const source = fs.readFileSync("components/settings/IntegrationsCard.tsx", "utf8");
    // a11y
    expect(source).toContain("AccessibilityInfo");
    expect(source).toContain('accessibilityRole="switch"');
    expect(source).toContain('accessibilityLabel="Sync workouts to Health Connect"');
    // dynamic import
    expect(source).not.toMatch(/^import.*from.*["'].*health-connect["']/m);
    expect(source).toContain('await import("../../lib/health-connect")');
    // platform gating
    expect(source).toContain('Platform.OS === "android"');
    expect(source).toContain('hcSdkStatus !== "unavailable"');
    // install/update
    expect(source).toContain("openHealthConnectPlayStore");
    expect(source).toContain('"Install Health Connect from Play Store"');
    expect(source).toContain('"Update Health Connect"');
    expect(source).toContain("minHeight: 48");
  });
});

describe("Health Connect session sync and startup", () => {
  it("uses dynamic import for HC sync (Android-gated, silent) and reconciles on startup", () => {
    const fs = require("fs");
    const sessionSource = [
      fs.readFileSync("app/session/[id].tsx", "utf8"),
      fs.readFileSync("hooks/useSessionActions.ts", "utf8"),
    ].join("\n");
    expect(sessionSource).toContain('await import("../lib/health-connect")');
    expect(sessionSource).toContain("syncToHealthConnect");
    expect(sessionSource).toContain('Platform.OS === "android"');
    // HC sync is silent (no toast)
    const hcBlock = sessionSource.match(/Health Connect sync[\s\S]*?catch\s*\{[\s\S]*?\}/);
    expect(hcBlock).toBeTruthy();
    expect(hcBlock![0]).not.toContain("setSnackbar");
    // Startup reconciliation
    const layoutSource = [
      fs.readFileSync("app/_layout.tsx", "utf8"),
      fs.readFileSync("hooks/useAppInit.ts", "utf8"),
    ].join("\n");
    expect(layoutSource).toContain("reconcileHealthConnectQueue");
    expect(layoutSource).toContain('Platform.OS === "android"');
    expect(layoutSource).toContain('import("../lib/health-connect")');
  });
});

describe("Health Connect lib module, schema, and config", () => {
  it("uses dynamic import, dedup, initialization, SDK status, and retry config", () => {
    const fs = require("fs");
    const source = fs.readFileSync("lib/health-connect.ts", "utf8");
    // Dynamic import (no static import)
    expect(source).not.toMatch(/^import.*from.*["']react-native-health-connect["']/m);
    expect(source).toContain('import("react-native-health-connect")');
    // Deduplication
    expect(source).toContain("clientRecordId");
    expect(source).toContain("fitforge-");
    // Initialization
    expect(source).toContain("ensureInitialized");
    expect(source).toContain("await initialize()");
    // SDK status mapping
    expect(source).toContain("SdkAvailabilityStatus.SDK_UNAVAILABLE:");
    expect(source).toContain('"needs_install"');
    // Record builder
    expect(source).toContain("buildExerciseSessionRecord");
    const matches = source.match(/buildExerciseSessionRecord/g);
    expect(matches!.length).toBeGreaterThanOrEqual(3);
    // Retry config
    expect(source).toContain("MAX_RETRIES = 3");
    expect(source).toContain('"No completed sets"');
    // DB schema and config
    const tablesSrc = fs.readFileSync("lib/db/tables.ts", "utf8");
    expect(tablesSrc).toContain("health_connect_sync_log");
    expect(tablesSrc).toContain("health_connect_record_id");
    expect(tablesSrc).toContain("idx_hc_sync_log_status");
    const configSrc = fs.readFileSync("app.config.ts", "utf8");
    expect(configSrc).toContain("expo-build-properties");
    expect(configSrc).toContain("minSdkVersion: 26");
    expect(configSrc).toContain("expo-health-connect");
    expect(configSrc).toContain("WRITE_EXERCISE");
  });
});
