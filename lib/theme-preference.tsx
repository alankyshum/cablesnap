import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getAppSetting, setAppSetting } from "./db";

export type ThemeMode = "system" | "light" | "dark";

type ThemePreferenceContextType = {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
};

export const ThemePreferenceContext = createContext<ThemePreferenceContextType>({
  themeMode: "dark",
  setThemeMode: () => {},
});

export function useThemeMode() {
  return useContext(ThemePreferenceContext);
}

export function ThemePreferenceProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>("dark");

  useEffect(() => {
    getAppSetting("theme_mode").then((val) => {
      if (val === "system" || val === "light" || val === "dark") setThemeModeState(val);
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
