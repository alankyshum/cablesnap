import { useContext } from "react";
import { useColorScheme as useRNColorScheme } from "react-native";
import { ThemePreferenceContext } from "@/lib/theme-preference";

export function useColorScheme() {
  const systemScheme = useRNColorScheme();
  const { themeMode } = useContext(ThemePreferenceContext);

  if (themeMode === "system") return systemScheme;
  return themeMode;
}
