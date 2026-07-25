import React from "react";
import { render } from "@testing-library/react-native";
import ImbalanceTrendCard from "../../../components/exercise/ImbalanceTrendCard";
import type { ImbalanceTrendPoint } from "../../../lib/db/session-sets";

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    surface: "#fff",
    onSurface: "#000",
    onSurfaceVariant: "#666",
    secondary: "#1A2138",
    error: "#ff0000",
  }),
}));

// Mock victory-native because it's graphical and has native code dependencies
jest.mock("victory-native", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    CartesianChart: ({ children, data }: { children: (args: { points: { value: { x: number; y: number }[] } }) => React.ReactNode; data: { value: number }[] }) => {
      // Mock points to pass to CartesianChart's children function
      const points = { value: data.map((d: { value: number }, idx: number) => ({ x: idx, y: d.value })) };
      return <View testID="mock-cartesian-chart">{children({ points })}</View>;
    },
    Line: () => <View testID="mock-line" />,
  };
});

// Mock ChartGate
jest.mock("@/components/ui/ChartGate", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    ChartGate: ({ children }: { children: React.ReactNode }) => <View testID="mock-chart-gate">{children}</View>,
  };
});

describe("ImbalanceTrendCard — BLD-3932", () => {
  const mockColors = {
    surface: "#fff",
    onSurface: "#000",
    onSurfaceVariant: "#666",
    secondary: "#1A2138",
    error: "#ff0000",
  } as unknown as import("@/hooks/useThemeColors").ThemeColors;

  it("renders loading state", () => {
    const { getByTestId } = render(
      <ImbalanceTrendCard colors={mockColors} trend={[]} loading={true} error={false} />
    );
    expect(getByTestId("loading-indicator")).toBeTruthy();
  });

  it("renders error state", () => {
    const { getByText } = render(
      <ImbalanceTrendCard colors={mockColors} trend={[]} loading={false} error={true} />
    );
    expect(getByText("Failed to load imbalance trend")).toBeTruthy();
  });

  it("renders empty state when < 3 qualifying sessions", () => {
    const { getByText } = render(
      <ImbalanceTrendCard colors={mockColors} trend={[]} loading={false} error={false} />
    );
    expect(
      getByText(
        "Not enough data to show a trend yet — log a few more unilateral sessions with weighted loads on each side."
      )
    ).toBeTruthy();
  });

  it("renders narrowed trend and dominant-side caption (without flip)", () => {
    const trend: ImbalanceTrendPoint[] = [
      { sessionId: "s1", startedAt: 1721865600000, leftVol: 100, rightVol: 115, diffPct: 15, dominantSide: "right" },
      { sessionId: "s2", startedAt: 1721952000000, leftVol: 100, rightVol: 110, diffPct: 10, dominantSide: "right" },
      { sessionId: "s3", startedAt: 1722038400000, leftVol: 100, rightVol: 105, diffPct: 5, dominantSide: "right" },
    ];

    const { getByText, getByLabelText } = render(
      <ImbalanceTrendCard colors={mockColors} trend={trend} loading={false} error={false} />
    );

    // Summary and caption copy checks
    expect(getByText("Imbalance narrowed from 15% to 5% over your last 3 sessions")).toBeTruthy();
    expect(getByText("Most recent: Right side stronger")).toBeTruthy();

    // a11y label check (matches exactly the required spec string)
    const expectedA11y = "Imbalance trend: narrowed from 15% to 5% over 3 sessions. Right side currently stronger.";
    expect(getByLabelText(expectedA11y)).toBeTruthy();
  });

  it("renders held steady trend and side changed flip caption", () => {
    const trend: ImbalanceTrendPoint[] = [
      { sessionId: "s1", startedAt: 1721865600000, leftVol: 110, rightVol: 100, diffPct: 10, dominantSide: "left" },
      { sessionId: "s2", startedAt: 1721952000000, leftVol: 100, rightVol: 100, diffPct: 0, dominantSide: "equal" },
      { sessionId: "s3", startedAt: 1722038400000, leftVol: 100, rightVol: 111, diffPct: 11, dominantSide: "right" },
    ];

    const { getByText, getByLabelText } = render(
      <ImbalanceTrendCard colors={mockColors} trend={trend} loading={false} error={false} />
    );

    // Summary and caption checks (since first third is index 0: 10%, last third is index 2: 11%, difference is 1pp, which is < 2pp → held steady)
    expect(getByText("Imbalance held steady near 11% over 3 sessions")).toBeTruthy();
    expect(getByText("Most recent: Right side stronger (side changed)")).toBeTruthy();

    // a11y label check
    const expectedA11y = "Imbalance trend: held steady near 11% over 3 sessions. Right side currently stronger.";
    expect(getByLabelText(expectedA11y)).toBeTruthy();
  });
});
