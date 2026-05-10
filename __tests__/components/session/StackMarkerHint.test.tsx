/**
 * BLD-1130 G1 (closes BLD-1127 AC4 + part of G5):
 * StackMarkerHint visibility + dismissal persistence.
 *
 * Verifies:
 *  - Hint renders when `app_settings.stackMarkerHintDismissedAt` is null.
 *  - Pressing the dismiss button writes a timestamp via setAppSetting and
 *    invalidates the query so the hint hides on next render.
 *  - Hint does NOT render when a dismissal timestamp already exists.
 */
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

jest.mock("@/lib/db/settings", () => ({
  getAppSetting: jest.fn(),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    surfaceVariant: "#eee",
    outlineVariant: "#ccc",
    onSurfaceVariant: "#444",
  }),
}));

jest.mock("lucide-react-native", () => {
  const { Text } = require("react-native");
  return { X: () => <Text>X</Text> };
});

import { getAppSetting, setAppSetting } from "@/lib/db/settings";
import { StackMarkerHint } from "@/components/session/StackMarkerHint";
import { STACK_MARKER_HINT_DISMISSED_AT_KEY } from "@/lib/stack-marker-hint";

function withClient(node: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

describe("StackMarkerHint (BLD-1130 G1 / BLD-1127 AC4)", () => {
  beforeEach(() => {
    (getAppSetting as jest.Mock).mockReset();
    (setAppSetting as jest.Mock).mockReset();
    (setAppSetting as jest.Mock).mockResolvedValue(undefined);
  });

  it("renders the hint banner when dismissedAt is null", async () => {
    (getAppSetting as jest.Mock).mockResolvedValue(null);
    const { findByTestId } = render(withClient(<StackMarkerHint />));
    await findByTestId("stack-marker-hint");
  });

  it("does not render when dismissedAt is already set", async () => {
    (getAppSetting as jest.Mock).mockResolvedValue("2026-05-10T00:00:00.000Z");
    const { queryByTestId } = render(withClient(<StackMarkerHint />));
    // Wait a microtask for query to resolve.
    await waitFor(() => {
      expect(queryByTestId("stack-marker-hint")).toBeNull();
    });
  });

  it("persists dismissal via setAppSetting and hides the hint", async () => {
    (getAppSetting as jest.Mock).mockResolvedValue(null);
    const { findByTestId, queryByTestId } = render(withClient(<StackMarkerHint />));
    const dismissBtn = await findByTestId("stack-marker-hint-dismiss");

    // Once dismiss fires, the next refetch returns the timestamp.
    (getAppSetting as jest.Mock).mockResolvedValue("2026-05-10T01:00:00.000Z");
    fireEvent.press(dismissBtn);

    await waitFor(() => {
      expect(setAppSetting).toHaveBeenCalledWith(
        STACK_MARKER_HINT_DISMISSED_AT_KEY,
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      );
    });
    await waitFor(() => {
      expect(queryByTestId("stack-marker-hint")).toBeNull();
    });
  });
});
