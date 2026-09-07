const settingsStore: Record<string, string> = {};

jest.mock("../../lib/db/settings", () => ({
  getAppSetting: jest.fn((key: string) => Promise.resolve(settingsStore[key] ?? null)),
  setAppSetting: jest.fn((key: string, value: string) => {
    settingsStore[key] = value;
    return Promise.resolve();
  }),
}));

jest.mock("../../lib/i18n", () => ({
  activateLocale: jest.fn(),
  resolveLocale: (value?: string) => {
    if (value === "en-GB" || value === "zh-TW" || value === "zh-CN") return value;
    return "en-US";
  },
}));

import {
  LANGUAGE_SETTING_KEY,
  resolveStoredLanguage,
} from "../../lib/language-preference";
import { getAppSetting, setAppSetting } from "../../lib/db/settings";

describe("language preference", () => {
  beforeEach(() => {
    Object.keys(settingsStore).forEach((key) => delete settingsStore[key]);
    jest.clearAllMocks();
  });

  it("persists and reads the selected language", async () => {
    await setAppSetting(LANGUAGE_SETTING_KEY, "zh-TW");
    const stored = await getAppSetting(LANGUAGE_SETTING_KEY);
    expect(stored).toBe("zh-TW");
    expect(resolveStoredLanguage(stored)).toBe("zh-TW");
  });

  it.each([null, undefined, "not-a-locale"])("falls back to en-US for %p", (value) => {
    expect(resolveStoredLanguage(value)).toBe("en-US");
  });
});
