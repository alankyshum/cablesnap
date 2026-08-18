/**
 * BLD-4078: PacingBreakdownSheet 'Working' column header truncated on mobile (BLD-4040).
 *
 * This test asserts that the 'nameCell' styling in StyleSheet.create has a flex of 1.5,
 * which provides more space for the 'Working' column, preventing truncation.
 */

import React from "react";
import { render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import type { TextProps, TextStyle } from "react-native";
import PacingBreakdownSheet from "../../../../components/session/summary/PacingBreakdownSheet";
import type { PacingBreakdown } from "@/lib/session-pacing";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockBottomSheetOpen = jest.fn();
const mockBottomSheetClose = jest.fn();

jest.mock("@/components/ui/bottom-sheet", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    BottomSheet: ({
      isVisible,
      children,
      title,
    }: {
      isVisible: boolean;
      children?: React.ReactNode;
      title?: React.ReactNode;
    }) =>
      isVisible ? (
        <View testID="mock-bottom-sheet">
          <View testID="bottom-sheet-title">{title}</View>
          {children}
        </View>
      ) : null,
    useBottomSheet: () => ({
      isVisible: true,
      open: mockBottomSheetOpen,
      close: mockBottomSheetClose,
    }),
  };
});

jest.mock("@/components/ui/text", () => {
  const ReactLib = require("react");
  const { Text: RNText } = require("react-native");
  return {
    Text: (props: Record<string, unknown>) => {
      const { children, ...rest } = props;
      return ReactLib.createElement(RNText, rest, children);
    },
  };
});

jest.mock("@/hooks/useThemeColors", () => {
  const { makeMockThemeColors } = require("../../../helpers/theme");
  return { useThemeColors: () => makeMockThemeColors("light") };
});

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => "Icon");

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePacing(overrides: Partial<PacingBreakdown> = {}): PacingBreakdown {
  return {
    working: 600,   // 10 min
    rest: 900,      // 15 min
    other: 300,     // 5 min
    gross: 1800,    // 30 min
    perExercise: [
      {
        exercise_id: "ex-1",
        working: 300,
        rest: 450,
        other: 150,
      }
    ],
    isEmpty: false,
    ...overrides,
  };
}

function flatStyle(style: TextProps["style"]): TextStyle {
  return StyleSheet.flatten(style) ?? {};
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PacingBreakdownSheet — truncation and layout check (BLD-4078)", () => {
  it("renders the name column (Exercise) with flex: 1.5 to prevent Working truncation on mobile", () => {
    const pacing = makePacing();
    const { getByText } = render(
      <PacingBreakdownSheet
        pacing={pacing}
        exerciseNames={{ "ex-1": "Bench Press" }}
        onClose={jest.fn()}
      />
    );

    // Verify "Exercise" header exists and has the correct flex style
    const exerciseHeader = getByText("Exercise");
    expect(exerciseHeader).toBeTruthy();

    const style = flatStyle(exerciseHeader.props.style);
    // Must be 1.5 (provides enough room for Working column header) — NOT 2 (truncates Working on small screens)
    expect(style.flex).toBe(1.5);
  });
});
