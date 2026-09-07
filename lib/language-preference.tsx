import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getAppSetting, setAppSetting } from "./db";
import { activateLocale, resolveDeviceLocale, resolveLocale, type SupportedLocale } from "./i18n";

export const LANGUAGE_SETTING_KEY = "language";

type LanguagePreferenceContextType = {
  language: SupportedLocale;
  setLanguage: (language: SupportedLocale) => void;
};

export const LanguagePreferenceContext = createContext<LanguagePreferenceContextType>({
  language: "en-US",
  setLanguage: () => {},
});

export function resolveStoredLanguage(value: string | null | undefined): SupportedLocale {
  return resolveLocale(value ?? undefined);
}

export function useLanguage() {
  return useContext(LanguagePreferenceContext);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLocale>("en-US");
  const requestedLanguage = useRef<SupportedLocale | null>(null);

  useEffect(() => {
    getAppSetting(LANGUAGE_SETTING_KEY)
      .then((value) => {
        if (requestedLanguage.current !== null) return;
        const resolved = value === null ? resolveDeviceLocale() : resolveStoredLanguage(value);
        setLanguageState(resolved);
        activateLocale(resolved);
      })
      .catch(() => {});
  }, []);

  const setLanguage = useCallback((nextLanguage: SupportedLocale) => {
    requestedLanguage.current = nextLanguage;
    setLanguageState(nextLanguage);
    activateLocale(nextLanguage);
    setAppSetting(LANGUAGE_SETTING_KEY, nextLanguage).catch(() => {});
  }, []);

  return (
    <LanguagePreferenceContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguagePreferenceContext.Provider>
  );
}
