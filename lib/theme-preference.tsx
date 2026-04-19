import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getAppSetting, setAppSetting } from "./db";

export type ThemeMode = "system" | "light" | "dark";

type ThemePreferenceContextType = {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
};

export const ThemePreferenceContext = createContext<ThemePreferenceContextType>({
  themeMode: "system",
  setThemeMode: () => {},
});

export function useThemeMode() {
  return useContext(ThemePreferenceContext);
}

export function ThemePreferenceProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    getAppSetting("theme_mode").then((val) => {
      if (val === "light" || val === "dark") setThemeModeState(val);
    }).catch(() => {});
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    setAppSetting("theme_mode", mode).catch(() => {});
  }, []);

  return (
    <ThemePreferenceContext.Provider value={{ themeMode, setThemeMode }}>
      {children}
    </ThemePreferenceContext.Provider>
  );
}
