/**
 * BLD-1130 G1 follow-up — production-call-chain coverage for AC4.
 *
 * BLD-1841: the StackMarkerHint was moved OUT of SetWeightCell. It used to be
 * rendered inside SetWeightCell's body, which sits inside SetRow's narrow
 * flex:1 weight column (pickerCol ≈ 25px on a 320px emulator). The hint's
 * full-sentence label therefore wrapped one character per line into a tall
 * vertical strip — a real layout defect on cable rows at uncalibrated gyms,
 * caught by the log-set e2e gate (run 28059103882 failure screenshot). The
 * hint now renders as a full-width row footer in SetRow instead.
 *
 * This test pins the contract that SetWeightCell NO LONGER mounts the hint on
 * any of its three rendering branches (uncalibrated cable / non-cable /
 * calibrated cable), so a future refactor cannot silently re-introduce the
 * trapped-in-a-narrow-column regression. The hint's own visibility/dismissal
 * behavior is covered by StackMarkerHint.test.tsx; the SetRow-level mounting
 * gate (isCable && !hasCalibration) is covered by SetRow's render path.
 */
import React from "react";
import { render, waitFor } from "@testing-library/react-native";
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

describe("SetWeightCell — StackMarkerHint moved to SetRow footer (BLD-1130 AC4 / BLD-1841)", () => {
  beforeEach(() => {
    (getAppSetting as jest.Mock).mockReset();
    (setAppSetting as jest.Mock).mockReset();
    (setAppSetting as jest.Mock).mockResolvedValue(undefined);
    (getAppSetting as jest.Mock).mockResolvedValue(null);
  });

  it("does NOT render the hint inside the weight cell on uncalibrated cable rows (moved to SetRow footer, BLD-1841)", async () => {
    const { queryByTestId, findByTestId } = render(
      withClient(<SetWeightCell {...baseProps} isCable stacks={[]} />),
    );
    // Wait for the cell to mount so a missing hint is conclusive.
    await findByTestId("weight-picker");
    await waitFor(() => {
      expect(queryByTestId("stack-marker-hint")).toBeNull();
    });
  });

  it("does NOT render the hint on non-cable rows", async () => {
    const { queryByTestId, findByTestId } = render(
      withClient(<SetWeightCell {...baseProps} isCable={false} stacks={[]} />),
    );
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
});
