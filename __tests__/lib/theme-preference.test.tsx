import React from "react";
import { Text } from "react-native";
import { render, waitFor } from "@testing-library/react-native";
import { getAppSetting } from "@/lib/db";
import { ThemePreferenceProvider, useThemeMode } from "@/lib/theme-preference";

jest.mock("@/lib/db", () => ({
  getAppSetting: jest.fn(),
  setAppSetting: jest.fn(),
}));

function ThemeModeLabel() {
  const { themeMode } = useThemeMode();
  return <Text testID="theme-mode">{themeMode}</Text>;
}

describe("ThemePreferenceProvider", () => {
  beforeEach(() => jest.clearAllMocks());

  it("defaults to dark when there is no saved preference", async () => {
    jest.mocked(getAppSetting).mockResolvedValue(null);
    const screen = render(<ThemePreferenceProvider><ThemeModeLabel /></ThemePreferenceProvider>);
    await waitFor(() => expect(screen.getByTestId("theme-mode")).toHaveTextContent("dark"));
  });

  it("defaults to dark when loading the preference fails", async () => {
    jest.mocked(getAppSetting).mockRejectedValue(new Error("settings unavailable"));
    const screen = render(<ThemePreferenceProvider><ThemeModeLabel /></ThemePreferenceProvider>);
    await waitFor(() => expect(screen.getByTestId("theme-mode")).toHaveTextContent("dark"));
  });

  it.each(["system", "light", "dark"] as const)("restores saved %s preference", async (mode) => {
    jest.mocked(getAppSetting).mockResolvedValue(mode);
    const screen = render(<ThemePreferenceProvider><ThemeModeLabel /></ThemePreferenceProvider>);
    await waitFor(() => expect(screen.getByTestId("theme-mode")).toHaveTextContent(mode));
  });

  it("uses dark for an invalid saved value", async () => {
    jest.mocked(getAppSetting).mockResolvedValue("invalid");
    const screen = render(<ThemePreferenceProvider><ThemeModeLabel /></ThemePreferenceProvider>);
    await waitFor(() => expect(screen.getByTestId("theme-mode")).toHaveTextContent("dark"));
  });
});
