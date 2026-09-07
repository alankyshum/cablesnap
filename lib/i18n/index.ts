import "./polyfills";
import { i18n } from "@lingui/core";
import { compileMessage } from "@lingui/message-utils/compileMessage";
import enUS from "../../locales/en-US.json";
import enGB from "../../locales/en-GB.json";
import zhTW from "../../locales/zh-TW.json";
import zhCN from "../../locales/zh-CN.json";
import type { CatalogEntry } from "../../scripts/i18n/catalog-entry";
import { getLocaleFallbacks, type SupportedLocale } from "./locales";

export { i18n };
export * from "./locales";

export type Catalog = Record<string, string>;

function toMessages(catalog: Record<string, CatalogEntry>): Catalog {
  return Object.fromEntries(Object.entries(catalog).map(([key, entry]) => [key, entry.message]));
}

export const catalogs: Partial<Record<SupportedLocale, Catalog>> = {
  "en-US": toMessages(enUS as Record<string, CatalogEntry>),
  "en-GB": toMessages(enGB as Record<string, CatalogEntry>),
  "zh-TW": toMessages(zhTW as Record<string, CatalogEntry>),
  "zh-CN": toMessages(zhCN as Record<string, CatalogEntry>),
};

/** Translate non-React copy using the currently activated Lingui instance. */
export function t(
  descriptor: { id: string; message: string },
  values?: Record<string, string | number>,
): string {
  try {
    return i18n._({ ...descriptor, values });
  } catch (error) {
    if (__DEV__) console.warn("Failed to translate message:", descriptor.id, error);
    return values
      ? descriptor.message.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`))
      : descriptor.message;
  }
}

export function activateLocale(locale: SupportedLocale): void {
  const messages = [...getLocaleFallbacks(locale)].reverse().reduce<Catalog>(
    (merged, candidate) => ({ ...merged, ...catalogs[candidate] }),
    {}
  );
  i18n.loadAndActivate({ locale, messages });
}

/** Purely reports the requested/current locale; activation belongs to LanguageProvider. */
export function initializeI18n(locale?: SupportedLocale): SupportedLocale {
  return locale ?? (i18n.locale as SupportedLocale);
}

// Expo Router evaluates screen option modules before the provider component
// mounts. Establish the fallback locale at module load so macro calls in those
// options never execute against an uninitialised Lingui instance.
// Production builds do not include Lingui's runtime compiler; catalogs contain
// raw ICU strings, so install the compiler before any catalog activation.
i18n.setMessagesCompiler(compileMessage);
activateLocale("en-US");
