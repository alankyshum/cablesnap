import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockInvalidateQueries = jest.fn();

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useFocusEffect: (effect: () => void) => { effect(); },
}));

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    background: "#fff",
    surface: "#f5f5f5",
    onSurface: "#111",
    onSurfaceVariant: "#666",
  }),
}));

jest.mock("@/components/ui/bna-toast", () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() }),
}));

jest.mock("@/components/settings/KeyStatusCard", () => ({
  __esModule: true,
  default: () => null,
}));

let mockStored = false;
jest.mock("@/lib/ai/key-vault", () => ({
  get: jest.fn(async () => null),
  set: jest.fn(async () => { mockStored = true; }),
  delete: jest.fn(async () => { mockStored = false; }),
  has: jest.fn(async () => mockStored),
  keyFormat: (value: unknown): value is string =>
    typeof value === "string" && /^sk-or-v1-[a-f0-9]{64}$/.test(value),
}));

import AIKeySettingsScreen from "@/app/settings/ai-key";

const rawKey = `sk-or-v1-${"a".repeat(64)}`;

describe("AI provider key settings", () => {
  it("does not render the raw key after saving", async () => {
    const { getByTestId, getByLabelText, getByText, queryByText } = render(<AIKeySettingsScreen />);

    await waitFor(() => expect(getByText("Save key")).toBeTruthy());
    fireEvent(getByTestId("openrouter-key-input"), "onChangeText", rawKey);
    await waitFor(() => expect(getByTestId("openrouter-key-input").props.value).toBe(rawKey));
    fireEvent.press(getByLabelText("Save key"));
    await waitFor(() => expect(getByText("Saved securely on this device")).toBeTruthy());
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["ai", "key-status"] });
    expect(queryByText(rawKey)).toBeNull();
    expect(getByText("••••••••••••••••••••")).toBeTruthy();

    fireEvent.press(getByLabelText("Remove"));
    await waitFor(() => expect(getByText("Save key")).toBeTruthy());
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["ai", "key-status"] });
  });
});
