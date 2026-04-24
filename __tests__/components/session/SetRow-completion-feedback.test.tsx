/**
 * BLD-559 SetRow integration: fires feedback on false → true, silent on
 * un-complete and on mount of already-completed sets (AC-14).
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

const mockHaptic = jest.fn();
const mockPlay = jest.fn();

jest.mock("expo-haptics", () => ({
  impactAsync: (...args: unknown[]) => { mockHaptic(...args); return Promise.resolve(); },
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success" },
}));

jest.mock("@/lib/audio", () => ({
  play: (...args: unknown[]) => { mockPlay(...args); return Promise.resolve(); },
  setEnabled: jest.fn(),
  preload: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/db", () => ({
  getAppSetting: jest.fn().mockResolvedValue(null),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ name, ...props }: { name: string }) => <Text {...props}>{name}</Text>,
  };
});

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

jest.mock("../../../components/SwipeToDelete", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import { SetRow, type SetRowProps } from "../../../components/session/SetRow";
import type { SetWithMeta } from "../../../components/session/types";
import {
  __resetSetCompletionFeedbackForTests,
  setSetCompletionHaptic,
  setSetCompletionAudio,
} from "../../../hooks/useSetCompletionFeedback";

function makeSet(overrides: Partial<SetWithMeta> = {}): SetWithMeta {
  return {
    id: "s1",
    workout_session_id: "sess",
    exercise_id: 1,
    set_number: 1,
    round: null,
    weight: 60,
    reps: 10,
    rpe: null,
    notes: null,
    completed: false,
    set_type: "normal",
    duration_seconds: null,
    created_at: Date.now(),
    previous: "",
    is_pr: false,
    ...overrides,
  } as SetWithMeta;
}

function baseProps(set: SetWithMeta, onCheck: jest.Mock): SetRowProps {
  const noop = jest.fn();
  return {
    set,
    step: 2.5,
    unit: "kg",
    halfStep: null,
    trackingMode: "reps",
    equipment: "cable" as unknown as SetRowProps["equipment"],
    onUpdate: jest.fn(),
    onCheck,
    onDelete: jest.fn(),
    onRPE: jest.fn(),
    onHalfStep: noop,
    onHalfStepClear: noop,
    onHalfStepOpen: noop,
    onCycleSetType: noop,
    onLongPressSetType: noop,
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  __resetSetCompletionFeedbackForTests();
  await setSetCompletionHaptic(true);
  await setSetCompletionAudio(false);
  jest.clearAllMocks();
});

describe("SetRow set-completion feedback (BLD-559)", () => {
  it("AC-1: false → true fires exactly one Medium haptic, no audio (default)", () => {
    const onCheck = jest.fn();
    const set = makeSet({ completed: false });
    const { getByLabelText } = render(<SetRow {...baseProps(set, onCheck)} />);
    fireEvent.press(getByLabelText("Mark set 1 complete"));

    expect(mockHaptic).toHaveBeenCalledTimes(1);
    expect(mockHaptic).toHaveBeenCalledWith("medium");
    expect(mockPlay).not.toHaveBeenCalled();
    expect(onCheck).toHaveBeenCalledTimes(1);
  });

  it("AC-3: true → false (un-complete) fires NO feedback", () => {
    const onCheck = jest.fn();
    const set = makeSet({ completed: true });
    const { getByLabelText } = render(<SetRow {...baseProps(set, onCheck)} />);
    fireEvent.press(getByLabelText("Mark set 1 incomplete"));

    expect(mockHaptic).not.toHaveBeenCalled();
    expect(mockPlay).not.toHaveBeenCalled();
    expect(onCheck).toHaveBeenCalledTimes(1);
  });

  it("AC-2: audio ON + false → true calls play('set_complete') exactly once", async () => {
    await setSetCompletionAudio(true);
    const onCheck = jest.fn();
    const set = makeSet({ completed: false });
    const { getByLabelText } = render(<SetRow {...baseProps(set, onCheck)} />);
    fireEvent.press(getByLabelText("Mark set 1 complete"));

    expect(mockPlay).toHaveBeenCalledTimes(1);
    expect(mockPlay).toHaveBeenCalledWith("set_complete");
  });

  it("AC-14: mounting ≥ 5 already-completed sets fires zero haptic + audio", async () => {
    await setSetCompletionAudio(true); // maximize sensitivity
    jest.clearAllMocks();

    const sets = Array.from({ length: 6 }, (_, i) =>
      makeSet({ id: `s${i + 1}`, set_number: i + 1, completed: true })
    );

    for (const s of sets) {
      render(<SetRow {...baseProps(s, jest.fn())} />);
    }

    expect(mockHaptic).not.toHaveBeenCalled();
    expect(mockPlay).not.toHaveBeenCalled();
  });
});
