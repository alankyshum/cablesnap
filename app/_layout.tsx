import { useColorScheme } from "react-native";
import { PaperProvider } from "react-native-paper";
import { ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { light, dark, navigationLight, navigationDark } from "../constants/theme";

export default function RootLayout() {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";

  return (
    <PaperProvider theme={isDark ? dark : light}>
      <ThemeProvider value={isDark ? navigationDark : navigationLight}>
        <Stack screenOptions={{ headerShown: false }} />
        <StatusBar style="auto" />
      </ThemeProvider>
    </PaperProvider>
  );
}
