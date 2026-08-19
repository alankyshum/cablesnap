import { Trans } from "@lingui/react/macro";
import { i18n } from "@lingui/core";
import { act, render } from "@testing-library/react-native";
import { Text } from "react-native";
import { activateLocale, t } from "../../../lib/i18n";
import { getLocaleFallbacks, resolveLocale } from "../../../lib/i18n/locales";
import { I18nProvider } from "../../../lib/i18n/provider";
import { LanguagePreferenceContext } from "../../../lib/language-preference";

describe("locale resolution", () => {
  it.each([
    ["zh-Hant-TW", "zh-TW"], ["zh-Hant", "zh-TW"], ["zh-Hant-HK", "zh-TW"],
    ["zh-HK", "zh-TW"], ["zh-MO", "zh-TW"], ["zh", "zh-TW"], ["zh-TW", "zh-TW"],
    ["zh-Hans-CN", "zh-CN"], ["zh-Hans", "zh-CN"], ["zh-Hans-SG", "zh-CN"], ["zh-CN", "zh-CN"],
    ["en-GB", "en-GB"], ["en-US", "en-US"], ["en", "en-US"], ["en-AU", "en-US"], ["fr-FR", "en-US"],
  ])("maps %s to %s", (input, expected) => expect(resolveLocale(input)).toBe(expected));

  it.each([
    ["en-GB", ["en-GB", "en-US"]], ["zh-TW", ["zh-TW", "en-US"]],
    ["zh-CN", ["zh-CN", "en-US"]],
  ] as const)("uses the %s fallback chain", (locale, expected) => expect(getLocaleFallbacks(locale)).toEqual(expected));

  it("never uses zh-TW in the zh-CN runtime chain", () => {
    expect(getLocaleFallbacks("zh-CN")).not.toContain("zh-TW");
  });

  it("renders an en-US Trans id", () => {
    activateLocale("en-US");
    const Screen = () => <Text><Trans id="i18n.smoke">Fallback</Trans></Text>;
    expect(render(<I18nProvider><Screen /></I18nProvider>).getByText("Fallback")).toBeTruthy();
    expect(i18n.locale).toBe("en-US");
  });

  it("re-renders imperative t strings when the locale key changes", () => {
    const Screen = () => <Text>{t({ id: "i18n.smoke", message: "Fallback" })}</Text>;
    const value = { language: "en-US" as const, setLanguage: jest.fn() };
    const view = render(
      <LanguagePreferenceContext.Provider value={value}>
        <I18nProvider><Screen /></I18nProvider>
      </LanguagePreferenceContext.Provider>,
    );
    expect(view.getByText("Fallback")).toBeTruthy();

    act(() => activateLocale("zh-TW"));
    view.rerender(
      <LanguagePreferenceContext.Provider value={{ ...value, language: "zh-TW" }}>
        <I18nProvider><Screen /></I18nProvider>
      </LanguagePreferenceContext.Provider>,
    );
    expect(view.getByText("國際化的")).toBeTruthy();
  });
});
