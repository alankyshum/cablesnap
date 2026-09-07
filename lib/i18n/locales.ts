import { getLocales } from "expo-localization";

export const SUPPORTED_LOCALES = ["en-US", "en-GB", "zh-TW", "zh-CN"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_LOOKUP: Record<string, SupportedLocale> = {
  "zh-Hant-TW": "zh-TW",
  "zh-Hant": "zh-TW",
  "zh-Hant-HK": "zh-TW",
  "zh-HK": "zh-TW",
  "zh-MO": "zh-TW",
  zh: "zh-TW",
  "zh-TW": "zh-TW",
  "zh-Hans-CN": "zh-CN",
  "zh-Hans": "zh-CN",
  "zh-Hans-SG": "zh-CN",
  "zh-CN": "zh-CN",
  en: "en-US",
  "en-AU": "en-US",
  "en-GB": "en-GB",
};

export function resolveLocale(locale?: string): SupportedLocale {
  return LOCALE_LOOKUP[locale ?? ""] ?? "en-US";
}

export function resolveDeviceLocale(): SupportedLocale {
  return resolveLocale(getLocales()[0]?.languageTag);
}

export function getLocaleFallbacks(locale: SupportedLocale): SupportedLocale[] {
  return locale === "en-US" ? ["en-US"] : [locale, "en-US"];
}
