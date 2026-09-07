import * as SecureStore from "expo-secure-store";
import { delete as deleteKey, get, has, keyFormat, set, KEY_OPENROUTER } from "../../lib/ai/key-vault";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

describe("OpenRouter key vault", () => {
  const validKey = `sk-or-v1-${"a".repeat(64)}`;

  beforeEach(() => jest.clearAllMocks());

  it("validates the OpenRouter shape and exposes the single SecureStore key", async () => {
    expect(keyFormat(validKey)).toBe(true);
    expect(keyFormat("sk-or-v1-short")).toBe(false);
    expect(keyFormat("not-a-key")).toBe(false);

    await set(validKey);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(KEY_OPENROUTER, validKey);
    await get();
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith(KEY_OPENROUTER);
    await deleteKey();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(KEY_OPENROUTER);
  });

  it("rejects invalid keys before SecureStore", async () => {
    await expect(set("invalid")).rejects.toThrow("Invalid OpenRouter key format");
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it("reports presence from SecureStore", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(validKey).mockResolvedValueOnce(null);
    await expect(has()).resolves.toBe(true);
    await expect(has()).resolves.toBe(false);
  });
});
