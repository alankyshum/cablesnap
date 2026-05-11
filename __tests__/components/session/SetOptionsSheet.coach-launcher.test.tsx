/**
 * BLD-1158b AC3 + AC10: SetOptionsSheet Coach Launcher gate tests.
 *
 * AC3: Coach Launcher row is visible only when tempoCoachEnabled=true AND
 *      currentTempo is set AND onStartCoach is provided.
 * AC10: tempo_coach_enabled defaults to OFF (absent key → getTempoCoachEnabled() returns false).
 */

import React from "react";
import { render } from "@testing-library/react-native";

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    primary: "#6200ee",
    primaryContainer: "#e8def8",
    onPrimary: "#ffffff",
    onPrimaryContainer: "#21005d",
    surface: "#fffbfe",
    onSurface: "#1c1b1f",
    onSurfaceVariant: "#49454f",
    surfaceVariant: "#e7e0ec",
    surfaceDisabled: "#e0e0e0",
    outlineVariant: "#cac4d0",
    tertiaryContainer: "#ffd8e4",
    onTertiaryContainer: "#31111d",
    errorContainer: "#f9dedc",
    onErrorContainer: "#410e0b",
  }),
}));

jest.mock("@/components/ui/text", () => {
  const { Text: RNText } = require("react-native");
  return { Text: (props: Record<string, unknown>) => <RNText {...props} /> };
});

jest.mock("../../../components/session/TempoEditorSheet", () => ({
  TempoEditorSheet: () => null,
}));

import { SetOptionsSheet } from "../../../components/session/SetOptionsSheet";
import type { ExerciseGroup } from "../../../components/session/types";

const mockGroups = [
  {
    exercise_id: "ex1",
    name: "Squat",
    link_id: null,
    is_voltra: false,
    is_bodyweight: false,
    trackingMode: "reps" as const,
    equipment: "barbell" as const,
    exercise_position: 0,
    sets: [
      {
        id: "s1",
        set_type: "normal",
        reps: 5,
        weight: 100,
        completed: false,
        tempo: "3-1-2-0",
      },
    ],
  },
] as unknown as ExerciseGroup[];

const baseProps = {
  setId: "s1",
  currentTempo: "3-1-2-0",
  groups: mockGroups,
  onSelectType: jest.fn(),
  onSaveTempo: jest.fn(),
  onDismiss: jest.fn(),
};

describe("AC3 — Coach Launcher row visibility gate", () => {
  it("shows 'Coach this set' when tempoCoachEnabled=true, tempo set, onStartCoach provided", () => {
    const { getByText } = render(
      <SetOptionsSheet
        {...baseProps}
        tempoCoachEnabled={true}
        onStartCoach={jest.fn()}
      />
    );
    expect(getByText("Coach this set")).toBeTruthy();
  });

  it("hides 'Coach this set' when tempoCoachEnabled=false (setting OFF)", () => {
    const { queryByText } = render(
      <SetOptionsSheet
        {...baseProps}
        tempoCoachEnabled={false}
        onStartCoach={jest.fn()}
      />
    );
    expect(queryByText("Coach this set")).toBeNull();
  });

  it("hides 'Coach this set' when tempoCoachEnabled not provided (defaults to false)", () => {
    const { queryByText } = render(
      <SetOptionsSheet {...baseProps} onStartCoach={jest.fn()} />
    );
    expect(queryByText("Coach this set")).toBeNull();
  });

  it("hides 'Coach this set' when currentTempo is null (no tempo set)", () => {
    const { queryByText } = render(
      <SetOptionsSheet
        {...baseProps}
        currentTempo={null}
        tempoCoachEnabled={true}
        onStartCoach={jest.fn()}
      />
    );
    expect(queryByText("Coach this set")).toBeNull();
  });

  it("hides 'Coach this set' when onStartCoach is not provided", () => {
    const { queryByText } = render(
      <SetOptionsSheet {...baseProps} tempoCoachEnabled={true} />
    );
    expect(queryByText("Coach this set")).toBeNull();
  });
});

describe("AC10 — tempo_coach_enabled defaults OFF", () => {
  it("getTempoCoachEnabled() returns false when no key stored", async () => {
    jest.mock("@/lib/db/settings", () => ({
      getAppSetting: jest.fn().mockResolvedValue(null),
      setAppSetting: jest.fn().mockResolvedValue(undefined),
    }));

    // Can't easily test async DB without integration setup, so verify the logic:
    // If getAppSetting returns null → val !== "true" → return false
    const { getAppSetting } = require("@/lib/db/settings");
    (getAppSetting as jest.Mock).mockResolvedValue(null);

    const { getTempoCoachEnabled } = require("../../../lib/workout/tempo-coach");
    const enabled = await getTempoCoachEnabled();
    expect(enabled).toBe(false);
  });

  it("getTempoCoachEnabled() returns false for absent key (empty string)", async () => {
    const { getAppSetting } = require("@/lib/db/settings");
    (getAppSetting as jest.Mock).mockResolvedValue("");

    const { getTempoCoachEnabled } = require("../../../lib/workout/tempo-coach");
    expect(await getTempoCoachEnabled()).toBe(false);
  });

  it("getTempoCoachEnabled() returns true only when stored value is exactly 'true'", async () => {
    const { getAppSetting } = require("@/lib/db/settings");
    (getAppSetting as jest.Mock).mockResolvedValue("true");

    const { getTempoCoachEnabled } = require("../../../lib/workout/tempo-coach");
    expect(await getTempoCoachEnabled()).toBe(true);
  });
});
