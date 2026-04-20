/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for getTemplateDurationEstimates (Phase 67 — BLD-438).
 */

const mockStmt = {
  executeAsync: jest.fn().mockResolvedValue({ changes: 1 }),
  finalizeAsync: jest.fn().mockResolvedValue(undefined),
};

const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
  withTransactionAsync: jest.fn(async (cb: () => Promise<void>) => cb()),
  prepareAsync: jest.fn().mockResolvedValue(mockStmt),
};

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
}));

jest.mock("drizzle-orm/expo-sqlite", () => ({
  drizzle: jest.fn(() => ({})),
}));

import { getTemplateDurationEstimates } from "../../../lib/db/sessions";

describe("getTemplateDurationEstimates", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns empty object for empty templateIds array", async () => {
    const result = await getTemplateDurationEstimates([]);
    expect(result).toEqual({});
    expect(mockDb.getAllAsync).not.toHaveBeenCalled();
  });

  it("returns null for templates with no sessions", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);
    const result = await getTemplateDurationEstimates(["tpl-1", "tpl-2"]);
    expect(result).toEqual({ "tpl-1": null, "tpl-2": null });
  });

  it("returns single session duration for template with 1 session", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { template_id: "tpl-1", duration_seconds: 2700, rn: 1 },
    ]);
    const result = await getTemplateDurationEstimates(["tpl-1"]);
    expect(result).toEqual({ "tpl-1": 2700 });
  });

  it("computes median for odd number of sessions", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { template_id: "tpl-1", duration_seconds: 1800, rn: 1 },
      { template_id: "tpl-1", duration_seconds: 2700, rn: 2 },
      { template_id: "tpl-1", duration_seconds: 3600, rn: 3 },
    ]);
    const result = await getTemplateDurationEstimates(["tpl-1"]);
    expect(result).toEqual({ "tpl-1": 2700 }); // median of [1800, 2700, 3600]
  });

  it("computes median for even number of sessions", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { template_id: "tpl-1", duration_seconds: 1800, rn: 1 },
      { template_id: "tpl-1", duration_seconds: 2400, rn: 2 },
      { template_id: "tpl-1", duration_seconds: 3000, rn: 3 },
      { template_id: "tpl-1", duration_seconds: 3600, rn: 4 },
    ]);
    const result = await getTemplateDurationEstimates(["tpl-1"]);
    // median of [1800, 2400, 3000, 3600] = (2400 + 3000) / 2 = 2700
    expect(result).toEqual({ "tpl-1": 2700 });
  });

  it("handles multiple templates in a single batch query", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { template_id: "tpl-1", duration_seconds: 2700, rn: 1 },
      { template_id: "tpl-2", duration_seconds: 1800, rn: 1 },
      { template_id: "tpl-2", duration_seconds: 3600, rn: 2 },
    ]);
    const result = await getTemplateDurationEstimates(["tpl-1", "tpl-2", "tpl-3"]);
    expect(result).toEqual({
      "tpl-1": 2700,
      "tpl-2": 2700, // median of [1800, 3600]
      "tpl-3": null,
    });
  });

  it("uses a single SQL query (batched)", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);
    await getTemplateDurationEstimates(["tpl-1", "tpl-2"]);
    expect(mockDb.getAllAsync).toHaveBeenCalledTimes(1);
    const sql = mockDb.getAllAsync.mock.calls[0][0] as string;
    expect(sql).toContain("IN (?, ?)");
  });

  it("SQL excludes sessions < 60s and null durations", async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([]);
    await getTemplateDurationEstimates(["tpl-1"]);
    const sql = mockDb.getAllAsync.mock.calls[0][0] as string;
    expect(sql).toContain("duration_seconds >= 60");
    expect(sql).toContain("duration_seconds IS NOT NULL");
    expect(sql).toContain("completed_at IS NOT NULL");
  });
});
