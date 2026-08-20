import type { SupportedLocale } from "./locales";

/** Fixed endonyms: language names stay readable regardless of app locale. */
const LANGUAGE_NAMES: Record<SupportedLocale, string> = {
  "en-US": "English (US)",
  "en-GB": "English (UK)",
  "zh-TW": "繁體中文",
  "zh-CN": "简体中文",
};

export function translatedLanguageName(locale: SupportedLocale): string {
  return LANGUAGE_NAMES[locale];
}
