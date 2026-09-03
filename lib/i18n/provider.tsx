import { I18nProvider as LinguiProvider } from "@lingui/react";
import { useMemo } from "react";
import { i18n } from "./index";
import { useLanguage } from "../language-preference";

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const { language } = useLanguage();
  const locale = useMemo(() => language, [language]);
  // ~200 imperative `t` calls happen in render bodies; remounting on locale
  // change is required for those calls to observe the new catalog.
  return <LinguiProvider i18n={i18n} key={locale}>{children}</LinguiProvider>;
}
