/* eslint-disable @typescript-eslint/no-explicit-any */
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
  path.resolve(__dirname, "../../lib/db/tables.ts"),
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

const layoutSrc = [
  fs.readFileSync(path.resolve(__dirname, "../../app/_layout.tsx"), "utf-8"),
  fs.readFileSync(path.resolve(__dirname, "../../hooks/useAppInit.ts"), "utf-8"),
].join("\n");

const indexSrc = fs.readFileSync(
  path.resolve(__dirname, "../../lib/db/index.ts"),
  "utf-8"
);

const configSrc = fs.readFileSync(
  path.resolve(__dirname, "../../app.config.ts"),
  "utf-8"
);

const workerSrc = fs.readFileSync(
  path.resolve(__dirname, "../../workers/strava-proxy/src/index.ts"),
  "utf-8"
);

describe("Strava Integration — DB Schema (Phase 48)", () => {
  it("creates strava tables with correct structure", () => {
    expect(helpersSrc).toContain("CREATE TABLE IF NOT EXISTS strava_connection");
    expect(helpersSrc).toContain("CHECK (id = 1)");
    expect(helpersSrc).toContain("CREATE TABLE IF NOT EXISTS strava_sync_log");
    expect(helpersSrc).toContain("session_id TEXT NOT NULL");
    expect(helpersSrc).toContain("strava_activity_id TEXT");
    expect(helpersSrc).toMatch(/status TEXT NOT NULL CHECK.*pending.*synced.*failed.*permanently_failed/);
    expect(helpersSrc).toContain("retry_count INTEGER DEFAULT 0");
    expect(helpersSrc).toContain("UNIQUE(session_id)");
    expect(helpersSrc).toContain("idx_strava_sync_log_status");
  });
});

describe("Strava Integration — DB Operations", () => {
  it("exports all strava DB functions and types from index", () => {
    for (const fn of ["getStravaConnection", "saveStravaConnection", "deleteStravaConnection",
      "createSyncLogEntry", "markSyncSuccess", "markSyncFailed",
      "markSyncPermanentlyFailed", "getPendingOrFailedSyncs", "getSyncLogForSession"]) {
      expect(indexSrc).toContain(fn);
    }
    for (const t of ["StravaConnection", "StravaSyncLog", "StravaSyncStatus"]) {
      expect(indexSrc).toContain(t);
    }
  });

  it("strava_connection uses singleton pattern (id=1)", () => {
    // Drizzle uses eq(stravaConnection.id, 1) and values({ id: 1, ... })
    expect(stravaDbSrc).toMatch(/eq\(stravaConnection\.id,\s*1\)/);
    expect(stravaDbSrc).toMatch(/id:\s*1/);
  });

  it("sync log uses onConflictDoNothing to prevent duplicates", () => {
    expect(stravaDbSrc).toContain("onConflictDoNothing");
  });

  it("getPendingOrFailedSyncs queries correct statuses", () => {
    expect(stravaDbSrc).toMatch(/IN \('pending', 'failed'\)/);
  });
});

describe("Strava Integration — API Client", () => {
  it("uses OAuth Authorization Code flow with SecureStore tokens and correct activity format", () => {
    // Token storage
    expect(stravaClientSrc).toContain("SecureStore.setItemAsync");
    expect(stravaClientSrc).toContain("SecureStore.getItemAsync");
    expect(stravaClientSrc).toContain("SecureStore.deleteItemAsync");
    expect(stravaClientSrc).not.toMatch(/execute.*token/i);
    // Strava does NOT support PKCE — flag must not be set, and no code_verifier in request body
    expect(stravaClientSrc).not.toContain("usePKCE: true");
    expect(stravaClientSrc).not.toContain("code_verifier");
    // Activity format
    expect(stravaClientSrc).toMatch(/external_id.*cablesnap-/);
    expect(stravaClientSrc).toContain('"WeightTraining"');
    expect(stravaClientSrc).toContain("weightUnit");
    expect(stravaClientSrc).toContain("getBodySettings");
  });

  it("uses proxy for token exchange and refresh instead of direct Strava calls", () => {
    expect(stravaClientSrc).toContain("getProxyUrl");
    expect(stravaClientSrc).toContain("stravaProxyUrl");
    expect(stravaClientSrc).toMatch(/\$\{proxyUrl\}\/token/);
    expect(stravaClientSrc).toMatch(/\$\{proxyUrl\}\/refresh/);
    // No direct Strava token URL
    expect(stravaClientSrc).not.toContain("strava.com/oauth/token");
    // client_id and grant_type not sent in token exchange/refresh body
    expect(stravaClientSrc).not.toMatch(/body:.*client_id.*grant_type/s);
  });

  it("handles token refresh, disconnect on 401/400, and redirect URI", () => {
    expect(stravaClientSrc).toContain("refreshAccessToken");
    expect(stravaClientSrc).toContain("getValidAccessToken");
    expect(stravaClientSrc).toContain("401");
    expect(stravaClientSrc).toContain("400");
    expect(stravaClientSrc).toContain("await disconnect()");
    expect(stravaClientSrc).toContain("No completed sets to sync");
    expect(stravaClientSrc).toContain('scheme: "cablesnap"');
    expect(stravaClientSrc).toContain('"strava-callback"');
  });

  it("sync log entry created before upload, retry queue respects limits", () => {
    const syncFn = stravaClientSrc.slice(
      stravaClientSrc.indexOf("async function syncSessionToStrava"),
      stravaClientSrc.indexOf("async function reconcileStravaQueue")
    );
    expect(syncFn.indexOf("createSyncLogEntry")).toBeLessThan(syncFn.indexOf("uploadActivity"));
    expect(stravaClientSrc).toContain("MAX_RETRIES = 3");
    expect(stravaClientSrc).toMatch(/retry_count >= MAX_RETRIES/);
    const reconcileFn = stravaClientSrc.slice(
      stravaClientSrc.indexOf("async function reconcileStravaQueue")
    );
    expect(reconcileFn).toContain('Platform.OS === "web"');
  });
});

describe("Strava Integration — Settings UI", () => {
  it("shows connect/disconnect with proper a11y and platform gating", () => {
    expect(settingsSrc).toContain("connectStrava");
    expect(settingsSrc).toContain("disconnectStrava");
    expect(settingsSrc).toMatch(/Platform\.OS\s*===\s*"web"/);
    expect(settingsSrc).toContain("ErrorBoundary");
    expect(settingsSrc).toContain("Connect Strava");
    expect(settingsSrc).toContain('accessibilityLabel="Connect your Strava account"');
    expect(settingsSrc).toContain('accessibilityRole="button"');
    expect(settingsSrc).toContain("Disconnect");
    expect(settingsSrc).toMatch(/accessibilityLabel=.*Disconnect Strava account/);
    expect(settingsSrc).toContain("Connected as {stravaAthlete}");
  });
});

describe("Strava Integration — Session & Startup", () => {
  it("syncs after completeSession with try/catch and toast", () => {
    const finishFn = sessionSrc.slice(
      sessionSrc.indexOf("const finish ="),
      sessionSrc.indexOf("const cancel =")
    );
    expect(finishFn.indexOf("completeSession(id!)")).toBeLessThan(finishFn.indexOf("syncSessionToStrava"));
    expect(finishFn).toContain("Strava sync failed");
    expect(sessionSrc).toContain("Synced to Strava");
    // DB function should not reference Strava
    const sessionDbSrc = fs.readFileSync(
      path.resolve(__dirname, "../../lib/db/sessions.ts"), "utf-8"
    );
    expect(sessionDbSrc).not.toContain("strava");
  });

  it("reconciles queue on native startup with error handling", () => {
    expect(layoutSrc).toContain("reconcileStravaQueue");
    expect(layoutSrc).toMatch(/Platform\.OS !== "web"[\s\S]*reconcileStravaQueue/);
    expect(layoutSrc).toContain("Strava queue reconciliation failed");
  });
});

describe("Strava Integration — Config", () => {
  it("has stravaClientId, stravaProxyUrl, and required plugins in app.config.ts", () => {
    expect(configSrc).toContain("stravaClientId");
    expect(configSrc).toContain("stravaProxyUrl");
    expect(configSrc).toContain("strava-proxy.alan200994.workers.dev");
    expect(configSrc).toContain("expo-web-browser");
    expect(configSrc).toContain("expo-secure-store");
    // No client_secret in app config
    expect(configSrc).not.toContain("client_secret");
    expect(configSrc).not.toContain("stravaClientSecret");
  });
});

describe("Strava Integration — Worker Proxy", () => {
  it("has /token and /refresh endpoints with input validation", () => {
    expect(workerSrc).toContain('"/token"');
    expect(workerSrc).toContain('"/refresh"');
    expect(workerSrc).toContain("missing required field: code");
    expect(workerSrc).toContain("missing required field: refresh_token");
  });

  it("sends form-encoded requests to Strava (not JSON)", () => {
    expect(workerSrc).toContain("URLSearchParams");
    expect(workerSrc).toContain("application/x-www-form-urlencoded");
  });

  it("adds client_id and client_secret from env bindings", () => {
    expect(workerSrc).toContain("env.STRAVA_CLIENT_ID");
    expect(workerSrc).toContain("env.STRAVA_CLIENT_SECRET");
    // No hardcoded secrets
    expect(workerSrc).not.toMatch(/client_secret:\s*"/);
  });

  it("returns 404 for unknown routes and 405 for non-POST methods", () => {
    expect(workerSrc).toContain("not found");
    expect(workerSrc).toContain("404");
    expect(workerSrc).toContain("method not allowed");
    expect(workerSrc).toContain("405");
  });

  it("handles CORS preflight with OPTIONS", () => {
    expect(workerSrc).toContain("OPTIONS");
    expect(workerSrc).toContain("Access-Control-Allow-Origin");
    expect(workerSrc).toContain("204");
  });

  it("proxies Strava response status codes", () => {
    expect(workerSrc).toContain("stravaRes.status");
  });
});

// ---- Behavioral integration tests (mocked dependencies, no real API calls) ----

// Mock all external deps before importing the module
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { stravaClientId: "test-client-id", stravaProxyUrl: "https://test-proxy.example.com" } },
  },
}));
jest.mock("../../lib/db", () => ({
  getStravaConnection: jest.fn(),
  saveStravaConnection: jest.fn(),
  deleteStravaConnection: jest.fn(),
  createSyncLogEntry: jest.fn(),
  markSyncSuccess: jest.fn(),
  markSyncFailed: jest.fn(),
  markSyncPermanentlyFailed: jest.fn(),
  getPendingOrFailedSyncs: jest.fn(),
  getSessionById: jest.fn(),
  getSessionSets: jest.fn(),
  getBodySettings: jest.fn(),
}));

const AuthSession = require("expo-auth-session");
const SecureStore = require("expo-secure-store");
const db = require("../../lib/db");

// Must require after mocks are set up
const strava = require("../../lib/strava");

describe("Strava Integration — Behavioral", () => {
  const mockFetch = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
    // Default: non-web platform (set by jest setup)
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("connectStrava exchanges auth code for tokens via proxy and saves connection", async () => {
    AuthSession.AuthRequest.mockImplementation(() => ({
      promptAsync: jest.fn().mockResolvedValue({
        type: "success",
        params: { code: "auth-code-123" },
      }),
      codeVerifier: "test-verifier",
    }));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: "at-1",
        refresh_token: "rt-1",
        expires_at: 9999999999,
        athlete: { id: 42, firstname: "Jane", lastname: "Doe" },
      }),
    });

    const result = await strava.connectStrava();

    expect(result).toEqual({ athleteId: 42, athleteName: "Jane Doe" });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("strava_access_token", "at-1");
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("strava_refresh_token", "rt-1");
    expect(db.saveStravaConnection).toHaveBeenCalledWith(42, "Jane Doe");
    // Verify proxy URL is used
    expect(mockFetch.mock.calls[0][0]).toBe("https://test-proxy.example.com/token");
    // Verify body sends code but NOT code_verifier (Strava does not support PKCE),
    // and NOT client_id or grant_type (added by the proxy)
    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(fetchBody.code).toBe("auth-code-123");
    expect(fetchBody).not.toHaveProperty("code_verifier");
    expect(fetchBody).not.toHaveProperty("client_id");
    expect(fetchBody).not.toHaveProperty("grant_type");
  });

  it("connectStrava returns null when user cancels OAuth", async () => {
    AuthSession.AuthRequest.mockImplementation(() => ({
      promptAsync: jest.fn().mockResolvedValue({ type: "cancel" }),
      codeVerifier: "v",
    }));
    const result = await strava.connectStrava();
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("disconnect clears tokens from SecureStore and DB", async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce("old-token");
    mockFetch.mockResolvedValueOnce({ ok: true }); // deauthorize

    await strava.disconnect();

    expect(mockFetch).toHaveBeenCalledWith(
      "https://www.strava.com/oauth/deauthorize",
      expect.objectContaining({ method: "POST" })
    );
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("strava_access_token");
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("strava_refresh_token");
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("strava_token_expires_at");
    expect(db.deleteStravaConnection).toHaveBeenCalled();
  });

  it("syncSessionToStrava uploads activity and marks success", async () => {
    db.getStravaConnection.mockResolvedValue({ athlete_id: 1 });
    db.getSessionSets.mockResolvedValue([
      { exercise_name: "Squat", weight: 100, reps: 5, completed: true, set_type: "working" },
    ]);
    db.getSessionById.mockResolvedValue({
      id: "s1", name: "Leg Day", started_at: Date.now(), duration_seconds: 3600,
    });
    db.getBodySettings.mockResolvedValue({ weight_unit: "kg" });
    // Token is valid (expires far in future)
    SecureStore.getItemAsync.mockImplementation(async (key: string) => {
      if (key === "strava_token_expires_at") return String(Math.floor(Date.now() / 1000) + 7200);
      if (key === "strava_access_token") return "valid-token";
      return null;
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 12345 }),
    });

    const result = await strava.syncSessionToStrava("s1");

    expect(result).toBe(true);
    expect(db.createSyncLogEntry).toHaveBeenCalledWith("s1");
    expect(db.markSyncSuccess).toHaveBeenCalledWith("s1", "12345");
    // Verify activity payload
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.type).toBe("WeightTraining");
    expect(body.external_id).toBe("cablesnap-s1");
  });

  it("syncSessionToStrava skips when not connected", async () => {
    db.getStravaConnection.mockResolvedValue(null);
    const result = await strava.syncSessionToStrava("s1");
    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("syncSessionToStrava marks failure on API error", async () => {
    db.getStravaConnection.mockResolvedValue({ athlete_id: 1 });
    db.getSessionSets.mockResolvedValue([
      { exercise_name: "Bench", weight: 80, reps: 8, completed: true, set_type: "working" },
    ]);
    db.getSessionById.mockResolvedValue({
      id: "s2", name: "Push", started_at: Date.now(), duration_seconds: 1800,
    });
    db.getBodySettings.mockResolvedValue({ weight_unit: "lb" });
    SecureStore.getItemAsync.mockImplementation(async (key: string) => {
      if (key === "strava_token_expires_at") return String(Math.floor(Date.now() / 1000) + 7200);
      if (key === "strava_access_token") return "valid-token";
      return null;
    });
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    await expect(strava.syncSessionToStrava("s2")).rejects.toThrow();
    expect(db.markSyncFailed).toHaveBeenCalledWith("s2", expect.stringContaining("500"));
  });

  it("reconcileStravaQueue retries failed entries and marks permanently failed after max retries", async () => {
    db.getStravaConnection.mockResolvedValue({ athlete_id: 1 });
    db.getPendingOrFailedSyncs.mockResolvedValue([
      { session_id: "s-old", retry_count: 3, status: "failed" },
    ]);

    await strava.reconcileStravaQueue();

    // retry_count >= MAX_RETRIES (3) → permanently failed without attempting upload
    expect(db.markSyncPermanentlyFailed).toHaveBeenCalledWith("s-old");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
