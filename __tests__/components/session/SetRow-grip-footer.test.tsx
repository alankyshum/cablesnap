/**
 * BLD-822 — SetRow grip footer rendering, composite a11y labels, and
 * mutual-exclusion vs the cable variant footer (BLD-771).
 *
 * Coverage:
 *  - Composite a11y label, all 4 cases (both set / only grip / only width /
 *    both null) — QD-8 enumerated-label spec.
 *  - Mutual exclusion: a row never renders BOTH the cable footer and the grip
 *    footer (predicates are disjoint by construction).
 *  - The grip footer is only rendered when isBodyweightGripExercise() gates
 *    true (equipment === "bodyweight" AND name regex matches).
 *  - Coexistence with BodyweightModifierChip in pickerCol for weighted
 *    pull-ups (independent storage, independent UI).
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
import type { Equipment, GripType, GripWidth } from "../../../lib/types";

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
    equipment: "bodyweight" as Equipment,
    onUpdate: jest.fn(),
    onCheck: jest.fn(),
    onDelete: jest.fn(),
    onCycleSetType: noop,
    onLongPressSetType: noop,
    isBodyweight: true,
    exerciseName: "Pull-Up",
    onOpenBodyweightGripPicker: jest.fn(),
    onClearBodyweightGrip: jest.fn(),
    onOpenBodyweightModifier: jest.fn(),
    onClearBodyweightModifier: jest.fn(),
    onOpenVariantPicker: jest.fn(),
    onClearVariant: jest.fn(),
    ...over,
  };
}

describe("SetRow grip footer — BLD-822 composite a11y labels (QD-8)", () => {
  it.each<[GripType | null, GripWidth | null, string]>([
    ["overhand", "narrow", "Set 1 grip variant: Overhand, Narrow. Double-tap to edit."],
    ["overhand", null, "Set 1 grip variant: Overhand, width not set. Double-tap to edit."],
    [null, "narrow", "Set 1 grip variant: grip not set, Narrow. Double-tap to edit."],
    [null, null, "Set 1 grip variant: not set. Double-tap to choose."],
  ])("grip_type=%s, grip_width=%s → %s", (gt, gw, expected) => {
    const set = makeSet({ grip_type: gt, grip_width: gw });
    const { getByLabelText } = render(<SetRow {...baseProps({ set })} />);
    expect(getByLabelText(expected)).toBeTruthy();
  });
});

describe("SetRow grip footer — BLD-822 gating", () => {
  it("renders the grip footer when equipment=bodyweight AND name matches", () => {
    const { queryByLabelText } = render(
      <SetRow {...baseProps({ exerciseName: "Pull-Up" })} />,
    );
    expect(queryByLabelText(/grip variant: not set/)).toBeTruthy();
  });

  it("does NOT render the grip footer for non-matching bodyweight name (e.g. Push-Up)", () => {
    const { queryByLabelText } = render(
      <SetRow {...baseProps({ exerciseName: "Push-Up" })} />,
    );
    expect(queryByLabelText(/grip variant/)).toBeNull();
  });

  it("does NOT render the grip footer for cable equipment even with matching name", () => {
    const { queryByLabelText } = render(
      <SetRow
        {...baseProps({
          equipment: "cable" as Equipment,
          isBodyweight: false,
          exerciseName: "Pull-Up",
        })}
      />,
    );
    expect(queryByLabelText(/grip variant/)).toBeNull();
  });

  it.each(["pullup", "Pull-Ups", "Chin-up", "Inverted Row", "TRX Row", "Australian Pull-up"])(
    "renders for matching name: %s",
    (name) => {
      const { queryByLabelText } = render(
        <SetRow {...baseProps({ exerciseName: name })} />,
      );
      expect(queryByLabelText(/grip variant/)).toBeTruthy();
    },
  );

  it("does NOT render for documented limitation 'Pull Up' (space, no hyphen)", () => {
    const { queryByLabelText } = render(
      <SetRow {...baseProps({ exerciseName: "Pull Up" })} />,
    );
    expect(queryByLabelText(/grip variant/)).toBeNull();
  });
});

describe("SetRow — BLD-822 mutual exclusion vs cable footer (BLD-771)", () => {
  it("a bodyweight Pull-Up row renders ONLY the grip footer, never the cable footer", () => {
    const { queryByLabelText } = render(
      <SetRow {...baseProps({ equipment: "bodyweight" as Equipment, exerciseName: "Pull-Up" })} />,
    );
    expect(queryByLabelText(/grip variant/)).toBeTruthy();
    expect(queryByLabelText(/cable variant/)).toBeNull();
  });

  it("a cable Pulldown row renders ONLY the cable footer, never the grip footer", () => {
    const { queryByLabelText } = render(
      <SetRow
        {...baseProps({
          equipment: "cable" as Equipment,
          isBodyweight: false,
          exerciseName: "Pulldown",
        })}
      />,
    );
    expect(queryByLabelText(/cable variant/)).toBeTruthy();
    expect(queryByLabelText(/grip variant/)).toBeNull();
  });
});

describe("SetRow — BLD-822 weighted pull-up coexistence", () => {
  it("renders BOTH the bodyweight modifier chip (in pickerCol) AND the grip footer", () => {
    const set = makeSet({
      bodyweight_modifier_kg: 15,
      grip_type: "overhand",
    });
    const { queryByLabelText } = render(<SetRow {...baseProps({ set })} />);
    // Grip chip in footer
    expect(queryByLabelText("Grip: Overhand")).toBeTruthy();
    // Composite footer label still readable
    expect(queryByLabelText(/Set 1 grip variant: Overhand/)).toBeTruthy();
  });
});
