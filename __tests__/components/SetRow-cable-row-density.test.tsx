/**
 * BLD-1114 — SetRow cable footer density: pulley pin chip + setup photo glyph.
 *
 * Validates:
 *   - Setup photo glyph appears when onSetupPhotoGlyph is provided (cable equipment)
 *   - camera-plus-outline icon when hasSetupPhoto=false; camera-plus when true
 *   - SetPulleyPinChip renders "Pin N" when pulleyPin is provided
 *   - SetPulleyPinChip shows "Pin —" placeholder when pulleyPin is null
 *   - Tapping the camera glyph calls onSetupPhotoGlyph with the set id
 *   - Tapping the pulley pin chip calls onOpenPulleyPinPicker with the set id
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <Text testID="mci-icon">{name}</Text>,
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

jest.mock("../../components/WeightPicker", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ value, accessibilityLabel }: { value: number; accessibilityLabel: string }) => (
      <Text accessibilityLabel={accessibilityLabel}>{value}</Text>
    ),
  };
});

jest.mock("../../components/session/PlateHint", () => ({ PlateHint: () => null }));

jest.mock("../../components/SwipeRowAction", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import { SetRow, type SetRowProps } from "../../components/session/SetRow";
import type { SetWithMeta } from "../../components/session/types";
import type { Equipment } from "../../lib/types";

function makeSet(over: Partial<SetWithMeta> = {}): SetWithMeta {
  return {
    id: "s1", session_id: "sess", exercise_id: "ex1",
    set_number: 1, round: null, weight: null, reps: 10, rpe: null,
    notes: "", completed: false, completed_at: null,
    set_type: "normal", duration_seconds: null, link_id: null,
    training_mode: null, tempo: null, swapped_from_exercise_id: null,
    exercise_position: 0, previous: "", is_pr: false,
    ...over,
  } as unknown as SetWithMeta;
}

function baseProps(over: Partial<SetRowProps> = {}): SetRowProps {
  return {
    set: makeSet(),
    step: 2.5,
    unit: "kg",
    trackingMode: "reps",
    equipment: "cable" as Equipment,
    onUpdate: jest.fn(),
    onCheck: jest.fn(),
    onDelete: jest.fn(),
    onCycleSetType: jest.fn(),
    onLongPressSetType: jest.fn(),
    isBodyweight: false,
    exerciseName: "Cable Row",
    onOpenBodyweightGripPicker: jest.fn(),
    onClearBodyweightGrip: jest.fn(),
    onOpenBodyweightModifier: jest.fn(),
    onClearBodyweightModifier: jest.fn(),
    onOpenVariantPicker: jest.fn(),
    onClearVariant: jest.fn(),
    ...over,
  };
}

describe("SetRow — setup photo glyph (BLD-1114)", () => {
  it("shows camera-plus-outline when hasSetupPhoto=false", () => {
    const { getByText } = render(
      <SetRow
        {...baseProps({
          set: makeSet({ completed: true }),
          onSetupPhotoGlyph: jest.fn(),
          hasSetupPhoto: false,
        })}
      />
    );
    expect(getByText("camera-plus-outline")).toBeTruthy();
  });

  it("shows camera-plus (filled) when hasSetupPhoto=true", () => {
    const { getByText } = render(
      <SetRow
        {...baseProps({
          set: makeSet({ completed: true }),
          onSetupPhotoGlyph: jest.fn(),
          hasSetupPhoto: true,
        })}
      />
    );
    expect(getByText("camera-plus")).toBeTruthy();
  });

  it("calls onSetupPhotoGlyph with set id when tapped", () => {
    const onSetupPhotoGlyph = jest.fn();
    const { getByLabelText } = render(
      <SetRow
        {...baseProps({
          set: makeSet({ completed: true }),
          onSetupPhotoGlyph,
          hasSetupPhoto: false,
        })}
      />
    );
    fireEvent.press(getByLabelText("Take setup photo for set 1"));
    expect(onSetupPhotoGlyph).toHaveBeenCalledWith("s1");
  });

  it("does not render camera glyph on incomplete sets", () => {
    const { queryByLabelText } = render(
      <SetRow {...baseProps({ set: makeSet({ completed: false }), onSetupPhotoGlyph: jest.fn() })} />
    );
    expect(queryByLabelText(/setup photo/i)).toBeNull();
  });
});

describe("SetRow — pulley pin chip (BLD-1114)", () => {
  it("shows 'Pin 7' chip when pulleyPin=7", () => {
    const { getByText } = render(
      <SetRow {...baseProps({ pulleyPin: 7, onOpenPulleyPinPicker: jest.fn() })} />
    );
    expect(getByText("Pin 7")).toBeTruthy();
  });

  it("shows 'Pin —' placeholder when pulleyPin=null", () => {
    const { getByText } = render(
      <SetRow {...baseProps({ pulleyPin: null, onOpenPulleyPinPicker: jest.fn() })} />
    );
    expect(getByText("Pin —")).toBeTruthy();
  });

  it("calls onOpenPulleyPinPicker with set id when chip is tapped", () => {
    const onOpenPulleyPinPicker = jest.fn();
    const { getByLabelText } = render(
      <SetRow {...baseProps({ pulleyPin: 5, onOpenPulleyPinPicker })} />
    );
    fireEvent.press(getByLabelText("Pulley pin 5, tap to change"));
    expect(onOpenPulleyPinPicker).toHaveBeenCalledWith("s1");
  });

  it("does not render pin chip when pulleyPin prop is omitted", () => {
    const { queryByText } = render(<SetRow {...baseProps()} />);
    expect(queryByText(/^Pin/)).toBeNull();
  });
});
