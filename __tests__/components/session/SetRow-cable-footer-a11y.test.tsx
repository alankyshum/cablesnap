/**
 * BLD-823 — Cable footer composite a11y labels matching grip footer parity.
 *
 * Coverage:
 *  - Composite a11y label, all 4 cases (both set / only attachment / only
 *    position / both null) — QD-8 enumerated-label spec, cable side.
 *  - Mirrors the grip footer test in SetRow-grip-footer.test.tsx.
 */
import React from "react";
import { render } from "@testing-library/react-native";

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <Text>{name}</Text>,
  };
});

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success" },
}));

jest.mock("@/lib/audio", () => ({
  play: jest.fn().mockResolvedValue(undefined),
  setEnabled: jest.fn(),
  preload: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/db", () => ({
  getAppSetting: jest.fn().mockResolvedValue(null),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    primary: "#6200ee", primaryContainer: "#e8def8", onPrimary: "#ffffff",
    onSurface: "#1c1b1f", onSurfaceVariant: "#49454f",
    surface: "#fffbfe", surfaceVariant: "#e7e0ec",
    tertiaryContainer: "#f8e1e7", onTertiaryContainer: "#31101d",
    errorContainer: "#ffdad6", onErrorContainer: "#410002",
    error: "#b3261e", outline: "#79747e",
    background: "#fffbfe", onError: "#ffffff",
  }),
}));

jest.mock("../../../components/WeightPicker", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ value, accessibilityLabel }: { value: number; accessibilityLabel: string }) => (
      <Text accessibilityLabel={accessibilityLabel}>{value}</Text>
    ),
  };
});

jest.mock("../../../components/session/PlateHint", () => ({ PlateHint: () => null }));

jest.mock("../../../components/SwipeRowAction", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import { SetRow, type SetRowProps } from "../../../components/session/SetRow";
import type { SetWithMeta } from "../../../components/session/types";
import type { Attachment, Equipment, MountPosition } from "../../../lib/types";

function makeSet(over: Partial<SetWithMeta> = {}): SetWithMeta {
  return {
    id: "s1",
    session_id: "sess",
    exercise_id: "ex1",
    set_number: 1,
    round: null,
    weight: null,
    reps: 10,
    rpe: null,
    notes: "",
    completed: false,
    completed_at: null,
    set_type: "normal",
    duration_seconds: null,
    link_id: null,
    training_mode: null,
    tempo: null,
    swapped_from_exercise_id: null,
    exercise_position: 0,
    previous: "",
    is_pr: false,
    ...over,
  } as unknown as SetWithMeta;
}

function baseProps(over: Partial<SetRowProps> = {}): SetRowProps {
  const noop = jest.fn();
  return {
    set: makeSet(),
    step: 2.5,
    unit: "kg",
    trackingMode: "reps",
    equipment: "cable" as Equipment,
    onUpdate: jest.fn(),
    onCheck: jest.fn(),
    onDelete: jest.fn(),
    onCycleSetType: noop,
    onLongPressSetType: noop,
    isBodyweight: false,
    exerciseName: "Cable Pulldown",
    onOpenBodyweightGripPicker: jest.fn(),
    onClearBodyweightGrip: jest.fn(),
    onOpenBodyweightModifier: jest.fn(),
    onClearBodyweightModifier: jest.fn(),
    onOpenVariantPicker: jest.fn(),
    onClearVariant: jest.fn(),
    ...over,
  };
}

describe("SetRow cable footer — BLD-823 composite a11y labels (QD-8 parity)", () => {
  it.each<[Attachment | null, MountPosition | null, string]>([
    ["rope", "low", "Set 1 cable variant: Rope, Low. Double-tap to edit."],
    ["rope", null, "Set 1 cable variant: Rope, position not set. Double-tap to edit."],
    [null, "low", "Set 1 cable variant: attachment not set, Low. Double-tap to edit."],
    [null, null, "Set 1 cable variant: not set. Double-tap to choose."],
  ])("attachment=%s, mount_position=%s → %s", (att, mp, expected) => {
    const set = makeSet({ attachment: att, mount_position: mp });
    const { getByLabelText } = render(<SetRow {...baseProps({ set })} />);
    expect(getByLabelText(expected)).toBeTruthy();
  });
});
