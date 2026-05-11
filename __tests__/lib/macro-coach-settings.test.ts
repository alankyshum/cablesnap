/**
 * Tests for lib/db/macro-coach-settings.ts — specifically the lastAcceptedSuggestion
 * persistence helpers which wire the post-decision Drained check-in.
 *
 * BLD-1165 regression: ensures that setLastAcceptedSuggestion persists the accepted
 * date + target, and that getLastAcceptedSuggestion correctly retrieves them, so
 * MacroCoachCard's post-decision check-in can render when lastAcceptedDate is set.
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
  setLastAcceptedSuggestion,
  getLastAcceptedSuggestion,
} from "../../lib/db/macro-coach-settings";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("lastAcceptedSuggestion", () => {
  beforeEach(() => {
    // Clear store between tests
    Object.keys(settingsStore).forEach((k) => delete settingsStore[k]);
  });

  it("returns null when no value has been persisted", async () => {
    const result = await getLastAcceptedSuggestion();
    expect(result).toBeNull();
  });

  it("round-trips date and kcal correctly", async () => {
    await setLastAcceptedSuggestion("2024-03-15", 1850);
    const result = await getLastAcceptedSuggestion();
    expect(result).not.toBeNull();
    expect(result!.dateIso).toBe("2024-03-15");
    expect(result!.targetKcal).toBe(1850);
  });

  it("stores fractional kcal rounded to nearest integer", async () => {
    await setLastAcceptedSuggestion("2024-03-15", 1849.7);
    const result = await getLastAcceptedSuggestion();
    expect(result!.targetKcal).toBe(1850);
  });

  it("overwrites a previous acceptance", async () => {
    await setLastAcceptedSuggestion("2024-03-08", 1900);
    await setLastAcceptedSuggestion("2024-03-15", 1750);
    const result = await getLastAcceptedSuggestion();
    expect(result!.dateIso).toBe("2024-03-15");
    expect(result!.targetKcal).toBe(1750);
  });

  it("returns null if only date is stored (incomplete write)", async () => {
    // Simulate a partial write by only setting the date key
    settingsStore["macro_coach.last_accepted_date"] = "2024-03-15";
    const result = await getLastAcceptedSuggestion();
    // Target is missing → null
    expect(result).toBeNull();
  });

  it("returns null if target is corrupted (non-numeric)", async () => {
    settingsStore["macro_coach.last_accepted_date"] = "2024-03-15";
    settingsStore["macro_coach.last_accepted_target"] = "not-a-number";
    const result = await getLastAcceptedSuggestion();
    expect(result).toBeNull();
  });
});
