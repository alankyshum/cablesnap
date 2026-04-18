import * as fs from "fs";
import * as path from "path";

// Read source files for structural tests
const stravaClientSrc = fs.readFileSync(
  path.resolve(__dirname, "../../lib/strava.ts"),
  "utf-8"
);

const stravaDbSrc = fs.readFileSync(
  path.resolve(__dirname, "../../lib/db/strava.ts"),
  "utf-8"
);

const helpersSrc = fs.readFileSync(
  path.resolve(__dirname, "../../lib/db/migrations.ts"),
  "utf-8"
);

const settingsSrc = [
  fs.readFileSync(path.resolve(__dirname, "../../app/(tabs)/settings.tsx"), "utf-8"),
  fs.readFileSync(path.resolve(__dirname, "../../components/settings/IntegrationsCard.tsx"), "utf-8"),
].join("\n");

const sessionSrc = [
  fs.readFileSync(path.resolve(__dirname, "../../app/session/[id].tsx"), "utf-8"),
  fs.readFileSync(path.resolve(__dirname, "../../hooks/useSessionActions.ts"), "utf-8"),
].join("\n");

const layoutSrc = fs.readFileSync(
  path.resolve(__dirname, "../../app/_layout.tsx"),
  "utf-8"
);

const indexSrc = fs.readFileSync(
  path.resolve(__dirname, "../../lib/db/index.ts"),
  "utf-8"
);

const configSrc = fs.readFileSync(
  path.resolve(__dirname, "../../app.config.ts"),
  "utf-8"
);

describe("Strava Integration — DB Schema (Phase 48)", () => {
  it("creates strava_connection table as singleton with CHECK constraint", () => {
    expect(helpersSrc).toContain("CREATE TABLE IF NOT EXISTS strava_connection");
    expect(helpersSrc).toContain("CHECK (id = 1)");
  });

  it("creates strava_sync_log table with correct columns", () => {
    expect(helpersSrc).toContain("CREATE TABLE IF NOT EXISTS strava_sync_log");
    expect(helpersSrc).toContain("session_id TEXT NOT NULL");
    expect(helpersSrc).toContain("strava_activity_id TEXT");
    expect(helpersSrc).toMatch(/status TEXT NOT NULL CHECK.*pending.*synced.*failed.*permanently_failed/);
    expect(helpersSrc).toContain("retry_count INTEGER DEFAULT 0");
    expect(helpersSrc).toContain("UNIQUE(session_id)");
  });

  it("creates index on strava_sync_log status", () => {
    expect(helpersSrc).toContain("idx_strava_sync_log_status");
  });
});

describe("Strava Integration — DB Operations", () => {
  it("exports all strava DB functions from index", () => {
    expect(indexSrc).toContain("getStravaConnection");
    expect(indexSrc).toContain("saveStravaConnection");
    expect(indexSrc).toContain("deleteStravaConnection");
    expect(indexSrc).toContain("createSyncLogEntry");
    expect(indexSrc).toContain("markSyncSuccess");
    expect(indexSrc).toContain("markSyncFailed");
    expect(indexSrc).toContain("markSyncPermanentlyFailed");
    expect(indexSrc).toContain("getPendingOrFailedSyncs");
    expect(indexSrc).toContain("getSyncLogForSession");
  });

  it("exports Strava types from index", () => {
    expect(indexSrc).toContain("StravaConnection");
    expect(indexSrc).toContain("StravaSyncLog");
    expect(indexSrc).toContain("StravaSyncStatus");
  });

  it("strava_connection uses singleton pattern (id=1)", () => {
    expect(stravaDbSrc).toContain("WHERE id = 1");
    expect(stravaDbSrc).toMatch(/INSERT OR REPLACE INTO strava_connection \(id.*1/);
  });

  it("sync log uses INSERT OR IGNORE to prevent duplicates", () => {
    expect(stravaDbSrc).toContain("INSERT OR IGNORE INTO strava_sync_log");
  });

  it("getPendingOrFailedSyncs queries correct statuses", () => {
    expect(stravaDbSrc).toMatch(/status IN \('pending', 'failed'\)/);
  });
});

describe("Strava Integration — API Client", () => {
  it("stores tokens in SecureStore only, never SQLite", () => {
    expect(stravaClientSrc).toContain("SecureStore.setItemAsync");
    expect(stravaClientSrc).toContain("SecureStore.getItemAsync");
    expect(stravaClientSrc).toContain("SecureStore.deleteItemAsync");
    // Verify no tokens saved to SQLite
    expect(stravaClientSrc).not.toMatch(/execute.*token/i);
  });

  it("uses PKCE for OAuth2 flow", () => {
    expect(stravaClientSrc).toContain("usePKCE: true");
    expect(stravaClientSrc).toContain("code_verifier");
  });

  it("uses external_id for duplicate prevention", () => {
    expect(stravaClientSrc).toMatch(/external_id.*fitforge-/);
  });

  it("creates WeightTraining activity type", () => {
    expect(stravaClientSrc).toContain('"WeightTraining"');
  });

  it("handles token refresh before API calls", () => {
    expect(stravaClientSrc).toContain("refreshAccessToken");
    expect(stravaClientSrc).toContain("getValidAccessToken");
  });

  it("handles 401 response by disconnecting", () => {
    expect(stravaClientSrc).toContain("401");
    expect(stravaClientSrc).toContain("await disconnect()");
  });

  it("skips upload when no completed sets", () => {
    expect(stravaClientSrc).toContain("No completed sets to sync");
  });

  it("uses fitforge scheme for redirect URI", () => {
    expect(stravaClientSrc).toContain('scheme: "fitforge"');
    expect(stravaClientSrc).toContain('"strava-callback"');
  });

  it("creates sync log entry before API call", () => {
    // In syncSessionToStrava, createSyncLogEntry is called before uploadActivity
    const syncFn = stravaClientSrc.slice(
      stravaClientSrc.indexOf("async function syncSessionToStrava"),
      stravaClientSrc.indexOf("async function reconcileStravaQueue")
    );
    const createLogIdx = syncFn.indexOf("createSyncLogEntry");
    const uploadIdx = syncFn.indexOf("uploadActivity");
    expect(createLogIdx).toBeGreaterThan(-1);
    expect(uploadIdx).toBeGreaterThan(-1);
    expect(createLogIdx).toBeLessThan(uploadIdx);
  });

  it("reconcileStravaQueue respects MAX_RETRIES of 3", () => {
    expect(stravaClientSrc).toContain("MAX_RETRIES = 3");
    expect(stravaClientSrc).toMatch(/retry_count >= MAX_RETRIES/);
  });

  it("reconcileStravaQueue skips on web platform", () => {
    const reconcileFn = stravaClientSrc.slice(
      stravaClientSrc.indexOf("async function reconcileStravaQueue")
    );
    expect(reconcileFn).toContain('Platform.OS === "web"');
  });

  it("respects user weight unit in activity description", () => {
    expect(stravaClientSrc).toContain("weightUnit");
    expect(stravaClientSrc).toContain("getBodySettings");
  });
});

describe("Strava Integration — Settings UI", () => {
  it("imports Strava functions", () => {
    expect(settingsSrc).toContain("connectStrava");
    expect(settingsSrc).toContain("disconnectStrava");
    expect(settingsSrc).toContain("getStravaConnection");
  });

  it("hides Integrations section on web", () => {
    expect(settingsSrc).toMatch(/Platform\.OS !== "web"/);
  });

  it("wraps Integrations in ErrorBoundary", () => {
    expect(settingsSrc).toContain("ErrorBoundary");
  });

  it("shows Connect Strava button with accessibility attributes", () => {
    expect(settingsSrc).toContain("Connect Strava");
    expect(settingsSrc).toContain('accessibilityLabel="Connect your Strava account"');
    expect(settingsSrc).toContain('accessibilityRole="button"');
  });

  it("shows Disconnect button with athlete name in a11y label", () => {
    expect(settingsSrc).toContain("Disconnect");
    expect(settingsSrc).toMatch(/accessibilityLabel=.*Disconnect Strava account/);
  });

  it("shows connected athlete name", () => {
    expect(settingsSrc).toContain("Connected as {stravaAthlete}");
  });
});

describe("Strava Integration — Session Completion", () => {
  it("calls syncSessionToStrava from UI after completeSession", () => {
    const finishFn = sessionSrc.slice(
      sessionSrc.indexOf("const finish ="),
      sessionSrc.indexOf("const cancel =")
    );
    const completeIdx = finishFn.indexOf("completeSession(id!)");
    const syncIdx = finishFn.indexOf("syncSessionToStrava");
    expect(completeIdx).toBeGreaterThan(-1);
    expect(syncIdx).toBeGreaterThan(-1);
    expect(syncIdx).toBeGreaterThan(completeIdx);
  });

  it("does NOT call syncToStrava from completeSession DB function", () => {
    // The DB function in sessions.ts should not reference Strava
    const sessionDbSrc = fs.readFileSync(
      path.resolve(__dirname, "../../lib/db/sessions.ts"),
      "utf-8"
    );
    expect(sessionDbSrc).not.toContain("strava");
    expect(sessionDbSrc).not.toContain("Strava");
  });

  it("wraps Strava sync in try/catch to never block completion", () => {
    const finishFn = sessionSrc.slice(
      sessionSrc.indexOf("const finish ="),
      sessionSrc.indexOf("const cancel =")
    );
    // syncSessionToStrava should be inside a try/catch
    expect(finishFn).toContain("syncSessionToStrava");
    expect(finishFn).toContain("Strava sync failed");
  });

  it("shows success toast on sync", () => {
    expect(sessionSrc).toContain("Synced to Strava");
  });
});

describe("Strava Integration — Startup Retry", () => {
  it("calls reconcileStravaQueue on app startup", () => {
    expect(layoutSrc).toContain("reconcileStravaQueue");
  });

  it("only runs reconciliation on native platforms", () => {
    // The reconciliation call should be gated by Platform.OS !== "web"
    expect(layoutSrc).toMatch(/Platform\.OS !== "web"[\s\S]*reconcileStravaQueue/);
  });

  it("catches reconciliation errors to not block startup", () => {
    expect(layoutSrc).toContain("Strava queue reconciliation failed");
  });
});

describe("Strava Integration — Config", () => {
  it("has stravaClientId in app.config.ts extra", () => {
    expect(configSrc).toContain("stravaClientId");
  });

  it("includes expo-web-browser and expo-secure-store plugins", () => {
    expect(configSrc).toContain("expo-web-browser");
    expect(configSrc).toContain("expo-secure-store");
  });
});
