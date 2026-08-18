jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "1.2.3", extra: { distributionChannel: "github" } } },
}));

jest.mock("@/lib/db/settings", () => ({
  getAppSetting: jest.fn(),
  setAppSetting: jest.fn(),
  deleteAppSetting: jest.fn(),
}));

import Constants from "expo-constants";
import { deleteAppSetting, getAppSetting, setAppSetting } from "@/lib/db/settings";
import {
  checkForUpdate,
  clearLastCheckedAt,
  compareVersions,
  INVALID_VERSION_COMPARISON,
  resolveDistributionChannel,
  resolveReleaseUrl,
} from "@/lib/update-check";

const mockedGet = getAppSetting as jest.MockedFunction<typeof getAppSetting>;
const mockedSet = setAppSetting as jest.MockedFunction<typeof setAppSetting>;
const mockedDelete = deleteAppSetting as jest.MockedFunction<typeof deleteAppSetting>;

const release = (tag_name: string, overrides = {}) => ({
  tag_name,
  name: "Release name",
  body: "Release notes",
  html_url: "https://example.test/release",
  assets: [{ name: "cablesnap.apk", browser_download_url: "https://example.test/app.apk" }],
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockedGet.mockResolvedValue(null);
  mockedSet.mockResolvedValue(undefined);
  mockedDelete.mockResolvedValue(undefined);
  (Constants as unknown as { expoConfig: { version: string; extra: { distributionChannel: string } } }).expoConfig = { version: "1.2.3", extra: { distributionChannel: "github" } };
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => release("v1.2.4") }) as unknown as typeof fetch;
});

afterEach(() => jest.restoreAllMocks());

describe("compareVersions", () => {
  it.each([
    ["1.2.4", "1.2.3", 1],
    ["1.2.3", "1.2.3", 0],
    ["1.2.2", "1.2.3", -1],
    ["v1.2.4", "1.2.3", 1],
    ["v1.3", "1.2.9", 1],
    ["v1.2", "1.2.0", 0],
    ["v1.2.4-beta", "1.2.3", INVALID_VERSION_COMPARISON],
    ["release", "1.2.3", INVALID_VERSION_COMPARISON],
  ])("compares %s to %s", (left, right, expected) => {
    expect(compareVersions(left, right)).toBe(expected);
  });
});

describe("checkForUpdate", () => {
  it("returns a newer release and falls back to html_url when the asset is absent", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => release("v1.2.4", { assets: [] }),
    });

    await expect(checkForUpdate(2 * 24 * 60 * 60 * 1000)).resolves.toMatchObject({
      tag: "v1.2.4",
      url: "https://example.test/release",
    });
  });

  it.each(["v1.2.3", "v1.2.2"])("does not return equal or older tag %s", async (tag) => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => release(tag) });
    await expect(checkForUpdate(2 * 24 * 60 * 60 * 1000)).resolves.toBeNull();
  });

  it("suppresses a dismissed tag", async () => {
    mockedGet.mockImplementation(async (key) => key === "update.dismissedTag" ? "v1.2.4" : null);
    await expect(checkForUpdate(2 * 24 * 60 * 60 * 1000)).resolves.toBeNull();
  });

  it("prompts again for a newer tag after dismissing an older tag", async () => {
    mockedGet.mockImplementation(async (key) => key === "update.dismissedTag" ? "v1.2.4" : null);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => release("v1.2.5") });
    await expect(checkForUpdate(2 * 24 * 60 * 60 * 1000)).resolves.toMatchObject({ tag: "v1.2.5" });
  });

  it("throttles checks for 24 hours", async () => {
    mockedGet.mockImplementation(async (key) => key === "update.lastCheckedAt" ? "1000" : null);
    await expect(checkForUpdate(1000 + 24 * 60 * 60 * 1000 - 1)).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("clears the last checked timestamp for a retry", async () => {
    await clearLastCheckedAt();
    expect(mockedDelete).toHaveBeenCalledWith("update.lastCheckedAt");
  });

  it("checks again when the stored timestamp is in the future", async () => {
    mockedGet.mockImplementation(async (key) => key === "update.lastCheckedAt" ? "2000" : null);
    await expect(checkForUpdate(1000)).resolves.toMatchObject({ tag: "v1.2.4" });
    expect(global.fetch).toHaveBeenCalled();
  });

  it("checks when the stored timestamp is non-numeric", async () => {
    mockedGet.mockImplementation(async (key) => key === "update.lastCheckedAt" ? "not-a-number" : null);
    await expect(checkForUpdate(1000)).resolves.toMatchObject({ tag: "v1.2.4" });
    expect(global.fetch).toHaveBeenCalled();
  });

  it("does not prompt F-Droid builds", async () => {
    (Constants.expoConfig as unknown as { extra: { distributionChannel: string } }).extra.distributionChannel = "fdroid";
    await expect(checkForUpdate()).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["non-200", { ok: false, status: 500 }],
    ["403 rate limit", { ok: false, status: 403 }],
    ["json rejection", { ok: true, json: jest.fn().mockRejectedValue(new Error("bad json")) }],
  ])("does not burn the throttle after %s", async (_name, response) => {
    (global.fetch as jest.Mock).mockResolvedValue(response);
    await expect(checkForUpdate(2 * 24 * 60 * 60 * 1000)).resolves.toBeNull();
    expect(mockedSet).not.toHaveBeenCalledWith("update.lastCheckedAt", expect.any(String));
  });

  it("handles an undefined assets list", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => release("v1.2.4", { assets: undefined }) });
    await expect(checkForUpdate(2 * 24 * 60 * 60 * 1000)).resolves.toMatchObject({ url: "https://example.test/release" });
  });

  it("fails closed when the build channel cannot be confirmed", async () => {
    (Constants.expoConfig as unknown as { extra?: unknown }).extra = undefined;
    await expect(checkForUpdate(2 * 24 * 60 * 60 * 1000)).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("fails closed when Expo config is null", async () => {
    (Constants as unknown as { expoConfig: null }).expoConfig = null;
    await expect(checkForUpdate(2 * 24 * 60 * 60 * 1000)).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("silently handles fetch failures", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("offline"));
    await expect(checkForUpdate(2 * 24 * 60 * 60 * 1000)).resolves.toBeNull();
  });
});

it("resolves the channel and asset URL from the centralized map", () => {
  expect(resolveDistributionChannel({ distributionChannel: "fdroid" })).toBe("fdroid");
  expect(resolveDistributionChannel({ distributionChannel: "github" })).toBe("github");
  expect(resolveDistributionChannel({})).toBeUndefined();
  expect(resolveReleaseUrl(release("v1.2.4"), "github")).toBe("https://example.test/app.apk");
});
