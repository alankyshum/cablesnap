/**
 * BLD-2386 Item D3 — Pulley-pin chip gating behind variant selection.
 *
 * AC6: pending cable set with no variant → footer shows a compact, visually-light,
 *      still-VISIBLE affordance (not removed, not hidden); the "Pin —" pulley chip
 *      is NOT shown while variant is unset. Variant set → existing chips render.
 * AC7: composite accessibilityLabel + clear-on-long-press preserved.
 *
 * The unset-footer Pressable MUST stay mounted (ref focus-restore contract:
 * useVariantPickerSheet.ts:63-74 uses variantFooterRef, no fallback exists).
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

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

jest.mock("@/hooks/useThemeColors", () => {
  const { lightMockColors } = require("../../helpers/theme");
  return { useThemeColors: () => lightMockColors };
});

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
import type { Equipment } from "../../../lib/types";

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

function cableProps(over: Partial<SetRowProps> = {}): SetRowProps {
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

describe("SetRow — BLD-2386 Item D3: pulley-pin chip gated behind variant selection", () => {
  it("AC6: does NOT render pulley-pin chip when variant is unset (attachment=null, mount_position=null)", () => {
    const set = makeSet({ attachment: null, mount_position: null });
    const { queryByLabelText } = render(
      <SetRow
        {...cableProps({ set, pulleyPin: 5, showPulleyPin: true })}
      />,
    );
    // Pulley chip must not appear when no variant is set
    expect(queryByLabelText("Pulley pin 5, tap to change")).toBeNull();
    expect(queryByLabelText("Pulley pin not set, tap to set")).toBeNull();
  });

  it("AC6: unset-footer Pressable IS still mounted when variant is unset (ref focus-restore)", () => {
    const set = makeSet({ attachment: null, mount_position: null });
    const { queryByLabelText } = render(
      <SetRow {...cableProps({ set })} />,
    );
    // The composite label Pressable must remain mounted (ref focus-restore invariant).
    // It renders the "not set. Double-tap to choose." label.
    expect(queryByLabelText(/cable variant: not set/)).toBeTruthy();
  });

  it("AC6: renders pulley-pin chip when attachment is set", () => {
    const set = makeSet({ attachment: "rope", mount_position: null });
    const { queryByLabelText } = render(
      <SetRow
        {...cableProps({ set, pulleyPin: 7, showPulleyPin: true })}
      />,
    );
    expect(queryByLabelText("Pulley pin 7, tap to change")).toBeTruthy();
  });

  it("AC6: renders pulley-pin chip when mount_position is set", () => {
    const set = makeSet({ attachment: null, mount_position: "low" });
    const { queryByLabelText } = render(
      <SetRow
        {...cableProps({ set, pulleyPin: 3, showPulleyPin: true })}
      />,
    );
    expect(queryByLabelText("Pulley pin 3, tap to change")).toBeTruthy();
  });

  it("AC6: renders pulley-pin chip when both attachment and mount_position are set", () => {
    const set = makeSet({ attachment: "rope", mount_position: "high" });
    const { queryByLabelText } = render(
      <SetRow
        {...cableProps({ set, pulleyPin: 2, showPulleyPin: true })}
      />,
    );
    expect(queryByLabelText("Pulley pin 2, tap to change")).toBeTruthy();
  });

  it("AC7: composite accessibilityLabel preserved on unset footer", () => {
    const set = makeSet({ attachment: null, mount_position: null });
    const { getByLabelText } = render(<SetRow {...cableProps({ set })} />);
    // Composite label + Double-tap hint preserved
    expect(getByLabelText("Set 1 cable variant: not set. Double-tap to choose.")).toBeTruthy();
  });

  it("AC7: long-press clear-on-long-press preserved (fires onClearVariant)", () => {
    const onClearVariant = jest.fn();
    const set = makeSet({ attachment: "rope", mount_position: "low" });
    const { getByLabelText } = render(
      <SetRow {...cableProps({ set, onClearVariant })} />,
    );
    fireEvent(
      getByLabelText("Set 1 cable variant: Rope, Low. Double-tap to edit."),
      "longPress",
    );
    expect(onClearVariant).toHaveBeenCalledWith("s1");
  });

  describe("partial variant states (QD edge-case coverage)", () => {
    it("attachment set, mount_position null → shows attachment chip; pulley chip visible", () => {
      const set = makeSet({ attachment: "rope", mount_position: null });
      const { queryByLabelText } = render(
        <SetRow {...cableProps({ set, pulleyPin: 4, showPulleyPin: true })} />,
      );
      expect(queryByLabelText(/attachment not set/)).toBeNull();
      expect(queryByLabelText(/position not set/)).toBeTruthy();
      expect(queryByLabelText("Pulley pin 4, tap to change")).toBeTruthy();
    });

    it("mount_position set, attachment null → shows mount chip; pulley chip visible", () => {
      const set = makeSet({ attachment: null, mount_position: "mid" });
      const { queryByLabelText } = render(
        <SetRow {...cableProps({ set, pulleyPin: 6, showPulleyPin: true })} />,
      );
      expect(queryByLabelText(/attachment not set/)).toBeTruthy();
      expect(queryByLabelText("Pulley pin 6, tap to change")).toBeTruthy();
    });
  });
});

describe("SetRow — BLD-2386 Item D3: grip footer visual weight (AC6 symmetric)", () => {
  function bwProps(over: Partial<SetRowProps> = {}): SetRowProps {
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

  it("AC7: composite a11y label preserved on unset grip footer", () => {
    const set = makeSet({ grip_type: null, grip_width: null });
    const { getByLabelText } = render(<SetRow {...bwProps({ set })} />);
    expect(getByLabelText("Set 1 grip variant: not set. Double-tap to choose.")).toBeTruthy();
  });

  it("AC7: long-press clear preserved on grip footer (fires onClearBodyweightGrip)", () => {
    const onClearBodyweightGrip = jest.fn();
    const set = makeSet({ grip_type: "overhand", grip_width: "narrow" });
    const { getByLabelText } = render(
      <SetRow {...bwProps({ set, onClearBodyweightGrip })} />,
    );
    fireEvent(
      getByLabelText("Set 1 grip variant: Overhand, Narrow. Double-tap to edit."),
      "longPress",
    );
    expect(onClearBodyweightGrip).toHaveBeenCalledWith("s1");
  });
});
