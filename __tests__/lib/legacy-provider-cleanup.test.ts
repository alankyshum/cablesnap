// BLD-5100 AC cleanup: the obsolete provider credential is deleted once and the run is retry-safe.
jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

import * as SecureStore from "expo-secure-store";
import {
  cleanupLegacyProviderCredential,
  LEGACY_PROVIDER_KEY,
} from "../../lib/legacy-provider-cleanup";

const getItem = SecureStore.getItemAsync as jest.Mock;
const deleteItem = SecureStore.deleteItemAsync as jest.Mock;
const setItem = SecureStore.setItemAsync as jest.Mock;

describe("BLD-5100 legacy credential cleanup", () => {
  beforeEach(() => jest.clearAllMocks());

  it("deletes the stored credential once and records completion", async () => {
    getItem.mockResolvedValueOnce(null).mockResolvedValueOnce("1");
    deleteItem.mockResolvedValue(undefined);
    setItem.mockResolvedValue(undefined);

    await cleanupLegacyProviderCredential();
    await cleanupLegacyProviderCredential();

    expect(deleteItem).toHaveBeenCalledTimes(1);
    expect(deleteItem).toHaveBeenCalledWith(LEGACY_PROVIDER_KEY);
    expect(setItem).toHaveBeenCalledWith("legacy_provider_cleanup_complete_v1", "1");
  });

  it("does not mark cleanup complete when deletion fails", async () => {
    getItem.mockResolvedValue(null);
    deleteItem.mockRejectedValue(new Error("secure storage unavailable"));

    await expect(cleanupLegacyProviderCredential()).rejects.toThrow("secure storage unavailable");
    expect(setItem).not.toHaveBeenCalled();
  });
});
