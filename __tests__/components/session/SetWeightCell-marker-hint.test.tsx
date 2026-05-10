/**
 * BLD-1130 G1 follow-up — production-call-chain coverage for AC4.
 *
 * Verifies that StackMarkerHint is mounted inside the real SetWeightCell
 * uncalibrated cable path (the surface a user actually sees while logging),
 * NOT in non-cable rows, and NOT when the session gym already has
 * calibrations. Also verifies the hint disappears once dismissed.
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
    primary: "#000",
    onPrimary: "#fff",
    surface: "#fff",
    onSurface: "#000",
    outline: "#888",
  }),
}));

jest.mock("lucide-react-native", () => {
  const { Text } = require("react-native");
  return {
    X: () => <Text>X</Text>,
    ChevronDown: () => <Text>▾</Text>,
    ChevronUp: () => <Text>▴</Text>,
  };
});

// WeightPicker pulls in heavier deps; stub to a plain text node.
jest.mock("@/components/WeightPicker", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ accessibilityLabel }: { accessibilityLabel: string }) => (
      <Text testID="weight-picker">{accessibilityLabel}</Text>
    ),
  };
});

// MarkerPickerSheet renders nothing in the hint test; isolate it.
jest.mock("@/components/session/MarkerPickerSheet", () => ({
  MarkerPickerSheet: () => null,
}));

import { getAppSetting, setAppSetting } from "@/lib/db/settings";
import { SetWeightCell } from "@/components/session/SetWeightCell";
import type { StackWithCalibrations } from "@/hooks/useActiveCalibration";

function withClient(node: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

const baseProps = {
  setId: "s1",
  setNumber: 1,
  weight: null,
  stackMarker: null,
  stackUnit: null,
  displayedWeight: null,
  step: 2.5,
  unit: "kg" as const,
  accessibilityLabel: "Weight for set 1",
  onWeightChange: jest.fn(),
  onManualWeightSave: jest.fn(),
  onMarkerConfirm: jest.fn(),
};

const calibratedStack: StackWithCalibrations = {
  // Minimal shape — SetWeightCell only checks calibrations.length.
  id: "stk1",
  name: "Stack A",
  unit: "kg",
  // @ts-expect-error — partial fixture; runtime only reads .calibrations.length
  calibrations: [{ id: "c1", marker: 1, true_weight: 5 }],
};

describe("SetWeightCell — StackMarkerHint mounting (BLD-1130 AC4)", () => {
  beforeEach(() => {
    (getAppSetting as jest.Mock).mockReset();
    (setAppSetting as jest.Mock).mockReset();
    (setAppSetting as jest.Mock).mockResolvedValue(undefined);
    (getAppSetting as jest.Mock).mockResolvedValue(null);
  });

  it("renders the hint on cable rows when the gym has zero calibrations", async () => {
    const { findByTestId } = render(
      withClient(<SetWeightCell {...baseProps} isCable stacks={[]} />),
    );
    await findByTestId("stack-marker-hint");
  });

  it("does NOT render the hint on non-cable rows", async () => {
    const { queryByTestId, findByTestId } = render(
      withClient(<SetWeightCell {...baseProps} isCable={false} stacks={[]} />),
    );
    // Wait for query to settle so a missing hint is conclusive, not just unrendered.
    await findByTestId("weight-picker");
    await waitFor(() => {
      expect(queryByTestId("stack-marker-hint")).toBeNull();
    });
  });

  it("does NOT render the hint when the gym already has calibrations", async () => {
    const { queryByTestId, findByTestId } = render(
      withClient(<SetWeightCell {...baseProps} isCable stacks={[calibratedStack]} />),
    );
    // Pristine + calibrated cable renders the pill, not the keypad.
    await findByTestId("stack-marker-pill");
    await waitFor(() => {
      expect(queryByTestId("stack-marker-hint")).toBeNull();
    });
  });

  it("hides the hint after dismissal and persists the timestamp", async () => {
    const { findByTestId, queryByTestId } = render(
      withClient(<SetWeightCell {...baseProps} isCable stacks={[]} />),
    );
    const dismiss = await findByTestId("stack-marker-hint-dismiss");

    // Subsequent refetch returns the dismissal timestamp.
    (getAppSetting as jest.Mock).mockResolvedValue("2026-05-10T06:30:00.000Z");
    fireEvent.press(dismiss);

    await waitFor(() => {
      expect(setAppSetting).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(queryByTestId("stack-marker-hint")).toBeNull();
    });
  });
});
