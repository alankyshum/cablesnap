/* eslint-disable @typescript-eslint/no-explicit-any */

import { GITHUB_REPO_URL } from "@/constants/github";
import { DEFAULT_STRAVA_ATTRIBUTION } from "@/lib/strava";

let mockDbInstance: ReturnType<typeof createMockDb>;

function createMockDb() {
  const state = {
    row: null as any,
    insertCalled: false,
    updateCalled: false,
  };

  const db = {
    state,
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          get: jest.fn(async () => state.row),
        })),
      })),
    })),
    insert: jest.fn(() => ({
      values: jest.fn(() => {
        state.insertCalled = true;
        return {
          onConflictDoNothing: jest.fn(() => Promise.resolve()),
          onConflictDoUpdate: jest.fn(() => Promise.resolve()),
        };
      }),
    })),
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => {
          state.updateCalled = true;
          return Promise.resolve();
        }),
      })),
    })),
  };

  return db;
}

jest.mock("expo-sqlite", () => ({
  openDatabaseSync: jest.fn(() => ({
    execAsync: jest.fn(),
    getAllAsync: jest.fn(() => Promise.resolve([])),
    getFirstAsync: jest.fn(() => Promise.resolve(null)),
    runAsync: jest.fn(() => Promise.resolve({ lastInsertRowId: 1, changes: 1 })),
  })),
}));

jest.mock("../../lib/db/helpers", () => ({
  getDrizzle: jest.fn(() => Promise.resolve(mockDbInstance)),
}));

import {
  getShareSettings,
  saveShareSettings,
  getEffectivePromoCaption,
  DEFAULT_PROMO_CAPTION,
} from "../../lib/db/share-settings";

describe("Share Settings — DB Operations", () => {
  beforeEach(() => {
    mockDbInstance = createMockDb();
    jest.clearAllMocks();
  });

  it("getShareSettings returns defaults when no row exists", async () => {
    mockDbInstance.state.row = null;
    const result = await getShareSettings();
    expect(result.id).toBe(1);
    expect(result.promo_caption).toBe("");
    expect(result.promo_caption_enabled).toBe(0);
    expect(result.strava_description_enabled).toBe(1);
    expect(result.updated_at).toBeGreaterThan(0);
    expect(mockDbInstance.state.insertCalled).toBe(true);
  });

  it("getEffectivePromoCaption returns empty string when promo_caption_enabled = 0", async () => {
    mockDbInstance.state.row = {
      id: 1,
      promo_caption: "Custom caption",
      promo_caption_enabled: 0,
      strava_description_enabled: 1,
      updated_at: Date.now(),
    };
    const result = await getEffectivePromoCaption();
    expect(result).toBe("");
  });

  it("getEffectivePromoCaption returns user caption when set and enabled", async () => {
    mockDbInstance.state.row = {
      id: 1,
      promo_caption: "My custom promo",
      promo_caption_enabled: 1,
      strava_description_enabled: 1,
      updated_at: Date.now(),
    };
    const result = await getEffectivePromoCaption();
    expect(result).toBe("My custom promo");
  });

  it("getEffectivePromoCaption returns DEFAULT_PROMO_CAPTION when user caption is empty and enabled", async () => {
    mockDbInstance.state.row = {
      id: 1,
      promo_caption: "",
      promo_caption_enabled: 1,
      strava_description_enabled: 1,
      updated_at: Date.now(),
    };
    const result = await getEffectivePromoCaption();
    expect(result).toBe(DEFAULT_PROMO_CAPTION);
  });

  it("saveShareSettings upserts partial fields regardless of row existence", async () => {
    mockDbInstance.state.row = {
      id: 1,
      promo_caption: "",
      promo_caption_enabled: 0,
      strava_description_enabled: 1,
      updated_at: Date.now(),
    };
    await saveShareSettings({ promo_caption_enabled: 1 });
    expect(mockDbInstance.state.insertCalled).toBe(true);
    expect(mockDbInstance.state.updateCalled).toBe(false);
  });

  it("saveShareSettings inserts default row when none exists", async () => {
    mockDbInstance.state.row = null;
    await saveShareSettings({ promo_caption: "Hello" });
    expect(mockDbInstance.state.insertCalled).toBe(true);
    expect(mockDbInstance.state.updateCalled).toBe(false);
  });

  it("saveShareSettings rejects captions longer than 200 characters", async () => {
    const longCaption = "x".repeat(201);
    await expect(saveShareSettings({ promo_caption: longCaption })).rejects.toThrow(
      "Promo caption exceeds 200 characters"
    );
    expect(mockDbInstance.state.insertCalled).toBe(false);
  });
});

describe("Share Settings — Structural", () => {
  const fs = require("fs");
  const path = require("path");

  const tablesSrc = fs.readFileSync(
    path.resolve(__dirname, "../../lib/db/tables.ts"),
    "utf-8"
  );
  const schemaSrc = fs.readFileSync(
    path.resolve(__dirname, "../../lib/db/schema.ts"),
    "utf-8"
  );
  const indexSrc = fs.readFileSync(
    path.resolve(__dirname, "../../lib/db/index.ts"),
    "utf-8"
  );
  const stravaSrc = fs.readFileSync(
    path.resolve(__dirname, "../../lib/strava.ts"),
    "utf-8"
  );

  it("share_settings table DDL present in tables.ts", () => {
    expect(tablesSrc).toContain("CREATE TABLE IF NOT EXISTS share_settings");
    expect(tablesSrc).toContain("CHECK (id = 1)");
    expect(tablesSrc).toContain("promo_caption TEXT NOT NULL DEFAULT ''");
    expect(tablesSrc).toContain("promo_caption_enabled INTEGER NOT NULL DEFAULT 0");
    expect(tablesSrc).toContain("strava_description_enabled INTEGER NOT NULL DEFAULT 1");
    expect(tablesSrc).toContain("updated_at INTEGER NOT NULL");
  });

  it("shareSettings table definition present in schema.ts", () => {
    expect(schemaSrc).toContain('export const shareSettings = sqliteTable("share_settings"');
    expect(schemaSrc).toContain("promo_caption");
    expect(schemaSrc).toContain("promo_caption_enabled");
    expect(schemaSrc).toContain("strava_description_enabled");
  });

  it("share settings exported from lib/db/index.ts", () => {
    expect(indexSrc).toContain("getShareSettings");
    expect(indexSrc).toContain("saveShareSettings");
    expect(indexSrc).toContain("getEffectivePromoCaption");
    expect(indexSrc).toContain("DEFAULT_PROMO_CAPTION");
    expect(indexSrc).toContain("ShareSettingsRow");
  });

  it("strava.ts attribution uses the canonical GitHub repo URL (not the dead cablesnap.app placeholder)", () => {
    expect(stravaSrc).toContain("DEFAULT_STRAVA_ATTRIBUTION");
    expect(DEFAULT_STRAVA_ATTRIBUTION).toContain(GITHUB_REPO_URL);
    expect(stravaSrc).not.toContain("cablesnap.app");
  });

  it("updateActivityDescription exists in lib/strava.ts", () => {
    expect(stravaSrc).toContain("export async function updateActivityDescription");
    expect(stravaSrc).toContain("PUT");
    expect(stravaSrc).toContain("${STRAVA_API_BASE}/activities/${activityId}");
  });
});
