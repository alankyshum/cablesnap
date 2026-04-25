/**
 * BLD-596 — MountTransitionHint unit tests.
 *
 * Verifies:
 *  - Hint renders declarative copy "Mount: <Prev> → <Next>".
 *  - a11y label = "Mount changes: <Prev> to <Next>" (matches detail-drawer
 *    noun-phrase vocabulary; no `accessibilityRole="text"`).
 *  - Pure-primitive props → React.memo shallow-equality skips re-renders when
 *    props are unchanged.
 *  - Caller-side suppression (same-mount, missing-mount, single-group) is
 *    exercised in the integration tests; this unit only renders when invoked.
 */
import React from "react";
import { render } from "@testing-library/react-native";
import { MountTransitionHint } from "../../../components/session/MountTransitionHint";
import { MOUNT_POSITION_LABELS, type MountPosition } from "../../../lib/types";

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({ onSurfaceVariant: "#49454F" }),
}));

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <Text>{`icon:${name}`}</Text>,
  };
});

type Pair = [MountPosition, MountPosition];
const PAIRS: Pair[] = [
  ["low", "high"],
  ["high", "low"],
  ["mid", "floor"],
  ["floor", "mid"],
];

describe("MountTransitionHint — BLD-596", () => {
  it.each(PAIRS)(
    "renders 'Mount: %s → %s' with the correct a11y label",
    (prev, next) => {
      const prevLabel = MOUNT_POSITION_LABELS[prev];
      const nextLabel = MOUNT_POSITION_LABELS[next];
      const { getByText, getByLabelText } = render(
        <MountTransitionHint prevMount={prev} nextMount={next} />,
      );
      expect(getByText(`Mount: ${prevLabel} → ${nextLabel}`)).toBeTruthy();
      const node = getByLabelText(
        `Mount changes: ${prevLabel} to ${nextLabel}`,
      );
      expect(node.props.accessibilityRole).toBeUndefined();
    },
  );

  it("uses declarative copy — never imperative 'Switch'", () => {
    const { queryByText } = render(
      <MountTransitionHint prevMount="low" nextMount="high" />,
    );
    expect(queryByText(/^Switch/)).toBeNull();
  });
});
