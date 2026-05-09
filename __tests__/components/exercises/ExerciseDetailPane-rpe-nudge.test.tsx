/**
 * BLD-1111: ExerciseDetailPane renders the RPE capture nudge above
 * the muscle/illustration content when eligible, and does not render it
 * when ineligible.
 */

import React from "react";
import { waitFor } from "@testing-library/react-native";
import { renderScreen } from "../../helpers/render";
import { ExerciseDetailPane } from "../../../components/exercises/ExerciseDetailPane";
import type { Exercise } from "../../../lib/types";

// ─── Mock heavy sub-components ───────────────────────────────────────────────
jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => "Icon");
jest.mock("../../../components/MuscleMap", () => ({
  MuscleMap: () => null,
}));
jest.mock("../../../components/exercises/ExerciseIllustrationCards", () => ({
  ExerciseIllustrationCards: () => null,
}));
jest.mock("../../../components/exercises/ExerciseTutorialLink", () => ({
  ExerciseTutorialLink: () => null,
}));
jest.mock("../../../components/exercises/ExerciseInstructionsList", () => ({
  ExerciseInstructionsList: () => null,
  parseInstructionSteps: () => [],
}));
jest.mock("../../../components/exercise/ProgressionPathCard", () => () => null);
jest.mock("../../../hooks/useProgressionChain", () => ({
  useProgressionChain: () => ({ loading: false, chain: [] }),
}));
jest.mock("../../../hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    onSurface: "#000", primaryContainer: "#eee", onPrimaryContainer: "#000",
    secondaryContainer: "#eee", onSecondaryContainer: "#000",
    tertiaryContainer: "#eee", onTertiaryContainer: "#000",
    outlineVariant: "#ccc", surfaceVariant: "#eee", onSurfaceVariant: "#555",
    tertiary: "#333",
  }),
}));
jest.mock("../../../hooks/useColorScheme", () => ({ useColorScheme: () => "light" }));

// ─── Mock the nudge dependencies to control eligibility ─────────────────────
const mockExerciseHasHistoricalRpe = jest.fn();
const mockHasSeenRpeCaptureNudge = jest.fn();
const mockGetAppSetting = jest.fn();

jest.mock("../../../lib/db/exercise-history", () => ({
  exerciseHasHistoricalRpe: (...args: unknown[]) =>
    mockExerciseHasHistoricalRpe(...args),
}));
jest.mock("../../../lib/db/achievements", () => ({
  hasSeenRpeCaptureNudge: () => mockHasSeenRpeCaptureNudge(),
  markRpeCaptureNudgeSeen: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../../lib/db", () => ({
  getAppSetting: (...args: unknown[]) => mockGetAppSetting(...args),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
  insertInteraction: jest.fn().mockResolvedValue(undefined),
}));

const TEST_COLORS = {
  onSurface: "#000",
  primaryContainer: "#eee",
  onPrimaryContainer: "#000",
  secondaryContainer: "#eee",
  onSecondaryContainer: "#000",
  tertiaryContainer: "#eee",
  onTertiaryContainer: "#000",
  outlineVariant: "#ccc",
  surfaceVariant: "#eee",
  onSurfaceVariant: "#555",
  tertiary: "#333",
} as Parameters<typeof ExerciseDetailPane>[0]["colors"];

const EXERCISE: Exercise = {
  id: "ex-1",
  name: "Cable Row",
  category: "back",
  equipment: "cable",
  difficulty: "intermediate",
  instructions: "",
  primary_muscles: ["lats"],
  secondary_muscles: [],
  is_custom: false,
};

describe("ExerciseDetailPane RPE nudge mount", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders nudge when exercise has historical RPE and nudge not yet seen", async () => {
    mockExerciseHasHistoricalRpe.mockResolvedValue(true);
    mockHasSeenRpeCaptureNudge.mockResolvedValue(false);
    mockGetAppSetting.mockResolvedValue(null);

    const { getByTestId } = renderScreen(
      <ExerciseDetailPane
        detail={EXERCISE}
        colors={TEST_COLORS}
        profileGender="male"
      />
    );
    await waitFor(() => {
      expect(getByTestId("rpe-capture-nudge")).toBeTruthy();
    });
  });

  it("does not render nudge when nudgeShown=true", async () => {
    mockExerciseHasHistoricalRpe.mockResolvedValue(true);
    mockHasSeenRpeCaptureNudge.mockResolvedValue(true);
    mockGetAppSetting.mockResolvedValue(null);

    const { queryByTestId } = renderScreen(
      <ExerciseDetailPane
        detail={EXERCISE}
        colors={TEST_COLORS}
        profileGender="male"
      />
    );
    await waitFor(() => {
      expect(queryByTestId("rpe-capture-nudge")).toBeNull();
    });
  });
});
