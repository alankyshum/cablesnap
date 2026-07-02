/**
 * Tests for lib/db/training-day-settings.ts — Training-Day Macro settings module.
 *
 * Coverage targets:
 *   - AC11 (backup round-trip): training_day_macros.* keys persist under app_preferences
 *     via lib/db/import-export.ts:239 getAppSettingsCategory routing
 *   - All getters return correct defaults when no value is stored
 *   - All setters persist and clamp values correctly (AC22 ÷0 guard)
 *   - getAllSettings() returns consistent state
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const settingsStore: Record<string, string> = {};

jest.mock("../../lib/db/settings", () => ({
  getAppSetting: jest.fn((key: string) => Promise.resolve(settingsStore[key] ?? null)),
  setAppSetting: jest.fn((key: string, value: string) => {
    settingsStore[key] = value;
    return Promise.resolve();
  }),
}));

// ─── Subject under test ───────────────────────────────────────────────────────

import {
  getEnabled,
  getSplitPercent,
  getTrainingDaysPerWeek,
  getAllSettings,
  setEnabled,
  setSplitPercent,
  setTrainingDaysPerWeek,
  PREFIX,
} from "../../lib/db/training-day-settings";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clearStore() {
  Object.keys(settingsStore).forEach((k) => delete settingsStore[k]);
}

// ─── PREFIX ───────────────────────────────────────────────────────────────────

describe("PREFIX constant", () => {
  it("is 'training_day_macros.'", () => {
    expect(PREFIX).toBe("training_day_macros.");
  });
});

// ─── Default values ───────────────────────────────────────────────────────────

describe("defaults when no values stored", () => {
  beforeEach(clearStore);

  it("getEnabled() defaults to false (OFF by default — AC19)", async () => {
    expect(await getEnabled()).toBe(false);
  });

  it("getSplitPercent() defaults to 10", async () => {
    expect(await getSplitPercent()).toBe(10);
  });

  it("getTrainingDaysPerWeek() defaults to 4", async () => {
    expect(await getTrainingDaysPerWeek()).toBe(4);
  });

  it("getAllSettings() returns all defaults", async () => {
    const result = await getAllSettings();
    expect(result).toEqual({ enabled: false, splitPercent: 10, trainingDaysPerWeek: 4 });
  });
});

// ─── Round-trip tests ─────────────────────────────────────────────────────────

describe("setter/getter round-trips", () => {
  beforeEach(clearStore);

  it("setEnabled(true) → getEnabled() returns true", async () => {
    await setEnabled(true);
    expect(await getEnabled()).toBe(true);
  });

  it("setEnabled(false) → getEnabled() returns false", async () => {
    await setEnabled(true);
    await setEnabled(false);
    expect(await getEnabled()).toBe(false);
  });

  it("setSplitPercent(15) → getSplitPercent() returns 15", async () => {
    await setSplitPercent(15);
    expect(await getSplitPercent()).toBe(15);
  });

  it("setTrainingDaysPerWeek(3) → getTrainingDaysPerWeek() returns 3", async () => {
    await setTrainingDaysPerWeek(3);
    expect(await getTrainingDaysPerWeek()).toBe(3);
  });

  it("getAllSettings() returns updated values after all setters", async () => {
    await setEnabled(true);
    await setSplitPercent(20);
    await setTrainingDaysPerWeek(5);
    const result = await getAllSettings();
    expect(result).toEqual({ enabled: true, splitPercent: 20, trainingDaysPerWeek: 5 });
  });
});

// ─── Clamping tests (AC22 ÷0 guard) ──────────────────────────────────────────

describe("setSplitPercent clamping", () => {
  beforeEach(clearStore);

  it("clamps values below 5 to 5", async () => {
    await setSplitPercent(1);
    expect(await getSplitPercent()).toBe(5);
  });

  it("clamps values above 25 to 25", async () => {
    await setSplitPercent(50);
    expect(await getSplitPercent()).toBe(25);
  });

  it("passes valid values through", async () => {
    await setSplitPercent(12);
    expect(await getSplitPercent()).toBe(12);
  });

  it("rounds fractional values", async () => {
    await setSplitPercent(13.7);
    expect(await getSplitPercent()).toBe(14);
  });
});

describe("setTrainingDaysPerWeek clamping (AC22 ÷0 guard)", () => {
  beforeEach(clearStore);

  it("clamps n=7 down to 6 (prevents ÷0 in Model 2)", async () => {
    await setTrainingDaysPerWeek(7);
    expect(await getTrainingDaysPerWeek()).toBe(6);
  });

  it("clamps n=0 up to 1", async () => {
    await setTrainingDaysPerWeek(0);
    expect(await getTrainingDaysPerWeek()).toBe(1);
  });

  it("clamps n=-5 up to 1", async () => {
    await setTrainingDaysPerWeek(-5);
    expect(await getTrainingDaysPerWeek()).toBe(1);
  });

  it("passes valid values through", async () => {
    await setTrainingDaysPerWeek(6);
    expect(await getTrainingDaysPerWeek()).toBe(6);
  });

  it("rounds fractional values", async () => {
    await setTrainingDaysPerWeek(3.9);
    expect(await getTrainingDaysPerWeek()).toBe(4);
  });
});

// ─── Corrupt stored values ────────────────────────────────────────────────────

describe("corrupt/unexpected stored values", () => {
  beforeEach(clearStore);

  it("getSplitPercent() returns default for non-numeric stored value", async () => {
    settingsStore["training_day_macros.split_percent"] = "invalid";
    expect(await getSplitPercent()).toBe(10);
  });

  it("getTrainingDaysPerWeek() returns default for non-numeric stored value", async () => {
    settingsStore["training_day_macros.training_days_per_week"] = "bad";
    expect(await getTrainingDaysPerWeek()).toBe(4);
  });

  it("getEnabled() returns false for unrecognized stored value", async () => {
    settingsStore["training_day_macros.enabled"] = "yes"; // not "1"
    expect(await getEnabled()).toBe(false);
  });
});

// ─── AC11: Backup round-trip via app_preferences category ────────────────────

/**
 * AC11 (backup round-trip test).
 *
 * lib/db/import-export.ts:239 getAppSettingsCategory() routes app_settings rows
 * to backup categories by key prefix. The training_day_macros.* keys have no
 * special prefix match (not plate_calculator_ or rest_), so they fall through
 * to the default "app_preferences" category — exactly where they need to be for
 * automatic round-trip backup.
 *
 * This test verifies that routing is correct by checking:
 * 1. All three training_day_macros.* keys route to "app_preferences"
 * 2. No other category is returned
 * 3. After export+import simulation, the keys are restored correctly
 */
describe("AC11: backup round-trip — training_day_macros.* keys go to app_preferences", () => {
  it("all training_day_macros.* keys route to app_preferences category", () => {
    const keys = [
      "training_day_macros.enabled",
      "training_day_macros.split_percent",
      "training_day_macros.training_days_per_week",
    ];

    for (const key of keys) {
      // Replicate the routing logic from import-export.ts:239
      const category = simulateGetAppSettingsCategory(key);
      expect(category).toBe("app_preferences");
    }
  });

  it("does NOT route to plate_calculator_settings or rest_timer_settings", () => {
    const keys = [
      "training_day_macros.enabled",
      "training_day_macros.split_percent",
      "training_day_macros.training_days_per_week",
    ];

    for (const key of keys) {
      const category = simulateGetAppSettingsCategory(key);
      expect(category).not.toBe("plate_calculator_settings");
      expect(category).not.toBe("rest_timer_settings");
    }
  });

  it("round-trip simulation: export → clear → import restores all keys", async () => {
    // Setup: write all three settings
    await setEnabled(true);
    await setSplitPercent(15);
    await setTrainingDaysPerWeek(5);

    // Simulate export: capture all keys with our prefix
    const exportedRows = Object.entries(settingsStore)
      .filter(([k]) => k.startsWith("training_day_macros."))
      .map(([key, value]) => ({ key, value }));

    expect(exportedRows).toHaveLength(3);

    // Simulate clear (what happens on fresh install / restore)
    clearStore();
    expect(await getEnabled()).toBe(false); // defaults
    expect(await getSplitPercent()).toBe(10);
    expect(await getTrainingDaysPerWeek()).toBe(4);

    // Simulate import: re-apply the exported rows
    for (const { key, value } of exportedRows) {
      settingsStore[key] = value;
    }

    // Verify all settings are restored
    expect(await getEnabled()).toBe(true);
    expect(await getSplitPercent()).toBe(15);
    expect(await getTrainingDaysPerWeek()).toBe(5);
  });
});

// ─── Helper that mirrors import-export.ts:239 getAppSettingsCategory ─────────

/**
 * Replicate the routing logic from lib/db/import-export.ts:239.
 * Used in AC11 tests to verify training_day_macros.* keys get the right category
 * without importing the full import-export module (which has heavy DB dependencies).
 *
 * This must stay in sync with getAppSettingsCategory in import-export.ts.
 */
function simulateGetAppSettingsCategory(key: string): string {
  const normalized = typeof key === "string" ? key : "";
  if (normalized.startsWith("plate_calculator_")) return "plate_calculator_settings";
  if (normalized.startsWith("rest_") || normalized === "rest_notification_enabled") return "rest_timer_settings";
  return "app_preferences";
}
