/**
 * BLD-682 AC11 — Accessibility label MUST read the *displayed* value,
 * not the underlying nullable `set.weight`. Under display-only
 * hydration, a pristine row shows the picker at the prefillCandidate
 * value while `set.weight === null`. If the label were keyed off
 * `set.weight ?? 0`, screen readers would announce "0 kilograms"
 * while the sighted user sees `100`.
 *
 * 3-case matrix from the plan:
 *   1. Pristine + prefillCandidate present → label reads candidate value.
 *   2. Persisted set (set.weight non-null) → label reads set.weight (NOT candidate).
 *   3. No data anywhere → label reads "0".
 *
 * Plus AC14: lb units render the unit word in the label ("pounds").
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
    default: ({
      value,
      accessibilityLabel,
      testID,
    }: { value: number | null; accessibilityLabel?: string; testID?: string }) => (
      <Text testID={testID} accessibilityLabel={accessibilityLabel}>
        {String(value ?? "null")}
      </Text>
    ),
  };
});

jest.mock("../../../components/session/PlateHint", () => ({ PlateHint: () => null }));

jest.mock("../../../components/SwipeToDelete", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { SetRow, type SetRowProps } from "../../../components/session/SetRow";
import type { SetWithMeta } from "../../../components/session/types";

function makeSet(overrides: Partial<SetWithMeta> = {}): SetWithMeta {
  return {
    id: "s1",
    workout_session_id: "sess",
    exercise_id: 1,
    set_number: 1,
    round: null,
    weight: null,
    reps: null,
    rpe: null,
    notes: null,
    completed: false,
    set_type: "normal",
    duration_seconds: null,
    created_at: Date.now(),
    previous: "",
    is_pr: false,
    prefillCandidate: null,
    ...overrides,
  } as unknown as SetWithMeta;
}

function baseProps(set: SetWithMeta): SetRowProps {
  const noop = jest.fn();
  return {
    set,
    step: 2.5,
    unit: "kg",
    trackingMode: "reps",
    equipment: "cable" as unknown as SetRowProps["equipment"],
    onUpdate: jest.fn(),
    onCheck: jest.fn(),
    onDelete: jest.fn(),
    onCycleSetType: noop,
    onLongPressSetType: noop,
  };
}

describe("BLD-682 AC11: a11y label reads displayed value (not nullable set.weight)", () => {
  it("pristine row + prefillCandidate → weight label announces candidate value, not 0", () => {
    const set = makeSet({
      weight: null,
      reps: null,
      prefillCandidate: { weight: 100, reps: 8, duration_seconds: null },
    });
    const { getAllByLabelText } = render(<SetRow {...baseProps(set)} />);
    expect(getAllByLabelText("Set 1 weight, 100 kilograms").length).toBeGreaterThan(0);
    expect(getAllByLabelText("Set 1 reps, 8").length).toBeGreaterThan(0);
  });

  it("persisted row → weight label announces set.weight, NOT prefillCandidate", () => {
    const set = makeSet({
      weight: 90,
      reps: 5,
      // Even with a candidate present, the persisted value wins.
      prefillCandidate: { weight: 100, reps: 8, duration_seconds: null },
    });
    const { getAllByLabelText, queryByLabelText } = render(<SetRow {...baseProps(set)} />);
    expect(getAllByLabelText("Set 1 weight, 90 kilograms").length).toBeGreaterThan(0);
    expect(getAllByLabelText("Set 1 reps, 5").length).toBeGreaterThan(0);
    expect(queryByLabelText("Set 1 weight, 100 kilograms")).toBeNull();
  });

  it("no data anywhere → label reads 0 (no crash, no NaN, no 'null')", () => {
    const set = makeSet({ weight: null, reps: null, prefillCandidate: null });
    const { getAllByLabelText } = render(<SetRow {...baseProps(set)} />);
    expect(getAllByLabelText("Set 1 weight, 0 kilograms").length).toBeGreaterThan(0);
    expect(getAllByLabelText("Set 1 reps, 0").length).toBeGreaterThan(0);
  });

  it("AC14: lb unit renders 'pounds' in the weight label", () => {
    const set = makeSet({
      weight: null,
      prefillCandidate: { weight: 220, reps: 8, duration_seconds: null },
    });
    const props = { ...baseProps(set), unit: "lb" as const };
    const { getAllByLabelText } = render(<SetRow {...props} />);
    expect(getAllByLabelText("Set 1 weight, 220 pounds").length).toBeGreaterThan(0);
  });

  it("AC4: duration mode label reads displayed duration, not nullable set.duration_seconds", () => {
    const set = makeSet({
      duration_seconds: null,
      prefillCandidate: { weight: 0, reps: null, duration_seconds: 60 },
    });
    const props = { ...baseProps(set), trackingMode: "duration" as const };
    const { getAllByLabelText } = render(<SetRow {...props} />);
    expect(getAllByLabelText("Set 1 duration, 60 seconds").length).toBeGreaterThan(0);
  });
});
