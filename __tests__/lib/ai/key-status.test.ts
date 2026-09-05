import * as SecureStore from "expo-secure-store";
import { getKeyStatus, OPENROUTER_KEY_STATUS_URL } from "../../../lib/ai/key-status";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
}));

describe("OpenRouter key status", () => {
  const key = `sk-or-v1-${"a".repeat(64)}`;
  const fetchMock = jest.spyOn(global, "fetch");

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.mockReset();
  });

  it("returns the existing missing-key state without fetching", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

    await expect(getKeyStatus()).resolves.toEqual({ kind: "missing_key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces key-scoped usage fields and never puts the key in the request URL", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(key);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { limit_remaining: 12.5, usage_daily: 1.25, usage_monthly: 9.5 } }),
    } as Response);

    await expect(getKeyStatus()).resolves.toEqual({
      kind: "available",
      limitRemaining: 12.5,
      usageDaily: 1.25,
      usageMonthly: 9.5,
    });
    expect(fetchMock).toHaveBeenCalledWith(OPENROUTER_KEY_STATUS_URL, {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(OPENROUTER_KEY_STATUS_URL).not.toContain(key);
  });
});
